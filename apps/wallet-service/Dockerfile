# Multi-stage build for wallet-service
# Stage 1: build
FROM node:24-alpine AS build
WORKDIR /app

# Install pnpm
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm nx run wallet-service:build

# Stage 2: runtime
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/wallet-service/dist ./dist
COPY --from=build /app/apps/wallet-service/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3002
CMD ["node", "dist/main.js"]
