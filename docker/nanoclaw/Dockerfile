FROM node:20-slim AS builder

WORKDIR /build

# Install git and ca-certificates for cloning over HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG NANOCLAW_VERSION=main
RUN git clone --depth 1 --branch "${NANOCLAW_VERSION}" \
    https://github.com/qwibitai/nanoclaw.git . \
    && npm ci \
    && npm run build

# ---

FROM node:20-slim

WORKDIR /app

# Install Docker CLI so nanoclaw can exec `docker` commands.
# DOCKER_HOST is set at runtime to point at docker-socket-proxy (no raw socket needed).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Copy built output and production deps
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json

# Persistent data dir (SQLite, config)
RUN mkdir -p /data

ENV NODE_ENV=production

# Non-root user
RUN useradd -r -u 1001 nanoclaw && chown nanoclaw /data /app
USER nanoclaw

# Secrets are injected by doppler run in docker-compose (not inside the container)
CMD ["node", "dist/index.js"]
