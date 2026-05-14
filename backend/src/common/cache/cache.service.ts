import { Injectable, Logger } from '@nestjs/common';

// Cache applicatif in-memory avec TTL. Adapte au deploiement mono-instance
// (VPS unique). Pour passer multi-instance plus tard : swap cette impl pour
// un client Redis en conservant la meme API publique (get/set/del/getOrSet/
// invalidatePrefix).
//
// Choix in-memory plutot que Redis :
//   - 0 round-trip reseau (~ns vs ~0.5ms par lookup)
//   - 0 nouvelle dep, 0 service externe a maintenir
//   - Settings/contrats/companies sont lus tres souvent et changent rarement
//     → ratio hit/miss tres favorable a un cache local
//
// Limites assumees :
//   - Memoire bornee par maxEntries (eviction LRU au depassement)
//   - Invalidation cross-instance impossible (mono-instance OK)
//   - Pas de persistence (reset au redemarrage = recharge BDD = acceptable)

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  // Map insere-en-ordre : la cle la plus ancienne est en tete (utilise pour
  // l'eviction LRU au depassement de maxEntries).
  private readonly store = new Map<string, CacheEntry<unknown>>();

  // Bornes choisies large : un Setting fait quelques octets, 5000 entrees
  // representent < 1 Mo en heap. Si un jour on cache des objets plus gros
  // (Contracts entiers), reduire cette limite.
  private readonly maxEntries = 5000;

  // Compteurs d'observabilite legers (consultables via metrics si besoin).
  private hits = 0;
  private misses = 0;

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      // Expire : on purge tout de suite pour ne pas grossir indefiniment.
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    // LRU touch : on re-insere pour mettre la cle en queue (= recemment utilisee).
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  set<T = unknown>(key: string, value: T, ttlSeconds: number): void {
    if (ttlSeconds <= 0) return; // no-op : pas de cache "permanent"
    if (this.store.size >= this.maxEntries) {
      // Eviction LRU : on supprime la cle la plus ancienne (insertion order).
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  // Invalide toutes les cles dont le prefixe matche. Utile pour purger un
  // groupe coherent (ex. tous les settings.* apres un changement admin).
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  // Pattern le plus utile : "lis du cache, sinon execute la fonction et cache
  // le resultat avec TTL". Les exceptions remontent telles quelles (on ne
  // cache PAS les erreurs : un echec transitoire ne doit pas bloquer la cle).
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const fresh = await fetcher();
    // On evite de cacher `undefined` (sentinelle pour miss). `null` est OK :
    // c'est une vraie valeur "absente" qu'on veut memoriser.
    if (fresh !== undefined) this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  // Observabilite : exposable par un endpoint admin si besoin de debug.
  stats() {
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
    };
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
