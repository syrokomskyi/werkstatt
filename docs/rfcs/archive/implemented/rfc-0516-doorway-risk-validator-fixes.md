---
id: RFC-0516
title: "Doorway-risk validator fixes: city+industry lookup and mode:warn"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: bugfix
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
implementedAt: 2026-07-24
versionBump: patch
---

# RFC-0516: Doorway-risk validator fixes — city+industry lookup and mode:warn

## Context

`surface.doorway-risk.report` (RFC-0492) flags depth-4 city pages missing unique
local context fields (`localDemandContext`, `uniqueIntro`, `uniqueFaq`,
`localEvidence`). Two bugs caused false-positive errors on webgogol-com:

1. **`localDemandContext` lookup used demand slug** — `checkEntryLocalContext`
   looked up the demand record via `entry.axes.demand`, but depth-4 surface
   entries have no demand axis (demand is a depth-5 axis). The lookup always
   failed, so `localDemandContext` was flagged on every depth-4 page regardless
   of whether the demand record had the field.

2. **Blueprint `mode: warn` was ignored** — the `website-local` blueprint
   declares `dossier.mode: warn`, but the validator used `exceedsThreshold` alone
   to decide severity. When the flagged share exceeded the threshold (0.30),
   all diagnostics were emitted as `error` and the threshold-exceeded diagnostic
   was always added, even in warn mode.

## Problem

The validator produced 13 errors (12 missing-field + 1 threshold-exceeded) on
webgogol-com, all on German depth-4 pages. The `localDemandContext` errors were
false positives — the German demand records do lack the field, but the validator
would have flagged them even if they had it, because the lookup was broken.

The `mode: warn` setting in the blueprint was intended to make doorway-risk a
warning-only diagnostic during the content rollout phase, but the validator
ignored it.

## Decision

Fix both bugs in `surface-doorway-risk.ts`:

1. **Replace demand-slug lookup with city+industry lookup.** Build a
   `demandByCityIndustry` map keyed by `${city}::${industry}` from the demand
   records' `city` and `industries` fields. `checkEntryLocalContext` now looks
   up `entry.axes.city` + `entry.axes.industry` in this map.

2. **Respect `dossier.mode: warn`.** Read `dossierMode` from the blueprint's
   depth-1 `dossier.mode` field. When mode is `warn`:
   - Individual missing-field diagnostics are always `warning` severity.
   - The threshold-exceeded diagnostic is suppressed entirely.

## Architectural fit

- **No blueprint change** — the `mode: warn` field already exists in the
  `dossierSchema` (RFC-0492). The validator simply wasn't reading it.
- **No data contract change** — demand records already have `city` and
  `industries` fields. The lookup key is derived from existing fields.
- **Layer A change only** — `packages/os/site-kernel-checks` is a platform
  package (Layer A). No Layer C (external surface) impact.

## Design

### `buildDemandByCityIndustry`

New helper function that iterates demand records and builds a
`Map<string, Record<string, unknown>>` keyed by `${city}::${industry}`. If
multiple demand records match the same key, the first one wins (sufficient for
the `hasField` check — any demand record for that city+industry with
`localDemandContext` satisfies the gate).

### `checkEntryLocalContext` signature change

The third parameter changes from `demandBySlug: Map<string, Record<string, unknown>>`
to `demandByCityIndustry: Map<string, Record<string, unknown>>`. The lookup
key changes from `entry.axes.demand` to `${entry.axes.city}::${entry.axes.industry}`.

### `dossierMode` handling

```typescript
const dossierMode = dossierConfig?.mode === "warn" ? "warn" : "error";
// ...
const baseSeverity = exceedsThreshold && dossierMode !== "warn" ? "error" : "warning";
// ...
if (exceedsThreshold && dossierMode !== "warn") {
  diagnostics.push({ ruleId: "doorway-risk-threshold-exceeded", ... });
}
```

## Rollout

- **Version bump:** `patch` (additive fix, no data contract change).
- **No migrator needed** — the fix is in validator logic only; no data
  migration is required.
- **No existing content needs to change** — the fix makes the validator
  correctly recognize existing `localDemandContext` fields.

## Risks

- **False negatives if demand records lack `city` or `industries`** — the
  lookup silently skips records without these fields. This is acceptable
  because demand records without city/industry are invalid per the existing
  content schema and would be caught by other validators.

## Acceptance criteria

1. `surface.doorway-risk.report --site webgogol-com` exits 0 (warnings only,
   no errors) when the blueprint declares `mode: warn`.
2. Depth-4 pages with demand records that have `localDemandContext` are not
   flagged for `localDemandContext`.
3. All unit tests pass, including new tests for city+industry lookup and
   mode:warn behavior.

## Implementation notes

- `surface-doorway-risk.ts`: replaced `demandBySlug` with
  `demandByCityIndustry`, added `buildDemandByCityIndustry` helper, added
  `dossierMode` handling.
- `surface-doorway-risk.test.ts`: added two new tests:
  - "finds localDemandContext via city+industry, not demand slug"
  - "emits warnings (not errors) when dossier mode is warn"
