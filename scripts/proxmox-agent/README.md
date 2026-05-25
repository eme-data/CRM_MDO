# Agent CRM MDO — Proxmox monitoring

Push toutes les 5 minutes les métriques `pvesh get /cluster/resources` d'un cluster Proxmox VE vers le CRM MDO Services. Pas d'ouverture firewall côté client (push sortant HTTPS uniquement).

## Architecture

```
[Proxmox node]                          [CRM MDO]
  agent.sh ─(POST HTTPS + token)──>  /api/proxmox/ingest/:clusterId
   │                                       │
   └─ pvesh /cluster/resources             └─ ProxmoxSnapshot (timeseries)
                                              + agrégats denormalisés
                                              (cpu%, mem%, disk%, VMs)
```

## Installation sur un Proxmox client

1. **Côté CRM** : créer le cluster dans l'UI super-admin (à venir : page `/companies/[id]/proxmox`). Noter `cluster_id` et le `token` affiché UNE FOIS.

2. **Côté Proxmox** : copier les 2 scripts sur le nœud manager (le 1er du cluster, là où vous exécutez `pvesh` habituellement) :
   ```bash
   scp proxmox-agent.sh install-on-proxmox.sh root@pve01.client.lan:/root/
   ssh root@pve01.client.lan
   cd /root && bash install-on-proxmox.sh
   ```

3. **Configurer** `/etc/crm-mdo/proxmox-agent.env` (chmod 600) :
   ```bash
   export CRM_ENDPOINT="https://crm.mdoservices.fr/api/proxmox/ingest/<cluster_id>"
   export CRM_TOKEN="mdopx_xxxxxxxxxxxxxxxxxxxxxxxx"
   ```

4. **Tester** :
   ```bash
   /usr/local/sbin/crm-mdo-agent --debug
   # OK push 18 resources (HTTP 200|201)
   ```

5. **Cron actif** : le push tourne toutes les 5 min via `/etc/cron.d/crm-mdo-agent`. Log dans `/var/log/crm-mdo-agent.log` (rotation hebdo, 4 semaines).

## Désinstallation

```bash
rm -f /usr/local/sbin/crm-mdo-agent
rm -f /etc/cron.d/crm-mdo-agent
rm -f /etc/logrotate.d/crm-mdo-agent
rm -rf /etc/crm-mdo/
rm -f /var/log/crm-mdo-agent.log*
```

## Sécurité

- Le token est hashé côté CRM (SHA-256). Si compromis : rotation depuis l'UI CRM.
- L'endpoint d'ingest est rate-limité (palier `medium` global NestJS : 600 req / 10 min / IP).
- Comparaison du hash en timing-safe côté CRM (pas d'attaque par timing).
- `pvesh` tourne en root sur le Proxmox (nécessaire pour lire `/cluster/resources`).
- L'agent ne lit RIEN d'autre que les agrégats Proxmox (pas de credentials, pas de configs VM).

## Que voit le CRM ?

Le payload est `pvesh get /cluster/resources --output-format=json`, soit :
- Pour chaque **nœud** : status (online/offline), uptime, cpu (0-1), maxcpu, mem/maxmem (bytes), disk/maxdisk
- Pour chaque **VM** (qemu/lxc) : status (running/stopped), uptime, vmid, name, node, cpu/mem/disk + leurs max
- Pour chaque **storage** : id, status, disk/maxdisk, shared (0/1)

Aucune donnée applicative (contenu disque, configs VM, mots de passe) — uniquement des compteurs de performance.

## Dépannage

```bash
# Test manuel verbeux
/usr/local/sbin/crm-mdo-agent --debug

# Logs récents
tail -50 /var/log/crm-mdo-agent.log

# Vérifier que pvesh marche
pvesh get /cluster/resources --output-format=json | jq 'length'

# Vérifier la connectivité au CRM
curl -fsS -o /dev/null -w "%{http_code}\n" "${CRM_ENDPOINT}" -X POST \
  -H "X-Proxmox-Token: ${CRM_TOKEN}" -H "Content-Type: application/json" \
  -d '{"resources":[]}'
# Attendu : 200 ou 400 (payload vide refuse mais auth OK)
```

Si HTTP 401/403 : token invalide → régénérer depuis l'UI CRM.
Si HTTP 404 : cluster_id invalide → vérifier l'URL CRM_ENDPOINT.
Si timeout / DNS : firewall sortant à ouvrir vers `crm.mdoservices.fr:443`.
