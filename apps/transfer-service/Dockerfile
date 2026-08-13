# Multi-stage build for transfer-service
# Stage 1: build
FROM node:24-alpine AS build
WORKDIR /app

# Install pnpm
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm nx run transfer-service:build

# Stage 2: runtime
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/transfer-service/dist ./dist
COPY --from=build /app/apps/transfer-service/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3003
CMD ["node", "dist/main.js"]
