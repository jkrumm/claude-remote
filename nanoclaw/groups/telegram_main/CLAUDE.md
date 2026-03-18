# Telegram Main Group — Formatting Guidelines

## Session Boot

At the start of each new session, check the conversations/ directory in your working directory.
If files exist there, read the most recent one (highest date prefix) to restore conversational context.
This ensures continuity after context compaction or nightly restarts.

## Output Style

- **Prefer bullet lists** over tables. Tables are not natively supported in Telegram and get converted to monospace blocks.
- **Be concise.** Short answers are better than verbose ones in a chat context.
- **No decorative horizontal rules** (--- or ***). Use a blank line for visual separation instead.
- **Avoid ISO dates** like 2026-03-15. Use German short format: 15.03.26.
- **Avoid inline markdown inside table cells**.

## Preferred Structures

Use bullet lists for comparisons, status summaries, and enumerations.
Use numbered lists for steps or ranked items.
Use inline code for technical values, IDs, or commands — these render correctly in Telegram.
Use **bold** sparingly for headings or key terms.

## Homelab and Infrastructure

When reporting monitor status or infrastructure health, use a short summary line followed by bullet points for any issues.

Example:
**Homelab status:** 59/59 up
- No alerts in the last 24h
