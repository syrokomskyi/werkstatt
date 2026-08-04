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

1. **Clean up test temp directories** — remove leftover `tmp-*` and `tmp/` directories created by unit tests anywhere in the repo:
   ```bash
   find . -type d -name 'tmp-*' -not -path './.git/*' -exec rm -rf {} + 2>/dev/null; \
   find . -type d -name 'tmp' -not -path './.git/*' -not -path './node_modules/*' -exec rm -rf {} + 2>/dev/null
   ```
   This is safe to auto-run (`// turbo`).
2. **Archive terminal documents** — run the `docs.archive` umbrella command to move terminal RFCs, ADRs, plans, audits, sessions, and missions into their respective `archive/` subdirectories:
   ```bash
   rtk pnpm exec forge docs.archive
   ```
   This is safe to auto-run (`// turbo`). The command is idempotent — re-running is safe. If files were moved, commit them in step 3 as part of the clean tree check (they are "our" changes).
3. **Clean tree check (NON-NEGOTIABLE)** — verify that this session has no uncommitted changes left in the working tree. Other agents may be working in parallel, so you MUST distinguish your changes from theirs.

   **3a. Collect dirty files from all git repos in the workspace:**

   ```bash
   # Werkstatt root
   git status --porcelain
   # All active mission workpieces (glob — safe even if no matches)
   for d in missions/*/workpiece; do [ -d "$d/.git" ] && echo "=== $d ===" && git -C "$d" status --porcelain; done
   ```

   **3b. Classify each dirty file as "ours" or "theirs":**
   - Review your conversation history for this session. A file is "ours" if EITHER:
     - You directly modified it via `edit`, `write_to_file`, `multi_edit`, or `edit_notebook` tools.
     - You indirectly modified it by running a command (`run_command`) that generates or updates it (e.g. codegen pipelines like `surface.generate`, `page.markdown.generate`, `bordbuch.generate`, build commands, etc.).
   - A file is "theirs" if it appears dirty but you have no record of touching it in this session. This means another parallel agent modified it. Do NOT commit, stash, or revert these files.

   **3c. Commit our changes:**
   - If there are "our" dirty files in werkstatt root: `git add <files>` and `git commit -m "<descriptive message>"`.
   - If there are "our" dirty files in a workpiece: `git -C missions/<missionId>/workpiece add <files>` and `git -C missions/<missionId>/workpiece commit -m "<descriptive message>"`.
   - Use descriptive commit messages that explain what the changes are, not just "session cleanup".

   **3d. Report remaining dirty files:**
   - If any dirty files remain after committing ours, report them to the operator: "Следующие файлы изменены другим агентом и оставлены нетронутыми: <list>". Then proceed.
   - If the tree is now clean (or was clean from the start), proceed silently.

4. **Invoke `fo-session-retro`** via the `skill` tool. Do NOT produce a closing summary first — the retro skill IS the closing protocol.
5. **Wait for the retro to complete** — it will categorize insights, route them, commit, and produce its own summary.
6. **Do not duplicate** — the retro skill's report is the session-end output. Do not add a separate "session complete" message.

## Language discipline (NON-NEGOTIABLE)

All `fo-session-retro` output — the insight triage table, the `ask_user_question` confirmation prompt, the final summary report, and any inline commentary — MUST be written in `PREFERENCES.md` `aiLanguage`. English templates in the skill are structural placeholders only. If `aiLanguage` is `ru`, the triage table heading is «Сортировка инсайтов сессии», not «Session Insight Triage». Only identifiers (file paths, skill names, RFC/ADR ids, commit hashes) stay untranslated.

## Why this workflow exists

Without an explicit trigger, agents interpret "Завершаем эту сессию" as a request for a summary, not as a skill invocation. This workflow ensures `fo-session-retro` runs deterministically on session-end commands.

The clean tree check (step 3) was added after a session left uncommitted changes in both the werkstatt root and a mission workpiece. The agent had performed refactoring and codegen work but was interrupted before committing. The check ensures every session-end verifies that its own changes are committed, while respecting uncommitted changes from other parallel agents.

The archive step (step 2) was added to ensure terminal documents (implemented RFCs, accepted ADRs, completed plans, finished audits, old sessions, closed missions) are moved to their `archive/` subdirectories at session end, keeping the working directories clean for the next session.
