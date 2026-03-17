# Doppler Secrets Reference

**Project**: `claude-remote`

All secrets are managed in Doppler — no `.env` files anywhere in this project. Each service gets its own config (scoped environment) and, for Docker containers, its own service token so containers can only read their own secrets.

---

## Configs

| Config | Used by | Contains |
|-|-|-|
| `prod` | claude-remote user shell, setup scripts | `GITHUB_TOKEN`, general env vars |
| `prod_docker` | `dc-up.sh` / `docker compose up` | All secrets for the entire compose stack (see below) |

**`prod_docker` secrets:**

| Secret | Used by |
|-|-|
| `POSTGRES_PASSWORD` | postgres container + api connection string |
| `NTFY_BASE_URL` | claude-remote-api (NTFY push) |
| `NTFY_TOPIC` | claude-remote-api (NTFY push) |
| `TICKTICK_CLIENT_ID` | claude-remote-api |
| `TICKTICK_CLIENT_SECRET` | claude-remote-api |
| `TICKTICK_ACCESS_TOKEN` | claude-remote-api |
| `TELEGRAM_BOT_TOKEN` | nanoclaw container |
| `HOMELAB_NETWORK_NAME` | compose external network (default: `homelab_cloudflared`) |

---

## Usage Patterns

### Shell — inject secrets into a command

```bash
# Run a command with all secrets from the dev config injected as env vars
doppler run --project claude-remote --config dev -- bun test

# Shorthand if doppler is configured for this project directory
doppler run -- bun test
```

### Docker Compose — start stack with secrets

```bash
# Starts postgres, valkey, api, nanoclaw, watchtower
doppler run --project claude-remote --config prod_docker -- docker compose -f docker/docker-compose.yml up -d

# Or use the wrapper script (does the same thing)
./scripts/dc-up.sh
```

The compose file reads `DOPPLER_TOKEN_API` and `DOPPLER_TOKEN_NANOCLAW` from the `prod_docker` config and passes them to the respective containers. Each container then uses its own Doppler service token to fetch its own secrets at startup.

### Claude Code — read a secret in a session

```bash
doppler secrets get TICKTICK_API_KEY --project claude-remote --config api --plain
```

### Write a secret

```bash
doppler secrets set NEW_KEY=value --project claude-remote --config api
```

---

## Doppler CLI Quick Reference

```bash
# Authenticate (one-time, per machine)
doppler login

# Configure project for this directory
doppler setup

# List all secrets in a config
doppler secrets --project claude-remote --config dev

# Get one secret (plain text, no quotes)
doppler secrets get MY_KEY --project claude-remote --config dev --plain

# Set a secret
doppler secrets set MY_KEY=value --project claude-remote --config dev

# Delete a secret
doppler secrets delete MY_KEY --project claude-remote --config dev

# List all configs in the project
doppler configs --project claude-remote
```

---

## Notes

- `prod_docker` is the naming convention Doppler requires when an environment is `prd` and the config branch is `docker`. Doppler prefixes branch configs with the environment slug.
- The `claude-remote` user on the homelab needs to authenticate Doppler separately: `sudo -u claude-remote -i doppler login`.
- The `dev` config is for interactive use by the claude-remote user. It does not contain Docker-specific secrets.
- Never commit secrets, `.env` files, or service tokens to git. All values live exclusively in Doppler.
