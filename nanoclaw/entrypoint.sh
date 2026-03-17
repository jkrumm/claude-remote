#!/bin/sh
# Extract current Claude OAuth token from the mounted credentials file and
# export it as CLAUDE_CODE_OAUTH_TOKEN + write to /data/env/env (for agent containers).
# Deliberately does NOT write /app/.env — avoids shadow-mount conflict in container-runner.
# This picks up auto-refreshed tokens on every container restart.
set -e

CREDS_FILE="${CLAUDE_CREDENTIALS_FILE:-/run/secrets/claude-credentials}"

if [ -f "$CREDS_FILE" ]; then
  TOKEN=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('$CREDS_FILE','utf8'));
    const oauth = d.claudeAiOauth || {};
    process.stdout.write(oauth.accessToken || '');
  ")
  if [ -n "$TOKEN" ]; then
    export CLAUDE_CODE_OAUTH_TOKEN="$TOKEN"
    mkdir -p /data/env
    echo "CLAUDE_CODE_OAUTH_TOKEN=$TOKEN" > /data/env/env
    echo "[entrypoint] Claude OAuth token loaded from credentials file"
  else
    echo "[entrypoint] WARN: no accessToken found in credentials file"
  fi
elif [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
  mkdir -p /data/env
  echo "CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN" > /data/env/env
  echo "[entrypoint] Claude OAuth token loaded from env var"
else
  echo "[entrypoint] WARN: no Claude credentials found — agents will fail to authenticate"
fi

exec node dist/index.js
