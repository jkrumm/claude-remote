# Doppler Secrets Reference

**Project**: `claude-remote`
**Single config**: `prod`

All secrets live in one Doppler config — no sub-configs, no service tokens. `doppler run --config prod` injects everything the compose stack needs as env vars at startup. No Doppler CLI inside containers.

---

## `prod` Secrets

| Secret | Used by | Notes |
|-|-|-|
| `GITHUB_TOKEN` | setup/06-setup-gh-cli.sh | Fine-grained PAT — see MANUAL_TODOS.md M-02 |
| `POSTGRES_PASSWORD` | postgres container + api | Strong random password |
| `NTFY_BASE_URL` | claude-remote-api | e.g. `https://ntfy.jkrumm.com` |
| `NTFY_TOKEN` | claude-remote-api | Bearer token for NTFY auth |
| `TICKTICK_CLIENT_ID` | claude-remote-api | From TickTick developer settings |
| `TICKTICK_CLIENT_SECRET` | claude-remote-api | From TickTick developer settings |
| `HOMELAB_API_SECRET` | claude-remote-api | Bearer token for API auth (generated) |
| `TELEGRAM_BOT_TOKEN` | nanoclaw container | From @BotFather — see MANUAL_TODOS.md M-04 |

**Not in Doppler** (handled differently):
- `NTFY_TOPIC` — hardcoded as `claude-remote` in docker-compose.yml
- TickTick access/refresh tokens — stored in a persistent volume (`/data/ticktick-tokens.json`) by the API after OAuth flow
- `HOMELAB_NETWORK_NAME` — defaults to `homelab_cloudflared` in compose; only add to Doppler if yours differs

---

## Usage Patterns

### Start the Docker stack

```bash
# Via wrapper script (recommended)
./scripts/dc-up.sh

# Or directly
doppler run --project claude-remote --config prod -- \
  docker compose -f docker/docker-compose.yml up -d
```

### Read a secret (e.g. in a Claude Code session)

```bash
doppler secrets get POSTGRES_PASSWORD --project claude-remote --config prod --plain
```

### Set or update a secret

```bash
doppler secrets set MY_KEY=value --project claude-remote --config prod
```

### Run any command with secrets injected

```bash
doppler run --project claude-remote --config prod -- <command>
```

---

## Doppler CLI Quick Reference

```bash
# Authenticate (one-time, per machine)
doppler login

# List all secrets
doppler secrets --project claude-remote --config prod

# Get one secret (plain text)
doppler secrets get MY_KEY --project claude-remote --config prod --plain

# Set a secret
doppler secrets set MY_KEY=value --project claude-remote --config prod

# Delete a secret
doppler secrets delete MY_KEY --project claude-remote --config prod
```

---

## Notes

- Only `jkrumm` (the sudo user running setup) needs Doppler CLI authenticated — the `claude-remote` user itself does not use Doppler directly.
- Never commit secrets or `.env` files to git. All values live exclusively in Doppler.
- To add a new secret needed by the compose stack: `doppler secrets set KEY=value --config prod`, then `./scripts/dc-up.sh` (docker compose picks up new env vars on next `up`).
