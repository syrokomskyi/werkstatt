---
rfcId: RFC-0581
auditId: AUDIT-RFC-0581-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0581

## Verdict: Needs revision

The RFC is structurally sound and well-aligned with RFC-0575, but has a template-residue issue (CLI surface, TypeScript contracts, etc. sections removed but Design subsections need renumbering) and a few missing operational details around the session-end signal vocabulary and interaction with RFC-0480's existing "verify before respond" rule.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Design section structure.** The RFC removed template placeholder subsections (CLI surface, TypeScript contracts, File system responsibilities, Output format) and replaced them with custom subsections (Session-end trigger, Git hygiene check procedure, AGENTS.md rule placement, fo-session-retro SKILL.md modification, Failure modes). This is correct for a policy RFC with no new commands. No issues.
- **Decision** is present tense, single decision. Pass.
- **Alternatives considered** has 5 real alternatives with rejection reasons. Pass.
- **Risks** covers agent non-compliance, skill drift, false sense of safety. Pass.
- **Acceptance criteria** are checkable and sufficient. Pass.

## Axis B — DNA alignment

- `satisfies: []` — correct for a policy RFC. RFC-0575 set the same precedent. No issues.
- `related[]` references (RFC-0575, RFC-0480, RFC-0265, RFC-0476, RFC-0537) are all relevant and real. No issues.

## Axis C — Ecosystem fit

- **No new commands.** `commands.proposed/added/changed/removed` all empty. Correct for a policy RFC. No issues.
- **AGENTS.md updates.** RFC identifies a new `## Session-end discipline (RFC-0581)` section. Placement after `## Commit discipline (RFC-0480)` is correct. No issues.
- **Skill modification.** RFC modifies `fo-session-retro/SKILL.md` (step 1.5). This is a forge-level skill file in `.agents/skills/`. The RFC correctly identifies it as a direct edit, not generated code. No issues.
- **`packagesImpacted: []`** — correct, no packages are impacted. No issues.

## Axis D — Forward-only compliance

- No compatibility shims, no dual paths, no legacy preservation. The rule is additive — it adds a session-end check without removing or weakening existing rules. No issues.

## Axis E — Agent-facing policy

- **Status gate.** No self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Pass.
- **RFC references in implementation notes.** References RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Correct. Pass.
- **Interaction with RFC-0480.** RFC-0480 already states: "Before sending any response to the operator, verify via `git status` that no uncommitted changes from the current session remain. If any exist, commit first." The new RFC-0581 adds a session-end retro with a git check, but the RFC does not clarify how the two rules interact. Does RFC-0480's per-response check make the session-end check redundant? Or does RFC-0581 cover the case where RFC-0480 was not followed? **Finding: the RFC should explicitly state its relationship to RFC-0480's existing "verify before respond" rule — complementary safety net, not replacement.**

## Axis F — Pragmatism

- **Minimal change surface.** One AGENTS.md section + one skill step. No new commands, no validators, no generated files. Lean. No issues.
- **Scope discipline.** `appsImpacted: []`, `packagesImpacted: []`, `nonGoals` are meaningful. No issues.
- **Existing patterns.** The RFC extends the existing `fo-session-retro` skill rather than creating a new one. Correct approach. No issues.

## Axis G — Blind spots

- **Signal vocabulary completeness.** The RFC lists English and Russian phrases but does not mention German (the operator's locale includes `de`). The operator may use German phrases like "das war's", "wir sind fertig". **Finding: add German signal phrases to the trigger vocabulary, or state that the list is illustrative and not exhaustive.**
- **Concurrent sessions.** The RFC does not address the case where two agent sessions are running simultaneously and one signals session-end. The git hygiene check would find changes from both sessions. **Finding: add a note that the check reports all uncommitted changes, and the operator decides which to commit — same as RFC-0575's foreign-changes handling.**
- **Performance.** Two `git status --short` calls. Negligible. No issues.

## Questions for the author

1. How does RFC-0581 interact with RFC-0480's existing "verify via `git status` before responding" rule? Is RFC-0581 a complementary safety net for when RFC-0480 was not followed, or does it replace that rule?
2. Should the session-end signal vocabulary include German phrases, or should the RFC state that the list is illustrative and agents should recognize any clear session-closing signal regardless of language?
3. What happens when two concurrent sessions are active and one signals session-end — does the retro check find changes from both sessions, and how does the agent distinguish its own changes from the other session's?
