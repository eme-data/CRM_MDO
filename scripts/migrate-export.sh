#!/usr/bin/env bash
# =============================================================================
# CRM MDO Services - Export complet pour migration vers un nouveau serveur
# =============================================================================
# A lancer sur l'ANCIEN serveur. Genere un archive .tar.gz unique contenant :
#   - .env (avec tous les secrets)
#   - dump PostgreSQL gzippe
#   - tarball des uploads (attachments)
#   - tarball des Caddy data (certs Let's Encrypt -> evite ACME au 1er boot
#     sur le nouveau serveur tant que les DNS ne sont pas bascules)
#   - manifest.json avec metadata + checksums sha256
#
# Sortie : /tmp/crm-mdo-migration_YYYYMMDD_HHMMSS.tar.gz (chiffre via
# openssl si MIGRATION_PASSWORD est fourni en env).
#
# Usage :
#   sudo bash scripts/migrate-export.sh
#   sudo MIGRATION_PASSWORD='mot-de-passe-fort' bash scripts/migrate-export.sh
#
# Transfert vers le nouveau serveur :
#   scp /tmp/crm-mdo-migration_*.tar.gz root@nouveau-serveur:/tmp/
#
# Import sur le nouveau serveur :
#   sudo bash scripts/install-ubuntu.sh --restore-from=/tmp/crm-mdo-migration_*.tar.gz
# =============================================================================

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/crm-mdo}"
OUT_DIR="${OUT_DIR:-/tmp}"
STAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="crm-mdo-migration_${STAMP}.tar.gz"
ARCHIVE_PATH="${OUT_DIR}/${ARCHIVE_NAME}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Ce script doit etre execute en root (sudo bash $0)"
  exit 1
fi

if [[ ! -d "${INSTALL_DIR}" ]]; then
  err "Repertoire d'installation introuvable : ${INSTALL_DIR}"
  err "Definissez INSTALL_DIR si different (ex: INSTALL_DIR=/srv/crm sudo bash $0)"
  exit 1
fi

cd "${INSTALL_DIR}"
if [[ ! -f .env ]]; then
  err ".env introuvable dans ${INSTALL_DIR}"
  exit 1
fi
set -a; . ./.env; set +a

# ----- Workspace temporaire -------------------------------------------------
WORK_DIR=$(mktemp -d -t crm-mdo-migrate-XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

log "Workspace : ${WORK_DIR}"

# ----- 1. Dump BDD -----------------------------------------------------------
SQL_FILE="${WORK_DIR}/database.sql.gz"
log "Dump PostgreSQL en cours..."
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" \
  --no-owner --no-acl --clean --if-exists \
  | gzip -9 > "${SQL_FILE}"
SQL_SIZE=$(du -h "${SQL_FILE}" | awk '{print $1}')
ok "BDD dump : ${SQL_SIZE}"

# ----- 2. Tarball uploads ----------------------------------------------------
UPLOADS_FILE="${WORK_DIR}/uploads.tar.gz"
log "Export volume uploads..."
# Le volume peut s'appeler crm-mdo_attachments-data OU <project>_attachments-data
# On detecte dynamiquement le 1er volume qui match "attachments".
VOL_NAME=$(docker volume ls -q | grep -E 'attachments-data$' | head -n1 || true)
if [[ -n "${VOL_NAME}" ]]; then
  docker run --rm -v "${VOL_NAME}:/data:ro" alpine:latest \
    tar -czf - -C /data . > "${UPLOADS_FILE}" 2>/dev/null || true
  if [[ -s "${UPLOADS_FILE}" ]]; then
    UPL_SIZE=$(du -h "${UPLOADS_FILE}" | awk '{print $1}')
    ok "Uploads (${VOL_NAME}) : ${UPL_SIZE}"
  else
    warn "Pas d'uploads a exporter (volume vide)"
    rm -f "${UPLOADS_FILE}"
  fi
else
  warn "Aucun volume *attachments-data trouve — pas d'uploads a exporter"
fi

# ----- 3. Tarball Caddy data (certs Let's Encrypt) --------------------------
CADDY_DATA_FILE="${WORK_DIR}/caddy-data.tar.gz"
log "Export Caddy data (certs Let's Encrypt + ACME state)..."
CADDY_VOL=$(docker volume ls -q | grep -E 'caddy-data$' | head -n1 || true)
if [[ -n "${CADDY_VOL}" ]]; then
  docker run --rm -v "${CADDY_VOL}:/data:ro" alpine:latest \
    tar -czf - -C /data . > "${CADDY_DATA_FILE}" 2>/dev/null || true
  if [[ -s "${CADDY_DATA_FILE}" ]]; then
    CADDY_SIZE=$(du -h "${CADDY_DATA_FILE}" | awk '{print $1}')
    ok "Caddy data : ${CADDY_SIZE}"
  else
    warn "Pas de Caddy data a exporter (certs non emis ?)"
    rm -f "${CADDY_DATA_FILE}"
  fi
else
  warn "Volume caddy-data introuvable"
fi

# ----- 4. .env (avec secrets) -----------------------------------------------
cp .env "${WORK_DIR}/dotenv"
chmod 600 "${WORK_DIR}/dotenv"
ok ".env exporte (chmod 600)"

# ----- 5. Manifest avec checksums sha256 ------------------------------------
MANIFEST="${WORK_DIR}/manifest.json"
# Genere d'abord la liste des entries "key: value" separees par virgules,
# puis on assemble le JSON. Evite les bricolages "premier element pas de ,".
CHECKSUM_ENTRIES=""
for f in "${WORK_DIR}"/*; do
  base=$(basename "$f")
  [[ "${base}" == "manifest.json" ]] && continue
  [[ ! -f "$f" ]] && continue
  sha=$(sha256sum "$f" | awk '{print $1}')
  CHECKSUM_ENTRIES+="    \"${base}\": \"${sha}\","
  CHECKSUM_ENTRIES+=$'\n'
done
# Retire la derniere virgule (compatible JSON strict)
CHECKSUM_ENTRIES="${CHECKSUM_ENTRIES%,$'\n'}"

cat > "${MANIFEST}" <<EOF
{
  "version": 1,
  "exportedAt": "$(date -Iseconds)",
  "sourceHost": "$(hostname -f 2>/dev/null || hostname)",
  "domain": "${DOMAIN:-}",
  "installDir": "${INSTALL_DIR}",
  "crmVersion": "$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)",
  "checksums": {
${CHECKSUM_ENTRIES}
  }
}
EOF
ok "Manifest + checksums generes"

# ----- 6. Tarball final -----------------------------------------------------
log "Assemblage de l'archive ${ARCHIVE_PATH}..."
tar -czf "${ARCHIVE_PATH}" -C "${WORK_DIR}" .
chmod 600 "${ARCHIVE_PATH}"

# Chiffrement optionnel si MIGRATION_PASSWORD fourni
if [[ -n "${MIGRATION_PASSWORD:-}" ]]; then
  log "Chiffrement AES-256 via openssl..."
  openssl enc -aes-256-cbc -pbkdf2 -iter 250000 -salt \
    -in "${ARCHIVE_PATH}" \
    -out "${ARCHIVE_PATH}.enc" \
    -pass "env:MIGRATION_PASSWORD"
  rm -f "${ARCHIVE_PATH}"
  ARCHIVE_PATH="${ARCHIVE_PATH}.enc"
  chmod 600 "${ARCHIVE_PATH}"
  ok "Archive chiffree"
fi

FINAL_SIZE=$(du -h "${ARCHIVE_PATH}" | awk '{print $1}')

echo
echo "=============================================="
ok "Export termine"
echo "=============================================="
echo
echo "  Archive : ${ARCHIVE_PATH} (${FINAL_SIZE})"
echo "  Contenu : .env + database.sql.gz + uploads.tar.gz + caddy-data.tar.gz + manifest.json"
echo
echo "  Transfert vers le nouveau serveur :"
echo "    scp ${ARCHIVE_PATH} root@nouveau-serveur:/tmp/"
echo
echo "  Import sur le nouveau serveur :"
if [[ -n "${MIGRATION_PASSWORD:-}" ]]; then
  echo "    sudo MIGRATION_PASSWORD='...' bash scripts/install-ubuntu.sh --restore-from=$(basename "${ARCHIVE_PATH}")"
else
  echo "    sudo bash scripts/install-ubuntu.sh --restore-from=/tmp/$(basename "${ARCHIVE_PATH}")"
fi
echo
warn "Cette archive contient TOUS les secrets (mdp BDD, JWT, cles API). Stockage sur"
warn "support chiffre, transfert via SCP uniquement, suppression apres migration confirmee."
echo
