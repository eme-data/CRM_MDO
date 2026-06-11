#!/usr/bin/env bash
# Backup quotidien BDD PostgreSQL + pieces jointes du CRM MDO Services
# Usage : backup.sh [DESTINATION_DIR]
# Retention : 30 jours par defaut (BACKUP_RETENTION_DAYS env var)

set -euo pipefail

DEST="${1:-/var/backups/crm-mdo}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
STAMP=$(date +%Y%m%d_%H%M%S)
SQL_FILE="${DEST}/crm_mdo_${STAMP}.sql.gz"
ATT_FILE="${DEST}/crm_mdo_attachments_${STAMP}.tar.gz"

mkdir -p "${DEST}"

# Source .env depuis le repertoire de travail courant (cd par le cron)
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

# 1. Dump BDD
echo "[$(date -Iseconds)] Backup BDD -> ${SQL_FILE}"
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" --no-owner --no-acl \
  | gzip -9 > "${SQL_FILE}"
SQL_SIZE=$(du -h "${SQL_FILE}" | awk '{print $1}')
echo "[$(date -Iseconds)] Backup BDD OK (${SQL_SIZE})"

# 2. Tarball des pieces jointes (volume Docker)
echo "[$(date -Iseconds)] Backup attachments -> ${ATT_FILE}"
# On copie le contenu du volume vers stdout via un container alpine ephemere
if docker volume inspect crm-mdo_attachments-data >/dev/null 2>&1; then
  docker run --rm \
    -v crm-mdo_attachments-data:/data:ro \
    alpine:latest \
    tar -czf - -C /data . > "${ATT_FILE}" 2>/dev/null || true
  if [[ -s "${ATT_FILE}" ]]; then
    ATT_SIZE=$(du -h "${ATT_FILE}" | awk '{print $1}')
    echo "[$(date -Iseconds)] Backup attachments OK (${ATT_SIZE})"
  else
    echo "[$(date -Iseconds)] Pas de pieces jointes a sauvegarder"
    rm -f "${ATT_FILE}"
  fi
else
  echo "[$(date -Iseconds)] Volume attachments-data introuvable, skip"
fi

# 3. Purge des vieux backups
find "${DEST}" -name 'crm_mdo_*.sql.gz' -mtime +${RETENTION} -delete
find "${DEST}" -name 'crm_mdo_attachments_*.tar.gz' -mtime +${RETENTION} -delete
echo "[$(date -Iseconds)] Backups > ${RETENTION}j supprimes"
