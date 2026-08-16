---
rfcId: RFC-0866
auditId: AUDIT-RFC-0866-01
date: 2026-08-15
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0866

## Verdict: Needs revision

The RFC correctly identifies the two main gaps (no gate decision production, no deploy execution after authorization) and proposes a sound architecture. However, Problem point #3 references a constant (`PIPELINE_STATE_ORDER`) that does not exist in the codebase — it was already removed by RFC-0865. Two acceptance criteria reference this non-existent constant. A Compass sync obligation and a module flag declaration inconsistency are also missing.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Factual error in Problem section, point #3:** The RFC claims `PIPELINE_STATE_ORDER` at `packages/werkstatt/src/leitstand/leitstand-commands.ts:1293-1300` still contains `dev-deployed`, `alt-deployed`, `main-deployed`, `promoted`. This constant does NOT exist in the codebase. `grep` for `PIPELINE_STATE_ORDER` in `packages/werkstatt/src/leitstand/` returns zero results. The `determineNextStep` function (line 1280-1288) only handles `prepared` → `release.ready` → `leitstand.dev-deploy`. RFC-0865 already removed the legacy states. Problem point #3 is based on a false premise and should be reworded to address the real issue: `leitstand.pipeline.check` (line 1290-1328) hardcodes `releaseState: "ready"` and all steps as `pending` without reading effect records.

- **Acceptance criterion inaccurate:** The criterion "PIPELINE_STATE_ORDER legacy states (dev-deployed, alt-deployed, main-deployed, promoted) replaced with effect-record-based state" references a constant that doesn't exist. This criterion should be reworded to: "`leitstand.pipeline.check` reads real deployment state from effect records instead of hardcoding `releaseState: 'ready'` and all steps as `pending`".

## Axis B — DNA alignment

No issues. DNA-49, DNA-73, DNA-59 are real invariants in `docs/architecture-dna.md`. The RFC body explains how each is enforced: DNA-49 via restored wrangler deploys, DNA-73 via dev → alt → main sequencing, DNA-59 via evidence sync to R2. `related[]` includes RFC-0865 which is the direct predecessor.

## Axis C — Ecosystem fit

- **Compass sync not mentioned:** The RFC changes deployment command behavior (restoring deploy execution), which affects `docs/verification-plan.xml` and `docs/development-plan.xml`. The RFC does not mention synchronizing these Compass documents. RFC-0865's acceptance criteria explicitly included "docs/verification-plan.xml and docs/development-plan.xml synchronized" — this RFC should do the same.

- **Module flag declarations incomplete:** `leitstand.propagate` and `leitstand.promote` command registrations in `leitstand.module.ts` (lines 71-125) do not declare `--gate-decision` and `--main-verification-decision` as flags, even though the handlers require them (throwing if absent). `leitstand.dev-deploy` (line 41-55) does declare `gate-decision`. The RFC should note this inconsistency and include fixing the module flag declarations as part of the command restoration. Without declared flags, `--gate-decision` may not pass through the kernel's flag parsing layer correctly.

## Axis D — Forward-only compliance

No issues. The RFC explicitly rejects copying old code, proposes no compatibility shims, and restores execution within the certification-gated flow. Legacy `PIPELINE_STATE_ORDER` states are already deleted — no dual-path.

## Axis E — Agent-facing policy

No issues. The RFC is in `draft` status and contains no self-authorizing language. Implementation notes are explicit behavioral rules. No `NEEDS CLARIFICATION` markers found.

## Axis F — Pragmatism

No issues. `leitstand.certify` earns its existence as the only way to produce `GateDecisionV1`. TypeScript contracts are minimal. Existing orchestration primitives are reused. `packagesImpacted` lists only `@warpgogol/werkstatt`. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

No issues. Performance (13-phase pipeline complexity) is acknowledged in Risks. R2 credential dependency is documented. Edge cases (freshness failure, purge failure, mission.check timeout) are covered in Failure modes. Migration path ("All sites adopt automatically — no flag day") is documented.

## Questions for the author

1. Problem point #3 references `PIPELINE_STATE_ORDER` at line 1293-1300 — this constant does not exist. What is the actual issue you want to address: the hardcoded `releaseState: "ready"` in `leitstand.pipeline.check`, or something else?
2. Should `leitstand.certify` write the `GateDecisionV1` to a conventional path (e.g. `releases/{releaseId}/gate-decision-{gate}.json`) instead of requiring `--output`? The current design puts the burden on the operator to choose a path and remember it for the subsequent deploy command.
3. The `leitstand.propagate` and `leitstand.promote` module registrations don't declare `--gate-decision` / `--main-verification-decision` as flags — should this RFC fix the module declarations as part of the command restoration?
