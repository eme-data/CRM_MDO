#!/usr/bin/env bash
# =============================================================================
# Restore d'un backup CRM MDO Services
# =============================================================================
# Supporte 2 formats :
#   - Dump SQL gzippe seul              : restore.sh dump.sql.gz
#   - Archive de migration (multi-volet) : restore.sh archive.tar.gz [.enc]
#     (produite par scripts/migrate-export.sh — contient .env + DB + uploads
#      + caddy data + manifest sha256)
#
# Usage :
#   sudo bash scripts/restore.sh /var/backups/crm-mdo/crm_mdo_20260601_030000.sql.gz
#   sudo bash scripts/restore.sh /tmp/crm-mdo-migration_20260601_120000.tar.gz
#   sudo MIGRATION_PASSWORD='...' bash scripts/restore.sh archive.tar.gz.enc
#
# Pre-requis : stack docker compose deja en route dans le repertoire courant.
# Le script DEMANDE confirmation avant toute action destructive sur la BDD.
# Cree un backup pre-restore automatiquement pour rollback.
# =============================================================================

set -euo pipefail

INPUT="${1:-}"
if [[ -z "${INPUT}" || ! -f "${INPUT}" ]]; then
  echo "Usage : $0 <fichier.sql.gz | archive.tar.gz | archive.tar.gz.enc>" >&2
  exit 1
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

if [[ ! -f .env ]]; then
  err ".env introuvable dans $(pwd). Lancez ce script depuis le repertoire d'install (ex: /opt/crm-mdo)"
  exit 1
fi
set -a; . ./.env; set +a

# ----- Detection du format ---------------------------------------------------
FORMAT="dump"
TARBALL="${INPUT}"

if [[ "${INPUT}" =~ \.enc$ ]]; then
  if [[ -z "${MIGRATION_PASSWORD:-}" ]]; then
    err "Archive chiffree : MIGRATION_PASSWORD requis"
    err "  → sudo MIGRATION_PASSWORD='...' bash $0 ${INPUT}"
    exit 1
  fi
  log "Dechiffrement..."
  TARBALL="/tmp/crm-mdo-restore-decrypted.tar.gz"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
    -in "${INPUT}" -out "${TARBALL}" \
    -pass "env:MIGRATION_PASSWORD"
  chmod 600 "${TARBALL}"
  ok "Archive dechiffree"
fi

if [[ "${TARBALL}" =~ \.tar\.gz$ ]]; then
  # Verifier si c'est une archive de migration (contient manifest.json + dotenv)
  if tar -tzf "${TARBALL}" 2>/dev/null | grep -qE '^\.?/?manifest\.json$'; then
    FORMAT="migration"
    log "Format detecte : archive de migration multi-volet"
  fi
fi

# ----- Confirmation destructive ----------------------------------------------
echo
warn "ATTENTION : cette operation va ECRASER la base de donnees actuelle"
warn "  + remplacer les fichiers uploads (si l'archive en contient)"
[[ "${FORMAT}" == "migration" ]] && warn "  + remplacer le .env (donc les secrets) et les certs Caddy"
echo
read -rp "Tapez 'oui' pour confirmer : " ans
[[ "$ans" == "oui" ]] || { echo "Annule."; exit 1; }

# ============================================================================
# Cas 1 : dump SQL gzippe seul (format historique)
# ============================================================================
if [[ "${FORMAT}" == "dump" ]]; then
  log "Restauration BDD depuis ${INPUT}..."
  gunzip -c "${INPUT}" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}"
  ok "BDD restauree"
  echo
  warn "Redemarrez le backend pour purger les caches : docker compose restart backend"
  exit 0
fi

# ============================================================================
# Cas 2 : archive de migration multi-volet
# ============================================================================
TMP=$(mktemp -d -t crm-mdo-restore-XXXXXX)
trap 'rm -rf "${TMP}"' EXIT

log "Extraction de l'archive..."
tar -xzf "${TARBALL}" -C "${TMP}"

# Verification checksums via manifest
if command -v jq >/dev/null 2>&1 && [[ -f "${TMP}/manifest.json" ]]; then
  log "Verification des checksums sha256..."
  while IFS= read -r line; do
    expected=$(echo "$line" | awk '{print $1}')
    file=$(echo "$line" | awk '{print $2}')
    actual=$(sha256sum "${TMP}/${file}" | awk '{print $1}')
    if [[ "${actual}" != "${expected}" ]]; then
      err "Checksum invalide pour ${file} : attendu ${expected}, calcul ${actual}"
      exit 1
    fi
  done < <(jq -r '.checksums | to_entries[] | "\(.value)  \(.key)"' "${TMP}/manifest.json")
  ok "Tous les checksums OK"
else
  warn "jq non installe ou manifest absent : checksums non verifies"
fi

# Affichage des metadonnees pour transparence
if command -v jq >/dev/null 2>&1 && [[ -f "${TMP}/manifest.json" ]]; then
  echo
  echo "Metadonnees de l'archive :"
  jq -r '"  Source : " + .sourceHost + "\n  Domain : " + .domain + "\n  Exporte le : " + .exportedAt + "\n  Version CRM : " + .crmVersion' "${TMP}/manifest.json"
  echo
fi

# Backup AVANT restore (au cas ou)
PRE_BACKUP="/var/backups/crm-mdo/pre-restore_$(date +%Y%m%d_%H%M%S).sql.gz"
mkdir -p "$(dirname "${PRE_BACKUP}")"
log "Backup de securite AVANT restore -> ${PRE_BACKUP}"
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" --no-owner --no-acl \
  | gzip -9 > "${PRE_BACKUP}"
ok "Backup pre-restore OK ($(du -h "${PRE_BACKUP}" | awk '{print $1}'))"

# Restore .env (remplace les secrets actuels)
if [[ -f "${TMP}/dotenv" ]]; then
  log "Restauration .env..."
  # Sauvegarde l'ancien .env pour rollback manuel si besoin
  cp .env ".env.before-restore_$(date +%Y%m%d_%H%M%S)"
  cp "${TMP}/dotenv" .env
  chmod 600 .env
  ok ".env restaure (ancien : .env.before-restore_*)"
fi

# Restore BDD
log "Restauration BDD..."
# Recharge le nouveau .env pour avoir les bons creds Postgres
set -a; . ./.env; set +a
gunzip -c "${TMP}/database.sql.gz" | \
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" --quiet
ok "BDD restauree"

# Restore uploads
if [[ -f "${TMP}/uploads.tar.gz" ]]; then
  log "Restauration uploads..."
  VOL_NAME=$(docker volume ls -q | grep -E 'attachments-data$' | head -n1 || true)
  if [[ -n "${VOL_NAME}" ]]; then
    docker run --rm -v "${VOL_NAME}:/data" -v "${TMP}:/restore:ro" alpine:latest \
      sh -c 'cd /data && tar -xzf /restore/uploads.tar.gz'
    ok "Uploads restaures dans ${VOL_NAME}"
  else
    warn "Volume attachments-data introuvable, uploads non restaures"
  fi
fi

# Restore Caddy data (certs Let's Encrypt)
if [[ -f "${TMP}/caddy-data.tar.gz" ]]; then
  log "Restauration Caddy data (certs Let's Encrypt)..."
  CADDY_VOL=$(docker volume ls -q | grep -E 'caddy-data$' | head -n1 || true)
  if [[ -n "${CADDY_VOL}" ]]; then
    docker run --rm -v "${CADDY_VOL}:/data" -v "${TMP}:/restore:ro" alpine:latest \
      sh -c 'cd /data && tar -xzf /restore/caddy-data.tar.gz'
    docker compose restart caddy
    ok "Caddy redemarre avec les certs restaures"
  fi
fi

# Nettoyage de l'archive dechiffree si elle l'etait
[[ "${INPUT}" =~ \.enc$ ]] && rm -f "${TARBALL}"

# Restart backend pour purger les caches
log "Redemarrage du backend..."
docker compose restart backend
ok "Backend redemarre"

echo
echo "=============================================="
ok "Restauration terminee"
echo "=============================================="
echo
echo "  Backup pre-restore : ${PRE_BACKUP}"
echo "  Verifiez : https://${DOMAIN:-crm.mdoservices.fr}/health"
echo
warn "En cas de probleme, rollback via :"
warn "  sudo bash $0 ${PRE_BACKUP}"
echo
