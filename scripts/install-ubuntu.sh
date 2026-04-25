#!/usr/bin/env bash
# =============================================================================
# CRM MDO Services - Installation automatisee Ubuntu 24.04
# =============================================================================
# Usage :
#   sudo bash install-ubuntu.sh
# Ce script doit etre lance en root (ou avec sudo) sur une Ubuntu 24.04 fraiche.
# =============================================================================

set -euo pipefail

# ----- Configuration (peut etre surchargee en env avant lancement) -----------
DOMAIN="${DOMAIN:-crm.mdoservices.fr}"
ACME_EMAIL="${ACME_EMAIL:-mathieu@mdoservices.fr}"
INSTALL_DIR="${INSTALL_DIR:-/opt/crm-mdo}"
REPO_URL="${REPO_URL:-}"
TZ_NAME="${TZ_NAME:-Europe/Paris}"
TARGET_USER="${TARGET_USER:-crm}"

# ----- Couleurs --------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

# ----- Pre-requis ------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  err "Ce script doit etre execute en root (sudo bash $0)"
  exit 1
fi

source /etc/os-release
if [[ "${VERSION_ID}" != "24.04" ]]; then
  warn "Ce script est concu pour Ubuntu 24.04. Version detectee : ${VERSION_ID}"
  read -rp "Continuer quand meme ? (o/N) " ans
  [[ "$ans" =~ ^[oO]$ ]] || exit 1
fi

log "Installation CRM MDO Services sur ${DOMAIN}"
log "Repertoire cible : ${INSTALL_DIR}"

# ----- Maj systeme -----------------------------------------------------------
log "Mise a jour des paquets..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ca-certificates gnupg lsb-release \
  ufw fail2ban htop unzip jq openssl dnsutils cron
ok "Systeme a jour"

# ----- Timezone --------------------------------------------------------------
timedatectl set-timezone "${TZ_NAME}"
ok "Timezone : $(timedatectl show -p Timezone --value)"

# ----- Utilisateur dedie -----------------------------------------------------
if ! id -u "${TARGET_USER}" >/dev/null 2>&1; then
  log "Creation utilisateur systeme ${TARGET_USER}"
  useradd -m -s /bin/bash "${TARGET_USER}"
fi

# ----- Docker ----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installation Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  usermod -aG docker "${TARGET_USER}"
  systemctl enable --now docker
  ok "Docker installe : $(docker --version)"
else
  ok "Docker deja installe : $(docker --version)"
fi

# ----- UFW -------------------------------------------------------------------
log "Configuration du firewall UFW..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP (Caddy)"
ufw allow 443/tcp comment "HTTPS (Caddy)"
ufw allow 443/udp comment "HTTP/3 (Caddy)"
ufw --force enable
ok "UFW actif"

# ----- Fail2ban --------------------------------------------------------------
systemctl enable --now fail2ban
ok "fail2ban actif"

# ----- Clonage / maj du repo -------------------------------------------------
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  log "Maj du repo existant..."
  git -C "${INSTALL_DIR}" pull --ff-only
elif [[ -n "${REPO_URL}" ]]; then
  log "Clonage du repo ${REPO_URL}..."
  git clone "${REPO_URL}" "${INSTALL_DIR}"
else
  if [[ ! -d "${INSTALL_DIR}" ]]; then
    err "Pas de REPO_URL fourni et ${INSTALL_DIR} n'existe pas."
    err "Fournissez le depot via : REPO_URL=... sudo bash $0"
    err "Ou copiez les sources manuellement dans ${INSTALL_DIR} avant de relancer."
    exit 1
  fi
  warn "Utilisation des sources existantes dans ${INSTALL_DIR}"
fi
chown -R "${TARGET_USER}:${TARGET_USER}" "${INSTALL_DIR}"

# ----- Generation du .env ----------------------------------------------------
ENV_FILE="${INSTALL_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  log "Generation de ${ENV_FILE} avec mots de passe aleatoires..."
  PG_PASS=$(openssl rand -hex 24)
  REDIS_PASS=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 48)
  JWT_REFRESH=$(openssl rand -hex 48)

  cat > "${ENV_FILE}" <<ENVFILE_EOF
# --- Domaines ---
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

# --- PostgreSQL ---
POSTGRES_DB=crm_mdo
POSTGRES_USER=crm_mdo
POSTGRES_PASSWORD=${PG_PASS}
DATABASE_URL=postgresql://crm_mdo:${PG_PASS}@postgres:5432/crm_mdo?schema=public

# --- Redis ---
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASS}

# --- Backend ---
NODE_ENV=production
BACKEND_PORT=4000
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://${DOMAIN}
CONTRACT_ALERT_DAYS=90,60,30,7

# --- Frontend ---
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api

# --- SMTP sortant (a completer manuellement plus tard dans ${ENV_FILE}) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="CRM MDO Services <no-reply@mdoservices.fr>"
SMTP_SECURE=false

# --- IMAP entrant : creation de tickets depuis support@mdoservices.fr ---
# Mettre a true et completer IMAP_* pour activer.
# Office 365 : IMAP_HOST=outlook.office365.com (SMTP_HOST=smtp.office365.com, port 587, SECURE=false).
INBOUND_EMAIL_ENABLED=false
INBOUND_AUTO_ACK=true
MAX_UPLOAD_SIZE_MB=25

# --- Lookup annuaire entreprises (Pappers / INSEE Sirene) ---
# Au moins une cle pour activer la recherche d'entreprises sur le formulaire de creation.
PAPPERS_API_KEY=
SIRENE_API_KEY=
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASSWORD=
IMAP_FOLDER=INBOX
IMAP_PROCESSED_FOLDER=Processed

# --- Timezone ---
TZ=${TZ_NAME}
ENVFILE_EOF
  chmod 600 "${ENV_FILE}"
  chown "${TARGET_USER}:${TARGET_USER}" "${ENV_FILE}"
  ok ".env genere"
else
  ok ".env existant conserve"
fi

# ----- Check DNS -------------------------------------------------------------
log "Verification du DNS pour ${DOMAIN}..."
SERVER_IP=$(curl -fsS https://ifconfig.me || true)
RESOLVED_IP=$(dig +short "${DOMAIN}" | tail -n1 || true)
if [[ -n "${RESOLVED_IP}" && "${RESOLVED_IP}" == "${SERVER_IP}" ]]; then
  ok "${DOMAIN} pointe bien vers ce serveur (${SERVER_IP})"
else
  warn "${DOMAIN} resout vers '${RESOLVED_IP:-rien}' mais ce serveur est '${SERVER_IP:-inconnu}'"
  warn "Assurez-vous que le DNS est a jour avant que Let's Encrypt ne tente de delivrer le certificat"
  read -rp "Continuer quand meme ? (o/N) " ans
  [[ "$ans" =~ ^[oO]$ ]] || exit 1
fi

# ----- Build et demarrage ----------------------------------------------------
cd "${INSTALL_DIR}"
log "Build des images Docker (cela peut prendre quelques minutes)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

log "Demarrage de la stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ok "Stack demarree"

# ----- Attente que le backend soit pret --------------------------------------
log "Attente que le backend soit pret..."
for i in {1..60}; do
  if docker compose exec -T backend node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" 2>/dev/null; then
    ok "Backend pret"
    break
  fi
  sleep 3
  [[ $i -eq 60 ]] && { err "Backend n'a pas repondu a temps. Voir: docker compose logs backend"; exit 1; }
done

# ----- Creation du 1er admin (interactif) ------------------------------------
log "Creation du compte administrateur (interactif)..."
echo
read -rp "Email admin [mathieu@mdoservices.fr] : " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-mathieu@mdoservices.fr}"
read -rp "Prenom : " ADMIN_FIRST
read -rp "Nom : " ADMIN_LAST
while :; do
  read -rsp "Mot de passe (>= 8 caracteres) : " ADMIN_PASS
  echo
  [[ ${#ADMIN_PASS} -ge 8 ]] && break
  warn "Mot de passe trop court"
done

docker compose exec -T \
  -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -e ADMIN_PASSWORD="${ADMIN_PASS}" \
  -e ADMIN_FIRST="${ADMIN_FIRST}" \
  -e ADMIN_LAST="${ADMIN_LAST}" \
  backend npm run seed:admin

ok "Compte admin cree"

# ----- Backup quotidien via cron ---------------------------------------------
log "Configuration du backup quotidien..."
BACKUP_SCRIPT="${INSTALL_DIR}/scripts/backup.sh"
BACKUP_DIR="/var/backups/crm-mdo"
mkdir -p "${BACKUP_DIR}"
chown "${TARGET_USER}:${TARGET_USER}" "${BACKUP_DIR}"

cat > /etc/cron.d/crm-mdo-backup <<CRON_EOF
# Backup quotidien CRM MDO Services a 03h00
0 3 * * * ${TARGET_USER} cd ${INSTALL_DIR} && ${BACKUP_SCRIPT} ${BACKUP_DIR} >> /var/log/crm-mdo-backup.log 2>&1
CRON_EOF
chmod 644 /etc/cron.d/crm-mdo-backup
ok "Cron de backup configure (3h00 tous les jours -> ${BACKUP_DIR})"

# ----- Recapitulatif ---------------------------------------------------------
echo
echo "=============================================="
ok "Installation terminee !"
echo "=============================================="
echo
echo "  Application : https://${DOMAIN}"
echo "  API Swagger : (desactive en prod)"
echo "  Admin       : ${ADMIN_EMAIL}"
echo
echo "  Repertoire  : ${INSTALL_DIR}"
echo "  Fichier env : ${ENV_FILE} (contient les secrets - chmod 600)"
echo "  Backups     : ${BACKUP_DIR}"
echo
echo "  Logs stack  : docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "  Restart     : docker compose -f docker-compose.yml -f docker-compose.prod.yml restart"
echo "  Stop        : docker compose -f docker-compose.yml -f docker-compose.prod.yml down"
echo
warn "Pensez a completer les variables SMTP dans ${ENV_FILE} puis a relancer :"
warn "  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo
