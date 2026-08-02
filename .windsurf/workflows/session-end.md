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

1. **Clean up test temp directories** — remove leftover `tmp-*` and `tmp/` directories created by unit tests:
   ```bash
   find packages -maxdepth 2 -type d -name 'tmp-*' -exec rm -rf {} + 2>/dev/null; \
   find packages -maxdepth 2 -type d -name 'tmp' -exec rm -rf {} + 2>/dev/null
   ```
   This is safe to auto-run (`// turbo`).
2. **Invoke `fo-session-retro`** via the `skill` tool. Do NOT produce a closing summary first — the retro skill IS the closing protocol.
3. **Wait for the retro to complete** — it will categorize insights, route them, commit, and produce its own summary.
4. **Do not duplicate** — the retro skill's report is the session-end output. Do not add a separate "session complete" message.

## Language discipline (NON-NEGOTIABLE)

All `fo-session-retro` output — the insight triage table, the `ask_user_question` confirmation prompt, the final summary report, and any inline commentary — MUST be written in `PREFERENCES.md` `aiLanguage`. English templates in the skill are structural placeholders only. If `aiLanguage` is `ru`, the triage table heading is «Сортировка инсайтов сессии», not «Session Insight Triage». Only identifiers (file paths, skill names, RFC/ADR ids, commit hashes) stay untranslated.

## Why this workflow exists

Without an explicit trigger, agents interpret "Завершаем эту сессию" as a request for a summary, not as a skill invocation. This workflow ensures `fo-session-retro` runs deterministically on session-end commands.
