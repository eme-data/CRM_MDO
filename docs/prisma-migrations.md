# Migrations Prisma — runbook

## Pourquoi ce changement

Jusqu'a 2026-05, le backend boot synchronisait le schema en prod avec
`prisma db push --accept-data-loss` (fallback). C'etait une bombe a retardement
en multi-instance DSI :

- Aucune trace de quelle version de schema tourne en prod.
- Suppression silencieuse de colonnes si un dev en retirait une localement.
- Race conditions possibles si deux pods backend boot en parallele.
- Aucun rollback possible.

On bascule donc sur `prisma migrate deploy` (idempotent, trace, sur-cas).
La premiere migration est une baseline qui photographie le schema present en
prod ; les modifications suivantes sont des deltas additifs.

## Etat actuel du repo

- `backend/prisma/migrations/migration_lock.toml` — provider postgres.
- `backend/prisma/migrations/0002_email_log_tenant_id/migration.sql` — premier
  delta committe (ajout `EmailLog.tenantId` + index + FK).
- `backend/prisma/migrations/0001_baseline/migration.sql` — **a generer en prod
  existante avant le premier deploiement avec migrations** (cf section ci-dessous).

Pour une **nouvelle installation** (1er client DSI, ex. Mairie de SEYSSES sur
une BDD vide), pas de baseline necessaire — `prisma migrate deploy` cree tout
depuis zero a partir des migrations du repo.

## Procedure : activer les migrations sur une prod existante

A faire UNE SEULE FOIS sur chaque serveur deja en prod (SRV-MDSE00-076 etc.).

```bash
# Sur le serveur, dans le repo du CRM
cd /opt/crm-mdo

# 1. Pull le code (inclut Dockerfile modifie, scripts/migrate-baseline.sh,
#    et la migration 0002_email_log_tenant_id).
git pull

# 2. Build et boot avec le fallback db push encore actif (transitoire).
echo 'ALLOW_PRISMA_DB_PUSH_FALLBACK=true' >> .env  # si pas deja present
docker compose build backend
docker compose up -d backend

# 3. Generer la baseline + la marquer comme appliquee en BDD.
sudo bash scripts/migrate-baseline.sh

# 4. Commit le 0001_baseline genere depuis ce serveur.
#    (Une seule fois suffit : tous les autres serveurs reutiliseront ce 0001.)
git add backend/prisma/migrations/0001_baseline/migration.sql
git commit -m "feat(prisma): baseline migration generee depuis prod"
git push

# 5. Desactiver le fallback db push :
sed -i 's/^ALLOW_PRISMA_DB_PUSH_FALLBACK=.*/ALLOW_PRISMA_DB_PUSH_FALLBACK=false/' .env

# 6. Restart pour appliquer 0002 (et toutes les migrations suivantes) via
#    `prisma migrate deploy` :
docker compose restart backend
docker compose logs --tail=30 backend | grep -i "migrat"
```

Resultat : la BDD a maintenant `EmailLog.tenantId` (migration 0002 appliquee)
et le boot du backend echouera explicitement si une migration manque (plus de
silence).

## Procedure : nouvelle installation

Pour un nouveau serveur (1er deploiement, BDD vide), aucune action speciale :

```bash
sudo bash scripts/install-ubuntu.sh
# Au boot du backend, `prisma migrate deploy` applique 0001_baseline puis
# toutes les migrations suivantes en ordre.
```

Note : `install-ubuntu.sh` ne positionne pas `ALLOW_PRISMA_DB_PUSH_FALLBACK`
par defaut → le fallback est desactive (defaut `false` dans le Dockerfile).
C'est volontaire : on veut planter au boot plutot que masquer un schema mal
provisionne sur les installs neuves.

## Ajouter une nouvelle migration

```bash
# En local (dev), apres avoir modifie backend/prisma/schema.prisma :
cd backend
npx prisma migrate dev --name nom_descriptif_court

# Verifier que la migration generee fait ce qu'on attend.
git add prisma/migrations/<timestamp>_nom_descriptif_court/
git commit -m "feat(prisma): <description>"

# En prod : git pull && docker compose restart backend
# `migrate deploy` applique automatiquement les nouvelles migrations.
```

## Verifier l'etat en prod

```bash
docker compose exec backend npx prisma migrate status
```

Doit retourner `Database schema is up to date!` apres un deploiement reussi.
Si "Following migration(s) have not been applied" → un `docker compose
restart backend` les applique. Si "drifted" → le schema reel diverge de la
serie de migrations, intervenir manuellement (cf section ci-dessous).

## Resoudre un drift

Symptome : `prisma migrate status` indique que la BDD a des changements non
traces (typiquement apres un hotfix SQL manuel). Pour reconcilier :

```bash
# Generer le diff entre l'etat attendu (schema + migrations) et l'etat reel :
docker compose exec backend \
  npx prisma migrate diff \
    --from-migrations prisma/migrations \
    --to-schema-datasource prisma/schema.prisma \
    --script > /tmp/drift.sql

# Inspecter /tmp/drift.sql. Si les changements sont attendus, en faire une
# migration committable :
mkdir -p backend/prisma/migrations/$(date +%Y%m%d%H%M%S)_drift_repair
mv /tmp/drift.sql backend/prisma/migrations/<timestamp>_drift_repair/migration.sql

# Marquer la migration comme appliquee (la BDD l'a deja effectivement) :
docker compose exec backend \
  npx prisma migrate resolve --applied <timestamp>_drift_repair
```

## Garde-fous

- Le Dockerfile bloque le boot si aucune migration trouvee (sauf
  `ALLOW_PRISMA_DB_PUSH_FALLBACK=true`).
- `migrate-baseline.sh` est idempotent : il ne re-genere pas la baseline si
  elle existe deja dans le repo.
- Les migrations sont ordonnees alphabetiquement → `0001_*` toujours avant
  `0002_*` avant les `<timestamp>_*` futurs.
