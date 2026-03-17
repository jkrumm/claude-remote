#!/usr/bin/env bash
# tmux/layouts/default.sh
# Layout: 75% left (Claude Code), 25% right split top/bottom (terminal + dev server)
# Called by launch.sh with $SESSION and $REPO_DIR set.

tmux new-session -d -s "$SESSION" -c "$REPO_DIR"

# Pane 0: Claude Code (left, 75% width)
tmux send-keys -t "$SESSION:0.0" "c" Enter

# Pane 1: Terminal (right-top, 25% width)
tmux split-window -h -t "$SESSION:0.0" -c "$REPO_DIR" -p 25

# Pane 2: Dev server (right-bottom, 50% of right side)
tmux split-window -v -t "$SESSION:0.1" -c "$REPO_DIR" -p 50

# Focus Claude Code pane
tmux select-pane -t "$SESSION:0.0"

tmux attach-session -t "$SESSION"
