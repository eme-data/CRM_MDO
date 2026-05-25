#!/usr/bin/env bash
# =============================================================================
# install-on-proxmox.sh — Installer l'agent CRM MDO sur un noeud Proxmox
# =============================================================================
# A executer sur un noeud Proxmox VE en root. Le script :
#   1. Copie proxmox-agent.sh dans /usr/local/sbin/crm-mdo-agent
#   2. Cree /etc/crm-mdo/ et un squelette de config (chmod 600)
#   3. Installe le cron systeme (toutes les 5 min, log dans /var/log/)
#   4. Ne lance PAS l'agent : il faut d'abord renseigner CRM_ENDPOINT/TOKEN.
#
# Usage :
#   sudo bash install-on-proxmox.sh
#   sudo $EDITOR /etc/crm-mdo/proxmox-agent.env    # configurer
#   sudo /usr/local/sbin/crm-mdo-agent --debug     # test manuel
# =============================================================================

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] Doit etre execute en root (sudo)."
  exit 1
fi
if ! command -v pvesh >/dev/null 2>&1; then
  echo "[ERROR] pvesh introuvable. Ce script doit tourner sur un noeud Proxmox VE."
  exit 1
fi

SCRIPT_SRC="$(dirname "$(realpath "$0")")/proxmox-agent.sh"
if [[ ! -f "${SCRIPT_SRC}" ]]; then
  echo "[ERROR] ${SCRIPT_SRC} introuvable. Copier ce script ET proxmox-agent.sh dans le meme repertoire."
  exit 1
fi

echo "[1/4] Installation des dependances (curl, jq)..."
apt-get update -qq
apt-get install -y -qq curl jq

echo "[2/4] Copie de l'agent dans /usr/local/sbin/crm-mdo-agent..."
install -m 0755 "${SCRIPT_SRC}" /usr/local/sbin/crm-mdo-agent

echo "[3/4] Configuration squelette /etc/crm-mdo/proxmox-agent.env..."
mkdir -p /etc/crm-mdo
chmod 700 /etc/crm-mdo
if [[ ! -f /etc/crm-mdo/proxmox-agent.env ]]; then
  cat > /etc/crm-mdo/proxmox-agent.env <<'ENV_EOF'
# Configuration de l'agent CRM MDO Proxmox monitoring.
# Generer cluster_id + token dans l'UI CRM (super-admin -> Proxmox).
# chmod 600 obligatoire pour eviter de leaker le token.
#
# CRM_ENDPOINT : URL complete /api/proxmox/ingest/<cluster_id>
# CRM_TOKEN    : secret en clair affiche UNE FOIS a la creation du cluster
#                (commence par "mdopx_"). Si perdu, regenerer via UI CRM.

# export CRM_ENDPOINT="https://crm.mdoservices.fr/api/proxmox/ingest/REPLACE_WITH_CLUSTER_ID"
# export CRM_TOKEN="mdopx_REPLACE_WITH_TOKEN"
ENV_EOF
  chmod 600 /etc/crm-mdo/proxmox-agent.env
  echo "       Cree (chmod 600). EDITEZ-LE avec CRM_ENDPOINT + CRM_TOKEN avant de continuer."
else
  echo "       Existant deja, non touche."
fi

echo "[4/4] Cron systeme toutes les 5 min..."
cat > /etc/cron.d/crm-mdo-agent <<'CRON_EOF'
# Push metrics Proxmox vers le CRM MDO Services toutes les 5 minutes
*/5 * * * * root /usr/local/sbin/crm-mdo-agent >> /var/log/crm-mdo-agent.log 2>&1
CRON_EOF
chmod 644 /etc/cron.d/crm-mdo-agent
touch /var/log/crm-mdo-agent.log
chmod 644 /var/log/crm-mdo-agent.log

# logrotate pour eviter que le log gonfle (4 semaines de retention)
cat > /etc/logrotate.d/crm-mdo-agent <<'LOG_EOF'
/var/log/crm-mdo-agent.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    copytruncate
}
LOG_EOF

echo
echo "=============================================="
echo "  Installation OK."
echo "=============================================="
echo "  Prochaine etape :"
echo "    sudo \$EDITOR /etc/crm-mdo/proxmox-agent.env"
echo "    sudo /usr/local/sbin/crm-mdo-agent --debug   # test"
echo "    tail -f /var/log/crm-mdo-agent.log           # surveiller"
echo
