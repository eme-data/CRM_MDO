# Migration vers un nouveau serveur

Procédure complète pour migrer le CRM MDO depuis un serveur actuel vers un nouveau (changement d'hébergeur, montée en gamme, etc.) **sans perte de données**.

## Aperçu

```
┌─────────────────┐                       ┌─────────────────┐
│ Ancien serveur  │                       │ Nouveau serveur │
│                 │  1. migrate-export    │                 │
│  /opt/crm-mdo   │ ─────────────────►    │  Ubuntu fraîche │
│                 │  /tmp/archive.tar.gz  │                 │
│                 │                       │                 │
│                 │  2. scp ────────────► │                 │
│                 │                       │                 │
│                 │                       │  3. install     │
│                 │                       │  --restore-from │
└─────────────────┘                       └─────────────────┘
                              4. bascule DNS
```

L'archive contient **tout** ce qu'il faut pour reconstruire à l'identique :
- `.env` avec tous les secrets (mots de passe BDD, JWT, clés API, SECRETS_MASTER_KEY)
- Dump PostgreSQL complet
- Volume uploads (pièces jointes tickets, attachements)
- Caddy data (certificats Let's Encrypt déjà émis — évite un nouveau round-trip ACME)
- Manifest avec checksums sha256 pour vérifier l'intégrité

## Pré-requis

- Accès root sur l'ancien et le nouveau serveur
- Un nouveau serveur Ubuntu 22.04 / 24.04 ou Debian 12 avec **2 vCPU / 4 Go RAM / 20 Go disque** minimum
- Le **même nom de domaine** (sinon les passkeys WebAuthn deviennent invalides ; les clés sont liées cryptographiquement à l'origin)
- Une fenêtre de maintenance d'environ 30 minutes (transfert + bascule)

## 1. Sur l'ancien serveur — Export

### Option A : archive en clair (réseau interne ou transfert direct)

```bash
cd /opt/crm-mdo
sudo bash scripts/migrate-export.sh
```

Produit `/tmp/crm-mdo-migration_YYYYMMDD_HHMMSS.tar.gz`.

### Option B : archive chiffrée (recommandé pour transfert sur réseau public)

```bash
cd /opt/crm-mdo
sudo MIGRATION_PASSWORD='un-mot-de-passe-tres-fort' bash scripts/migrate-export.sh
```

Produit `/tmp/crm-mdo-migration_YYYYMMDD_HHMMSS.tar.gz.enc` (chiffrement AES-256-CBC, dérivation PBKDF2 250k itérations).

**Mémorise le mot de passe** — il faut le redonner sur le nouveau serveur.

## 2. Transfert

```bash
# Depuis ta machine locale OU directement de serveur à serveur
scp root@ancien-serveur:/tmp/crm-mdo-migration_*.tar.gz* root@nouveau-serveur:/tmp/
```

L'archive fait typiquement quelques dizaines de Mo (le gros = uploads). En SFTP/SCP, compter quelques minutes.

## 3. Sur le nouveau serveur — Restauration

```bash
# Si le repo n'est pas encore cloné :
git clone https://github.com/eme-data/CRM_MDO.git /opt/crm-mdo
cd /opt/crm-mdo

# Restauration depuis l'archive
sudo bash scripts/install-ubuntu.sh --restore-from=/tmp/crm-mdo-migration_*.tar.gz

# Ou chiffrée :
sudo MIGRATION_PASSWORD='le-mot-de-passe' \
  bash scripts/install-ubuntu.sh --restore-from=/tmp/crm-mdo-migration_*.tar.gz.enc
```

Le script :
1. Lance les pre-flight checks (RAM, disque, ports, connectivité Docker Hub / Let's Encrypt)
2. Installe Docker, UFW, CrowdSec, unattended-upgrades, hardening SSH
3. Extrait l'archive et vérifie les checksums sha256
4. Installe le `.env` du backup (tous les secrets identiques)
5. Build et démarre la stack Docker
6. Restaure la BDD via `psql`
7. Restaure les uploads dans le volume Docker `attachments-data`
8. Restaure les certs Let's Encrypt dans `caddy-data` (évite la ré-émission ACME)
9. Build le serveur MCP
10. Healthcheck post-install (HTTP local + HTTPS externe)

À la fin tu obtiens un CRM **identique** à l'ancien (mêmes secrets, mêmes utilisateurs, mêmes données, mêmes certificats).

## 4. Bascule DNS

Tant que le DNS pointe encore vers l'ancien serveur, le nouveau est inaccessible via le FQDN public. Plusieurs stratégies :

### Bascule sèche (downtime 5-30 min selon TTL)

1. Modifier le DNS A record vers la nouvelle IP
2. Attendre la propagation (selon TTL ; si tu peux baisser le TTL à 60s 24h avant, la bascule est ultra-rapide)
3. Vérifier `dig crm.mdoservices.fr` sur le nouveau serveur — doit retourner sa propre IP
4. Stopper la stack sur l'ancien serveur : `cd /opt/crm-mdo && docker compose down`

### Test avant bascule (recommandé)

Édite ton fichier `/etc/hosts` local pour pointer le FQDN vers la nouvelle IP, et valide manuellement (login, ouverture d'un ticket, déchiffrement d'un secret) avant la bascule DNS officielle.

```
# /etc/hosts
1.2.3.4 crm.mdoservices.fr
```

## 5. Validation post-bascule

```bash
# Sur le nouveau serveur
curl -fsS https://crm.mdoservices.fr/health     # doit retourner OK
curl -fsS https://crm.mdoservices.fr/api/branding  # doit retourner le JSON branding
docker compose logs --tail=50 backend | grep -i error
docker compose logs --tail=50 caddy | grep -i "obtain certificate"
```

Connecte-toi via l'UI, vérifie :
- Login OK (même mot de passe qu'avant)
- Liste des sociétés / contacts / tickets identique
- Téléchargement d'une pièce jointe
- Déchiffrement d'un secret (`SecretEntry`) — vérifie que `SECRETS_MASTER_KEY` du `.env` n'a pas changé

## 6. Nettoyage

```bash
# Sur l'ancien serveur — APRÈS validation complète
docker compose down
# Garde les volumes 7-14 jours au cas où (rollback possible)
# Puis :
# docker volume prune  # supprimera les volumes non utilisés

# Sur le nouveau serveur — supprimer l'archive de migration
sudo shred -u /tmp/crm-mdo-migration_*.tar.gz*
```

## Rollback (si problème)

Le script `install-ubuntu.sh --restore-from` crée un backup pre-restore de la BDD nouvelle (s'il y avait déjà des données). Pour rollback :

```bash
cd /opt/crm-mdo
sudo bash scripts/restore.sh /var/backups/crm-mdo/pre-restore_*.sql.gz
```

Si la bascule DNS a déjà eu lieu, repointer le DNS vers l'ancienne IP pendant que tu investigues.

## Cas particuliers

### Changement de nom de domaine

Si tu profites de la migration pour changer de FQDN (ex: `crm.mdoservices.fr` → `app.mdoservices.fr`) :

⚠️ **Cassures à prévoir** :
- **WebAuthn / Passkeys** : toutes les clés enregistrées deviennent invalides (liées cryptographiquement à l'origin). Les users devront ré-enregistrer leurs clés.
- **SSO OIDC** : reconfigurer les redirect_uri côté IdP (Entra ID, Keycloak) pour le nouveau domaine.
- **Webhooks externes** : tous les `WebhookEndpoint` configurés pointent vers l'ancien domaine côté provider (Qonto, etc.). À reconfigurer.

Édite le `.env` après restore :
```bash
sed -i 's|crm.mdoservices.fr|app.mdoservices.fr|g' /opt/crm-mdo/.env
docker compose restart backend caddy
```

### Migration vers un environnement multi-tenant

Si le nouveau serveur va aussi héberger d'autres clients DSI (revente), pas besoin de manipuler le Caddyfile à la main : crée chaque nouveau tenant via l'UI super-admin (`/super-admin/tenants`), le service `CaddyProvisioningService` régénère la config et Caddy émet automatiquement le cert Let's Encrypt sur la première requête.

### Pas d'accès SSH à l'ancien serveur

Si tu n'as plus que les backups quotidiens automatiques (`/var/backups/crm-mdo/`), tu peux restaurer à partir d'un dump SQL seul + tarball uploads avec `restore.sh` (cf. son `--help`). Mais tu perdras les certificats Let's Encrypt — Caddy refera un ACME au premier accès (30-60s d'attente la première fois).

### Caché : la clé SECRETS_MASTER_KEY

Cette clé déchiffre toutes les `SecretEntry` (mots de passe stockés dans le coffre du CRM). Si elle est différente entre ancien et nouveau serveur, **tous les secrets stockés deviennent illisibles**. La procédure `migrate-export.sh` la préserve via le `.env`. Si tu génères un nouveau `.env` à la main : recopie cette ligne depuis l'ancien.
