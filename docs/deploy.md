# Déploiement CRM MDO Services

Procédure de déploiement sur Ubuntu 22.04 / 24.04 ou Debian 12.

> 💡 Pour **migrer vers un nouveau serveur** depuis une installation existante, voir [migrate.md](./migrate.md).

## Pré-requis côté infra

- Un serveur Ubuntu 22.04 / 24.04 ou Debian 12 (VPS, dédié ou VM) avec :
  - **2 vCPU minimum** (4 si beaucoup d'utilisateurs)
  - **4 Go RAM minimum** (2 Go absolu si on désactive CrowdSec via `SKIP_CROWDSEC=1`)
  - **20 Go disque minimum** (les backups + uploads + images Docker peuvent atteindre 10 Go sur 1 an)
- Un nom de domaine (ex: `crm.mdoservices.fr`) avec un **enregistrement A** pointant vers l'IP publique du serveur — Let's Encrypt vérifie la propriété via HTTP-01 challenge
- Un accès SSH root (ou sudo). **Recommandation** : authentification par clé SSH (le script propose un hardening automatique qui désactive le password)
- Un compte SMTP pour les emails transactionnels (OVH, Scaleway, SendGrid, Mailjet...) — peut être configuré après installation via l'UI admin

## Installation automatisée

### Option A — Le script clone le repo depuis GitHub

```bash
# Sur le serveur, en root :
curl -fsSL https://raw.githubusercontent.com/eme-data/CRM_MDO/main/scripts/install-ubuntu.sh -o /tmp/install.sh
REPO_URL=https://github.com/eme-data/CRM_MDO.git sudo bash /tmp/install.sh
```

### Option B — Copie locale des sources

```bash
# Depuis ta machine :
scp -r . root@votre-serveur:/opt/crm-mdo

# Sur le serveur :
ssh root@votre-serveur
cd /opt/crm-mdo
sudo bash scripts/install-ubuntu.sh
```

## Modes du script

| Mode | Commande | Quand l'utiliser |
|---|---|---|
| Install neuve | `sudo bash install-ubuntu.sh` | Nouveau serveur, premier déploiement |
| Upgrade | `sudo bash install-ubuntu.sh --upgrade` | Mise à jour : git pull + rebuild + redémarrage |
| Restore (migration) | `sudo bash install-ubuntu.sh --restore-from=PATH` | Migration depuis un autre serveur (cf [migrate.md](./migrate.md)) |

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `DOMAIN` | `crm.mdoservices.fr` | FQDN public, sert au Caddy site block + Let's Encrypt + WebAuthn RP_ID |
| `ACME_EMAIL` | `mathieu@mdoservices.fr` | Email pour Let's Encrypt (notifications expirations) |
| `INSTALL_DIR` | `/opt/crm-mdo` | Chemin d'installation |
| `REPO_URL` | (vide) | URL git du repo à cloner |
| `TZ_NAME` | `Europe/Paris` | Timezone serveur |
| `TARGET_USER` | `crm` | Utilisateur système propriétaire |
| `ASSUME_YES=1` | (interactif) | Mode non-interactif : valide automatiquement toutes les questions (CI, scripting) |
| `SKIP_CROWDSEC=1` | (installé) | Pas de CrowdSec — recommandé sur VPS < 2 Go RAM |
| `SKIP_SSH_HARDENING=1` | (hardening si clé) | Ne touche pas au `sshd_config` (utile si Ansible/Salt gère déjà) |
| `MIGRATION_PASSWORD` | — | Mot de passe de déchiffrement pour `--restore-from=...enc` |

## Ce que fait le script

1. **Pre-flight checks** : RAM ≥ 2 Go, disque ≥ 15 Go, ports 80/443 libres, connectivité sortante Docker Hub / Let's Encrypt / GitHub
2. **Mise à jour système** + paquets de base (curl, git, ufw, jq, openssl, restic, unattended-upgrades)
3. **Auto-updates de sécurité** activés (`unattended-upgrades`, reboot auto à 04h00 si requis)
4. **Timezone** Europe/Paris
5. **Utilisateur dédié** `crm` créé
6. **Docker CE + Compose plugin** depuis le repo officiel
7. **UFW** activé (ports 22, 80, 443, 443/udp ouverts, reste bloqué)
8. **Hardening SSH** (si ≥ 1 clé SSH détectée) : désactive root password + password authentication
9. **CrowdSec** installé (sshd + http + caddy + linux scenarios) avec firewall-bouncer iptables
10. **Clone / met à jour** le repo dans `/opt/crm-mdo`
11. **Génère un `.env`** avec mots de passe forts (openssl rand) incluant les nouvelles variables :
    - `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ORIGINS` (Passkeys)
    - `CADDY_PROVISIONING` / `CADDY_ADMIN_URL` / `CADDY_CONFIG_PATH` (multi-tenant auto)
12. **Vérifie le DNS** : le FQDN doit pointer vers l'IP du serveur (sinon ACME échouera)
13. **Build et démarre** la stack Docker via `docker-compose.prod.yml`
14. **Build du serveur MCP** (`mcp/dist/index.js`) pour interrogation Claude desktop
15. **Création interactive du compte admin** (le 1er ADMIN est auto-promu super-admin au boot du backend)
16. **Cron de backup quotidien** vers `/var/backups/crm-mdo/` (03h00) + offsite restic chiffré (04h00, optionnel)
17. **Healthcheck post-install** : `/health`, `/api/branding`, HTTPS externe

## Après l'installation

### 1. Compléter les credentials SMTP

L'envoi d'emails (notifications, rapports clients, alertes contrats) nécessite un SMTP. Deux options :

**Option A — Via l'UI super-admin** (recommandé) :
1. Connecte-toi avec le compte admin créé
2. Va dans `/super-admin/settings` → catégorie `SMTP`
3. Renseigne host, port, user, password, from
4. Les settings sont stockés en BDD et chargés à chaque envoi (par tenant pour le multi-tenant)

**Option B — Via le `.env`** :
```bash
sudo nano /opt/crm-mdo/.env
# Renseigner SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
cd /opt/crm-mdo && docker compose restart backend
```

### 2. Configurer le backup off-site (restic, recommandé)

Le backup local quotidien (`/var/backups/crm-mdo/`) protège contre un crash applicatif. Pour protéger contre un crash matériel, configure un backup off-site chiffré via restic :

```bash
sudo cp /etc/crm-mdo/backup.env.example /etc/crm-mdo/backup.env
sudo chmod 600 /etc/crm-mdo/backup.env
sudo nano /etc/crm-mdo/backup.env  # renseigner B2 / S3 / Hetzner
sudo /opt/crm-mdo/scripts/backup-offsite.sh  # premier run manuel
```

Backends supportés : Backblaze B2 (recommandé, EUR ~0.005/Go/mois), S3 / Scaleway / OVH Cloud, Hetzner StorageBox SFTP.

### 3. (Optionnel) Activer SSO OIDC pour Microsoft 365 / Entra ID

Dans `/super-admin/settings` → catégorie `SSO` :
- `sso.enabled` → `true`
- `sso.oidc.issuerUrl` → `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
- `sso.oidc.clientId` → ID de l'app enregistrée dans Entra ID
- `sso.oidc.clientSecret` → secret généré dans l'app Entra ID
- `sso.allowJitProvisioning` → `true` (création auto des users au 1er login)

Le bouton "Se connecter avec votre compte entreprise (SSO)" apparaît alors sur `/login`.

## Commandes utiles

```bash
cd /opt/crm-mdo

# Logs en temps réel
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
docker compose logs -f backend
docker compose logs -f caddy

# Redémarrage
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
docker compose restart backend  # juste un service

# Mise à jour (git pull + rebuild + restart)
sudo bash scripts/install-ubuntu.sh --upgrade

# Backup manuel
sudo bash scripts/backup.sh

# Restore d'un backup
sudo bash scripts/restore.sh /var/backups/crm-mdo/crm_mdo_20260601_030000.sql.gz

# Migration vers un nouveau serveur (cf migrate.md)
sudo bash scripts/migrate-export.sh
```

## Supervision

- **Healthcheck** : `https://crm.mdoservices.fr/health` (200 OK = backend OK)
- **Logs structurés** : `docker compose logs` (format JSON via pino)
- **Backups** : `/var/backups/crm-mdo/` (rétention 30 jours)
- **Certificats Let's Encrypt** : gérés automatiquement par Caddy dans le volume `caddy-data`
- **CrowdSec décisions** : `sudo cscli decisions list`
- **UFW status** : `sudo ufw status verbose`
- **Auto-updates queue** : `cat /var/log/unattended-upgrades/unattended-upgrades.log`

## Troubleshooting

### Let's Encrypt échoue ("could not solve challenge")

Le DNS du `DOMAIN` ne pointe pas (encore) vers ce serveur, ou le port 80 n'est pas accessible depuis Internet. Vérifie :
```bash
dig +short crm.mdoservices.fr  # doit retourner l'IP du serveur
curl -fsS http://crm.mdoservices.fr  # depuis l'extérieur
```

### Backend ne démarre pas

```bash
docker compose logs --tail=100 backend
# Erreur classique : DATABASE_URL malformée ou Postgres pas encore prêt
# → docker compose restart backend après quelques secondes
```

### Migration de schema Prisma au boot

Le backend exécute `prisma migrate deploy` au démarrage. Si une migration échoue (rare, conflit de migration manuelle), vérifie :
```bash
docker compose exec backend npx prisma migrate status
```

### Caddy ne reload pas après création d'un tenant

Vérifie que `CADDY_PROVISIONING=enabled` est dans le `.env` et que le port 2019 est accessible entre containers :
```bash
docker compose exec backend curl -fsS http://caddy:2019/config/  # doit retourner du JSON
```

Si erreur, vérifie que le volume `caddy-config-shared` est bien monté dans les 2 containers et que `docker-compose.prod.yml` expose `2019` en interne.
