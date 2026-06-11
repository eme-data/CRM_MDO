#!/usr/bin/env bash
# =============================================================================
# CRM MDO Services - Deploiement rapide via images GHCR
# =============================================================================
# Pull les images preconstruites par la CI GitHub (workflow `release`) au lieu
# de rebuilder sur le serveur. Plus rapide, plus fiable (l'image qui tourne est
# exactement celle qui a passe la CI) et permet le rollback sur un SHA precis.
#
# Usage :
#   sudo bash deploy.sh                       # deploie la derniere image (latest)
#   sudo CRM_IMAGE_TAG=sha-abc1234 bash deploy.sh   # rollback sur un SHA precis
#
# Variables d'env :
#   INSTALL_DIR     (defaut /opt/crm-mdo)
#   CRM_IMAGE_TAG   (defaut latest) — tag d'image a deployer
#   SKIP_PULL       (=1 pour skip le git pull, ex. test d'un compose local)
#
# Prerequis : install-ubuntu.sh deja execute (stack initialisee, .env present,
# repo clone dans /opt/crm-mdo avec deploy key).
# =============================================================================

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/crm-mdo}"
CRM_IMAGE_TAG="${CRM_IMAGE_TAG:-latest}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "Ce script doit etre execute en root (sudo bash $0)"
  exit 1
fi

if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
  err "${INSTALL_DIR} n'est pas un repo git. Lancez d'abord scripts/install-ubuntu.sh"
  exit 1
fi

cd "${INSTALL_DIR}"

# 1. Maj du repo (pour recuperer eventuelles modifs de compose / config)
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  log "Pull du repo..."
  git pull --ff-only
  ok "Repo a jour : $(git log -1 --oneline)"
fi

# 2. Pull des images depuis GHCR
log "Pull des images (tag: ${CRM_IMAGE_TAG})..."
export CRM_IMAGE_TAG
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.deploy.yml \
  pull backend frontend
ok "Images pullees"

# 3. Redemarre la stack avec les nouvelles images. Postgres/Redis/Caddy sont
#    intouches (pas de changement d'image) — seuls backend et frontend sont
#    recrees, donc 0 downtime BDD et perte de session minimale (sessions JWT
#    cote client restent valides, refresh tokens en Redis intacts).
log "Redemarrage backend + frontend..."
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.deploy.yml \
  up -d --no-build backend frontend
ok "Containers redemarres"

# 4. Healthcheck : attend que le backend reponde sur /health
log "Attente backend healthy..."
for i in {1..30}; do
  if curl -fsS --max-time 3 http://localhost/health >/dev/null 2>&1; then
    ok "Backend OK"
    break
  fi
  sleep 2
  [[ $i -eq 30 ]] && {
    err "Backend ne repond pas apres 60s. Logs :"
    docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=30
    exit 1
  }
done

# 5. Recap
echo
ok "Deploiement reussi (tag: ${CRM_IMAGE_TAG})"
echo
echo "  Logs en live :"
echo "    docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend frontend"
echo
echo "  Rollback sur le tag precedent :"
echo "    CRM_IMAGE_TAG=sha-XXXXXXX sudo bash $0"
echo "    (liste des tags : https://github.com/eme-data/CRM_MDO/pkgs/container/crm-mdo-backend)"
