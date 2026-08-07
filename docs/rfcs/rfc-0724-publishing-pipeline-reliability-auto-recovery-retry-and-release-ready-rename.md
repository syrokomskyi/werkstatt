---
id: RFC-0724
title: "Publishing pipeline reliability: auto-recovery, retry loops, release.ready rename, and mandatory Axiom gate"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes:
  - RFC-0700
supersededBy:
amends:
  - RFC-0629
  - RFC-0657
  - RFC-0702
amendedBy: []
related:
  - RFC-0627
  - RFC-0628
  - RFC-0668
  - RFC-0689
satisfies:
  - DNA-51
  - DNA-59
versionBump: minor
commands:
  proposed: []
  added:
    - release.ready
  changed:
    - behavior.snapshot.validate
    - leitstand.dev-deploy
    - leitstand.promote
    - mission.validate
  removed:
    - release.publish
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "mission.validate auto-commits dirty bordbuch files without manual intervention"
  - "behavior.snapshot.validate auto-recovers from SNAP-01 without manual intervention"
  - "leitstand.promote retries build-identity fetch up to 5 times before failing"
  - "leitstand.dev-deploy --release runs mission.check (Axiom gate) before returning"
  - "release.ready replaces release.publish with no backward compat"
  - "Error messages in leitstand.propagate and leitstand.promote include full remaining protocol commands"
nonGoals:
  - "Changing the release.prepare or release.ready state machine semantics"
  - "Adding new release states"
  - "Modifying Axiom evidence format or mission.check internals"
  - "Changing CDN purge behavior"
  - "Extracting verify-freshness.ts as a new file — verifyFreshness is exported from leitstand-commands.ts instead"
---

# RFC-0724: Publishing pipeline reliability: auto-recovery, retry loops, release.ready rename, and mandatory Axiom gate

## Context

During the publishing of mission warpgogol-com-m000034 (release r000013), five separate failures required manual intervention, each costing 2–5 minutes of operator time:

1. **Stale behavior snapshot** — `behavior.snapshot.validate` failed with 9 SNAP-01 errors because nachweis routes changed but the committed snapshot was not updated. Required manual `behavior.snapshot.generate` + git commit in cache clone.
2. **Missing `release.publish` step** — `leitstand.propagate` failed because the release was in state `prepared` instead of `published`. The error message said "Run leitstand.dev-deploy first" but did not mention `release.publish` as the missing step.
3. **Axiom evidence missing** — `leitstand.dev-deploy --release` (RFC-0700) intentionally skips Axiom checks, but `leitstand.propagate` requires `evidence-metadata.json`. Required manual `mission.check` invocation (327 seconds).
4. **Build-identity mismatch** — `leitstand.promote` fetched stale build-identity from CDN (r000012 instead of r000013). Required `--force` to bypass.
5. **Dirty cache clone** — `mission.validate` failed because bordbuch files in cache clone were dirty from a previous dry-run. Required manual git commit in cache clone.

## Problem

Five independent reliability gaps in the publishing pipeline, each requiring manual intervention for deterministic, known fixes:

- **SNAP-01 has no auto-recovery in `mission.validate`**: RFC-0689 added auto-recovery for `pnpm build` failures, but `behavior.snapshot.validate` in `build.post` pipeline simply fails without recovery.
- **`release.publish` name is misleading**: "publish" sounds like deploying to production, but it's only a state transition (`prepared` → `published`). Operators and agents skip it thinking deploy = publish.
- **Error messages lack actionable protocol**: When a prerequisite step is missing, error messages describe the problem but not the exact commands to resolve it.
- **RFC-0700 release path skips Axiom gate**: `leitstand.dev-deploy --release` deploys without running `mission.check`, but `leitstand.propagate` requires Axiom evidence. This creates a deadlock.
- **`leitstand.promote` has no retry on stale CDN**: RFC-0657 added retry loop for `verifyFreshness` in dev-deploy, but promote fetches build-identity once without retry.
- **`mission.validate` full build path doesn't auto-commit dirty bordbuch**: RFC-0702 added `commitBordbuchProjections` cleanup on distribution reuse path only.

## Decision

### 1. Auto-recovery in `behavior.snapshot.validate`

When `behavior.snapshot.validate` detects SNAP-01 violations, it automatically:

1. Calls `buildBehaviorSnapshot` + `writeFileIfChanged` (both available within `@warpgogol/site-kernel-checks`) to regenerate `behavior.snapshot.generated.yaml` in-place
2. Logs a warning: `[behavior.snapshot.validate] auto-recovered: snapshot regenerated — review the diff and commit if intended`
3. Returns pass with `autoRecovered: true` in the result

No second validation pass is needed — the regenerated snapshot matches the current build by construction. No git commit is performed in this step — the file is written to the app directory (which is in the cache clone), and the git commit happens through existing pipeline mechanisms (`bordbuch.commit` or operator/agent review).

This design stays within `@warpgogol/site-kernel-checks` and does not import from `@warpgogol/site-kernel-handoff`, respecting the package dependency direction (`handoff` depends on `checks`, not the reverse).

### 2. Rename `release.publish` → `release.ready`

Rename the command from `release.publish` to `release.ready`. No backward compat alias. The state transition remains `prepared` → `ready` (renamed from `published` → `ready` in release.yaml `state` field).

All references in code, docs, AGENTS.md, error messages, and CI templates are updated. No legacy support.

The rename has cascading impacts on all code that checks or sets the `published` state:

- `leitstand.propagate` state check: `state !== "published"` → `state !== "ready"`
- `leitstand.propagate` error message: mentions `release.publish` → `release.ready`
- `leitstand.propagate` preflight check name: `"release-published"` → `"release-ready"`
- `leitstand.propagate` candidate search: `manifest.state === "published"` → `manifest.state === "ready"`
- `autoStepReleaseState`: returns `"published"` → returns `"ready"`
- `release.rollback`: checks `state !== "published"` → `state !== "ready"`
- `release.validate`: checks `state === "published"` → `state === "ready"`
- DNA-56 (Studio Gate MCP): tool list references `release.publish` → `release.ready`

### 3. Full protocol in error messages

`leitstand.propagate` and `leitstand.promote` error messages include the exact remaining commands:

```
[leitstand.propagate] Release 'warpgogol-com-r000013' must be in state 'ready' (current: prepared).
Run:
  1. release.ready --release warpgogol-com-r000013
  2. leitstand.dev-deploy --system warpgogol-com --release warpgogol-com-r000013
  3. Re-run: leitstand.propagate --system warpgogol-com --release warpgogol-com-r000013
```

```
[leitstand.promote] Release 'warpgogol-com-r000013' must be in state 'alt-deployed' (current: ready).
Run:
  1. leitstand.propagate --system warpgogol-com --release warpgogol-com-r000013
  2. Re-run: leitstand.promote --system warpgogol-com --release warpgogol-com-r000013
```

### 4. Mandatory Axiom gate in release-based dev-deploy

Remove the skip-Axiom behavior from RFC-0700 release path. `leitstand.dev-deploy --release` now runs `mission.check` after deploy, same as the workpiece path. The Axiom gate is mandatory for all dev deploys.

The release path resolves `missionId` from `releaseManifest.missionId` and runs `mission.check --external-preview --base-url=<dev-url> --commit-sha=<release-commitSha> --channel=dev --no-report`.

### 5. Retry loop in `leitstand.promote`

Export `verifyFreshness` from `leitstand-commands.ts` (it is currently a private function) and reuse it in `runLeitstandPromote`. The promote step fetches build-identity from the alt channel URL with the same retry loop as RFC-0657: 5 attempts, exponential backoff (3s/6s/12s/24s — 4 inter-attempt delays, total max wait ~45s). If all 5 attempts return stale identity, the step fails with a clear error. `--force` remains as manual escape hatch.

No new file is created — `verifyFreshness` is exported from `leitstand-commands.ts` where both `runLeitstandDevDeploy` and `runLeitstandPromote` reside.

### 6. Auto-commit dirty bordbuch in `mission.validate` (all paths)

Extend `commitBordbuchProjections` cleanup (RFC-0702) from distribution reuse path to all paths, including full build path. At the start of `mission.validate`, before any pipeline steps:

1. Check cache clone for dirty `bordbuch/` files
2. If dirty, auto-commit them with message `chore: auto-commit dirty bordbuch before validate`
3. Log a warning with the committed files
4. If commit fails, log warning and continue (non-fatal)

## Architectural fit

- **Auto-recovery pattern**: Follows RFC-0689 precedent — auto-regenerate behavior snapshot on SNAP-01. Extends the same principle to `behavior.snapshot.validate` and dirty bordbuch cleanup.
- **Retry pattern**: Follows RFC-0657 precedent — exponential backoff retry for CDN freshness verification. Extends to promote with the same constants (5 attempts, 4 delays: 3s/6s/12s/24s).
- **Axiom gate**: Aligns with RFC-0627/RFC-0628 — Axiom verification is a gate before propagation. RFC-0700's skip was an oversight that breaks the gate contract.
- **Naming**: `release.ready` is unambiguous — it signals the release is ready for deployment, not that it's published to production.
- **Error messages**: Follows K-0004 L2 principle — errors include full remaining protocol.
- **DNA-51 (Werkstatt consistency primitives)**: The auto-commit of dirty bordbuch uses `commitBordbuchProjections` which uses `gitExecWithRetry` with `[12_000, 60_000]` backoff — a DNA-51-compliant atomic-write primitive. The auto-recovery in `behavior.snapshot.validate` uses `writeFileIfChanged` — a DNA-51-compliant atomic write helper.
- **DNA-59 (Evidence preservation)**: Making the Axiom gate mandatory in the release path ensures every dev deploy produces evidence. Evidence from the release-path `mission.check` is stored in `missions/<missionId>/evidence/` and synced via `evidence.sync` (same as workpiece path). The release path resolves `missionId` from `releaseManifest.missionId`.
- **DNA-56 (Studio Gate MCP)**: The `release.publish` tool in the Studio Gate MCP tool list is renamed to `release.ready`.
- **Compass sync**: `docs/verification-plan.xml` needs synchronization — release state values are part of the verification flow.
- **AGENTS.md updates**: Root `AGENTS.md` (DNA-56 tool list) and `packages/os/site-kernel-handoff/AGENTS.md` (release state references) need updating.

## Design

### CLI surface

```sh
# Renamed command (was release.publish) — uses --release, derives system from manifest
pnpm exec site-kernel run release.ready --release warpgogol-com-r000013

# All other commands unchanged in syntax — behavior changes internally
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com --release warpgogol-com-r000013
pnpm exec site-kernel run leitstand.propagate --system warpgogol-com --release warpgogol-com-r000013
pnpm exec site-kernel run leitstand.promote --system warpgogol-com --release warpgogol-com-r000013
pnpm exec site-kernel run mission.validate --mission warpgogol-com-m000034
```

### TypeScript contracts

```ts
// behavior.snapshot.validate auto-recovery result
interface SnapshotValidateResult {
  autoRecovered: boolean;
  regeneratedSnapshot: boolean;
  errors: number;
  warnings: number;
}

// leitstand.promote with retry
interface PromoteFreshnessResult {
  verified: boolean;
  attempts: number;
  cdnReleaseId: string | null;
  error: string | null;
}

// release.ready (renamed from release.publish)
interface ReleaseReadyResult {
  releaseId: string;
  previousState: string;
  newState: string; // "ready"
  readyAt: string; // ISO timestamp
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | All leitstand command changes (promote retry, dev-deploy Axiom, error messages, export `verifyFreshness`) |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `release.publish` → `release.ready` rename, `published` → `ready` state |
| `packages/os/site-kernel-checks/src/behavior-snapshot.ts` | Auto-recovery in `behavior.snapshot.validate` |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Auto-commit dirty bordbuch on all paths |
| `packages/os/site-kernel-handoff/src/release/index.ts` | Command registration rename |
| `releases/<id>/release.yaml` | `state` field: `published` → `ready` |
| `systems/registry.yaml` | `lastPropagated.*.releaseId` references unchanged |
| `docs/verification-plan.xml` | Compass sync: release state values |
| `AGENTS.md` (root) | DNA-56 tool list: `release.publish` → `release.ready` |
| `packages/os/site-kernel-handoff/AGENTS.md` | Release state references |

### Failure modes

- **Auto-recovery fails**: If `buildBehaviorSnapshot` fails during auto-recovery (e.g. dist/client is missing), the original SNAP-01 error is reported.
- **Retry loop exhausted**: If `verifyFreshness` fails after 5 attempts in promote, the step fails with a clear error listing all attempt results. `--force` bypasses.
- **Axiom gate fails in release path**: If `mission.check` fails (exit 1 = content violations), dev-deploy reports `axiomStatus: "fail"` with error/warning counts. Propagate will block on missing evidence.
- **Bordbuch auto-commit fails**: Warning logged, pipeline continues. If `bordbuch.commit` step later fails, the original error is reported.
- **Concurrent `mission.validate` runs**: If two runs trigger bordbuch auto-commit simultaneously, `gitExecWithRetry` with `[12_000, 60_000]` backoff handles git lock conflicts. The loser's try/catch ensures non-fatal failure.

## Rollout

- **`release.ready` rename**: Clean break. Update all references in code, CI templates (`.github/workflows/`), AGENTS.md, docs, DNA-56. No alias.
- **`release.yaml` state field**: `published` → `ready`. All existing releases with `state: published` must be migrated — not just the latest, because `leitstand.propagate` candidate search scans all releases with `state === "published"`. Migration is a one-time update to all `releases/*/release.yaml` files.
- **Auto-recovery**: Active by default. No opt-in flag. Warning logged when triggered.
- **Retry loop in promote**: Active by default. `--force` bypasses.
- **Axiom gate in release path**: Active by default. No opt-out. RFC-0700's release path did not add a `--skip-axiom` flag — it simply skipped `mission.check`. This RFC removes that skip behavior.
- **Bordbuch auto-commit**: Active by default on all `mission.validate` paths. Non-fatal on failure.

## Alternatives considered

- **Auto-generate snapshot in `build.prepare`**: Rejected — would make `behavior.snapshot.validate` meaningless (comparing snapshot against itself).
- **Keep `release.publish` name, improve docs**: Rejected — name is actively misleading. "Publish" implies production deployment.
- **Skip Axiom for release path, skip evidence check in propagate**: Rejected — removes live verification before alt/main deploy. Axiom checks the live dev site, not just the build.
- **Purge + retry in promote**: Rejected — propagate already purges after deploy. The issue is CDN propagation delay, not missing purge. Retry loop handles this.
- **Auto-reconcile in `mission.validate`**: Rejected — too heavy. Auto-commit bordbuch is sufficient.

## Risks

- **`release.ready` rename breaks existing scripts**: Any script or CI template referencing `release.publish` will fail. This is intentional — clean break, no legacy.
- **Auto-recovery masks real issues**: If routes are genuinely broken (not just stale snapshot), auto-recovery will regenerate a snapshot of broken routes and return pass. The warning log is the only signal — operators and agents must review the diff after auto-recovery. This is the same risk as RFC-0689's auto-recovery for build failures.
- **Retry loop adds latency**: 5 attempts with 4 inter-attempt delays (3s/6s/12s/24s) can add up to ~45 seconds. This is acceptable compared to manual `--force` and potential wrong-version deploy.
- **Axiom gate in release path adds ~5 min**: mission.check takes 3–5 minutes. This is the cost of live verification before production deploy.
- **Auto-recovery performance cost**: `buildBehaviorSnapshot` scans all HTML files in `dist/client`. On SNAP-01 failure, auto-recovery runs it once more (regenerate). Total cost: 2x snapshot building (initial validate + regenerate). The subsequent `behavior.snapshot.generate` pipeline step is a no-op (file already matches).

## Acceptance criteria

- [x] `behavior.snapshot.validate` auto-recovers from SNAP-01 by regenerating snapshot in-place, logging warning, returning pass (evidence: packages/os/site-kernel-checks/src/behavior-snapshot.ts:467-490, packages/os/site-kernel-checks/src/tests/behavior-snapshot.test.ts:201-204)
- [x] `release.publish` renamed to `release.ready` with no backward compat alias (evidence: packages/os/site-kernel-handoff/src/release/index.ts:60, packages/os/site-kernel-handoff/src/release/release.module.ts:24-31)
- [x] `release.yaml` state field uses `ready` instead of `published` — all existing releases migrated (evidence: releases/*/release.yaml — all 13 files migrated, gitignored local state)
- [x] All code locations checking/setting `published` state updated to `ready` (propagate, promote, rollback, validate, autoStepReleaseState, candidate search) (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1534,1976,2304,2373; packages/os/site-kernel-handoff/src/release/release-commands.ts:622)
- [x] `leitstand.propagate` error messages include full remaining protocol commands (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1536-1541)
- [x] `leitstand.promote` error messages include full remaining protocol commands (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1976-1981)
- [x] `leitstand.dev-deploy --release` runs `mission.check` after deploy (Axiom gate mandatory) (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:741-815)
- [x] `leitstand.promote` retries build-identity fetch up to 5 times with exponential backoff (3s/6s/12s/24s) (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:2056-2058, verifyFreshness exported at line 289)
- [x] `mission.validate` auto-commits dirty bordbuch files on all paths (not just reuse path) (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:214-227)
- [x] All references to `release.publish` updated in code, AGENTS.md, CI templates, DNA-56 (evidence: packages/os/site-kernel-handoff/AGENTS.md:44,48,50,61,308; docs/architecture-dna.md:209,225,241; grep -r "release\.publish" AGENTS.md returns 0 active references)
- [x] `docs/verification-plan.xml` synchronized with release state rename (evidence: docs/verification-plan.xml — no release state "published" references found; only datePublished JSON-LD field and "Published material changes" unrelated to release state)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate --id RFC-0724 --json → 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- This RFC supersedes RFC-0700 (release path skip-Axiom behavior). RFC-0700's `--release` flag and release-deploy mechanics remain; only the skip-Axiom behavior is removed.
- This RFC amends RFC-0629 (evidence-metadata.json gate), RFC-0657 (retry loop), and RFC-0702 (bordbuch cleanup).
