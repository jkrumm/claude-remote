# Group 8: Complete README & Documentation

## What You're Doing

Complete the `README.md` with full setup instructions, write the Doppler secrets reference doc, review all files created in groups 1–7 for consistency and gaps, and finalize `CLAUDE.md`. This group is documentation-focused but requires careful reading of all existing files.

---

## Research & Exploration First

1. Read the current `README.md` — it was created as a skeleton in Group 1; expand it significantly
2. Read `IMPLEMENTATION_PLAN.md` sections 15 (security model) and 16 (Doppler secrets reference) in full
3. Read `CLAUDE.md` to ensure it's complete and accurate
4. Read `setup.sh` and all `setup/0*.sh` scripts to understand the actual setup flow (for accurate README instructions)
5. Read `docker/docker-compose.yml` to verify the port and network documentation matches reality
6. Scan all `skills/*.md` files to ensure the CLAUDE.md skills list is accurate

---

## What to Implement

### 1. `README.md` — complete rewrite

The README should be the single source of truth for getting started. Structure:

**Header**: Project name + one-sentence description

**What this is** (3–4 sentences covering all four capabilities: interactive tmux sessions, headless agent triggers, NanoClaw Telegram bot, API bridge)

**Prerequisites** (two sections):
- Already in place on the host (Ubuntu, Docker, Tailscale, Git, sudo user)
- Installed by setup.sh (nvm+Node, Bun, Claude Code, gh, tmux, jq, fzf, rg, fd, lazygit, Doppler)

**Quick start** (numbered steps — be precise):
1. Clone this repo onto the host server
2. Run `./setup.sh` (what it does, expected output)
3. Manual steps that can't be automated:
   - Claude Code OAuth: `sudo -u claude-remote -i claude auth login`
   - Doppler auth: `doppler login` then `doppler setup`
   - GitHub deploy key: copy from `~/.ssh/id_ed25519.pub`, add to each repo in GitHub settings
   - gh CLI auth: `sudo -u claude-remote -i gh auth login --with-token`
   - Add repos to `config/repos.json`, then re-run `setup/07-clone-repos.sh`
4. Start the Docker stack: `./scripts/dc-up.sh`
5. Verify everything: `./setup/10-verify.sh`
6. Launch your first session: `ssh claude-remote@<host>` then `launch <repo-name>`

**Architecture** (brief — refer to IMPLEMENTATION_PLAN.md for full details):
- ASCII diagram showing the three layers: host services, agent sandbox, external services
- Network isolation summary

**Daily usage**:
- SSH + tmux: `ssh claude-remote@<hostname>`, then `launch <project>`
- Headless agent: `POST http://localhost:4000/api/agents/trigger`
- NanoClaw: message `@ClaudeRemote` on Telegram
- Notifications: `./scripts/notify.sh "message"`

**Security model** (table from IMPLEMENTATION_PLAN.md section 15 — use minimal separators `|-|-|`)

**Secrets management** (brief: Doppler project `claude-remote`, configs: dev/docker/api/nanoclaw)

**Customization**:
- Add repos: edit `config/repos.json`
- Add skills: add `.md` files to `skills/`, re-run `setup/03-install-claude.sh`
- Replace theme: `claude theme export > config/claude-code-theme.json`, re-run `setup/03-install-claude.sh`

### 2. `docs/doppler.md`

Doppler secrets reference per IMPLEMENTATION_PLAN.md section 16. Include:
- Project name: `claude-remote`
- Configs table (dev, docker, api, nanoclaw) with what each contains
- Usage patterns (shell, docker compose, Claude Code, write a secret)
- How to add a new service: create a new config, create a service token, store token in the parent config

### 3. Final consistency check

Read through all files and fix any issues found:
- Broken cross-references (wrong paths, wrong script names)
- Placeholder text left from earlier groups (`<your-github-username>`, `<hostname>`, etc.) — these are INTENTIONAL placeholders that users fill in, but make sure they're clearly marked with comments or docs
- Missing `set -euo pipefail` in any shell script
- Any hardcoded secrets or IPs (replace with `<see-doppler>` or env vars)
- Consistency between `README.md` setup steps and what `setup.sh` actually does

Make corrections directly in the affected files.

---

## Validation

```bash
# All shell scripts pass syntax check
find setup/ scripts/ tmux/ -name "*.sh" -exec bash -n {} \; && echo "All shell scripts: OK"

# TypeScript still passes
cd agents && bun run typecheck && cd ..

# Key files exist
for f in README.md CLAUDE.md setup.sh docker/docker-compose.yml skills/api-bridge.md agents/src/trigger-handler.ts scripts/spawn-headless.sh; do
  [ -s "$f" ] && echo "✓ $f" || echo "✗ MISSING: $f"
done
```

---

## Execute on Homelab

Run the full verification script and capture what's working:

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

echo "=== Running verification script ==="
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/10-verify.sh" \
  | tee /tmp/verify-output.txt

echo ""
echo "=== Verification complete. Review output above. ==="
echo "Update MANUAL_TODOS.md with any remaining PENDING items."
```

After reviewing the output:
- Mark completed items in `MANUAL_TODOS.md` (change PENDING → DONE with date)
- Add any new items discovered during verification
- Update `README.md` with any corrections based on what actually worked vs what was planned

---

## Commit

```
docs: complete README, Doppler reference, and final consistency fixes
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
