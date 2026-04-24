# -------- base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

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
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package*.json ./
EXPOSE 4000
# Synchronise le schema (db push si pas de migrations, sinon migrate deploy) puis demarre
CMD ["sh", "-c", "(ls prisma/migrations/*/migration.sql >/dev/null 2>&1 && npx prisma migrate deploy || npx prisma db push --skip-generate --accept-data-loss) && node dist/main.js"]

# -------- development --------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]
