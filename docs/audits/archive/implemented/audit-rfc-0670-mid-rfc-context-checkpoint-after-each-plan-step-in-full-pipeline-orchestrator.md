---
rfcId: RFC-0670
auditId: AUDIT-RFC-0670-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0670

## Verdict: Needs revision

The RFC correctly extends RFC-0669's inter-RFC checkpoint to intra-RFC step-level checkpoints. The design is sound and the >=5 steps threshold is well-justified. However, the file system responsibilities table omits `packages/forge/AGENTS.md` (same finding as RFC-0669's audit), and `versionBump` should be `none` for a prose-only policy RFC.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. The Design section replaces CLI surface/TypeScript contracts with "Skill text changes" and "Step-checkpoint block format" — appropriate for a policy RFC. Decision is present tense. Acceptance criteria are checkable. Implementation notes are explicit.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — correct for `kind: policy`. `related[]` references RFC-0669, correctly traced.

## Axis C — Ecosystem fit

- **`packages/forge/AGENTS.md` not mentioned.** The file system responsibilities table lists 4 files but does not mention `packages/forge/AGENTS.md`. Same finding as RFC-0669's audit: the AGENTS.md documents skill infrastructure, not individual skill behavior — so no update is needed. But the RFC should state this explicitly.

## Axis D — Forward-only compliance

No issues. The step checkpoint is additive — it does not replace or weaken existing directives. No compatibility shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is clear. Implementation notes reference RFC-0224, RFC-0334. No self-authorizing language.

## Axis F — Pragmatism

- **`versionBump: patch` should be `none`.** This RFC is prose-only — it changes skill text (`.md` files), not code, commands, or contracts. The template says `none (prose-only)` for this case. `patch` over-reports the SemVer impact.

## Axis G — Blind spots

No issues. Edge cases documented: <5 steps (no checkpoint), wrong step number (fallback), no checkpoint markers (fallback to git log).

## Questions for the author

1. Should `packages/forge/AGENTS.md` be listed in the file system responsibilities table with a "no change needed" note, as RFC-0669 was enhanced to do?
2. Is `versionBump: none` more appropriate than `patch` for a skill-text-only policy RFC?
