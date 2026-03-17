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

### M-03: Populate Doppler prod config
**Why it's manual**: Requires knowing your actual secret values
**Command/Action**:
Populate the `prod` config with all secrets needed by the compose stack.
Run from your Mac (Doppler CLI authenticated):
```bash
doppler secrets set \
  POSTGRES_PASSWORD=<strong-random-password> \
  NTFY_BASE_URL=<your-ntfy-url> \
  NTFY_TOKEN=<your-ntfy-token> \
  TICKTICK_CLIENT_ID=<see-ticktick-developer-settings> \
  TICKTICK_CLIENT_SECRET=<see-ticktick-developer-settings> \
  CLAUDE_REMOTE_API_SECRET=$(openssl rand -hex 32) \
  --project claude-remote --config prod
```
`TELEGRAM_BOT_TOKEN` is added separately in M-04. Vibekanban secrets are added in M-06. `HOMELAB_NETWORK_NAME` defaults to `homelab_cloudflared` in compose — only set if yours differs.
**Status**: PENDING

---

### M-04: NanoClaw Telegram bot setup
**Why it's manual**: Requires creating a Telegram bot via BotFather
**Command/Action**:
1. Message @BotFather on Telegram: `/newbot`
2. Name: `ClaudeRemote`, username: `<something>_bot`
3. Copy the token
4. Store: `doppler secrets set TELEGRAM_BOT_TOKEN=<token> --project claude-remote --config prod`
**Status**: PENDING

---

### M-05: Start Docker stack and verify
**Why it's manual**: Requires M-03 + M-04 to be complete first
**Command/Action**:
```bash
ssh homelab
cd ~/SourceRoot/claude-remote
./scripts/dc-up.sh
./setup/10-verify.sh
```
**Status**: PENDING

---

### M-06: Vibekanban setup
**Why it's manual**: Requires cloning a repo, creating a GitHub OAuth app, and building from source
**Command/Action**:

**Step 1 — Clone vibekanban repo** (on the homelab server, next to claude-remote):
```bash
ssh homelab
cd ~/SourceRoot
git clone https://github.com/BloopAI/vibe-kanban.git
```

**Step 2 — Create GitHub OAuth App** (in the browser):
1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Application name: `VibeKanban (homelab)`
3. Homepage URL: `http://localhost:3000`
4. Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
5. Copy the Client ID and generate a Client Secret

**Step 3 — Add Doppler secrets**:
```bash
doppler secrets set \
  VIBEKANBAN_JWT_SECRET=$(openssl rand -hex 32) \
  VIBEKANBAN_GITHUB_OAUTH_CLIENT_ID=<client-id-from-step-2> \
  VIBEKANBAN_GITHUB_OAUTH_CLIENT_SECRET=<client-secret-from-step-2> \
  --project claude-remote --config prod
```

**Step 4 — Create the vibekanban database** (postgres must be running):
```bash
docker exec claude-remote-postgres psql -U claude-remote -c "CREATE DATABASE vibekanban;"
```

**Step 5 — Build and start vibekanban** (first build takes ~10 minutes — Rust + Node.js):
```bash
cd ~/SourceRoot/claude-remote
./scripts/dc-up.sh
```

**Step 6 — Connect Claude Code to vibekanban via MCP**:
Add to `~/.claude/mcp-servers.json` for the `claude-remote` user:
```json
{
  "vibe-kanban": {
    "command": "npx",
    "args": ["-y", "vibe-kanban@latest", "--mcp"],
    "env": { "VIBEKANBAN_URL": "http://localhost:3000" }
  }
}
```

**Note**: Vibekanban has no pre-built Docker image — first build is slow (Rust + Node.js multi-stage). Subsequent rebuilds use Docker layer cache. Access via SSH tunnel: `ssh -L 3000:localhost:3000 homelab`.
**Status**: PENDING

---

## Completed

- M-01: Claude Code OAuth ✓
