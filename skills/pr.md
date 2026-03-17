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

## SSH / HTTPS fallback

The `claude-remote` user authenticates with GitHub via a per-repo deploy key.
If `git push` fails with a permission error on a repo that doesn't have a deploy key configured:

```bash
# Switch remote to HTTPS (uses gh CLI auth)
git remote set-url origin https://github.com/<org>/<repo>.git
git push -u origin HEAD
```

---

## Rules

- **Never push to `main`, `master`, or `develop`** — always PR
- **Always create a branch before working** — headless agents use worktrees automatically
- **Run tests and lint before opening PR** — check `package.json` for scripts
