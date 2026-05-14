# -------- base --------
FROM node:20-alpine AS base
WORKDIR /app
# openssl pour Prisma (engine), wget pour HEALTHCHECK, dumb-init pour PID 1.
RUN apk add --no-cache openssl wget dumb-init

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
# Synchronise le schema (db push si pas de migrations, sinon migrate deploy) puis demarre.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "(ls prisma/migrations/*/migration.sql >/dev/null 2>&1 && npx prisma migrate deploy || npx prisma db push --skip-generate --accept-data-loss) && node dist/main.js"]

# -------- development --------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]
