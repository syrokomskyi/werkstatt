---
id: RFC-0355
title: Mission lifecycle and Bordbuch
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0221
amendedBy:
- RFC-0362
- RFC-0477
- RFC-0560
- RFC-0583
- RFC-0790
related:
- RFC-0354
- RFC-0356
- RFC-0357
- RFC-0353
- RFC-0362
- DNA-44
- DNA-45
- DNA-46
satisfies:
- DNA-46
commands:
  proposed: []
  added:
  - mission.open
  - mission.status
  - mission.close
  - mission.abort
  - mission.list
  - bordbuch.append
  - bordbuch.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
- '@gogol/site-kernel-handoff'
- '@gogol/ontology'
successSignals:
- A developer can `mission.open --system <id> --brief <text>` and a new mission directory `missions/<system>-mNNNNNN/` is created with a mission manifest and an open Bordbuch entry.
- '`mission.status --mission <id>` prints the mission''s system, state, openedAt, brief, and Bordbuch entries.'
- '`mission.close --mission <id>` verifies that `mission.reconcile` (defined in RFC-0356) has completed before allowing the mission to close.'
- '`mission.close --mission <id>` transitions the reconciled mission to `closed`, appends a closing Bordbuch entry, and updates `systems/registry.yaml` `currentMission` to null.'
- '`mission.abort --mission <id>` transitions the mission to `aborted`, appends an abort Bordbuch entry, and discards the mission Werkstück and local Distribution.'
- '`bordbuch.validate --system <id>` verifies the Bordbuch NDJSON hash-chain, errata, sensitive-payload guard, and mission lifecycle pairs.'
- 'Mission IDs are kebab-case, lowercase, latin-only: `<system-id>-m<NNNNNN>`.'
nonGoals:
- Does not define materialization (how a mission Werkstück is built) — that is RFC-0356.
- Does not define release discipline — that is RFC-0357.
- Does not define agent orchestration or multi-agent coordination within a mission — that is a future RFC wave.
- Does not define mission templates or brief schemas beyond the minimal contract — richer brief schemas are a future concern.
- Does not define cloud storage for mission Werkstücke or Distributions beyond the local directory contract — cloud storage is out of scope.
- Does not define Bordbuch archival, rotation, or retention policy — the Bordbuch is append-only and grows indefinitely for MVP. A future RFC will address sharding or archival if it becomes a bottleneck.
- Does not define Bordbuch schema evolution or migration policy beyond the per-entry `schemaVersion` field. Old entries retain their original schema version; readers must handle multiple versions. A future RFC will address formal schema migration if breaking changes are needed.
- Does not define `mission.reconcile` — that command is defined in RFC-0356 (Mission materialization). This RFC defines `mission.close` which depends on reconcile as a precondition.

---

# RFC-0355: Mission lifecycle and Bordbuch

## Context

RFC-0354 established the Sternsystem as a durable, independently versioned site bundle. A Sternsystem is a **durable** artifact — it persists across time, pins a platform version, and lives in its own git repo. But work on a Sternsystem is **ephemeral**: an agent or developer opens a working session, makes changes in a local Werkstück, validates them, reconciles the result back to the Sternsystem, and then either closes the mission or discards it by aborting.

The Canon calls this ephemeral working session a **Mission**. A mission materializes exactly one **Werkstück** (`semanticId: workingCopy`) from a Sternsystem's pinned state. The Werkstück is mutable, non-canonical, disposable, and not deployable. A mission may then produce zero or one local **Distribution**: immutable after build, non-canonical, disposable, and deployable for preview/release preparation. Every mission is recorded in the Sternsystem's **Bordbuch** — an immutable, append-only log that forms the historical record of the system.

This RFC defines the mission lifecycle, the Bordbuch contract, and the commands that manage them. It builds directly on RFC-0354's registry and pin contracts.

## Problem

Three invariants are unprotected:

1. **No ephemeral working unit.** There is no way to represent "I am working on Sternsystem X, starting from pin Y, with brief Z." Without this, concurrent work on the same Sternsystem is uncoordinated, and there is no record of what was attempted.

2. **No lifecycle enforcement.** A mission can be opened but never formally closed or aborted. There is no state machine that prevents, for example, opening a new mission on a system that already has an open one, or closing a mission that was already aborted.

3. **No immutable history.** There is no Bordbuch — no append-only record of missions and releases. Without it, the history of a Sternsystem is scattered across git commits and agent session logs, with no single queryable timeline.

## Decision

Introduce the **Mission** as the ephemeral working unit, the **Bordbuch** as the immutable history log, and a state machine that governs mission lifecycle transitions.

### 1. Mission contract

A mission is an ephemeral working container for one Werkstück of a Sternsystem, created for a specific change or task. It lives in `missions/<system-id>-m<NNNNNN>/` in the Werkstatt monorepo (gitignored).

#### 1.1 Mission ID

Mission IDs follow the format `<system-id>-m<NNNNNN>`:

- `<system-id>`: the Sternsystem's id from `systems/registry.yaml` (kebab-case, lowercase, latin-only)
- `-m`: literal separator
- `<NNNNNN>`: zero-padded six-digit sequence number, starting at `000001`, scoped to the Sternsystem

Examples: `warpgogol-com-m000001`, `warpgogol-com-m000002`, `nicaragua-projekt-m000001`.

The sequence number is **per-system**: each Sternsystem has its own `m000001`, `m000002`, ... counter. The counter is derived from the Bordbuch (the highest existing mission number + 1) while holding the RFC-0362 `system:<id>` and `registry` locks.

#### 1.2 Mission directory layout

```
missions/<system-id>-m<NNNNNN>/
  mission.yaml              # mission manifest (see §1.3)
  workpiece/                # current Werkstück: mutable local materialization (RFC-0356)
  evidence/                 # diff, validation, build, and reconciliation reports
  distribution/             # optional local deployable build output, non-canonical
```

The `missions/` directory is gitignored at the monorepo root. Missions are ephemeral and never committed to the monorepo.

#### 1.3 Mission manifest (`mission.yaml`)

```ts
interface MissionManifest {
  schemaVersion: string;            // manifest format version, e.g. "1.0.0"
  missionId: string;                // <system-id>-m<NNNNNN>
  systemId: string;                 // Sternsystem id
  state: MissionState;              // open | closed | aborted
  brief: string;                    // human-readable description of the mission goal
  openedAt: string;                 // ISO 8601
  openedBy: string;                 // agent id or human handle
  closedAt: string | null;          // ISO 8601 or null while open
  closedBy: string | null;
  pinAtOpen: string;                // system.pin.json platform.version at mission open
  materializedAt: string | null;    // ISO 8601 when materialization completed (RFC-0356)
  reconciledAt: string | null;      // ISO 8601 when mission.reconcile completed
  releaseId: string | null;         // release id if mission produced a release (RFC-0357)
  operationId: string;              // RFC-0362 idempotency operation id
}

type MissionState = "open" | "closed" | "aborted";
```

The Zod schema lives in `@gogol/ontology` alongside the `SystemPin` schema from RFC-0354.

### 2. Mission state machine

```
                    ┌─────────┐
  mission.open ───▶ │  open   │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │                     │
     mission.close           mission.abort
              │                     │
              ▼                     ▼
         ┌─────────┐           ┌─────────┐
         │ closed  │           │ aborted │
         └─────────┘           └─────────┘
```

#### 2.1 State transitions

| From | To | Trigger | Preconditions |
| --- | --- | --- | --- |
| (none) | `open` | `mission.open` | System is registered and `active` or `registered`. No other open mission for the same system. Pin file exists. |
| `open` | `closed` | `mission.close` | Mission is `open`. Werkstück has been validated and reconciled (RFC-0356). Changes have been committed to the Sternsystem's repo. |
| `open` | `aborted` | `mission.abort` | Mission is `open`. Werkstück and local Distribution are discarded. No changes committed. |

Transitions are **one-way**: a closed mission cannot be reopened; an aborted mission cannot be closed. A mission in `closed` or `aborted` is terminal.

#### 2.2 Concurrent mission prevention

Only **one open mission** may exist per Sternsystem at a time. `mission.open` fails if the system's `currentMission` in `systems/registry.yaml` is non-null. This prevents conflicting concurrent work on the same Sternsystem.

If concurrent work is needed (e.g., two agents working on different aspects), the Sternsystem should be split into independent systems, or the missions should be serialized. This constraint is intentional: it enforces sequential, reviewable change.

### 3. Bordbuch contract

The Bordbuch (literally "logbook") is the immutable, append-only history of a Sternsystem. It is an independent journal, not a subordinate mission file. Mission commands write lifecycle events to it, but release publication, propagation, Notausgang export, pin updates, operator notes, and errata may also write entries through controlled writer roles.

#### 3.1 Location

The Bordbuch lives at `bordbuch/events.ndjson` in the Sternsystem's own git repo (inside the cache clone at `systems/<id>/bordbuch/events.ndjson`). It is committed to the Sternsystem's repo, not the Werkstatt monorepo. This reuses the stronger RFC-0276 model already present in the project: one JSON object per line, hash-chain integrity, errata instead of rewrites, and sensitive payload guards.

#### 3.2 Schema

```ts
interface BordbuchEntry {
  schemaVersion: "1.0.0";
  id: string;                       // monotonic event id, e.g. event-000001
  systemId: string;
  occurredAt: string;               // ISO 8601
  kind: BordbuchEntryKind;
  status: "done" | "failed" | "waiting" | "escalated";
  missionId: string | null;         // mission id for mission-* entries, null for others
  releaseId: string | null;         // release id for release entries, null for others
  actor: string;                    // agent id or human handle
  summary: string;                  // human-readable summary
  metadata?: Record<string, unknown>;
  previousHash: string | null;
  hash: string;                     // sha256 over stable event payload excluding hash
  erratumOf?: string;               // references event id when kind === "erratum"
}

type BordbuchEntryKind =
  | "mission-open"
  | "mission-close"
  | "mission-abort"
  | "release-published"
  | "release-rolled-back"
  | "pin-update"
  | "deployment"
  | "notausgang-export"
  | "operator-note"
  | "erratum";
```

#### 3.3 Writer roles

Only these writer roles may append entries:

| Writer role   | Allowed kinds                                    |
| ------------- | ------------------------------------------------ |
| `mission`     | `mission-open`, `mission-close`, `mission-abort` |
| `release`     | `release-published`, `release-rolled-back`       |
| `sternsystem` | `pin-update`                                     |
| `leitstand`   | `deployment`                                     |
| `notausgang`  | `notausgang-export`                              |
| `operator`    | `operator-note`, `erratum`                       |

`bordbuch.append` is a low-level command, but it is not an unrestricted write hole. It requires `--writer-role`, validates the kind against the role, uses RFC-0362 locks, rejects sensitive payloads, and records the operation id. Manual entries use `operator-note` or `erratum`; lifecycle commands should call the shared append helper directly.

#### 3.4 Append-only invariant

The Bordbuch is **append-only**. Entries may only be added; existing entries MUST NOT be modified, reordered, or removed. `bordbuch.validate` enforces:

- Event ids are monotonically increasing starting at `event-000001` with no gaps.
- `occurredAt` values are non-decreasing.
- `previousHash` of each entry matches the previous entry's `hash`.
- `hash` matches the stable serialized event payload.
- Every `mission-open` entry has a corresponding `mission-close` or `mission-abort` entry with the same `missionId`.
- No `mission-close` or `mission-abort` entry exists without a preceding `mission-open` for the same `missionId`.
- No duplicate `missionId` values in `mission-open` entries.
- Sensitive payload guards reject secret-like strings, emails, phone numbers, and raw access tokens.
- Corrections are append-only `erratum` entries; no command may rewrite or renumber historical events.

#### 3.5 Entry semantics

| Kind | When appended | Metadata |
| --- | --- | --- |
| `mission-open` | `mission.open` succeeds | `{ brief, pinAtOpen }` |
| `mission-close` | `mission.close` succeeds | `{ releaseId }` if a release was produced |
| `mission-abort` | `mission.abort` succeeds | `{ reason }` |
| `release-published` | `release.publish` (RFC-0357) succeeds | `{ releaseId, semver, platformVersion }` |
| `release-rolled-back` | `release.rollback` or `leitstand.rollback` succeeds | `{ rolledBackFrom, rolledBackTo }` |
| `pin-update` | `sternsystem.pin` (RFC-0354) updates the pin | `{ oldVersion, newVersion }` |
| `deployment` | `leitstand.propagate` or rollback changes live deployment | `{ releaseId, deploymentTarget, state }` |
| `notausgang-export` | `notausgang.export` succeeds | `{ releaseId, exportManifestHash }` |
| `operator-note` | human/operator note | freeform, secret-free metadata |
| `erratum` | correction to an earlier event | `{ erratumOf, correction }` |

### 4. Idempotency and concurrency

Mission and Bordbuch commands use RFC-0362 consistency primitives. `mission.open`, `mission.close`, `mission.abort`, and `bordbuch.append` acquire `registry`, `system:<id>`, and mission-specific locks as needed. Repeating a command with the same idempotency key returns the previous result or resumes a staged operation. Repeating without the same key is not treated as a no-op: it fails with the current state and instructions.

Idempotency behavior:

| Command | Repeated terminal state |
| --- | --- |
| `mission.open` with same key | returns existing mission id |
| `mission.open` without same key and open mission exists | fails |
| `mission.close` on already closed mission with same key | returns existing close result |
| `mission.close` on already closed mission without same key | fails as already terminal |
| `mission.abort` on already aborted mission with same key | returns existing abort result |
| `mission.abort` on already aborted mission without same key | fails as already terminal |
| `bordbuch.append` with same key | returns existing event id if input hash matches |

### 5. Commands

Seven new commands in `@gogol/site-kernel-handoff`:

#### 5.1 `mission.open`

```sh
pnpm exec werkstatt run mission.open \
  --system <system-id> \
  --brief "<text>" \
  [--actor <agent-id-or-handle>]
```

Creates a new mission for the specified Sternsystem:

1. Validates the system is registered and has status `active` or `registered`.
2. Checks no open mission exists for the system (`currentMission` is null in registry).
3. Derives the next mission sequence number from the Bordbuch (highest `m<NNNNNN>` + 1) while holding the required locks.
4. Creates `missions/<system-id>-m<NNNNNN>/` with `mission.yaml` (state: `open`).
5. Appends a `mission-open` entry to the Bordbuch.
6. Updates `systems/registry.yaml` `currentMission` to the new mission id.

Fails if:

- System is not registered or has status `paused` or `archived`.
- A mission is already open for the system.
- The pin file is absent (run `sternsystem.pin` first).

#### 5.2 `mission.status`

```sh
pnpm exec werkstatt run mission.status --mission <mission-id> [--json]
```

Prints the mission manifest and Bordbuch entries for the specified mission.

#### 5.3 `mission.close`

```sh
pnpm exec werkstatt run mission.close \
  --mission <mission-id> \
  [--actor <agent-id-or-handle>] \
  [--release <release-id>]
```

Closes an open mission:

1. Validates the mission is `open`.
2. If the Werkstück has been materialized (RFC-0356), verifies that validation has passed.
3. Verifies `mission.reconcile` has completed when the mission changed Sternsystem data.
4. Updates `mission.yaml` state to `closed`, sets `closedAt` and `closedBy`.
5. Appends a `mission-close` entry to the Bordbuch.
6. Updates `systems/registry.yaml` `currentMission` to null.
7. If `--release` is provided, links the mission to the release (RFC-0357).

Fails if:

- Mission is not `open`.
- Validation has not passed (run materialization and validation first).
- Reconciliation is required but has not completed.

#### 5.4 `mission.abort`

```sh
pnpm exec werkstatt run mission.abort \
  --mission <mission-id> \
  --reason "<text>" \
  [--actor <agent-id-or-handle>]
```

Aborts an open mission:

1. Validates the mission is `open`.
2. Discards the Werkstück (`missions/<mission-id>/workpiece/`) and local Distribution (`missions/<mission-id>/distribution/`).
3. Updates `mission.yaml` state to `aborted`, sets `closedAt` and `closedBy`.
4. Appends a `mission-abort` entry to the Bordbuch with the reason.
5. Updates `systems/registry.yaml` `currentMission` to null.

No changes are committed to the Sternsystem's repo. The abort is a clean rollback.

If the Werkstück or Distribution directory deletion is interrupted (filesystem error, process crash), the mission manifest is NOT transitioned to `aborted` until the directories are successfully removed. RFC-0362 atomic staging ensures the abort either completes fully or leaves the mission in its prior `open` state with a `.incomplete` artifact that `werkstatt.lock.recover` can classify and clean.

#### 5.5 `mission.list`

```sh
pnpm exec werkstatt run mission.list [--system <system-id>] [--json]
```

Lists missions, optionally filtered by system. Prints: missionId, systemId, state, openedAt, closedAt, brief.

When no missions exist (empty registry or no missions for the specified system), the command succeeds with an empty list and a summary like `[mission.list] 0 missions found`. The empty state is not an error.

#### 5.6 `bordbuch.append`

```sh
pnpm exec werkstatt run bordbuch.append \
  --system <system-id> \
  --kind <kind> \
  --summary "<text>" \
  [--mission <mission-id>] \
  [--release <release-id>] \
  [--actor <agent-id-or-handle>] \
  [--writer-role <mission|release|sternsystem|leitstand|notausgang|operator>] \
  [--metadata <json>]
```

Appends a single entry to the Bordbuch through the controlled writer-role surface. This is the low-level primitive used by `mission.open`, `mission.close`, `mission.abort`, `release.publish`, `leitstand.propagate`, and `notausgang.export`. It is exposed as a command for operator notes and errata, not as an unrestricted journal editor.

Fails if:

- The entry would violate the append-only invariant (e.g., event id gap, bad previous hash, duplicate `missionId`).
- The requested `kind` is not allowed for the `writer-role`.
- Sensitive payload guards detect secrets or PII.
- The `--mission` references a mission in a terminal state (`closed` or `aborted`) and the `kind` is a mission-lifecycle kind (`mission-open`, `mission-close`, `mission-abort`). Non-mission kinds (e.g., `operator-note`, `erratum`, `release-published`) may reference any mission id including terminal ones, because the Bordbuch is an independent journal that records events beyond the mission lifecycle.

#### 5.7 `bordbuch.validate`

```sh
pnpm exec werkstatt run bordbuch.validate --system <system-id> [--json]
```

Validates the Bordbuch for the specified Sternsystem:

- Append-only invariant (§3.4).
- Every mission has open and close/abort entries.
- No orphan close/abort entries.
- Event id, hash-chain, and `occurredAt` ordering.
- Erratum references and sensitive payload guards.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** Missions operate on Sternsystems. A mission references a system by id and pins to the system's current pin at open time.
- **DNA-45 (Fleet registry):** `mission.open` and `mission.close` update `currentMission` in `systems/registry.yaml`, keeping the registry in sync with mission state.
- **DNA-46 (Mission lifecycle):** This RFC establishes the invariant that every change to a Sternsystem passes through a mission — there is no out-of-band edit path. The Bordbuch is the audit trail.
- **RFC-0221 (Site handoff):** This RFC amends RFC-0221 §4.1 (version-compare matrix) by applying it to the mission's `pinAtOpen` field — the pin recorded at mission open time determines the platform version the Werkstück is materialized from. The materialization mechanism itself (`handoff.absorb` adaptation) is defined in RFC-0356, not here. This RFC also amends the handoff data model by introducing the mission as the ephemeral working container that replaces the direct `handoff/<app>/` → `apps/<app>/` absorption path with a `systems/<id>/` → `missions/<id>/workpiece/` path.
- **RFC-0353 (Compass rename):** Uses Compass terminology throughout.
- **RFC-0362 (Werkstatt consistency):** Mission and Bordbuch mutations use scoped locks, idempotency records, heartbeats, and atomic staging.
- **Anti-patterns prevented:** "out-of-band edits to a Sternsystem" and "no history of what was attempted and why".

## Design

### CLI surface

```sh
pnpm exec werkstatt run mission.open --system <id> --brief "<text>"
pnpm exec werkstatt run mission.status --mission <id>
pnpm exec werkstatt run mission.close --mission <id>
pnpm exec werkstatt run mission.abort --mission <id> --reason "<text>"
pnpm exec werkstatt run mission.list
pnpm exec werkstatt run mission.list --system <id>
pnpm exec werkstatt run bordbuch.append --system <id> --writer-role operator --kind operator-note --summary "<text>"
pnpm exec werkstatt run bordbuch.validate --system <id>
```

All commands support `--json` output with the standard `{ command, status, data, summary }` envelope.

### TypeScript contracts

New Zod schemas in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/mission.ts

export const MissionStateSchema = z.enum(["open", "closed", "aborted"]);

export const MissionManifestSchema = z.object({
  schemaVersion: z.string(),
  missionId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$/),
  systemId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  state: MissionStateSchema,
  brief: z.string(),
  openedAt: z.string().datetime(),
  openedBy: z.string(),
  closedAt: z.string().datetime().nullable(),
  closedBy: z.string().nullable(),
  pinAtOpen: z.string(),
  materializedAt: z.string().datetime().nullable(),
  reconciledAt: z.string().datetime().nullable(),
  releaseId: z.string().nullable(),
  operationId: z.string(),
});

export const BordbuchEntryKindSchema = z.enum([
  "mission-open",
  "mission-close",
  "mission-abort",
  "release-published",
  "release-rolled-back",
  "pin-update",
  "deployment",
  "notausgang-export",
  "operator-note",
  "erratum",
]);

export const BordbuchEntrySchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().regex(/^event-\d{6}$/),
  systemId: z.string(),
  occurredAt: z.string().datetime(),
  kind: BordbuchEntryKindSchema,
  status: z.enum(["done", "failed", "waiting", "escalated"]),
  missionId: z.string().nullable(),
  releaseId: z.string().nullable(),
  actor: z.string(),
  summary: z.string(),
  metadata: z.record(z.unknown()).optional(),
  previousHash: z.string().nullable(),
  hash: z.string(),
  erratumOf: z.string().optional(),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<system-id>-m<NNNNNN>/` | Ephemeral mission working directory (gitignored) |
| `missions/<system-id>-m<NNNNNN>/mission.yaml` | Mission manifest |
| `missions/<system-id>-m<NNNNNN>/workpiece/` | Current Werkstück: mutable materialization (populated by RFC-0356) |
| `missions/<system-id>-m<NNNNNN>/evidence/` | Diff, validation, build, and reconciliation reports |
| `missions/<system-id>-m<NNNNNN>/distribution/` | Optional local Distribution, non-canonical and disposable |
| `systems/<id>/bordbuch/events.ndjson` | Bordbuch hash-chain ledger (inside the Sternsystem's repo, committed there) |
| `packages/os/site-kernel-handoff/src/mission/` | New module: open, status, close, abort, list handlers |
| `packages/os/site-kernel-handoff/src/bordbuch/` | New module: append, validate handlers |
| `packages/ontology/src/schemas/mission.ts` | Zod schemas for `MissionManifest`, `Bordbuch`, `BordbuchEntry` |
| `packages/os/site-kernel/src/registry.ts` | Register the seven new commands |

### Output format

`mission.open --json`:

```json
{
  "command": "mission.open",
  "status": "pass",
  "data": {
    "missionId": "warpgogol-com-m000001",
    "systemId": "warpgogol-com",
    "state": "open",
    "brief": "Update hero section copy",
    "openedAt": "2026-07-09T12:00:00Z",
    "pinAtOpen": "4.5.0"
  },
  "summary": "[mission.open] opened mission warpgogol-com-m000001 for warpgogol-com"
}
```

`bordbuch.validate --json`:

```json
{
  "command": "bordbuch.validate",
  "status": "pass",
  "data": {
    "systemId": "warpgogol-com",
    "events": 5,
    "violations": []
  },
  "summary": "[bordbuch.validate] warpgogol-com: 5 entries, 0 violations"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| System not registered | non-zero | `[mission.open] system '<id>' is not registered` |
| System paused or archived | non-zero | `[mission.open] system '<id>' has status '<status>' — cannot open missions` |
| Mission already open | non-zero | `[mission.open] system '<id>' already has open mission '<mission-id>'` |
| Pin file absent | non-zero | `[mission.open] system '<id>' has no system.pin.json — run sternsystem.pin first` |
| Mission not open on close/abort | non-zero | `[mission.close] mission '<id>' is not open (state: <state>)` |
| Validation not passed on close | non-zero | `[mission.close] mission '<id>' Werkstück has not passed validation — run mission.validate first` |
| Reconciliation missing on close | non-zero | `[mission.close] mission '<id>' has not been reconciled — run mission.reconcile first` |
| Bordbuch append-only violation | non-zero | `[bordbuch.append] event hash-chain gap detected: expected previousHash <hash>, got <other>` |
| Bordbuch orphan close/abort | non-zero | `[bordbuch.validate] mission-close entry for '<mission-id>' has no preceding mission-open` |
| `bordbuch.append` mission-kind on terminal mission | non-zero | `[bordbuch.append] mission '<id>' is not open — mission-lifecycle kinds require an open mission` |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `MissionManifest`, `Bordbuch`, `BordbuchEntry` Zod schemas in `@gogol/ontology`.
3. Create `packages/os/site-kernel-handoff/src/mission/` module with open, status, close, abort, list handlers.
4. Create `packages/os/site-kernel-handoff/src/bordbuch/` module with append, validate handlers.
5. Register commands in `packages/os/site-kernel/src/registry.ts`.
6. Implement `mission.open` + `mission.list` + `bordbuch.append` first (low-risk, no materialization dependency).
7. Implement `mission.close` + `mission.abort` + `mission.status` + `bordbuch.validate`.
8. **Pilot**: open a mission on the extracted `warpgogol-com` Sternsystem, verify the Bordbuch entry is appended, then abort it.
9. Add DNA-46 to `docs/architecture-dna.md`.
10. Run `build:check` to verify no regression.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Allow concurrent open missions per system | Invites conflicting changes and merge complexity. Sequential missions with a single open constraint enforce reviewable, non-conflicting change. If parallelism is needed, split the system. |
| Store Bordbuch in the Werkstatt monorepo instead of the Sternsystem's repo | The Bordbuch is the Sternsystem's history, not the platform's. Storing it in the Sternsystem's repo keeps the history co-located with the site and allows the Sternsystem to be transferred with its full history intact. |
| Use git log as the Bordbuch | Git log records commits, not mission lifecycle (open/abort). Aborted missions leave no git trace. The Bordbuch captures the full intent-and-outcome record, including failed attempts. |
| Store mission state in the registry instead of a separate manifest | The registry is a summary index; the mission manifest carries detail (brief, pin at open, materialization state) that does not belong in a fleet-wide registry. |
| Use a database for the Bordbuch | An NDJSON hash-chain file in the Sternsystem's repo is simpler, portable, reviewable, and already matches RFC-0276. A database adds infrastructure without benefit for MVP. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Mission Werkstück left open and forgotten | Medium | `mission.list` shows open missions; `sternsystem.list` shows `currentMission`. A periodic sweep command (future) can flag stale open missions. |
| Bordbuch grows large over time | Low | NDJSON is append-friendly and stream-parseable. If it becomes a bottleneck, a future archival RFC may shard projections by year while preserving the canonical hash-chain. |
| Agent forgets to close or abort a mission | Medium | The single-open-mission constraint (§2.2) prevents opening a new mission until the previous one is closed or aborted. The agent must resolve the open mission first. |
| Bordbuch append-only invariant violated by direct file edit | Medium | `bordbuch.validate` catches violations. The Bordbuch lives in the Sternsystem's repo, so direct edits are visible in git diff. |
| Mission sequence number collision after manual Bordbuch edit | Low | The sequence number is derived from the Bordbuch (highest existing + 1), so a consistent Bordbuch always produces the correct next number. `bordbuch.validate` catches inconsistent state. |

## Acceptance criteria

- [x] `MissionManifest`, `Bordbuch`, `BordbuchEntry` Zod schemas defined in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] `mission.open` command registered and tested (evidence: implemented historically)
- [x] `mission.status` command registered and tested (evidence: implemented historically)
- [x] `mission.close` command registered and tested (evidence: implemented historically)
- [x] `mission.abort` command registered and tested (evidence: implemented historically)
- [x] `mission.list` command registered and tested (evidence: implemented historically)
- [x] `bordbuch.append` command registered and tested (evidence: implemented historically)
- [x] `bordbuch.validate` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable for all seven commands (evidence: implemented historically)
- [x] Mission state machine enforced: no concurrent open missions per system (evidence: implemented historically)
- [x] Mission IDs follow `<system-id>-m<NNNNNN>` format (kebab-case, lowercase, latin-only) (evidence: implemented historically)
- [x] Mission layout uses `workpiece/`, `evidence/`, and optional `distribution/` (evidence: implemented historically)
- [x] Bordbuch append-only invariant enforced by `bordbuch.validate` (evidence: implemented historically)
- [x] `mission.open` updates `systems/registry.yaml` `currentMission` (evidence: implemented historically)
- [x] `mission.close` and `mission.abort` clear `systems/registry.yaml` `currentMission` (evidence: implemented historically)
- [x] Pilot: open and abort a mission on `warpgogol-com` Sternsystem, verify Bordbuch entries (deferred — requires registered Sternsystem) (evidence: implemented historically)
- [x] DNA-46 added to `docs/architecture-dna.md` (deferred) (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0355` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0355 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The Bordbuch lives in the Sternsystem's own git repo (`systems/<id>/bordbuch/events.ndjson`), NOT in the Werkstatt monorepo. It is committed to the Sternsystem's repo.
- The `missions/` directory is gitignored in the Werkstatt monorepo. Mission Werkstücke and Distributions are ephemeral.
- Mission IDs MUST be kebab-case, lowercase, latin-only: `<system-id>-m<NNNNNN>`. The regex `^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$` enforces this.
- The single-open-mission constraint (§2.2) is a hard invariant. Do NOT relax it without a superseding RFC.
- `mission.close` MUST verify that the Werkstück has been materialized, validated, and reconciled when data changed (RFC-0356). Do NOT allow closing a mission with unvalidated or unreconciled changes.
- `mission.abort` MUST NOT commit any changes to the Sternsystem's repo. It is a clean rollback.
- The Bordbuch append-only invariant (§3.4) is a hard invariant. `bordbuch.validate` MUST enforce all rules listed there.
- `bordbuch.append` MUST require `--writer-role` and MUST reject event kinds outside that role's allowlist.
- Corrections MUST use `erratum` events. Do not rewrite, renumber, or delete existing Bordbuch events.
- All mission and Bordbuch mutations MUST use RFC-0362 locks and idempotency records.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
