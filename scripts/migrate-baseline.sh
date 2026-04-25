#!/usr/bin/env bash
# Baseline une BDD existante (creee via prisma db push) vers le systeme de
# migrations versionnees. A executer UNE seule fois lors du passage en migrate.
#
# Usage : sudo bash scripts/migrate-baseline.sh
#
# Etapes :
# 1. Genere le SQL de schema actuel ('--from-empty' to current schema)
# 2. Cree un dossier de migration baseline dans prisma/migrations/
# 3. Marque cette migration comme deja appliquee (resolve --applied)
# 4. Les MAJ de schema futures se feront via 'prisma migrate dev' en local

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Erreur : .env manquant"
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

MIG_NAME="0001_baseline"
MIG_DIR="backend/prisma/migrations/${MIG_NAME}"

if [[ -f "${MIG_DIR}/migration.sql" ]]; then
  echo "Migration baseline deja generee : ${MIG_DIR}/migration.sql"
else
  echo "Generation de la baseline..."
  mkdir -p "${MIG_DIR}"
  docker compose exec -T backend \
    npx prisma migrate diff \
      --from-empty \
      --to-schema-datamodel prisma/schema.prisma \
      --script \
    > "${MIG_DIR}/migration.sql"
  echo "Baseline generee dans ${MIG_DIR}/migration.sql"
fi

echo "Marquage de la baseline comme appliquee..."
docker compose exec -T backend \
  npx prisma migrate resolve --applied "${MIG_NAME}"

echo "Done. Les futures migrations passeront par 'prisma migrate dev' en local."
echo "N'oubliez pas de commit ${MIG_DIR} si elle vient d'etre creee."
