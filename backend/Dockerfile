# -------- base --------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# -------- deps --------
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

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
# Applique les migrations puis démarre
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

# -------- development --------
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]
