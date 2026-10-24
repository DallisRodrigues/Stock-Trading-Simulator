FROM node:24-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json frontend/
COPY dashboard/package.json dashboard/package-lock.json dashboard/
RUN npm ci --ignore-scripts \
 && npm --prefix frontend ci \
 && npm --prefix dashboard ci
COPY frontend frontend
COPY dashboard dashboard
RUN npm run build:single

FROM node:24-alpine AS api-deps
WORKDIR /srv/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-alpine
ENV NODE_ENV=production \
    SERVE_STATIC=on \
    PORT=3002
WORKDIR /srv
COPY --from=api-deps /srv/backend/node_modules backend/node_modules
COPY backend/package.json backend/index.js backend/
COPY backend/src backend/src
COPY --from=web /build/frontend/dist frontend/dist
COPY --from=web /build/dashboard/dist dashboard/dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "backend/index.js"]
