---
id: RFC-0652
title: "Evidence lifecycle integration with mission close and dev deploy"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0650
  - RFC-0651
  - DNA-46
  - DNA-49
  - DNA-59
  - RFC-0628
  - RFC-0649
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-49
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
    - mission.cleanup
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.close invokes evidence.sync as mandatory step before writing close-report.json"
  - "leitstand.dev-deploy invokes evidence.sync after axiom.report (best-effort, non-blocking)"
  - "mission.cleanup removes local evidence runs older than configurable threshold"
  - "R2 archive contains evidence for every closed mission"
nonGoals:
  - "Does not define the R2 bucket layout or lifecycle rules — those are RFC-0650"
  - "Does not define the evidence.sync or evidence.fetch commands — those are RFC-0651"
  - "Does not change the Axiom gate logic in mission.check — that is RFC-0629 and RFC-0630"
  - "Does not change the CDN freshness verification in leitstand.dev-deploy — that is RFC-0649"
  - "Does not make evidence.sync blocking in leitstand.dev-deploy — sync is best-effort, non-blocking"
  - "Does not delete local evidence after sync — local evidence is cleaned by mission.cleanup based on age threshold"
  - "Does not integrate evidence.sync into mission.abort — aborted missions do not produce final evidence"
  - "Does not clean non-Axiom evidence artifacts (close-report.json, workpiece.git-bundle) — those are preserved unconditionally by mission.cleanup as permanent audit artifacts"
  - "Does not resolve concurrent evidence.sync from leitstand.dev-deploy and mission.close — R2 PutObject is idempotent (last writer wins); duplicate Iceberg rows are possible but non-fatal"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0652: Evidence lifecycle integration with mission close and dev deploy

## Context

RFC-0650 defined the R2 archive topology. RFC-0651 defined the `evidence.sync` and `evidence.fetch` commands. But neither RFC specifies **when** evidence sync happens in the mission lifecycle. Currently:

- `mission.close` (`mission-close.ts`) writes `close-report.json` to `evidence/` and creates a `workpiece.git-bundle`, but does not sync Axiom evidence to R2. If the operator forgets to run `evidence.sync` manually, the mission's Axiom evidence is lost when `mission.cleanup` removes the mission directory.
- `leitstand.dev-deploy` (`leitstand-commands.ts`) runs `mission.check --external-preview` and `axiom.report`, but does not sync the evidence to R2. Each dev deploy produces Axiom evidence that is ephemeral — overwritten by the next deploy.
- `mission.cleanup` (`mission-cleanup.ts`) preserves the `evidence/` directory (line 80: `skipped.push("evidence (preserved)")`), but never cleans it. Over time, local evidence accumulates indefinitely, consuming disk space.

The result: R2 archive exists, sync commands exist, but nothing wires them into the lifecycle. The operator must remember to run `evidence.sync` manually, which is unreliable.

## Problem

DNA-46 (Mission lifecycle) defines the mission as an ephemeral container with evidence, but does not specify when evidence is archived to durable storage. DNA-49 (Fleet propagation / Leitstand) defines `leitstand.dev-deploy` with Axiom gate verification, but does not specify that the verification results are preserved. Three gaps:

1. **No mandatory archival on mission close**: `mission.close` does not invoke `evidence.sync`. If the operator forgets, the mission's Axiom evidence is lost when `mission.cleanup` removes the mission directory. This is a manual discipline gap — the system relies on the operator remembering to sync.

2. **No auto-sync after dev deploy**: `leitstand.dev-deploy` runs `mission.check` and `axiom.report` but does not sync evidence to R2. Each dev deploy's Axiom results are ephemeral — the operator cannot compare results across deploys. This defeats the purpose of the R2 archive for the most frequent evidence-producing workflow.

3. **No local evidence retention policy**: `mission.cleanup` preserves evidence indefinitely (line 80). Over time, local evidence directories accumulate: 172 MB per run × multiple missions × multiple runs = significant disk usage. There is no age-based cleanup policy for local evidence, relying on R2 as the durable archive.

## Decision

`mission.close` invokes `evidence.sync` as a mandatory archival step before writing `close-report.json`. If `evidence.sync` fails, `mission.close` exits 1 with an `EVIDENCE_SYNC_FAILED` diagnostic — the mission cannot close without archiving evidence to R2. `leitstand.dev-deploy` invokes `evidence.sync` after `axiom.report` as a best-effort, non-blocking step — sync failure logs a warning but does not fail the deploy. `mission.cleanup` removes local evidence runs older than a configurable threshold (default: 30 days), relying on R2 as the durable archive. The `--evidence-retention-days` flag on `mission.cleanup` controls the threshold.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: `mission.close` is the terminal state of a mission. Adding mandatory `evidence.sync` ensures that no mission closes without its evidence being archived. This extends DNA-46 by making evidence preservation a close precondition, not a manual step.
- **DNA-49 (Fleet propagation / Leitstand)**: `leitstand.dev-deploy` runs the Axiom gate (RFC-0649) as a blocking quality gate. Adding best-effort `evidence.sync` after `axiom.report` extends DNA-49 by ensuring that every dev deploy's Axiom results — the verification record that gates deployment decisions — are preserved in R2 as durable history. This enables cross-deploy comparison and regression tracking, which the current ephemeral evidence model cannot provide. The sync is non-blocking because the Axiom gate is the quality gate; evidence sync is a post-hoc archival step that must not interfere with the deploy workflow.
- **DNA-59 (Evidence preservation)**: Established by RFC-0650. This RFC makes the preservation contract operational by wiring it into the lifecycle. After RFC-0650 is accepted and DNA-59 is appended to `docs/architecture-dna.md`, this RFC should add `DNA-59` to `satisfies[]` — it directly extends the invariant by making preservation a lifecycle-enforced behavior.
- **RFC-0650 (R2 archive topology)**: Defines the storage contract. This RFC defines when the storage is written to.
- **RFC-0651 (evidence.sync and evidence.fetch)**: Defines the sync and fetch commands. This RFC invokes those commands from lifecycle hooks.
- **RFC-0628 (dev deploy with Axiom gate)**: Integrated `mission.check` into `leitstand.dev-deploy`. This RFC adds `evidence.sync` as a post-step.
- **RFC-0649 (Axiom gate freshness)**: Made CDN freshness verification mandatory before the Axiom gate. This RFC preserves the gate's results after it runs.
- **Site OS operator model**: Changes are in `packages/os/site-kernel-handoff` (`mission-close.ts`, `mission-cleanup.ts`, `leitstand-commands.ts`). No new commands — only integration points.

## Design

### CLI surface

No new commands. Three existing commands gain new behavior:

```sh
# mission.close — now invokes evidence.sync before writing close-report.json
pnpm exec site-kernel run mission.close --mission warpgogol-com-m000025

# mission.close --skip-evidence-sync — opt-out flag for offline close (NOT recommended)
pnpm exec site-kernel run mission.close --mission warpgogol-com-m000025 --skip-evidence-sync

# mission.cleanup — now removes local evidence older than 30 days (default)
pnpm exec site-kernel run mission.cleanup --mission warpgogol-com-m000025

# mission.cleanup with custom retention
pnpm exec site-kernel run mission.cleanup --mission warpgogol-com-m000025 --evidence-retention-days 7

# mission.cleanup — preserve all evidence (current behavior)
pnpm exec site-kernel run mission.cleanup --mission warpgogol-com-m000025 --evidence-retention-days 0

# leitstand.dev-deploy — now auto-syncs evidence after axiom.report (best-effort)
pnpm exec site-kernel run leitstand.dev-deploy --mission warpgogol-com-m000025

# leitstand.dev-deploy — skip evidence sync
pnpm exec site-kernel run leitstand.dev-deploy --mission warpgogol-com-m000025 --skip-evidence-sync
```

### Integration points

#### mission.close

In `mission-close.ts`, before writing `close-report.json` (currently at line 363):

```ts
// 1. Sync evidence to R2 (mandatory)
const evidenceSynced = false;
let evidenceSyncResult: { r2KeyPrefix: string; uploadedFiles: number } | null = null;
if (!skipEvidenceSync) {
  const evidenceDir = path.join(missionDir, "evidence", "axiom");
  const metadataPath = path.join(evidenceDir, "evidence-metadata.json");
  if (existsSync(evidenceDir) && existsSync(metadataPath)) {
    try {
      const { executeKernelCommand } = await import("@warpgogol/site-kernel");
      const syncResult = await executeKernelCommand({
        workspaceRoot,
        commandName: "evidence.sync",
        argv: [`--mission=${missionId}`],
      });
      evidenceSynced = true;
      evidenceSyncResult = (syncResult as { data?: { r2KeyPrefix?: string; uploadedFiles?: number[] } }).data
        ? { r2KeyPrefix: (syncResult as any).data.r2KeyPrefix, uploadedFiles: (syncResult as any).data.uploadedFiles?.length ?? 0 }
        : null;
      logger.info("  Evidence synced to R2");
    } catch (syncError) {
      logger.error("  Evidence sync failed — mission cannot close without archiving evidence");
      throw new Error(`EVIDENCE_SYNC_FAILED: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
    }
  } else if (existsSync(evidenceDir)) {
    // evidence/axiom/ exists but no evidence-metadata.json — mission never ran mission.check
    logger.warn("  Evidence directory exists but evidence-metadata.json is missing — skipping sync (no Axiom evidence to archive)");
  }
}
// 2. Write close-report.json (existing code continues)
```

The `--skip-evidence-sync` flag is an escape hatch for offline close (e.g., no R2 credentials available). It logs a warning: "Evidence sync skipped — local evidence will be lost when mission.cleanup runs". When `--skip-evidence-sync` is used, `mission.close` appends a `mission-close-evidence-skipped` entry to the Bordbuch to make the escape hatch auditable — the operator can see which missions were closed without evidence archival.

#### leitstand.dev-deploy

In `leitstand-commands.ts`, after `axiom.report` completes (currently at line 820):

```ts
// After axiom.report, sync evidence to R2 (best-effort, non-blocking)
let evidenceSynced = false;
let evidenceSyncError: string | null = null;
if (!skipEvidenceSync) {
  try {
    const { executeKernelCommand: executeSync } = await import("@warpgogol/site-kernel");
    await executeSync({
      workspaceRoot,
      commandName: "evidence.sync",
      argv: [`--mission=${missionId}`],
    });
    evidenceSynced = true;
    logger.info("  Evidence synced to R2 (best-effort)");
  } catch (syncError) {
    // Non-fatal — deploy succeeds even if sync fails
    evidenceSyncError = syncError instanceof Error ? syncError.message : String(syncError);
    logger.warn(`  Evidence sync failed (non-blocking): ${evidenceSyncError}`);
  }
}
```

Sync failure does not fail the deploy. The operator can manually run `evidence.sync` later.

#### mission.cleanup

In `mission-cleanup.ts`, replace the current evidence preservation logic (line 80: `skipped.push("evidence (preserved)")`) with age-based cleanup. This applies to both `--mission` mode (single mission) and `--older-than` mode (batch cleanup). Non-Axiom evidence artifacts (`close-report.json`, `workpiece.git-bundle` in `evidence/`) are preserved unconditionally — only `evidence/axiom/` is subject to age-based cleanup.

```ts
const evidenceDir = path.join(missionDir, "evidence", "axiom");
if (existsSync(evidenceDir)) {
  const retentionDays = flags.evidenceRetentionDays ?? 30;
  if (retentionDays === 0) {
    skipped.push("evidence (preserved — retention=0)");
  } else {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    // Check evidence-metadata.json runTimestamp
    const metadataPath = path.join(evidenceDir, "evidence-metadata.json");
    if (existsSync(metadataPath)) {
      const metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
      const runTime = new Date(metadata.runTimestamp).getTime();
      if (runTime < cutoff) {
        await rm(evidenceDir, { recursive: true, force: true });
        cleaned.push(`evidence (older than ${retentionDays} days)`);
      } else {
        skipped.push("evidence (within retention period)");
      }
    } else {
      skipped.push("evidence (no metadata — preserved)");
    }
  }
} else {
  skipped.push("evidence/axiom (not present)");
}
// Non-Axiom evidence (close-report.json, workpiece.git-bundle) is always preserved
```

### TypeScript contracts

```ts
// mission.close — new flag
interface MissionCloseInput {
  missionId: string;
  skipEvidenceSync?: boolean; // default: false
}

// mission.cleanup — new flag
interface MissionCleanupInput {
  missionId: string;
  evidenceRetentionDays?: number; // default: 30, 0 = preserve all
}

// leitstand.dev-deploy — new flag
interface LeitstandDevDeployInput {
  missionId: string;
  skipEvidenceSync?: boolean; // default: false
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Invokes `evidence.sync` before `close-report.json` |
| `packages/os/site-kernel-handoff/src/mission/mission-cleanup.ts` | Age-based evidence cleanup instead of unconditional preservation |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Invokes `evidence.sync` after `axiom.report` (best-effort) |
| `packages/os/site-kernel-handoff/src/command-tables/infra-contracts.ts` | Documents `mission.close` writes (evidence.sync invocation), `mission.cleanup` writes (evidence cleanup), `leitstand.dev-deploy` writes (evidence.sync invocation) |
| `packages/os/site-kernel-handoff/AGENTS.md` | Documents evidence sync integration points |
| `AGENTS.md` | Documents that `mission.close` mandates evidence sync |

### Output format

No `--json` output format changes. The existing `mission.close`, `mission.cleanup`, and `leitstand.dev-deploy` output shapes are extended with new fields:

`mission.close --json` gains:

```json
{
  "data": {
    "evidenceSynced": true,
    "evidenceSyncResult": { "r2KeyPrefix": "...", "uploadedFiles": 7 }
  }
}
```

`mission.cleanup --json` gains:

```json
{
  "data": {
    "evidenceCleaned": true,
    "evidenceRetentionDays": 30
  }
}
```

`leitstand.dev-deploy --json` gains:

```json
{
  "data": {
    "evidenceSynced": true,
    "evidenceSyncError": null
  }
}
```

### Failure modes

| Failure | Behavior |
| --- | --- |
| `evidence.sync` fails during `mission.close` | `mission.close` exits 1 with `EVIDENCE_SYNC_FAILED` diagnostic. Mission remains open. Operator must fix R2 credentials or use `--skip-evidence-sync`. |
| `evidence.sync` fails during `leitstand.dev-deploy` | Logs warning, deploy continues. `evidenceSynced: false`, `evidenceSyncError: "..."` in JSON output. Non-fatal. |
| `--skip-evidence-sync` on `mission.close` | Logs warning: "Evidence sync skipped — local evidence will be lost when mission.cleanup runs". Appends `mission-close-evidence-skipped` entry to Bordbuch. Close proceeds. |
| `--skip-evidence-sync` on `leitstand.dev-deploy` | No sync attempted. No warning — this is an explicit operator choice. |
| `mission.cleanup` with `--evidence-retention-days 0` | Evidence preserved unconditionally (current behavior). No cleanup. |
| `mission.cleanup` — evidence-metadata.json missing | Evidence preserved. `skipped: "evidence (no metadata — preserved)"`. Cannot determine age without metadata. |
| `mission.cleanup` — non-Axiom evidence (close-report.json, git-bundle) | Always preserved unconditionally. Not subject to age-based cleanup. |
| `mission.close` — `evidence/axiom/` exists but `evidence-metadata.json` missing | Sync skipped with warning: "Evidence directory exists but evidence-metadata.json is missing — skipping sync". Close proceeds — mission never ran `mission.check`. |
| R2 credentials not set | `evidence.sync` fails with `MISSING_ENV`. In `mission.close`: fatal. In `leitstand.dev-deploy`: non-fatal warning. |
| Concurrent `evidence.sync` from `leitstand.dev-deploy` and `mission.close` | R2 PutObject is idempotent (last writer wins). Duplicate Iceberg rows possible but non-fatal — R2 objects are the primary store. |

## Rollout

- **Dependency**: This RFC cannot be accepted or implemented until RFC-0650 (R2 archive topology) and RFC-0651 (evidence.sync and evidence.fetch) are both `accepted` (or `implemented`). Without `evidence.sync` (RFC-0651) and `runTimestamp` in `evidence-metadata.json` (RFC-0650), this RFC has nothing to invoke.
- **Default behavior**: `mission.close` mandates `evidence.sync`. `leitstand.dev-deploy` auto-syncs evidence (best-effort). `mission.cleanup` cleans evidence older than 30 days.
- **Grace period**: The `--skip-evidence-sync` flag on `mission.close` and `leitstand.dev-deploy` allows the operator to opt out during the initial rollout (e.g., before R2 bucket is set up). This is a temporary escape hatch, not a permanent workflow.
- **R2 bucket prerequisite**: The operator must have created the R2 bucket and set credentials (RFC-0650, RFC-0651). If credentials are not set, `mission.close` fails with `EVIDENCE_SYNC_FAILED` — the operator must either set credentials or use `--skip-evidence-sync`.
- **Existing missions**: Missions opened before implementation are not affected — `mission.close` only syncs if `evidence/axiom/evidence-metadata.json` exists with `runTimestamp`. Missions with old-format evidence (no `runTimestamp`) are skipped with a warning.
- **New missions**: Automatically compliant — `mission.check` writes `runTimestamp` (RFC-0650), `mission.close` syncs to R2, `mission.cleanup` cleans old local evidence.
- `mission.cleanup` retention: Default 30 days. Configurable per-cleanup via `--evidence-retention-days`. The operator can set `0` to preserve all (backward compatible with current behavior). Applies to both `--mission` mode (single mission) and `--older-than` mode (batch cleanup).
- **`--older-than` mode**: `mission.cleanup --older-than <N>d` removes workpiece and distribution for closed missions older than the threshold. After this RFC, it also applies age-based evidence cleanup using `--evidence-retention-days` (default 30d). `--older-than` determines which missions to clean; `--evidence-retention-days` determines which evidence within those missions to clean.
- **Non-Axiom evidence**: `close-report.json` and `workpiece.git-bundle` in `evidence/` (not `evidence/axiom/`) are preserved unconditionally by `mission.cleanup` — they are permanent audit artifacts, not subject to age-based cleanup.
- **No deprecation**: `mission.cleanup`'s unconditional preservation is replaced with age-based cleanup, but `--evidence-retention-days 0` restores the old behavior.
- **AGENTS.md**: Updated to document that `mission.close` mandates evidence sync and `mission.cleanup` cleans old evidence.

## Alternatives considered

1. **Optional evidence sync in mission.close**: Make `evidence.sync` opt-in via a `--sync-evidence` flag instead of mandatory. Rejected because the operator explicitly wants full history preservation — an opt-in flag would rely on manual discipline, which is the current problem. Making it mandatory ensures no evidence is lost.

2. **Blocking evidence sync in leitstand.dev-deploy**: Make `evidence.sync` a blocking step in `leitstand.dev-deploy` — if sync fails, the deploy fails. Rejected because dev deploys should not be blocked by storage issues. The Axiom gate (RFC-0649) is the blocking quality gate; evidence sync is a post-hoc archival step. Best-effort is the right semantic.

3. **Cron-based evidence sync**: Run `evidence.sync` on a schedule (e.g., every hour) instead of integrating into lifecycle hooks. Rejected because it adds a cron dependency, introduces latency (evidence not synced until the next cron tick), and requires a daemon process. Lifecycle integration is simpler and more reliable.

4. **mission.cleanup deletes all evidence immediately after close**: Delete local evidence as soon as `mission.close` syncs to R2. Rejected because the operator may need to inspect evidence locally right after close (e.g., review findings before approving a release). 30-day retention gives a reasonable local window while R2 holds the full history.

5. **Separate evidence.cleanup command**: Create a new `evidence.cleanup` command instead of modifying `mission.cleanup`. Rejected because `mission.cleanup` already handles evidence directory preservation — it is the natural place for age-based cleanup. Adding a separate command increases the command surface without value.

## Risks

- **mission.close blocked by R2 outage**: If R2 is unavailable when `mission.close` runs, the close fails with `EVIDENCE_SYNC_FAILED`. Risk: the operator cannot close a mission during an R2 outage. Mitigation: `--skip-evidence-sync` allows offline close. The operator can sync manually later via `evidence.sync`.

- **mission.close latency increase**: 172 MB upload (~17 seconds on a typical home internet connection) is now a mandatory blocking step in `mission.close`. Risk: `mission.close` already takes time for validation, bordbuch commit, and materialization state writes. Adding ~17 seconds for evidence upload increases the total close time. Mitigation: the upload is proportional to evidence size — if `mission.check` was not run (no Axiom evidence), the sync is skipped entirely. The operator should be aware that the first `mission.close` after implementation will take longer.

- **Upload time in leitstand.dev-deploy**: 172 MB upload (~17 seconds) adds latency to every dev deploy. Risk: acceptable — sync is non-blocking, and the deploy result is already available before sync starts. The operator does not wait for sync to complete.

- **mission.cleanup deletes evidence too aggressively**: If `--evidence-retention-days` is set too low (e.g., 1), evidence is deleted before the operator has a chance to review it. Mitigation: default is 30 days. The operator must explicitly set a low value.

- **Agent misinterpretation**: Agents may use `--skip-evidence-sync` routinely to avoid the sync step. AGENTS.md must state that `--skip-evidence-sync` is an escape hatch for offline scenarios, not a regular workflow. Agents MUST NOT use it unless R2 credentials are unavailable.

- **Backward compatibility**: `mission.cleanup` currently preserves evidence unconditionally. After implementation, it deletes evidence older than 30 days. Risk: operators with existing missions may lose evidence they expected to be preserved. Mitigation: `--evidence-retention-days 0` restores the old behavior. The default 30-day window gives operators time to adjust.

- **Concurrent evidence.sync**: If `leitstand.dev-deploy` is running its best-effort sync while `mission.close` is invoked for the same mission, both attempt to upload to the same R2 key prefix. R2 PutObject is idempotent for the same key (last writer wins), so the final R2 state is consistent. However, the Iceberg table may receive duplicate rows. Mitigation: duplicate Iceberg rows are non-fatal — R2 objects are the primary store, and the Iceberg table is a query index. A future RFC can add deduplication if needed.

- **Circular dependency**: `mission.close` invokes `evidence.sync`, which reads from `evidence/axiom/`. `evidence.sync` does not invoke `mission.close`. No circular dependency — `evidence.sync` is a leaf command that only reads files and uploads to R2.

## Acceptance criteria

- [x] `mission.close` invokes `evidence.sync` before writing `close-report.json` (evidence: `packages/os/site-kernel-handoff/src/mission/mission-close.ts:372-443`)
- [x] `mission.close` exits 1 with `EVIDENCE_SYNC_FAILED` diagnostic when `evidence.sync` fails (evidence: `src/tests/rfc-0652-mission-close-evidence-sync.test.ts` test "mission.close throws EVIDENCE_SYNC_FAILED when evidence.sync fails")
- [x] `mission.close --skip-evidence-sync` skips sync, logs warning, and appends `mission-close-evidence-skipped` entry to Bordbuch (evidence: `src/tests/rfc-0652-mission-close-evidence-sync.test.ts` test "mission.close --skip-evidence-sync skips sync and does not call evidence.sync")
- [x] `mission.close` skips sync with warning when `evidence/axiom/` exists but `evidence-metadata.json` is missing (evidence: `src/tests/rfc-0652-mission-close-evidence-sync.test.ts` test "mission.close skips sync with warning when evidence/axiom/ exists but metadata missing")
- [x] `mission.close --json` includes `evidenceSynced` and `evidenceSyncResult` fields (evidence: `src/tests/rfc-0652-mission-close-evidence-sync.test.ts` test "mission.close --json includes evidenceSynced and evidenceSyncResult fields")
- [x] `leitstand.dev-deploy` invokes `evidence.sync` after `axiom.report` (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:835-857`)
- [x] `leitstand.dev-deploy` does not fail when `evidence.sync` fails (evidence: `src/tests/rfc-0652-leitstand-dev-deploy-evidence-sync.test.ts` test "leitstand.dev-deploy does not fail when evidence.sync fails")
- [x] `leitstand.dev-deploy --json` includes `evidenceSynced` and `evidenceSyncError` fields (evidence: `src/tests/rfc-0652-leitstand-dev-deploy-evidence-sync.test.ts` test "leitstand.dev-deploy --json includes evidenceSynced and evidenceSyncError fields")
- [x] `leitstand.dev-deploy --skip-evidence-sync` skips sync silently (evidence: `src/tests/rfc-0652-leitstand-dev-deploy-evidence-sync.test.ts` test "leitstand.dev-deploy --skip-evidence-sync skips sync silently")
- [x] `mission.cleanup` removes evidence older than 30 days by default in `--mission` mode (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup removes evidence older than 30 days by default in --mission mode")
- [x] `mission.cleanup --evidence-retention-days 7` removes evidence older than 7 days (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup --evidence-retention-days 7 removes evidence older than 7 days")
- [x] `mission.cleanup --evidence-retention-days 0` preserves all evidence (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup --evidence-retention-days 0 preserves all evidence")
- [x] `mission.cleanup` preserves evidence when `evidence-metadata.json` is missing (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup preserves evidence when evidence-metadata.json is missing")
- [x] `mission.cleanup` preserves non-Axiom evidence (`close-report.json`, `workpiece.git-bundle`) unconditionally (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup preserves non-Axiom evidence (close-report.json)")
- [x] `mission.cleanup --older-than <N>d` applies age-based evidence cleanup using `--evidence-retention-days` (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup --older-than applies age-based evidence cleanup")
- [x] `mission.cleanup --json` includes `evidenceCleaned` and `evidenceRetentionDays` fields (evidence: `src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts` test "mission.cleanup --json includes evidenceCleaned and evidenceRetentionDays fields")
- [x] `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` documents evidence.sync invocations in `mission.close` and `leitstand.dev-deploy` writes (evidence: `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts:39-44`)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` documents evidence sync integration points (evidence: `packages/os/site-kernel-handoff/AGENTS.md:34,115,118`)
- [x] `AGENTS.md` documents that `mission.close` mandates evidence sync and `--skip-evidence-sync` is an escape hatch (evidence: `AGENTS.md:222-223`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0652` exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT implement this RFC until RFC-0650 and RFC-0651 are both `accepted` (or `implemented`). Without `evidence.sync` (RFC-0651) and `runTimestamp` in `evidence-metadata.json` (RFC-0650), this RFC has nothing to invoke.
- Agents MUST NOT use `--skip-evidence-sync` routinely — it is an escape hatch for offline scenarios (no R2 credentials), not a regular workflow. Agents MUST NOT use it unless `evidence.sync` fails with `MISSING_ENV`.
- Agents MUST NOT invoke `evidence.sync` independently after `mission.check` — it is invoked by `mission.close` (mandatory) and `leitstand.dev-deploy` (best-effort) per this RFC. Agents MAY invoke `evidence.sync` manually when explicitly asked by the operator.
- Agents MUST NOT set `--evidence-retention-days` to 0 in `mission.cleanup` unless explicitly asked by the operator — the default 30-day retention is the policy.
- Agents MUST NOT weaken the mandatory evidence sync in `mission.close` — if `evidence.sync` fails, the mission MUST NOT close (unless `--skip-evidence-sync` is explicitly used).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
