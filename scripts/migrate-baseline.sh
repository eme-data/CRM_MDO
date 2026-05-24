#!/usr/bin/env bash
# Baseline une BDD existante (creee via prisma db push avant l'introduction des
# migrations versionnees) vers le systeme de migrations Prisma. A executer UNE
# SEULE FOIS lors du passage en mode migrate, AVANT de pull les nouvelles
# migrations applicatives (sinon la baseline contiendrait deja les modifications
# attendues et les migrations suivantes seraient considerees comme appliquees).
#
# Usage : sudo bash scripts/migrate-baseline.sh
#
# Etapes :
# 1. Si backend/prisma/migrations/0001_baseline/migration.sql n'existe pas :
#    genere le SQL de schema actuel (from-empty -> schema present) puis le copie
#    dans le repo pour commit par l'operateur.
# 2. Marque la baseline comme deja appliquee en BDD (resolve --applied).
# 3. A partir de ce point, le boot du backend utilisera `prisma migrate deploy`
#    pour toutes les migrations suivantes.
#
# Cf docs/prisma-migrations.md pour la procedure complete (incluant le commit
# du 0001_baseline genere et la desactivation du fallback db push).

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Erreur : .env manquant a la racine du repo"
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

MIG_NAME="0001_baseline"
MIG_DIR_REPO="backend/prisma/migrations/${MIG_NAME}"
MIG_FILE_REPO="${MIG_DIR_REPO}/migration.sql"

# ----- 1. Generation de la baseline si absente du repo -----
if [[ -f "${MIG_FILE_REPO}" ]]; then
  echo "[baseline] Deja presente dans le repo : ${MIG_FILE_REPO}"
else
  echo "[baseline] Generation depuis le schema actuel..."
  mkdir -p "${MIG_DIR_REPO}"
  # On genere dans le container (Prisma engine Linux fiable), puis on cat le
  # contenu sur l'hote via le volume monte. Le repo est typiquement monte en
  # `/app` dans l'image backend (cf Dockerfile COPY .).
  docker compose exec -T backend \
    npx prisma migrate diff \
      --from-empty \
      --to-schema-datamodel prisma/schema.prisma \
      --script \
    > "${MIG_FILE_REPO}"

  if [[ ! -s "${MIG_FILE_REPO}" ]]; then
    echo "Erreur : la baseline generee est vide. Verifiez que le container backend tourne."
    rm -f "${MIG_FILE_REPO}"
    exit 1
  fi
  echo "[baseline] Generee : ${MIG_FILE_REPO} ($(wc -l < "${MIG_FILE_REPO}") lignes)"
  echo "[baseline] IMPORTANT : commit ce fichier dans git apres execution."
fi

# ----- 2. Marquer comme deja appliquee en BDD -----
echo "[baseline] Marquage en BDD via prisma migrate resolve --applied..."
docker compose exec -T backend \
  npx prisma migrate resolve --applied "${MIG_NAME}"

echo ""
echo "[baseline] OK. Etapes suivantes :"
echo "  1. git add ${MIG_FILE_REPO} && git commit -m 'feat(prisma): baseline migration'"
echo "  2. Pull les migrations applicatives (ex: 0002_*) si pas deja fait."
echo "  3. Redemarrer le backend : docker compose restart backend"
echo "     -> 'prisma migrate deploy' appliquera les migrations suivantes."
echo "  4. Desactiver le fallback db push dans le .env : ALLOW_PRISMA_DB_PUSH_FALLBACK=false"
