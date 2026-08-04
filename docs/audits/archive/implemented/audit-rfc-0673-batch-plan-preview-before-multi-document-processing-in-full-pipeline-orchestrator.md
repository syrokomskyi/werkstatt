---
rfcId: RFC-0673
auditId: AUDIT-RFC-0673-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0673

## Verdict: Needs revision

The RFC correctly addresses the batch processing opacity gap. The preview table format and the "informational, not a gate" principle are well-designed. Same two minor findings as the other batch RFCs: missing `packages/forge/AGENTS.md` in file system responsibilities, and `versionBump` should be `none`.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. The Design section replaces CLI surface/TypeScript contracts with "Batch plan preview format" and "Batch plan preview directive" — appropriate for a policy RFC. Decision is present tense. Acceptance criteria are checkable.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — correct for `kind: policy`. `related[]` references RFC-0669, RFC-0670, RFC-0671, RFC-0672, correctly traced.

## Axis C — Ecosystem fit

- **`packages/forge/AGENTS.md` not mentioned.** Same finding as RFC-0670/0671/0672: the file system responsibilities table should state whether `packages/forge/AGENTS.md` needs updating.

## Axis D — Forward-only compliance

No issues. The batch plan preview is additive. No compatibility shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. The "informational, not a gate" principle is clearly stated. The RFC does not introduce self-authorizing language. Status gate is clear.

## Axis F — Pragmatism

- **`versionBump: patch` should be `none`.** Prose-only policy RFC — same finding as RFC-0670/0671/0672.

## Axis G — Blind spots

No issues. Preview noise for small batches is addressed (2-document batch gets a concise table). Wrong complexity estimate is acknowledged (informational, not a commitment). Wrong dependency order is addressed (audit step catches forward references).

## Questions for the author

1. Should `packages/forge/AGENTS.md` be listed in the file system responsibilities table?
2. Is `versionBump: none` more appropriate than `patch`?
