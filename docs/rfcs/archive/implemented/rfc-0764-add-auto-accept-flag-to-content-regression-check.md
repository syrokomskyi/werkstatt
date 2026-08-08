---
id: RFC-0764
title: "Add --auto-accept flag to content.regression.check for expected content drift"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0732
  - RFC-0734
  - RFC-0748
amendedBy: []
related:
  - DNA-61
  - DNA-63
  - RFC-0748
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - content.regression.check
    - mission.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "Missions with expected content drift can pass validation without manual review-apply cycle"
  - "Operator can pass --auto-accept to mission.validate to skip regression review"
nonGoals:
  - "Does not remove the manual review-apply workflow (default behavior unchanged)"
  - "Does not add a technical guard against production use — consistent with --skip-content-regression, the Leitstand pipeline does not pass the flag; production use is discipline-only"
  - "Does not change content.regression.review.generate or content.regression.apply"
---

# RFC-0764: Add --auto-accept flag to content.regression.check for expected content drift

## Context

`content.regression.check` (DNA-61, RFC-0732) compares resolved page content against a golden baseline. When drift is detected, `mission.validate` fails with CREG-01 errors. The operator must then:

1. Run `content.regression.review.generate` to produce a review manifest
2. Fill in decisions (`accept`/`reject`/`fix`) for each change
3. Run `content.regression.apply` to update the golden baseline (or revert content)
4. Re-run `mission.validate`

This is a 4-step manual cycle. For missions where content changes are **expected and intentional** (e.g., geographic scope expansion, tariff description corrections, legal text updates), every change will be `accept`. The manual review-apply cycle adds ~5 minutes of operator time and one full `mission.validate` re-run (~2 minutes cached) for no decision-making value.

This was observed during mission `warpgogol-com-m000039`: 8 content changes (all expected) required the full review-apply-revalidate cycle despite the operator confirming all changes were intentional.

### Relationship to RFC-0748

RFC-0748 (implemented) already added `--auto-accept` to `content.regression.review.generate`, reducing the 4-step cycle to 2 steps: `review.generate --auto-accept` + `apply`. However, both steps are **operator-invoked commands outside the `mission.validate` pipeline**. The operator must still:

1. Run `mission.validate` → fails with CREG-01
2. Run `content.regression.review.generate --site <id> --auto-accept`
3. Run `content.regression.apply --site <id> --review <path>`
4. Re-run `mission.validate`

RFC-0764 eliminates steps 2–4 by integrating auto-accept directly into the `build.check` pipeline step (`content.regression.check`). With `mission.validate --auto-accept-regression`, the entire flow is a single invocation — no manual intervention between pipeline steps.

## Problem

DNA-63 (Content regression review discipline) requires explicit operator review before the golden baseline is updated. This is correct for **unexpected** drift — the operator should verify that content changed intentionally. But for **expected** drift (the mission's purpose is to change content), the manual cycle is pure overhead.

The current design has no fast path for "I know all these changes are correct."

## Decision

Add an `--auto-accept` flag to `content.regression.check`. When passed, the command auto-accepts all detected drift, updates the golden baseline directly, and passes (exit code 0). The flag is opt-in — default behavior (fail on drift, require manual review) is unchanged.

`mission.validate` gains a `--auto-accept-regression` flag that propagates to `content.regression.check` within the `build.check` pipeline.

### Architectural shift: pipeline step mutates golden baseline

`content.regression.check` is currently a read-only validator in `SITES_BUILD_CHECK_PIPELINE`. With `--auto-accept`, it becomes a **mutating pipeline step** — it writes to the golden baseline in the cache clone when drift is detected and the flag is set. This is a deliberate architectural shift:

- **Without `--auto-accept`**: `content.regression.check` remains read-only (fail on drift). No behavior change.
- **With `--auto-accept`**: the step writes the updated golden snapshot and an `apply-result.json` marker to the mission evidence directory.

This is acceptable because: (1) the mutation is opt-in via an explicit flag, (2) the audit trail (review manifest + apply-result) is preserved, (3) `mission.close` already writes to the golden baseline as a pipeline-adjacent step, and (4) the alternative (a separate post-pipeline command) would reintroduce the manual intervention this RFC eliminates.

## Architectural fit

- **DNA-61 (Resolved content regression gate)**: The gate still fires — drift is still detected. The flag controls the **response** to drift (auto-accept vs. fail), not the detection.
- **DNA-63 (Content regression review discipline)**: The `--auto-accept` flag is an explicit operator decision to accept all drift. It does not bypass review — it **is** the review decision, applied in bulk. The review manifest is still generated as an audit trail artifact.
- **Site OS operator model**: `content.regression.check` is an app-scoped command in `packages/os/site-kernel-checks`. The flag is passed through the pipeline runner.

## Design

### CLI surface

```sh
# Standalone:
pnpm exec site-kernel run content.regression.check --site warpgogol-com --auto-accept

# Via mission.validate:
pnpm exec site-kernel run mission.validate --mission <id> --auto-accept-regression
```

### TypeScript contracts

```ts
// content.regression.check input
interface ContentRegressionCheckInput {
  site: string;
  autoAccept?: boolean; // RFC-0764: when true, auto-accept all drift
}

// content.regression.check result
interface ContentRegressionCheckResult {
  errors: number;
  warnings: number;
  autoAccepted: number; // RFC-0764: count of auto-accepted changes
  reviewManifestPath: string | null; // RFC-0764: audit trail (generated even on auto-accept)
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/content-regression.ts` | Add `--auto-accept` flag handling to `runContentRegressionCheck` |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | Register CREG-06 diagnostic rule |
| `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` | Add `--auto-accept` flag to command registration |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add `--auto-accept-regression` flag, propagate to pipeline |
| `missions/{mission}/evidence/content-regression/review.yaml` | Audit trail: generated with all decisions set to `accept` |
| `missions/{mission}/evidence/content-regression/apply-result.json` | Written by `--auto-accept` to satisfy `mission.close` CREG-05 check |

### Output format

```json
{
  "command": "content.regression.check",
  "status": "pass",
  "errors": 0,
  "warnings": 0,
  "autoAccepted": 8,
  "reviewManifestPath": "missions/warpgogol-com-m000039/evidence/content-regression/review.yaml"
}
```

### Diagnostic rules (new)

| Rule | Severity | Description |
| --- | --- | --- |
| CREG-06 | error | Auto-accept write error — golden baseline update failed during `--auto-accept` |

### Failure modes

- **`--auto-accept` without drift**: No-op. Passes with `autoAccepted: 0`. No files written.
- **`--auto-accept` with drift**: Golden baseline updated in cache clone. Review manifest generated with all decisions set to `accept`. `apply-result.json` written with `pending: 0`, `accepted: N`, `goldenUpdated: true`. Passes with `autoAccepted: N`.
- **Golden baseline update fails**: Fails with CREG-06 (auto-accept write error). Operator must resolve manually.
- **Standalone mode (no mission context)**: `--auto-accept` requires mission context to resolve the evidence directory path. When run standalone (not via `mission.validate`), the command writes the review manifest and `apply-result.json` to the cache clone's `.cache/content-regression/` directory instead of `missions/{mission}/evidence/`. The golden baseline is still updated. Standalone mode is primarily for testing and debugging — production use is via `mission.validate --auto-accept-regression`.

### `mission.close` CREG-05 interaction

RFC-0734 added CREG-05 enforcement to `mission.close`: if drift exists and no `apply-result.json` exists, `mission.close` blocks. When `content.regression.check --auto-accept` updates the golden baseline, it also writes `apply-result.json` with `pending: 0` and no errors — the same artifact that `content.regression.apply` writes. This means `mission.close` will pass the CREG-05 check without changes to its enforcement logic. The `apply-result.json` includes an `autoAccepted: true` field to distinguish auto-accept from manual apply, but `mission.close` only checks `pending: 0` and no errors — the `autoAccepted` field is informational.

## Rollout

- **Default behavior**: Unchanged. `content.regression.check` fails on drift without `--auto-accept`.
- **Existing missions**: No migration. Operators opt in by passing the flag.
- **New missions**: No change — flag is opt-in.
- **Pipeline integration**: `mission.validate --auto-accept-regression` propagates the flag to `content.regression.check` within `build.check`. Other pipeline steps are unaffected.

## Alternatives considered

- **Extend RFC-0748's `--auto-accept` on `review.generate` to also skip `apply`**: Rejected. `review.generate` is an operator-invoked command outside the pipeline. Even with `--auto-accept`, the operator must still run `apply` separately and re-run `mission.validate`. The 2-step flow doesn't eliminate manual intervention between pipeline steps — it only eliminates YAML editing. RFC-0764's 1-step flow integrates auto-accept into the pipeline itself.
- **`--accept-all` on `content.regression.apply`**: Rejected. `content.regression.apply` already requires a review manifest. Adding a bulk-accept there would skip the review generation step, losing the audit trail.
- **Auto-accept in `mission.close`**: Rejected. `mission.close` already creates the golden baseline on first close (DNA-61). Auto-accepting in close would conflate "first close" with "subsequent close with drift."
- **Remove the review-apply workflow entirely**: Rejected. The manual workflow is correct for unexpected drift. The flag is a fast path for expected drift only.

## Risks

- **Operators auto-accept unintended changes**: Mitigated by the audit trail (review manifest with all decisions). Operators can review the manifest after the fact and revert if needed.
- **False sense of safety**: The flag name `--auto-accept` is intentionally explicit. It does not imply "safe" — it implies "I accept all changes."
- **Audit trail gap**: The review manifest is generated even on auto-accept, so there is no audit gap. The manifest records all accepted changes with golden and current values.
- **Production use**: The `--auto-accept-regression` flag on `mission.validate` has no technical guard against production use — consistent with the existing `--skip-content-regression` flag. The Leitstand pipeline (`leitstand.propagate`, `leitstand.promote`) calls `mission.validate` without optional flags. Production use is discipline-only, same as `--skip-content-regression`.
- **Pipeline step mutation**: `content.regression.check` becomes a mutating pipeline step when `--auto-accept` is set. This is a deliberate shift (see Decision section). The mutation is opt-in and only writes to the cache clone, never to the workpiece git repo.

## Acceptance criteria

- [x] `content.regression.check --auto-accept` passes when drift is detected (evidence: unit test "auto-accept passes when drift is detected and updates golden baseline")
- [x] Golden baseline is updated on auto-accept (evidence: unit test verifies golden snapshot file content matches current after auto-accept)
- [x] Review manifest is generated with all decisions set to `accept` (audit trail) (evidence: unit test "auto-accept generates audit trail manifest with all decisions set to accept")
- [x] `mission.validate --auto-accept-regression` propagates the flag to the pipeline (evidence: mission-materialization-commands.ts propagates `auto-accept` flag to build.check pipeline)
- [x] Default behavior (without flag) is unchanged — still fails on drift (evidence: unit test "default behavior (without --auto-accept) still fails on drift")
- [x] Unit test: auto-accept passes with drift (evidence: content-regression.test.ts)
- [x] Unit test: auto-accept generates audit trail manifest (evidence: content-regression.test.ts)
- [x] Unit test: default behavior still fails on drift (evidence: content-regression.test.ts)
- [x] CREG-06 diagnostic rule registered in `diagnostics/rules/core-infra.ts` (evidence: core-infra.ts line 526)
- [x] `apply-result.json` written on auto-accept to satisfy `mission.close` CREG-05 (evidence: unit test verifies apply-result.json with pending:0, errors:[])
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate run, 0 errors, 3 expected V-19 warnings)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the manual review workflow — `--auto-accept` is an addition, not a replacement.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
