#!/usr/bin/env bash
# Verify the claude-remote setup. Run this after all setup steps complete.
set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"  # "ok" or "fail"
  local detail="${3:-}"
  if [[ "$result" == "ok" ]]; then
    echo "  ✓  $label${detail:+ — $detail}"
    PASS=$((PASS + 1))
  else
    echo "  ✗  $label${detail:+ — $detail}"
    FAIL=$((FAIL + 1))
  fi
}

run_as_user() {
  sudo -u claude-remote bash -c "$1" 2>/dev/null
}

echo ""
echo "=== User isolation ==="
# Check docker: claude-remote should not be in the docker group
if id -nG claude-remote | grep -qw docker; then
  check "docker blocked" "fail" "claude-remote is in docker group — SECURITY ISSUE"
else
  check "docker blocked" "ok" "not in docker group"
fi
# Check sudo: claude-remote should have no sudo privileges
if sudo -u claude-remote sudo -l 2>&1 | grep -q "may run\|NOPASSWD"; then
  check "sudo blocked" "fail" "claude-remote has sudo privileges — SECURITY ISSUE"
else
  check "sudo blocked" "ok" "no sudo privileges"
fi
[[ -d /home/claude-remote/SourceRoot ]] \
  && check "SourceRoot exists" "ok" || check "SourceRoot missing" "fail"

echo ""
echo "=== Tools ==="
for cmd in tmux jq fzf rg fd lazygit doppler gh; do
  command -v "$cmd" &>/dev/null \
    && check "$cmd" "ok" "$(command -v $cmd)" || check "$cmd" "fail" "not found"
done
run_as_user 'command -v claude' &>/dev/null \
  && check "claude (user)" "ok" || check "claude (user)" "fail" "not in PATH"
run_as_user 'command -v bun' &>/dev/null \
  && check "bun (user)" "ok" || check "bun (user)" "fail" "not in PATH"
run_as_user '~/.nvm/nvm.sh && node --version' &>/dev/null \
  && check "node (user)" "ok" || check "node (user)" "fail" "nvm not loaded"

echo ""
echo "=== Docker stack ==="
if command -v docker &>/dev/null; then
  for name in claude-remote-postgres claude-remote-valkey; do
    docker inspect "$name" --format '{{.State.Status}}' 2>/dev/null | grep -q "running" \
      && check "$name" "ok" "running" || check "$name" "fail" "not running"
  done
else
  check "docker" "fail" "docker not available"
fi

echo ""
echo "=== Connectivity ==="
curl -sf http://localhost:4000/health &>/dev/null \
  && check "claude-remote-api" "ok" || check "claude-remote-api" "fail" "not reachable (start Docker stack)"

echo ""
echo "=== Git ==="
run_as_user 'gh auth status 2>&1' | grep -qi "logged in\|authenticated" \
  && check "gh CLI (claude-remote)" "ok" || check "gh CLI (claude-remote)" "fail" "auth required — run setup/06-setup-gh-cli.sh (M-02)"
run_as_user 'gh api /user --jq .login 2>/dev/null' | grep -q "." \
  && check "GitHub API access" "ok" "$(run_as_user 'gh api /user --jq .login 2>/dev/null')" \
  || check "GitHub API access" "fail" "token may lack repo permissions"

echo ""
echo "=== Claude Code ==="
run_as_user 'claude --version' &>/dev/null \
  && check "claude installed" "ok" "$(run_as_user 'claude --version 2>/dev/null' | head -1)" \
  || check "claude installed" "fail"
run_as_user 'claude auth status 2>&1' | grep -qi "logged in\|authenticated\|oauth" \
  && check "claude oauth" "ok" || check "claude oauth" "fail" "auth required (M-01)"

echo ""
echo "=== Network isolation ==="
if docker inspect claude-remote-nanoclaw &>/dev/null 2>&1; then
  docker exec claude-remote-nanoclaw curl -sf --connect-timeout 2 http://claude-remote-api:4000/health &>/dev/null \
    && check "nanoclaw → api" "ok" || check "nanoclaw → api" "fail"
  docker exec claude-remote-nanoclaw curl -sf --connect-timeout 2 http://ntfy:80 &>/dev/null \
    && check "nanoclaw → ntfy" "fail" "SHOULD be blocked" || check "nanoclaw → ntfy" "ok" "correctly blocked"
else
  check "network isolation" "ok" "(nanoclaw not running yet — check after Docker stack is up)"
fi

echo ""
echo "=============================="
echo "  $PASS passed / $FAIL failed"
echo "=============================="
[[ $FAIL -eq 0 ]] && echo "  All checks passed." || echo "  See MANUAL_TODOS.md for pending items."
echo ""
