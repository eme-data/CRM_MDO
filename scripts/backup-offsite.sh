#!/usr/bin/env bash
# =============================================================================
# Backup off-site chiffre via restic
# =============================================================================
# Pousse la BDD + les pieces jointes vers un repository restic chiffre
# (Backblaze B2, S3, Hetzner StorageBox, SFTP local, etc.).
#
# Lecture seule cote CRM (le serveur ne peut pas lister/supprimer le repo) :
# si le serveur est ransomwaree, l'attaquant ne peut PAS chiffrer/effacer
# les snapshots existants. Le `forget --prune` est volontairement laisse a un
# job operateur (manuel, depuis un poste de confiance) pour cette raison.
#
# Configuration : creer /etc/crm-mdo/backup.env avec (chmod 600) :
#
#   # Repository - Backblaze B2 :
#   export RESTIC_REPOSITORY="b2:bucket-name:/crm-mdo"
#   export B2_ACCOUNT_ID="..."
#   export B2_ACCOUNT_KEY="..."
#   # Ou repository S3 :
#   export RESTIC_REPOSITORY="s3:s3.eu-west-3.amazonaws.com/bucket-name/crm-mdo"
#   export AWS_ACCESS_KEY_ID="..."
#   export AWS_SECRET_ACCESS_KEY="..."
#   # Ou SFTP (Hetzner StorageBox p.ex.) :
#   export RESTIC_REPOSITORY="sftp:user@u-host.your-storagebox.de:/crm-mdo"
#
#   # Mot de passe de chiffrement restic (genere par "openssl rand -hex 32")
#   export RESTIC_PASSWORD="..."
#
# Initialisation (une seule fois) :
#   sudo -E restic init
#
# Usage en cron : 0 4 * * * crm /opt/crm-mdo/scripts/backup-offsite.sh
# =============================================================================

set -euo pipefail

CONFIG_FILE="${CRM_BACKUP_CONFIG:-/etc/crm-mdo/backup.env}"
WORK_DIR="${CRM_BACKUP_WORK_DIR:-/var/backups/crm-mdo/staging}"
HOSTNAME_TAG=$(hostname -s)

# ---- Pre-requis ------------------------------------------------------------
if ! command -v restic >/dev/null 2>&1; then
  echo "[$(date -Iseconds)] restic non installe. Installation : apt-get install restic" >&2
  exit 1
fi

if [[ ! -r "${CONFIG_FILE}" ]]; then
  echo "[$(date -Iseconds)] Config absente : ${CONFIG_FILE}" >&2
  echo "Creez-la (chmod 600) avec RESTIC_REPOSITORY, RESTIC_PASSWORD et les credentials du provider." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${CONFIG_FILE}"

if [[ -z "${RESTIC_REPOSITORY:-}" || -z "${RESTIC_PASSWORD:-}" ]]; then
  echo "[$(date -Iseconds)] RESTIC_REPOSITORY ou RESTIC_PASSWORD manquants dans ${CONFIG_FILE}" >&2
  exit 1
fi

mkdir -p "${WORK_DIR}"
chmod 700 "${WORK_DIR}"

cleanup() {
  rm -rf "${WORK_DIR:?}/"*
}
trap cleanup EXIT

# ---- Dump BDD --------------------------------------------------------------
SQL_FILE="${WORK_DIR}/db.sql"
echo "[$(date -Iseconds)] Dump PostgreSQL → ${SQL_FILE}"
# `cd` vers le repertoire de l'install pour que docker-compose trouve le .env
INSTALL_DIR="${CRM_INSTALL_DIR:-/opt/crm-mdo}"
cd "${INSTALL_DIR}"
# shellcheck disable=SC1091
[[ -f .env ]] && { set -a; . ./.env; set +a; }

docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" --no-owner --no-acl \
  > "${SQL_FILE}"

# ---- Snapshot des pieces jointes -------------------------------------------
ATTACHMENTS_DIR="${WORK_DIR}/attachments"
mkdir -p "${ATTACHMENTS_DIR}"
if docker volume inspect crm-mdo_attachments-data >/dev/null 2>&1; then
  echo "[$(date -Iseconds)] Snapshot du volume attachments-data..."
  docker run --rm \
    -v crm-mdo_attachments-data:/data:ro \
    -v "${ATTACHMENTS_DIR}":/out \
    alpine:latest \
    sh -c "cp -a /data/. /out/ 2>/dev/null || true"
else
  echo "[$(date -Iseconds)] Volume attachments-data absent, skip"
fi

# ---- Push vers restic ------------------------------------------------------
echo "[$(date -Iseconds)] restic backup → ${RESTIC_REPOSITORY}"
restic backup \
  --tag "host=${HOSTNAME_TAG}" \
  --tag "stack=crm-mdo" \
  --host "${HOSTNAME_TAG}" \
  "${SQL_FILE}" \
  "${ATTACHMENTS_DIR}" \
  --exclude-caches

# ---- Verification rapide ---------------------------------------------------
# `restic check` complet est lourd : on le laisse a un job operateur hebdo.
# Ici on valide juste que le snapshot est lisible.
echo "[$(date -Iseconds)] Verification du dernier snapshot..."
restic snapshots --latest 1 --compact

echo "[$(date -Iseconds)] Backup off-site OK"

# ---- Notice retention ------------------------------------------------------
# Le `restic forget --prune` n'est PAS execute ici par design : si le serveur
# est compromis, l'attaquant aurait sinon le droit de purger les snapshots.
# Lancer la rotation depuis un poste de confiance, p.ex. mensuellement :
#   restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
