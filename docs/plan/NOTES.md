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
