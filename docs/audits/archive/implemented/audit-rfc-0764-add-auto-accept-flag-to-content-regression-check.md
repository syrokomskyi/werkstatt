---
rfcId: RFC-0764
auditId: AUDIT-RFC-0764-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0764

## Verdict: Needs revision

The RFC has significant blind spots: it doesn't acknowledge RFC-0748 (which already implemented `--auto-accept` on `content.regression.review.generate`), doesn't address the `mission.close` CREG-05 enforcement interaction, and proposes making a read-only pipeline step mutate the golden baseline without calling out the architectural shift. File paths and `commands.changed` / `packagesImpacted` lists are inaccurate.

## Mechanical validation (rfc.validate)

Pass with 2 warnings (V-19): `RFC-0764.amends` includes RFC-0732 and RFC-0734, but their `amendedBy` fields don't include RFC-0764. This is expected — the amended RFCs are archived (implemented status) and won't be updated. The warnings are non-blocking.

## Axis A — Structural completeness

- **A-1: Incorrect file path.** The RFC references `packages/os/site-kernel-checks/src/content-regression/content-regression-check.ts` (line 110). The actual file is `packages/os/site-kernel-checks/src/content-regression.ts` — a single file containing all content regression logic (`runContentRegressionCheck`, `runContentRegressionReviewGenerate`, `runContentRegressionApply`). Both RFC-0732 and RFC-0734 correctly reference `content-regression.ts`.

- **A-2: `commands.changed` is incomplete.** The RFC lists only `content.regression.check` (line 29). But the RFC also proposes adding `--auto-accept-regression` to `mission.validate` (line 68, 85, 111, 157). `mission.validate` should be listed in `commands.changed`.

- **A-3: `packagesImpacted` is incomplete.** The RFC lists only `@warpgogol/site-kernel-checks` (line 33). But the file system responsibilities table (line 111) also touches `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`. `@warpgogol/site-kernel-handoff` should be listed.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `command` kind RFC. `related: [DNA-61, DNA-63]` is relevant — the RFC interacts with both invariants. The architectural fit section (lines 70-74) correctly explains the relationship: the gate still fires, the flag is an explicit operator decision, and the review manifest is still generated.

## Axis C — Ecosystem fit

- **C-1: RFC-0748 not acknowledged.** RFC-0748 (implemented, archived) already added `--auto-accept` to `content.regression.review.generate` — reducing the 4-step cycle to 2 steps (`review.generate --auto-accept` + `apply`). RFC-0764 proposes a 1-step flow (`check --auto-accept`) but doesn't mention RFC-0748 anywhere. The RFC should acknowledge RFC-0748 and justify why the 2-step flow is still insufficient. The `amends` list should include RFC-0748, or the alternatives section should explain why extending RFC-0748's approach is not enough.

- **C-2: Pipeline step mutates golden baseline.** `content.regression.check` is currently a read-only validator in `SITES_BUILD_CHECK_PIPELINE`. The RFC proposes making it write to the golden baseline in the cache clone when `--auto-accept` is passed. This is a significant change in the command's nature — from read-only gate to mutating command. The RFC should explicitly call out this architectural shift and explain why it's acceptable for a pipeline step to mutate the golden baseline, when currently only operator-invoked commands (`snapshot.update`, `apply`) and `mission.close` write to it.

## Axis D — Forward-only compliance

No issues. The flag is purely additive. Default behavior is unchanged. No backward compatibility layer or dual-path.

## Axis E — Agent-facing policy

- **E-1: Production release guard is undefined.** The `nonGoals` state "Does not auto-accept regression for production releases (Leitstand guard remains)" (line 39). But the RFC doesn't describe any mechanism that prevents `--auto-accept-regression` from being used during production releases. The `mission.validate` flag would be available for any mission, including those targeting production channels. There is no described guard in the Leitstand pipeline (`leitstand.propagate`, `leitstand.promote`) that would reject a release validated with `--auto-accept-regression`. The RFC should either describe the guard mechanism or remove this nonGoal.

## Axis F — Pragmatism

- **F-1: Marginal benefit over RFC-0748.** RFC-0748 already provides a 2-step auto-accept flow: `review.generate --auto-accept` + `apply`. RFC-0764 proposes a 1-step flow: `check --auto-accept`. The marginal benefit is one command invocation (`content.regression.apply`) and avoiding the `review.yaml` → `apply` handoff. The cost is making a pipeline step mutate the golden baseline (C-2) and the CREG-05 interaction complexity (G-1). The RFC should justify why this tradeoff is worth it — the 2-step flow from RFC-0748 already eliminated the manual YAML editing, which was the original pain point.

## Axis G — Blind spots

- **G-1: `mission.close` CREG-05 interaction.** RFC-0734 added CREG-05 enforcement to `mission.close`: if drift exists and no `apply-result.json` exists, `mission.close` blocks. If `content.regression.check --auto-accept` updates the golden baseline directly (without going through `content.regression.apply`), then `apply-result.json` won't exist. The RFC doesn't describe how `mission.close` will know that drift was auto-accepted and should not block. Options: (a) `check --auto-accept` writes an `apply-result.json` equivalent, (b) `mission.close` checks for a review manifest with all-accept decisions, (c) some other signal. The RFC must address this.

- **G-2: Standalone vs. pipeline mode.** The review manifest path `missions/{mission}/evidence/content-regression/review.yaml` (line 112) requires mission context. When `content.regression.check --auto-accept` is run standalone (not via `mission.validate`), there is no mission context to resolve the path. The RFC should address standalone mode — does `--auto-accept` work standalone? If so, where does the review manifest go?

- **G-3: CREG-06 not in diagnostic rules table.** The RFC introduces CREG-06 (auto-accept write error, line 131) but doesn't list it in a diagnostic rules table. The existing CREG-01 through CREG-05 are registered in `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`. The RFC should include CREG-06 in a diagnostic rules table with severity and description, and list `core-infra.ts` in the file system responsibilities.

## Questions for the author

1. Why is the 2-step flow from RFC-0748 (`review.generate --auto-accept` + `apply`) insufficient? What specific scenario requires the 1-step flow proposed here?
2. How does `mission.close` distinguish between "drift was auto-accepted via `check --auto-accept`" and "drift exists but was never reviewed" (CREG-05)? What artifact does `check --auto-accept` write to satisfy the CREG-05 gate?
3. What prevents an operator from using `--auto-accept-regression` on a production release mission? Is there a Leitstand-level guard, or is this a discipline-only constraint?
