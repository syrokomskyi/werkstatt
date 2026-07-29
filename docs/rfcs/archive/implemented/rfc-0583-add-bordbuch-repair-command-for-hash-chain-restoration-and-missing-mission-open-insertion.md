---
id: RFC-0583
title: "Add bordbuch.repair command for hash-chain restoration and missing mission-open insertion"
status: implemented
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
acceptedAt: 2026-07-29
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0355
amendedBy: []
related:
  - DNA-51
  - RFC-0355
  - RFC-0362
  - RFC-0473
  - RFC-0477
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
  proposed:
    - bordbuch.repair
  added:
    - bordbuch.repair
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "bordbuch.repair detects orphan-mission-close violations and inserts missing mission-open events"
  - "bordbuch.repair recalculates hash chain and event-id sequence after insertion"
  - "bordbuch.validate passes after bordbuch.repair on a previously broken bordbuch"
  - "bordbuch.repair --dry-run shows planned changes without writing"
nonGoals:
  - "Do not remove duplicate mission-open events — that is a separate repair scenario"
  - "Do not fix event-id gaps independently of hash-chain restoration — they are fixed together as part of chain resequencing"
  - "Do not add bordbuch.repair to any pipeline — it is an on-demand operator command"
  - "Do not repair bordbuch in mission workpieces — bordbuch lives only in the cache clone (mirrors[0])"
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

# RFC-0583: Add bordbuch.repair command for hash-chain restoration and missing mission-open insertion

## Context

The Bordbuch (RFC-0355, RFC-0473) is an append-only NDJSON event log with a SHA-256 hash chain. `bordbuch.validate` checks event-id sequence, previousHash chain, hash integrity, and mission lifecycle pairing (mission-open must precede mission-close/abort).

During mission `warpgogol-com-m000019` closure, `bordbuch.validate` failed with `orphan-mission-close` for `warpgogol-com-m000016`: the bordbuch in the cache clone started with a `mission-close` event for m000016 without a preceding `mission-open`. Investigation traced this to a `git reset` (commit `f9b277a`) that removed the `mission-open` entry, while a subsequent commit (`935b727`) added the `mission-close`, creating the orphan.

No command exists to repair a broken bordbuch. The operator had to write a custom Node.js script to insert the missing `mission-open` event and recompute the entire hash chain. This is fragile, error-prone, and not reproducible.

## Problem

1. **No repair command for broken bordbuch chains.** When `bordbuch.validate` reports `orphan-mission-close`, `hash-chain-gap`, or `hash-mismatch`, there is no controlled command to fix the bordbuch. Operators must write custom scripts to recompute hashes and insert missing events — this is error-prone and bypasses the writer-role surface (RFC-0355).

2. **Missing mission-open events are not recoverable.** A `git reset` or manual edit can remove a `mission-open` event while leaving the `mission-close` in place. The bordbuch validator detects the orphan but offers no remediation path.

3. **Hash-chain recomputation is manual.** After inserting a missing event, every subsequent entry's `previousHash` and `hash` must be recomputed. Doing this by hand or with ad-hoc scripts risks introducing new hash-chain gaps.

## Decision

The kernel gains a `bordbuch.repair` command that detects `orphan-mission-close` violations, inserts missing `mission-open` events with auto-derived or operator-supplied metadata, recomputes the hash chain and event-id sequence, and writes the repaired bordbuch atomically.

## Architectural fit

- **DNA-51 (Werkstatt consistency primitives):** Bordbuch is a consistency primitive. A repair command ensures the bordbuch can be restored to a valid state after accidental corruption, maintaining the integrity guarantee. The command uses RFC-0362 lock primitives (`system:<id>` lock scope) to prevent concurrent repair or append operations. Idempotency: running `bordbuch.repair` on an already-valid bordbuch is a no-op (the second `validateBordbuch` finds no violations, exits 0 with `insertedEvents: 0`).
- **RFC-0355 (Mission lifecycle and Bordbuch):** This RFC amends RFC-0355 §3.4 (append-only invariant) to add an explicit exception for `bordbuch.repair`. The append-only invariant states "no command may rewrite or renumber historical events." `bordbuch.repair` is a meta-level disaster-recovery tool (analogous to `fsck` for a filesystem) that operates outside the bordbuch's own append-only protocol. It is the only command permitted to rewrite the bordbuch file, and only when `bordbuch.validate` reports `orphan-mission-close` violations. Normal append-path commands (`bordbuch.append`, `mission.open`, `mission.close`) remain strictly append-only. The repair command uses the same `bordbuchEntrySchema` validation as `bordbuch.append`. Inserted `mission-open` events use the `mission` writer-role, but the writer-role validation is performed by the repair command itself (not via `bordbuch.append`) because the repair command is a disaster-recovery tool that writes the file directly, bypassing the normal append surface. This bypass is intentional and limited to repair.
- **RFC-0473 (Unified bordbuch schemas):** The command operates on the unified bordbuch at `mirrors[0].path/bordbuch/events.ndjson`, consistent with `bordbuch.append` and `bordbuch.validate`.
- **RFC-0477 (Bordbuch git synchronization):** After repair, the operator must commit the bordbuch change in the cache clone. The command does not auto-commit — it only writes the repaired file.
- **Site OS operator model:** `bordbuch.repair` is workspace-scoped, on-demand, not in any pipeline. It is provided by the `handoff` module alongside `bordbuch.append` and `bordbuch.validate`.

## Design

### CLI surface

```sh
# Dry-run: show planned repairs without writing
pnpm exec site-kernel run bordbuch.repair --system warpgogol-com --dry-run

# Repair with auto-derived metadata for missing mission-open events
pnpm exec site-kernel run bordbuch.repair --system warpgogol-com

# Repair with explicit metadata for a specific mission
pnpm exec site-kernel run bordbuch.repair --system warpgogol-com \
  --mission warpgogol-com-m000016 \
  --metadata '{"occurredAt":"2026-07-28T10:20:38.590Z","summary":"Mission opened (auto-repaired)","actor":"agent"}'

# JSON output
pnpm exec site-kernel run bordbuch.repair --system warpgogol-com --json
```

Flags:

- `--system` (required): Sternsystem id.
- `--dry-run` (optional): Show planned repairs without writing.
- `--mission` (optional): Repair only the specified mission id.
- `--metadata` (optional): JSON object with `occurredAt`, `summary`, `actor` for the inserted mission-open event. If omitted, metadata is auto-derived from the corresponding mission-close event.
- `--json` (optional): Machine-readable output. Handled by the kernel CLI framework automatically; not declared as a command-specific flag.

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.ts

export interface BordbuchRepairPlan {
  systemId: string;
  orphans: Array<{
    missionId: string;
    closeEventId: string;
    closeEventKind: "mission-close" | "mission-abort";
    proposedOpen: Omit<BordbuchEntry, "hash" | "id" | "previousHash">;
    metadataSource: "auto-derived" | "operator-supplied";
  }>;
  hashChainBroken: boolean;
  eventIdGaps: boolean;
}

export interface BordbuchRepairResult {
  systemId: string;
  insertedEvents: number;
  recomputedHashes: number;
  repairedFilePath: string;
  dryRun: boolean;
  orphans?: BordbuchRepairPlan["orphans"]; // Present only in dry-run mode
}

export async function runBordbuchRepair(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BordbuchRepairResult>>;
```

The repair algorithm:

1. Read all entries via `readBordbuch`.
2. Run `validateBordbuch` to identify violations. If no violations found, exit 0 with `insertedEvents: 0`.
3. Filter violations to `orphan-mission-close` only. If other violation types exist (`duplicate-mission-id`, `sensitive-payload`, `hash-mismatch`, `hash-chain-gap`, `unmatched-mission-open`), exit non-zero — these are unrepairable by this command.
4. For each `orphan-mission-close` (processed in log order), derive or accept operator-supplied metadata for a `mission-open` event:
   - `occurredAt`: auto-derived from the corresponding `mission-close`/`mission-abort` event's `occurredAt` (ensures non-decreasing ordering). If operator-supplied via `--metadata`, use the provided value.
   - `summary`: "Mission opened (auto-repaired)" unless operator-supplied.
   - `actor`: "agent" unless operator-supplied.
   - `status`: "done".
   - `missionId`: copied from the orphan `mission-close`/`mission-abort` event.
   - `releaseId`: `null`.
   - `writerRole`: "mission" (implied; not validated via `bordbuch.append` surface).
5. Insert each `mission-open` event immediately before its corresponding `mission-close`/`mission-abort` event in the entry list.
6. Recompute all `id` (sequential from `event-000001`), `previousHash`, and `hash` fields for every entry. The `computeEntryHash` function (currently private in `bordbuch-io.ts`) must be exported for reuse.
7. Validate the repaired bordbuch with `validateBordbuch`. If violations remain, exit non-zero and do not write.
8. Write atomically (unless `--dry-run`) using `atomicWriteFile`.

**Idempotency:** Running `bordbuch.repair` on an already-valid bordbuch is a no-op — step 2 finds no violations, and the command exits 0 with `insertedEvents: 0`.

**`--mission` flag semantics:** When `--mission` is specified, only the orphan for that mission id is repaired. If other orphans remain, the post-repair `validateBordbuch` (step 7) will fail on the remaining orphans, the file is not written, and the command exits non-zero with a message listing the remaining orphan missions. The operator must either repair all orphans at once (omit `--mission`) or repair them one at a time (re-running until all are resolved).

### File system responsibilities

| Path | Role |
| --- | --- |
| `mirrors[0].path/bordbuch/events.ndjson` | Read and written by bordbuch.repair (via `resolveBordbuchPath`) |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.ts` | New module implementing the repair command |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | `computeEntryHash` exported (currently private) for reuse by repair module |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts` | Command registration added to `createBordbuchModule()` |
| `packages/os/site-kernel-handoff/src/bordbuch/index.ts` | `runBordbuchRepair` and types exported from barrel |
| `packages/os/site-kernel-handoff/AGENTS.md` | Updated to document `bordbuch.repair` command |

### Output format

```json
{
  "command": "bordbuch.repair",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "insertedEvents": 1,
    "recomputedHashes": 8,
    "repairedFilePath": "../systems-cache/warpgogol-com/bordbuch/events.ndjson",
    "dryRun": false
  },
  "summary": "Repaired bordbuch for warpgogol-com: inserted 1 mission-open event, recomputed 8 hashes"
}
```

On dry-run, `dryRun: true`, the file is not written, and `data.orphans` is present with planned insertions and derived metadata:

```json
{
  "command": "bordbuch.repair",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "insertedEvents": 0,
    "recomputedHashes": 0,
    "repairedFilePath": "../systems-cache/warpgogol-com/bordbuch/events.ndjson",
    "dryRun": true,
    "orphans": [
      {
        "missionId": "warpgogol-com-m000016",
        "closeEventId": "event-000008",
        "closeEventKind": "mission-close",
        "proposedOpen": { "schemaVersion": "1.0.0", "systemId": "warpgogol-com", "occurredAt": "2026-07-28T10:20:38.590Z", "kind": "mission-open", "status": "done", "missionId": "warpgogol-com-m000016", "releaseId": null, "actor": "agent", "summary": "Mission opened (auto-repaired)" },
        "metadataSource": "auto-derived"
      }
    ]
  },
  "summary": "Dry-run: 1 repair planned for warpgogol-com"
}
```

### Failure modes

- **No violations found:** If `bordbuch.validate` passes, the command exits 0 with `insertedEvents: 0` and a message "No repairs needed."
- **Unrepairable violation:** If the bordbuch has violations beyond `orphan-mission-close` (e.g. `duplicate-mission-id`, `sensitive-payload`), the command exits non-zero with a message listing the unrepairable violations. These require manual intervention.
- **Repaired bordbuch still invalid:** If after repair `bordbuch.validate` still fails, the command exits non-zero, does not write the file, and reports the remaining violations.
- **Lock failure:** If the `system:<id>` lock cannot be acquired (per RFC-0362 / DNA-51), the command exits non-zero with a lock-contention message. This prevents concurrent repair or concurrent `bordbuch.append` / `mission.open` / `mission.close` operations from interfering.

## Rollout

- **Default behavior:** The command is available on-demand. It is not in any pipeline. Operators run it when `bordbuch.validate` reports `orphan-mission-close` violations.
- **No migration needed:** The command operates on existing bordbuch files. No schema changes, no new file formats.
- **Post-repair steps:** After `bordbuch.repair`, the operator must commit the repaired bordbuch in the cache clone (`git add bordbuch/events.ndjson && git commit`). The command does not auto-commit.
- **Pipeline integration:** None. `bordbuch.repair` is an operator-only command, never automated.

## Alternatives considered

1. **Full repair (D3): hash chain + duplicate removal + event-id fix.** Rejected because duplicate mission-open removal is destructive and rare. Event-id gaps are already fixed as part of chain resequencing. A focused command that handles the most common repair scenario (orphan-mission-close) is safer and easier to reason about.

2. **Hash-chain-only repair (D1).** Rejected because without inserting the missing `mission-open`, the `orphan-mission-close` violation persists. The operator would still need to manually insert the event, which is the fragile process this RFC eliminates.

3. **Manual repair via a documented runbook.** Rejected because the hash-chain recomputation is error-prone by hand and the existing `computeEntryHash` function is not exported for external use. A command encapsulates the logic safely.

## Risks

- **Fabricated mission-open events:** The inserted `mission-open` events are synthetic — they did not actually occur at the derived timestamp. The `summary` field should clearly mark them as auto-repaired (e.g. "Mission opened (auto-repaired)"). This is an inherent limitation of repairing a corrupted log.
- **Agent misuse:** Agents might run `bordbuch.repair` proactively instead of only when `bordbuch.validate` fails. The command should be documented as on-demand only, triggered by validation failures.
- **Hash-chain trust:** After repair, all entries after the insertion point have new hashes. This is expected and correct — the repaired bordbuch is internally consistent. The `bordbuch.validate` post-check confirms this.
- **Performance:** Negligible — bordbuch files are small (typically <100 entries).

## Acceptance criteria

- [x] `bordbuch.repair` command registered in `bordbuch.module.ts` (`createBordbuchModule()`) with workspace scope, `mutatesState: true`, `cacheable: false`, `supportsAllSites: false`, and `writes`/`reads` paths declared
- [x] `runBordbuchRepair` and types exported from `bordbuch/index.ts` barrel
- [x] `computeEntryHash` exported from `bordbuch-io.ts` for reuse by the repair module
- [x] Detects `orphan-mission-close` violations and inserts missing `mission-open` events
- [x] Auto-derives metadata from the corresponding `mission-close` event when `--metadata` is not provided
- [x] `--metadata` flag overrides auto-derived metadata
- [x] Recomputes hash chain and event-id sequence after insertion
- [x] `bordbuch.validate` passes after `bordbuch.repair` on a previously broken bordbuch
- [x] `--dry-run` shows planned repairs without writing
- [x] Post-repair `bordbuch.validate` is run internally; command fails if repaired bordbuch is still invalid
- [x] Unit test covers the orphan-mission-close repair scenario
- [x] `packages/os/site-kernel-handoff/AGENTS.md` updated to document `bordbuch.repair`

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits. Use `rfc.implement.stamp` per RFC-0476.
- Agents MUST use RFC-0362 lock primitives (`system:<id>` lock scope) when acquiring the bordbuch lock.
- Agents MUST NOT run `bordbuch.repair` proactively — only when `bordbuch.validate` reports `orphan-mission-close` violations.
- Agents MUST commit the repaired bordbuch in the cache clone after running `bordbuch.repair`. The command does not auto-commit.
- Agents MUST NOT use `bordbuch.repair` to fabricate events that did not occur — the command is for restoring missing events only.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
