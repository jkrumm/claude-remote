#!/usr/bin/env bash
# Clone repos listed in config/repos.json into ~/SourceRoot/. Idempotent.
set -euo pipefail

USERNAME="claude-remote"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPOS_FILE="/home/$USERNAME/SourceRoot/claude-remote/config/repos.json"
[[ -f "$REPOS_FILE" ]] || REPOS_FILE="$SCRIPT_DIR/../config/repos.json"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Run 02-install-deps.sh first." >&2
  exit 1
fi

REPO_COUNT=$(jq '.repos | length' "$REPOS_FILE")
echo "Cloning $REPO_COUNT repo(s) from $REPOS_FILE..."

for i in $(seq 0 $((REPO_COUNT - 1))); do
  NAME=$(jq -r ".repos[$i].name" "$REPOS_FILE")
  REPO_URL=$(jq -r ".repos[$i].url" "$REPOS_FILE")
  DEST="/home/$USERNAME/SourceRoot/$NAME"

  if [[ -d "$DEST/.git" ]]; then
    echo "  [ok] $NAME — already cloned, fetching..."
    sudo -u "$USERNAME" git -C "$DEST" fetch --quiet
  else
    echo "  [clone] $NAME from $REPO_URL"
    if sudo -u "$USERNAME" git clone "$REPO_URL" "$DEST" 2>&1; then
      echo "  [ok] $NAME cloned"
    else
      echo "  [skip] $NAME — clone failed (gh CLI not authenticated yet? Run setup/06-setup-gh-cli.sh first)"
      continue
    fi
  fi

  # Install dependencies if package.json exists
  if [[ -f "$DEST/package.json" ]]; then
    echo "  [deps] $NAME — running bun install"
    sudo -u "$USERNAME" bash -c "cd '$DEST' && ~/.bun/bin/bun install --frozen-lockfile --silent" || \
      sudo -u "$USERNAME" bash -c "cd '$DEST' && ~/.bun/bin/bun install --silent"
    echo "  [ok] $NAME deps installed"
  fi
done

echo "Repo cloning complete."
