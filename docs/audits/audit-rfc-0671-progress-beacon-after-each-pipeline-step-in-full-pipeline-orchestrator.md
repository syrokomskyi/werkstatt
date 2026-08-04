---
rfcId: RFC-0671
auditId: AUDIT-RFC-0671-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0671

## Verdict: Needs revision

The RFC correctly complements RFC-0669/0670 with a lightweight visibility signal. The one-line beacon format is well-designed and the `aiLanguage` requirement is correct. Same two minor findings as RFC-0670: missing `packages/forge/AGENTS.md` in file system responsibilities, and `versionBump` should be `none`.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. The Design section replaces CLI surface/TypeScript contracts with "Beacon format" and "Beacon directive" — appropriate for a policy RFC. Decision is present tense. Acceptance criteria are checkable.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — correct for `kind: policy`. `related[]` references RFC-0669 and RFC-0670, correctly traced.

## Axis C — Ecosystem fit

- **`packages/forge/AGENTS.md` not mentioned.** Same finding as RFC-0670: the file system responsibilities table should state whether `packages/forge/AGENTS.md` needs updating (it does not — it documents skill infrastructure, not individual skill behavior).

## Axis D — Forward-only compliance

No issues. The beacon is additive. No compatibility shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is clear. `aiLanguage` requirement is explicitly stated. No self-authorizing language.

## Axis F — Pragmatism

- **`versionBump: patch` should be `none`.** Prose-only policy RFC — same finding as RFC-0670.

## Axis G — Blind spots

No issues. Beacon noise in batch processing is addressed (30 beacons for 5 RFCs × 6 steps — acceptable). Fix cycle beacons are addressed (`✗ (fixing...)` then `✓`).

## Questions for the author

1. Should `packages/forge/AGENTS.md` be listed in the file system responsibilities table with a "no change needed" note?
2. Is `versionBump: none` more appropriate than `patch` for a skill-text-only policy RFC?
