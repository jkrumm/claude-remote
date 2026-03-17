# Doppler Secrets Reference

**Project**: `claude-remote`

All secrets are managed in Doppler — no `.env` files anywhere in this project. Each service gets its own config (scoped environment) and, for Docker containers, its own service token so containers can only read their own secrets.

---

## Configs

| Config | Used by | Contains |
|-|-|-|
| `dev` / `prod` | claude-remote user shell | `GITHUB_TOKEN`, general env vars |
| `prod_docker` | docker-compose at launch time | `POSTGRES_PASSWORD`, `DOPPLER_TOKEN_API`, `DOPPLER_TOKEN_NANOCLAW`, `HOMELAB_NETWORK_NAME` |
| `api` (env: `prd`) | claude-remote-api container | `TICKTICK_API_KEY`, `NTFY_BASE_URL`, `NTFY_TOPIC`, `POSTGRES_URL` |
| `nanoclaw` (env: `prd`) | NanoClaw container | `TELEGRAM_BOT_TOKEN`, `HOMELAB_API_URL` |

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

## Setting Up a New Service

When adding a new service that needs its own secrets:

1. **Create a config** for the service:
   ```bash
   doppler configs create --project claude-remote --environment prd my-service
   ```

2. **Add required secrets** to the new config:
   ```bash
   doppler secrets set MY_SECRET=value --project claude-remote --config my-service
   ```

3. **Create a service token** (read-only, for the container):
   ```bash
   doppler service-tokens create --project claude-remote --config my-service my-service-token
   # Copy the token value — it's shown only once
   ```

4. **Store the service token** in `prod_docker` so docker-compose can pass it:
   ```bash
   doppler secrets set DOPPLER_TOKEN_MYSERVICE=<token> --project claude-remote --config prod_docker
   ```

5. **In docker-compose.yml**, pass the token to the container:
   ```yaml
   my-service:
     environment:
       - DOPPLER_TOKEN=${DOPPLER_TOKEN_MYSERVICE}
   ```

6. **In the Dockerfile**, install the Doppler CLI and use it as the entrypoint:
   ```dockerfile
   RUN curl -Ls https://cli.doppler.com/install.sh | sh
   ENTRYPOINT ["doppler", "run", "--"]
   CMD ["bun", "run", "start"]
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
