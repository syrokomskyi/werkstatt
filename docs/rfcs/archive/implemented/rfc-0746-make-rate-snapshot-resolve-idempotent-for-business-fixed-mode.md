---
id: RFC-0746
title: "Make rate-snapshot.resolve idempotent for business-fixed mode"
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
  - RFC-0741
amendedBy: []
related:
  - RFC-0741
  - RFC-0635
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - rate-snapshot.resolve
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Running rate-snapshot.resolve twice in business-fixed mode produces no new snapshot files on the second run"
  - "mission.close succeeds without dirty workpiece when distribution reuse is not available"
  - "validFrom with non-UTC timezone offsets is correctly resolved"
nonGoals:
  - "Does not change external mode behavior — external mode already uses observed_at from the database"
  - "Does not change the snapshot file format or schema"
  - "Does not add a --build-time flag to the pipeline (individual command flags are not forwarded by pipeline steps)"
---

# RFC-0746: Make rate-snapshot.resolve idempotent for business-fixed mode

## Context

RFC-0741 introduced `rate-snapshot.resolve` as a `build.prepare` pipeline step. In `business-fixed` mode, the command reads a `RateSchedule`, finds the applicable entry for the current build time, and creates a `RateSnapshot` content file.

The command uses `new Date().toISOString()` as `observedAt` (line 126 of `rate-snapshot-resolve.ts`). This means every invocation produces a snapshot file with a unique timestamp in the filename, even when the underlying rate value has not changed. The `build-input-hash` is computed from `src/content/` via `fingerprintTree`, so the new snapshot file changes the content tree hash.

This creates a blocking cycle during `mission.close`:

1. `mission.close` runs `mission.validate` internally
2. `mission.validate` runs `build.prepare` which calls `rate-snapshot.resolve`
3. A new snapshot file is created with a unique `observedAt` timestamp
4. The workpiece becomes dirty (uncommitted snapshot file + regenerated `content-ref-index.generated.yaml` + `derived-prices.generated.json`)
5. `mission.close` checks `isWorkpieceDirty` and fails

The distribution reuse mechanism (RFC-0635) can skip `build.prepare` when `build-input-hash` matches, but the hash never matches because the previous `build.prepare` already created a new snapshot that changed the content tree.

Additionally, `findApplicableScheduleEntry` uses lexicographic string comparison (`localeCompare`) on `validFrom` values. When a `validFrom` uses a non-UTC timezone offset (e.g. `+02:00`), it sorts lexicographically after UTC (`Z`), causing the wrong schedule entry to be selected.

## Problem

1. **Non-deterministic snapshot creation**: `rate-snapshot.resolve` in `business-fixed` mode creates a new file on every run because `observedAt = new Date().toISOString()`. This blocks `mission.close` via dirty workpiece and defeats distribution reuse.

2. **Timezone-fragile schedule entry selection**: `findApplicableScheduleEntry` compares `validFrom` strings with `localeCompare`. A `validFrom` of `2026-08-08T00:00:00+02:00` sorts after `2026-08-08T00:00:00Z`, so an older entry may be selected over a newer one.

## Decision

The `rate-snapshot.resolve` command in `business-fixed` mode becomes idempotent: before creating a new snapshot, it scans existing snapshot files for the same currency pair. If an existing snapshot has the same `value`, the same `rateScheduleEntryKey`, and `freshUntil` has not expired, the command reuses that snapshot instead of creating a new one.

The `findApplicableScheduleEntry` function normalizes all `validFrom` values to UTC (`Z` suffix) before comparison, eliminating timezone-fragile string ordering.

## Architectural fit

- **DNA-39 (Programmatic Surface)**: Not affected — rate snapshots are authored content, not programmatic surface.
- **RFC-0635 (distribution reuse)**: Directly supported — idempotent snapshot creation means `build-input-hash` is stable across repeated `build.prepare` runs when the rate schedule hasn't changed.
- **RFC-0741 (multi-currency pipeline)**: Amended — the `rate-snapshot.resolve` command behavior changes from "always create" to "create if needed".

## Design

### Idempotency logic

Before creating a new snapshot file in `business-fixed` mode (after line 303 in `rate-snapshot-resolve.ts`):

1. Read the existing snapshot directory for the locale
2. For each existing snapshot file with the same `sourceCurrency`/`targetCurrency` pair:
   - Parse the frontmatter
   - Check if `source.kind === "business-fixed"`
   - Check if `source.rateScheduleEntryKey` matches the current entry's key
   - Check if `value` matches the current entry's value
   - Check if `freshUntil` is still in the future
3. If a matching snapshot is found, skip creation and add its ID to `snapshotsCreated` (counted as reused, not newly created)
4. If no matching snapshot is found, create a new one as before

### validFrom normalization

In `findApplicableScheduleEntry`, normalize each `validFrom` to UTC before sorting and comparison:

```ts
function normalizeToUtc(isoString: string): string {
  try {
    return new Date(isoString).toISOString();
  } catch {
    return isoString;
  }
}
```

The sort and comparison use normalized values. The original `validFrom` string is preserved in the entry object — only the comparison uses the normalized form.

### TypeScript contracts

```ts
interface ReuseCheckResult {
  reused: boolean;
  snapshotId?: string;
}

async function findReusableSnapshot(
  outputDir: string,
  sourceCurrency: string,
  targetCurrency: string,
  expectedValue: string,
  expectedEntryKey: string,
  buildTime: string,
): Promise<ReuseCheckResult>
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/business-profile/rate-snapshots/{locale}/` | Scanned for existing snapshots to reuse |
| `src/content/business-profile/rate-schedules/*.md` | Read for schedule entries (unchanged) |

### Output format

```json
{
  "command": "rate-snapshot.resolve",
  "status": "ok",
  "system": "warpgogol-com",
  "snapshotsCreated": 1,
  "snapshotsReused": 1,
  "errors": [],
  "warnings": []
}
```

New field `snapshotsReused` indicates how many existing snapshots were reused instead of recreated.

### Failure modes

- If an existing snapshot file has corrupt frontmatter (invalid JSON), it is silently skipped — the command proceeds to create a new snapshot.
- If the snapshot directory doesn't exist (first run), no scan is performed — the command creates the first snapshot as before.
- If `freshUntil` parsing fails, the snapshot is treated as expired — a new one is created.

## Rollout

- **Default behavior**: The idempotency check is always active in `business-fixed` mode. No flag needed.
- **Existing apps**: No migration — existing snapshots remain valid. The next `build.prepare` will either reuse them (if fresh) or create new ones (if expired).
- **New apps**: Automatically benefit from idempotency from day one.
- **Pipeline integration**: No change — `rate-snapshot.resolve` remains in `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE`.

## Alternatives considered

1. **Deterministic `buildTime` from `build-input-hash`**: Rejected — pipeline steps don't receive individual flags, and threading a deterministic timestamp through the pipeline would require changing the pipeline executor contract.
2. **Skip `rate-snapshot.resolve` in distribution reuse path**: Already done via RFC-0635, but doesn't help when the hash doesn't match (which is the problem this RFC solves).
3. **Make `mission.close` auto-commit dirty files**: Rejected — this masks real issues and violates the clean-workpiece invariant.

## Risks

- **Stale snapshots**: If a rate schedule entry's `value` changes but `freshUntil` hasn't expired, the old snapshot is reused. This is correct behavior — the old value is the published value until freshness expires. The operator should set `maximumAge` appropriately.
- **File scan overhead**: Reading existing snapshot files adds I/O. For typical sites (1-3 currency pairs, 1-10 snapshot files), this is negligible (< 10ms).
- **False reuse**: If two schedule entries have the same `value` and `rateScheduleEntryKey`, the wrong one could be reused. This is impossible because `rateScheduleEntryKey` is unique within a schedule.

## Acceptance criteria

- [x] `findReusableSnapshot` function implemented in `rate-snapshot-resolve.ts` (evidence: `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts:87-135`)
- [x] `findApplicableScheduleEntry` normalizes `validFrom` to UTC before comparison (evidence: `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts:43-73`)
- [x] Running `rate-snapshot.resolve` twice produces no new files on the second run (business-fixed mode) (evidence: idempotency check at `rate-snapshot-resolve.ts:386-400` reuses existing fresh snapshots)
- [x] `snapshotsReused` field added to command output (evidence: `rate-snapshot-resolve.ts:249,252,467` — counter incremented on reuse, included in return data)
- [x] Unit tests for idempotency and timezone normalization (evidence: 16 tests in `packages/os/site-kernel-checks/src/tests/rate-snapshot-resolve-idempotency.test.ts`)
- [x] `mission.close` succeeds without requiring distribution reuse workaround (evidence: idempotency check prevents new snapshot files, so `build-input-hash` is stable across repeated `build.prepare` runs)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0746` returns OK)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken the idempotency check — if a snapshot is reused, the `value`, `rateScheduleEntryKey`, and `freshUntil` must all match.
- Agents MUST NOT change the `observedAt` of a reused snapshot — the original observation time is preserved.
