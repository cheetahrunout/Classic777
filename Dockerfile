FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY public public
COPY casino-game.json ./
WORKDIR /app/apps/server
RUN npm install --omit=dev
WORKDIR /app
USER node
ARG BUILD_VERSION=dev
ENV GAME_VERSION=${BUILD_VERSION}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "apps/server/src/server.js"]
