---
id: RFC-0573
title: "Add mission.archive command for terminal-status mission archiving"
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
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-28
implementedAt: 2026-07-28
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - RFC-0355
  - RFC-0367
  - RFC-0480
  - RFC-0521
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
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
    - mission.archive
  added:
    - mission.archive
  changed:
    - docs.archive
    - mission.list
    - mission.status
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/forge"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "Closed/aborted mission directories move to missions/archive/<state>/ via mission.archive"
  - "docs.archive umbrella includes mission.archive alongside rfc/adr/plan/audit/session archive"
  - "mission.list excludes archived missions from the active listing"
  - "mission.status --mission <id> resolves archived missions by searching both missions/ and missions/archive/"
nonGoals:
  - "Does not delete mission evidence bundles — those are permanent audit artifacts preserved by mission.cleanup"
  - "Does not abort or close missions — use mission.abort or mission.close for lifecycle transitions"
  - "Does not remove workpiece or distribution directories — use mission.cleanup before archiving"
  - "Does not archive open missions — only terminal-state (closed/aborted) missions are moved"
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

# RFC-0573: Add mission.archive command for terminal-status mission archiving

## Context

The `missions/` directory accumulates mission directories over time. Each mission (`<systemId>-m<NNNNNN>`) passes through the lifecycle defined by DNA-46: `open → closed | aborted`. After a mission reaches a terminal state, `mission.cleanup` (RFC-0480) removes the disposable `workpiece/` and `distribution/` directories, leaving `mission.yaml` and `evidence/` as permanent audit artifacts.

However, the mission directory itself remains in `missions/` indefinitely. Over time, this clutters the active workspace with dozens or hundreds of terminal-state mission directories that are no longer operationally relevant. Operators must visually scan past closed and aborted missions to find the current open one.

This is the same problem that RFC-0367 solved for RFC and ADR documents: terminal-status files accumulated in `docs/rfcs/` and `docs/adrs/`, obscuring active drafts. RFC-0367 introduced `rfc.archive` and `adr.archive` commands that move terminal-status files into `archive/<status>/` subdirectories. RFC-0521 extended this to plans, audits, and sessions, and created the `docs.archive` umbrella command.

Missions have no equivalent archiving mechanism. The `missions/` directory has no `archive/` subdirectory, and no command moves terminal-state missions out of the active listing.

## Problem

There is no command to archive terminal-state missions. After `mission.close` or `mission.abort` (and optional `mission.cleanup`), the mission directory stays in `missions/` alongside active missions. This creates several issues:

- **Workspace clutter:** The `missions/` directory grows unboundedly. Operators cannot distinguish active from archived missions at a glance.
- **Inconsistency with document archiving:** RFCs, ADRs, plans, audits, and sessions all have `*.archive` commands and `archive/<status>/` subdirectories. Missions — the only other artifact type that accumulates terminal-state entries — do not.
- **No `docs.archive` coverage:** The `docs.archive` umbrella command archives five document types but not missions. Operators who run `docs.archive` to clean up all terminal artifacts still have mission directories left behind.
- **`mission.list` noise:** `mission.list` (via `listMissionDirs()`) scans all directories in `missions/`, including closed and aborted missions. There is no way to exclude terminal-state missions from the listing.

## Decision

The kernel gains a `mission.archive` command that moves terminal-state mission directories (`state: closed` or `state: aborted` in `mission.yaml`) into `missions/archive/<state>/<missionId>/` subdirectories. The command is bidirectional: open missions found inside `archive/` are moved back to `missions/`. The command is integrated into the `docs.archive` umbrella as a sixth sub-command.

## Architectural fit

- **DNA-46 (Mission lifecycle):** This RFC extends the mission lifecycle with a post-terminal archiving step. The lifecycle remains `open → closed | aborted`, but after `mission.cleanup` removes disposable artifacts, `mission.archive` moves the remaining `mission.yaml` + `evidence/` into `missions/archive/<state>/`. This does not change the lifecycle state machine — it adds a filesystem organization step after the terminal state is reached.
- **RFC-0367 (Document archiving):** This RFC applies the same archiving pattern established by RFC-0367 (rfc.archive, adr.archive) to missions. The `archive/<status>/` subdirectory convention, bidirectional behavior, `--dry-run` and `--status` flags, and skip-on-destination-exists semantics are all directly analogous.
- **RFC-0521 (docs.archive umbrella):** This RFC extends the `docs.archive` umbrella command to include `mission.archive` as a sixth sub-command, alongside `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, and `session.archive`.
- **RFC-0480 (mission.cleanup):** This RFC is complementary to `mission.cleanup`. The recommended workflow is `mission.cleanup` (remove workpiece/distribution) → `mission.archive` (move remaining directory to archive). `mission.archive` does not require prior cleanup — it checks only `mission.yaml` state, not the presence of workpiece/distribution directories.
- **Site OS operator model:** `mission.archive` is registered in a new `forgeMissionModule` in `packages/forge/os/mission/mission.module.ts`, following the same pattern as `forgePlanModule`, `forgeAuditModule`, and `forgeSessionModule`. The `docs.archive` umbrella command (in `forgeCoreModule`) imports `runMissionArchive` via dynamic import and calls it as a sixth sub-command. The forge autonomy guard forbids `@warpgogol/*` imports in `packages/forge/`, so the handler reads `mission.yaml` directly via `node:fs` and the `yaml` package (already a dependency of `@warpgogol/forge`). The mission lifecycle commands (open, close, abort, list, status) remain in `site-kernel-handoff`; only the archiving handler moves to forge.

## Design

### CLI surface

```sh
# Archive all terminal-state missions (dry-run first)
pnpm exec site-kernel run mission.archive --dry-run
pnpm exec site-kernel run mission.archive

# Archive only closed missions
pnpm exec site-kernel run mission.archive --status closed

# Archive only aborted missions
pnpm exec site-kernel run mission.archive --status aborted

# Via the docs.archive umbrella (runs mission.archive alongside rfc/adr/plan/audit/session)
pnpm exec site-kernel run docs.archive --dry-run
pnpm exec site-kernel run docs.archive
```

**Flags:**

| Flag        | Kind    | Required | Description                                                  |
| ----------- | ------- | -------- | ------------------------------------------------------------ |
| `--dry-run` | boolean | no       | Preview what would be moved without touching the filesystem. |
| `--status`  | string  | no       | Filter to a single terminal state (`closed` or `aborted`).   |

**Scope:** `workspace`. The command scans `missions/` at the workspace root.

### TypeScript contracts

```ts
export const MISSION_TERMINAL_STATES = ["closed", "aborted"] as const;

export interface MissionArchiveMove {
  missionId: string;
  state: string;
  from: string;
  to: string;
  direction: "into-archive" | "out-of-archive";
}

export interface MissionArchiveSkip {
  missionId: string;
  dir: string;
  reason: string;
}

export interface MissionArchiveResult {
  command: "mission.archive";
  status: "ok";
  moved: MissionArchiveMove[];
  skipped: MissionArchiveSkip[];
  dryRun: boolean;
}
```

The handler reads each mission directory in `missions/` (excluding the `archive/` subdirectory), parses `mission.yaml`, and checks `state`. Terminal-state missions are moved to `missions/archive/<state>/<missionId>/`. Missions inside `archive/` with non-terminal state are moved back to `missions/<missionId>/`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/mission.yaml` | Read to determine `state` (open, closed, aborted) |
| `missions/<missionId>/` | Moved to `missions/archive/<state>/<missionId>/` when terminal |
| `missions/archive/<state>/<missionId>/` | Destination for archived missions; created if it does not exist |
| `missions/archive/` | Scanned for non-terminal missions to move back to `missions/` |

The command does **not** read or modify:

- `missions/<missionId>/workpiece/` — disposable, managed by `mission.cleanup`
- `missions/<missionId>/distribution/` — disposable, managed by `mission.cleanup`
- `missions/<missionId>/evidence/` — permanent audit artifacts, preserved as-is during move
- `systems/<systemId>/bordbuch/events.ndjson` — Bordbuch is not modified by archiving

### Output format

```json
{
  "command": "mission.archive",
  "status": "ok",
  "moved": [
    {
      "missionId": "warpgogol-com-m000010",
      "state": "closed",
      "from": "missions/warpgogol-com-m000010",
      "to": "missions/archive/closed/warpgogol-com-m000010",
      "direction": "into-archive"
    }
  ],
  "skipped": [
    {
      "missionId": "warpgogol-com-m000016",
      "dir": "missions/warpgogol-com-m000016",
      "reason": "state open is non-terminal"
    }
  ],
  "dryRun": false
}
```

### Failure modes

- **Unreadable `mission.yaml`:** The mission is skipped with reason `"unreadable manifest"`. The command does not fail.
- **Destination already exists:** If `missions/archive/<state>/<missionId>/` already exists, the mission is skipped with reason `"destination exists"`. This prevents silent overwrites.
- **`--status` with invalid value:** The command throws an error: `Invalid --status "<value>". Must be one of: closed, aborted`.
- **No `missions/` directory:** The command returns an empty result with `moved: []` and `skipped: []`.
- **`fs.rename` ENOENT:** If the source directory was moved by another process between scanning and renaming, the mission is skipped with reason `"already moved by another process"`.

### Module registration

A new `forgeMissionModule` is created in `packages/forge/os/mission/mission.module.ts`, following the pattern of `forgePlanModule` (`packages/forge/os/plan/plan.module.ts`) and `forgeAuditModule` (`packages/forge/os/audit/audit.module.ts`). The module registers the `mission.archive` command with its flags, scope, writes, and reads.

Three additional files must be updated for the module to be consumable:

1. **`packages/forge/src/index.ts`** — export `forgeMissionModule` from `../os/mission/mission.module.ts`, alongside the existing forge module exports (line 128–139).
2. **`tools/kernel.config.ts`** — add a module loader entry: `"forge-mission": async () => (await import("@warpgogol/forge/os/mission-module")).forgeMissionModule`, alongside the existing `"forge-plan"`, `"forge-audit"`, and `"forge-session"` entries.
3. **`packages/forge/AGENTS.md`** — add a `forgeMissionModule` row to the OS modules table: `| forgeMissionModule | mission.archive | os/mission/ |`.

#### `docs.archive` (packages/forge/os/core/core.module.ts)

The `docs.archive` umbrella command is extended to include `mission.archive` as a sixth sub-command. The `subCommands` array gains:

```ts
const { runMissionArchive } = await import("../mission/handlers/archive.ts");
// ...
{ name: "mission.archive", fn: runMissionArchive as ArchiveHandler },
```

The `writes` and `reads` arrays are extended to include `missions/**` paths. The command description is updated from "runs rfc.archive, adr.archive, plan.archive, audit.archive, and session.archive" to include `mission.archive`.

#### `mission.list` (packages/os/site-kernel-handoff/src/mission/mission-io.ts)

`listMissionDirs()` is updated to exclude the `archive/` subdirectory from its scan. Currently it reads all directories in `missions/`; after this RFC, it skips any entry named `archive`. This ensures `mission.list` shows only active (non-archived) missions.

#### `mission.status` (packages/os/site-kernel-handoff/src/mission/mission-io.ts)

`resolveMissionDir()` is updated to search both `missions/<missionId>/` and `missions/archive/<state>/<missionId>/` (for each terminal state). If the mission is not found at the primary path, the resolver checks the archive paths. This allows `mission.status --mission <id>` to work with archived missions without requiring the operator to know the archive path.

## Rollout

- **Default behavior:** `mission.archive` is a standalone, opt-in command. It does not run automatically as part of any pipeline. Operators run it manually when they want to clean up the `missions/` directory.
- **No flag day:** Existing missions are unaffected. The command can be run at any time — it scans the current state of `missions/` and moves only terminal-state missions. Missions that are still open are skipped.
- **Recommended workflow:** `mission.cleanup --mission <id>` (or `--older-than 30d`) → `mission.archive` (or `mission.archive --status closed`). This two-step workflow separates disposal (cleanup) from organization (archive).
- **`docs.archive` integration:** The umbrella command now includes `mission.archive`. Operators who already run `docs.archive` to archive terminal documents will automatically archive terminal missions in the same invocation.
- **No migration path needed:** The `missions/archive/` directory is created on demand by the command. No existing data needs to be moved before the command is available.

## Alternatives considered

- **Extend `mission.cleanup` to also archive:** Rejected. `mission.cleanup` (RFC-0480) is a disposal command — it deletes `workpiece/` and `distribution/`. Archiving is an organizational command — it moves directories. Mixing deletion and movement in one command conflates two distinct concerns and makes `--dry-run` output harder to interpret (which paths will be deleted vs. moved?). Keeping them separate follows the single-responsibility principle and matches the document archiving pattern (rfc.archive does not delete files, it moves them).

- **Implement in `site-kernel-handoff` instead of `forge/os`:** Rejected. The operator requested integration into `docs.archive`, which lives in `packages/forge/os/core/`. The forge autonomy guard forbids `@warpgogol/*` imports in `packages/forge/`, so the handler cannot live in `site-kernel-handoff` and be called by `docs.archive`. Placing the handler in `packages/forge/os/mission/` keeps it alongside the other archive handlers (`rfc/archive.ts`, `adr/handlers/archive.ts`, `plan/handlers/archive.ts`, `audit/handlers/archive.ts`, `session/handlers/archive.ts`) and allows `docs.archive` to import it directly.

- **Add `--system` flag for filtering by Sternsystem:** Rejected. The operator preferred a minimal flag set matching `rfc.archive` (`--dry-run` + `--status` only). Mission IDs already contain the systemId prefix (`warpgogol-com-m000010`), so operators can identify which system a mission belongs to from the archive output without a filter flag.

- **Unidirectional (terminal → archive only):** Rejected. Bidirectional behavior is consistent with all existing archive commands (`rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`). If a mission is manually moved back to `missions/` and its state is still terminal, re-running `mission.archive` moves it again. If a mission in `archive/` has its state changed to `open` (anomaly), the command moves it back to `missions/`.

## Risks

- **Agent confusion about workflow order:** Agents may run `mission.archive` before `mission.cleanup`, archiving missions with large `workpiece/` directories still present. This is not harmful (the move operation handles it), but it results in larger archive directories. The recommended workflow is documented as `cleanup → archive`, but the command does not enforce this order. Risk is low — the command works correctly regardless of cleanup state.
- **`mission.status` path resolution performance:** `resolveMissionDir()` now checks up to three paths (primary + two archive states) instead of one. This adds at most two `existsSync` calls per invocation, which is negligible.
- **`mission.list` missing archived missions:** Operators who rely on `mission.list` to see all missions (including historical ones) will no longer see archived missions. This is intentional (archived = not active), but if an operator needs to inspect an archived mission, they must use `mission.status --mission <id>` (which searches archive paths) or browse `missions/archive/` directly.
- **`docs.archive` runtime mismatch:** `docs.archive` runs in the forge runtime, while mission lifecycle commands run in the site-kernel runtime. `mission.archive` is registered in the forge runtime (forgeMissionModule), so `docs.archive` can call it directly. However, `mission.archive` is not available via `site-kernel run` unless the forge module is loaded. This is the same pattern as `rfc.archive` and `adr.archive` — they are forge commands, not site-kernel commands. Risk is low — the kernel config loads forge modules.
- **TOCTOU race with concurrent lifecycle commands:** If `mission.archive` runs concurrently with `mission.close` or `mission.abort`, the archive handler might read a partially-written `mission.yaml` (the lifecycle command writes the manifest via `atomicWriteFile`, but there is a window between the write and the archive handler's read). This is the same TOCTOU risk that all existing archive commands share with respect to their respective lifecycle commands. `fs.rename` is atomic on a single filesystem, so the move operation itself is safe. The handler's skip-on-unreadable-manifest behavior (Failure modes) mitigates the impact: a partially-written file is skipped, not misinterpreted. No additional locking is introduced — the existing archive commands do not use locks, and adding them here would be inconsistent.

## Acceptance criteria

- [x] `mission.archive` command registered in `forgeMissionModule` with `--dry-run` and `--status` flags (evidence: packages/forge/os/mission/mission.module.ts:21-44)
- [x] `forgeMissionModule` exported from `packages/forge/src/index.ts` and registered in `tools/kernel.config.ts` (evidence: packages/forge/src/index.ts:139, tools/kernel.config.ts:84-85)
- [x] `packages/forge/AGENTS.md` OS modules table includes `forgeMissionModule` row (evidence: packages/forge/AGENTS.md:27)
- [x] `mission.archive --dry-run` reports what would be moved without touching the filesystem (evidence: archive.test.ts:112-123, dry-run test passes)
- [x] `mission.archive` moves terminal-state missions to `missions/archive/<state>/<missionId>/` (evidence: archive.test.ts:64-75, closed→archive/closed/ test passes)
- [x] `mission.archive` is bidirectional — open missions in `archive/` are moved back to `missions/` (evidence: archive.test.ts:153-169, out-of-archive test passes)
- [x] `docs.archive` umbrella includes `mission.archive` as a sixth sub-command (evidence: packages/forge/os/core/core.module.ts:336)
- [x] `docs.archive` command description updated to mention `mission.archive` (evidence: packages/forge/os/core/core.module.ts:272-276)
- [x] `mission.list` excludes the `archive/` subdirectory from its scan (evidence: packages/os/site-kernel-handoff/src/mission/mission-io.ts:67-69)
- [x] `mission.status --mission <id>` resolves archived missions by searching both `missions/` and `missions/archive/<state>/` (evidence: packages/os/site-kernel-handoff/src/mission/mission-io.ts:22-31)
- [x] `--json` output format matches `MissionArchiveResult` interface (evidence: packages/forge/os/mission/types.ts:28-34, handler returns MissionArchiveResult)
- [x] Unit tests cover: terminal → archive, open ← archive, skip on destination exists, skip on unreadable manifest, `--status` filter, `--dry-run` (evidence: packages/forge/os/mission/handlers/archive.test.ts, 10/10 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate RFC-0573` → pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `mission.archive` handler MUST live in `packages/forge/os/mission/handlers/archive.ts` — not in `packages/os/site-kernel-handoff/`. This is required by the forge autonomy guard and the `docs.archive` integration.
- The `mission.archive` handler MUST NOT import from `@warpgogol/*` packages. It reads `mission.yaml` directly via `node:fs` and the `yaml` package (already a dependency of `@warpgogol/forge`), the same way `rfc.archive` reads RFC frontmatter. The handler does NOT use `missionManifestSchema` from `@warpgogol/ontology/operations` for schema validation — it reads only the `state` field from the parsed YAML. If `mission.yaml` has an unexpected shape (missing or misspelled `state` field), the handler skips it with reason `"unreadable manifest"` rather than failing loudly. This tradeoff is consistent with how `rfc.archive` reads frontmatter without full schema validation.
- A new `forgeMissionModule` MUST be created in `packages/forge/os/mission/mission.module.ts` and exported from `packages/forge/src/index.ts`. A module loader entry MUST be added to `tools/kernel.config.ts`. The `packages/forge/AGENTS.md` OS modules table MUST be updated with the new module row.
- `listMissionDirs()` in `packages/os/site-kernel-handoff/src/mission/mission-io.ts` MUST filter out the `archive` entry from the directory listing.
- `resolveMissionDir()` in `packages/os/site-kernel-handoff/src/mission/mission-io.ts` MUST check archive paths as a fallback when the mission is not found at the primary path.
