# Skill: /pr

GitHub PR workflow for the `claude-remote` environment.

---

## Create a PR

```bash
# Always create a branch first
git checkout -b feature/<description>

# ... commit your changes with /commit ...

# Push and create PR
git push -u origin HEAD
gh pr create --base develop --title "feat(<scope>): <description>" --body "<summary>"
```

Use `--base main` if the repo has no `develop` branch.

---

## PR title format

Follow conventional commit style:
```
feat(api): add agent trigger endpoint
fix(tmux): resolve pane focus on session attach
```

---

## After PR is created

Send a notification:
```bash
curl -s -X POST http://localhost:4000/api/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "PR ready: <title>\n<url>", "title": "<repo>", "priority": 3}'
```

---

## If `git push` fails

The `claude-remote` user uses HTTPS authenticated via `gh` CLI. If push fails, verify the remote URL is HTTPS (not SSH) and that `gh auth status` shows authenticated:

```bash
# Ensure remote is HTTPS
git remote set-url origin https://github.com/<org>/<repo>.git
git push -u origin HEAD
```

---

## Rules

- **Never push to `main`, `master`, or `develop`** — always PR
- **Always create a branch before working** — headless agents use worktrees automatically
- **Run tests and lint before opening PR** — check `package.json` for scripts
