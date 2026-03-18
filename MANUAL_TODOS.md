# Manual TODOs

Steps that require human intervention (browser, hardware, secrets not available to setup scripts).
Check off items as you complete them.

---

## Pending

### M-10: Create 'remote' postgres database (vibekanban + electric)
**Why it's manual**: The `remote` database is used by vibekanban and electric but postgres only creates `claude-remote` on first boot. Without it both containers crash-loop.
**Command/Action**:
```bash
docker exec claude-remote-postgres psql -U claude-remote -c 'CREATE DATABASE remote;'
```
Run this once after first deploy. Idempotent — safe to re-run (will error if already exists, but that's fine).
**Status**: DONE ✓ (2026-03-18)

---

### M-11: VPS Docker monitoring (future)
**Why it's manual**: Requires running a docker-socket-proxy on the VPS, exposing it over Tailscale, and adding a second Docker endpoint set to claude-remote-api.
**What's needed**:
1. Run `tecnativa/docker-socket-proxy` on the VPS, bind to Tailscale IP
2. Add `VPS_DOCKER_PROXY_URL=http://<tailscale-ip>:2375` to Doppler
3. Add `/vps/docker/*` routes (same shape as `/docker/*` but pointing at the VPS proxy)
**Status**: PENDING — not started

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

### M-07: Register Telegram channel in NanoClaw
**Why it's manual**: Requires the bot to be running and your Telegram chat ID
**Command/Action**:
1. Start the Docker stack (`./scripts/dc-up.sh`)
2. Message your bot on Telegram: `/chatid`
3. It replies with your ID in format `tg:XXXXXXXXX`
4. Register it as the main channel:
```bash
# On homelab, with the nanoclaw container running:
docker exec claude-remote-nanoclaw node dist/index.js register tg:XXXXXXXXX "Your Name" main
```
After registration, trigger the bot with `@Andy <message>` (or whatever `ASSISTANT_NAME` you set).
**Status**: DONE ✓

---

### M-08: Build nanoclaw-agent Docker image
**Why it's manual**: Large image (~5 min, needs Chromium) — not pulled from a registry
**Command/Action**:
```bash
ssh homelab
cd ~/SourceRoot/claude-remote
docker build -t nanoclaw-agent:latest nanoclaw/container/
```
This image is required before NanoClaw can spawn any agent containers. Rebuild whenever `nanoclaw/container/Dockerfile` or `nanoclaw/container/agent-runner/` changes.
**Status**: DONE ✓

---

### M-09: Optional — Reverse proxy DNS setup
**Why it's manual**: Requires your DNS provider and Caddy/reverse proxy config
**What this gives you**: Clean HTTPS URLs for vibekanban and claude-remote-api over Tailscale, instead of SSH tunnels

1. Add DNS A records pointing to your Tailscale IP:
   - `<your-domain>/vibekanban` or `claude-remote.<your-domain>` → Tailscale IP
   - `claude-remote-api.<your-domain>` → Tailscale IP
2. Add Caddy blocks (on homelab network) in your Caddyfile:
   ```
   claude-remote.<your-domain>, http://claude-remote.<your-domain> {
       reverse_proxy claude-remote-vibekanban:8081
   }
   claude-remote-api.<your-domain>, http://claude-remote-api.<your-domain> {
       reverse_proxy claude-remote-api:4000
   }
   ```
3. Set `VIBEKANBAN_PUBLIC_URL=https://claude-remote.<your-domain>` in Doppler if using GitHub OAuth with vibekanban
4. Update vibekanban GitHub OAuth app callback URL to `https://claude-remote.<your-domain>/v1/oauth/github/callback`

Note: DNS records should be Tailscale-IP-only (no public exposure). Caddy handles TLS via DNS-01 challenge.
**Status**: DONE ✓

---

## Completed

- **M-01**: Claude Code OAuth for claude-remote user (`claude auth login`) ✓
- **M-03**: Doppler prod config populated with all secrets ✓
- **M-04**: NanoClaw Telegram bot created via @BotFather, `TELEGRAM_BOT_TOKEN` set in Doppler ✓
- **M-05**: Docker stack started and verified (`./scripts/dc-up.sh` + `./setup/10-verify.sh`) ✓
- **M-06**: Vibekanban GitHub OAuth app created, Doppler secrets set, setup script run ✓
- **M-07**: Telegram channel registered as main NanoClaw channel ✓
- **M-08**: `nanoclaw-agent:latest` Docker image built on homelab ✓
- **M-09**: Cloudflare DNS + Caddy reverse proxy configured for claude-remote domains ✓

---

## Reference: Doppler secrets needed

Run from your Mac (Doppler CLI authenticated):

```bash
doppler secrets set \
  POSTGRES_PASSWORD=<strong-random-password> \
  NTFY_BASE_URL=<your-ntfy-url> \
  NTFY_TOKEN=<your-ntfy-token> \
  TICKTICK_CLIENT_ID=<see-ticktick-developer-settings> \
  TICKTICK_CLIENT_SECRET=<see-ticktick-developer-settings> \
  CLAUDE_REMOTE_API_SECRET=$(openssl rand -hex 32) \
  TELEGRAM_BOT_TOKEN=<from-botfather> \
  VIBEKANBAN_JWT_SECRET=$(openssl rand -hex 32) \
  VIBEKANBAN_GITHUB_OAUTH_CLIENT_ID=<from-github> \
  VIBEKANBAN_GITHUB_OAUTH_CLIENT_SECRET=<from-github> \
  --project claude-remote --config prod
```

See [docs/doppler.md](docs/doppler.md) for the full secrets reference.
