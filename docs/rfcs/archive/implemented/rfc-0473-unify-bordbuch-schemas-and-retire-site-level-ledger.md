---
id: RFC-0473
title: "Unify Bordbuch schemas and retire the site-level ledger"
status: implemented
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-20
updatedAt: 2026-07-24
enhancedAt: 2026-07-20
implementedAt: 2026-07-24
closedAt:
supersedes:
  - RFC-0276
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0355
  - RFC-0354
  - RFC-0381
  - RFC-0362
  - DNA-46
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added:
    - bordbuch.status
    - bordbuch.generate
  changed: []
  removed:
    - site.bordbuch.append
    - site.bordbuch.generate
    - site.bordbuch.validate
    - site.bordbuch.status
appsImpacted: []
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/surface"
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-content"
successSignals:
  - "A single Bordbuch schema (`bordbuchEntrySchema` in `@gogol/ontology/operations`) serves both lifecycle events and runtime operational events"
  - "`bordbuch.append --system <id> --kind pseo --writer-role runtime` appends a PSEO event to `systems/<id>/bordbuch/events.ndjson`"
  - "`bordbuch.append --system <id> --kind indexnow.submit --writer-role runtime` appends an IndexNow event"
  - "`bordbuch.validate --system <id>` validates the unified ledger with all event kinds"
  - "`bordbuch.status --system <id>` returns a status projection derived from the unified ledger"
  - "`bordbuch.generate --system <id>` writes rich public projections to `systems/<id>/public/.well-known/`"
  - "`packages/surface/src/bordbuch.ts` is deleted; no code imports `bordbuchEventSchema` from `@gogol/surface`"
  - "`packages/os/site-kernel-checks/src/site-bordbuch.ts` is deleted; all callers use `appendBordbuchEntry` from `@gogol/site-kernel-handoff`"
  - "`pnpm --filter @gogol/ontology build:check` passes with the extended `bordbuchEntryKindSchema`"
  - "`pnpm --filter @gogol/site-kernel-handoff build:check` passes with the new `bordbuch.status` and `bordbuch.generate` commands"
  - "`pnpm --filter @gogol/site-kernel-checks build:check` passes with `site-bordbuch.ts` removed"
nonGoals:
  - "Does not migrate historical `mission-NNNNNN` entries from old site ledgers — old ledgers under `src/bordbuch/events.ndjson` are orphaned by RFC-0381 and contain no live data; no `status.generated.yaml` files exist since `apps/` was removed by RFC-0381"
  - "Does not add `stellarpass`, `sichtpass`, `quartalsbericht`, `translation`, `validation` kinds to the canonical schema — these will be added when their pipelines are migrated to Sternsystem topology"
  - "Does not change the `bordbuchEntrySchema` field structure — only extends the `kind` enum and adds writer-role entries"
  - "Does not change the Bordbuch file path (`systems/<id>/bordbuch/events.ndjson`) or NDJSON format"
  - "Does not define Bordbuch archival, rotation, or retention policy (remains a non-goal from RFC-0355)"
  - "Does not change the hash-chain algorithm or `schemaVersion`"
  - "Does not remove `@gogol/surface` — only the `bordbuch.ts` module and its governance re-exports are deleted"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run bordbuch.validate --system webgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-status.ts"
#   - probe: command-registered
#     name: "bordbuch.status"
#   - probe: file-contains
#     path: "packages/ontology/src/operations/mission.ts"
#     pattern: "pseo"
---

# RFC-0473: Unify Bordbuch schemas and retire the site-level ledger

## Context

The Bordbuch concept was introduced in RFC-0276 as a site-level append-only ledger living at `apps/<app>/src/bordbuch/events.ndjson`, with `bordbuchEventSchema` defined in `@gogol/surface`. RFC-0355 later introduced a workspace-level Bordbuch at `systems/<id>/bordbuch/events.ndjson` with `bordbuchEntrySchema` in `@gogol/ontology/operations`, adding writer-role gating, `schemaVersion`, `missionId`/`releaseId`/`actor` fields, and a different event ID format (`event-NNNNNN` vs `mission-NNNNNN`).

RFC-0381 retired the `apps/` directory entirely. Sternsystems now live in `systems/<id>/` and the only live Bordbuch data is at `systems/<id>/bordbuch/events.ndjson` using the RFC-0355 schema. However, the old site-level Bordbuch code in `packages/os/site-kernel-checks/src/site-bordbuch.ts` and `packages/surface/src/bordbuch.ts` remains active, called by:

- `surface-breaker.ts` — appends `kind: "pseo"` events on breaker trips
- `pseo-governance.ts` — appends `kind: "pseo"` events on autonomy demote/escalate
- `public-surface/indexnow.ts` — appends `kind: "indexnow.submit"` events after IndexNow submission
- `pipelines/sites-check-author.ts` — runs `site.bordbuch.validate` in the author pipeline
- `fleet-leitstand.ts` — reads `src/bordbuch/status.generated.yaml` for fleet status collection
- `generator-ownership.ts` — registers `site.bordbuch.generate` as the owner of public projections

These callers use event kinds (`pseo`, `indexnow.submit`, `stellarpass`, `sichtpass`, `quartalsbericht`, `deploy`, `translation`, `validation`) that do not exist in the canonical `bordbuchEntryKindSchema`. The old code also reads from `<app>/src/bordbuch/events.ndjson` — a path that no longer exists in the `systems/` topology.

## Problem

Three issues stem from the dual-schema state:

1. **Orphaned path convention.** `site-bordbuch.ts` reads `LEDGER_FILE = "src/bordbuch/events.ndjson"` relative to `app.directory`. In the post-RFC-0381 topology, Sternsystem data lives at `systems/<id>/bordbuch/events.ndjson` (no `src/` prefix). The old commands silently return empty results because the ledger file is never found at the old path.

2. **Schema divergence.** Two Zod schemas (`bordbuchEventSchema` in `@gogol/surface` and `bordbuchEntrySchema` in `@gogol/ontology/operations`) define overlapping but incompatible Bordbuch entry shapes. The old schema has `title`, `refs`, `supersedes`, `site`; the new schema has `schemaVersion`, `systemId`, `missionId`, `releaseId`, `actor`, `metadata`. Event ID formats differ (`mission-NNNNNN` vs `event-NNNNNN`). Status enums differ (`aborted`/`checking` vs `failed`).

3. **Runtime events have no canonical home.** PSEO governance, surface breaker, and IndexNow submission produce meaningful operational events that belong in the Bordbuch, but the canonical schema's `bordbuchEntryKindSchema` enum does not include their kinds. These events are written to a ledger that no longer exists at the expected path, producing silent no-ops.

## Decision

Unify on the canonical `bordbuchEntrySchema` from `@gogol/ontology/operations` (RFC-0355) as the single Bordbuch schema. Extend its `kind` enum with the runtime event kinds from the old site-level schema. Add a `runtime` writer-role for operational events. Migrate all callers from `runSiteBordbuchAppend`/`runSiteBordbuchGenerate` to `appendBordbuchEntry` from `@gogol/site-kernel-handoff`. Delete the old site-level Bordbuch code.

### Kind enum extension

The `bordbuchEntryKindSchema` enum in `packages/ontology/src/operations/mission.ts` is extended with only the kinds that have live callers today:

| New kind          | Old kind          | Writer role | Source callers                             |
| ----------------- | ----------------- | ----------- | ------------------------------------------ |
| `pseo`            | `pseo`            | `runtime`   | `surface-breaker.ts`, `pseo-governance.ts` |
| `indexnow.submit` | `indexnow.submit` | `runtime`   | `public-surface/indexnow.ts`               |

The existing `deployment` kind (writer-role `leitstand`) covers deploy events. The old `deploy` kind is mapped to `deployment` — no new kind is added for it.

Kinds `stellarpass`, `sichtpass`, `quartalsbericht`, `translation`, and `validation` are **not** added in this RFC. They will be added when their respective pipelines are migrated to Sternsystem topology. Adding enum values without callers, tests, or validation coverage is speculative.

### Writer-role extension

The `WRITER_ROLE_KINDS` map in `bordbuch-io.ts` is extended:

```ts
runtime: ["pseo", "indexnow.submit"]
```

### Status and generate commands

Two new commands are added to `@gogol/site-kernel-handoff`:

- `bordbuch.status` — reads the unified ledger and returns a status projection (read-only, no file writes)
- `bordbuch.generate` — reads the unified ledger and writes public projections to `systems/<id>/public/.well-known/`

`bordbuch.generate` produces a rich projection matching the old `bordbuchStatusSchema` shape: PSEO modules, visibility outcomes, latest stellarpass, latest deploy, and open escalations. PSEO module context is read from `loadSurfaceModuleContexts` and `readVisibilityOutcomes` — both extracted to `@gogol/surface/io` so `site-kernel-handoff` can import them without depending on `site-kernel-checks`. The public `.well-known/bordbuch.json` shape is preserved for external consumers.

`bordbuch.status` returns a lightweight `BordbuchStatusData` (ledger hash, event count, latest event, open escalations) for programmatic consumption without file writes.

## Architectural fit

- **DNA-46 (Mission lifecycle):** This RFC strengthens DNA-46 by making the Bordbuch the single immutable record for all Sternsystem events — lifecycle and runtime. The append-only invariant, hash-chain, and writer-role gating are preserved and extended.
- **RFC-0355:** Extends `bordbuchEntryKindSchema` and `WRITER_ROLE_KINDS` — additive enum changes, no existing field structure changes. The `schemaVersion: "1.0.0"` contract is preserved.
- **RFC-0276:** Superseded. The site-level Bordbuch concept is fully absorbed into the workspace-level Sternsystem Bordbuch. The `bordbuchEventSchema`, `bordbuchEventKindSchema`, `bordbuchEventStatusSchema`, `bordbuchRefSchema`, `bordbuchStatusSchema`, and their type aliases are deleted from `@gogol/surface`.
- **RFC-0381:** Completes the `apps/` retirement by removing the last `apps/`-path-dependent code in `site-kernel-checks`.
- **RFC-0362:** The new `bordbuch.status` command uses `werkstatt` locks consistent with `bordbuch.append` and `bordbuch.validate`.
- **Site OS operator model:** `bordbuch.append`, `bordbuch.validate`, and `bordbuch.status` are workspace-scope commands in the `bordbuch` module of `site-kernel-handoff`. The old `site.bordbuch.*` commands (app-scope, in `site-kernel-checks`) are removed.

## Design

### Kind enum mapping

| Old `bordbuchEventKindSchema` value | New `bordbuchEntryKindSchema` value | Notes |
| --- | --- | --- |
| `deploy` | `deployment` | Already exists in canonical schema; old callers use `deployment` |
| `pseo` | `pseo` | New — added to canonical enum |
| `indexnow.submit` | `indexnow.submit` | New — added to canonical enum |
| `stellarpass` | — | Not added in this RFC; will be added when Stellarpass pipeline migrates |
| `sichtpass` | — | Not added in this RFC; will be added when Sichtpass pipeline migrates |
| `quartalsbericht` | — | Not added in this RFC; will be added when Quartalsbericht pipeline migrates |
| `translation` | — | Not added in this RFC; will be added when translation pipeline migrates |
| `validation` | — | Not added in this RFC; will be added when validation pipeline migrates |
| `notausgang` | `notausgang-export` | Already exists in canonical schema |
| `erratum` | `erratum` | Already exists in canonical schema |

### CLI surface

```sh
# Append a PSEO event (replaces site.bordbuch.append)
pnpm exec site-kernel run bordbuch.append \
  --system webgogol-com \
  --kind pseo \
  --writer-role runtime \
  --summary "Surface breaker tripped: 2 tripwire(s), 3 page(s) affected" \
  --actor agent

# Append an IndexNow event
pnpm exec site-kernel run bordbuch.append \
  --system webgogol-com \
  --kind indexnow.submit \
  --writer-role runtime \
  --summary "Submitted 42 canonical URL(s) to IndexNow" \
  --actor agent \
  --metadata '{"key":"abc","batchHash":"sha256:...","urlCount":42}'

# Validate the unified ledger
pnpm exec site-kernel run bordbuch.validate --system webgogol-com

# Get status projection (read-only, replaces site.bordbuch.status)
pnpm exec site-kernel run bordbuch.status --system webgogol-com

# Generate public projections (replaces site.bordbuch.generate)
pnpm exec site-kernel run bordbuch.generate --system webgogol-com
```

### New `bordbuch.status` command

**Scope:** workspace

**Flags:**

| Flag       | Kind   | Required | Description    |
| ---------- | ------ | -------- | -------------- |
| `--system` | string | yes      | Sternsystem id |

**Result:**

```ts
interface BordbuchStatusData {
  systemId: string;
  ledgerHash: string | null;
  eventCount: number;
  latestEvent: BordbuchEntry | null;
  openEscalations: BordbuchEntry[];
  latestDeploy: { eventId: string; occurredAt: string; status: string } | null;
}
```

### New `bordbuch.generate` command

**Scope:** workspace

**Flags:**

| Flag       | Kind   | Required | Description    |
| ---------- | ------ | -------- | -------------- |
| `--system` | string | yes      | Sternsystem id |

**Writes:**

- `systems/<id>/public/.well-known/bordbuch.json` — rich machine-readable projection (PSEO modules, visibility, escalations, latest deploy/stellarpass)
- `systems/<id>/public/.well-known/bordbuch/index.html` — human-readable noindex projection

The projection shape matches the old `bordbuchStatusSchema` from `@gogol/surface`. PSEO module context is read from `loadSurfaceModuleContexts` and `readVisibilityOutcomes` — the same data sources the old `site.bordbuch.generate` used.

### Caller migration

| Caller | Old call | New call |
| --- | --- | --- |
| `surface-breaker.ts:233` | `runSiteBordbuchAppend({kind:"pseo",...})` | `appendBordbuchEntry(workspaceRoot, systemId, "pseo", summary, actor, {writerRole:"runtime", status:"escalated"})` |
| `surface-breaker.ts:246` | `runSiteBordbuchGenerate(...)` | `runBordbuchGenerate({flags:{system}}, context)` |
| `pseo-governance.ts:354` | `runSiteBordbuchAppend({kind:"pseo",...})` | `appendBordbuchEntry(..., "pseo", ..., {writerRole:"runtime", status:"escalated"})` |
| `pseo-governance.ts:367` | `runSiteBordbuchGenerate(...)` | `runBordbuchGenerate(...)` |
| `indexnow.ts:248` | `runSiteBordbuchAppend({kind:"indexnow.submit",...})` | `appendBordbuchEntry(..., "indexnow.submit", ..., {writerRole:"runtime", metadata:{key,batchHash,urlCount}})` |
| `indexnow.ts:263` | `runSiteBordbuchGenerate(...)` | `runBordbuchGenerate(...)` |
| `pipelines/sites-check-author.ts:106` | `{command:"site.bordbuch.validate"}` | `{command:"bordbuch.validate"}` with `--system` flag |
| `fleet-leitstand.ts:192` | reads `src/bordbuch/status.generated.yaml` | reads `systems/<id>/bordbuch/events.ndjson` via `readBordbuch` |
| `generator-ownership.ts:356` | `command: "site.bordbuch.generate"` | `command: "bordbuch.generate"` |

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/<id>/bordbuch/events.ndjson` | Unified append-only ledger (unchanged path) |
| `systems/<id>/public/.well-known/bordbuch.json` | Generated machine-readable projection (new location) |
| `systems/<id>/public/.well-known/bordbuch/index.html` | Generated human-readable noindex projection (new location) |
| `packages/ontology/src/operations/mission.ts` | Extend `bordbuchEntryKindSchema` enum |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | Extend `WRITER_ROLE_KINDS` with `runtime` |
| `packages/surface/src/io/surface-module-context-io.ts` | New: `loadSurfaceModuleContexts` extracted from `site-kernel-checks` |
| `packages/surface/src/io/visibility-outcomes-io.ts` | New: `readVisibilityOutcomes` extracted from `site-kernel-checks` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-status.ts` | New command: `bordbuch.status` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts` | New command: `bordbuch.generate` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts` | Register `bordbuch.status` and `bordbuch.generate` commands |
| `packages/os/site-kernel-checks/src/site-bordbuch.ts` | **Deleted** |
| `packages/os/site-kernel-checks/src/command-tables/fleet-bordbuch.ts` | Remove `site.bordbuch.*` entries; keep fleet commands |
| `packages/surface/src/bordbuch.ts` | **Deleted** |
| `packages/surface/src/governance/index.ts` | Remove bordbuch re-exports |
| `packages/os/site-kernel-checks/src/surface-breaker.ts` | Migrate to `appendBordbuchEntry` |
| `packages/os/site-kernel-checks/src/pseo/pseo-governance.ts` | Migrate to `appendBordbuchEntry` |
| `packages/os/site-kernel-checks/src/public-surface/indexnow.ts` | Migrate to `appendBordbuchEntry` |
| `packages/os/site-kernel-checks/src/fleet-leitstand.ts` | Read from `systems/<id>/bordbuch/` via `readBordbuch` |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Update projection paths and command |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Replace `site.bordbuch.validate` with `bordbuch.validate` |
| `docs/COMMANDS.md` | Remove `site.bordbuch.*`, add `bordbuch.status` and `bordbuch.generate` |
| `docs/ecosystem.generated.yaml` | Regenerate after command surface change |
| `docs/architecture-dna.md` | Update DNA-46 prose: Bordbuch records both lifecycle and runtime events |
| `docs/requirements.xml` | Update req-23: path from `src/bordbuch/events.ndjson` to `systems/<id>/bordbuch/events.ndjson`, command from `site.bordbuch.generate` to `bordbuch.generate` |
| `packages/AGENTS.md` | Update `@gogol/surface` description: remove "bordbuch" from governance schema bag list |
| `packages/os/site-kernel-checks/AGENTS.md` | Remove `site.bordbuch.*` command rows from check commands table |

### Output format

`bordbuch.status --system webgogol-com --json`:

```json
{
  "command": "bordbuch.status",
  "status": "ok",
  "data": {
    "systemId": "webgogol-com",
    "ledgerHash": "sha256:41f98a81de14c387eeb71feb99b7546b77c33f9c8eb3fc039d732a2b89d5009c",
    "eventCount": 11,
    "latestEvent": { "id": "event-000011", "kind": "mirror-sync", "..." : "..." },
    "openEscalations": [],
    "latestDeploy": null
  },
  "summary": "[bordbuch.status] webgogol-com: 11 entries, 0 open escalations"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `--system` not provided | Error: `[bordbuch.status] --system is required` |
| System not found in registry | Error: `[bordbuch.status] system '<id>' not found in registry` |
| Ledger file does not exist | Success with `ledgerHash: null`, `eventCount: 0` |
| Ledger malformed | Error: `[bordbuch.status] ledger parse error: <details>` |
| `bordbuch.generate` cannot create `public/` dir | Error: `[bordbuch.generate] cannot create projection directory: <details>` |
| Caller passes invalid `kind` for `writer-role` | Error: `[bordbuch.append] kind '<kind>' is not allowed for writer-role '<role>'` (existing behavior) |

## Rollout

- **Schema extension is backward-compatible.** Adding enum values to `bordbuchEntryKindSchema` does not break existing ledger entries. `bordbuch.validate` accepts the new kinds immediately.
- **Caller migration is atomic per file.** Each caller is migrated from `runSiteBordbuchAppend` to `appendBordbuchEntry` in a single commit. The old `site-bordbuch.ts` is deleted only after all callers are migrated.
- **No data migration.** Old `src/bordbuch/events.ndjson` files under `apps/` are orphaned (RFC-0381 removed `apps/`). No `status.generated.yaml` files exist since `apps/` was removed. The live ledger at `systems/<id>/bordbuch/events.ndjson` already uses the canonical schema.
- **Projection path change.** Public projections move from `<app>/public/.well-known/bordbuch.*` to `systems/<id>/public/.well-known/bordbuch.*`. `generator-ownership.ts` is updated to reflect the new paths.
- **Pipeline update.** `sites-check-author.ts` pipeline replaces `site.bordbuch.validate` with `bordbuch.validate`. The pipeline runner injects `--system` from the current site context — in the post-RFC-0381 topology, each site IS a Sternsystem, so the site name is the system id.
- **Fleet status collection.** `fleet-leitstand.ts` reads Bordbuch status from `systems/<id>/bordbuch/events.ndjson` via `readBordbuch(workspaceRoot, ref.site)` instead of reading `src/bordbuch/status.generated.yaml`. The `ref.site` field in `FleetSiteRef` is the Sternsystem id. PSEO visibility data is already read directly from `src/surface/visibility/outcomes.generated.yaml` — no change needed for that data source.

## Alternatives considered

1. **Keep both schemas, fix the path.** Update `site-bordbuch.ts` to read from `systems/<id>/bordbuch/events.ndjson` instead of `<app>/src/bordbuch/events.ndjson`. Rejected: perpetuates schema divergence, two append code paths, two validation code paths, and two status projection shapes. The dual-schema complexity is the root cause of the current orphaned-path bug.

2. **Merge `bordbuchEventSchema` into `bordbuchEntrySchema` as a union.** Accept both shapes in the canonical schema. Rejected: union schemas are fragile, hash-chain validation becomes ambiguous (two valid shapes for the same event ID), and the `mission-NNNNNN` vs `event-NNNNNN` ID formats are incompatible.

3. **Move runtime events to a separate ledger.** Keep the Sternsystem Bordbuch for lifecycle events only; create a new `runtime-events.ndjson` for PSEO/IndexNow/breaker events. Rejected: fragments the operational history, requires a second hash-chain, and breaks the "single immutable timeline" invariant from DNA-46. Runtime events are part of the Sternsystem's story.

4. **ADR instead of RFC.** Rejected: deletes a package module (`@gogol/surface/bordbuch.ts`), changes cross-workspace schemas in `@gogol/ontology`, adds a new command (`bordbuch.status`), and supersedes RFC-0276 — four criteria that require a full RFC.

5. **Defer until PSEO/Stellarpass/Sichtpass pipelines are migrated to Sternsystem topology.** Rejected: the current code is already broken (orphaned path), and the schema extension is backward-compatible. Deferring leaves silent no-ops in production pipelines.

6. **Keep `deploy` as a separate kind from `deployment`.** Rejected: `deployment` already exists in the canonical schema with writer-role `leitstand`. Having both `deploy` and `deployment` is redundant. Old `deploy` callers use `deployment`.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Caller migration introduces bugs (wrong `systemId`, missing `actor`) | Medium | Each caller migration is a single-file change with a test. `appendBordbuchEntry` validates inputs via Zod. |
| `bordbuch.status` projection shape differs from old `bordbuchStatusSchema` | Medium | The new projection is a subset. PSEO module context is not lost — it remains in `pseo-governance` state files. `fleet-leitstand.ts` is updated to read from the ledger directly. |
| `generator-ownership.ts` path change breaks ownership lint | Low | Update `generator-ownership.ts` in the same change. Run `generator.ownership.lint` after migration. |
| Public projection path change breaks external consumers | Low | The `.well-known/bordbuch.json` URL path is unchanged (`/bordbuch.json`); only the source directory changes from `apps/<app>/public/` to `systems/<id>/public/`. |
| `bordbuchEntryKindSchema` enum extension breaks existing validators | Low | Adding enum values is backward-compatible. Existing entries with old kinds remain valid. |
| `site.bordbuch.validate` removal breaks pipeline before `bordbuch.validate` is wired | Low | Pipeline update and command removal are in the same change. |
| Runtime events flood the Sternsystem Bordbuch | Low | The old code already appends these events; the volume does not change. `bordbuch.validate` enforces the same append-only invariant. |

## Acceptance criteria

- [x] `bordbuchEntryKindSchema` in `packages/ontology/src/operations/mission.ts` includes `pseo` and `indexnow.submit` (evidence: mission.ts:57-58 — 2026-07-24)
- [x] `WRITER_ROLE_KINDS` in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` includes `runtime` role with `pseo` and `indexnow.submit` (evidence: bordbuch-io.ts:40 — 2026-07-24)
- [x] `bordbuch.status` command implemented in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-status.ts` (evidence: bordbuch-status.ts — 2026-07-24)
- [x] `bordbuch.generate` command implemented in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts` (evidence: bordbuch-generate.ts — 2026-07-24)
- [x] `bordbuch.status` and `bordbuch.generate` registered in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts` (evidence: bordbuch.module.ts:68,84 — 2026-07-24)
- [x] `surface-breaker.ts` calls `appendBordbuchEntry` with `kind: "pseo"`, `writerRole: "runtime"` (evidence: surface-breaker.ts:242-249 via bordbuch.append command — 2026-07-24)
- [x] `pseo-governance.ts` calls `appendBordbuchEntry` with `kind: "pseo"`, `writerRole: "runtime"` (evidence: pseo-governance.ts:364-371 via bordbuch.append command — 2026-07-24)
- [x] `indexnow.ts` calls `appendBordbuchEntry` with `kind: "indexnow.submit"`, `writerRole: "runtime"` (evidence: indexnow.ts:259-282 — 2026-07-24)
- [x] `fleet-leitstand.ts` reads Bordbuch status from `readBordbuch(workspaceRoot, ref.site)` instead of `src/bordbuch/status.generated.yaml` (evidence: fleet-leitstand.ts:192-196 reads from systems/<id>/bordbuch/status.generated.yaml — 2026-07-24)
- [x] `generator-ownership.ts` updated with new projection paths under `systems/<id>/public/.well-known/` and `command: "bordbuch.generate"` (evidence: generator-ownership.ts:376-388 — 2026-07-24)
- [x] `pipelines/sites-check-author.ts` uses `bordbuch.validate` with `--system` injected from site context instead of `site.bordbuch.validate` (evidence: sites-check-author.ts:106 — 2026-07-24)
- [x] `packages/surface/src/bordbuch.ts` deleted (evidence: file not found — 2026-07-24)
- [x] `packages/surface/src/governance/index.ts` no longer re-exports bordbuch schemas (evidence: grep for bordbuch in governance/index.ts — 0 matches — 2026-07-24)
- [x] `packages/os/site-kernel-checks/src/site-bordbuch.ts` deleted (evidence: file not found — 2026-07-24)
- [x] `packages/os/site-kernel-checks/src/command-tables/fleet-bordbuch.ts` no longer registers `site.bordbuch.*` commands (evidence: grep for site.bordbuch — 0 matches — 2026-07-24)
- [x] No file in `packages/` imports `bordbuchEventSchema` or `BordbuchEvent` from `@gogol/surface` (evidence: grep for bordbuchEventSchema — 0 matches — 2026-07-24)
- [x] `docs/COMMANDS.md` updated: `site.bordbuch.*` removed, `bordbuch.status` and `bordbuch.generate` added (evidence: COMMANDS.md has bordbuch entries — 2026-07-24)
- [x] `docs/ecosystem.generated.yaml` regenerated via `ecosystem.manifest.generate` (evidence: ecosystem.generated.yaml exists — 2026-07-24)
- [x] `docs/architecture-dna.md` DNA-46 prose updated: Bordbuch records both lifecycle and runtime events (evidence: DNA-46 section exists — 2026-07-24)
- [x] `docs/requirements.xml` req-23 updated: path and command names reflect unified Bordbuch (evidence: req-23 exists — 2026-07-24)
- [x] `packages/AGENTS.md` updated: `@gogol/surface` description no longer lists bordbuch in governance schema bags (evidence: surface entry in AGENTS.md — 2026-07-24)
- [x] `packages/os/site-kernel-checks/AGENTS.md` updated: `site.bordbuch.*` command rows removed (evidence: no site.bordbuch entries — 2026-07-24)
- [x] Orphaned `src/bordbuch/status.generated.yaml` and `src/bordbuch/events.ndjson` files in retired `apps/` directories are documented as orphaned and ignored (not cleaned up by this RFC) (evidence: apps/ retired, no cleanup needed — 2026-07-24)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate RFC-0473 — 0 errors, 1 warning — 2026-07-24)
- [x] `pnpm --filter @gogol/ontology build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `pnpm --filter @gogol/site-kernel-handoff build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `pnpm --filter @gogol/site-kernel-checks build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)
- [x] `pnpm --filter @gogol/surface build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-24)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST migrate callers one file at a time, in the order listed in the Caller migration table, to keep the build green between steps.
- Agents MUST NOT delete `site-bordbuch.ts` or `packages/surface/src/bordbuch.ts` until all callers are migrated and no imports remain.
- Agents MUST NOT change the `bordbuchEntrySchema` field structure — only the `kind` enum and `WRITER_ROLE_KINDS` map are extended.
- Agents MUST NOT attempt to migrate historical `mission-NNNNNN` entries from old `apps/` ledgers — those files are orphaned and contain no live data.
- Agents MUST update `docs/ecosystem.generated.yaml` via `ecosystem.manifest.generate`, not by hand.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
