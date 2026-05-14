import { CacheService } from './cache.service';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  describe('get/set basics', () => {
    it('returns undefined on miss', () => {
      expect(cache.get('absent')).toBeUndefined();
    });

    it('roundtrips a value', () => {
      cache.set('k', 'v', 60);
      expect(cache.get<string>('k')).toBe('v');
    });

    it('roundtrips null as a real cached value (not a miss)', () => {
      cache.set('k', null, 60);
      expect(cache.get('k')).toBeNull();
      expect(cache.stats().hits).toBe(1);
    });

    it('overwrites on second set', () => {
      cache.set('k', 'v1', 60);
      cache.set('k', 'v2', 60);
      expect(cache.get('k')).toBe('v2');
    });

    it('set with ttl <= 0 is a no-op', () => {
      cache.set('k', 'v', 0);
      expect(cache.get('k')).toBeUndefined();
      cache.set('k', 'v', -5);
      expect(cache.get('k')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    it('expires entries past their TTL', () => {
      const realNow = Date.now;
      let now = 1_000_000;
      Date.now = () => now;
      try {
        cache.set('k', 'v', 10); // expires at +10s
        now += 5_000; // +5s : still alive
        expect(cache.get('k')).toBe('v');
        now += 6_000; // +11s total : expired
        expect(cache.get('k')).toBeUndefined();
      } finally {
        Date.now = realNow;
      }
    });

    it('purges the entry on expiration read (memory hygiene)', () => {
      const realNow = Date.now;
      let now = 1_000_000;
      Date.now = () => now;
      try {
        cache.set('k', 'v', 1);
        now += 2_000;
        cache.get('k'); // triggers cleanup
        expect(cache.stats().size).toBe(0);
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe('LRU eviction', () => {
    it('evicts the oldest entry when above maxEntries', () => {
      // Le maxEntries est fixe a 5000 dans l'impl. On ne va pas remplir 5000
      // entrees pour un test : on monkey-patche pour reduire la limite.
      (cache as any).maxEntries = 3;
      cache.set('a', 1, 60);
      cache.set('b', 2, 60);
      cache.set('c', 3, 60);
      // Toucher 'a' pour le marquer recemment utilise (LRU touch)
      expect(cache.get('a')).toBe(1);
      // Inserer 'd' : 'b' doit etre evince (le plus ancien non-touche)
      cache.set('d', 4, 60);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('del', () => {
    it('removes a specific key', () => {
      cache.set('k', 'v', 60);
      cache.del('k');
      expect(cache.get('k')).toBeUndefined();
    });

    it('is a no-op on unknown key', () => {
      expect(() => cache.del('absent')).not.toThrow();
    });
  });

  describe('invalidatePrefix', () => {
    it('removes all keys matching the prefix and returns count', () => {
      cache.set('settings:smtp.host', 'a', 60);
      cache.set('settings:smtp.user', 'b', 60);
      cache.set('contracts:42', 'c', 60);
      const count = cache.invalidatePrefix('settings:');
      expect(count).toBe(2);
      expect(cache.get('settings:smtp.host')).toBeUndefined();
      expect(cache.get('settings:smtp.user')).toBeUndefined();
      expect(cache.get('contracts:42')).toBe('c');
    });

    it('returns 0 if no key matches', () => {
      cache.set('k', 'v', 60);
      expect(cache.invalidatePrefix('nope:')).toBe(0);
    });
  });

  describe('getOrSet', () => {
    it('caches the result of the fetcher on miss', async () => {
      const fetcher = jest.fn().mockResolvedValue('fresh');
      const v1 = await cache.getOrSet('k', 60, fetcher);
      const v2 = await cache.getOrSet('k', 60, fetcher);
      expect(v1).toBe('fresh');
      expect(v2).toBe('fresh');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('does NOT cache undefined (sentinel for miss)', async () => {
      const fetcher = jest.fn().mockResolvedValue(undefined);
      await cache.getOrSet('k', 60, fetcher);
      await cache.getOrSet('k', 60, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('caches null (real "absent" value)', async () => {
      const fetcher = jest.fn().mockResolvedValue(null);
      await cache.getOrSet('k', 60, fetcher);
      await cache.getOrSet('k', 60, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('propagates fetcher exceptions without caching', async () => {
      const fetcher = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('recovered');
      await expect(cache.getOrSet('k', 60, fetcher)).rejects.toThrow('boom');
      // Le second appel doit retomber sur le fetcher (echec non cache)
      const v = await cache.getOrSet('k', 60, fetcher);
      expect(v).toBe('recovered');
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('stats', () => {
    it('tracks hits, misses and hit rate', () => {
      cache.set('k', 'v', 60);
      cache.get('k'); // hit
      cache.get('k'); // hit
      cache.get('absent'); // miss
      const s = cache.stats();
      expect(s.hits).toBe(2);
      expect(s.misses).toBe(1);
      expect(s.hitRate).toBeCloseTo(2 / 3, 5);
      expect(s.size).toBe(1);
    });

    it('reports hitRate=0 when no access yet', () => {
      expect(cache.stats().hitRate).toBe(0);
    });
  });

  describe('clear', () => {
    it('drops all entries and resets counters', () => {
      cache.set('k', 'v', 60);
      cache.get('k');
      cache.clear();
      const s = cache.stats();
      expect(s.size).toBe(0);
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(0);
    });
  });
});
