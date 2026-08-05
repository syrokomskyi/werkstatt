---
id: RFC-0697
title: "Log cache dir size before clearing and extract shared SNAP-01 helper"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0689
amendedBy: []
related:
  - RFC-0628
  - RFC-0615
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - leitstand.dev-deploy
    - mission.materialize
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "leitstand.dev-deploy logs cache directory file count and total size before clearing"
  - "SNAP-01 detection and auto-regeneration logic is shared between leitstand.dev-deploy and mission.materialize via a single helper"
  - "No duplicated SNAP-01 detection code between the two callers"
nonGoals:
  - "Does not change the cache clearing logic itself — only adds logging before clearing"
  - "Does not change the SNAP-01 auto-regeneration behavior — only extracts shared code"
  - "Does not add new commands or pipeline steps"
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

# RFC-0697: Log cache dir size before clearing and extract shared SNAP-01 helper

## Context

RFC-0689 implemented two improvements to `leitstand.dev-deploy`: (1) clearing the Axiom browser evidence cache before `mission.check`, and (2) auto-regenerating the behavior snapshot when SNAP-01 is detected. The implementation also handles SNAP-01 detection during build-skip (RFC-0653) and build failure.

During the RFC-0689 implementation audit (2026-08-05), two improvement opportunities were identified:

1. **Cache clearing logs no size information.** The current log message is `"Cleared Axiom browser evidence cache before mission.check"` — it does not indicate how many files were in the cache or the total size. This makes it impossible to determine whether the cache was unusually large (indicating a problem) or empty (indicating a first run).

2. **SNAP-01 detection logic is duplicated.** `leitstand.dev-deploy` in `leitstand-commands.ts` and `mission.materialize` in `mission-materialization-commands.ts` both implement SNAP-01 detection, auto-regeneration, and re-build logic. The `autoRegenerateSnapshotOnSnap01` helper is already extracted to `snapshot-auto-regen.ts`, but the surrounding detection + re-build orchestration is duplicated.

## Problem

1. **No cache size logging:** When the Axiom cache is cleared, operators cannot determine if the cache was stale (large) or fresh (small/empty). This limits debugging when `mission.check` produces unexpected results after a cache clear.

2. **Duplicated SNAP-01 orchestration:** Both `leitstand.dev-deploy` and `mission.materialize` have their own SNAP-01 detection + re-build logic. Changes to one caller must be manually replicated in the other. The duplication is a maintenance burden and a source of drift.

## Decision

Two changes:

1. `leitstand.dev-deploy` logs the cache directory file count and total size before clearing it.

2. The SNAP-01 detection + auto-regeneration + re-build orchestration is extracted into a shared helper in `snapshot-auto-regen.ts`, used by both `leitstand.dev-deploy` and `mission.materialize`.

## Architectural fit

- **RFC-0689 (amended):** This RFC improves the implementation of RFC-0689 without changing its behavior. The cache clearing and snapshot auto-regeneration logic are unchanged.
- **RFC-0615 (mission.materialize):** `mission.materialize` already uses `autoRegenerateSnapshotOnSnap01` from `snapshot-auto-regen.ts`. This RFC extends the shared module to include the full orchestration loop.
- **RFC-0628 (leitstand.dev-deploy):** The deploy command uses the shared helper instead of inline logic.

## Design

### CLI surface

No new CLI commands. `leitstand.dev-deploy` and `mission.materialize` behavior is unchanged.

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/mission/snapshot-auto-regen.ts

// Existing exports (unchanged):
export function detectSnap01(data: unknown): boolean;
export async function autoRegenerateSnapshotOnSnap01(opts: AutoRegenerateOptions): Promise<AutoRegenerateResult>;

// New shared helper:
export interface Snap01OrchestrationOptions {
  workspaceRoot: string;
  systemId: string;
  missionId: string;
  logger: { info: (msg: string) => void; warn?: (msg: string) => void };
  /** Function to re-run the build after snapshot regeneration. */
  rebuildFn: () => Promise<void>;
  /** Function to validate the snapshot (returns data with diagnostics). */
  validateFn: () => Promise<unknown>;
}

export interface Snap01OrchestrationResult {
  regenerated: boolean;
  rebuildSucceeded: boolean;
  error?: string;
}

export async function orchestrateSnap01Recovery(
  opts: Snap01OrchestrationOptions,
): Promise<Snap01OrchestrationResult>;
```

```ts
// packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts

// Cache size logging before clearing:
import { readdirSync, statSync } from "node:fs";

function logCacheDirSize(cacheDir: string, logger: { info: (msg: string) => void }): void {
  try {
    const entries = readdirSync(cacheDir, { withFileTypes: true });
    let totalSize = 0;
    let fileCount = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        fileCount++;
        totalSize += statSync(join(cacheDir, entry.name)).size;
      }
    }
    logger.info(
      `[leitstand.dev-deploy] Axiom cache: ${fileCount} file(s), ${(totalSize / 1024 / 1024).toFixed(1)} MiB — clearing…`,
    );
  } catch {
    // Non-fatal — log nothing if we can't read the directory
  }
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/snapshot-auto-regen.ts` | Modified: add `orchestrateSnap01Recovery` shared helper |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Modified: use shared helper, add cache size logging |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Modified: use shared helper instead of inline SNAP-01 logic |
| `packages/os/site-kernel-handoff/src/tests/leitstand-0689-cache-snapshot.test.ts` | Modified: add test for cache size logging |

### Output format

Log output (not JSON — these are logger.info messages):

```
[leitstand.dev-deploy] Axiom cache: 47 file(s), 12.3 MiB — clearing…
[leitstand.dev-deploy] Cleared Axiom browser evidence cache before mission.check
```

### Failure modes

- **Cache size logging failure:** If `readdirSync` or `statSync` fails (permissions, race condition), the error is swallowed and no size is logged. The cache clearing proceeds normally.
- **Shared helper failure:** If `orchestrateSnap01Recovery` throws, the caller catches it and logs a warning (same as current behavior).

## Rollout

- **Default behavior on introduction:** `leitstand.dev-deploy` logs cache size before clearing. Both callers use the shared `orchestrateSnap01Recovery` helper.
- **Backward compatibility:** No behavior change — same cache clearing, same snapshot regeneration, same re-build logic.
- **No migration required:** No config or schema changes.
- **Pipeline integration:** No pipeline changes.

## Alternatives considered

1. **Log only file count (not total size).** Rejected — file count alone doesn't indicate if the cache was unusually large. A cache with 10 files of 500 MiB each is more concerning than 100 files of 1 KiB each.

2. **Extract only the SNAP-01 helper (not the full orchestration).** Rejected — the `autoRegenerateSnapshotOnSnap01` helper is already extracted, but the detection + re-build loop is the duplicated part. Extracting only the helper leaves the duplication.

3. **Add cache size logging as a separate RFC from SNAP-01 extraction.** Rejected — both improvements are small and address the same RFC-0689 implementation. Combining them reduces RFC overhead.

## Risks

- **`readdirSync` performance on large caches:** If the cache has thousands of files, `readdirSync` + `statSync` for each file could be slow. Mitigation: the cache is cleared every deploy, so it should not accumulate thousands of files. If it does, that's a separate problem worth investigating.
- **Shared helper API stability:** If a third caller needs SNAP-01 orchestration in the future, the `Snap01OrchestrationOptions` interface may need extension. Mitigation: the interface uses dependency injection (`rebuildFn`, `validateFn`), making it flexible for different callers.

## Acceptance criteria

- [ ] `leitstand.dev-deploy` logs cache file count and total size before clearing
- [ ] `orchestrateSnap01Recovery` shared helper exists in `snapshot-auto-regen.ts`
- [ ] `leitstand.dev-deploy` uses `orchestrateSnap01Recovery` instead of inline SNAP-01 logic
- [ ] `mission.materialize` uses `orchestrateSnap01Recovery` instead of inline SNAP-01 logic
- [ ] No duplicated SNAP-01 detection + re-build code between the two callers
- [ ] Existing tests pass (leitstand-0689-cache-snapshot.test.ts)
- [ ] New test case for cache size logging
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST use `readdirSync` + `statSync` for cache size logging (not async — the cache dir is small and this is a one-time read before `rm -rf`).
- Agents MUST swallow errors from `readdirSync`/`statSync` — cache size logging is non-fatal.
- Agents MUST use dependency injection (`rebuildFn`, `validateFn`) in `orchestrateSnap01Recovery` to keep the helper caller-agnostic.
- Agents MUST NOT change the cache clearing logic or the snapshot regeneration behavior.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
