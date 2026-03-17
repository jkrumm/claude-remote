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
