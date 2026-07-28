---
id: RFC-0574
title: "Relocate Sternsystem storage outside monorepo and introduce parameterized mirror topology"
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
createdAt: 2026-07-28
updatedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
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
commands:
  proposed: []
  added: []
  changed:
    - sternsystem.sync
    - sternsystem.validate
    - mission.materialize
    - mission.reconcile
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
  - "Does not change the Bordbuch hash-chain or Bordbuch git synchronization"
  - "Does not introduce a new backup command — sternsystem.sync handles all mirror synchronization"
  - "Does not change the Notausgang export or release artifact store"
  - "Does not modify the mirror auto-push hook (post-receive) — the hook remains on bare mirrors"
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
| `mirrors[0].path` (external) | Non-bare git repo. Cache clone for mission lifecycle. Browsable by operator. |
| `mirrors[1..N].path` (external) | Additional mirrors: bare repos, external remotes, backup endpoints. |
| `packages/ontology/src/operations/sternsystem.ts` | Schema definition: `fleetRegistryEntrySchema` gains `mirrors[]`, loses `repo:`/`mirror:`. |
| `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` | `resolveRegistryPath` unchanged. Path resolution helpers updated. |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | `syncCacheClone` and `systemDir` resolve from `mirrors[0].path` instead of `path.join(workspaceRoot, "systems", systemId)`. |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `runMissionReconcile` resolves `systemDir` from `mirrors[0].path`. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | Star-topology sync: fetch from git mirrors into cache, push from cache to git mirrors, bundle+copy to backup mirrors. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | New validation rules for mirror topology. |
| `AGENTS.md` | Updated rule: "Agents MUST NEVER edit any Sternsystem mirror directly." |

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

1. **Schema change** (`@warpgogol/ontology`): Add `mirrors[]` to `fleetRegistryEntrySchema`. Keep `repo:` and `mirror:` as deprecated optional fields during migration. Add `mirrorEntrySchema` and `mirrorStorageTypeSchema`.
2. **Path resolution** (`@warpgogol/site-kernel-handoff`): Add `resolveMirrors()` helper. Update `mission.materialize`, `mission.reconcile`, `sternsystem.sync`, `sternsystem.validate` to use `resolveMirrors()` when `mirrors[]` is present, fall back to `repo:`/`mirror:` when only legacy fields exist.
3. **Registry migration**: For each entry in `systems/registry.yaml`, convert `repo:` + `mirror:` to `mirrors[]`. Example:
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
4. **Physical relocation**: Move `systems/<id>/` directories to their new `mirrors[0].path` locations outside the monorepo. The existing git history in each cache clone is preserved.
5. **Remove legacy fields**: After all entries are migrated, remove `repo:` and `mirror:` from `fleetRegistryEntrySchema`. Remove fallback logic in path resolution.
6. **AGENTS.md update**: Replace the rule about `systems/<id>/` with the mirror-based rule.
7. **sternsystem.sync star topology**: Update sync to iterate all `mirrors[1..N]`, fetch git-accessible mirrors into cache, push from cache to git mirrors, bundle+copy to backup mirrors.

### No flag day

The migration uses a dual-schema period: `mirrors[]` is accepted alongside `repo:`/`mirror:`. Commands check for `mirrors[]` first, fall back to legacy fields. This allows incremental migration of registry entries without breaking running missions.

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

- **Path resolution breakage:** Multiple commands hardcode `path.join(workspaceRoot, "systems", systemId)`. Missing any call site breaks mission lifecycle silently. Mitigation: grep for all `"systems"` path references and update them. The `resolveMirrors()` helper centralizes resolution.

- **Migration complexity:** Each registry entry must be converted from `repo:`/`mirror:` to `mirrors[]`. Errors in conversion can break materialization. Mitigation: dual-schema period allows incremental migration; `sternsystem.validate` catches topology errors.

- **Backup mirror reliability:** `git bundle` + FTP/S3/rsync copy introduces non-git failure modes (network timeouts, permission errors). Mitigation: per-mirror failures are non-fatal in `sternsystem.sync`; failed mirrors are logged and skipped.

- **Agent misinterpretation:** Agents may not understand that `mirrors[0]` is the cache clone and try to edit files in any mirror. Mitigation: AGENTS.md rule explicitly says "any Sternsystem mirror," and `sternsystem.validate` checks that `mirrors[0]` is non-bare.

- **Single point of failure:** Star topology through `mirrors[0]` means cache clone corruption blocks all sync. Mitigation: cache clone is recreatable from any bare mirror via `git clone`.

- **Protocol inference ambiguity:** `path` strings like `user@host:path` could be SSH or SCP. Mitigation: `git@` prefix and `ssh://` scheme are unambiguous SSH; `scp://` or `sftp://` schemes map to bundle storageType.

## Acceptance criteria

- [ ] `mirrorEntrySchema` and `mirrorStorageTypeSchema` defined in `@warpgogol/ontology/operations`
- [ ] `fleetRegistryEntrySchema` uses `mirrors: z.array(mirrorEntrySchema).min(1)` instead of `repo:`/`mirror:`
- [ ] `resolveMirrors()` helper added to `@warpgogol/site-kernel-handoff` and used by `mission.materialize`, `mission.reconcile`, `sternsystem.sync`, `sternsystem.validate`
- [ ] `sternsystem.validate` enforces: `mirrors[0].storageType === "non-bare"`, `mirrors.length >= 1`, mirror paths exist on disk, `bundle` storageType not used with git protocols
- [ ] `sternsystem.sync` synchronizes all git-accessible mirrors via star topology through `mirrors[0]` (fetch into cache, push from cache)
- [ ] `sternsystem.sync` creates `git bundle` and copies to `bundle` storageType mirrors
- [ ] `systems/registry.yaml` migrated: all entries use `mirrors[]`, no `repo:`/`mirror:` fields
- [ ] `systems/<id>/` directories removed from monorepo (only `systems/registry.yaml` remains)
- [ ] `AGENTS.md` rule updated: "Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces."
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces. This replaces the previous rule about `systems/<id>/`.
- When implementing path resolution changes, search for ALL hardcoded `path.join(workspaceRoot, "systems", ...)` references — missing any call site breaks mission lifecycle silently.
- The dual-schema migration period means `repo:`/`mirror:` must still be read during transition. Do not remove legacy field parsing until all registry entries are migrated.
- `sternsystem.sync` remains a manual operator action — agents MUST NOT run it automatically after `mission.reconcile` or any other pipeline step.
