#!/usr/bin/env bash
# Send a push notification via the claude-remote-api.
# Usage: notify.sh "<message>" [title] [priority]
set -euo pipefail

MESSAGE="${1:?Usage: notify.sh <message> [title] [priority]}"
TITLE="${2:-ClaudeRemote}"
PRIORITY="${3:-3}"

curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\", \"title\": \"$TITLE\", \"priority\": $PRIORITY}"
