---
id: RFC-0616
title: "Re-entrant werkstatt locks by PID"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-31
updatedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0362
  - RFC-0556
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-51
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
    - acquireLock
    - releaseLock
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "release.prepare no longer deadlocks when bordbuch.generate acquires the same system lock"
  - "werkstatt-lock tests cover re-entrant acquire and release by same PID"
  - "depth field is required in werkstattLockSchema"
nonGoals:
  - "Cross-process lock re-entrancy (only same-PID re-entrancy is in scope)"
  - "Lock inheritance or child-process lock delegation"
  - "Changing the lock scope naming convention"
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

# RFC-0616: Re-entrant werkstatt locks by PID

## Context

Werkstatt locks (RFC-0362, DNA-51) prevent concurrent mutations of shared system resources. `acquireLock` writes a JSON lock file to `.werkstatt/locks/<scope>.lock.json`; `releaseLock` deletes it. If a lock file exists and is not stale, `acquireLock` throws `[werkstatt.lock] lock '<scope>' held by operation '<opId>' (pid: <pid>)`.

Several kernel commands acquire a `system:<id>` lock and then invoke pipeline phases that contain sub-commands which independently acquire the same `system:<id>` lock. The most prominent case: `release.prepare` acquires `system:warpgogol-com`, then the `build.prepare` pipeline runs `bordbuch.generate`, which also acquires `system:warpgogol-com`. Because the lock is not re-entrant, the inner acquire throws, aborting the release.

This was discovered during the `warpgogol-com-m000022` release cycle (2026-07-31). The operator had to patch `acquireLock`/`releaseLock` mid-release to proceed.

## Problem

`acquireLock` does not distinguish between a lock held by the **same process** and one held by a **different process**. Any existing non-stale lock causes a throw, regardless of whether the caller is the original holder or a different process. This makes the locking mechanism non-re-entrant: a command that holds a lock cannot delegate to a sub-command or pipeline phase that needs the same lock.

This breaks the composition model where outer commands (`release.prepare`, `mission.reconcile`) hold `system:<id>` locks and inner pipeline commands (`bordbuch.generate`) independently acquire the same scope.

DNA-51 states that Werkstatt commands use shared lock primitives. The current primitives are correct for inter-process exclusion but incorrect for intra-process composition.

## Decision

`acquireLock` and `releaseLock` are re-entrant by PID: when the same process re-acquires a lock it already holds, `acquireLock` increments a `depth` counter instead of throwing; `releaseLock` decrements `depth` and only deletes the lock file when `depth` reaches zero. The `werkstattLockSchema` gains a required `depth: number().int().positive()` field. The original `operationId` and `command` of the outermost acquire are preserved across re-entrant acquires.

## Architectural fit

- **DNA-51** (Werkstatt consistency primitives) — this RFC extends the lock primitive to support intra-process composition without weakening inter-process exclusion. The lock still prevents concurrent mutations from different processes; it now correctly allows nested acquisitions from the same process.
- **RFC-0362** — original lock/idempotency/atomic state RFC. This RFC amends the lock behavior without changing the scope naming convention or the stale-detection logic.
- **RFC-0556** — forge autonomous mode inlined the lock handler into `packages/forge/os/werkstatt/handlers/lock.ts`. The schema is duplicated in both `packages/forge/os/werkstatt/handlers/schema.ts` and `packages/ontology/src/operations/werkstatt.ts`; both must be updated.
- **Pipeline composition model** — `release.prepare`, `mission.reconcile`, and other outer commands hold `system:<id>` locks while delegating to `runPipelinePhase`, which runs sub-commands that independently acquire the same scope. Re-entrant locks make this composition safe.

## Design

### CLI surface

No new CLI commands. The change is internal to `acquireLock`/`releaseLock` handlers. Existing commands that call these functions benefit automatically.

### TypeScript contracts

The `WerkstattLock` type gains a required `depth` field:

```ts
export const werkstattLockSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  scope: z.string().min(1),
  operationId: z.string().min(1),
  command: z.string().min(1),
  owner: z.string().min(1),
  pid: z.number().int(),
  startedAt: z.string().datetime(),
  heartbeatAt: z.string().datetime(),
  timeoutSeconds: z.number().positive(),
  depth: z.number().int().positive(),
});
```

`acquireLock` behavior:

```ts
// Pseudo-code for the re-entrant path
if (existsSync(lockPath)) {
  const existing = parse(raw);
  if (existing.pid === process.pid && !isLockStale(existing)) {
    // Re-entrant: increment depth, preserve operationId + command,
    // update heartbeatAt
    const updated = {
      ...existing,
      depth: existing.depth + 1,
      heartbeatAt: new Date().toISOString(),
    };
    await writeFile(lockPath, JSON.stringify(updated, null, 2) + "\n");
    return updated;
  }
  if (!isLockStale(existing)) {
    throw new Error(`[werkstatt.lock] lock '${scope}' held by ...`);
  }
  // stale: overwrite with depth=1
}
// New lock: write with depth=1
```

`releaseLock` behavior:

```ts
if (existsSync(lockPath)) {
  const lock = parse(raw);
  if (lock.pid === process.pid && lock.depth > 1) {
    // Re-entrant release: decrement, do not delete
    const decremented = { ...lock, depth: lock.depth - 1 };
    await writeFile(lockPath, JSON.stringify(decremented, null, 2) + "\n");
    return;
  }
  // Final release: delete file
  await unlink(lockPath);
}
```

### File system responsibilities

| Path                                              | Role                                       |
| ------------------------------------------------- | ------------------------------------------ |
| `packages/forge/os/werkstatt/handlers/lock.ts`    | `acquireLock`/`releaseLock` implementation |
| `packages/forge/os/werkstatt/handlers/schema.ts`  | Inlined `werkstattLockSchema` (RFC-0556)   |
| `packages/ontology/src/operations/werkstatt.ts`   | Canonical `werkstattLockSchema`            |
| `packages/forge/src/tests/werkstatt-lock.test.ts` | Unit tests for lock behavior               |
| `.werkstatt/locks/<scope>.lock.json`              | Runtime lock file (now includes `depth`)   |

### Output format

No CLI output changes. Lock files on disk now include `depth: <N>`.

### Failure modes

- **Different process holds lock**: `acquireLock` throws `[werkstatt.lock] lock '<scope>' held by operation '<opId>' (pid: <pid>)` — unchanged behavior.
- **Same process re-acquires**: `acquireLock` increments `depth`, returns updated lock object. No error.
- **Same process releases with depth > 1**: `releaseLock` decrements `depth`, writes updated file. Lock file remains on disk.
- **Same process releases with depth = 1**: `releaseLock` deletes lock file.
- **Stale lock (different PID, dead or timed out)**: `acquireLock` overwrites with a new lock at `depth=1`.
- **Corrupt lock file (invalid JSON or schema)**: `acquireLock` falls through to the stale/corrupt path and overwrites.
- **Old lock file without `depth` field**: Schema parse fails; `acquireLock` treats it as corrupt and overwrites with a new lock at `depth=1`.

## Rollout

- **No migration path.** Old lock files without `depth` are treated as corrupt and overwritten on next acquire. This is a forward-only monorepo — no legacy compatibility layer.
- The fix is already applied in the codebase (commit `0896e17`). This RFC documents the decision retroactively.
- All existing tests pass with the updated schema and re-entrant behavior.
- No pipeline changes needed — commands that already call `acquireLock`/ `releaseLock` benefit automatically.
- `release.prepare` and `mission.reconcile` now work correctly when their pipeline sub-commands acquire the same `system:<id>` scope.

## Alternatives considered

1. **Pass lock ownership through pipeline phases** — Instead of making locks re-entrant, pass the acquired lock object to `runPipelinePhase` and have sub-commands check whether the lock is already held by the caller. Rejected: requires changing every pipeline phase signature and every sub-command that acquires locks. High blast radius for a narrow problem.

2. **Remove lock acquisition from `bordbuch.generate`** — Since `release.prepare` already holds the `system:<id>` lock, the inner command could skip locking entirely when called from a pipeline. Rejected: `bordbuch.generate` is also called standalone (outside `release.prepare`). Removing its lock would break standalone usage.

3. **Use a global in-memory lock registry** — Track acquired locks in a `Map<scope, depth>` per process instead of relying on file-based depth. Rejected: the lock is file-based for inter-process visibility; an in-memory registry would diverge from the on-disk state and complicate stale detection.

## Risks

- **Unbalanced release** — If a command acquires re-entrantly but crashes before the matching `releaseLock`, the lock file remains with `depth > 1`. The stale-detection logic (`isLockStale`) still applies: if the process dies, the lock becomes stale and the next acquire overwrites it. This is the same recovery behavior as depth=1 locks.
- **Agent confusion** — Agents might assume `acquireLock` always throws on an existing lock. The AGENTS.md rule for `packages/forge` should document the re-entrant behavior.
- **Schema duplication** — `werkstattLockSchema` exists in both `packages/forge/os/werkstatt/handlers/schema.ts` and `packages/ontology/src/operations/werkstatt.ts`. Both must stay in sync. This is an existing constraint from RFC-0556, not new.

## Acceptance criteria

- [x] `depth` field added as required to `werkstattLockSchema` in both `packages/forge/os/werkstatt/handlers/schema.ts` and `packages/ontology/src/operations/werkstatt.ts` (evidence: commit 0896e17)
- [x] `acquireLock` increments `depth` and preserves original `operationId`/`command` when same PID re-acquires (evidence: packages/forge/os/werkstatt/handlers/lock.ts:67-71)
- [x] `releaseLock` decrements `depth` and only deletes the lock file at `depth=1` (evidence: packages/forge/os/werkstatt/handlers/lock.ts:107-112)
- [x] Unit tests cover re-entrant acquire, re-entrant release, and cross-PID blocking (evidence: packages/forge/src/tests/werkstatt-lock.test.ts:128-149,208-221)
- [x] `release.prepare` completes without lock deadlock when `bordbuch.generate` runs inside `build.prepare` (evidence: warpgogol-com-r000004 release 2026-07-31)
- [x] `pnpm --filter @warpgogol/forge test` passes — 346 tests (evidence: 2026-07-31 run)
- [x] `pnpm --filter @warpgogol/forge build:check` passes (evidence: 2026-07-31 run)
- [x] `pnpm --filter @warpgogol/ontology build:check` passes (evidence: 2026-07-31 run)
- [x] `rfc.validate` passes on this file (evidence: this validation run)

## Implementation notes for agents

- The fix is already applied in the codebase (commit `0896e17`). This RFC documents the decision retroactively and must be accepted to formalize it.
- Agents MUST update `depth` in both schema locations (`packages/forge/os/werkstatt/handlers/schema.ts` and `packages/ontology/src/operations/werkstatt.ts`) when modifying the lock schema. They must stay in sync.
- Agents MUST NOT add `.optional()` to the `depth` field — it is required. Old lock files without `depth` are corrupt and overwritten.
- Agents MUST preserve the original `operationId` and `command` when incrementing `depth` in a re-entrant acquire. Do not overwrite them with the inner command's values.
- Agents MUST NOT weaken or remove the re-entrant behavior without a new RFC that supersedes this one.
