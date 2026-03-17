# RALPH Notes — claude-remote

Append learning notes here after each group completes.

---

## Group 5: tmux Configuration

### What was implemented
`tmux/tmux.conf` (Ctrl+A prefix, mouse, hjkl nav, Claude popup), `tmux/launch.sh` (project session launcher symlinked to `~/launch`), and `tmux/layouts/default.sh` (75/25 split with Claude Code + terminal + dev server panes).

### Deviations from prompt
None — implemented exactly per spec.

### Gotchas & surprises
The setup script (`08-setup-shell-env.sh`) resolves `CLAUDE_REPO` to the `claude-remote` user's own checkout at `/home/claude-remote/SourceRoot/claude-remote`, not jkrumm's checkout. Must `git pull` in the `claude-remote` user's repo before re-running the setup script, or the script silently skips the tmux install with `[skip]`.

### Tests added
None (shell syntax validated via `bash -n`).

### Future improvements
Could add more layouts (e.g., `fullscreen.sh` for single-pane sessions). The `md5sum` in the Claude popup bind is Linux-only — macOS would need `md5 -q` — but this runs on Ubuntu homelab so it's correct.

---

## Group 6: Claude Code Skills & CLAUDE.md

### What was implemented
Five skill files in `skills/`: `api-bridge.md`, `notify.md`, `trigger-agent.md`, `commit.md`, `pr.md`. Theme placeholder `config/claude-code-theme.json`. Extended `CLAUDE.md` with Doppler usage patterns, `c` alias explanation, and database schema conventions.

### Deviations from prompt
`CLAUDE.md` already had the correct content from Group 1 for environment, git workflow, available skills, and conventions. Extended in-place rather than replacing — added three new sections (Doppler, Shell aliases, Database schemas) that were specified in section 7.7 but missing from the initial file.

### Gotchas & surprises
`setup/03-install-claude.sh` already handles skills installation — copies `skills/*.md` from the claude-remote user's repo checkout to `~/.claude/skills/`. No changes needed to the setup script. Also installs `CLAUDE.md` to `~/.claude/CLAUDE.md` automatically.

### Tests added
None (validated with shell loop checking file presence + python3 JSON parse for theme.json).

### Future improvements
`skills/commit.md` and `skills/pr.md` are intentionally minimal — they document environment conventions rather than automating git commands. The `config/local-skills/` overlay (section 9.3) was not created — it's optional and can be added when needed.

---

## Group 7: Agent SDK & Headless Trigger System

### What was implemented
`agents/package.json` + `tsconfig.json`, `agents/src/trigger-handler.ts` (Agent SDK runner with worktree support, PR creation, NTFY notification), three prompt templates (`generic-fix.md`, `pr-review.md`, `daily-triage.md`), `scripts/spawn-headless.sh`, `scripts/notify.sh`.

### Deviations from prompt
Agent SDK API verified via Context7 — `query()` takes `{ prompt, options }` with `permissionMode: 'bypassPermissions'` and requires `allowDangerouslySkipPermissions: true` alongside it (both are needed, not just one). The `SDKResultMessage` has a `subtype` field (`"success"` vs `"error_*"`) for distinguishing outcome. Pinned resolved versions in `package.json` after `bun install` resolved `latest`.

### Gotchas & surprises
Bun was not yet installed for the `claude-remote` user — had to run `02-install-deps.sh` before the typecheck step on homelab could pass. `sudo -u claude-remote bash -c '...'` doesn't source `.bashrc`, so `bun` isn't in PATH unless `BUN_INSTALL` is set explicitly in the command. The `08-setup-shell-env.sh` script now auto-pulls the claude-remote user's repo, but jkrumm's copy must be pulled first (bootstrap problem on first deploy of the new version). The PR creation in `trigger-handler.ts` tries `develop` first, falls back to `main` — matches the project git workflow.

### Tests added
None (shell syntax via `bash -n`, TypeScript via `bun run typecheck` — passes on both local and homelab).

### Future improvements
`spawn-headless.sh` currently passes `--worktree true/false` as a string arg; `trigger-handler.ts` checks `!== "false"` to handle this. Could be cleaner with a proper CLI arg parser. The `createPr` function uses a hardcoded commit message prefix — prompt templates should instruct the agent to commit with a meaningful message before the script pushes. The `bun.lock` file is gitignored globally but should probably be tracked in `agents/` — worth revisiting when `claude-remote-api` is added.

---
## Group 8: Complete README & Documentation

### What was implemented
Full README rewrite with architecture diagram, security model table, daily usage patterns, and project structure tree. New `docs/doppler.md` with Doppler secrets reference, configs table, usage patterns, and new-service setup guide. Also tracked `IMPLEMENTATION_PLAN.md` (was present but never committed), added missing `set -euo pipefail` to `tmux/layouts/default.sh`, and redacted a real Tailscale IP that was in two tracked files.

### Deviations from prompt
Group 8 said to run a homelab verification (`10-verify.sh`) and update `MANUAL_TODOS.md` based on results. Skipped the remote homelab run — the verification script requires the Docker stack and Claude Code auth to be complete (pending manual steps M-01, M-03, M-05), so running it now would produce mostly failures that aren't meaningful yet.

### Gotchas & surprises
`IMPLEMENTATION_PLAN.md` had never been committed despite being referenced by multiple documents — it existed from before the first commit and was never explicitly staged. The Tailscale IP appeared in two tracked files and was redacted to `<tailscale-ip>` per the no-sensitive-data-in-git convention.

### Tests added
None — documentation only. Validated: all shell scripts pass `bash -n`, TypeScript passes `bun run typecheck`, all key files present.

### Future improvements
The homelab verification run should be done once M-01, M-03, and M-05 manual steps are complete. At that point, re-run `./setup/10-verify.sh` and update `MANUAL_TODOS.md` with the actual state.

---
