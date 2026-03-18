#!/usr/bin/env tsx
/**
 * One-time seed script: inserts 3 proactive monitoring tasks into nanoclaw's SQLite.
 * Safe to re-run — skips tasks that already exist by ID.
 *
 * Usage (on server):
 *   cd ~/SourceRoot/claude-remote/nanoclaw
 *   tsx scripts/seed-monitoring-tasks.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH =
  process.env.NANOCLAW_DB ||
  path.join(process.env.HOME!, 'nanoclaw-data/store/messages.db');

const db = new Database(DB_PATH);

const mainGroup = db
  .prepare(
    `SELECT jid, folder FROM registered_groups WHERE is_main = 1 LIMIT 1`,
  )
  .get() as { jid: string; folder: string } | undefined;

if (!mainGroup) {
  console.error('No main group found in registered_groups. Is nanoclaw set up?');
  process.exit(1);
}

const CHAT_JID = mainGroup.jid;
const GROUP_FOLDER = mainGroup.folder;
const NOW = new Date().toISOString();

console.log(`Seeding tasks for group: ${GROUP_FOLDER} (${CHAT_JID})`);

// ─── Prompts ──────────────────────────────────────────────────────────────────

const HOURLY_PROMPT = `Silent hourly health check. Steps:

1. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json).
   If missing or invalid, initialise: { "last_check": null, "active_issues": {}, "events_24h": [] }

2. Fetch GET $CLAUDE_REMOTE_API_URL/summary with Authorization: Bearer $CLAUDE_REMOTE_API_SECRET

3. Determine current active issues from summary:
   - UptimeKuma monitors where status is not "up"
   - Docker containers (homelab + VPS) where restart_count > 5 or status is not "running"
   - NTFY alerts in the last hour with priority >= high

   Use a stable key for each issue, e.g. "uptimekuma:monitor-name" or "docker:homelab:container-name".

4. For each current issue:
   - Not in active_issues → add it with { label, first_seen: now, ntfy_sent: true }, send NTFY alert, append to events_24h
   - Already in active_issues → skip (already notified)

5. For each issue in active_issues no longer present in the current scan:
   - Calculate duration from first_seen to now
   - Send NTFY resolve notification
   - Append resolved event to events_24h
   - Remove from active_issues

6. Prune events_24h: remove entries older than 48 hours.

7. Set last_check to current ISO timestamp. Write updated monitoring_state.json to CWD.

8. DO NOT produce any text output. Use tool calls only (file read/write + POST /ntfy/send).
   Silence = healthy. The absence of output prevents Telegram messages.

NTFY alert format:
  POST $CLAUDE_REMOTE_API_URL/ntfy/send  Bearer $CLAUDE_REMOTE_API_SECRET
  { "title": "⚠️ {label}", "message": "Down since {first_seen formatted as HH:MM}", "priority": "high" }

NTFY resolve format:
  { "title": "✅ {label} resolved", "message": "Was down {duration, e.g. 23 min}", "priority": "default" }`;

const MORNING_PROMPT = `Morning digest. Compose a concise Telegram message for Johannes.

Steps:
1. Fetch GET $CLAUDE_REMOTE_API_URL/summary (Bearer $CLAUDE_REMOTE_API_SECRET)
   → current system health, TickTick due-today + overdue, GitHub open PRs/notifications

2. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json)
   → events_24h for overnight activity (since yesterday 23:00)

3. Format and send the following as your response (Telegram markdown rules apply):

🌅 Good morning — {DD.MM.YY}

**System** {one line: "All healthy" or "N issues: list them briefly"}
**Overnight** {events from events_24h since 23:00 yesterday, or "Quiet night"}
**Today** {TickTick tasks due today, max 5 — title + project, no padding}
**Backlog** {overdue count if any, open PRs count — skip section if both zero}

Rules:
- Under 20 lines total
- Skip sections that have no content
- Dates in German short format (18.03.)
- Use **bold** for section headers, bullet lists for items
- No markdown tables, no ## headings`;

const EVENING_PROMPT = `Evening wrap-up. Compose a concise motivating Telegram message for Johannes.

Steps:
1. Fetch GET $CLAUDE_REMOTE_API_URL/summary (Bearer $CLAUDE_REMOTE_API_SECRET)
   → GitHub notifications, TickTick tasks

2. Fetch GET $CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm (Bearer $CLAUDE_REMOTE_API_SECRET)
   Then for active repos, check recent commits/PRs merged today:
   GET $CLAUDE_REMOTE_API_URL/github/api/repos/jkrumm/{repo}/commits?since={today_00:00_ISO}

3. Read monitoring_state.json from CWD (/workspace/group/monitoring_state.json)
   → events_24h for today's incidents (type: issue_detected or resolved)

4. Format and send the following as your response (Telegram markdown rules apply):

🌙 Day wrap — {DD.MM.YY}

**Shipped** {PRs merged today, notable commits — or "Quiet day"}
**Resolved** {monitoring issues fixed today from events_24h — skip if none}
**System** {current health one line: "All clear" or list issues}
**Tomorrow** {TickTick tasks due tomorrow, max 3 — title only}

Rules:
- Under 15 lines total
- Tone: direct, factual, briefly acknowledge what got done
- Skip sections with no content
- Dates in German short format (18.03.)
- Use **bold** for section headers, bullet lists for items
- No markdown tables, no ## headings`;

// ─── Seed helper ──────────────────────────────────────────────────────────────

function seedTask(
  id: string,
  prompt: string,
  cron: string,
  label: string,
): void {
  const existing = db
    .prepare('SELECT id FROM scheduled_tasks WHERE id = ?')
    .get(id);
  if (existing) {
    console.log(`  skip  ${id} — already exists`);
    return;
  }

  db.prepare(
    `INSERT INTO scheduled_tasks
      (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
     VALUES (?, ?, ?, ?, 'cron', ?, 'isolated', datetime('now'), 'active', ?)`,
  ).run(id, GROUP_FOLDER, CHAT_JID, prompt, cron, NOW);

  console.log(`  seeded ${id} — ${label} (${cron})`);
}

seedTask('monitoring-hourly', HOURLY_PROMPT, '0 * * * *', 'hourly health check');
seedTask('monitoring-morning', MORNING_PROMPT, '30 7 * * *', 'morning digest 07:30');
seedTask('monitoring-evening', EVENING_PROMPT, '0 23 * * *', 'evening wrap-up 23:00');

db.close();
console.log('\nDone. Verify with:');
console.log(
  `  sqlite3 ${DB_PATH} "SELECT id, schedule_value, status, next_run FROM scheduled_tasks"`,
);
