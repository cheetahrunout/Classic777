FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @classic777/server build || true

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY --from=build /app/apps/server/src ./src
COPY --from=build /app/node_modules ./node_modules
COPY casino-game.json ./
USER node
ARG BUILD_VERSION=dev
ENV GAME_VERSION=${BUILD_VERSION}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "src/server.js"]
