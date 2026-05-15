# Déploiement d'une instance client (multi-instance DSI)

Ce guide décrit comment provisionner une instance dédiée du CRM pour un client DSI (mairie, PME, collectivité…). Chaque client a sa propre stack Docker complète (BDD + app + Redis isolés) — modèle multi-instance, pas multi-tenant.

## Modes de déploiement

**Recommandé : 1 VPS par client** (Jotelulu cloud souverain pour les collectivités). Chaque client a son propre serveur dédié. Argument commercial fort ("vos données, votre VPS, votre BDD"), maintenance simple, isolation maximale. Le `provision-client.sh` ci-dessous fonctionne dans ce mode out-of-the-box.

**Avancé : N clients sur 1 VPS** — possible mais nécessite un Caddy partagé global (en dehors des compose des instances) qui route par domaine. Pas couvert dans ce guide ; à mettre en place quand on aura ≥3 clients consolidés sur un VPS pour amortir les coûts. Voir TODO en fin de document.

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│ VPS (Ubuntu 24.04) hébergé par MDO Services             │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │ Instance Mairie     │  │ Instance PME ABC    │      │
│  │ /opt/crm-seysses    │  │ /opt/crm-abc        │      │
│  │ ─ postgres dédié    │  │ ─ postgres dédié    │      │
│  │ ─ redis dédié       │  │ ─ redis dédié       │      │
│  │ ─ backend dédié     │  │ ─ backend dédié     │      │
│  │ ─ frontend dédié    │  │ ─ frontend dédié    │      │
│  │ port: interne only  │  │ port: interne only  │      │
│  └─────────────────────┘  └─────────────────────┘      │
│                  ↑                  ↑                   │
│                  └────────┬─────────┘                   │
│                  ┌────────┴─────────┐                   │
│                  │  Caddy (mutualisé) │                  │
│                  │  HTTPS Let's Encrypt              │   │
│                  │  Routing par domaine              │   │
│                  └───────────────────────────────────┘   │
│                            ↑                            │
└────────────────────────────┼────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
   crm.mairie-seysses.fr           crm.pme-abc.fr
```

**Avantages du multi-instance vs multi-tenant logique** :
- Isolation totale : un bug = 1 client impacté
- Backup/restore par client trivial (`pg_dump` direct)
- Migrations Prisma testables sur 1 client avant rollout
- Branding 100% personnalisable via `.env`
- Argument commercial "souverain" : votre BDD, votre VPS

## Pré-requis serveur

Sur l'**hôte** qui va héberger les instances :

1. **Ubuntu 24.04** (ou Debian 12) avec accès root
2. **install-ubuntu.sh exécuté une fois** pour la base (Docker, UFW, Caddy, restic) — c'est la même base que pour l'instance MDO
3. **DNS configuré** : chaque instance client doit avoir son propre A record pointant vers l'IP du serveur (ex: `crm.mairie-seysses.fr A 91.X.X.X`)

Caddy (déjà installé par `install-ubuntu.sh`) écoute sur 80/443 et route automatiquement vers le bon backend en fonction du domaine.

## Provisionner une nouvelle instance

```bash
sudo bash /opt/crm-mdo/scripts/provision-client.sh \
  --slug seysses \
  --domain crm.mairie-seysses.fr \
  --acme-email contact@mairie-seysses.fr \
  --brand-name "Mairie de SEYSSES" \
  --brand-short "Seysses" \
  --brand-tagline "Service Informatique Mutualisé" \
  --brand-color "#0066CC"
```

Le script :
1. Vérifie le DNS (warning si non configuré)
2. Clone le repo dans `/opt/crm-seysses/`
3. Génère un `.env` avec mots de passe aléatoires + branding
4. Build les images Docker (5-10 min)
5. Démarre la stack
6. Demande un compte admin initial (interactif, 12+ char, 3 classes min)

Toutes les options du script :
```bash
sudo bash /opt/crm-mdo/scripts/provision-client.sh --help
```

## Personnalisation post-installation

### Logo

Remplacer `/opt/crm-<slug>/frontend/public/logo.png` par le logo client (PNG transparent, ~512×512 idéal).

```bash
cd /opt/crm-seysses
docker compose restart frontend
```

### SMTP (envoi d'emails)

Éditer `/opt/crm-<slug>/.env` :
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=no-reply@mairie-seysses.fr
SMTP_PASSWORD=...
SMTP_FROM="Mairie de SEYSSES <no-reply@mairie-seysses.fr>"
```

```bash
docker compose restart backend
```

### IMAP entrant (création de tickets depuis support@)

Éditer `.env` :
```
INBOUND_EMAIL_ENABLED=true
IMAP_HOST=outlook.office365.com
IMAP_USER=support@mairie-seysses.fr
IMAP_PASSWORD=...
```

### Accès Microsoft 365 (M365 Secure Score, alertes Defender)

Voir [docs/deploy-m365.md](deploy-m365.md). Le client doit créer une App Registration Azure AD avec consent admin.

### API Anthropic (copilote IA tickets)

Aller dans **Settings → IA** côté CRM, activer + saisir la clé API. La clé est stockée chiffrée (SECRETS_MASTER_KEY).

## Mise à jour des instances

### Toutes les instances en une commande

```bash
sudo bash /opt/crm-mdo/scripts/update-all-clients.sh
```

Le script itère sur tous les `/opt/crm-*`, fait `git pull` + rebuild + restart, vérifie le healthcheck. **Backup automatique avant chaque update**. Si une instance échoue, les autres déjà OK restent à jour.

### Une seule instance

```bash
sudo bash /opt/crm-mdo/scripts/update-all-clients.sh --instance crm-seysses
```

### Bloquer un client sur une version stable (tag Git)

```bash
sudo bash /opt/crm-mdo/scripts/update-all-clients.sh --instance crm-seysses --ref v1.4.2
```

Utile quand un client en prod ne doit pas suivre `main` (ex: pendant une période de gel). Pour tester le déploiement avant :

```bash
sudo bash /opt/crm-mdo/scripts/update-all-clients.sh --dry-run
```

## Backup & restore

### Backup local automatique

Configuré par `install-ubuntu.sh` à 3h chaque nuit. Backup distinct par instance (chaque stack a son propre cron).

Les fichiers vont dans `/var/backups/crm-<slug>/` (rétention 30j).

### Backup off-site chiffré (recommandé pour collectivités)

Copier `/etc/crm-<slug>/backup.env.example` en `backup.env`, configurer un repo restic (B2, S3, SFTP), puis :

```bash
sudo -E restic init
```

Le cron quotidien (4h) prend le relais. Le `forget --prune` n'est pas automatisé : à lancer mensuellement depuis un poste de confiance pour protéger contre un scénario ransomware sur le serveur.

### Restore

```bash
sudo bash /opt/crm-<slug>/scripts/restore.sh /var/backups/crm-<slug>/crm_seysses_20260615_030000.sql.gz
```

## Versionning & livraison

Le repo utilise des **tags sémver** pour figer les livraisons :

```bash
# Côté MDO : tagger une version stable testée
cd /opt/crm-mdo
git tag -a v1.5.0 -m "Release 1.5.0 — copilote IA + GED + portail enrichi"
git push --tags

# Côté instance client : déployer cette version
sudo bash scripts/update-all-clients.sh --instance crm-seysses --ref v1.5.0
```

Stratégie recommandée :
- **MDO Services prod** : suit `main` (early adopter sur tes propres données)
- **Clients DSI** : suivent les tags `v*.*.*` après validation MDO

## Suppression d'une instance

```bash
cd /opt/crm-<slug>
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
cd /
sudo rm -rf /opt/crm-<slug> /var/backups/crm-<slug> /etc/crm-<slug>
```

⚠️ Le `-v` détruit les volumes Docker (BDD + redis). **Backup avant**.

## Sécurité spécifique multi-instance

- Chaque instance a son **JWT_SECRET / SECRETS_MASTER_KEY uniques** (générés au provisioning). Aucun partage de session entre instances.
- Les conteneurs sont nommés avec `COMPOSE_PROJECT_NAME=crm_<slug>` pour éviter toute collision réseau Docker.
- Le `BRAND_INSTANCE_TYPE=CLIENT` est positionné automatiquement (vs `MDO` sur l'instance interne) — réservé pour de futurs comportements différenciés (ex: désactiver l'admin features réservées MDO).

## Checklist livraison nouveau client

- [ ] DNS configuré et propagé
- [ ] `provision-client.sh` exécuté avec succès
- [ ] Logo client placé
- [ ] SMTP testé (envoyer un ticket d'essai)
- [ ] Compte admin créé + 2FA activée (recommandé pour collectivité)
- [ ] Backup off-site configuré + 1ère sauvegarde restic vérifiée
- [ ] Email DPO renseigné et page `/portal/subprocessors` validée par le DPO client
- [ ] Tag Git posé et instance fixée dessus (`--ref v1.X.Y`)
- [ ] Documentation de l'URL + identifiants admin transmise au client par canal sécurisé

## TODO architecture future

- **Caddy partagé multi-instance sur 1 VPS** : générer un `Caddyfile.global` avec `import /etc/caddy/sites/*.caddy`, créer un réseau Docker externe `crm-public`, et faire que `provision-client.sh` produise un site Caddy par instance + connecte les conteneurs au réseau partagé. À déclencher quand on aura besoin de consolider ≥ 3 clients sur un même VPS.
- **Endpoint admin "instances dashboard"** : vue liste des instances déployées sur le VPS hôte, statut healthcheck, version Git de chacune, taille BDD. Utile quand le parc grossit.
- **CI/CD release tag → notification** : webhook Slack/email vers Mathieu quand un nouveau tag est posé, pour décider du rollout planifié.

