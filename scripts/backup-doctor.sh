#!/usr/bin/env bash
# =============================================================================
# backup-doctor.sh — Diagnostic complet des 3 systemes de backup CRM MDO
# =============================================================================
# Usage : sudo bash scripts/backup-doctor.sh
#
# Verifie en sequence :
#   1. Cron interne NestJS (system-backup, 02:30) : settings BDD + volume
#   2. Cron host local (backup.sh, 03:00) : /var/log + dumps recents
#   3. Cron host offsite (backup-offsite.sh, 04:00) : restic + heartbeat
#   4. Endpoint /health : checks.backupOffsite expose-t-il un OK ?
#
# Aucune ecriture, aucune modification : lecture seule, safe en prod.
# =============================================================================

set -u

# Couleurs ANSI
RED=$'\033[0;31m'
GRN=$'\033[0;32m'
YEL=$'\033[0;33m'
BLU=$'\033[0;34m'
DIM=$'\033[2m'
RST=$'\033[0m'

ok()   { echo "${GRN}[OK]${RST}   $*"; }
warn() { echo "${YEL}[WARN]${RST} $*"; }
err()  { echo "${RED}[KO]${RST}   $*"; }
info() { echo "${BLU}[i]${RST}    $*"; }
dim()  { echo "${DIM}       $*${RST}"; }

INSTALL_DIR="${CRM_INSTALL_DIR:-/opt/crm-mdo}"
cd "${INSTALL_DIR}" 2>/dev/null || { err "INSTALL_DIR introuvable : ${INSTALL_DIR}"; exit 1; }

# Source .env pour POSTGRES_USER / POSTGRES_DB
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

echo
echo "===================================================================="
echo "  Backup doctor — diagnostic CRM MDO Services"
echo "  Repertoire : ${INSTALL_DIR}"
echo "  Date       : $(date -Iseconds)"
echo "===================================================================="

# --------- Section 1 : Cron interne NestJS ----------
echo
info "1. Cron interne NestJS (@Cron 02:30 dans system-backup.service.ts)"

if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^backend$'; then
  ok "Container backend up"
else
  err "Container backend down — le cron ne tourne pas"
fi

if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^postgres$'; then
  ok "Container postgres up"
else
  err "Container postgres down"
fi

# Settings systemBackup.* en BDD
SETTINGS_QUERY="SELECT key, value FROM settings WHERE key LIKE 'systemBackup%' AND \"tenantId\" IS NULL ORDER BY key;"
SETTINGS_OUT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-crm_mdo}" -d "${POSTGRES_DB:-crm_mdo}" -t -c "${SETTINGS_QUERY}" 2>/dev/null | sed 's/^[[:space:]]*//;/^$/d')
if [[ -n "${SETTINGS_OUT}" ]]; then
  ok "Settings systemBackup.* presents en BDD :"
  echo "${SETTINGS_OUT}" | sed 's/^/       /'
  if echo "${SETTINGS_OUT}" | grep -q 'systemBackup.dailyAuto.*true'; then
    ok "Cron auto active (systemBackup.dailyAuto=true)"
  else
    warn "systemBackup.dailyAuto != true -> cron 02:30 skip silencieusement"
    dim "Fix : Admin UI -> Settings -> system-backup -> activer 'Backup automatique quotidien'"
  fi
else
  warn "Aucun setting systemBackup.* en BDD -> defaults appliques (dailyAuto=true par seed)"
  dim "Si vide, le SettingsService.onModuleInit doit recreer au prochain reboot backend."
fi

# Volume system-backups
VOL_NAME=$(docker volume ls --format '{{.Name}}' | grep -E '_system-backups$' | head -1)
if [[ -n "${VOL_NAME}" ]]; then
  ok "Volume Docker present : ${VOL_NAME}"
  BACKUP_COUNT=$(docker compose exec -T backend sh -c 'find /app/backups -name "*.tar.gz" -type f 2>/dev/null | wc -l' 2>/dev/null | tr -d '\r ')
  if [[ "${BACKUP_COUNT:-0}" -gt 0 ]]; then
    ok "Backups .tar.gz dans /app/backups : ${BACKUP_COUNT}"
    LAST_BACKUP=$(docker compose exec -T backend sh -c 'ls -t /app/backups/*/*/crm-mdo-backup-*.tar.gz 2>/dev/null | head -1' 2>/dev/null | tr -d '\r')
    [[ -n "${LAST_BACKUP}" ]] && dim "Dernier : ${LAST_BACKUP}"
  else
    warn "Aucun .tar.gz dans /app/backups -> le cron 02:30 n'a probablement jamais tourne"
    dim "Test manuel : Admin UI -> System Backup -> Bouton 'Backup BDD seule'"
    dim "Ou via cron-dashboard : POST /cron-jobs/system-backup-daily/run"
  fi
else
  err "Volume Docker system-backups introuvable"
fi

# --------- Section 2 : Cron host local (backup.sh) ----------
echo
info "2. Cron host local (backup.sh @ 03:00, dump /var/backups/crm-mdo)"

if [[ -f /etc/cron.d/crm-mdo-backup ]]; then
  ok "Cron file present : /etc/cron.d/crm-mdo-backup"
else
  err "Cron file absent : /etc/cron.d/crm-mdo-backup"
  dim "Fix : relancer 'sudo bash ${INSTALL_DIR}/scripts/install-ubuntu.sh --upgrade'"
fi

if systemctl is-active cron >/dev/null 2>&1; then
  ok "Service cron actif"
else
  err "Service cron inactif -> aucun cron host ne tourne"
fi

BACKUP_LOG=/var/log/crm-mdo-backup.log
if [[ -f "${BACKUP_LOG}" ]]; then
  LAST_LOG_LINE=$(tail -1 "${BACKUP_LOG}" 2>/dev/null)
  LAST_LOG_TS=$(stat -c %Y "${BACKUP_LOG}" 2>/dev/null || echo 0)
  AGE_HOURS=$(( ( $(date +%s) - LAST_LOG_TS ) / 3600 ))
  if [[ "${AGE_HOURS}" -lt 26 ]]; then
    ok "Log frais (mis a jour il y a ${AGE_HOURS}h) : ${BACKUP_LOG}"
  else
    warn "Log vieux de ${AGE_HOURS}h (devrait < 26h) : ${BACKUP_LOG}"
  fi
  [[ -n "${LAST_LOG_LINE}" ]] && dim "Derniere ligne : ${LAST_LOG_LINE}"
else
  warn "${BACKUP_LOG} absent -> le cron 03:00 n'a jamais ecrit (jamais tourne ?)"
fi

if [[ -d /var/backups/crm-mdo ]]; then
  DUMP_COUNT=$(find /var/backups/crm-mdo -name 'crm_mdo_*.sql.gz' -type f 2>/dev/null | wc -l)
  if [[ "${DUMP_COUNT}" -gt 0 ]]; then
    ok "Dumps SQL locaux : ${DUMP_COUNT}"
    LAST_DUMP=$(ls -t /var/backups/crm-mdo/crm_mdo_*.sql.gz 2>/dev/null | head -1)
    [[ -n "${LAST_DUMP}" ]] && dim "Dernier : $(ls -lh "${LAST_DUMP}" | awk '{print $9, $5, $6, $7, $8}')"
  else
    warn "Aucun dump dans /var/backups/crm-mdo"
  fi
else
  err "/var/backups/crm-mdo inexistant"
fi

# --------- Section 3 : Cron offsite (restic) ----------
echo
info "3. Cron host offsite (backup-offsite.sh @ 04:00, restic chiffre)"

if command -v restic >/dev/null 2>&1; then
  ok "restic installe ($(restic version 2>/dev/null | head -1))"
else
  err "restic non installe -> apt-get install restic"
fi

if [[ -r /etc/crm-mdo/backup.env ]]; then
  ok "/etc/crm-mdo/backup.env present et lisible"
  # Source dans subshell pour pas polluer
  (
    set -a; . /etc/crm-mdo/backup.env; set +a
    if [[ -n "${RESTIC_REPOSITORY:-}" && -n "${RESTIC_PASSWORD:-}" ]]; then
      ok "RESTIC_REPOSITORY et RESTIC_PASSWORD definis"
      dim "Repository : ${RESTIC_REPOSITORY}"
      if restic cat config >/dev/null 2>&1; then
        ok "Repo restic initialise et accessible"
        LAST_SNAP=$(restic snapshots --latest 1 --compact 2>/dev/null | tail -2 | head -1)
        [[ -n "${LAST_SNAP}" ]] && dim "Dernier snapshot : ${LAST_SNAP}"
      else
        err "Repo restic inaccessible ou non initialise"
        dim "Fix : source /etc/crm-mdo/backup.env && restic init"
      fi
    else
      err "RESTIC_REPOSITORY ou RESTIC_PASSWORD manquant dans backup.env"
    fi
  )
else
  err "/etc/crm-mdo/backup.env absent -> AUCUN OFFSITE ne tourne"
  dim "CAUSE LA PLUS FREQUENTE du 'backup ne fonctionne pas'."
  dim "Fix :"
  dim "  sudo cp /etc/crm-mdo/backup.env.example /etc/crm-mdo/backup.env"
  dim "  sudo \$EDITOR /etc/crm-mdo/backup.env   # configurer provider"
  dim "  sudo chmod 600 /etc/crm-mdo/backup.env"
  dim "  sudo -E bash -c 'source /etc/crm-mdo/backup.env && restic init'"
fi

OFFSITE_LOG=/var/log/crm-mdo-backup-offsite.log
if [[ -f "${OFFSITE_LOG}" ]]; then
  LAST_OFFSITE=$(tail -3 "${OFFSITE_LOG}" 2>/dev/null)
  dim "Dernieres lignes ${OFFSITE_LOG} :"
  echo "${LAST_OFFSITE}" | sed 's/^/       /'
else
  warn "${OFFSITE_LOG} absent"
fi

# Heartbeat
HEARTBEAT_RAW=$(docker compose exec -T backend cat /app/backups/.offsite-lastrun 2>/dev/null | tr -d '\r\n ')
if [[ -n "${HEARTBEAT_RAW}" && "${HEARTBEAT_RAW}" =~ ^[0-9]+$ ]]; then
  HEARTBEAT_AGE=$(( $(date +%s) - HEARTBEAT_RAW ))
  HEARTBEAT_DATE=$(date -d "@${HEARTBEAT_RAW}" 2>/dev/null || echo "(parsing KO)")
  if [[ "${HEARTBEAT_AGE}" -lt 93600 ]]; then  # 26h
    ok "Heartbeat offsite frais : ${HEARTBEAT_DATE}"
  elif [[ "${HEARTBEAT_AGE}" -lt 604800 ]]; then  # 7j
    warn "Heartbeat offsite ancien (>26h) : ${HEARTBEAT_DATE}"
  else
    err "Heartbeat offsite trop vieux (>7j) : ${HEARTBEAT_DATE}"
  fi
else
  err "Heartbeat /app/backups/.offsite-lastrun absent ou invalide"
  dim "/health renvoie donc backupOffsite.status=disabled"
fi

# --------- Section 4 : Endpoint /health ----------
echo
info "4. Endpoint /health (synthese remontee aux supervisions externes)"

HEALTH_JSON=$(curl -fsS --max-time 5 http://localhost:4000/health 2>/dev/null)
if [[ -n "${HEALTH_JSON}" ]]; then
  STATUS=$(echo "${HEALTH_JSON}" | grep -oP '"status"\s*:\s*"\K[^"]+' | head -1)
  OFFSITE_STATUS=$(echo "${HEALTH_JSON}" | grep -oP '"backupOffsite"\s*:\s*\{[^}]*"status"\s*:\s*"\K[^"]+' | head -1)
  case "${STATUS}" in
    ok)       ok "Status global : ok" ;;
    degraded) warn "Status global : degraded" ;;
    *)        err "Status global : ${STATUS:-inconnu}" ;;
  esac
  case "${OFFSITE_STATUS}" in
    ok)       ok "backupOffsite : ok" ;;
    warn)     warn "backupOffsite : warn (heartbeat > 26h)" ;;
    ko)       err "backupOffsite : ko (heartbeat > 7j)" ;;
    disabled) warn "backupOffsite : disabled (heartbeat absent)" ;;
    *)        err "backupOffsite : ${OFFSITE_STATUS:-inconnu}" ;;
  esac
else
  err "/health ne repond pas sur localhost:4000"
fi

echo
echo "===================================================================="
echo "  Resume : si toutes les sections sont [OK], le backup est sain."
echo "  Sinon, fixer en partant du haut (section 1 = backups internes)."
echo "===================================================================="
echo
