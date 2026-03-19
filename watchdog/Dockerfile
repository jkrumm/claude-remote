FROM node:20-slim

WORKDIR /app

# Install Docker CLI — nanoclaw exec's `docker` commands to spawn agent containers.
# DOCKER_HOST is set at runtime to point at docker-socket-proxy.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc && npm prune --omit=dev

# Agent-runner source — container-runner.ts copies this into per-group data dirs
# so each group's agent container gets a writable copy it can customize.
COPY container/ ./container/

# State directories live in /data (named volume), symlinked from /app so
# nanoclaw's relative paths (./store, ./groups, ./data/env/env) resolve correctly.
RUN mkdir -p /data/store /data/groups /data/env /data/logs \
    && ln -s /data/store /app/store \
    && ln -s /data/groups /app/groups \
    && ln -s /data /app/data \
    && ln -s /data/logs /app/logs

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production

RUN useradd -r -u 1001 nanoclaw \
    && chown -R nanoclaw /data /app /entrypoint.sh
USER nanoclaw

ENTRYPOINT ["/entrypoint.sh"]
