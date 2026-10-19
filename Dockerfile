# Build: the locked workspace, the Vite page and the bundled server.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build \
 && pnpm --filter @classic777/server deploy --prod /out/apps/server \
 && cp -r apps/web/dist /out/apps/web-dist

# Run: production files only, Node 24, not root. No secrets and no casino URL in the image.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /out/apps/server ./apps/server
COPY --from=build /out/apps/web-dist ./apps/web/dist
USER node
ARG BUILD_VERSION=dev
ENV GAME_VERSION=${BUILD_VERSION}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "apps/server/dist/server.cjs"]
