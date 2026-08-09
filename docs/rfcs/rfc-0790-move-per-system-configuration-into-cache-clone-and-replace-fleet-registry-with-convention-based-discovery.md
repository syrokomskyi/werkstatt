---
id: RFC-0790
title: "Move per-system configuration into cache clone and replace fleet registry with convention-based discovery"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0354
  - RFC-0574
  - RFC-0472
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - DNA-46
  - DNA-47
  - RFC-0354
  - RFC-0472
  - RFC-0574
  - RFC-0666
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
  - DNA-45
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
breaksC: false
commands:
  proposed: []
  added:
    - sternsystem.discover
  changed:
    - sternsystem.validate
    - sternsystem.register
    - sternsystem.list
    - sternsystem.sync
    - sternsystem.pin
    - sternsystem.status
    - sternsystem.extract
    - mission.open
    - mission.materialize
    - mission.reconcile
    - mission.close
    - mission.abort
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - notausgang.export
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "systems/registry.yaml is deleted — no central fleet registry in the monorepo"
  - "../systems-cache/<id>/system-config.yaml exists for every active system"
  - "../systems-cache/<id>/system-state.yaml exists for every active system"
  - "sternsystem.discover scans ../systems-cache/ and returns all systems without reading a registry file"
  - "sternsystem.register creates ../systems-cache/<id>/ + system-config.yaml + initializes git repo if absent"
  - "sternsystem.validate validates system-config.yaml schema and mirror topology per-system"
  - "mission.materialize resolves cache clone from convention path ../systems-cache/<id>/"
  - "leitstand.propagate reads deployment channels from system-config.yaml"
  - "services/registry.yaml remains in monorepo for service fleet"
nonGoals:
  - "Does not change the mission workpiece lifecycle (open/materialize/validate/reconcile/close)"
  - "Does not change the Bordbuch hash-chain mechanism or Bordbuch storage path"
  - "Does not move service configuration out of the monorepo — services remain in services/registry.yaml"
  - "Does not change the Notausgang export or release artifact store"
  - "Does not modify the Sternsystem bundle data-only contract (DNA-44) — extends it with per-system config files"
  - "Does not introduce sharding for cache clone directories — flat ../systems-cache/<id>/ layout is sufficient at current scale"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0790: Move per-system configuration into cache clone and replace fleet registry with convention-based discovery

## Context

Per-system operational metadata is currently split across two locations:

1. **Monorepo (`systems/`)**: `registry.yaml` (fleet index with deployment channels, mirrors, mission/release state, owner, status) and per-system subdirectories (`systems/<id>/dns-records.yaml`, `systems/<id>/axiom-suppressions.yaml`).
2. **Cache clone (`../systems-cache/<id>/`)**: `system.md` (Astro content), `system.pin.json` (platform pin), `bordbuch/` (event log), authored content under `src/content/`.

This fragmentation means a Sternsystem is not a self-contained, mirrorable package. Deployment configuration, DNS records, and runtime state live in the monorepo, while site content and pin live in the external cache clone. Mirroring a Sternsystem to an external git remote (RFC-0472) propagates only the cache clone — the monorepo-side metadata is left behind.

RFC-0574 relocated the cache clone outside the monorepo (`mirrors[0].path`), but the registry entry itself (deployment, mirrors, state, owner) still lives in `systems/registry.yaml` inside the monorepo. The Sternsystem bundle (DNA-44) is still fragmented: part of it is in the monorepo, part in the cache clone.

## Problem

- **Fragmented system package**: A Sternsystem cannot be mirrored as a complete unit. `sternsystem.sync` (RFC-0472) pushes the cache clone to external mirrors, but `registry.yaml` entries (deployment channels, DNS, suppressions) remain in the monorepo. An external mirror does not receive the full system package.
- **Central registry bottleneck**: `systems/registry.yaml` is a single file that must be read and parsed for every system operation. At scale (millions of sites), a single registry file becomes a bottleneck — every `sternsystem.validate`, `mission.open`, `leitstand.propagate` reads the entire registry to find one entry.
- **Bootstrap circular dependency**: The registry defines where cache clones are located (`mirrors[0].path`), so the registry itself cannot live in a cache clone — it must be in the monorepo. This forces the registry to remain a monorepo-resident file, perpetuating the fragmentation.
- **Write contention**: All system operations that update state (`currentMission`, `lastRelease`, `lastPropagated`) write to the same `registry.yaml` file. Concurrent operations on different systems create write contention on a shared file.
- **Mixed concerns in one schema**: `fleetRegistryEntrySchema` combines static configuration (deployment channels, mirrors, owner), runtime state (currentMission, lastRelease, lastPropagated), and identity (id, cosmicStar, status) in a single Zod object. These have different mutation rates and different ownership boundaries.

## Decision

The fleet registry (`systems/registry.yaml`) is replaced by convention-based discovery. Per-system configuration is moved into the cache clone as separate files alongside `system.md` and `system.pin.json`. The engine discovers systems by scanning a fixed convention directory (`../systems-cache/`) and reading each system's `system-config.yaml`.

The cache clone path is fixed by convention: `../systems-cache/<id>/`. This eliminates the bootstrap circular dependency — the engine does not need a registry to locate cache clones, it derives the path from the system id and the convention.

### Per-system files in the cache clone

| File | Content | Mutation rate |
| --- | --- | --- |
| `system-config.yaml` | Static configuration: id, cosmicStar, mirrors[], deployment channels, owner, status, pinnedPlatform, registeredAt, cloudflareZoneId | Rare |
| `system-state.yaml` | Runtime state: currentMission, lastRelease, lastPropagated | Frequent (every deploy/release) |
| `dns-records.yaml` | DNS records for the system's zone | Occasional |
| `axiom-suppressions.yaml` | Axiom check suppressions | Occasional |

### What remains in the monorepo

| File | Content | Reason |
| --- | --- | --- |
| `services/registry.yaml` | Service fleet registry | Services do not have cache clones; they are monorepo-resident runtime compositions shared across all systems via tenancy |

## Architectural fit

- **DNA-44 (Sternsystem bundle contract)**: Extended — the cache clone now carries the complete system package: content, pin, bordbuch, configuration, state, DNS, suppressions. The Sternsystem is a self-contained, mirrorable unit. The data-only constraint is preserved: `system-config.yaml` and `system-state.yaml` are YAML data files, not runtime scripts or package.json.
- **DNA-45 (Fleet registry)**: Amended — the central `systems/registry.yaml` is replaced by convention-based discovery. The `fleetRegistrySchema` is split into `systemConfigSchema` (static) and `systemStateSchema` (runtime). Service entries remain in `services/registry.yaml`.
- **DNA-46 (Mission lifecycle)**: `mission.open`, `mission.materialize`, `mission.reconcile`, `mission.close`, `mission.abort` resolve the cache clone from the convention path `../systems-cache/<id>/` instead of `mirrors[0].path` from a registry entry. Runtime state reads/writes go to `system-state.yaml` in the cache clone.
- **DNA-47 (Materialization)**: `mission.materialize` clones from `../systems-cache/<id>/` (convention path). The shared git object database mechanism (RFC-0568) is preserved.
- **RFC-0354 (Sternsystem bundle contract)**: Amended — registry schema split, per-system config files added to the bundle.
- **RFC-0574 (mirror topology)**: Amended — `mirrors[]` moves from `registry.yaml` entry to `system-config.yaml`. Mirror resolution logic (`resolveMirrors`) reads from `system-config.yaml` instead of a registry entry.
- **RFC-0472 (sternsystem.sync)**: Amended — sync reads mirror topology from `system-config.yaml` in the cache clone instead of the registry.
- **RFC-0666 (convention-based .env paths)**: Precedent for replacing configuration indirection with convention-based paths. This RFC applies the same principle to fleet registry.

## Design

### CLI surface

```sh
# New: discover all systems by scanning ../systems-cache/
pnpm exec werkstatt run sternsystem.discover --json

# Changed: validate reads from cache clone, not registry
pnpm exec werkstatt run sternsystem.validate
pnpm exec werkstatt run sternsystem.validate --id warpgogol-com --json

# Changed: list reads from cache clone, not registry
pnpm exec werkstatt run sternsystem.list --json

# Changed: register creates cache clone + system-config.yaml
pnpm exec werkstatt run sternsystem.register --id new-site --cosmicStar Vega

# Changed: sync reads mirrors from system-config.yaml
pnpm exec werkstatt run sternsystem.sync --id warpgogol-com

# Changed: mission commands resolve cache clone from convention path
pnpm exec werkstatt run mission.open --system warpgogol-com --brief "..."
pnpm exec werkstatt run mission.materialize --mission warpgogol-com-m000043
pnpm exec werkstatt run mission.reconcile --mission warpgogol-com-m000043
pnpm exec werkstatt run mission.close --mission warpgogol-com-m000043

# Changed: leitstand reads deployment channels from system-config.yaml
pnpm exec werkstatt run leitstand.dev-deploy --mission warpgogol-com-m000043
pnpm exec werkstatt run leitstand.propagate --release warpgogol-com-r000017
pnpm exec werkstatt run leitstand.promote --release warpgogol-com-r000017
```

### TypeScript contracts

```ts
// system-config.yaml schema (static configuration)
const systemConfigSchema = z.object({
  schemaVersion: z.string().min(1),
  id: z.string().regex(kebabRe),
  cosmicStar: starNameSchema,
  mirrors: z.array(mirrorEntrySchema).min(1),
  pinnedPlatform: z.string().regex(semverRe),
  status: z.enum(["registered", "active", "paused", "archived"]),
  registeredAt: z.string().datetime(),
  deployment: deploymentConfigSchema.optional(),
  cloudflareZoneId: z.string().optional(),
  owner: z.string().regex(didWebRe).optional(),
  notes: z.string().default(""),
});

type SystemConfig = z.infer<typeof systemConfigSchema>;

// system-state.yaml schema (runtime state, separate file)
const systemStateSchema = z.object({
  schemaVersion: z.string().min(1),
  systemId: z.string().regex(kebabRe),
  currentMission: z.string().nullable().default(null),
  lastRelease: z.string().nullable().default(null),
  lastPropagated: z
    .object({
      alt: z
        .object({
          releaseId: z.string(),
          at: z.string().datetime(),
          healthy: z.boolean(),
          state: z.enum(["succeeded", "failed"]),
          operationId: z.string(),
          leaseExpiresAt: z.string().datetime().nullable(),
        })
        .optional(),
      main: z
        .object({
          releaseId: z.string(),
          at: z.string().datetime(),
          healthy: z.boolean(),
          state: z.enum(["succeeded", "failed"]),
          operationId: z.string(),
          leaseExpiresAt: z.string().datetime().nullable(),
        })
        .optional(),
    })
    .default({}),
});

type SystemState = z.infer<typeof systemStateSchema>;

// Convention path resolution (no registry lookup)
function resolveCacheClonePath(workspaceRoot: string, systemId: string): string {
  return path.join(workspaceRoot, "..", "systems-cache", systemId);
}

// Discovery: scan ../systems-cache/ and read each system-config.yaml
async function discoverSystems(workspaceRoot: string): Promise<SystemConfig[]>;

// Read a single system's config (efficient — no full scan)
async function readSystemConfig(workspaceRoot: string, systemId: string): Promise<SystemConfig>;

// Read a single system's runtime state
async function readSystemState(workspaceRoot: string, systemId: string): Promise<SystemState>;

// Write system state (atomic, used by mission/close/deploy commands)
async function writeSystemState(workspaceRoot: string, systemId: string, state: SystemState): Promise<void>;

// Services registry remains in monorepo
async function readServicesRegistry(workspaceRoot: string): Promise<ServiceEntry[]>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `../systems-cache/<id>/system-config.yaml` | Static system configuration (created by `sternsystem.register`, read by all system commands) |
| `../systems-cache/<id>/system-state.yaml` | Runtime state (written by `mission.open`, `mission.close`, `leitstand.propagate`, `leitstand.promote`) |
| `../systems-cache/<id>/dns-records.yaml` | DNS records (moved from `systems/<id>/dns-records.yaml`) |
| `../systems-cache/<id>/axiom-suppressions.yaml` | Axiom suppressions (moved from `systems/<id>/axiom-suppressions.yaml` or `systems/axiom-suppressions.yaml`) |
| `../systems-cache/<id>/system.md` | Astro content (unchanged) |
| `../systems-cache/<id>/system.pin.json` | Platform pin (unchanged) |
| `../systems-cache/<id>/bordbuch/` | Bordbuch event log (unchanged) |
| `services/registry.yaml` | Service fleet registry (remains in monorepo) |
| `systems/registry.yaml` | **Deleted** — replaced by convention-based discovery |
| `systems/<id>/` | **Deleted** — per-system subdirectories moved to cache clone |
| `systems/methodologies.md` | Check methodology configuration (remains in monorepo, shared across all systems) |

### Output format

```json
{
  "command": "sternsystem.discover",
  "data": {
    "systems": [
      {
        "id": "warpgogol-com",
        "cosmicStar": "Vega",
        "status": "active",
        "cachePath": "../systems-cache/warpgogol-com",
        "configPath": "../systems-cache/warpgogol-com/system-config.yaml",
        "hasState": true,
        "hasPin": true
      }
    ],
    "count": 1
  },
  "exitCode": 0,
  "summary": "[sternsystem.discover] 1 system(s) discovered"
}
```

### Failure modes

- **Missing cache clone directory**: `discoverSystems()` skips directories that do not contain `system-config.yaml` with a warning. `readSystemConfig(id)` throws if the directory or file is absent.
- **Invalid `system-config.yaml`**: Zod parse failure is reported as a validation error with the system id and field path. `sternsystem.validate` collects all per-system errors and reports them in aggregate.
- **Missing `system-state.yaml`**: Treated as a fresh system with `currentMission: null`, `lastRelease: null`. Not an error — the state file is created on first state-writing operation.
- **Git repo already exists in cache clone**: `sternsystem.register` detects an existing `.git` directory and skips `git init`. It never destroys existing git history. If the directory exists but has no `.git`, `git init` is run. If the directory does not exist, it is created with `mkdir -p` and `git init`.
- **Concurrent state writes**: `writeSystemState` uses `atomicWriteFile` (RFC-0362 consistency primitive) to prevent partial writes. Each system has its own `system-state.yaml`, eliminating cross-system write contention.

## Rollout

### Migration (atomic, single-step)

The migration is performed as a single atomic step within one mission:

1. **Create per-system files in cache clone**: For each system in `registry.yaml`, generate `system-config.yaml` (static fields), `system-state.yaml` (runtime fields), and move `dns-records.yaml` / `axiom-suppressions.yaml` from `systems/<id>/` to `../systems-cache/<id>/`.
2. **Update engine code**: Replace `readRegistry()` / `writeRegistry()` / `findEntry()` with `discoverSystems()` / `readSystemConfig()` / `readSystemState()` / `writeSystemState()`. Update all 30+ call sites.
3. **Delete monorepo-side files**: Remove `systems/registry.yaml`, `systems/<id>/` subdirectories. Keep `services/registry.yaml` and `systems/methodologies.md`.
4. **Update `sternsystem.validate`**: Iterate `discoverSystems()` instead of `registry.systems`. Validate each `system-config.yaml` schema, mirror topology, pin file, and Bordbuch consistency per-system.
5. **Update `sternsystem.register`**: Create `../systems-cache/<id>/` directory, `git init` if no `.git` exists, write `system-config.yaml`. Do not destroy existing git history.
6. **Update DNA-44 and DNA-45**: Amend the DNA entries to reflect convention-based discovery and per-system config files.

### New systems

New systems automatically comply from day one: `sternsystem.register` creates the cache clone directory and `system-config.yaml`. No registry file to update.

### Pipeline integration

`sternsystem.validate` remains in `build.check` and `mission.validate` pipelines. It now scans `../systems-cache/` instead of reading `registry.yaml`.

## Alternatives considered

- **Keep `registry.yaml` as a minimal bootstrap index (id + mirrors only)**: Rejected — the bootstrap circular dependency remains (registry defines where cache clones are, so registry cannot live in a cache clone). A minimal index still requires a central file that must be read for every operation. Convention-based path derivation (`../systems-cache/<id>/`) eliminates the need for any index.
- **Configurable cache clone path via `forge.yaml`**: Rejected — adds one level of indirection without benefit. The convention `../systems-cache/` is sufficient for all workshops. If a workshop needs a different layout, it is a different workshop configuration, not a per-system concern.
- **Two-phase migration (fallback compatibility, then remove registry)**: Rejected — the Werkstatt does not maintain backward compatibility. A single atomic migration is simpler and cleaner. The engine reads from one source only, no fallback logic.
- **Sharded cache clone directories (`../systems-cache/{prefix}/<id>/`)**: Rejected for now — at current scale (single system), flat layout is sufficient. Sharding can be introduced in a future RFC when the system count reaches thousands. The convention path function can be extended to support sharding without breaking existing systems.

## Risks

- **Discovery performance at scale**: Scanning `../systems-cache/` and reading N `system-config.yaml` files is O(N) filesystem operations. At millions of systems, this is slow. Mitigation: `readSystemConfig(id)` reads a single file without scanning. `discoverSystems()` is only called by `sternsystem.list` and `sternsystem.validate`, which are not hot-path operations. Sharding can be added later.
- **No central fleet view**: Without `registry.yaml`, there is no single file listing all systems. `sternsystem.list --json` provides the view on-demand. Operators who grep `registry.yaml` for system information must switch to `sternsystem.list`.
- **Migration data loss risk**: If the migration script fails between creating cache clone files and deleting `registry.yaml`, the system could be in an inconsistent state. Mitigation: the migration is atomic within one mission — `mission.reconcile` and `mission.close` propagate the cache clone changes, and `registry.yaml` deletion is the last step.
- **Agent confusion**: Agents accustomed to reading `systems/registry.yaml` for system information must learn to use `sternsystem.discover` or `readSystemConfig()`. The `AGENTS.md` update and this RFC's implementation notes mitigate this.
- **`system-config.yaml` and `system-state.yaml` must be committed to cache clone git**: These files live in the cache clone's git repo and are propagated via `sternsystem.sync`. If an agent forgets to commit state changes, `sternsystem.sync` will not propagate them. Mitigation: `writeSystemState` auto-commits via the existing auto-commit mechanism (RFC-0580).

## Acceptance criteria

- [ ] `systemConfigSchema` and `systemStateSchema` Zod schemas defined in `@warpgogol/werkstatt/schemas`
- [ ] `discoverSystems()`, `readSystemConfig()`, `readSystemState()`, `writeSystemState()` implemented in `@warpgogol/werkstatt/sternsystem`
- [ ] `readRegistry()`, `writeRegistry()`, `findEntry()` removed from `registry-io.ts`
- [ ] `resolveCacheClonePath()` uses convention path `../systems-cache/<id>/` (no registry lookup)
- [ ] `sternsystem.discover` command registered and returns `--json` output
- [ ] `sternsystem.validate` iterates `discoverSystems()` instead of `registry.systems`
- [ ] `sternsystem.register` creates cache clone directory + `system-config.yaml` + `git init` if absent
- [ ] `sternsystem.list` reads from `discoverSystems()` instead of `registry.yaml`
- [ ] `mission.open` / `mission.materialize` / `mission.reconcile` / `mission.close` / `mission.abort` resolve cache clone from convention path
- [ ] `leitstand.dev-deploy` / `leitstand.propagate` / `leitstand.promote` read deployment channels from `system-config.yaml`
- [ ] `sternsystem.sync` reads mirror topology from `system-config.yaml`
- [ ] `systems/registry.yaml` deleted from the monorepo
- [ ] `systems/<id>/` per-system subdirectories deleted (DNS, suppressions moved to cache clone)
- [ ] `services/registry.yaml` remains in monorepo unchanged
- [ ] `systems/methodologies.md` remains in monorepo unchanged
- [ ] DNA-44 and DNA-45 amended in `docs/architecture-dna.md`
- [ ] `AGENTS.md` updated: remove references to `systems/registry.yaml`, document convention-based discovery
- [ ] `rfc.validate` passes on this file with zero errors

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0790` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0790 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT read `systems/registry.yaml` after this RFC is implemented — it is deleted. Use `sternsystem.discover` or `readSystemConfig(id)` instead.
- Agents MUST NOT create `systems/registry.yaml` or per-system subdirectories under `systems/` — these are deleted and not recreated.
- Agents MUST use `resolveCacheClonePath(workspaceRoot, systemId)` for all cache clone path resolution — never hardcode `mirrors[0].path` from a registry entry.
- `sternsystem.register` MUST NOT destroy existing git history in the cache clone. If `.git` exists, skip `git init`. If the directory exists without `.git`, run `git init`. If the directory does not exist, create it and run `git init`.
- `writeSystemState` MUST auto-commit changes to the cache clone git repo (RFC-0580 auto-commit mechanism) so that `sternsystem.sync` propagates state updates.
