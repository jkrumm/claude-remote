# Manual TODOs

Steps that require human intervention (browser, hardware, secrets not available to RALPH).
Check off items as you complete them.

---

## Pending

### M-01: Claude Code OAuth for claude-remote user
**Why it's manual**: OAuth requires an interactive browser session
**Command/Action**:
```bash
ssh homelab
sudo -u claude-remote -i
claude auth login
# Follow the browser URL that appears
```
**Status**: PENDING

---

### M-02: GitHub deploy key — add to repos
**Why it's manual**: Adding deploy keys requires GitHub web UI (or gh API with write:public_key scope)
**Command/Action**:
1. Get the public key: `ssh homelab "sudo cat /home/claude-remote/.ssh/id_ed25519.pub"`
2. For each repo in `config/repos.json`: GitHub → repo Settings → Deploy keys → Add deploy key
   - Title: `claude-remote@homelab`
   - Allow write access: yes (needed for pushing branches)
**Status**: DONE ✓

---

### M-03: gh CLI auth for claude-remote user
**Why it's manual**: Requires a GitHub Personal Access Token
**Command/Action**:
1. Create a GitHub PAT at https://github.com/settings/tokens with scopes: `repo`, `read:org`
2. Store it in Doppler: `doppler secrets set GITHUB_TOKEN=<token> --project claude-remote --config prod`
3. Inject on homelab:
```bash
TOKEN=$(doppler secrets get GITHUB_TOKEN --project claude-remote --config prod --plain)
ssh homelab "echo '$TOKEN' | sudo -u claude-remote gh auth login --with-token"
```
**Status**: PENDING

---

### M-04: Tailscale SSH for claude-remote user (optional convenience)
**Why it's manual**: Requires updating Tailscale ACL policy in the Tailscale admin console
**Command/Action**:
1. Go to https://login.tailscale.com/admin/acls
2. Add `claude-remote` to the SSH `users` list in the ACL rule that allows SSH to the homelab node
3. After update, test: `ssh -l claude-remote homelab`
**Status**: PENDING (optional — can use `ssh homelab` + `sudo -u claude-remote -i` as workaround)

---

### M-05: Doppler service tokens for Docker containers
**Why it's manual**: Requires creating configs and service tokens in Doppler, then storing them
**Command/Action**:
1. Create configs in the `claude-remote` project:
```bash
doppler configs create --project claude-remote --environment prd api
doppler configs create --project claude-remote --environment prd nanoclaw
doppler configs create --project claude-remote --environment prd docker
```
2. Populate each config with its required secrets (see IMPLEMENTATION_PLAN.md section 16)
3. Create service tokens:
```bash
doppler service-tokens create --project claude-remote --config api api-token
doppler service-tokens create --project claude-remote --config nanoclaw nanoclaw-token
```
4. Store the tokens in the `docker` config:
```bash
doppler secrets set DOPPLER_TOKEN_API=<api-token> --project claude-remote --config docker
doppler secrets set DOPPLER_TOKEN_NANOCLAW=<nanoclaw-token> --project claude-remote --config docker
doppler secrets set POSTGRES_PASSWORD=<strong-password> --project claude-remote --config docker
```
**Status**: PENDING

---

### M-06: NanoClaw Telegram bot setup
**Why it's manual**: Requires creating a Telegram bot via BotFather
**Command/Action**:
1. Message @BotFather on Telegram: `/newbot`
2. Name: `ClaudeRemote`, username: `<something>_bot`
3. Copy the token
4. Store: `doppler secrets set TELEGRAM_BOT_TOKEN=<token> --project claude-remote --config nanoclaw`
**Status**: PENDING

---

### M-07: SSH key for MacBook → claude-remote user (for scp/non-Tailscale access)
**Why it's manual**: No traditional SSH keys on MacBook (1Password manages them), no public key to copy
**Command/Action**: Option A — generate a new key pair dedicated to this purpose:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/claude-remote-homelab -C "macbook->claude-remote"
ssh homelab "echo '$(cat ~/.ssh/claude-remote-homelab.pub)' | sudo -u claude-remote tee -a /home/claude-remote/.ssh/authorized_keys"
```
Then add to `~/.ssh/config`:
```
Host homelab-claude
    HostName 100.85.139.104
    User claude-remote
    IdentityFile ~/.ssh/claude-remote-homelab
```
**Status**: PENDING (optional if Tailscale ACL approach from M-04 is used instead)

---

## Completed

- M-02: GitHub deploy key added to `basalt-ui` repo ✓
