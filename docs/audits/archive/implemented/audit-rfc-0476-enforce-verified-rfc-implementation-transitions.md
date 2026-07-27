---
rfcId: RFC-0476
auditId: AUDIT-RFC-0476-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: Cascade
verdict: needs-revision
---

# Audit: RFC-0476

## Verdict: Needs revision

The RFC correctly identifies the distinction between a safe mutation path and independent merge-time validation. However, it changes the RFC-0224 transition procedure without declaring an amendment, and it overstates what repository source can enforce about GitHub branch protection. The implementation contract also needs an explicit concurrency and working-tree boundary before it can be implemented safely.

## Mechanical validation (`rfc.validate`)

Pass — `rfc.validate RFC-0476 --json` reports no violations.

## Axis A — Structural completeness

- **A-1 — Needs revision:** `## Failure modes` specifies non-zero results, but does not state the pretty-output diagnostic contract or distinguish command-level violation classes. The implementation must expose stable, actionable failures for rejected status, unchecked criteria, missing evidence, invalid commit, and dirty/mutating working-tree conditions.
- **A-2 — Needs revision:** The output contract reports only `RfcValidationViolation[]`, although an invalid supplied commit and write-race conditions are not RFC validation violations. Define a command-specific diagnostic shape or explicitly map these failures to a stable rule vocabulary.

## Axis B — DNA alignment

No issue. The RFC is a policy RFC and does not claim to establish or modify a DNA invariant.

## Axis C — Ecosystem fit

- **C-1 — Needs revision:** The RFC changes RFC-0224's permitted transition procedure from manual status stamping to an exclusive command, but has no `amends: [RFC-0224]` declaration. Add the amendment relation and the reciprocal `RFC-0224.amendedBy` update when the RFC is accepted.
- **C-2 — Needs revision:** The workflow already runs full RFC validation. Repository branch protection is external GitHub configuration, not an artifact that `.github/workflows/ci.yml` can enforce. Specify an operator-verifiable repository rule, the stable required check name, and how its state is documented or verified.
- **C-3 — Needs revision:** The affected instruction surface is broader than `docs/policies/rfc-governance.md` and the implementation skill. The root agent guide and any generated/synchronized skill source need an authoritative update path.

## Axis D — Forward-only compliance

No issue. The RFC does not propose a compatibility path or parallel runtime behavior.

## Axis E — Agent-facing policy

- **E-1 — Needs revision:** The phrase “exclusive agent-operated path” must be reconciled with the current policy that architecture humans may also perform the transition. State whether human manual transitions remain allowed and, if so, whether CI is the sole enforcement for those edits.
- **E-2 — Needs revision:** The RFC requires a separate implementation commit, but does not define whether the stamp command rejects a dirty working tree, verifies that the implementation commit references the target RFC, or permits unrelated commits between implementation and stamping.

## Axis F — Pragmatism

- **F-1 — Needs revision:** A dedicated command is justified only if it owns atomic mutation, evidence, and commit provenance. The RFC must explicitly reject implementing this as a `rfc.validate --stamp` flag because validation must remain side-effect free and fast.

## Axis G — Blind spots

- **G-1 — Needs revision:** Two agents can stamp the same RFC concurrently. Define a lock or compare-and-write strategy, plus no-write-on-conflict behavior.
- **G-2 — Needs revision:** The proposal emits or requires an evidence artifact before the state mutation. Define whether an already-existing artifact is overwritten and how failure avoids leaving a new artifact behind when the frontmatter mutation cannot complete.

## Questions for the author

1. Does `rfc.implement.stamp` govern only agents, or must architecture humans also use it for `accepted → implemented` transitions?
2. Which branch-protection mechanism and stable check name will be made mandatory, and where is that external repository setting recorded or verified?
3. What exact working-tree, commit-reference, and concurrency conditions must hold before the command mutates an RFC?
