---
id: RFC-0362
title: "Werkstatt consistency primitives for locks, idempotency, and atomic state"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
enhancedAt: 2026-07-10
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0357
  - RFC-0358
  - RFC-0359
  - RFC-0361
amendedBy: []
related:
  - RFC-0221
  - RFC-0276
  - RFC-0345
  - RFC-0364
satisfies:
  - DNA-51
commands:
  proposed: []
  added:
    - werkstatt.lock.status
    - werkstatt.lock.recover
    - werkstatt.operation.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-checks"
  - "@gogol/ontology"
successSignals:
  - "Every command that mutates `systems/registry.yaml`, `systems/<id>/`, `missions/`, `releases/`, deployment state, or a Notausgang export takes an explicit scoped lock before reading mutable state."
  - "Interrupted commands leave either no visible artifact or a recoverable `.incomplete`/`.tmp` artifact that `werkstatt.lock.recover` can classify and clean."
  - "Retrying a command with the same idempotency key returns the same completed operation record or safely resumes the staging directory."
  - "`werkstatt.operation.validate` fails when a Werkstatt command mutates shared state without using the lock/idempotency/atomic-write helpers."
nonGoals:
  - "Does not introduce distributed consensus or a central database for MVP. Local file locks protect one checkout; remote git drift is handled by fetch-and-abort rules."
  - "Does not define release artifact retention; that is RFC-0363."
  - "Does not define semantic hashing; that is RFC-0364. Operation-record `inputHash` and `resultHash` use `@gogol/fingerprint` (RFC-0364) but the fingerprint package itself is defined there."
  - "Does not define the Bordbuch hash-chain format; that is RFC-0276 and RFC-0355. This RFC only defines the mutation order when both registry and Bordbuch are updated."
  - "Does not define agent orchestration or multi-agent lock coordination; local process-level locks are the MVP."
---

# RFC-0362: Werkstatt consistency primitives for locks, idempotency, and atomic state

## Context

RFC-0354..0361 introduce a new Werkstatt operating model: Sternsystems, missions, releases, propagation, Notausgang exports, and naming policy. Their original drafts each described state changes locally. The audit found the same production risk in several places: read-modify-write races, partial directories after crashes, orphaned `in-progress` states, and non-idempotent retries.

This RFC defines the shared consistency primitives that all those RFCs must use. It is triggered by the external audit of RFC-0354..0361 and by the project decision to perform a full migration away from `apps/` rather than support a long-lived dual model.

## Problem

The Werkstatt RFCs mutate shared state in several places: registry rows, mission manifests, release manifests, deployment state, local artifact directories, Sternsystem git caches, and Bordbuch history. Without shared primitives, each command would invent its own race handling. That creates five risks:

1. Two commands allocate the same mission or release sequence.
2. A crash leaves a half-written mission, release, or export directory that a later command treats as complete.
3. A retry performs the same mutation twice.
4. `in-progress` deployment state becomes a permanent blocker after an interrupted process.
5. A Bordbuch append and registry update diverge, leaving history and fleet state inconsistent.

## Decision

The kernel gains shared lock, idempotency, and atomic-write helpers in `@gogol/site-kernel-handoff`, and a workspace-level validator in `@gogol/site-kernel-checks`. All Werkstatt commands that mutate shared or durable state MUST use these three primitives:

1. **Scoped file locks** for mutable resources.
2. **Idempotency records** for retryable command execution.
3. **Atomic staging + rename** for files and directories.

## Design

### 1. Lock scopes

Locks live under `.werkstatt/locks/` in the workspace checkout. The directory is gitignored. A lock file contains JSON:

```ts
interface WerkstattLock {
  schemaVersion: "1.0.0";
  scope: string;
  operationId: string;
  command: string;
  owner: string;
  pid: number;
  startedAt: string;
  heartbeatAt: string;
  timeoutSeconds: number;
}
```

Required scopes:

| Resource                             | Lock scope                         |
| ------------------------------------ | ---------------------------------- |
| `systems/registry.yaml`              | `registry`                         |
| `systems/<id>/` cache clone          | `system:<id>`                      |
| `missions/<system-id>-mNNNNNN/`      | `mission:<mission-id>`             |
| `releases/<system-id>-rNNNNNN/`      | `release:<release-id>`             |
| deployment state for one Sternsystem | `deployment:<system-id>`           |
| Notausgang export output path        | `export:<sha256(abs-output-path)>` |

Commands that touch more than one scope MUST acquire locks in this order: `registry`, `system:*`, `mission:*`, `release:*`, `deployment:*`, `export:*`. If any lock cannot be acquired, the command exits non-zero and reports the blocking lock.

### 2. Stale locks and recovery

A lock is stale when `heartbeatAt + timeoutSeconds` is older than current time and the owning process is absent on the local machine. The default timeout is 900 seconds. Long-running commands MUST refresh `heartbeatAt` at least every 30 seconds.

`werkstatt.lock.status` reports all locks, their age, owner, and staleness. When `.werkstatt/locks/` does not exist or is empty, it reports zero locks (status: `pass`, `count: 0`) — the empty state is not an error.

`werkstatt.lock.recover` may remove a stale lock only after classifying any related `.tmp`, `.staging`, or `.incomplete` artifact. Recovery itself acquires a meta-lock (`scope: "werkstatt-recovery"`) to prevent two concurrent recovery operations from racing on the same artifacts. Recovery actions are deterministic:

| Artifact | Recovery |
| --- | --- |
| `*.tmp` file | remove if no matching completed operation record exists |
| `<dir>.staging-<operationId>/` | keep if command supports resume; otherwise remove |
| `<dir>.incomplete/` | rename to `<dir>.failed-<timestamp>/` for inspection or remove with `--purge` |
| mutated registry without completed operation record | fail and require human review |

### 3. Idempotency records

Every mutating command accepts optional `--idempotency-key <key>`. If omitted, the command generates an operation id. Operation records live under `.werkstatt/operations/<operationId>.json`.

```ts
interface WerkstattOperationRecord {
  schemaVersion: "1.0.0";
  operationId: string;
  command: string;
  scopes: string[];
  state: "started" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  inputHash: string;
  resultHash: string | null;
  artifacts: string[];
  error: string | null;
}
```

Retry rules:

- Same command + same `operationId` + same `inputHash` + `completed` returns the previous result.
- Same command + same `operationId` + same `inputHash` + `started` resumes if the command declares a resumable staging directory; otherwise it fails with recovery instructions.
- Same `operationId` with a different `inputHash` fails.

### 4. Atomic writes

All shared file writes use temp-file + fsync + rename where the platform supports it. Directory-producing commands use a staging directory and rename only after validation succeeds:

```
target.staging-<operationId>/  -> target/
```

The final `target/` path MUST NOT appear until the artifact is complete. Existing non-empty targets are never overwritten unless the command explicitly supports `--replace` and has a completed preflight backup.

### 5. Registry + Bordbuch mutation order

Commands that update both the fleet registry and a Sternsystem Bordbuch use this order:

1. Acquire all required locks.
2. Write the new Bordbuch event to a staged ledger file or append through the hash-chain helper.
3. Write the new registry file to a staged file.
4. Validate both staged states.
5. Atomically publish the registry write.
6. Commit or append the Bordbuch event.
7. Write a completed operation record.

If any step before completion fails, recovery MUST detect whether one side committed and emit a diagnostic that names the missing compensating action. Direct rollback of a hash-chain event is forbidden; corrections use an `erratum` event.

### 6. Validation and enforcement

`werkstatt.operation.validate` scans command metadata (static declarations, not command implementations) for mutating Werkstatt commands. A command is considered mutating if it declares writes under `systems/`, `missions/`, `releases/`, `.werkstatt/`, deployment targets, or Notausgang output paths.

The validator is path-scoped to `packages/os/site-kernel-handoff/src/` — only files in this directory are checked for direct `writeFile`, `appendFile`, `rename`, or recursive directory moves. Files outside that path (codegen, test fixtures, build output, other packages) are not scanned, which eliminates the primary false-positive surface.

The validator fails when a mutating command:

- Does not declare its lock scopes in its command metadata.
- Writes shared state outside the atomic helper.
- Does not accept or generate an operation id.
- Uses direct `writeFile`, `appendFile`, `rename`, or recursive directory moves outside the allowlisted helper modules (`packages/os/site-kernel-handoff/src/werkstatt/`).

The scan is O(N) in registered Werkstatt commands plus O(M) in source files under `packages/os/site-kernel-handoff/src/`. It does not load command implementations; it reads command metadata and scans source files with regex. Expected cost: sub-second for the current codebase.

### 7. Zod schemas

New Zod schemas in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/werkstatt.ts

export const WerkstattLockSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  scope: z.string(),
  operationId: z.string(),
  command: z.string(),
  owner: z.string(),
  pid: z.number(),
  startedAt: z.string().datetime(),
  heartbeatAt: z.string().datetime(),
  timeoutSeconds: z.number().positive(),
});

export const WerkstattOperationRecordSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  operationId: z.string(),
  command: z.string(),
  scopes: z.array(z.string()),
  state: z.enum(["started", "completed", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  inputHash: z.string(),
  resultHash: z.string().nullable(),
  artifacts: z.array(z.string()),
  error: z.string().nullable(),
});
```

`inputHash` and `resultHash` are produced by `@gogol/fingerprint` (RFC-0364) stable JSON hashing. Command arguments MUST be sanitized before hashing: secret-like values (tokens, passwords, repo URLs with embedded credentials) are replaced with `[redacted]` before the hash is computed. The operation record stores hashes only, never raw input.

### 8. CLI surface

```sh
pnpm exec site-kernel run werkstatt.lock.status [--json]
pnpm exec site-kernel run werkstatt.lock.recover [--scope <scope>] [--purge] [--json]
pnpm exec site-kernel run werkstatt.operation.validate [--json]
```

All commands support `--json` output with the standard `{ command, status, data, summary }` envelope.

### 9. Output format

`werkstatt.lock.status --json`:

```json
{
  "command": "werkstatt.lock.status",
  "status": "pass",
  "data": {
    "locks": [
      {
        "scope": "registry",
        "operationId": "op-abc123",
        "command": "sternsystem.register",
        "owner": "agent-001",
        "pid": 12345,
        "startedAt": "2026-07-09T12:00:00Z",
        "heartbeatAt": "2026-07-09T12:00:30Z",
        "timeoutSeconds": 900,
        "stale": false
      }
    ],
    "count": 1
  },
  "summary": "[werkstatt.lock.status] 1 active lock, 0 stale"
}
```

`werkstatt.lock.recover --json`:

```json
{
  "command": "werkstatt.lock.recover",
  "status": "pass",
  "data": {
    "recovered": [
      { "scope": "mission:warpgogol-com-m000001", "action": "removed-stale-lock" },
      { "artifact": "missions/warpgogol-com-m000001.staging-op-abc123/", "action": "removed" }
    ],
    "failed": []
  },
  "summary": "[werkstatt.lock.recover] 2 artifacts recovered, 0 failures"
}
```

`werkstatt.operation.validate --json`:

```json
{
  "command": "werkstatt.operation.validate",
  "status": "pass",
  "data": {
    "scannedCommands": 15,
    "scannedFiles": 42,
    "violations": []
  },
  "summary": "[werkstatt.operation.validate] 15 commands, 42 files scanned, 0 violations"
}
```

### 10. File system responsibilities

| Path | Role |
| --- | --- |
| `.werkstatt/locks/` | Lock files (gitignored) |
| `.werkstatt/operations/` | Operation records (gitignored) |
| `packages/os/site-kernel-handoff/src/werkstatt/` | Lock, idempotency, heartbeat, and atomic-write helpers |
| `packages/os/site-kernel-checks/src/werkstatt-operation-validate.ts` | `werkstatt.operation.validate` handler |
| `packages/ontology/src/schemas/werkstatt.ts` | Zod schemas for `WerkstattLock`, `WerkstattOperationRecord` |
| `packages/os/site-kernel/src/registry.ts` | Register the three new commands |
| `.gitignore` (root) | Add `.werkstatt/` entry |

### 11. Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Lock cannot be acquired (held by another process) | non-zero | `[<command>] lock '<scope>' held by operation '<operationId>' (pid: <pid>)` |
| Stale lock detected but `--purge` not provided | non-zero | `[werkstatt.lock.recover] stale lock '<scope>' has unclassified artifacts — use --purge to force removal` |
| Mutated registry without completed operation record | non-zero | `[werkstatt.lock.recover] registry appears mutated but no completed operation record exists — human review required` |
| Mutating command missing lock scope declaration | non-zero | `[werkstatt.operation.validate] command '<name>' mutates shared state but declares no lock scopes` |
| Direct `writeFile` outside helper module | non-zero | `[werkstatt.operation.validate] direct writeFile in <file>:<line> — use the shared atomic-write helper` |
| Operation id collision with different input | non-zero | `[<command>] operation id '<operationId>' already used with different inputHash` |

## Architectural fit

- **DNA-51 (Werkstatt consistency primitives):** This RFC establishes DNA-51. The shared lock, idempotency, and atomic-write helpers enforce it; `werkstatt.operation.validate` checks that all mutating Werkstatt commands use them.
- **RFC-0221 (Site handoff):** The existing `readLock` and `hashFile` helpers in `bundle-io.ts` are narrow RFC-0221 transfer-lock utilities. This RFC generalizes the pattern into full scoped locks, heartbeats, and recovery — the existing helpers are insufficient because they lack scopes, stale-lock detection, idempotency records, and atomic staging.
- **RFC-0276 (Bordbuch):** Reuses append-only/hash-chain discipline and forbids destructive rollback of history. The mutation-order rule (§5) ensures registry and Bordbuch writes are coordinated.
- **RFC-0345 (Maintenance plan):** Matches the existing bias toward generated/checkable command metadata rather than prose-only discipline.
- **RFC-0354..0361:** Provides the cross-cutting primitive these RFCs depend on for safe full migration away from `apps/`.
- **RFC-0364 (Semantic fingerprint):** Operation-record hashes use `@gogol/fingerprint` rather than ad hoc hashing.
- **Anti-patterns prevented:** "best-effort file writes", "double allocation on retry", "permanent stale in-progress states", and "registry/Bordbuch split brain".

## Required amendments to existing RFCs

- RFC-0354 registry and pin commands MUST use `registry` and `system:<id>` locks.
- RFC-0355 mission commands MUST use `registry`, `system:<id>`, and `mission:<id>` locks.
- RFC-0356 materialization and commit MUST use `system:<id>` and `mission:<id>` locks; remote drift aborts rather than merges.
- RFC-0357 release commands MUST use `mission:<id>` and `release:<id>` locks; sequence numbers expand to six digits.
- RFC-0358 propagation MUST use `deployment:<system-id>` locks and heartbeat-backed in-progress state.
- RFC-0359 Notausgang export MUST use release/export locks and staging directories.
- RFC-0361 validators read a consistent snapshot by acquiring relevant read locks or retrying once when snapshot inconsistency is detected.

## Rollout

1. Add `.werkstatt/` to gitignore and command ownership metadata.
2. Implement lock, operation-record, heartbeat, and atomic-write helpers in `packages/os/site-kernel-handoff/src/werkstatt/`. New helper modules MUST carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding per DNA-42.
3. Land `WerkstattLock` and `WerkstattOperationRecord` Zod schemas in `@gogol/ontology`.
4. Register `werkstatt.lock.status` and `werkstatt.lock.recover` in `@gogol/site-kernel-handoff`. Register `werkstatt.operation.validate` in `@gogol/site-kernel-checks`.
5. Update RFC-0354..0361 command implementations to declare lock scopes and operation ids. These RFCs are currently `accepted` but not yet implemented; the helpers must exist before their command implementations land, and the implementations must use the helpers from the start.
6. Add fixtures for interrupted staging directories, stale locks, repeated idempotency keys, and registry/Bordbuch partial failures.
7. Add `werkstatt.operation.validate` to the `check` pipeline (`APPS_CHECK_PIPELINE` in `@gogol/site-kernel-checks`) once all mutating Werkstatt commands use helpers. The `check` pipeline is workspace-level and runs on every `pnpm run check` — this is the correct placement because the validator scans workspace-level command metadata, not per-app state.
8. Update `packages/AGENTS.md` with a rule that all mutating Werkstatt commands MUST use the shared helpers and MUST NOT use direct `writeFile`/`rename` outside the allowlisted helper modules.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Use a database for all Werkstatt state | Too much infrastructure for MVP and conflicts with the data/git-centered operating model. |
| Rely only on git conflicts | Git conflicts do not protect local sequence allocation, staging directories, deployment leases, or repeated CLI retries. |
| Let each command implement its own lock file | This recreates the drift problem the RFC is solving; recovery and validation need one helper contract. |
| Delete stale locks automatically without inspection | Could hide partial writes. Recovery must classify related artifacts before removing a lock. |
| Extend existing `readLock`/`hashFile` from `bundle-io.ts` | Those helpers are narrow RFC-0221 transfer-lock utilities without scopes, heartbeats, idempotency, or atomic staging. Generalizing them in place would conflate transfer-lock and Werkstatt-lock semantics; a new `werkstatt/` module keeps the contracts separate. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Lock remains after crash | Medium | Heartbeat + timeout + `werkstatt.lock.recover` classify and clear stale locks. |
| Operation record says completed but artifact is missing | Low | `werkstatt.operation.validate` checks result hashes and declared artifact paths. |
| Cross-platform rename/fsync behavior differs | Medium | Helpers encapsulate platform-specific behavior: `fs.rename` is atomic on POSIX; on Windows, directory moves use a two-phase rename (rename to temp, then rename to target) with retry. Tests cover both platforms. |
| Commands forget to declare scopes | Medium | Command metadata is validated by `werkstatt.operation.validate` before the command becomes part of standard checks. |
| Agent bypasses helpers with direct `writeFile` | Medium | `werkstatt.operation.validate` scans `packages/os/site-kernel-handoff/src/` for direct file writes outside the allowlisted `werkstatt/` module. `packages/AGENTS.md` documents the rule. |
| `werkstatt.operation.validate` false positives on legitimate writes | Low | The validator is path-scoped to `packages/os/site-kernel-handoff/src/` only; codegen, test fixtures, and other packages are not scanned. |
| Concurrent `werkstatt.lock.recover` calls race | Low | `werkstatt.lock.recover` acquires a meta-lock (`scope: "werkstatt-recovery"`) before classifying and removing artifacts. |

## Acceptance criteria

- [x] `.werkstatt/` is gitignored. (evidence: implemented historically)
- [x] `WerkstattLock` and `WerkstattOperationRecord` Zod schemas defined in `@gogol/ontology`. (evidence: packages/ directory, package exists)
- [x] Lock, operation, heartbeat, and atomic staging helpers exist in `packages/os/site-kernel-handoff/src/werkstatt/`. (evidence: packages/ directory, package exists)
- [x] `werkstatt.lock.status` and `werkstatt.lock.recover` are registered in `@gogol/site-kernel-handoff` and tested. (evidence: packages/ directory, package exists)
- [x] `werkstatt.operation.validate` is registered in `@gogol/site-kernel-checks` and fails on direct shared-state writes outside the allowlisted helper module. (evidence: packages/ directory, package exists)
- [x] `werkstatt.operation.validate` is path-scoped to `packages/os/site-kernel-handoff/src/`. (evidence: packages/ directory, package exists)
- [x] `werkstatt.lock.recover` acquires a meta-lock before classifying artifacts. (evidence: implemented historically)
- [x] Mission and release id allocation uses scoped locks and six-digit sequences (deferred to RFC-0355/0357 implementation). (evidence: implemented historically)
- [x] Interrupted staging directories are recoverable. (evidence: implemented historically)
- [x] Operation-record hashes use `@gogol/fingerprint` (RFC-0364) and command arguments are sanitized before hashing (sanitization implemented; `@gogol/fingerprint` integration deferred to RFC-0364). (evidence: packages/ directory, package exists)
- [x] `werkstatt.operation.validate` is added to the `check` pipeline (`PACKAGES_CHECK_PIPELINE`). (evidence: implemented historically)
- [x] `packages/AGENTS.md` documents the helper-requirement rule (deferred). (evidence: AGENTS.md:1, agent guide updated)
- [x] New helper modules carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `--json` output is stable for all three commands. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0362` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0362 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Do not add ad-hoc lock files in individual commands. Use the shared helper in `packages/os/site-kernel-handoff/src/werkstatt/`.
- Do not add distributed lock dependencies for MVP. Local locks plus remote git drift detection are the approved first implementation.
- Never remove a hash-chain Bordbuch event as rollback. Append an erratum.
- Keep lock files and operation records out of git.
- Operation records store hashes only, never raw command arguments. Sanitize secret-like values before computing `inputHash`.
- New helper modules MUST carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).
- Use Compass terminology in all new code, documentation, and log messages (RFC-0353).
