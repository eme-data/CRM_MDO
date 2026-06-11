# -------- base --------
FROM node:20-alpine AS base
WORKDIR /app
# openssl pour Prisma (engine), wget pour HEALTHCHECK, dumb-init pour PID 1,
# postgresql16-client pour pg_dump/pg_restore via le module system-backup
# (backup/restore depuis l'UI admin — version doit matcher le service postgres
# du docker-compose), tar pour le packaging des uploads, restic pour le backup
# off-site chiffre pilotable depuis l'UI super-admin (module system-backup).
RUN apk add --no-cache openssl wget dumb-init postgresql16-client tar restic

# -------- deps --------
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# -------- build --------
FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# -------- production --------
FROM base AS production
ENV NODE_ENV=production

# Utilisateur non-root dedie. node:20-alpine fournit deja un user `node` (uid 1000) :
# on l'utilise plutot que d'en creer un nouveau pour rester aligne avec l'image base.
RUN mkdir -p /app/uploads && chown -R node:node /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package*.json ./

USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:4000/health || exit 1

# dumb-init = reaper PID 1 propre (gere SIGTERM, evite les zombies).
# Synchronisation schema :
#   - Si des migrations existent : `prisma migrate deploy` (idempotent, trace).
#   - Sinon : fallback `prisma db push` UNIQUEMENT si ALLOW_PRISMA_DB_PUSH_FALLBACK=true.
#     Ce fallback masquait les ratés de schema et empechait toute tracabilite ;
#     on le garde activable pour les bootstraps "from scratch" mais on emet un
#     warn explicite pour ne plus l'oublier en prod multi-instance (cf
#     docs/prisma-migrations.md).
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "if ls prisma/migrations/*/migration.sql >/dev/null 2>&1; then npx prisma migrate deploy; elif [ \"${ALLOW_PRISMA_DB_PUSH_FALLBACK:-false}\" = \"true\" ]; then echo '[WARN] Aucune migration trouvee, fallback prisma db push --accept-data-loss (cf docs/prisma-migrations.md pour passer en mode migrate)'; npx prisma db push --skip-generate --accept-data-loss; else echo '[ERROR] Aucune migration trouvee. Generez la baseline via scripts/migrate-baseline.sh ou positionnez ALLOW_PRISMA_DB_PUSH_FALLBACK=true (deconseille en prod).'; exit 1; fi && node dist/main.js"]

# -------- development --------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]
