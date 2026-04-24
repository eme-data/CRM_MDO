#!/usr/bin/env bash
# Backup quotidien BDD PostgreSQL du CRM MDO Services
# Usage : backup.sh [DESTINATION_DIR]
# Retention : 30 jours par defaut (BACKUP_RETENTION_DAYS env var)

set -euo pipefail

DEST="${1:-/var/backups/crm-mdo}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="${DEST}/crm_mdo_${STAMP}.sql.gz"

mkdir -p "${DEST}"

# Source .env depuis le repertoire de travail courant (cd par le cron)
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

echo "[$(date -Iseconds)] Backup CRM MDO en cours -> ${FILE}"

docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" --no-owner --no-acl \
  | gzip -9 > "${FILE}"

SIZE=$(du -h "${FILE}" | awk '{print $1}')
echo "[$(date -Iseconds)] Backup OK (${SIZE})"

# Purge des vieux backups
find "${DEST}" -name 'crm_mdo_*.sql.gz' -mtime +${RETENTION} -delete
echo "[$(date -Iseconds)] Backups > ${RETENTION}j supprimes"
