import { Injectable, Logger } from '@nestjs/common';

// Client minimal Microsoft Graph API. On utilise le flow OAuth
// `client_credentials` avec app multi-tenant : Mathieu enregistre UNE seule
// app sur son tenant MDO, et chaque client donne un admin-consent depuis SON
// tenant. On peut ensuite obtenir un access_token par tenant client_id.
//
// Documentation :
//   https://learn.microsoft.com/en-us/graph/auth-v2-service
//   https://learn.microsoft.com/en-us/graph/permissions-reference

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class M365GraphClient {
  private readonly logger = new Logger(M365GraphClient.name);
  // Cache memoire : on garde l'access_token jusqu'a 60 sec avant expiration
  // (Azure AD emet typiquement des tokens valides ~60 min).
  private tokenCache = new Map<string, TokenCacheEntry>();

  /**
   * Recupere un access token pour un tenant donne via client_credentials.
   * Necessite que l'admin du tenant client ait accorde le consent prealable.
   */
  async getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      // Sans timeout, login.microsoftonline.com indisponible bloque
      // indefiniment le worker. 15s couvre largement le cas nominal (~300ms).
      signal: AbortSignal.timeout(15_000),
    });
    const data: any = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(
        'M365 token error (' + res.status + ') : ' +
        (data.error_description ?? data.error ?? 'unknown'),
      );
    }
    this.tokenCache.set(tenantId, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
    return data.access_token;
  }

  /**
   * Appel GET Graph API avec gestion de la pagination `@odata.nextLink`.
   */
  async getAll<T = any>(token: string, url: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = url.startsWith('http')
      ? url
      : 'https://graph.microsoft.com/v1.0' + (url.startsWith('/') ? url : '/' + url);

    while (next) {
      const res = await fetch(next, {
        headers: { Authorization: 'Bearer ' + token, ConsistencyLevel: 'eventual' },
        // 30s par page (Graph est lent sur les grosses pages 999 items).
        // Sans timeout, une page hangee = boucle infinie sur le sync tenant.
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error('Graph GET ' + next + ' -> ' + res.status + ' : ' + errBody.slice(0, 300));
      }
      const data: any = await res.json();
      if (Array.isArray(data.value)) items.push(...data.value);
      else if (data.value !== undefined) items.push(data.value);
      next = data['@odata.nextLink'];
    }
    return items;
  }

  /** Invalide le cache pour un tenant donne (utile apres rotation du secret). */
  invalidateCache(tenantId: string) {
    this.tokenCache.delete(tenantId);
  }
}
