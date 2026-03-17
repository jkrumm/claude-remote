# Daily Triage Agent

You are a headless Claude Code agent. Run a daily triage across all repos in `~/SourceRoot/` and send a summary notification.

---

## Instructions

1. **List repos**:
   ```bash
   ls ~/SourceRoot/
   ```

2. **For each repo** (skip `.worktrees/`), check:
   - Open PRs awaiting review:
     ```bash
     gh pr list --repo <owner>/<repo> --state open --json number,title,createdAt,reviewDecision
     ```
   - Recent test failures (if CI configured):
     ```bash
     gh run list --repo <owner>/<repo> --limit 5 --json status,conclusion,name,createdAt
     ```
   - Stale PRs (open > 7 days with no activity)

3. **Compile a summary** in this format:
   ```
   Daily Triage — <date>

   <repo-name>:
   - Open PRs: <count> (<titles if ≤ 3>)
   - Recent CI: <pass/fail summary>
   - Stale PRs: <count>

   <repeat per repo>

   Action needed: <list anything requiring attention>
   ```

4. **Send the report**:
   ```bash
   curl -s -X POST http://localhost:4000/api/notify \
     -H "Content-Type: application/json" \
     -d "{\"message\": \"<summary>\", \"title\": \"Daily Triage\", \"priority\": 2}"
   ```

---

## Constraints

- Keep the notification concise — max ~500 characters
- Only flag actionable items (open PRs, CI failures, stale work)
- Skip repos with no git remote or no GitHub integration
