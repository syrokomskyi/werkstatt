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

## Skill invocation tracking (NON-NEGOTIABLE)

When the operator invokes a fo-skill (e.g. `fo-idea-i-just-want-to-see-the-result`, `fo-idea-implement`, `fo-fix`, `fo-review`) in the first message of a session, the agent MUST follow that skill's full pipeline to completion. Do NOT fall back to a manual step-by-step plan. The skill's pipeline (audit → enhance → plan → implement → review → fix) exists for a reason — skipping phases produces lower-quality results.

- If `fo-idea-i-just-want-to-see-the-result` is invoked, run the FULL pipeline: idea → audit → enhance → plan → implement → review → fix.
- If `fo-idea-implement` is invoked, follow its steps 3.1–3.8 literally, including `fo-doc-audit` delegation.
- The operator's invocation IS the instruction to run the entire pipeline autonomously. No pauses between steps asking "shall I proceed?".

## RFC implementation completion rules

When finishing an RFC implementation, the agent MUST follow `fo-idea-implement` steps 3.6–3.8 literally:

1. **Check every acceptance criterion semantically** — not just existence, but observable behavior. Add inline `(evidence: <file:line>, <test-or-command>)` to each `[x]` (V-27). Run the relevant validators to prove it.
2. **No unchecked criteria at `implemented`** — if a criterion cannot be met, do NOT stamp `implemented`; split the deferred work into a follow-up RFC via `rfc.supersede.propose` (V-26).
3. **Use `rfc.implement.stamp`** — direct edits to `status`, `implementedAt`, and `updatedAt` are prohibited (RFC-0476). Run `rfc.implement.stamp --id RFC-XXXX --implementation-commit <sha> --dry-run` first, then without `--dry-run`.
4. **Commit the stamped RFC separately** — the implementation commit and the stamp commit MUST be separate.
5. **Run `fo-doc-audit`** after stamping to sync documentation surfaces.
6. **Never work around `RFC-IMP-04` (dirty working tree).** If `rfc.implement.stamp` fails because the working tree is dirty, do NOT `git stash`, `git add -A`, or otherwise force the stamp. Report the uncommitted changes to the operator and stop. The operator is responsible for resolving foreign uncommitted changes.

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

## Session-end protocol (NON-NEGOTIABLE)

When the operator says "Завершаем эту сессию" (or any variant: "Завершаем сессию", "Заканчиваем сессию", "End session", "Wrap up"), the agent MUST invoke the `fo-session-retro` skill via the `skill` tool BEFORE producing any closing summary. The retro skill IS the session-end protocol — do not substitute it with a manual summary. See `.windsurf/workflows/session-end.md` for the full workflow.
