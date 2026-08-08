---
aiLanguage: ru
documentationLanguage: en
saveSessions: true
register: business
formOfAddress: ty
---

# Operator Preferences

- `aiLanguage`: Russian — AI uses Russian for **all** communication with the operator: questions, responses, summaries, reports, status updates, and any other chat output.
- `documentationLanguage`: English — generated RFCs, ADRs, READMEs, and other project documentation use English.
- `saveSessions`: true — agent saves session transcripts at end of each session (RFC-0537). Set to `false` to opt out.
- `register`: business — communication register (business | creative). Business = core behavioral layer only, professional and efficient. Creative = core + extended behavioral layer (RFC-0549) with creative partnership and emotional support.
- `formOfAddress`: ty — обращение на «ты» (неформальное). AI использует «ты» во всех обращениях к оператору.

## Session-end protocol (NON-NEGOTIABLE — BLOCKED GATE — READ THIS FIRST)

**This is the highest-priority rule in PREFERENCES.md. If the operator says any session-end phrase, you MUST invoke `fo-session-retro` before producing any other output. No exceptions.**

When the operator says "Завершаем эту сессию" (or any variant: "Завершаем сессию", "Заканчиваем сессию", "Завершить сессию", "End session", "Wrap up", "Session end"), the agent's response is **BLOCKED** — no closing summary, no "сессия завершена", no ad-hoc output is permitted until the full protocol below completes.

**The agent MUST NOT produce any session-end output (summary, closing block, "сессия завершена" message) before this protocol is fully executed. Producing a closing summary without running this protocol is a CONTRACT VIOLATION.**

### Protocol steps (execute in order, no skipping)

1. **Verify clean working tree** — check `rtk git status` in werkstatt root and all active mission workpieces. Commit any uncommitted changes made during this session (distinguish from changes by other parallel agents by reviewing conversation history). Report remaining dirty files to the operator without touching them. See `fo-session-retro` skill § Pre-retro steps for the full procedure.
2. **Verify RFC implementation status** — if any RFC was worked on during this session, verify each is stamped as `implemented` OR obtain explicit operator acknowledgment to leave it in a non-terminal status. See `fo-session-retro` skill § Step 4 for the full procedure.
3. **Invoke `fo-session-retro`** via the `skill` tool — this is the core session-end step. The retro skill runs the full protocol: transcript save, temp cleanup, docs.archive, clean tree check, RFC verification, insight triage, and closing block. Do NOT substitute it with a manual summary. Do NOT produce a closing block yourself — the retro skill produces it.
4. **The closing block comes from `fo-session-retro`** — after the retro skill completes, its report IS the session-end output. Do not add a separate "сессия завершена" message after it.

### Self-check before any session-end output

Before sending ANY message that could be interpreted as a session closing (summary, "сессия завершена", closing block), verify:

- [ ] `fo-session-retro` was invoked via the `skill` tool in this response cycle
- [ ] The retro skill's report was produced and presented to the operator
- [ ] No ad-hoc closing summary was produced before the retro skill ran

If ANY item is unchecked, STOP and invoke `fo-session-retro` now.

## Skill invocation tracking (NON-NEGOTIABLE)

When the operator invokes a fo-skill (e.g. `fo-idea-i-just-want-to-see-the-result`, `fo-idea-implement`, `fo-fix`, `fo-review`) in the first message of a session, the agent MUST follow that skill's full pipeline to completion. Do NOT fall back to a manual step-by-step plan. The skill's pipeline (audit → enhance → plan → implement → review → fix) exists for a reason — skipping phases produces lower-quality results.

- If `fo-idea-i-just-want-to-see-the-result` is invoked, run the FULL pipeline: idea → audit → enhance → plan → implement → review → fix.
- If `fo-idea-implement` is invoked, follow its steps 3.1–3.8 literally, including `fo-doc-audit` delegation.
- The operator's invocation IS the instruction to run the entire pipeline autonomously. No pauses between steps asking "shall I proceed?".

## RFC implementation completion rules

When finishing an RFC implementation, the agent MUST follow `fo-idea-implement` steps 3.6–3.8 literally:

1. **Check every acceptance criterion semantically** — not just existence, but observable behavior. Add inline `(evidence: <file:line>, <test-or-command>)` to each `[x]` (V-27). Run the relevant validators to prove it.
2. **No unchecked criteria at `implemented`** — if a criterion cannot be met, do NOT stamp `implemented`; split the deferred work into a follow-up RFC via `rfc.supersede.propose` (V-26).
3. **Use `rfc.implement.stamp`** — direct edits to `status`, `implementedAt`, and `updatedAt` are prohibited (RFC-0476). Run `rfc.implement.stamp --id RFC-XXXX` (auto-detects the implementation commit when omitted, RFC-0756; pass `--implementation-commit <sha>` to override) `--dry-run` first, then without `--dry-run`.
4. **Commit the stamped RFC separately** — the implementation commit and the stamp commit MUST be separate.
5. **Run `fo-doc-audit`** after stamping to sync documentation surfaces.
6. **Never work around `RFC-IMP-04` (dirty RFC file).** If `rfc.implement.stamp` fails because the RFC file itself has uncommitted changes, commit the RFC file first, then retry. Do NOT `git stash`, `git add -A`, or otherwise force the stamp. Uncommitted changes in unrelated files (from other agents) are ignored by the check and do not block stamping.

## MANDATORY pre-response checklist for RFC implementation (NON-NEGOTIABLE)

Before sending ANY response that claims an RFC is "complete", "done", or "implemented", the agent MUST verify ALL of the following. If ANY item is unchecked, the response is BLOCKED — complete it first, then respond.

- [ ] **Every acceptance criterion in the RFC file is marked `[x]`** with an inline `(evidence: ...)` annotation (V-27). No `[ ]` remains.
- [ ] **RFC status is `implemented`** (not `accepted`, not `draft`). Changed via `rfc.implement.stamp` command, NOT by hand-editing the frontmatter.
- [ ] `implementedAt` is set to today's date.
- [ ] `rfc.validate` passes on the RFC file with zero RFC-specific errors.
- [ ] All affected packages pass `build:check` (typecheck).
- [ ] All new/changed tests pass.
- [ ] `migrator.registry.validate` passes (if the RFC registered a migrator).
- [ ] Implementation commit and RFC stamp commit are SEPARATE commits.
- [ ] `git status` is clean (no uncommitted changes from this session).

If the agent cannot check ALL items, it MUST NOT claim the RFC is complete. Instead, it MUST list the remaining items explicitly and ask the operator for guidance.

## Plan confirmation vs implementation command (NON-NEGOTIABLE)

Confirming a plan or design during grilling/discussion means the operator agrees with the approach — it is NOT a command to start implementation. The agent MUST wait for an explicit implementation command ("реализуй", "начинай", "implement", "go ahead") before writing any code beyond the RFC/ADR document itself.

- **RFC creation** → agent creates the RFC file in `draft` status. No code changes.
- **Plan confirmation** → agent stops. No status change, no implementation, no todo list items moved to `in_progress`.
- **RFC status changes (draft → accepted)** — this is the operator's decision. The agent MUST NOT change RFC status from `draft` to `accepted` without an explicit command.
- **Implementation command** → only now does the agent begin coding, register commands, write tests, etc.

If the agent is unsure whether the operator's message is a confirmation or a command to implement, the agent MUST ask for clarification before proceeding.

## Context routing discipline

When routing insights during `fo-session-retro`, the Context category must only capture knowledge that is useful for future agents working on the project. Transient observations — such as "previous session left uncommitted changes" — are NOT useful context. They describe a one-time state that has been resolved and will not help the next agent. When in doubt, drop the insight rather than cluttering the memory layer.
