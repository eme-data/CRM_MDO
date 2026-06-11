#!/usr/bin/env bash
# =============================================================================
# CRM - Mise a jour de toutes les instances clientes
# =============================================================================
# Usage :
#   sudo bash update-all-clients.sh [--ref main] [--instance crm-seysses] [--dry-run]
#
# Itere sur tous les /opt/crm-* (chaque DSI a sa stack), git pull + rebuild +
# restart. Sequentiel : on attend qu'une instance soit healthy avant de passer
# a la suivante. En cas d'echec sur une instance, on stoppe et on remonte
# l'erreur (les autres deja MAJ restent OK).
# =============================================================================

set -euo pipefail

INSTALL_BASE="${INSTALL_BASE:-/opt}"
GIT_REF=""
ONLY_INSTANCE=""
DRY_RUN=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERREUR]${NC} $*" >&2; }

usage() {
  cat <<EOF
Usage: sudo bash $0 [options]
  --ref <branch|tag>      Force checkout sur cette branche/tag avant pull
                          (defaut : pull sur la branche courante)
  --instance <dirname>    Ne mettre a jour qu'une seule instance (ex: crm-seysses)
  --dry-run               Affiche ce qui serait fait sans toucher a rien
  -h, --help              Affiche cette aide

Variables d'env :
  INSTALL_BASE (defaut /opt)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)        GIT_REF="$2"; shift 2;;
    --instance)   ONLY_INSTANCE="$2"; shift 2;;
    --dry-run)    DRY_RUN=1; shift;;
    -h|--help)    usage; exit 0;;
    *) err "Argument inconnu : $1"; usage; exit 1;;
  esac
done

[[ $EUID -ne 0 ]] && { err "Lancer en root (sudo bash $0)"; exit 1; }

# Decouverte des instances : tout /opt/crm-* qui contient un docker-compose.yml
INSTANCES=()
for dir in "${INSTALL_BASE}"/crm-*; do
  [[ -d "$dir" ]] || continue
  [[ -f "${dir}/docker-compose.yml" ]] || continue
  name=$(basename "$dir")
  if [[ -n "$ONLY_INSTANCE" && "$name" != "$ONLY_INSTANCE" ]]; then
    continue
  fi
  INSTANCES+=("$dir")
done

if [[ ${#INSTANCES[@]} -eq 0 ]]; then
  warn "Aucune instance trouvee dans ${INSTALL_BASE}/crm-*"
  exit 0
fi

log "============================================================"
log "Update de ${#INSTANCES[@]} instance(s)"
[[ -n "$GIT_REF" ]] && log "Ref cible : ${GIT_REF}"
[[ "$DRY_RUN" -eq 1 ]] && warn "Mode dry-run : aucune action effective"
log "============================================================"

FAILED=()
SUCCESS=()

for dir in "${INSTANCES[@]}"; do
  name=$(basename "$dir")
  log ""
  log "--- ${name} (${dir})"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] git pull + rebuild + restart"
    continue
  fi

  cd "$dir"

  # Backup safety net avant la mise a jour (utile si la migration db push casse
  # quelque chose en cas de schema drift)
  if [[ -f "${dir}/scripts/backup.sh" ]]; then
    bash "${dir}/scripts/backup.sh" || warn "Backup pre-update echoue (on continue)"
  fi

  # Pull / checkout
  if [[ -n "$GIT_REF" ]]; then
    git fetch --all --tags
    git checkout "$GIT_REF" || { err "Checkout ${GIT_REF} echoue"; FAILED+=("$name"); continue; }
    git pull --ff-only || warn "Pull en avance, peut etre OK si tag fixe"
  else
    git pull --ff-only || { err "Pull echoue (conflit ?)"; FAILED+=("$name"); continue; }
  fi

  # Build + restart
  if ! docker compose -f docker-compose.yml -f docker-compose.prod.yml build; then
    err "Build echoue pour ${name}"
    FAILED+=("$name")
    continue
  fi
  if ! docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d; then
    err "Up -d echoue pour ${name}"
    FAILED+=("$name")
    continue
  fi

  # Healthcheck rapide
  log "Verif health backend..."
  HEALTHY=0
  for i in {1..20}; do
    if docker compose exec -T backend wget -qO- http://localhost:4000/health >/dev/null 2>&1; then
      HEALTHY=1
      break
    fi
    sleep 3
  done
  if [[ $HEALTHY -eq 1 ]]; then
    ok "${name} : update OK"
    SUCCESS+=("$name")
  else
    err "${name} : backend ne repond pas apres 60s"
    FAILED+=("$name")
  fi
done

# ----- Resume -----
log ""
log "============================================================"
log "Resume"
log "============================================================"
ok "Succes (${#SUCCESS[@]}) : ${SUCCESS[*]:-}"
[[ ${#FAILED[@]} -gt 0 ]] && err "Echecs (${#FAILED[@]}) : ${FAILED[*]}"
[[ ${#FAILED[@]} -eq 0 ]] && ok "Toutes les instances a jour"
log "============================================================"

[[ ${#FAILED[@]} -gt 0 ]] && exit 1
exit 0
