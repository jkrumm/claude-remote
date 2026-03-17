FROM node:20-slim AS builder

WORKDIR /build

# Install git for cloning
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

ARG NANOCLAW_VERSION=main
RUN git clone --depth 1 --branch "${NANOCLAW_VERSION}" \
    https://github.com/qwibitai/nanoclaw.git . \
    && npm ci \
    && npm run build

# ---

FROM node:20-slim

WORKDIR /app

# Install Doppler CLI
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -Ls https://cli.doppler.com/install.sh | sh \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy built output and production deps
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json

# Persistent data dir (SQLite, config)
RUN mkdir -p /data
VOLUME ["/data"]

ENV NODE_ENV=production

# Non-root user
RUN useradd -r -u 1001 nanoclaw && chown nanoclaw /data /app
USER nanoclaw

# Doppler injects all secrets at container startup
ENTRYPOINT ["doppler", "run", "--"]
CMD ["node", "dist/index.js"]
