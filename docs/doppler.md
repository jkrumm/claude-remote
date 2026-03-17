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
| `CLAUDE_REMOTE_API_SECRET` | claude-remote-api + nanoclaw | Bearer token for API auth — `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | nanoclaw container | From @BotFather — see MANUAL_TODOS.md M-04 |
| `VIBEKANBAN_JWT_SECRET` | vibekanban container | `openssl rand -hex 32` — see MANUAL_TODOS.md M-06 |
| `VIBEKANBAN_GITHUB_OAUTH_CLIENT_ID` | vibekanban container | GitHub OAuth app client ID — see MANUAL_TODOS.md M-06 |
| `VIBEKANBAN_GITHUB_OAUTH_CLIENT_SECRET` | vibekanban container | GitHub OAuth app client secret — see MANUAL_TODOS.md M-06 |

**Not in Doppler** (handled differently):
- `NTFY_TOPIC` — hardcoded as `claude-remote` in docker-compose.yml
- TickTick access/refresh tokens — stored in a persistent volume (`/data/ticktick-tokens.json`) by the API after OAuth flow
- `HOMELAB_NETWORK_NAME` — defaults to `homelab_cloudflared` in compose; only add to Doppler if yours differs
- `VIBEKANBAN_PUBLIC_URL` — defaults to `http://localhost:3000`; set if exposing via reverse proxy
- `VIBEKANBAN_REPO_PATH` — defaults to `../vibe-kanban`; override only if cloned elsewhere

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
