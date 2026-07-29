---
id: RFC-0574
title: "Relocate Sternsystem storage outside monorepo and introduce parameterized mirror topology"
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
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-29
implementedAt: 2026-07-28
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0354
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - DNA-46
  - DNA-47
  - RFC-0354
  - RFC-0356
  - RFC-0472
  - RFC-0477
  - RFC-0480
  - RFC-0568
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
  - DNA-45
  - DNA-46
  - DNA-47
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
breaksC: true
commands:
  proposed: []
  added: []
  changed:
    - sternsystem.sync
    - sternsystem.validate
    - sternsystem.register
    - sternsystem.pin
    - sternsystem.status
    - sternsystem.extract
    - mission.materialize
    - mission.reconcile
    - mission.open
    - mission.close
    - mission.abort
    - notausgang.export
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/ontology"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "systems/ directory contains only registry.yaml — no per-system subdirectories"
  - "mirrors[0] in registry.yaml is non-bare and exists on disk"
  - "sternsystem.validate enforces mirror topology rules"
  - "mission.materialize clones from mirrors[0] path"
  - "mission.reconcile merges back to mirrors[0] path"
  - "sternsystem.sync synchronizes all git-accessible mirrors via star topology through cache"
nonGoals:
  - "Does not change the mission workpiece lifecycle (open/materialize/validate/reconcile/close)"
  - "Does not change the Bordbuch hash-chain mechanism or Bordbuch git synchronization protocol — but the Bordbuch storage path changes from systems/<id>/bordbuch/ to mirrors[0].path/bordbuch/ (path relocation, not mechanism change)"
  - "Does not introduce a new backup command — sternsystem.sync handles all mirror synchronization"
  - "Does not change the Notausgang export or release artifact store"
  - "Does not modify the Bordbuch entry schema or Bordbuch event types"
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

# RFC-0574: Relocate Sternsystem storage outside monorepo and introduce parameterized mirror topology

## Context

Sternsystem storage currently lives inside the monorepo as `systems/<id>/` — a non-bare git working tree ("cache clone") that serves as the source for `mission.materialize` and the target for `mission.reconcile`. A separate bare repo (`systems-git/<id>`, configured via `entry.repo` in `systems/registry.yaml`) acts as the durable store. An optional external mirror (`entry.mirror`, typically GitHub) receives pushes via `sternsystem.sync`.

This layout has three structural issues:

1. **`systems/<id>/` is inside the monorepo working tree.** Agents can accidentally edit files under `systems/<id>/` directly, bypassing the mission workflow. The AGENTS.md rule exists but is enforced only by discipline — no filesystem boundary prevents it.
2. **Registry schema is single-repo + single-mirror.** `fleetRegistryEntrySchema` has one `repo:` field (bare repo path) and one optional `mirror:` field (external remote). This limits topology to exactly two git endpoints and provides no way to declare additional mirrors (backup servers, alternative protocols).
3. **Backup is ad-hoc.** There is no parameterized way to declare backup mirrors with non-git protocols (FTP, S3, rsync). Operators must manually copy bare repos or set up external cron jobs.

## Problem

- **DNA-44 (Sternsystem bundle contract)** states that Sternsystem repos live "outside the monorepo workspace," but `systems/<id>/` cache clones are physically inside the monorepo. The boundary is conventional, not structural.
- **DNA-45 (Fleet registry)** schema limits storage declaration to one `repo:` + one `mirror:`. Multiple mirrors, backup protocols, and storage type metadata cannot be expressed.
- **DNA-46 (Mission lifecycle)** and **DNA-47 (Materialization)** depend on `mission.materialize` cloning from `systems/<id>/` and `mission.reconcile` merging back. These paths are hardcoded to `path.join(workspaceRoot, "systems", systemId)` in `mission-materialize.ts` (line 282, 575) and `mission-materialization-commands.ts` (line 483). Relocating the cache clone requires updating all hardcoded path references.
- **Agent discipline gap:** The AGENTS.md rule "Agents MUST NOT edit files under `systems/<id>/` directly" is enforced only by convention. An agent that ignores or forgets the rule can modify canonical content without going through a mission, violating the edits-only-through-missions invariant (RFC-0480).
- **No backup topology:** `sternsystem.sync` (RFC-0472) pushes to a single `mirror` remote via git. There is no mechanism to declare or synchronize additional backup mirrors using non-git protocols.

## Decision

The `systems/<id>/` cache clone directory is relocated outside the monorepo to a parameterized `mirrors[]` array in `systems/registry.yaml`. The first mirror entry (`mirrors[0]`) is always a non-bare git repository and serves as the cache clone for mission lifecycle. Additional mirrors (bare repos, external remotes, backup endpoints) are declared with `storageType: non-bare | bare | bundle` and synchronized via star topology through `mirrors[0]` using `sternsystem.sync`. The `repo:` and `mirror:` fields are replaced by `mirrors[]`.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** Enforces the "outside the monorepo workspace" boundary structurally rather than conventionally. Cache clones are no longer inside the monorepo working tree.
- **DNA-45 (Fleet registry):** Extends the registry schema from single `repo:`/`mirror:` to a parameterized `mirrors[]` array with `storageType` metadata. The registry remains the single source of truth for fleet state.
- **DNA-46 (Mission lifecycle):** `mission.materialize` and `mission.reconcile` resolve the cache clone path from `mirrors[0].path` instead of the hardcoded `systems/<id>/` path. The lifecycle itself (open → materialize → validate → reconcile → close) is unchanged.
- **DNA-47 (Materialization):** Materialization still clones from the cache clone (now `mirrors[0]`) and reconciles back to it. The shared git object database mechanism (RFC-0568) is preserved.
- **RFC-0472 (sternsystem.sync):** Extended from single-mirror push to star-topology synchronization through `mirrors[0]`. Git-accessible mirrors receive `git push`; `bundle` storage type mirrors receive `git bundle` + file copy.
- **RFC-0480 (edits-only-through-missions):** Reinforced by the physical boundary — `systems/<id>/` is no longer in the monorepo, making accidental direct edits structurally harder.
- **RFC-0568 (clone-based materialization):** Unchanged. `mission.materialize` still clones from the cache clone (`mirrors[0]`) into the workpiece with shared git object database.

## Design

### CLI surface

No new commands are introduced. Existing commands are modified to resolve paths from `mirrors[0]` instead of `systems/<id>/`.

```sh
# sternsystem.sync — now synchronizes all mirrors via star topology through mirrors[0]
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com
pnpm exec site-kernel run sternsystem.sync --id warpgogol-com --all

# sternsystem.validate — now validates mirror topology rules
pnpm exec site-kernel run sternsystem.validate
pnpm exec site-kernel run sternsystem.validate --id warpgogol-com --json

# mission.materialize — resolves cache clone from mirrors[0].path
pnpm exec site-kernel run mission.materialize --mission warpgogol-com-m000017

# mission.reconcile — merges back to mirrors[0].path
pnpm exec site-kernel run mission.reconcile --mission warpgogol-com-m000017
```

### TypeScript contracts

#### Registry schema (`@warpgogol/ontology/operations`)

```ts
const mirrorStorageTypeSchema = z.enum(["non-bare", "bare", "bundle"]);

type MirrorStorageType = z.infer<typeof mirrorStorageTypeSchema>;

const mirrorEntrySchema = z.object({
  path: z.string().min(1),
  storageType: mirrorStorageTypeSchema,
});

type MirrorEntry = z.infer<typeof mirrorEntrySchema>;

// fleetRegistryEntrySchema changes:
//   repo: string          -> REMOVED
//   mirror: string?       -> REMOVED
//   mirrors: MirrorEntry[] -> ADDED (min 1 item)

const fleetRegistryEntrySchema = z.object({
  id: z.string().regex(kebabRe),
  cosmicStar: starNameSchema,
  mirrors: z.array(mirrorEntrySchema).min(1),
  pinnedPlatform: z.string().regex(semverRe),
  currentMission: z.string().nullable().default(null),
  lastRelease: z.string().nullable().default(null),
  status: z.enum(["registered", "active", "paused", "archived"]),
  registeredAt: z.string().datetime(),
  deployment: deploymentConfigSchema.optional(),
  owner: z.string().regex(didWebRe).optional(),
  notes: z.string().default(""),
});
```

#### Path resolution helper (`@warpgogol/site-kernel-handoff`)

```ts
interface MirrorResolution {
  cachePath: string;       // mirrors[0].path resolved to absolute
  gitMirrors: MirrorEntry[]; // mirrors with git-accessible protocols
  backupMirrors: MirrorEntry[]; // mirrors with bundle storageType
}

function resolveMirrors(
  workspaceRoot: string,
  entry: FleetRegistryEntry,
): MirrorResolution;
```

The protocol is inferred from the `path` string:

- `file://`, relative paths (`./`, `../`), absolute paths (`/`) -> file protocol
- `git@`, `ssh://` -> SSH protocol
- `https://`, `http://` -> HTTPS protocol
- `ftp://`, `sftp://` -> FTP protocol
- `s3://` -> S3 protocol
- `rsync://` -> rsync protocol

Git-accessible protocols: `file`, `ssh`, `https`. Non-git protocols (`ftp`, `s3`, `rsync`) require `storageType: bundle`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/registry.yaml` | Stays in monorepo. Contains `mirrors[]` instead of `repo:`/`mirror:`. |
| `systems/<id>/` | **Removed** from monorepo. Cache clone relocated to `mirrors[0].path`. |
| `mirrors[0].path` (external) | Non-bare git repo. Cache clone for mission lifecycle. Browsable by operator. Contains `bordbuch/`, `system.pin.json`, content. |
| `mirrors[1..N].path` (external) | Additional mirrors: bare repos, external remotes, backup endpoints. |
| `packages/ontology/src/operations/sternsystem.ts` | Schema definition: `fleetRegistryEntrySchema` gains `mirrors[]`, loses `repo:`/`mirror:`. |
| `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` | `resolveRegistryPath` unchanged. Path resolution helpers updated. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | Star-topology sync: push from cache to git mirrors, bundle+copy to backup mirrors. Post-receive hook removed from bare mirrors. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | New validation rules for mirror topology. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` | 5 call sites (lines 89, 116, 123, 130, 260) updated to use `mirrors[0].path`. `--repo`/`--mirror` flags replaced by `--mirrors`. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts` | `cacheDir` resolves from `mirrors[0].path` (line 63). |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts` | `systemDir` resolves from `mirrors[0].path` (line 98). |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` | `systemDir` resolves from `mirrors[0].path` (line 81). |
| `packages/os/site-kernel-handoff/src/sternsystem/mirror-hook.ts` | Post-receive hook removed — `sternsystem.sync` handles all propagation in star topology. |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | `syncCacheClone` and `systemDir` resolve from `mirrors[0].path` instead of `path.join(workspaceRoot, "systems", systemId)`. |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `runMissionReconcile` and `runMissionDiff` resolve `systemDir` from `mirrors[0].path` (lines 244, 378, 483). |
| `packages/os/site-kernel-handoff/src/mission/mission-open.ts` | `pinPath` and `commitAndPushBordbuch` resolve from `mirrors[0].path` (lines 85, 144). |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | `commitAndPushBordbuch` resolves from `mirrors[0].path` (line 187). |
| `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` | `commitAndPushBordbuch` resolves from `mirrors[0].path` (line 138). |
| `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` | Bordbuch and pin paths resolve from `mirrors[0].path` (lines 205, 212). |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | `siteDir` resolves from `mirrors[0].path` (line 50). |
| `AGENTS.md` | Updated rules: "Monorepo layout" section, "External mirror sync" section, and "Agents MUST NEVER edit any Sternsystem mirror directly." |

### Output format

#### sternsystem.validate (additions to existing output)

```json
{
  "command": "sternsystem.validate",
  "status": "fail",
  "violations": [
    {
      "systemId": "warpgogol-com",
      "rule": "mirror-first-not-non-bare",
      "message": "mirrors[0] must have storageType 'non-bare' (got 'bare')"
    },
    {
      "systemId": "warpgogol-com",
      "rule": "mirror-empty",
      "message": "mirrors[] must contain at least 1 entry"
    },
    {
      "systemId": "warpgogol-com",
      "rule": "mirror-not-found",
      "message": "mirrors[0] path '/home/.../systems-cache/warpgogol-com' does not exist on disk"
    },
    {
      "systemId": "warpgogol-com",
      "rule": "mirror-bundle-git-protocol",
      "message": "mirror with storageType 'bundle' cannot use git protocol 'ssh' — use ftp/s3/rsync"
    }
  ]
}
```

#### sternsystem.sync (extended output)

```json
{
  "command": "sternsystem.sync",
  "status": "ok",
  "data": {
    "systemId": "warpgogol-com",
    "direction": "push",
    "syncedMirrors": [
      { "path": "file:///.../systems-git/warpgogol-com", "storageType": "bare", "method": "git-push", "status": "ok" },
      { "path": "git@github.com:.../warpgogol-com.git", "storageType": "bare", "method": "git-push", "status": "ok" },
      { "path": "ftp://backup.example.com/warpgogol-com.bundle", "storageType": "bundle", "method": "git-bundle-copy", "status": "ok" }
    ],
    "syncedAt": "2026-07-28T19:30:00.000Z"
  }
}
```

### Failure modes

**sternsystem.validate** — hard fail (exit 1) on any violation:

- `mirror-empty`: `mirrors[]` has zero entries.
- `mirror-first-not-non-bare`: `mirrors[0].storageType` is not `non-bare`.
- `mirror-not-found`: `mirrors[0].path` does not exist on disk.
- `mirror-bundle-git-protocol`: `storageType: bundle` with a git-accessible protocol (file/ssh/https) — illogical combination.
- `mirror-credentials`: path contains embedded credentials (existing rule, retained).

**sternsystem.sync** — non-fatal per-mirror failures:

- Git push to a mirror fails (network error, non-fast-forward) → logged, continues to next mirror. Overall exit code is 1 if any mirror failed, 0 if all succeeded.
- Bundle creation fails → logged, continues to next mirror.
- Bundle copy to backup endpoint fails (FTP/S3/rsync error) → logged, continues.
- Bordbuch append failure → logged as error, does not block sync completion.

**mission.materialize / mission.reconcile** — hard fail (throw):

- `mirrors[0].path` does not exist → `[mission.materialize] cache clone not found at <path> — run sternsystem.sync first`.
- `mirrors[0]` is not a git repo → existing error message unchanged, path updated.

Pretty vs JSON output: identical semantics. Pretty mode logs to stderr/stdout with colored prefixes. JSON mode returns structured `violations[]` / `syncedMirrors[]` arrays.

## Rollout

### Migration order

The migration is **atomic** — all changes land in a single commit wave. There is no dual-schema period and no fallback logic. The ecosystem is forward-only.

1. **Schema change** (`@warpgogol/ontology`): Replace `repo:` and `mirror:` in `fleetRegistryEntrySchema` with `mirrors: z.array(mirrorEntrySchema).min(1)`. Add `mirrorEntrySchema` and `mirrorStorageTypeSchema`. Remove `repoRe` (no longer needed). Export `MirrorEntry` and `MirrorStorageType` types.
2. **Path resolution** (`@warpgogol/site-kernel-handoff`): Add `resolveMirrors()` helper. Update **all** 13+ files with hardcoded `path.join(workspaceRoot, "systems", ...)` references to use `resolveMirrors()` (see File system responsibilities table for the complete list).
3. **Registry migration**: Convert the single entry in `systems/registry.yaml` from `repo:` + `mirror:` to `mirrors[]` in the same commit:
   ```yaml
   # Before
   repo: ../systems-git/warpgogol-com
   mirror: git@github.com:syrokomskyi/warpgogol-com.git
   # After
   mirrors:
     - path: ../systems-cache/warpgogol-com
       storageType: non-bare
     - path: ../systems-git/warpgogol-com
       storageType: bare
     - path: git@github.com:syrokomskyi/warpgogol-com.git
       storageType: bare
   ```
4. **Physical relocation**: Move `systems/<id>/` directories to their new `mirrors[0].path` locations outside the monorepo. The existing git history in each cache clone is preserved. After the move, update the `origin` git remote in each cache clone to point to the new relative path of the bare mirror (`mirrors[1].path`), since relative paths change when the cache clone moves from `systems/<id>/` to `../systems-cache/<id>/`.
5. **Remove post-receive hook**: Delete `mirror-hook.ts` and remove `ensureMirrorHook()` calls from `sternsystem-sync.ts` and `sternsystem-register.ts`. In the star topology, `sternsystem.sync` handles all propagation from cache to mirrors — the post-receive hook on bare mirrors would cause a double-push.
6. **AGENTS.md update**: Update the "Monorepo layout" section (replace `repo:` reference with `mirrors[]`), update the "External mirror sync" section (replace single `mirror` field with `mirrors[]` star topology), and add the rule: "Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces."
7. **DNA-45 prose update**: Update `docs/architecture-dna.md` DNA-45 entry to list `mirrors[]` instead of `repo` and `mirror` fields.
8. **Compass sync**: Update `docs/requirements.xml` and `docs/technology.xml` if they reference the fleet registry `repo`/`mirror` fields.
9. **sternsystem.sync star topology**: Update sync to iterate all `mirrors[1..N]`, push from cache to git mirrors, bundle+copy to backup mirrors. Fetch from bare mirrors into cache is handled by `syncCacheClone` during `mission.materialize` (unchanged).
10. **sternsystem.register update**: Replace `--repo` and `--mirror` flags with `--mirrors` (comma-separated list of `path:storageType` pairs). The command constructs the cache clone at `mirrors[0].path` and clones from `mirrors[1]` (bare) if available.

### Atomic migration

The migration is a single atomic change — no dual-schema period, no fallback logic. With only one entry in `systems/registry.yaml`, a one-shot migration is trivial. The schema, path resolution, registry, physical relocation, and AGENTS.md updates all land in one commit wave.

### New Sternsystems

New Sternsystems registered via `sternsystem.register` use `mirrors[]` from day one. The command constructs the cache clone at the first mirror path and clones from the second mirror (bare) if available.

### Pipeline integration

`sternsystem.validate` runs in `build.check` as today. The new mirror topology rules are additional validation checks — no pipeline changes needed.

## Alternatives considered

- **Keep `systems/<id>/` inside monorepo, enforce boundary via .gitignore.** Rejected: `.gitignore` prevents tracking but does not prevent filesystem access. Agents can still edit files. The structural boundary of moving outside the monorepo is stronger.

- **Separate `sternsystem.backup` command for non-git mirrors.** Rejected: one command for all synchronization is simpler for operators. Star topology through `mirrors[0]` handles both git and backup mirrors uniformly. Adding a second command increases cognitive load without benefit.

- **Role-based mirrors (`role: store | cache | backup`).** Rejected: the first-mirror-is-cache convention is simpler and sufficient. Roles add an extra field to maintain and validate without adding expressive power for the current use cases.

- **`systems-local` as the name for the cache clone directory.** Rejected: "local" is ambiguous when both bare and non-bare repos are local. `systems-cache` preserves the existing codebase terminology (`syncCacheClone`, `hasGitCacheClone`) and accurately describes the function.

## Risks

- **Path resolution breakage:** 13+ files across `packages/os/site-kernel-handoff/src/` hardcode `path.join(workspaceRoot, "systems", systemId)`. Missing any call site breaks mission lifecycle silently. Mitigation: the `resolveMirrors()` helper centralizes resolution; the File system responsibilities table enumerates every call site.

- **Migration complexity:** Each registry entry must be converted from `repo:`/`mirror:` to `mirrors[]`. Errors in conversion can break materialization. Mitigation: atomic migration with `sternsystem.validate` catching topology errors before and after the switch.

- **Backup mirror reliability:** `git bundle` + FTP/S3/rsync copy introduces non-git failure modes (network timeouts, permission errors). Mitigation: per-mirror failures are non-fatal in `sternsystem.sync`; failed mirrors are logged and skipped.

- **Agent misinterpretation:** Agents may not understand that `mirrors[0]` is the cache clone and try to edit files in any mirror. Mitigation: AGENTS.md rule explicitly says "any Sternsystem mirror," and `sternsystem.validate` checks that `mirrors[0]` is non-bare.

- **Single point of failure:** Star topology through `mirrors[0]` means cache clone corruption blocks all sync. Mitigation: cache clone is recreatable from any bare mirror via `git clone`.

- **Protocol inference ambiguity:** `path` strings like `user@host:path` could be SSH or SCP. Mitigation: `git@` prefix and `ssh://` scheme are unambiguous SSH; `scp://` or `sftp://` schemes map to bundle storageType.

- **Concurrent sync and materialize:** If `sternsystem.sync` pushes from cache to mirrors while `mission.materialize` fetches into cache, there is a potential race. Mitigation: `sternsystem.sync` acquires the `system:<id>` lock before touching the cache clone, same as `mission.materialize`.

- **Origin remote path change:** Moving the cache clone from `systems/<id>/` to `../systems-cache/<id>/` changes the relative path to the bare repo. The `origin` git remote in the cache clone must be updated during migration (step 4). Mitigation: `git remote set-url origin <new-relative-path>` is part of the migration script.

- **Bordbuch path relocation:** The Bordbuch physically moves from `systems/<id>/bordbuch/` to `mirrors[0].path/bordbuch/`. All `commitAndPushBordbuch(systemDir, ...)` calls in `mission-open.ts`, `mission-close.ts`, `mission-abort.ts`, and `sternsystem-sync.ts` must use `mirrors[0].path`. The hash-chain mechanism is unchanged — only the storage path moves.

## Acceptance criteria

- [x] `mirrorEntrySchema` and `mirrorStorageTypeSchema` defined in `@warpgogol/ontology/operations` (evidence: packages/ontology/src/operations/sternsystem.ts, build:check pass)
- [x] `fleetRegistryEntrySchema` uses `mirrors: z.array(mirrorEntrySchema).min(1)` instead of `repo:`/`mirror:` (evidence: packages/ontology/src/operations/sternsystem.ts, build:check pass)
- [x] `resolveMirrors()` helper added to `@warpgogol/site-kernel-handoff` and used by all 13+ files with hardcoded `path.join(workspaceRoot, "systems", ...)` references (evidence: packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts, resolve-mirrors.test.ts 21 tests pass)
- [x] `sternsystem.validate` enforces: `mirrors[0].storageType === "non-bare"`, `mirrors.length >= 1`, mirror paths exist on disk, `bundle` storageType not used with git protocols (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts, mirror-validate.test.ts 5 tests pass)
- [x] `sternsystem.sync` pushes from cache (`mirrors[0]`) to all git-accessible mirrors via star topology (evidence: sternsystem-sync.ts cache-to-bare push + bare-to-external push, sternsystem-sync-integration.test.ts 4 tests pass)
- [x] `sternsystem.sync` creates `git bundle` and copies to `bundle` storageType mirrors (evidence: sternsystem-sync.ts bundle creation + copy logic)
- [x] `systems/registry.yaml` migrated: all entries use `mirrors[]`, no `repo:`/`mirror:` fields (evidence: systems/registry.yaml)
- [x] `systems/<id>/` directories removed from monorepo (only `systems/registry.yaml` remains) (evidence: git status shows systems/warpgogol-com/ relocated to ../systems-cache/warpgogol-com/)
- [x] `AGENTS.md` updated: "Monorepo layout" section, "External mirror sync" section, and "Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces." (evidence: AGENTS.md:8,15-21)
- [x] `docs/architecture-dna.md` DNA-45 entry updated to list `mirrors[]` instead of `repo` and `mirror` fields (evidence: docs/architecture-dna.md:197)
- [x] Post-receive hook (`mirror-hook.ts`) deleted; `ensureMirrorHook()` calls removed from `sternsystem-sync.ts` and `sternsystem-register.ts` (evidence: mirror-hook.ts not found in codebase)
- [x] `sternsystem.register` uses `--mirrors` flag instead of `--repo`/`--mirror` (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts, index.ts)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate RFC-0574 --json` exit code 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces. This replaces the previous rule about `systems/<id>/`.
- When implementing path resolution changes, update ALL 13+ files with hardcoded `path.join(workspaceRoot, "systems", ...)` references — the File system responsibilities table enumerates every call site. Missing any breaks mission lifecycle silently.
- The migration is atomic — no dual-schema period, no fallback logic. `repo:`/`mirror:` are removed from the schema in the same commit that adds `mirrors[]`.
- `sternsystem.sync` remains a manual operator action — agents MUST NOT run it automatically after `mission.reconcile` or any other pipeline step.
- The post-receive hook on bare mirrors is removed entirely. In the star topology, `sternsystem.sync` handles all propagation from cache to mirrors. The hook would cause a double-push.
- The Bordbuch storage path changes from `systems/<id>/bordbuch/` to `mirrors[0].path/bordbuch/`. The hash-chain mechanism is unchanged — only the path moves.
- After physical relocation, update the `origin` git remote in each cache clone to point to the new relative path of the bare mirror.
