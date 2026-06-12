#!/usr/bin/env bash
# =============================================================================
# CRM MDO Services - Installation automatisee Ubuntu 22.04 / 24.04 / Debian 12
# =============================================================================
# Usage :
#   sudo bash install-ubuntu.sh                        # install neuve
#   sudo bash install-ubuntu.sh --upgrade              # maj sur installation existante
#   sudo bash install-ubuntu.sh --restore-from=PATH    # restauration depuis archive migrate-export.sh
#
# Variables d'env utiles :
#   DOMAIN, ACME_EMAIL, INSTALL_DIR, REPO_URL, TZ_NAME, TARGET_USER
#   ASSUME_YES=1            : aucune question interactive (CI / scripting)
#   SKIP_CROWDSEC=1         : pas de CrowdSec (VPS <2 Go RAM)
#   SKIP_SSH_HARDENING=1    : ne pas modifier sshd_config (geree par Ansible/etc)
#   MIGRATION_PASSWORD      : mot de passe de dechiffrement si l'archive est .enc
# =============================================================================

set -euo pipefail

# ----- Mode / arguments ------------------------------------------------------
MODE="install"
RESTORE_FROM=""

for arg in "$@"; do
  case "$arg" in
    --upgrade)             MODE="upgrade" ;;
    --restore-from=*)      MODE="restore"; RESTORE_FROM="${arg#*=}" ;;
    --help|-h)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) echo "Argument inconnu : $arg (utilisez --help)"; exit 1 ;;
  esac
done

# ----- Configuration ---------------------------------------------------------
DOMAIN="${DOMAIN:-crm.mdoservices.fr}"
ACME_EMAIL="${ACME_EMAIL:-mathieu@mdoservices.fr}"
INSTALL_DIR="${INSTALL_DIR:-/opt/crm-mdo}"
REPO_URL="${REPO_URL:-}"
TZ_NAME="${TZ_NAME:-Europe/Paris}"
TARGET_USER="${TARGET_USER:-crm}"

# Seuils pre-flight (recommandes pour CRM de prod)
MIN_RAM_MB=2000
MIN_DISK_GB=15

# ----- Couleurs --------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

confirm() {
  # confirm "Question ?" → 0 si oui, 1 si non. Bypass si ASSUME_YES=1.
  local prompt="$1"
  if [[ "${ASSUME_YES:-0}" == "1" ]]; then
    return 0
  fi
  read -rp "${prompt} (o/N) " ans
  [[ "$ans" =~ ^[oO]$ ]]
}

# ----- Pre-requis root + OS ---------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  err "Ce script doit etre execute en root (sudo bash $0)"
  exit 1
fi

source /etc/os-release
SUPPORTED=("ubuntu:22.04" "ubuntu:24.04" "debian:12")
CURRENT="${ID}:${VERSION_ID}"
if [[ ! " ${SUPPORTED[*]} " =~ " ${CURRENT} " ]]; then
  warn "Ce script est teste pour : ${SUPPORTED[*]}. Detecte : ${CURRENT}"
  confirm "Continuer quand meme ?" || exit 1
fi

# =============================================================================
# Pre-flight checks
# =============================================================================
log "Pre-flight checks..."

# RAM
RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ ${RAM_MB} -lt ${MIN_RAM_MB} ]]; then
  warn "RAM detectee : ${RAM_MB} Mo (recommande : ${MIN_RAM_MB} Mo minimum)"
  warn "CrowdSec + Postgres + Backend Node consomment ~1.5 Go en idle."
  confirm "Continuer quand meme ?" || exit 1
else
  ok "RAM : ${RAM_MB} Mo (>= ${MIN_RAM_MB})"
fi

# Disque
DISK_GB=$(df -BG --output=avail / | tail -n1 | tr -dc '0-9')
if [[ ${DISK_GB} -lt ${MIN_DISK_GB} ]]; then
  warn "Espace disque libre sur / : ${DISK_GB} Go (recommande : ${MIN_DISK_GB} Go minimum)"
  warn "Backups + uploads + images Docker peuvent atteindre 10 Go sur 1 an."
  confirm "Continuer quand meme ?" || exit 1
else
  ok "Disque libre : ${DISK_GB} Go (>= ${MIN_DISK_GB})"
fi

# Ports 80 / 443 libres (sauf si Caddy deja en place dans une install existante)
for port in 80 443; do
  if ss -tlnH "sport = :${port}" 2>/dev/null | grep -q LISTEN; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q crm_mdo_caddy; then
      ok "Port ${port} : utilise par notre Caddy (OK)"
    else
      err "Port ${port} deja utilise par un autre process. Arretez-le avant d'installer."
      err "  → ss -tlnp 'sport = :${port}'"
      exit 1
    fi
  else
    ok "Port ${port} libre"
  fi
done

# Connectivite sortante (Docker Hub + Let's Encrypt + GitHub)
log "Test connectivite sortante..."
for host in registry-1.docker.io github.com acme-v02.api.letsencrypt.org; do
  code=$(curl -fsS --max-time 5 -o /dev/null -w "%{http_code}" "https://${host}" 2>/dev/null || echo "")
  if [[ "${code}" =~ ^(200|301|302|401|403|404)$ ]]; then
    ok "  ${host} OK (HTTP ${code})"
  else
    warn "  ${host} : pas de reponse (firewall sortant ?). L'install peut echouer."
  fi
done

# =============================================================================
# Mode RESTORE : valider l'archive AVANT toute action destructive
# =============================================================================
RESTORE_TARBALL=""
if [[ "${MODE}" == "restore" ]]; then
  log "Mode RESTORE depuis : ${RESTORE_FROM}"
  if [[ ! -f "${RESTORE_FROM}" ]]; then
    err "Archive introuvable : ${RESTORE_FROM}"
    exit 1
  fi

  # Dechiffrement si .enc
  RESTORE_TARBALL="${RESTORE_FROM}"
  if [[ "${RESTORE_FROM}" =~ \.enc$ ]]; then
    if [[ -z "${MIGRATION_PASSWORD:-}" ]]; then
      err "Archive chiffree (.enc) : MIGRATION_PASSWORD doit etre defini en env"
      err "  → sudo MIGRATION_PASSWORD='...' bash $0 --restore-from=${RESTORE_FROM}"
      exit 1
    fi
    RESTORE_TARBALL="/tmp/crm-mdo-restore-decrypted.tar.gz"
    log "Dechiffrement..."
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
      -in "${RESTORE_FROM}" -out "${RESTORE_TARBALL}" \
      -pass "env:MIGRATION_PASSWORD"
    chmod 600 "${RESTORE_TARBALL}"
    ok "Archive dechiffree -> ${RESTORE_TARBALL}"
  fi

  # Validation contenu attendu
  log "Verification du contenu de l'archive..."
  ARCHIVE_FILES=$(tar -tzf "${RESTORE_TARBALL}" | sort)
  for required in dotenv manifest.json database.sql.gz; do
    if ! echo "${ARCHIVE_FILES}" | grep -qE "^\.?/?${required}$"; then
      err "Fichier manquant dans l'archive : ${required}"
      exit 1
    fi
  done
  ok "Archive valide (dotenv + database.sql.gz + manifest.json presents)"
fi

# =============================================================================
# Maj systeme + paquets de base
# =============================================================================
log "Mise a jour des paquets..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ca-certificates gnupg lsb-release \
  ufw htop unzip jq openssl dnsutils cron restic \
  unattended-upgrades apt-listchanges
ok "Systeme a jour"

# Auto-updates de securite
log "Configuration des auto-updates de securite..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/51unattended-upgrades-crm <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Mail "";
EOF
ok "Unattended-upgrades actif (reboot auto a 04h00 si requis)"

# ----- Timezone --------------------------------------------------------------
timedatectl set-timezone "${TZ_NAME}"
ok "Timezone : $(timedatectl show -p Timezone --value)"

# ----- Utilisateur dedie -----------------------------------------------------
if ! id -u "${TARGET_USER}" >/dev/null 2>&1; then
  log "Creation utilisateur systeme ${TARGET_USER}"
  useradd -m -s /bin/bash "${TARGET_USER}"
fi

# =============================================================================
# Docker CE + plugin Compose
# =============================================================================
if ! command -v docker >/dev/null 2>&1; then
  log "Installation Docker..."
  install -m 0755 -d /etc/apt/keyrings
  DOCKER_VENDOR="${ID}"
  [[ "${ID_LIKE:-}" =~ ubuntu ]] && DOCKER_VENDOR=ubuntu
  curl -fsSL "https://download.docker.com/linux/${DOCKER_VENDOR}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_VENDOR} $(. /etc/os-release; echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  usermod -aG docker "${TARGET_USER}"
  systemctl enable --now docker
  ok "Docker installe : $(docker --version)"
else
  ok "Docker deja installe : $(docker --version)"
fi

# =============================================================================
# UFW + Hardening SSH
# =============================================================================
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

# SSH hardening : verifie qu'il y a au moins une cle SSH AVANT de couper le
# login par password — sinon tu te lockes hors du serveur.
if [[ "${SKIP_SSH_HARDENING:-0}" == "1" ]]; then
  warn "SKIP_SSH_HARDENING=1 : configuration SSH non modifiee"
else
  HAS_KEY=0
  for u in root "${SUDO_USER:-}" "${TARGET_USER}"; do
    [[ -z "$u" ]] && continue
    home=$(getent passwd "$u" 2>/dev/null | cut -d: -f6)
    if [[ -n "$home" && -s "$home/.ssh/authorized_keys" ]]; then
      HAS_KEY=1
      ok "Cle SSH detectee pour ${u}"
    fi
  done

  if [[ ${HAS_KEY} -eq 1 ]]; then
    log "Hardening SSH (PermitRootLogin prohibit-password, PasswordAuthentication no)..."
    SSHD_CONFIG=/etc/ssh/sshd_config.d/99-crm-mdo-hardening.conf
    cat > "${SSHD_CONFIG}" <<'EOF'
# Hardening SSH applique par install-ubuntu.sh
PermitRootLogin prohibit-password
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
    if sshd -t 2>/dev/null; then
      systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
      ok "SSH hardening applique"
    else
      warn "sshd config invalide, revert"
      rm -f "${SSHD_CONFIG}"
    fi
  else
    warn "Aucune cle SSH detectee : SSH hardening SAUTE (sinon risque de lockout)"
    warn "Pour activer plus tard : ajoutez votre cle dans ~/.ssh/authorized_keys puis relancez avec --upgrade"
  fi
fi

# =============================================================================
# CrowdSec (optionnel)
# =============================================================================
if [[ "${SKIP_CROWDSEC:-0}" == "1" ]]; then
  warn "SKIP_CROWDSEC=1 : CrowdSec non installe (recommande sur VPS <2 Go RAM)"
elif ! command -v cscli >/dev/null 2>&1; then
  log "Installation CrowdSec..."
  curl -fsSL https://install.crowdsec.net | bash
  apt-get install -y -qq crowdsec
  apt-get install -y -qq crowdsec-firewall-bouncer-iptables
  cscli collections install crowdsecurity/sshd >/dev/null 2>&1 || true
  cscli collections install crowdsecurity/base-http-scenarios >/dev/null 2>&1 || true
  cscli collections install crowdsecurity/caddy >/dev/null 2>&1 || true
  cscli collections install crowdsecurity/linux >/dev/null 2>&1 || true
  systemctl enable --now crowdsec
  systemctl enable --now crowdsec-firewall-bouncer
  ok "CrowdSec actif (sshd + http + caddy)"
else
  ok "CrowdSec deja installe : $(cscli version | head -n1)"
fi

# =============================================================================
# Clonage / maj du repo
# =============================================================================
# Git 2.35.2+ refuse les operations cross-user (ownership "dubious"). Notre
# repo est chown sur ${TARGET_USER} mais le script tourne en root → on
# whitelist explicitement le dir pour root.
git config --global --add safe.directory "${INSTALL_DIR}" 2>/dev/null || true

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  if [[ "${MODE}" == "upgrade" ]]; then
    log "Mode UPGRADE : git pull + rebuild..."
    git -C "${INSTALL_DIR}" pull --ff-only
  else
    ok "Repo deja present dans ${INSTALL_DIR}"
  fi
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

# docker/postgres/init.sql est bind-monte en lecture seule dans le conteneur
# Postgres et lu par l'utilisateur postgres (uid 70), different du proprietaire
# du repo. Selon l'umask du clone, il peut etre en 600/700 → "Permission denied"
# a l'init, et les extensions (uuid-ossp/pgcrypto/citext) ne sont jamais creees
# (incident deploy 2026-06). On garantit la lisibilite, independamment de l'umask.
if [[ -f "${INSTALL_DIR}/docker/postgres/init.sql" ]]; then
  chmod a+rx "${INSTALL_DIR}/docker" "${INSTALL_DIR}/docker/postgres" 2>/dev/null || true
  chmod a+r  "${INSTALL_DIR}/docker/postgres/init.sql" 2>/dev/null || true
fi

# =============================================================================
# Restore mode : extraire l'archive et utiliser SON .env
# =============================================================================
RESTORE_TMP=""
if [[ "${MODE}" == "restore" ]]; then
  log "Extraction de l'archive de migration..."
  RESTORE_TMP=$(mktemp -d -t crm-mdo-restore-XXXXXX)
  tar -xzf "${RESTORE_TARBALL}" -C "${RESTORE_TMP}"
  ok "Archive extraite"

  # Verification checksums via jq
  log "Verification des checksums..."
  if command -v jq >/dev/null 2>&1; then
    while IFS= read -r line; do
      expected=$(echo "$line" | awk '{print $1}')
      file=$(echo "$line" | awk '{print $2}')
      actual=$(sha256sum "${RESTORE_TMP}/${file}" | awk '{print $1}')
      if [[ "${actual}" != "${expected}" ]]; then
        err "Checksum invalide pour ${file} : attendu ${expected}, calcul ${actual}"
        exit 1
      fi
    done < <(jq -r '.checksums | to_entries[] | "\(.value)  \(.key)"' "${RESTORE_TMP}/manifest.json")
    ok "Tous les checksums OK"
  else
    warn "jq non installe : checksums non verifies"
  fi

  # Installe le .env restaure (les secrets sont identiques a l'ancien serveur,
  # critiquement SECRETS_MASTER_KEY pour dechiffrer les SecretEntry).
  cp "${RESTORE_TMP}/dotenv" "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
  chown "${TARGET_USER}:${TARGET_USER}" "${INSTALL_DIR}/.env"
  ok ".env restaure (secrets identiques a l'ancien serveur)"
fi

# =============================================================================
# Generation / migration du .env
# =============================================================================
ENV_FILE="${INSTALL_DIR}/.env"
if [[ "${MODE}" == "install" && ! -f "${ENV_FILE}" ]]; then
  log "Generation de ${ENV_FILE} avec mots de passe aleatoires..."
  PG_PASS=$(openssl rand -hex 24)
  REDIS_PASS=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 48)
  JWT_REFRESH=$(openssl rand -hex 48)
  SECRETS_KEY=$(openssl rand -hex 48)

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
SECRETS_MASTER_KEY=${SECRETS_KEY}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://${DOMAIN}
CONTRACT_ALERT_DAYS=90,60,30,7

# --- Frontend ---
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api

# --- WebAuthn / Passkeys ---
# RP_ID = domaine racine du frontend. Si tu changes de domaine, les cles
# enregistrees deviennent invalides (lien crypto liee a l'origin).
WEBAUTHN_RP_ID=${DOMAIN}
# RP_NAME quote : contient un espace, sinon `source .env` casse en bash.
WEBAUTHN_RP_NAME="CRM ${DOMAIN}"
WEBAUTHN_ORIGINS=https://${DOMAIN}

# --- Caddy auto-provisioning (multi-tenant DSI) ---
CADDY_PROVISIONING=enabled
CADDY_ADMIN_URL=http://caddy:2019
CADDY_CONFIG_PATH=/etc/caddy/Caddyfile

# --- SMTP sortant (a completer manuellement plus tard) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="CRM MDO Services <no-reply@mdoservices.fr>"
SMTP_SECURE=false

# --- IMAP entrant (creation de tickets depuis support@) ---
INBOUND_EMAIL_ENABLED=false
INBOUND_AUTO_ACK=true
MAX_UPLOAD_SIZE_MB=25
IMAP_HOST=
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=
IMAP_PASSWORD=
IMAP_FOLDER=INBOX
IMAP_PROCESSED_FOLDER=Processed

# --- Lookup annuaire entreprises (gratuit par defaut via API gouv ; cle INSEE optionnelle) ---
SIRENE_API_KEY=

# --- Timezone ---
TZ=${TZ_NAME}
ENVFILE_EOF
  chmod 600 "${ENV_FILE}"
  chown "${TARGET_USER}:${TARGET_USER}" "${ENV_FILE}"
  ok ".env genere"

  # =====================================================================
  # Bootstrap secrets escrow
  # =====================================================================
  # Sans escrow externe de SECRETS_MASTER_KEY, la perte du serveur = perte
  # irreversible des SecretEntry (coffre-fort), des TOTP, et impossibilite
  # de restaurer un backup chiffre. On materialise les secrets critiques
  # dans un fichier accessible uniquement par root pour que l'operateur les
  # transfere en escrow externe (1Password, Vaultwarden, KeepassXC, papier
  # dans un coffre physique) AVANT le 1er usage. Cf docs/secrets-escrow.md.
  BOOTSTRAP_SECRETS_FILE="/root/CRM_MDO_BOOTSTRAP_SECRETS_${DOMAIN}.txt"
  cat > "${BOOTSTRAP_SECRETS_FILE}" <<SECRETS_EOF
================================================================================
CRM MDO Services - SECRETS BOOTSTRAP
Domaine : ${DOMAIN}
Genere le : $(date -Iseconds)
Hote : $(hostname -f 2>/dev/null || hostname)
================================================================================

ACTION REQUISE IMMEDIATEMENT
============================
1. Copier ces secrets dans un gestionnaire de mots de passe EXTERNE
   (1Password, Vaultwarden, KeePassXC) ET dans un support hors-ligne
   (papier dans coffre, cle USB chiffree dans un autre lieu).
2. Verifier que la copie est lisible (test de relecture).
3. Effacer ce fichier de maniere securisee :
     sudo shred -u "${BOOTSTRAP_SECRETS_FILE}"

CONSEQUENCES SI PERTE DE CES SECRETS
====================================
- SECRETS_MASTER_KEY perdue = tous les SecretEntry (coffre-fort client),
  tous les secrets TOTP 2FA, et tous les credentials chiffres sont
  IRRECUPERABLES (chiffrement AES-GCM avec cle non-derivable).
- JWT_SECRET / JWT_REFRESH_SECRET perdus = tous les tokens emis deviennent
  invalides (forcer une reconnexion globale). Pas critique en soi mais
  necessaire pour une rotation propre.
- POSTGRES_PASSWORD / REDIS_PASSWORD perdus = besoin de regenerer + redeploy.

SECRETS A METTRE EN ESCROW
==========================
POSTGRES_PASSWORD=${PG_PASS}
REDIS_PASSWORD=${REDIS_PASS}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH}
SECRETS_MASTER_KEY=${SECRETS_KEY}

PROCEDURE DE ROTATION
=====================
Cf docs/secrets-escrow.md pour la procedure detaillee de rotation
non-destructive (JWT_SECRET / POSTGRES_PASSWORD).
ATTENTION : SECRETS_MASTER_KEY NE DOIT JAMAIS ETRE TOURNEE apres mise
en service sans re-chiffrement explicite de toutes les SecretEntry.
SECRETS_EOF
  chmod 600 "${BOOTSTRAP_SECRETS_FILE}"
  warn "Secrets bootstrap ecrits : ${BOOTSTRAP_SECRETS_FILE}"
  warn "ACTION REQUISE : mettre ces secrets en escrow externe AVANT mise en prod, puis shred -u ${BOOTSTRAP_SECRETS_FILE}"
  warn "Cf docs/secrets-escrow.md"
elif [[ -f "${ENV_FILE}" ]]; then
  ok ".env existant conserve"
  # Mise a jour incrementale : ajoute les nouvelles cles si manquantes
  for kv in \
    "WEBAUTHN_RP_ID=${DOMAIN}" \
    "WEBAUTHN_RP_NAME=\"CRM ${DOMAIN}\"" \
    "WEBAUTHN_ORIGINS=https://${DOMAIN}" \
    "CADDY_PROVISIONING=enabled" \
    "CADDY_ADMIN_URL=http://caddy:2019" \
    "CADDY_CONFIG_PATH=/etc/caddy/Caddyfile" \
  ; do
    key="${kv%%=*}"
    if ! grep -q "^${key}=" "${ENV_FILE}"; then
      echo "${kv}" >> "${ENV_FILE}"
      ok "Ajout au .env : ${key}"
    fi
  done
fi

# =============================================================================
# Check DNS (skippe en mode restore : on assume que le DNS est en place)
# =============================================================================
if [[ "${MODE}" != "restore" ]]; then
  log "Verification du DNS pour ${DOMAIN}..."
  SERVER_IP=$(curl -fsS --max-time 5 https://ifconfig.me || true)
  RESOLVED_IP=$(dig +short "${DOMAIN}" | tail -n1 || true)
  if [[ -n "${RESOLVED_IP}" && "${RESOLVED_IP}" == "${SERVER_IP}" ]]; then
    ok "${DOMAIN} pointe bien vers ce serveur (${SERVER_IP})"
  else
    warn "${DOMAIN} resout vers '${RESOLVED_IP:-rien}' mais ce serveur est '${SERVER_IP:-inconnu}'"
    warn "Let's Encrypt va echouer tant que le DNS n'est pas a jour"
    confirm "Continuer quand meme ?" || exit 1
  fi
fi

# =============================================================================
# Build et demarrage de la stack Docker
# =============================================================================
cd "${INSTALL_DIR}"
log "Build des images Docker (cela peut prendre quelques minutes)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

log "Demarrage de la stack..."
mkdir -p /var/log/caddy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
ok "Stack demarree"

# =============================================================================
# Bootstrap Caddyfile dans le volume partage
# =============================================================================
# Le volume `caddy-config-shared` est cree vide au 1er boot. Caddy demarre
# alors sans Caddyfile et n'expose que HTTP (pas de TLS, pas de domaine
# resolu). On copie le Caddyfile du repo dans le volume et on reload.
#
# Apres le 1er boot, les tenants peuvent etre ajoutes/modifies dynamiquement
# via CaddyProvisioningService qui ecrit dans le meme volume.
log "Verification du Caddyfile dans le volume partage..."
# On detecte la presence de NOTRE config (marqueur reverse_proxy vers le backend)
# plutot qu'un seuil de taille : l'image caddy ship un Caddyfile par defaut de
# ~769 octets (bloc :80 + file_server) qui passait l'ancien test `< 200` → notre
# Caddyfile n'etait jamais copie, d'ou pas de reverse_proxy ni HTTPS (incident
# deploy 2026-06).
if docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    exec -T caddy grep -q "reverse_proxy backend:4000" /etc/caddy/Caddyfile 2>/dev/null; then
  ok "Caddyfile applicatif deja en place"
else
  log "Bootstrap Caddyfile (config par defaut ou absente detectee)..."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    cp docker/caddy/Caddyfile caddy:/etc/caddy/Caddyfile
  # Un restart est plus deterministe qu'un `caddy reload` via l'admin API au
  # 1er boot (l'admin peut etre encore sur localhost si la config par defaut
  # tournait). Caddy relit /etc/caddy/Caddyfile (volume partage) au demarrage.
  docker compose -f docker-compose.yml -f docker-compose.prod.yml restart caddy
  ok "Caddyfile bootstrap (HTTPS + ACME vont demarrer)"
fi

# =============================================================================
# Restore mode : injecter DB + uploads + caddy data
# =============================================================================
if [[ "${MODE}" == "restore" ]]; then
  log "Attente que Postgres soit pret..."
  for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U crm_mdo >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  log "Restore de la BDD (pg_restore --clean)..."
  set -a; . "${INSTALL_DIR}/.env"; set +a
  gunzip -c "${RESTORE_TMP}/database.sql.gz" | \
    docker compose exec -T postgres psql -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" --quiet
  ok "BDD restauree"

  # Uploads
  if [[ -f "${RESTORE_TMP}/uploads.tar.gz" ]]; then
    log "Restore uploads (attachments)..."
    VOL_NAME=$(docker volume ls -q | grep -E 'attachments-data$' | head -n1)
    if [[ -n "${VOL_NAME}" ]]; then
      docker run --rm -v "${VOL_NAME}:/data" -v "${RESTORE_TMP}:/restore:ro" alpine:latest \
        sh -c 'cd /data && tar -xzf /restore/uploads.tar.gz'
      ok "Uploads restaures dans ${VOL_NAME}"
    fi
  fi

  # Caddy data (certs Let's Encrypt) — utile si meme domaine reutilise
  if [[ -f "${RESTORE_TMP}/caddy-data.tar.gz" ]]; then
    log "Restore Caddy data (certs Let's Encrypt)..."
    CADDY_VOL=$(docker volume ls -q | grep -E 'caddy-data$' | head -n1)
    if [[ -n "${CADDY_VOL}" ]]; then
      docker run --rm -v "${CADDY_VOL}:/data" -v "${RESTORE_TMP}:/restore:ro" alpine:latest \
        sh -c 'cd /data && tar -xzf /restore/caddy-data.tar.gz'
      docker compose restart caddy
      ok "Caddy data restaure (certs preserves, pas de re-emission ACME)"
    fi
  fi

  # Nettoyage temp
  rm -rf "${RESTORE_TMP}"
  [[ "${RESTORE_FROM}" =~ \.enc$ ]] && rm -f "${RESTORE_TARBALL}"
fi

# =============================================================================
# Acquisition CrowdSec sur les logs Caddy
# =============================================================================
if command -v cscli >/dev/null 2>&1; then
  ACQUIS_FILE=/etc/crowdsec/acquis.d/caddy.yaml
  mkdir -p /etc/crowdsec/acquis.d
  if [[ ! -f "${ACQUIS_FILE}" ]]; then
    cat > "${ACQUIS_FILE}" <<'ACQ_EOF'
filenames:
  - /var/log/caddy/access.log
labels:
  type: caddy
ACQ_EOF
    systemctl reload crowdsec || systemctl restart crowdsec
    ok "CrowdSec : acquisition Caddy configuree"
  fi
fi

# =============================================================================
# MCP server : build si pas deja fait (pour Claude desktop)
# =============================================================================
if [[ -d "${INSTALL_DIR}/mcp" && ! -d "${INSTALL_DIR}/mcp/dist" ]]; then
  log "Build du MCP server (interrogation CRM depuis Claude desktop)..."
  pushd "${INSTALL_DIR}/mcp" >/dev/null
  npm install --silent 2>&1 | tail -5 || warn "npm install MCP echec — pas bloquant"
  npm run build 2>&1 | tail -5 || warn "build MCP echec — pas bloquant"
  popd >/dev/null
  if [[ -f "${INSTALL_DIR}/mcp/dist/index.js" ]]; then
    ok "MCP server build : ${INSTALL_DIR}/mcp/dist/index.js"
  fi
fi

# =============================================================================
# Attente backend pret
# =============================================================================
log "Attente que le backend soit pret..."
for i in {1..60}; do
  if docker compose exec -T backend node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" 2>/dev/null; then
    ok "Backend pret"
    break
  fi
  sleep 3
  [[ $i -eq 60 ]] && { err "Backend n'a pas repondu a temps. Voir: docker compose logs backend"; exit 1; }
done

# =============================================================================
# Creation du 1er admin (skip en mode upgrade et restore)
# =============================================================================
if [[ "${MODE}" == "install" ]]; then
  log "Creation du compte administrateur (interactif)..."
  echo
  read -rp "Email admin [mathieu@mdoservices.fr] : " ADMIN_EMAIL
  ADMIN_EMAIL="${ADMIN_EMAIL:-mathieu@mdoservices.fr}"
  read -rp "Prenom : " ADMIN_FIRST
  read -rp "Nom : " ADMIN_LAST
  while :; do
    read -rsp "Mot de passe (>= 12 caracteres, 3 classes : minuscules/majuscules/chiffres/symboles) : " ADMIN_PASS
    echo
    if [[ ${#ADMIN_PASS} -lt 12 ]]; then
      warn "Mot de passe trop court (min 12)"; continue
    fi
    classes=0
    [[ "${ADMIN_PASS}" =~ [a-z] ]] && classes=$((classes+1))
    [[ "${ADMIN_PASS}" =~ [A-Z] ]] && classes=$((classes+1))
    [[ "${ADMIN_PASS}" =~ [0-9] ]] && classes=$((classes+1))
    [[ "${ADMIN_PASS}" =~ [^A-Za-z0-9] ]] && classes=$((classes+1))
    if [[ ${classes} -lt 3 ]]; then
      warn "Mot de passe trop faible (au moins 3 classes requises)"; continue
    fi
    break
  done
  docker compose exec -T \
    -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
    -e ADMIN_PASSWORD="${ADMIN_PASS}" \
    -e ADMIN_FIRST="${ADMIN_FIRST}" \
    -e ADMIN_LAST="${ADMIN_LAST}" \
    backend npm run seed:admin
  ok "Compte admin cree (sera promu super-admin au prochain restart backend si seul ADMIN)"
elif [[ "${MODE}" == "restore" ]]; then
  ok "Restore : pas de creation d'admin (les comptes existants sont preserves)"
else
  ok "Upgrade : pas de creation d'admin"
fi

# =============================================================================
# Backup quotidien via cron (idempotent)
# =============================================================================
log "Configuration du backup quotidien..."
BACKUP_SCRIPT="${INSTALL_DIR}/scripts/backup.sh"
BACKUP_DIR="/var/backups/crm-mdo"
mkdir -p "${BACKUP_DIR}"
chown "${TARGET_USER}:${TARGET_USER}" "${BACKUP_DIR}"

cat > /etc/cron.d/crm-mdo-backup <<CRON_EOF
# Backup quotidien CRM MDO Services a 03h00
0 3 * * * ${TARGET_USER} cd ${INSTALL_DIR} && ${BACKUP_SCRIPT} ${BACKUP_DIR} >> /var/log/crm-mdo-backup.log 2>&1
# Backup off-site chiffre (restic) a 04h00.
# Si /etc/crm-mdo/backup.env est absent on logue explicitement plutot que de
# skip silencieusement (le silence masquait l'absence d'offsite en prod, cf
# audit infra 2026-05). Le backend expose la freshness via /health + /metrics.
0 4 * * * ${TARGET_USER} cd ${INSTALL_DIR} && (test -r /etc/crm-mdo/backup.env && scripts/backup-offsite.sh || echo "[\$(date -Iseconds)] [SKIP] /etc/crm-mdo/backup.env absent - offsite non configure (cf docs/prisma-migrations.md & install-ubuntu.sh)") >> /var/log/crm-mdo-backup-offsite.log 2>&1
CRON_EOF
chmod 644 /etc/cron.d/crm-mdo-backup
ok "Cron backup configure (3h00 local, 4h00 offsite si /etc/crm-mdo/backup.env present)"

# Squelette offsite
mkdir -p /etc/crm-mdo
if [[ ! -f /etc/crm-mdo/backup.env.example ]]; then
  cat > /etc/crm-mdo/backup.env.example <<'OFFSITE_EOF'
# =============================================================================
# Configuration backup OFFSITE chiffre (restic) — CRM MDO Services
# =============================================================================
# IMPORTANT : sans backup offsite, un crash disque du VPS = perte totale.
# Le backup local (03h00) protege uniquement contre les erreurs humaines /
# corruption logique. Pour la resilience hardware, il FAUT un offsite.
#
# Procedure :
#   1. Choisir un provider (recommande : Backblaze B2 pour cout/perf, ou
#      Hetzner StorageBox si tu veux du souverain EU complet).
#   2. Copier ce fichier en /etc/crm-mdo/backup.env :
#        sudo cp /etc/crm-mdo/backup.env.example /etc/crm-mdo/backup.env
#        sudo chmod 600 /etc/crm-mdo/backup.env
#   3. Decommenter le bloc correspondant a ton provider + renseigner les
#      credentials.
#   4. Generer une passphrase de chiffrement forte (irrecuperable si perdue) :
#        openssl rand -hex 32
#      Sauvegarder cette passphrase HORS du serveur (1Password, Bitwarden,
#      coffre physique). Sans elle, AUCUN backup ne pourra etre restore.
#   5. Initialiser le repo restic :
#        source /etc/crm-mdo/backup.env && restic init
#   6. Tester un backup manuel :
#        sudo bash /opt/crm-mdo/scripts/backup-offsite.sh
#   7. Verifier que le cron 04h00 s'execute (cf /var/log/crm-mdo-backup-offsite.log)
#   8. **CRITIQUE** : tester une restauration tous les mois sur un env de test.
#      Un backup non-teste = pas un backup.
#
# =============================================================================

# === Option 1 : Backblaze B2 (recommande — ~0.005$/GB/mois, US/EU regions) ===
# https://www.backblaze.com/cloud-storage
# 1) Creer un bucket dedie (private), region EU pour RGPD
# 2) Application Key avec accees limite au bucket (pas la master key !)
# export RESTIC_REPOSITORY="b2:crm-mdo-backup-prod:/"
# export B2_ACCOUNT_ID="00xxxxxxxxxxxxxxxxxx"
# export B2_ACCOUNT_KEY="K00xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# === Option 2 : Hetzner StorageBox SFTP (souverain EU, ~3.5€/TB/mois) ===
# https://www.hetzner.com/storage/storage-box
# 1) Creer une box BX11 (1 To) en region Falkenstein
# 2) Ajouter ta cle SSH publique (la cle root du VPS, generee via ssh-keygen)
# 3) Activer "External reachability" pour SFTP depuis Internet
# export RESTIC_REPOSITORY="sftp:u123456@u123456.your-storagebox.de:/crm-mdo"

# === Option 3 : Scaleway Object Storage (souverain FR, S3 compatible) ===
# https://console.scaleway.com/object-storage
# 1) Creer un bucket private, region fr-par (Paris) ou nl-ams (Amsterdam)
# 2) Generer une cle API avec scope ObjectStorage:FullAccess sur ce bucket
# export RESTIC_REPOSITORY="s3:s3.fr-par.scw.cloud/crm-mdo-backup"
# export AWS_ACCESS_KEY_ID="SCWXXXXXXXXXXXXXXXXX"
# export AWS_SECRET_ACCESS_KEY="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# === Option 4 : OVH Object Storage (souverain FR alternatif) ===
# https://www.ovhcloud.com/fr/public-cloud/object-storage/
# export RESTIC_REPOSITORY="s3:s3.gra.io.cloud.ovh.net/crm-mdo-backup"
# export AWS_ACCESS_KEY_ID="..."
# export AWS_SECRET_ACCESS_KEY="..."

# === Passphrase de chiffrement (OBLIGATOIRE — quel que soit le provider) ===
# Generer via : openssl rand -hex 32
# SAUVEGARDER HORS DU SERVEUR (1Password, Bitwarden, coffre physique).
# Sans elle, AUCUN backup ne sera restore-able.
# export RESTIC_PASSWORD="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# === Politique de retention (optionnel, defaut dans backup-offsite.sh) ===
# Recommande : 7 quotidiens + 4 hebdomadaires + 12 mensuels + 5 annuels
# export RESTIC_KEEP_DAILY=7
# export RESTIC_KEEP_WEEKLY=4
# export RESTIC_KEEP_MONTHLY=12
# export RESTIC_KEEP_YEARLY=5
OFFSITE_EOF
  chmod 644 /etc/crm-mdo/backup.env.example
fi

# =============================================================================
# Healthcheck post-install renforce
# =============================================================================
log "Healthcheck post-install..."

# Backend /health via Caddy en local
if curl -fsS --max-time 5 http://localhost/health >/dev/null 2>&1; then
  ok "/health repond"
else
  warn "/health ne repond pas en local (Caddy peut etre encore en ACME)"
fi

# /api/branding (test que le backend a bien traverse Caddy)
if curl -fsS --max-time 5 "http://localhost/api/branding" >/dev/null 2>&1; then
  ok "/api/branding repond (chaine Caddy -> backend OK)"
else
  warn "/api/branding ne repond pas en local"
fi

# HTTPS externe (si DNS est aligne) — best-effort, peut echouer si Let's
# Encrypt n'a pas encore emis le cert
if [[ "${MODE}" != "restore" ]]; then
  log "Test HTTPS externe (peut prendre 30-60s si premier ACME)..."
  for i in {1..20}; do
    if curl -fsS --max-time 5 "https://${DOMAIN}/health" >/dev/null 2>&1; then
      ok "https://${DOMAIN}/health repond (TLS Let's Encrypt OK)"
      break
    fi
    [[ $i -eq 20 ]] && warn "HTTPS externe ne repond pas encore. Verifiez : docker compose logs caddy"
    sleep 5
  done
fi

# =============================================================================
# Recapitulatif
# =============================================================================
echo
echo "=============================================="
ok "Installation terminee ! (mode : ${MODE})"
echo "=============================================="
echo
echo "  Application : https://${DOMAIN}"
echo "  Repertoire  : ${INSTALL_DIR}"
echo "  Fichier env : ${ENV_FILE} (contient les secrets - chmod 600)"
echo "  Backups     : ${BACKUP_DIR}"
[[ -f "${INSTALL_DIR}/mcp/dist/index.js" ]] && echo "  MCP server  : ${INSTALL_DIR}/mcp/dist/index.js"
echo
echo "  Commandes utiles :"
echo "    docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "    docker compose -f docker-compose.yml -f docker-compose.prod.yml restart"
echo "    sudo bash ${INSTALL_DIR}/scripts/backup.sh"
echo "    sudo bash ${INSTALL_DIR}/scripts/install-ubuntu.sh --upgrade"
echo
if [[ "${MODE}" == "install" ]]; then
  warn "Pensez a completer les variables SMTP dans ${ENV_FILE} puis redemarrez le backend :"
  warn "  cd ${INSTALL_DIR} && docker compose restart backend"
  echo
  warn "==> SECURITE : avant ouverture au public, mettre les secrets bootstrap en"
  warn "    escrow externe (1Password / coffre / papier) puis effacer le fichier :"
  warn "      sudo shred -u ${BOOTSTRAP_SECRETS_FILE:-/root/CRM_MDO_BOOTSTRAP_SECRETS_${DOMAIN}.txt}"
  warn "    Documentation : ${INSTALL_DIR}/docs/secrets-escrow.md"
fi

# Backup offsite : alerte explicite si non configure (silence = oubli).
# Le cron 04h00 log [SKIP] tous les jours mais personne ne va le lire en prod.
# Sans offsite, un crash disque = perte totale.
if [[ ! -r /etc/crm-mdo/backup.env ]]; then
  echo
  warn "==> BACKUP OFFSITE NON CONFIGURE"
  warn "    /etc/crm-mdo/backup.env absent : aucun backup chiffre offsite n'est"
  warn "    pousse vers B2/S3/Hetzner. Un crash disque = perte totale des donnees."
  warn ""
  warn "    Pour activer (recommande avant toute mise en prod client) :"
  warn "      sudo cp /etc/crm-mdo/backup.env.example /etc/crm-mdo/backup.env"
  warn "      sudo \$EDITOR /etc/crm-mdo/backup.env       # choisir provider + creds"
  warn "      sudo chmod 600 /etc/crm-mdo/backup.env"
  warn "      sudo -E bash -c 'source /etc/crm-mdo/backup.env && restic init'"
  warn "      sudo bash ${INSTALL_DIR}/scripts/backup-offsite.sh   # test"
  warn ""
  warn "    Tant que le heartbeat n'est pas ecrit, /health renvoie"
  warn "    backupOffsite.status=disabled (silencieux cote UI)."
fi
echo
