# Group 5: tmux Configuration

## What You're Doing

Create the tmux configuration and project session launcher. This gives the `claude-remote` user a consistent, keyboard-friendly terminal environment accessible via SSH. The `launch` script is the primary entry point for starting a coding session.

---

## Research & Exploration First

1. Read `IMPLEMENTATION_PLAN.md` sections 8.1–8.4 in full (workflow, layout, launcher, tmux.conf)
2. Read `setup/08-setup-shell-env.sh` to understand how the tmux config gets installed (symlinked to `~/.tmux.conf`, `launch.sh` symlinked to `~/launch`)
3. Check the tmux popup bind (`bind -r y`) in section 8.4 — the `md5sum` command may not exist on macOS (the dev machine) but will exist on Ubuntu; note this

---

## What to Implement

### 1. `tmux/tmux.conf`

Per IMPLEMENTATION_PLAN.md section 8.4. Copy the config from the spec exactly, then verify:
- `set -g prefix C-a` — Ctrl+A as prefix (not Ctrl+B)
- Mouse mode on
- 50,000 line history limit
- 1-based window and pane indexing
- Auto-renumber windows
- 0ms escape time (important for Vim/Claude Code keybindings)
- Minimal status bar with session name on left, time on right
- Pane borders: grey (inactive), blue (active)
- hjkl pane navigation
- Ctrl+A y: per-directory Claude Code popup (the `md5sum` command — correct for Ubuntu)

### 2. `tmux/layouts/default.sh`

Per IMPLEMENTATION_PLAN.md section 8.2. The layout is sourced by `launch.sh` with `$SESSION` and `$REPO_DIR` already set.

Layout: 75% left (Claude Code), 25% right split into top (terminal) and bottom (dev server):

```
┌────────────────────────┬──────────┐
│                        │ Terminal  │
│     Claude Code        ├──────────┤
│     (3/4 width)        │ DevServer │
│                        │          │
└────────────────────────┴──────────┘
```

The script must:
1. Create the session: `tmux new-session -d -s "$SESSION" -c "$REPO_DIR"`
2. Send `c` (the Claude Code alias) to pane 0
3. Split horizontally with `tmux split-window -h -p 25` to create right side
4. Split vertically with `tmux split-window -v -p 50` for the bottom right pane
5. Focus back to pane 0 (Claude Code)
6. Attach: `tmux attach-session -t "$SESSION"`

### 3. `tmux/launch.sh`

Per IMPLEMENTATION_PLAN.md section 8.3. The main session launcher.

Requirements:
- `set -euo pipefail`
- Usage: `launch <project-name> [layout]` (default layout: `default`)
- Derive `SESSION="dev-${PROJECT}"` and `REPO_DIR="$HOME/SourceRoot/${PROJECT}"`
- Check repo directory exists; if not, print available repos and exit 1
- Check layout script exists; if not, print available layouts and exit 1
- If session already exists: attach and exit (don't create a new one)
- Source the layout script to create the session

The script is designed to be symlinked to `~/launch` by the setup script.

---

## Validation

```bash
bash -n tmux/launch.sh
bash -n tmux/layouts/default.sh
```

---

## Execute on Homelab

```bash
PASS=$(doppler secrets get JKRUMM_PASSWORD -p homelab -c prod --plain)
ssh homelab "cd ~/SourceRoot/claude-remote && git pull"

# Re-run shell env setup to install tmux.conf and symlink launch
ssh homelab "echo '$PASS' | sudo -S bash ~/SourceRoot/claude-remote/setup/08-setup-shell-env.sh"

# Verify tmux.conf installed
ssh homelab "sudo -u claude-remote ls -la ~/.tmux.conf 2>/dev/null || echo 'tmux.conf not installed yet'"

# Verify launch symlink
ssh homelab "sudo -u claude-remote ls -la ~/launch 2>/dev/null || echo 'launch not symlinked yet'"

# Test tmux is available
ssh homelab "sudo -u claude-remote tmux -V"
```

---

## Commit

```
feat(tmux): session launcher and default layout for Claude Code workflow
```

---

## Done

Append notes on what was done, any deviations, and gotchas to `docs/plan/NOTES.md`.
