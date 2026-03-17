# Manual TODOs

Steps that require human intervention (browser, hardware, secrets not available to setup scripts).
Check off items as you complete them.

---

## Pending

### M-01: Claude Code OAuth for claude-remote user
**Why it's manual**: OAuth requires an interactive browser session
**Command/Action**:
```bash
ssh cr
claude auth login
# Follow the browser URL that appears
```
**Status**: DONE ✓

---

### M-02: gh CLI auth for claude-remote user
**Why it's manual**: Requires creating a GitHub fine-grained PAT in the browser
**Command/Action**:
```bash
ssh homelab
sudo bash setup/06-setup-gh-cli.sh
# Script guides you through PAT creation, verifies permissions, stores in Doppler
```
PAT permissions required:
- Contents: Read and write
- Metadata: Read-only (auto-selected)
- Pull requests: Read and write
- Commit statuses: Read-only
**Status**: PENDING

---

### M-03: Doppler service tokens for Docker containers
**Why it's manual**: Requires creating configs and service tokens in Doppler
**Command/Action**:
1. Create configs (if not already present):
```bash
doppler configs create --project claude-remote --environment prd --name api
doppler configs create --project claude-remote --environment prd --name nanoclaw
doppler configs create --project claude-remote --environment prd --name docker
```
2. Populate `prd_api` secrets:
```bash
doppler secrets set NTFY_BASE_URL=<url> NTFY_TOPIC=<topic> POSTGRES_URL=postgres://claude-remote:<pw>@postgres:5432/claude-remote --project claude-remote --config prd_api
```
3. Create service tokens:
```bash
API_TOKEN=$(doppler service-tokens create --project claude-remote --config prd_api --plain api-token)
NANO_TOKEN=$(doppler service-tokens create --project claude-remote --config prd_nanoclaw --plain nanoclaw-token)
```
4. Store in docker config:
```bash
doppler secrets set DOPPLER_TOKEN_API="$API_TOKEN" DOPPLER_TOKEN_NANOCLAW="$NANO_TOKEN" POSTGRES_PASSWORD=<strong-password> HOMELAB_NETWORK_NAME=homelab_cloudflared --project claude-remote --config prd_docker
```
**Note**: `prd_nanoclaw` needs `TELEGRAM_BOT_TOKEN` from M-04 before starting the nanoclaw container.
**Status**: PENDING

---

### M-04: NanoClaw Telegram bot setup
**Why it's manual**: Requires creating a Telegram bot via BotFather
**Command/Action**:
1. Message @BotFather on Telegram: `/newbot`
2. Name: `ClaudeRemote`, username: `<something>_bot`
3. Copy the token
4. Store: `doppler secrets set TELEGRAM_BOT_TOKEN=<token> --project claude-remote --config prd_nanoclaw`
**Status**: PENDING

---

### M-05: Start Docker stack and verify
**Why it's manual**: Requires M-03 + M-04 to be complete first
**Command/Action**:
```bash
ssh homelab
cd ~/SourceRoot/claude-remote
doppler run --project claude-remote --config prd_docker -- docker compose -f docker/docker-compose.yml up -d
./setup/10-verify.sh
```
**Status**: PENDING

---

## Completed

- M-01: Claude Code OAuth ✓
