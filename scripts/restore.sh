#!/usr/bin/env bash
# Restaure un backup BDD dans le CRM MDO Services
# Usage : restore.sh backup_file.sql.gz

set -euo pipefail

FILE="${1:-}"
if [[ -z "${FILE}" || ! -f "${FILE}" ]]; then
  echo "Usage : $0 <backup_file.sql.gz>" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

read -rp "ATTENTION : cette operation va ECRASER la base actuelle. Continuer ? (tapez 'oui') " ans
[[ "$ans" == "oui" ]] || { echo "Annule."; exit 1; }

echo "Restauration de ${FILE} en cours..."
gunzip -c "${FILE}" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}"
echo "Restauration terminee. Redemarrer le backend :"
echo "  docker compose restart backend"
