---
id: RFC-0764
title: "Add --auto-accept flag to content.regression.check for expected content drift"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0732
  - RFC-0734
amendedBy: []
related:
  - DNA-61
  - DNA-63
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - content.regression.check
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Missions with expected content drift can pass validation without manual review-apply cycle"
  - "Operator can pass --auto-accept to mission.validate to skip regression review"
nonGoals:
  - "Does not remove the manual review-apply workflow (default behavior unchanged)"
  - "Does not auto-accept regression for production releases ( Leitstand guard remains)"
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

## Problem

DNA-63 (Content regression review discipline) requires explicit operator review before the golden baseline is updated. This is correct for **unexpected** drift — the operator should verify that content changed intentionally. But for **expected** drift (the mission's purpose is to change content), the manual cycle is pure overhead.

The current design has no fast path for "I know all these changes are correct."

## Decision

Add an `--auto-accept` flag to `content.regression.check`. When passed, the command auto-accepts all detected drift, updates the golden baseline directly, and passes (exit code 0). The flag is opt-in — default behavior (fail on drift, require manual review) is unchanged.

`mission.validate` gains a `--auto-accept-regression` flag that propagates to `content.regression.check` within the `build.check` pipeline.

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
|---|---|
| `packages/os/site-kernel-checks/src/content-regression/content-regression-check.ts` | Add `--auto-accept` flag handling |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add `--auto-accept-regression` flag, propagate to pipeline |
| `missions/{mission}/evidence/content-regression/review.yaml` | Audit trail: generated with all decisions set to `accept` |

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

### Failure modes

- **`--auto-accept` without drift**: No-op. Passes with `autoAccepted: 0`.
- **`--auto-accept` with drift**: Golden baseline updated. Review manifest generated with all decisions set to `accept`. Passes with `autoAccepted: N`.
- **Golden baseline update fails**: Fails with CREG-06 (auto-accept write error). Operator must resolve manually.

## Rollout

- **Default behavior**: Unchanged. `content.regression.check` fails on drift without `--auto-accept`.
- **Existing missions**: No migration. Operators opt in by passing the flag.
- **New missions**: No change — flag is opt-in.
- **Pipeline integration**: `mission.validate --auto-accept-regression` propagates the flag to `content.regression.check` within `build.check`. Other pipeline steps are unaffected.

## Alternatives considered

- **`--accept-all` on `content.regression.apply`**: Rejected. `content.regression.apply` already requires a review manifest. Adding a bulk-accept there would skip the review generation step, losing the audit trail.
- **Auto-accept in `mission.close`**: Rejected. `mission.close` already creates the golden baseline on first close (DNA-61). Auto-accepting in close would conflate "first close" with "subsequent close with drift."
- **Remove the review-apply workflow entirely**: Rejected. The manual workflow is correct for unexpected drift. The flag is a fast path for expected drift only.

## Risks

- **Operators auto-accept unintended changes**: Mitigated by the audit trail (review manifest with all decisions). Operators can review the manifest after the fact and revert if needed.
- **False sense of safety**: The flag name `--auto-accept` is intentionally explicit. It does not imply "safe" — it implies "I accept all changes."
- **Audit trail gap**: The review manifest is generated even on auto-accept, so there is no audit gap. The manifest records all accepted changes with golden and current values.

## Acceptance criteria

- [ ] `content.regression.check --auto-accept` passes when drift is detected
- [ ] Golden baseline is updated on auto-accept
- [ ] Review manifest is generated with all decisions set to `accept` (audit trail)
- [ ] `mission.validate --auto-accept-regression` propagates the flag to the pipeline
- [ ] Default behavior (without flag) is unchanged — still fails on drift
- [ ] Unit test: auto-accept passes with drift
- [ ] Unit test: auto-accept generates audit trail manifest
- [ ] Unit test: default behavior still fails on drift
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the manual review workflow — `--auto-accept` is an addition, not a replacement.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
