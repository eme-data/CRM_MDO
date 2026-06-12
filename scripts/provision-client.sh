#!/usr/bin/env bash
# =============================================================================
# CRM - Provisioning d'une nouvelle instance client (multi-instance)
# =============================================================================
# Usage :
#   sudo bash provision-client.sh \
#     --slug seysses \
#     --domain crm.mairie-seysses.fr \
#     --acme-email contact@mairie-seysses.fr \
#     --brand-name "Mairie de SEYSSES" \
#     --brand-short "Seysses" \
#     --brand-tagline "Service Informatique" \
#     --brand-color "#0066CC"
#
# Cree une stack Docker dediee dans /opt/crm-<slug>/, genere un .env avec
# mots de passe aleatoires + branding personnalise, deploie via Caddy en HTTPS
# automatique, cree le 1er compte admin (interactif).
#
# Pas de partage de BDD ni de Redis avec d'autres instances : chaque client a
# sa stack complete (modele multi-instance, cf project_revente_dsi_strategy).
# =============================================================================

set -euo pipefail

# ----- Defauts (override via flags) -----
SLUG=""
DOMAIN=""
ACME_EMAIL=""
BRAND_NAME=""
BRAND_SHORT_NAME=""
BRAND_TAGLINE=""
BRAND_PRIMARY_COLOR="#1d4ed8"
BRAND_SUPPORT_EMAIL=""
BRAND_DPO_EMAIL=""
BRAND_WEBSITE_URL=""
REPO_URL="${REPO_URL:-https://github.com/eme-data/CRM_MDO.git}"
GIT_REF="${GIT_REF:-main}"
INSTALL_BASE="${INSTALL_BASE:-/opt}"
TZ_NAME="${TZ_NAME:-Europe/Paris}"

# ----- Couleurs -----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

usage() {
  cat <<EOF
Usage: sudo bash $0 --slug X --domain X --acme-email X --brand-name X [options]

Required:
  --slug <slug>             Identifiant court (ex: "seysses"). Sert au repertoire,
                            au nom des conteneurs Docker et a l'isolation reseau.
  --domain <fqdn>           Domaine HTTPS (ex: crm.mairie-seysses.fr). DNS doit
                            deja pointer vers ce serveur (verifie au demarrage).
  --acme-email <email>      Email Let's Encrypt (notifs expiration cert).
  --brand-name <name>       Nom complet affichage (ex: "Mairie de SEYSSES").

Options:
  --brand-short <name>      Nom court (defaut: deduit de --brand-name).
  --brand-tagline <text>    Sous-titre / accroche (defaut: vide).
  --brand-color <hex>       Couleur primaire (defaut: #1d4ed8).
  --brand-support <email>   Email support (defaut: support@<domain>).
  --brand-dpo <email>       Email DPO RGPD (defaut: dpo@<domain>).
  --brand-website <url>     Site web public (defaut: https://<domain root>).
  --repo <url>              URL du repo Git (defaut: \$REPO_URL).
  --ref <branch|tag>        Branche/tag Git a deployer (defaut: main).

Variables d'env :
  REPO_URL, GIT_REF, INSTALL_BASE (defaut /opt), TZ_NAME (defaut Europe/Paris)
EOF
}

# ----- Parse args -----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)            SLUG="$2"; shift 2;;
    --domain)          DOMAIN="$2"; shift 2;;
    --acme-email)      ACME_EMAIL="$2"; shift 2;;
    --brand-name)      BRAND_NAME="$2"; shift 2;;
    --brand-short)     BRAND_SHORT_NAME="$2"; shift 2;;
    --brand-tagline)   BRAND_TAGLINE="$2"; shift 2;;
    --brand-color)     BRAND_PRIMARY_COLOR="$2"; shift 2;;
    --brand-support)   BRAND_SUPPORT_EMAIL="$2"; shift 2;;
    --brand-dpo)       BRAND_DPO_EMAIL="$2"; shift 2;;
    --brand-website)   BRAND_WEBSITE_URL="$2"; shift 2;;
    --repo)            REPO_URL="$2"; shift 2;;
    --ref)             GIT_REF="$2"; shift 2;;
    -h|--help)         usage; exit 0;;
    *) err "Argument inconnu : $1"; usage; exit 1;;
  esac
done

# ----- Validation -----
[[ -z "$SLUG" ]]        && { err "--slug requis"; usage; exit 1; }
[[ -z "$DOMAIN" ]]      && { err "--domain requis"; usage; exit 1; }
[[ -z "$ACME_EMAIL" ]]  && { err "--acme-email requis"; usage; exit 1; }
[[ -z "$BRAND_NAME" ]]  && { err "--brand-name requis"; usage; exit 1; }

if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then
  err "--slug doit etre lowercase, 2-30 caracteres, [a-z0-9-]"
  exit 1
fi
if [[ ! "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  err "--domain ne ressemble pas a un FQDN valide"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  err "Lancer en root (sudo bash $0 ...)"
  exit 1
fi

# Defauts deductibles depuis les args fournis
[[ -z "$BRAND_SHORT_NAME" ]]    && BRAND_SHORT_NAME="$BRAND_NAME"
DOMAIN_ROOT="${DOMAIN#crm.}"
[[ -z "$BRAND_SUPPORT_EMAIL" ]] && BRAND_SUPPORT_EMAIL="support@${DOMAIN_ROOT}"
[[ -z "$BRAND_DPO_EMAIL" ]]     && BRAND_DPO_EMAIL="dpo@${DOMAIN_ROOT}"
[[ -z "$BRAND_WEBSITE_URL" ]]   && BRAND_WEBSITE_URL="https://${DOMAIN_ROOT}"

INSTALL_DIR="${INSTALL_BASE}/crm-${SLUG}"
PROJECT_NAME="crm_${SLUG//-/_}"

log "============================================================"
log "Provisioning instance CRM client"
log "============================================================"
log "Slug          : ${SLUG}"
log "Domaine       : ${DOMAIN}"
log "Branding      : ${BRAND_NAME} (${BRAND_SHORT_NAME})"
log "Repertoire    : ${INSTALL_DIR}"
log "Project Docker: ${PROJECT_NAME}"
log "Repo / ref    : ${REPO_URL} @ ${GIT_REF}"
log "============================================================"

# ----- Pre-requis systeme -----
for cmd in docker git curl openssl dig; do
  command -v "$cmd" >/dev/null 2>&1 || { err "$cmd manquant. Lancer install-ubuntu.sh d'abord."; exit 1; }
done

if ! docker compose version >/dev/null 2>&1; then
  err "docker compose v2 manquant"
  exit 1
fi

# ----- Verif DNS -----
log "Verification DNS de ${DOMAIN}..."
SERVER_IP=$(curl -s -4 ifconfig.me || true)
RESOLVED_IP=$(dig +short "${DOMAIN}" A @1.1.1.1 | tail -n1 || true)
if [[ -z "$RESOLVED_IP" ]]; then
  warn "Aucune resolution A pour ${DOMAIN}. Caddy ne pourra pas obtenir un cert HTTPS."
  warn "Configurez le DNS avant de continuer (A record ${DOMAIN} -> ${SERVER_IP:-IP_SERVEUR})"
elif [[ "$RESOLVED_IP" != "$SERVER_IP" ]]; then
  warn "${DOMAIN} resout vers ${RESOLVED_IP} (≠ ${SERVER_IP:-IP_SERVEUR}). Verifiez le DNS."
else
  ok "DNS OK : ${DOMAIN} -> ${RESOLVED_IP}"
fi

# ----- Existant ? -----
if [[ -d "${INSTALL_DIR}" ]]; then
  err "${INSTALL_DIR} existe deja. Pour mettre a jour, utilisez update-all-clients.sh."
  exit 1
fi

# Conflit de nom de projet Docker (collision conteneurs)
if docker ps -a --filter "name=${PROJECT_NAME}_" --format '{{.Names}}' | grep -q .; then
  err "Conteneurs ${PROJECT_NAME}_* existent deja. Slug en conflit ?"
  exit 1
fi

# ----- Clone du repo -----
log "Clone du repo dans ${INSTALL_DIR}..."
git clone --branch "${GIT_REF}" --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
ok "Repo clone (${GIT_REF})"

# ----- Generation .env -----
log "Generation du .env..."
gen_secret() { openssl rand -hex 32; }
gen_pwd()    { openssl rand -base64 32 | tr -d '/+=' | cut -c1-24; }

ENV_FILE="${INSTALL_DIR}/.env"
cat > "${ENV_FILE}" <<ENVEOF
# Genere automatiquement par provision-client.sh le $(date -Iseconds)
# Instance : ${BRAND_NAME} (${SLUG})

# -------- Domaines --------
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

# -------- Branding --------
BRAND_NAME="${BRAND_NAME}"
BRAND_SHORT_NAME="${BRAND_SHORT_NAME}"
BRAND_TAGLINE="${BRAND_TAGLINE}"
BRAND_SUPPORT_EMAIL=${BRAND_SUPPORT_EMAIL}
BRAND_DPO_EMAIL=${BRAND_DPO_EMAIL}
BRAND_WEBSITE_URL=${BRAND_WEBSITE_URL}
BRAND_LOGO_URL=/logo.png
BRAND_PRIMARY_COLOR=${BRAND_PRIMARY_COLOR}
BRAND_FOOTER_TEXT="${BRAND_NAME} - ${BRAND_TAGLINE}"
BRAND_INSTANCE_TYPE=CLIENT

# -------- PostgreSQL --------
POSTGRES_DB=crm_${SLUG//-/_}
POSTGRES_USER=crm_${SLUG//-/_}
POSTGRES_PASSWORD=$(gen_pwd)
DATABASE_URL=postgresql://crm_${SLUG//-/_}:\${POSTGRES_PASSWORD}@postgres:5432/crm_${SLUG//-/_}?schema=public

# -------- Redis --------
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$(gen_pwd)

# -------- Backend --------
NODE_ENV=production
BACKEND_PORT=4000
JWT_SECRET=$(gen_secret)
JWT_REFRESH_SECRET=$(gen_secret)
SECRETS_MASTER_KEY=$(gen_secret)
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://${DOMAIN}

CONTRACT_ALERT_DAYS=90,60,30,7

# -------- Frontend --------
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api

# -------- SMTP (a configurer apres install) --------
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="${BRAND_NAME} <no-reply@${DOMAIN_ROOT}>"
SMTP_SECURE=false

# -------- IMAP entrant (optionnel, desactive par defaut) --------
INBOUND_EMAIL_ENABLED=false
INBOUND_AUTO_ACK=true
MAX_UPLOAD_SIZE_MB=25
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASSWORD=
IMAP_FOLDER=INBOX
IMAP_PROCESSED_FOLDER=

# -------- Lookup annuaire entreprises (gratuit via API gouv ; cle INSEE optionnelle) --------
SIRENE_API_KEY=

# -------- Securite --------
MFA_REQUIRED_ROLES=ADMIN,MANAGER
PASSWORD_MIN_LENGTH=12
LOG_LEVEL=info

TZ=${TZ_NAME}
ENVEOF
chmod 600 "${ENV_FILE}"
ok ".env genere (chmod 600)"

# ----- Patch docker-compose pour project name unique -----
# Sans ca, 2 instances sur la meme machine = collision de noms de conteneurs.
# Docker Compose utilise le nom du repertoire par defaut, mais on force via
# COMPOSE_PROJECT_NAME pour etre explicite et eviter les surprises.
echo "COMPOSE_PROJECT_NAME=${PROJECT_NAME}" >> "${ENV_FILE}"

# ----- Build + start -----
log "Build des images Docker (5-10 min) ..."
cd "${INSTALL_DIR}"
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
ok "Images construites"

log "Demarrage des conteneurs..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ok "Stack demarree"

# ----- Healthcheck -----
log "Attente disponibilite backend (max 60s)..."
for i in {1..30}; do
  if docker compose exec -T backend wget -qO- http://localhost:4000/health >/dev/null 2>&1; then
    ok "Backend OK"
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    err "Backend ne demarre pas. Voir : docker compose -p ${PROJECT_NAME} logs backend"
    exit 1
  fi
done

# ----- Compte admin initial -----
log "Creation du compte administrateur initial..."
log "Repondez aux questions (email + mot de passe >= 12 char, 3 classes min)"
docker compose exec backend npm run seed:admin

# ----- Resume -----
ok "============================================================"
ok "Instance ${BRAND_NAME} provisionnee avec succes"
ok "============================================================"
ok "URL    : https://${DOMAIN}"
ok "Dir    : ${INSTALL_DIR}"
ok "Project: ${PROJECT_NAME}"
ok ""
ok "Prochaines etapes :"
ok "  1. Configurer SMTP : editer ${ENV_FILE} (SMTP_HOST/USER/PASSWORD/FROM)"
ok "     puis : cd ${INSTALL_DIR} && docker compose restart backend"
ok "  2. Activer la 2FA sur le compte admin (recommande pour collectivite)"
ok "  3. Personnaliser le logo : remplacer ${INSTALL_DIR}/frontend/public/logo.png"
ok "     puis : docker compose restart frontend"
ok "  4. Tester /api/branding et la page de login pour valider le branding"
ok ""
ok "Backups : configurer /etc/crm-${SLUG}/backup.env si backup off-site souhaite"
ok "============================================================"
