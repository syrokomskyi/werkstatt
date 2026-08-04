---
rfcId: RFC-0672
auditId: AUDIT-RFC-0672-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0672

## Verdict: Needs revision

The RFC correctly addresses the gap in structured error state for unfixable pipeline failures. The 2-attempt threshold and error checkpoint format are well-designed. However, three findings: (1) `packages/forge/AGENTS.md` not mentioned in file system responsibilities, (2) `versionBump` should be `none`, (3) the "stop the pipeline" directive conflicts with the orchestrator's "no pauses" constraint and needs explicit exception justification.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. The Design section replaces CLI surface/TypeScript contracts with "Error checkpoint format" and "Error checkpoint directive" — appropriate for a policy RFC. Decision is present tense. Acceptance criteria are checkable.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — correct for `kind: policy`. `related[]` references RFC-0669, RFC-0670, RFC-0671, correctly traced.

## Axis C — Ecosystem fit

- **`packages/forge/AGENTS.md` not mentioned.** Same finding as RFC-0670/0671: the file system responsibilities table should state whether `packages/forge/AGENTS.md` needs updating.

## Axis D — Forward-only compliance

No issues. The error checkpoint is additive. No compatibility shims, no dual-paths.

## Axis E — Agent-facing policy

- **"Stop the pipeline" conflicts with "no pauses" directive.** The orchestrator skill explicitly states: "No pauses between pipeline steps. The operator's invocation is the instruction to run the entire pipeline. Proceed automatically." The error checkpoint directive says "Stop the pipeline — do not continue to the next pipeline step" and "ask the operator how to proceed." This is a pause for operator input — a direct conflict with the "no pauses" constraint. The RFC should explicitly state that the error checkpoint is an **exception** to the "no pauses" rule, justified by the impossibility of continuing (unfixable error after 2 attempts). Without this, the two directives conflict and the agent may behave inconsistently.

## Axis F — Pragmatism

- **`versionBump: patch` should be `none`.** Prose-only policy RFC — same finding as RFC-0670/0671.

## Axis G — Blind spots

No issues. Stale checkpoint on resume is addressed (verify `partialState.rfcStatus` against current RFC frontmatter). Error checkpoint noise in batch is addressed (each checkpoint is a distinct failure).

## Questions for the author

1. Should `packages/forge/AGENTS.md` be listed in the file system responsibilities table?
2. Is `versionBump: none` more appropriate than `patch`?
3. How should the error checkpoint directive reconcile with the orchestrator's "no pauses" constraint? Should the RFC explicitly declare an exception?
