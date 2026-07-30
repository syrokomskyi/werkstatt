---
description: Session-end protocol — run fo-session-retro when the operator says "Завершаем эту сессию" or similar
---

# Session-End Protocol

When the operator says any of the following, invoke the `fo-session-retro` skill via the `skill` tool BEFORE producing a closing summary:

- "Завершаем эту сессию"
- "Завершаем сессию"
- "Заканчиваем сессию"
- "Завершить сессию"
- "End session"
- "Wrap up"
- "Session end"
- "/session-end"

## Steps

1. **Invoke `fo-session-retro`** via the `skill` tool. Do NOT produce a closing summary first — the retro skill IS the closing protocol.
2. **Wait for the retro to complete** — it will categorize insights, route them, commit, and produce its own summary.
3. **Do not duplicate** — the retro skill's report is the session-end output. Do not add a separate "session complete" message.

## Why this workflow exists

Without an explicit trigger, agents interpret "Завершаем эту сессию" as a request for a summary, not as a skill invocation. This workflow ensures `fo-session-retro` runs deterministically on session-end commands.
