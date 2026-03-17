---
name: homelab
description: Query homelab infrastructure status — check UptimeKuma monitor uptime, get monitor summaries, and read ntfy topic messages (e.g., homelab-watchdog alerts). Use proactively when the user asks about server status, uptime, alerts, or infrastructure health.
allowed-tools: Bash(curl:*)
---

# Homelab Monitoring

Queries the `claude-remote-api` which proxies UptimeKuma and ntfy. All requests go to `$CLAUDE_REMOTE_API_URL` with `Authorization: Bearer $CLAUDE_REMOTE_API_SECRET`.

## UptimeKuma

### Monitor summary (up/down counts)
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/homelab/uptime-kuma/status"
# → { "up": 12, "down": 1, "paused": 2, "total": 15 }
```

### All monitors with full details
```bash
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/homelab/uptime-kuma/monitors"
# → UptimeKuma monitorList with heartbeat data
```

## ntfy — topic discovery and message querying

**Always discover topics first**, then fetch messages for each one:

```bash
# Step 1: list all subscribed topics
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/homelab/ntfy/topics"
# → ["homelab-watchdog", "homelab-watchtower", "vps-watchtower", "uptime-alerts", "claude-remote", ...]

# Step 2: fetch messages for each topic
curl -s -H "Authorization: Bearer $CLAUDE_REMOTE_API_SECRET" \
  "$CLAUDE_REMOTE_API_URL/homelab/ntfy/messages?topic=<topic>"
# → JSON array of recent messages on that topic
```

Never assume which topics exist — always call `/homelab/ntfy/topics` first.

## Response interpretation

- UptimeKuma status `1` = up, `0` = down
- `active: false` means the monitor is paused (not a failure)
- ntfy message fields: `id`, `time` (Unix timestamp), `event`, `topic`, `title`, `message`, `priority`, `tags`
