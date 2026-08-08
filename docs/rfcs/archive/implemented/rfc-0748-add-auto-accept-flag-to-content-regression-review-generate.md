---
id: RFC-0748
title: "Add --auto-accept flag to content.regression.review.generate"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0734
amendedBy: []
related:
  - RFC-0734
  - RFC-0732
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - content.regression.review.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "content.regression.review.generate --auto-accept sets all decisions to accept and writes review.yaml"
  - "content.regression.apply can consume auto-accepted review.yaml without manual editing"
nonGoals:
  - "Does not skip the review.yaml generation — the manifest is still written for audit trail"
  - "Does not auto-accept removed routes — those still require explicit operator decision"
---

# RFC-0748: Add --auto-accept flag to content.regression.review.generate

## Context

RFC-0734 introduced the content regression review workflow: `review.generate` creates a `review.yaml` manifest with per-change golden/current values, the operator fills in decisions (`accept | reject | fix`), then `review.apply` processes them and updates the golden snapshot.

When an operator makes intentional content changes across many routes (e.g. a bulk content edit affecting 30+ routes), filling in `accept` for each change is tedious and adds no value — every change is expected and should be accepted.

## Problem

The current workflow requires manual editing of `review.yaml` for every change, even when all changes are expected. For 30 changes, the operator must open the YAML, set `decision: accept` on each entry, then run `review.apply`. This is pure ceremony when the changes are intentional.

## Decision

The `content.regression.review.generate` command gains an `--auto-accept` flag. When set, all generated changes have `decision: accept` instead of `decision: pending`. The operator can then immediately run `content.regression.apply` without editing the YAML.

Removed routes are excluded from auto-accept — they still get `decision: pending` because removing a route is a structural change that warrants explicit confirmation.

## Architectural fit

- Aligns with RFC-0734's review workflow — the manifest is still generated, just pre-filled
- The audit trail is preserved — `review.yaml` records what was accepted
- `content.regression.apply` already handles `accept` decisions; no change needed there

## Design

### CLI surface

```sh
# Generate review with all changes pre-accepted
pnpm exec site-kernel run content.regression.review.generate --site warpgogol-com --auto-accept

# Then immediately apply (no manual YAML editing)
pnpm exec site-kernel run content.regression.apply --site warpgogol-com --review missions/<id>/evidence/content-regression/review.yaml
```

### TypeScript contracts

```ts
// No new types — the existing ContentRegressionReviewChange.decision field
// already supports "accept". The only change is the initial value.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/evidence/content-regression/review.yaml` | Written with `decision: accept` for non-removed-route changes |

### Output format

No change to output format. The `summary` field includes `(auto-accepted)` when the flag was used.

### Failure modes

- If `--auto-accept` is combined with `--dry-run`, the YAML is printed to stdout with decisions pre-set to `accept`
- Removed routes remain `pending` — operator must explicitly decide those

## Rollout

- Default behavior is unchanged (all `pending`) — `--auto-accept` is opt-in
- No migration needed — existing review.yaml files are not affected
- New apps automatically benefit when the flag is used

## Alternatives considered

1. **Skip review.yaml entirely and directly update golden**: Rejected — loses the audit trail. The manifest documents what was accepted and when.
2. **Add `--auto-accept` to `content.regression.apply` instead**: Rejected — `apply` reads the YAML; it would still require a YAML file with all `pending` decisions, then override them. Cleaner to pre-fill at generation time.
3. **Add a `content.regression.auto-accept` convenience command**: Rejected — unnecessary command surface. A flag on the existing command is simpler.

## Risks

- **Accidental acceptance**: An operator might use `--auto-accept` without reviewing changes. This is acceptable — the review.yaml is still written and can be inspected before running `apply`. The `apply` command verifies the snapshot hash matches, preventing stale auto-accept.
- **Masking unintended changes**: If content was accidentally modified, `--auto-accept` would accept the drift. Mitigated by the fact that `review.generate` still writes the full diff to `review.yaml` for inspection.

## Acceptance criteria

- [x] `--auto-accept` flag added to `content.regression.review.generate` command table entry (evidence: `packages/os/site-kernel-checks/src/command-tables/build-infra.ts:215-221`)
- [x] All non-removed-route changes have `decision: accept` when flag is set (evidence: `packages/os/site-kernel-checks/src/content-regression.ts:905-913`)
- [x] Removed routes remain `decision: pending` when flag is set (evidence: `content-regression.ts:909` — `if (change.kind !== "removed-route")` guard)
- [x] `--dry-run` + `--auto-accept` prints YAML with pre-accepted decisions (evidence: `content-regression.ts:934-941` — autoAcceptLabel included in dry-run summary)
- [x] Summary output includes `(auto-accepted)` when flag is used (evidence: `content-regression.ts:934` — `autoAcceptLabel = autoAccept ? " (auto-accepted)" : ""`)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0748` returns OK)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT auto-accept removed routes — those require explicit operator decision.
- Agents MUST NOT skip writing review.yaml — the audit trail is mandatory even with auto-accept.
