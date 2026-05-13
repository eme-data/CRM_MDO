# Déploiement du CRM MDO sur Hostinger

## ⚠️ Compatibilité — à lire en premier

Le CRM MDO est une application **Docker** (NestJS + Next.js + PostgreSQL + Redis + Caddy). Tous les types d'hébergement Hostinger ne sont **pas** compatibles.

| Offre Hostinger | Compatible ? | Pourquoi |
|---|---|---|
| **Hébergement Web** (Premium / Business / Cloud Startup) | ❌ Non | Pas de Docker, pas de Node.js long-running, pas de PostgreSQL self-hosted, accès SSH limité |
| **VPS Hostinger** (KVM 1 / 2 / 4 / 8) | ✅ Oui | Ubuntu/Debian, Docker, accès root, ports 80/443 |
| **Cloud Hosting** (Startup / Professional / Enterprise) | ⚠️ Variable | Docker non garanti, à vérifier au cas par cas — préférer VPS |

**Recommandation : VPS Hostinger KVM 2** (4 Go RAM / 2 vCPU / 80 Go NVMe) à ~7-8 €/mois est largement suffisant pour un usage solo + 5 utilisateurs.

| Taille VPS | Pour | Note |
|---|---|---|
| KVM 1 (1 Go RAM) | Tests, démo | Trop juste : Postgres + Redis + 2 conteneurs Node = swap → utiliser `SKIP_CROWDSEC=1` |
| **KVM 2 (4 Go RAM)** | **Solo + jusqu'à ~10 users** | **Recommandé.** Confortable. |
| KVM 4 (8 Go RAM) | Équipe + 50+ contacts/jour | Marge importante. |

---

## 1. Commander le VPS

1. Aller sur https://www.hostinger.fr/vps-hosting → choisir un plan **KVM 2** minimum.
2. **Système d'exploitation** : choisir **Ubuntu 24.04** (testé) ou **Ubuntu 22.04** (compatible).
3. **Localisation** : France (Paris) ou Lituanie (Vilnius) pour la latence FR.
4. **Hostname** : ex. `crm-mdo` (peu importe).
5. À la fin, Hostinger envoie l'IP du VPS + le mot de passe root par email.

## 2. Pointer le DNS vers le VPS

Si votre domaine est déjà géré par Hostinger (hPanel) :

1. hPanel → **Domaines → Zone DNS** du domaine `mdoservices.fr`.
2. Ajouter un enregistrement **A** :
   - **Type** : A
   - **Nom** : `crm` (donnera `crm.mdoservices.fr`)
   - **Pointe vers** : l'IP publique du VPS (ex. `89.116.X.X`)
   - **TTL** : 3600
3. Attendre 5-10 minutes la propagation. Vérifier avec :
   ```sh
   dig +short crm.mdoservices.fr
   ```

Si votre domaine est ailleurs (OVH, Gandi, etc.) : faites la même chose dans leur interface DNS.

**Important** : Let's Encrypt (cert SSL automatique via Caddy) ne fonctionnera que si le DNS résout déjà l'IP du VPS au moment du démarrage.

## 3. Se connecter au VPS

```sh
ssh root@<IP-DU-VPS>
# (mot de passe envoyé par mail)
```

À la première connexion, **changez immédiatement le mot de passe root** :

```sh
passwd
```

Optionnel mais recommandé : ajouter votre clé SSH pour désactiver l'auth par mot de passe :

```sh
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... votre clé publique" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
# Puis editer /etc/ssh/sshd_config :
#   PasswordAuthentication no
# Et : systemctl reload sshd
```

## 4. Lancer l'installation

```sh
# Variables (a personnaliser)
export DOMAIN=crm.mdoservices.fr
export ACME_EMAIL=mathieu@mdoservices.fr
export REPO_URL=https://github.com/<votre-org>/CRM_MDO.git

# Sur un VPS <2 Go RAM, desactiver CrowdSec :
# export SKIP_CROWDSEC=1

# Recuperation et execution du script
curl -fsSL https://raw.githubusercontent.com/<votre-org>/CRM_MDO/main/scripts/install-ubuntu.sh -o install.sh
bash install.sh
```

Ou en mode "tout-en-une-ligne" (le repo doit être public OU vous avez déjà cloné) :

```sh
git clone https://github.com/<votre-org>/CRM_MDO.git /opt/crm-mdo
DOMAIN=crm.mdoservices.fr ACME_EMAIL=mathieu@mdoservices.fr \
  bash /opt/crm-mdo/scripts/install-ubuntu.sh
```

Le script va :

1. ✅ Vérifier la version d'Ubuntu/Debian (22.04 / 24.04 / Debian 12)
2. ✅ Installer Docker + Docker Compose
3. ✅ Configurer UFW (firewall) : SSH 22, HTTP 80, HTTPS 443
4. ✅ Installer CrowdSec (sauf si `SKIP_CROWDSEC=1`)
5. ✅ Cloner le repo (si `REPO_URL` fourni)
6. ✅ Générer `.env` avec mots de passe aléatoires forts
7. ✅ Vérifier que le DNS pointe bien vers ce serveur
8. ✅ Builder les images Docker et démarrer la stack
9. ✅ Créer le compte admin (interactif)
10. ✅ Configurer un backup quotidien à 3h00

## 5. Vérifier que ça fonctionne

```sh
# Logs en direct
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Etat des conteneurs
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Ouvrir `https://crm.mdoservices.fr` dans un navigateur — le certificat Let's Encrypt est délivré automatiquement à la première requête. Si ça reste sur HTTP : DNS pas encore propagé, attendre.

## 6. Configurer ce qui ne l'est pas encore

### SMTP (relances de contrats, accusés de réception tickets)

Éditer `/opt/crm-mdo/.env` :

```sh
SMTP_HOST=smtp.office365.com           # ou votre serveur
SMTP_PORT=587
SMTP_USER=no-reply@mdoservices.fr
SMTP_PASSWORD=votre-mot-de-passe
SMTP_FROM="CRM MDO Services <no-reply@mdoservices.fr>"
SMTP_SECURE=false
```

Puis redémarrer :

```sh
cd /opt/crm-mdo
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### IMAP entrant (création auto de tickets depuis support@)

Idem, dans `.env` :

```sh
INBOUND_EMAIL_ENABLED=true
IMAP_HOST=outlook.office365.com
IMAP_USER=support@mdoservices.fr
IMAP_PASSWORD=...
```

## 7. Sauvegarde off-site (optionnel mais recommandé)

Le script configure déjà un backup local quotidien (`/var/backups/crm-mdo`). Pour ajouter une sauvegarde off-site chiffrée (restic vers Backblaze B2 / S3 / Hetzner StorageBox) :

```sh
cp /etc/crm-mdo/backup.env.example /etc/crm-mdo/backup.env
chmod 600 /etc/crm-mdo/backup.env
nano /etc/crm-mdo/backup.env
# Renseigner les variables RESTIC_REPOSITORY + credentials + RESTIC_PASSWORD
```

Le cron `crm-mdo-backup-offsite.log` se déclenche automatiquement à 4h00 dès que le fichier existe.

## 8. Mises à jour

```sh
cd /opt/crm-mdo
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec backend npx prisma migrate deploy
```

## 9. Spécificités Hostinger à connaître

- **Pas de panneau cPanel** sur les VPS Hostinger — tout passe par SSH. Le **hPanel** sert uniquement à gérer le VPS au niveau infra (reboot, snapshots, console KVM, reverse DNS).
- **Snapshots** : Hostinger propose des snapshots manuels du VPS depuis le hPanel — utile avant une mise à jour majeure. Coût : compris dans la plupart des plans VPS.
- **Reverse DNS (PTR)** : à configurer dans hPanel → VPS → Settings → Network. Mettre le PTR de l'IP vers `crm.mdoservices.fr` pour améliorer la délivrabilité des mails sortants (si vous utilisez le VPS comme relais SMTP, ce qui n'est PAS le défaut ici — par défaut on passe par un SMTP externe).
- **Pas de port 25 sortant** : Hostinger bloque le port 25 sortant comme la plupart des hébergeurs. Utilisez le port 587 (SMTP authentifié) — c'est le défaut du `.env.example`.
- **IPv6** : activée par défaut. Aucune config requise côté CRM.

## 10. Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| `https://...` reste en HTTP | DNS pas propagé | Attendre 10 min, `dig +short crm.mdoservices.fr` |
| Certificat invalide | Caddy n'a pas pu joindre Let's Encrypt | `docker compose logs caddy`, vérifier ports 80/443 ouverts dans UFW + hPanel firewall |
| OOM (out of memory) sur KVM 1 | Pas assez de RAM | Relancer avec `SKIP_CROWDSEC=1` et/ou passer en KVM 2 |
| Backend ne répond pas | DB pas migrée | `docker compose exec backend npx prisma migrate deploy` |
| 502 Bad Gateway | Backend crashe au boot | `docker compose logs backend` — souvent `.env` mal renseigné |

## 11. Ce qu'on ne peut PAS faire sur Hostinger mutualisé (rappel)

Si vous tombez sur un commercial Hostinger qui vous propose un **hébergement Web Premium** "qui supporte Node.js" : c'est faux pour ce projet. L'hébergement mutualisé Hostinger supporte du Node.js en mode **build statique uniquement** ou via leur "Node.js Selector", mais :

- ❌ Pas de PostgreSQL (seulement MySQL/MariaDB)
- ❌ Pas de Redis
- ❌ Pas de Docker
- ❌ Pas de processus long-running fiable (les cron jobs internes du CRM ne tourneraient pas)
- ❌ Pas d'accès aux ports 80/443 sortants pour Let's Encrypt

→ **VPS obligatoire** pour ce projet.
