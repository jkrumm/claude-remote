# Skill: /commit

Conventional commit workflow for the `claude-remote` environment.

---

## Format

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

**Scope:** optional, use the affected module or directory (e.g. `api`, `tmux`, `skills`, `docker`)

**Examples:**
```
feat(api): add webhook dispatch to agent trigger endpoint
fix(tmux): correct pane index for right-side split
chore(deps): update bun to 1.2.0
docs(skills): add examples to api-bridge skill
```

---

## Before committing

1. Run lint and tests: check `package.json` for available scripts
2. Verify nothing sensitive is staged (no `.env`, no tokens)
3. Stage only the files relevant to this change

---

## Rules

- **No AI attribution** — no `Co-Authored-By: Claude` footer, ever
- **Never push to `main`, `master`, or `develop`** — always use a branch + PR
- **Never commit secrets** — all secrets via Doppler
- **One logical change per commit** — don't bundle unrelated changes

---

## Branch naming

```
feature/<short-description>
fix/<short-description>
chore/<short-description>
```

---

## Workflow

```bash
git checkout -b feature/<description>
# ... make changes ...
git add <specific files>
git commit -m "feat(<scope>): <description>"
```

Then create a PR with `/pr`.
