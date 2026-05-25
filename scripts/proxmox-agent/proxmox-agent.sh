#!/usr/bin/env bash
# =============================================================================
# proxmox-agent.sh — Push metrics depuis un cluster Proxmox VE vers le CRM MDO
# =============================================================================
# A installer sur UN noeud Proxmox du cluster (idealement le manager / 1er noeud).
# Lance toutes les 5 minutes via cron ou systemd timer. Le script :
#   1. Appelle `pvesh get /cluster/resources --output-format=json` localement
#   2. Wrap dans un JSON { capturedAtUnix, resources: [...] }
#   3. POST vers le CRM avec un header X-Proxmox-Token
#
# Pas besoin d'ouvrir le firewall du Proxmox (push-based) — il faut juste un
# acces sortant HTTPS vers le CRM (mdoservices.fr en standard).
#
# Configuration : /etc/crm-mdo/proxmox-agent.env (chmod 600), contient :
#   CRM_ENDPOINT="https://crm.mdoservices.fr/api/proxmox/ingest/<cluster_id>"
#   CRM_TOKEN="mdopx_xxxxxxxxxxxxxxxxxxxxxxxx"
#
# Le cluster_id + le token sont generes a la creation du cluster depuis l'UI
# super-admin CRM (/admin/tenants ou /companies/<id>/proxmox).
#
# Installation :
#   1. Copier ce script sur le Proxmox :
#        scp proxmox-agent.sh root@pve01.client.lan:/usr/local/sbin/crm-mdo-agent
#        ssh root@pve01.client.lan "chmod +x /usr/local/sbin/crm-mdo-agent"
#   2. Creer /etc/crm-mdo/proxmox-agent.env (chmod 600) avec les variables.
#   3. Cron : echo "*/5 * * * * root /usr/local/sbin/crm-mdo-agent >> /var/log/crm-mdo-agent.log 2>&1" > /etc/cron.d/crm-mdo-agent
#   4. Test manuel : /usr/local/sbin/crm-mdo-agent --debug
# =============================================================================

set -euo pipefail

CONFIG_FILE="${CRM_AGENT_CONFIG:-/etc/crm-mdo/proxmox-agent.env}"
DEBUG=0
if [[ "${1:-}" == "--debug" ]]; then DEBUG=1; fi

log() {
  echo "[$(date -Iseconds)] $*"
}
debug() {
  if [[ "${DEBUG}" -eq 1 ]]; then echo "[debug] $*" >&2; fi
}

# ---- Pre-requis ------------------------------------------------------------
if ! command -v pvesh >/dev/null 2>&1; then
  log "[ERROR] pvesh introuvable. Ce script doit tourner sur un noeud Proxmox VE."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  log "[ERROR] curl introuvable. apt-get install curl"
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  log "[ERROR] jq introuvable. apt-get install jq"
  exit 1
fi

if [[ ! -r "${CONFIG_FILE}" ]]; then
  log "[ERROR] Config absente : ${CONFIG_FILE}"
  log "       Creez le fichier avec CRM_ENDPOINT et CRM_TOKEN (chmod 600)."
  exit 1
fi
# shellcheck disable=SC1090
source "${CONFIG_FILE}"

if [[ -z "${CRM_ENDPOINT:-}" || -z "${CRM_TOKEN:-}" ]]; then
  log "[ERROR] CRM_ENDPOINT ou CRM_TOKEN manquant dans ${CONFIG_FILE}"
  exit 1
fi

# ---- Collecte des metriques ------------------------------------------------
debug "Appel pvesh get /cluster/resources..."
RESOURCES_JSON=$(pvesh get /cluster/resources --output-format=json 2>/dev/null)
if [[ -z "${RESOURCES_JSON}" ]]; then
  log "[ERROR] pvesh n'a rien retourne. Verifier que pveproxy tourne."
  exit 1
fi

# Valide que c'est un tableau JSON valide
if ! echo "${RESOURCES_JSON}" | jq -e 'type == "array"' >/dev/null 2>&1; then
  log "[ERROR] La sortie pvesh n'est pas un tableau JSON valide."
  exit 1
fi

RESOURCE_COUNT=$(echo "${RESOURCES_JSON}" | jq 'length')
debug "Ressources collectees : ${RESOURCE_COUNT}"

# ---- Construction du payload -----------------------------------------------
NOW=$(date +%s)
PAYLOAD=$(jq -n \
  --argjson resources "${RESOURCES_JSON}" \
  --argjson capturedAtUnix "${NOW}" \
  '{capturedAtUnix: $capturedAtUnix, resources: $resources}')

# ---- Push vers le CRM ------------------------------------------------------
debug "POST ${CRM_ENDPOINT}"
HTTP_CODE=$(curl -sS -o /tmp/crm-mdo-agent-response.json -w "%{http_code}" \
  --max-time 30 \
  --connect-timeout 10 \
  -X POST "${CRM_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "X-Proxmox-Token: ${CRM_TOKEN}" \
  -d "${PAYLOAD}" \
  || echo "000")

RESPONSE=$(cat /tmp/crm-mdo-agent-response.json 2>/dev/null || echo "")
rm -f /tmp/crm-mdo-agent-response.json

if [[ "${HTTP_CODE}" == "200" || "${HTTP_CODE}" == "201" ]]; then
  log "OK push ${RESOURCE_COUNT} resources (HTTP ${HTTP_CODE})"
  if [[ "${DEBUG}" -eq 1 ]]; then echo "${RESPONSE}" | jq . 2>/dev/null || echo "${RESPONSE}"; fi
  exit 0
elif [[ "${HTTP_CODE}" == "000" ]]; then
  log "[ERROR] Pas de reponse du CRM (timeout / DNS / reseau). Endpoint : ${CRM_ENDPOINT}"
  exit 2
else
  log "[ERROR] CRM a refuse le push (HTTP ${HTTP_CODE}) : ${RESPONSE}"
  exit 3
fi
