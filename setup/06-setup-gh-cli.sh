#!/usr/bin/env bash
# Configure git and authenticate gh CLI for the claude-remote user.
# Uses a GitHub fine-grained PAT stored in Doppler. Idempotent.
set -euo pipefail

USERNAME="claude-remote"
HOSTNAME_VAL="$(hostname)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPOS_FILE="$SCRIPT_DIR/../config/repos.json"

# ── Git global config ─────────────────────────────────────────────────────────

sudo -u "$USERNAME" git config --global user.name "claude-remote"
sudo -u "$USERNAME" git config --global user.email "claude-remote@${HOSTNAME_VAL}"
sudo -u "$USERNAME" git config --global init.defaultBranch main
sudo -u "$USERNAME" git config --global pull.rebase false
# Remove any legacy SSH override (we use HTTPS via gh credential helper)
sudo -u "$USERNAME" git config --global --unset url."git@github.com:".insteadOf 2>/dev/null || true
echo "Git global config set for $USERNAME"

# ── PAT auth ──────────────────────────────────────────────────────────────────

# Check if already authenticated
if sudo -u "$USERNAME" gh auth status &>/dev/null; then
  echo "gh CLI already authenticated for $USERNAME."
  sudo -u "$USERNAME" gh auth setup-git 2>/dev/null || true
  exit 0
fi

# Try env var first (allows injection from outside), then Doppler
if [[ -z "${GITHUB_TOKEN:-}" ]] && command -v doppler &>/dev/null; then
  GITHUB_TOKEN=$(doppler secrets get GITHUB_TOKEN --project claude-remote --config prod --plain 2>/dev/null || true)
fi

if [[ -z "$GITHUB_TOKEN" ]]; then
  # Interactive guided flow
  echo ""
  echo "=================================================================="
  echo "  GitHub fine-grained PAT required for gh CLI"
  echo "=================================================================="
  echo ""
  echo "  Open this URL in your browser:"
  echo "  https://github.com/settings/personal-access-tokens/new"
  echo ""
  echo "  Settings to use:"
  echo "    Token name:         claude-remote@$(hostname)"
  echo "    Expiration:         1 year (or No expiration)"
  echo "    Resource owner:     your GitHub account"
  echo "    Repository access:  Only select repositories →"

  # Print repo names from config
  if command -v jq &>/dev/null && [[ -f "$REPOS_FILE" ]]; then
    COUNT=$(jq '.repos | length' "$REPOS_FILE")
    for i in $(seq 0 $((COUNT - 1))); do
      REPO=$(jq -r ".repos[$i].url" "$REPOS_FILE" | sed 's|https://github.com/||;s|\.git$||')
      echo "                        $REPO"
    done
  fi

  echo ""
  echo "    Permissions required (Repository permissions only):"
  echo "      Contents:         Read and write  (push branches)"
  echo "      Metadata:         Read-only       (auto-selected)"
  echo "      Pull requests:    Read and write  (create/view PRs)"
  echo "      Commit statuses:  Read-only       (check CI)"
  echo ""
  echo "    Everything else: No access"
  echo ""
  echo "  After generating, paste the token below."
  echo "=================================================================="
  echo ""

  read -r -s -p "  Paste token (input hidden): " GITHUB_TOKEN
  echo ""
  echo ""

  if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "No token provided. Re-run this script when ready."
    exit 1
  fi
fi

# ── Verify token before storing ───────────────────────────────────────────────

echo "Verifying token..."

VERIFY_OUTPUT=$(echo "$GITHUB_TOKEN" | sudo -u "$USERNAME" gh auth login --with-token 2>&1) || {
  echo "ERROR: gh auth login failed. Token may be invalid."
  echo "$VERIFY_OUTPUT"
  exit 1
}

# Verify API access
if ! sudo -u "$USERNAME" gh api /user --jq '.login' &>/dev/null; then
  echo "ERROR: Token authenticated but API access failed."
  exit 1
fi

LOGIN=$(sudo -u "$USERNAME" gh api /user --jq '.login')
echo "  Authenticated as: $LOGIN"

# Verify access to each configured repo
if command -v jq &>/dev/null && [[ -f "$REPOS_FILE" ]]; then
  COUNT=$(jq '.repos | length' "$REPOS_FILE")
  ALL_OK=true
  for i in $(seq 0 $((COUNT - 1))); do
    REPO_URL=$(jq -r ".repos[$i].url" "$REPOS_FILE" | sed 's|https://github.com/||;s|\.git$||')
    NAME=$(jq -r ".repos[$i].name" "$REPOS_FILE")
    if sudo -u "$USERNAME" gh api "/repos/$REPO_URL" --jq '.full_name' &>/dev/null; then
      echo "  ✓ repo access: $NAME"
    else
      echo "  ✗ no access:   $NAME (add to token's repository list)"
      ALL_OK=false
    fi
  done
  if [[ "$ALL_OK" == "false" ]]; then
    echo ""
    echo "WARNING: Some repos are not accessible. Regenerate the token with the correct repos selected."
    echo "Run this script again to re-authenticate."
    sudo -u "$USERNAME" gh auth logout --hostname github.com 2>/dev/null || true
    exit 1
  fi
fi

echo ""
echo "Token verified. Storing in Doppler..."
doppler secrets set GITHUB_TOKEN="$GITHUB_TOKEN" --project claude-remote --config prod 2>/dev/null || \
  echo "  [warn] Could not store in Doppler — token valid but not persisted."

# ── Configure git credential helper ──────────────────────────────────────────

sudo -u "$USERNAME" gh auth setup-git
echo "git credential helper configured (HTTPS via gh)"

echo ""
echo "gh CLI ready for $USERNAME"
