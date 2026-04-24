# Deploiement CRM MDO Services sur Ubuntu 24.04

## Pre-requis cote infra

- Un serveur Ubuntu 24.04 (VPS, dedie ou VM) avec au moins 2 vCPU / 4 Go RAM / 20 Go disque
- Un nom de domaine `crm.mdoservices.fr` avec un enregistrement A pointant vers l'IP publique du serveur
- Un acces SSH root (ou sudo)
- Un compte SMTP pour les emails transactionnels (OVH, Scaleway, SendGrid, Mailjet...)

## Installation automatisee

### Option A - Le script clone le repo depuis GitHub

```bash
# Sur le serveur, en root :
curl -fsSL https://raw.githubusercontent.com/VOTRE_ORG/CRM_MDO/main/scripts/install-ubuntu.sh -o /tmp/install.sh
REPO_URL=https://github.com/VOTRE_ORG/CRM_MDO.git sudo bash /tmp/install.sh
```

### Option B - Vous copiez les sources puis lancez le script

```bash
scp -r . root@votre-serveur:/opt/crm-mdo
ssh root@votre-serveur
cd /opt/crm-mdo
sudo bash scripts/install-ubuntu.sh
```

### Variables optionnelles

| Variable         | Defaut                    | Description                          |
|------------------|---------------------------|--------------------------------------|
| `DOMAIN`         | `crm.mdoservices.fr`      | Domaine public                       |
| `ACME_EMAIL`     | `mathieu@mdoservices.fr`  | Email pour Let's Encrypt             |
| `INSTALL_DIR`    | `/opt/crm-mdo`            | Chemin d'installation                |
| `REPO_URL`       | (vide)                    | URL git du repo a cloner             |
| `TZ_NAME`        | `Europe/Paris`            | Timezone serveur                     |
| `TARGET_USER`    | `crm`                     | Utilisateur systeme proprietaire     |

## Ce que fait le script

1. Met a jour le systeme (`apt upgrade`)
2. Installe Docker CE + plugin Compose depuis le depot officiel Docker
3. Configure le firewall UFW (22, 80, 443 ouverts)
4. Active fail2ban
5. Clone / met a jour les sources dans `/opt/crm-mdo`
6. Genere un `.env` avec des mots de passe forts (OpenSSL)
7. Verifie que le DNS pointe bien vers le serveur
8. Build et demarre la stack avec Caddy + HTTPS Let's Encrypt automatique
9. Demande interactive les infos du compte admin et le cree
10. Installe un cron de backup quotidien vers `/var/backups/crm-mdo`

## Apres l'installation

Editer `/opt/crm-mdo/.env` pour les variables `SMTP_*`, puis :

```bash
cd /opt/crm-mdo
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Commandes utiles

```bash
cd /opt/crm-mdo

docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart
git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml build && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

sudo bash scripts/backup.sh
sudo bash scripts/restore.sh /var/backups/crm-mdo/crm_mdo_20260424_030000.sql.gz
```

## Supervision

- Healthcheck : `https://crm.mdoservices.fr/health`
- Logs : `docker compose logs`
- Backups : `/var/backups/crm-mdo/` (retention 30j)
- Certificats : geres automatiquement par Caddy (stockes dans le volume `caddy-data`)

## Securite

- `.env` en `chmod 600` (contient les secrets)
- JWT secrets regeneres aleatoirement
- bcrypt (round 12) pour mots de passe
- Helmet sur le backend
- UFW + fail2ban actifs
- HTTPS obligatoire
