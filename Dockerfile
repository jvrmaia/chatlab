# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.ui.json vite.config.ts vitest.config.ts ./
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG NODE_VERSION
ENV NODE_ENV=production
ENV CHATLAB_HOST=0.0.0.0
ENV CHATLAB_PORT=4480
WORKDIR /app

RUN groupadd --system --gid 10001 chatlab \
  && useradd --system --uid 10001 --gid chatlab --no-create-home chatlab \
  && mkdir -p /data && chown chatlab:chatlab /data
USER chatlab

COPY --chown=chatlab:chatlab --from=deps /app/node_modules ./node_modules
COPY --chown=chatlab:chatlab --from=build /app/dist ./dist
COPY --chown=chatlab:chatlab package.json ./

EXPOSE 4480
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CHATLAB_PORT||4480)+'/healthz').then(r=>{if(r.status!==200)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server/cli.js"]
