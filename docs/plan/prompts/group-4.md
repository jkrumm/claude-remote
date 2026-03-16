# Group 4: Docker Compose Stack

## What You're Doing

Create the full Docker Compose stack: `docker/docker-compose.yml`, the NanoClaw `Dockerfile`, the compose launch script, and the setup step that starts the stack. This defines all infrastructure services running in the isolated `agent-net` network.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 6.1–6.4 (Docker network design, docker-compose.yml, Doppler integration, database schema) in full
2. Read `IMPLEMENTATION_PLAN.md` section 11 (NanoClaw) for the container requirements
3. Look up the NanoClaw repo `qwibitai/nanoclaw` via Tavily Search + WebFetch to understand what the Dockerfile needs (base image, environment variables, ports)
4. Look up current Doppler CLI Docker install pattern via Tavily Search — the `curl | sh` in the spec may have a better modern alternative
5. **Correction from homelab inspection**: The NTFY container is on network `homelab_cloudflared` (verified: `docker inspect ntfy`). The external network in docker-compose.yml must be `homelab_cloudflared`, not a generic `homelab`. Use `${HOMELAB_NETWORK_NAME:-homelab_cloudflared}` to keep it configurable.
6. Read `/Users/johannes.krumm/SourceRoot/homelab/docker-compose.yml` for the existing homelab Docker patterns (network naming, Watchtower label usage)

---

## What to Implement

### 1. `docker/docker-compose.yml`

Use the spec in IMPLEMENTATION_PLAN.md section 6.2 as the base. Requirements:
- Two networks: `agent-net` (bridge, created here) and `homelab` (external, name from env var)
- Services: `postgres`, `valkey`, `claude-remote-api`, `nanoclaw`, `watchtower`
- All service containers prefixed `claude-remote-` for Watchtower scoping
- Watchtower manages only the infra containers (postgres, valkey, watchtower itself) — NOT claude-remote-api or nanoclaw (those are custom builds)
- Health checks on postgres, valkey, and claude-remote-api
- Ports only bound to `127.0.0.1` (no external exposure): postgres on 5432, valkey on 6379, api on 4000
- claude-remote-api: `build.context` uses `${CLAUDE_REMOTE_API_PATH:-../claude-remote-api}` — the API lives in a sibling repo
- nanoclaw: `build.context` uses `./nanoclaw` — built from the local Dockerfile
- Both custom services get only `DOPPLER_TOKEN` from compose env; Doppler injects all other secrets at runtime inside the container

### 2. `docker/nanoclaw/Dockerfile`

NanoClaw is a Python-based Telegram bot. Based on the qwibitai/nanoclaw repo:
- Use `python:3.12-slim` as base image
- Install Doppler CLI inside the container
- Clone or copy the NanoClaw source (use a build arg `NANOCLAW_VERSION` defaulting to `main`)
- Install Python dependencies
- Set `ENTRYPOINT ["doppler", "run", "--"]`
- Set `CMD` to whatever command starts NanoClaw (check the repo — likely `python main.py` or similar)
- Run as a non-root user

If you cannot determine the exact NanoClaw start command from the repo, use a placeholder with a clear TODO comment.

### 3. `scripts/dc-up.sh`

Per IMPLEMENTATION_PLAN.md section 6.3. Fetches secrets from Doppler before starting compose:

```bash
#!/usr/bin/env bash
# Start the Docker Compose stack with secrets from Doppler
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

doppler run --project claude-remote --config docker -- \
  docker compose -f "$REPO_ROOT/docker/docker-compose.yml" up -d "$@"
```

Also create `scripts/dc-down.sh` for stopping the stack.

### 4. `setup/09-docker-compose.sh`

Setup step that starts the stack for the first time:
1. Check Docker and Docker Compose v2 are available (exit with error if not)
2. Check Doppler is configured (`doppler --version`)
3. Run `scripts/dc-up.sh`
4. Wait for health checks to pass (poll for up to 60s)
5. Print status with `docker compose ps`

---

## Validation

```bash
bash -n scripts/dc-up.sh
bash -n scripts/dc-down.sh
bash -n setup/09-docker-compose.sh
# YAML syntax check
python3 -c "import yaml; yaml.safe_load(open('docker/docker-compose.yml'))" 2>/dev/null \
  || python3 -c "import json; print('yaml not available, skipping')"
```

---

## Execute on Homelab

The full stack needs Doppler service tokens (M-05) before it can start. Run what we can:

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# Check Doppler docker config has required secrets
DOCKER_SECRETS=$(doppler secrets --project claude-remote --config docker 2>/dev/null | grep -c POSTGRES_PASSWORD || echo 0)

if [[ "$DOCKER_SECRETS" -gt 0 ]]; then
  # Full stack can start
  ssh homelab "cd ~/SourceRoot/claude-remote && doppler run --project claude-remote --config docker -- docker compose -f docker/docker-compose.yml up -d postgres valkey"
  echo "Postgres and Valkey started"
else
  echo "POSTGRES_PASSWORD not in Doppler docker config — partial startup only"
  echo "Adding M-05 to MANUAL_TODOS.md"
fi

# Verify Docker is accessible (jkrumm is in docker group)
ssh homelab "docker ps | head -5"
```

**Items for MANUAL_TODOS.md:**
- M-05: Doppler service tokens needed before full stack can start (already in file)
- Note which containers started successfully

---

## Commit

```
feat(docker): compose stack with postgres, valkey, nanoclaw, api, and watchtower
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
