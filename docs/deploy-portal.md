# Portail client — Procédure de déploiement

Le portail client est servi sur le sous-domaine `client.mdoservices.fr`. Les clients se connectent par **magic link** (lien à usage unique envoyé par email, valide 15 min).

---

## 1. Pointer le sous-domaine DNS

Dans hPanel Hostinger (ou ton registrar) → zone DNS de `mdoservices.fr` :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `client` | `<IP du VPS>` (même que `crm`) | 3600 |

Attendre la propagation (5-15 min). Vérifier : `dig +short client.mdoservices.fr` doit renvoyer l'IP du VPS.

## 2. Configurer Caddy

Dans `docker/caddy/Caddyfile`, ajoute un bloc pour le sous-domaine portail :

```caddy
client.mdoservices.fr {
    encode gzip zstd
    # Tout le portail tourne en fait sur le même Next.js que le CRM,
    # sous le préfixe /portal. Caddy fait juste un proxy + une réécriture
    # pour que la racine du sous-domaine pointe sur /portal.
    @root path /
    rewrite @root /portal

    # Les requêtes /api/* sont relayées au backend (mêmes routes /api/portal/*)
    handle /api/* {
        reverse_proxy backend:4000
    }
    handle {
        reverse_proxy frontend:3000
    }
}
```

Recharger Caddy : `docker compose -f docker-compose.yml -f docker-compose.prod.yml restart caddy`.

## 3. Configurer l'URL du portail dans le CRM

Dans **Admin → Settings** (ou `.env`) :

```bash
PORTAL_URL=https://client.mdoservices.fr
```

Ou via l'UI Settings : `app.portalUrl` = `https://client.mdoservices.fr`.

Si vide, le portail utilise `app.publicUrl` (le CRM) comme fallback — fonctionne mais l'URL n'aura pas l'air "portail".

## 4. Comment les clients se connectent

1. Le client va sur `https://client.mdoservices.fr` → page de login.
2. Il saisit son email pro (ex. `jean.dupont@acme.fr`).
3. Le système :
   - Extrait le domaine `acme.fr`
   - Cherche une `Company` dans le CRM dont `website` ou `email` contient `acme.fr`
   - Si trouvé → crée un `ClientPortalUser` (ou récupère l'existant) → envoie le magic link
   - Si non trouvé → renvoie un message générique (pas de fuite d'info sur qui est client)
4. Le client clique sur le lien dans l'email → arrive sur `/portal/verify?token=...` → session ouverte pour 7 jours.

## 5. Quelles données voit le client

Strictement scopé à **sa propre `Company`** :

- **Tickets** : liste + détail + ouverture + réponse aux messages MDO
- **Contrats** : référence, offre, période, montant mensuel
- **Assets surveillés** : nom, type, identifiant, date d'expiration, statut surveillance

Aucun accès à :
- Coût HT des assets
- Données internes MDO (notes commerciales, time entries, autres clients)
- Liste des secrets / docs ITGlue (sauf si on l'ajoute plus tard)

## 6. Sécurité

- **Magic links** : token 32 bytes hex (256 bits), hashé SHA256 en BDD, valide 15 min, à usage unique
- **Rate-limit** : max 5 demandes de magic link / 5 min / IP, max 3 liens actifs par utilisateur en parallèle
- **Sessions** : token opaque 32 bytes, 7 jours TTL, révocable côté admin
- **Isolation tenant** : tous les services portail filtrent strictement par `req.portalUser.companyId`. Une faille tenterait d'accéder à un autre `companyId` retourne 404 (pas 403, pour ne pas confirmer l'existence)
- **Pas de mot de passe** : aucun risque de password reuse / phishing classique

## 7. Désactiver un compte portail

Pour bloquer un client (départ d'un contact, fin de contrat) :

```sql
UPDATE "ClientPortalUser" SET "isActive" = false WHERE email = 'jean.dupont@acme.fr';
```

Ou via une future UI admin (pas encore implémentée — à ajouter si besoin).

## 8. Statistiques d'usage

Les colonnes `lastLoginAt` (sur `ClientPortalUser`) et `lastUsedAt` (sur `ClientPortalSession`) permettent de mesurer l'adoption :

```sql
SELECT c.name, COUNT(pu.id) AS portal_users, MAX(pu."lastLoginAt") AS last_login
FROM "Company" c
LEFT JOIN "ClientPortalUser" pu ON pu."companyId" = c.id
WHERE c.status = 'CUSTOMER'
GROUP BY c.id, c.name
ORDER BY last_login DESC;
```

## 9. Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| Client ne reçoit pas le magic link | Email pas dans spam, mais le domaine ne match aucune `Company` | Renseigner `website` ou `email` de la société dans le CRM |
| `Session expiree` au refresh | TTL session 7j expiré OU session révoquée | Nouveau magic link |
| Le lien expire avant que le client clique | Limite 15 min | Renvoyer un lien |
| Plusieurs employés d'un même client se chevauchent | Chacun a son propre `ClientPortalUser` avec sa session — pas de conflit | Comportement normal |
