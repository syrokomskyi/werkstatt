---
reviewId: REVIEW-CODE-2026-07-13-08
date: 2026-07-13
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 22cba0d6c...HEAD
filesReviewed:
  - packages/os/site-kernel/src/site-workspace-resolver.ts
  - packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts
  - packages/os/site-kernel-handoff/src/tests/notausgang.test.ts
  - packages/os/site-kernel-checks/src/ecosystem/debt.ts
---

# Code Review: 22cba0d6c...HEAD (RFC-0381 pilot migration)

### Verdict: Needs revision

The diff successfully implements the RFC-0381 pilot migration wave and retires `apps/webgogol-com`. The core fixes — schema-compliant pin generation, bordbuch field name correction, release manifest ecosystem resolution, and dual-representation resolver — are correct and well-grounded. However, two findings on Axis A (duplicated helper functions) and Axis E (swallowed error in debt.ts) require revision before merge.

### Mechanical floor

Pass — `pnpm --filter @gogol/site-kernel-handoff build:check` and `pnpm --filter @gogol/site-kernel-checks build:check` both pass. 65/65 handoff tests pass.

### Axis A — Structural correctness

**Finding A-1: Duplicated `highestRfcId` and `snapshotCapabilities` functions.**

`highestRfcId` is defined identically in both `sternsystem-extract.ts:43-55` and `sternsystem-pin.ts:37-49`. `snapshotCapabilities` is also duplicated verbatim between `sternsystem-extract.ts:57-73` and `sternsystem-pin.ts:51-67`. These should be extracted to a shared helper module (e.g., `sternsystem/pin-helpers.ts`) and imported by both files. The duplication risks drift if one copy is updated but not the other.

**Finding A-2: Timestamp validation logic is inverted.**

`notausgang-commands.ts:412`:

```ts
if (!Number.isNaN(Date.parse(ts)) && !/^\d{4}-\d{2}-\d{2}T/.test(ts)) {
```

This condition flags a timestamp as invalid only when `Date.parse` succeeds AND the ISO format check fails. But if `Date.parse` fails (returns `NaN`), the condition short-circuits and no violation is pushed — meaning genuinely unparseable timestamps are silently accepted. The guard should be:

```ts
if (Number.isNaN(Date.parse(ts)) || !/^\d{4}-\d{2}-\d{2}T/.test(ts)) {
```

This is a pre-existing bug that was carried over when the field name was changed from `timestamp` to `occurredAt`, but it should be fixed in this revision since the validation logic was touched.

### Axis B — DNA alignment

No issues. The diff respects DNA-1 (monorepo boundary) — all changes are within `packages/*`. DNA-51 (Werkstatt primitives) — `sternsystem-extract.ts` uses `acquireLock`, `releaseLock`, `atomicWriteFile` correctly. The `release-commands.ts` uses `atomicMoveDir` for staging. No hardcoded tokens or cosmic naming violations.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct — `site-kernel` exports the resolver, `site-kernel-handoff` consumes it. The `debt.ts` fix correctly handles the zero-sites edge case in `ecosystem.manifest.generate`. CI workflow cleanup is complete — `changelog.yml`, `ci.yml`, and `cache-parity.yml` no longer reference `webgogol-com`.

### Axis D — Forward-only compliance

No issues. The `apps/webgogol-com` directory is fully removed via `git rm -r`, not maintained behind a flag. The dual-representation resolver change (`site-workspace-resolver.ts:147-149`) is forward-only — it prefers the mission workpiece during an active mission without keeping a legacy fallback path. The old `sternsystem-extract.ts` pin generation (flat `platformVersion` field) is replaced, not paralleled.

### Axis E — Agent-facing clarity

**Finding E-1: Swallowed error in `debt.ts:69`.**

```ts
const report = await executeKernelCommand({
  ...
}).catch(() => null);
if (!report) continue;
```

The `.catch(() => null)` swallows all errors silently. An agent debugging a failing `ecosystem.manifest.generate` will see no diagnostic — the command simply skips the advisory debt item. The catch should at minimum log the error context:

```ts
}).catch((err: unknown) => {
  logger?.warn?.(`collectMaintenanceDebtItems: ${command} failed: ${(err as Error).message}`);
  return null;
});
```

Or, since the zero-sites case is the expected failure, check for that condition explicitly before calling `executeKernelCommand` rather than using a catch-all.

**Finding E-2: No `MODULE_CONTRACT` or `CHANGE_SUMMARY` updates on modified files.**

`sternsystem-extract.ts` gained significant new logic (schema-compliant pin generation, two new helper functions) but its existing `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks were not updated to reflect the RFC-0381 changes. Per DNA-42, substantial edits to high-risk files should backfill Compass semantic scaffolding. The same applies to `notausgang-commands.ts` and `release-commands.ts`.

### Axis F — Pragmatism

No issues. The changes are minimal and targeted — each fix addresses a specific validation failure encountered during the pilot sequence. No speculative generality or unnecessary abstractions were introduced. The `site-workspace-resolver.ts` change is a 3-line conditional — the simplest possible fix.

### Axis G — Blind spots

**Finding G-1: `snapshotCapabilities` reads `uni.registry.yaml` as JSON but the file is YAML.**

`sternsystem-extract.ts:59-60`:

```ts
const raw = await fs.readFile(path.join(workspaceRoot, "uni.registry.yaml"), "utf8");
const parsed = JSON.parse(raw) as { ... };
```

The file extension is `.yaml` but the code uses `JSON.parse`. If the file contains YAML (which the extension suggests), this will throw and silently return `[]` via the catch block. This is the same pattern in `sternsystem-pin.ts` — if it works there, the file may actually be JSON despite the extension, but this should be verified or fixed.

**Finding G-2: No test coverage for the dual-representation resolver change.**

The `site-workspace-resolver.ts` change (preferring mission workpiece when `currentMission` is set) is a critical behavioral change that affects how all site commands resolve workspaces during an active migration. There is no unit test covering this new branch. The existing `sternsystem.test.ts` tests cover registration and extraction but not the resolver's dual-representation logic.

### Spec compliance

| Requirement from RFC-0381 | Status | Evidence |
| --- | --- | --- |
| Expand `repo` regex for local paths | Done | `sternsystem-register.ts` (prior commit) |
| Update error messages | Done | `sternsystem-register.ts` (prior commit) |
| Add test coverage for local path `repo` | Done | `sternsystem.test.ts` (prior commit) |
| Schema-compliant `system.pin.json` | Done | `sternsystem-extract.ts:120-138` |
| Fix bordbuch field names in validator | Done | `notausgang-commands.ts:363` (`id`, `kind`, `occurredAt`) |
| Fix nested pin access in validator | Done | `notausgang-commands.ts:620-621` |
| Optional artifact manifest | Done | `notausgang-commands.ts:710` |
| Resolve ecosystem in release.prepare | Done | `release-commands.ts:183-184` |
| Fix dual-representation resolver | Done | `site-workspace-resolver.ts:147-149` |
| Retire `apps/webgogol-com` | Done | `git rm -r` (commit ce8e6f7ee) |
| Clean stale CI references | Done | `changelog.yml`, `ci.yml`, `cache-parity.yml` |
| Regenerate ecosystem manifest | Done | `ecosystem.generated.yaml` (commit 966d6b18b) |
| Handle zero-sites in debt collector | Done | `debt.ts:63-70` (with Finding E-1) |
| Emit verification evidence | Done | `docs/audits/evidence-rfc-0381-*.md` |
| Stamp RFC as implemented | Done | `rfc-0381-*.md` status: implemented |
| Update test fixtures to match schema | Done | `notausgang.test.ts:74-109` |

### Questions for the author

1. The `highestRfcId` and `snapshotCapabilities` functions are duplicated between `sternsystem-extract.ts` and `sternsystem-pin.ts`. Why were they not extracted to a shared helper? Is there a reason the two files cannot import from a common module?
2. The timestamp validation in `notausgang-commands.ts:412` uses `&&` which silently accepts unparseable timestamps. Was this intentional (e.g., to avoid false positives on non-ISO formats that `Date.parse` handles loosely)?
3. The `.catch(() => null)` in `debt.ts:69` swallows all errors. Is there a reason not to at least log the failure for agent debugging?
