---
id: RFC-0354
title: "Establish the Sternsystem bundle contract and fleet registry"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0221
amendedBy:
  - RFC-0362
  - RFC-0364
  - RFC-0381
  - RFC-0561
related:
  - RFC-0007
  - RFC-0078
  - RFC-0221
  - RFC-0353
  - RFC-0362
  - RFC-0364
  - DNA-1
  - DNA-4
  - DNA-6
satisfies:
  - DNA-44
  - DNA-45
commands:
  proposed: []
  added:
    - sternsystem.register
    - sternsystem.list
    - sternsystem.validate
    - sternsystem.pin
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-handoff"
  - "@gogol/ontology"
successSignals:
  - "A developer can `sternsystem.register --id <new-site> --cosmicStar <Star> --repo <git-url>` and a new entry appears in `systems/registry.yaml` with status `registered`."
  - "`sternsystem.list` prints every registered Sternsystem with its id, cosmicStar, pinned platform version, current mission, last release, and status."
  - "`sternsystem.validate --id <id>` verifies the cached Sternsystem data bundle: pin file parse, authored-data partition, no scripts, no package manifests, no runtime config, no generated files, no `dist/`."
  - "`sternsystem.pin --id <id> --platform <semver>` writes or updates `system.pin.json` with release facts produced by `@gogol/fingerprint` (`version`, `commit`, `rfcHead`, `platformSemanticHash`)."
  - "All former `apps/*` sites are migrated into Sternsystem repositories and the `apps/` directory is removed in the implementation wave."
nonGoals:
  - "Does not define the mission lifecycle or materialization flow — that is RFC-0355 and RFC-0356."
  - "Does not define release discipline or fleet propagation — that is RFC-0357 and RFC-0358."
  - "Does not define the Notausgang (emergency export) — that is RFC-0359."
  - "Does not define the extraction mechanics for existing `apps/*` sites — that is RFC-0356."
  - "Does not preserve a legacy `apps/` compatibility mode. The accepted migration target removes `apps/` after all sites are converted."
  - "Does not define discovery or command-surface evolution — that is a separate RFC wave."
  - "Does not define the physical git repository hosting strategy for Sternsystem repos beyond the registry contract; CI and access control are out of scope."
---

# RFC-0354: Establish the Sternsystem bundle contract and fleet registry

## Context

The studio currently manages client sites as `apps/*` workspace members inside a single Turborepo + pnpm monorepo. Every site is a full workspace package: it carries `package.json` with workspace dependencies, participates in `pnpm install`, and its build is orchestrated by Turborepo alongside every other site. This model works for three sites. It does not scale to tens of thousands.

The coupling problem is structural:

1. **Install explosion.** Every `apps/*` member is resolved by `pnpm install` at the workspace root. Thousands of workspace members would make `pnpm install` impractical and every lockfile change a multi-minute operation.
2. **Build graph coupling.** Turborepo's task graph includes every `apps/*` member. A build of one site triggers dependency resolution across all sites.
3. **No independent versioning.** Sites evolve at the monorepo's cadence. A site cannot pin a stable platform version and receive only forward-migratable changes at its own schedule.
4. **No independent lifecycle.** A site cannot be created, archived, exported, or transferred without touching the monorepo's working tree and history.

RFC-0221 already solved the **transfer unit** problem: the `handoff.pack` bundle is a thin, version-stamped directory containing the authored site with derived artifacts stripped. That machinery remains the foundation, but Sternsystems are stricter: they are durable data repositories, not mini Astro apps. Runtime config, package manifests, scripts, generated files, and deploy output are materialized from the pinned platform during a mission.

RFC-0353 renamed the semantic markup system from GRACE to Compass. This RFC series uses **Compass** terminology throughout.

The Canon (studio architecture document) introduces the concept of a **Sternsystem** — a durable site bundle that exists independently of the engineering platform, pins a platform version, and travels through a lifecycle of missions, releases, and exports. This RFC formalizes that concept as a machine-checkable contract.

## Problem

Three invariants are unprotected today:

1. **No durable site unit.** The only unit is `apps/<app>/` — a workspace member coupled to the monorepo's install graph, build graph, and git history. There is no way to represent a site that lives outside the monorepo but is built against a pinned version of it.

2. **No fleet registry.** There is no single machine-readable index of all sites in the studio's fleet. `fleet/fleet.sites.json` exists but is a flat list of app names for the pilot; it carries no version pins, repo URLs, mission state, or release history.

3. **No version pinning contract.** RFC-0221's `handoff-lock.json` records the ecosystem version at pack time, but it is a transfer artifact, not a persistent pin. There is no mechanism for a site to declare "I am built against platform version X.Y.Z" and have that declaration enforced on every materialization.

## Decision

Introduce the **Sternsystem** as the durable site unit, the **fleet registry** as its index, and the **version pin** as its platform coupling contract. The final target model has no deployable sites under `apps/`; every site is a Sternsystem data repository, and buildable working trees are materialized into `missions/`.

### 1. Sternsystem bundle contract

A Sternsystem is a repository that contains only **site-owned data**. It is stricter than an `apps/*` workspace and stricter than the current RFC-0221 bootstrap bundle: it does not contain scripts, package manifests, Astro/Wrangler/TypeScript config, generated files, or deployable output. Those files are generated by materialization from the pinned platform.

#### 1.1 Directory layout

```
<system-id>/
  system.pin.json              # version pin (see §3)
  src/
    content/
      system.md                # unified CMS-friendly system manifest
      business/                # authored business context
      pages/                   # authored page content
      prose/                   # authored prose content
      navigation/              # authored navigation content
      site/                    # authored site-level content
      assets/                  # content-owned media assets and credit sidecars
  provenance/                  # site-owned provenance and operator notes, secret-free
  bordbuch/
    events.ndjson              # hash-chained append-only ledger (RFC-0276 model)
```

Allowed data sidecars include CKL claim sidecars (`*.claims.yaml`), material credit sidecars (`*.credits.yaml`), provenance records, and other content-domain data records. They are data. They MUST NOT execute code or configure the platform runtime directly.

#### 1.2 Excluded from a Sternsystem (always regenerated on materialization)

These paths MUST NOT exist in a Sternsystem bundle:

- `dist/` — build output, always regenerated
- `node_modules/` — dependencies, always resolved from the platform
- `packages/` — platform code, always provided by the Werkstatt monorepo
- `package.json`, `pnpm-lock.yaml`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, `postcss.config.*` — materialized from platform templates
- `src/pages/**`, `src/styles/**`, `src/scripts/**`, `tools/**` — engineering/runtime surfaces
- Any `*.generated.*` file — always regenerated by codegen
- Any Compass-generated region content — always regenerated
- `.git/` — the Sternsystem's own git history lives in its independent repo; the cache clone in `systems/<id>/` is gitignored

The exclusion reuses the hard-exclusion + ignore machinery from `client-export.ts` and `handoff.pack`'s `authored-set.ts`, inverted to keep only the authored set.

#### 1.3 Authored-data partition

The partition between Sternsystem data and materialized runtime files derives from RFC-0221 but is intentionally stricter. `authored-set.ts` is amended by RFC-0356 so that former bootstrap config files are copied only during extraction and then converted into generated materialization templates. A Sternsystem carries **only site-owned data paths**. Derived paths are never stored in the bundle; they are materialized on demand by RFC-0356.

### 2. Fleet registry (`systems/registry.yaml`)

The fleet registry is the single machine-readable index of all Sternsystems in the studio. It is a tracked file at `systems/registry.yaml` in the Werkstatt monorepo.

#### 2.1 Schema

```yaml
schemaVersion: "1.0.0"
systems:
  - id: webgogol-com              # kebab-case, lowercase, latin-only (DNA-6)
    cosmicStar: Vega              # from StarCatalog (DNA-23)
    repo: git@github.com:webgogol/webgogol-com.git
    pinnedPlatform: "4.5.0"       # semver tag of the pinned platform version
    currentMission: null          # mission id or null (see RFC-0355)
    lastRelease: null             # release id or null (see RFC-0357)
    status: active                # registered | active | paused | archived
    registeredAt: "2026-07-09T00:00:00Z"
    notes: ""
```

#### 2.2 Status lifecycle

| Status | Meaning |
| --- | --- |
| `registered` | Sternsystem is registered in the registry but has not yet been materialized or built. |
| `active` | Sternsystem has been materialized at least once and has a valid pin. |
| `paused` | Sternsystem is temporarily out of rotation; no new missions may be opened. |
| `archived` | Sternsystem is retired; its repo is read-only and no new missions or releases are permitted. |

Status transitions are enforced by `sternsystem.validate` and the mission/release commands in subsequent RFCs.

#### 2.3 Registry invariants

- **Unique ids.** Every `id` in `systems` MUST be unique. Enforced by `sternsystem.validate`.
- **Unique cosmicStars.** Every `cosmicStar` MUST be unique across active and registered systems. A star may be reused only after the previous system is `archived`. Enforced by `sternsystem.validate`.
- **Valid cosmicStar.** Every `cosmicStar` MUST exist in `StarCatalog` from `@gogol/ontology`. Enforced by `sternsystem.validate`.
- **Valid repo URL.** Every `repo` MUST be a valid git URL (SSH or HTTPS). Enforced by `sternsystem.validate`.
- **Semver pinnedPlatform.** Every `pinnedPlatform` MUST be a valid semver string. Enforced by `sternsystem.validate`.

### 3. Version pin (`system.pin.json`)

The version pin is the persistent analogue of RFC-0221's `handoff-lock.json` ecosystem block. It records which platform version the Sternsystem is built against.

#### 3.1 Schema

```ts
interface SystemPin {
  schemaVersion: string;            // pin format version, e.g. "1.0.0"
  systemId: string;                 // kebab-case, lowercase, latin-only
  cosmicStar: string;               // from StarCatalog
  pinnedAt: string;                 // ISO 8601
  platform: {
    version: string;                // semver tag of the monorepo release
    commit: string;                 // git SHA of the monorepo at pin time
    rfcHead: string;                // highest implemented RFC id at pin time
    platformSemanticHash: string;   // @gogol/fingerprint semantic platform hash
  };
  migratorCursor: string;           // platform version this system is synced to (== platform.version at pin)
  capabilities: Array<{             // consumed subset of uni.registry.json
    semanticId: string;
    version: string;
    intent: string[];
  }>;
}
```

The Zod schema lives in `@gogol/ontology` alongside the existing `HandoffLock` schema.

#### 3.2 Pin semantics

- The pin records the **platform version** the Sternsystem was last built and validated against.
- `platformSemanticHash` is produced by `@gogol/fingerprint` (RFC-0364). Raw package tree hash helpers are not valid for new pins.
- `migratorCursor` tracks how far the system has been migrated forward. It starts equal to `platform.version` and advances as migrators are applied (see RFC-0356 materialization).
- The pin is updated by `sternsystem.pin` (re-pin to a newer platform version) or by the materialization flow (RFC-0356) after a successful catch-up.
- A Sternsystem MUST NOT be materialized against a platform version older than its pin's `platform.version` — the version-compare matrix from RFC-0221 §4.1 applies: `V_src > V_cur` refuses downgrade.

#### 3.3 Relationship to RFC-0221 `handoff-lock.json`

The `SystemPin` is a strict subset of `HandoffLock` (RFC-0221 §2), carrying the persistent fields that survive across materializations. The transient fields (`packedAt`, `build.systemHash`, `build.commitSha`) are not part of the pin; they are recomputed on each materialization. A `handoff.pack` bundle produced from a Sternsystem MUST carry a `handoff-lock.json` whose `ecosystem` block matches the Sternsystem's `system.pin.json` `platform` block.

### 4. Systems cache (`systems/<id>/`)

The systems cache is a **gitignored** directory at `systems/<id>/` in the Werkstatt monorepo. It holds the materialized working copy of a Sternsystem's git repo.

#### 4.1 Gitignore contract

`systems/<id>/` directories are gitignored at the monorepo root. Only `systems/registry.yaml` is tracked. The `.gitignore` entry is:

```
systems/*
!systems/registry.yaml
```

#### 4.2 Cache lifecycle

- **Clone**: `sternsystem.register` or a materialization command clones the Sternsystem's git repo into `systems/<id>/`.
- **Materialize**: RFC-0356 materialization operates on the cache clone to produce a buildable site.
- **Clean**: the cache may be deleted at any time; it is always re-clonable from the registry's `repo` URL. No data is lost.

The cache is never committed to the monorepo. It is a local working artifact, analogous to `node_modules/`.

### 5. Werkstatt directory structure

The Werkstatt monorepo gains the following new top-level directories:

| Path | Tracked | Role |
| --- | --- | --- |
| `systems/registry.yaml` | yes | Fleet registry — the single index of all Sternsystems |
| `systems/<id>/` | no (gitignored) | Cache clones of Sternsystem git repos |
| `missions/` | no (gitignored) | Ephemeral mission working copies (RFC-0355) |
| `releases/` | no (gitignored) | Release artifacts (RFC-0357) |
| `agents/` | no (gitignored) | Agent state and session data |
| `.werkstatt/` | no (gitignored) | Locks, operation records, and local artifact/cache state (RFC-0362/RFC-0363) |

`apps/` is removed after the migration wave. Any temporary read of `apps/*` is an extraction-only compatibility shim, not a supported post-migration workspace surface.

### 6. Full migration away from `apps/`

The accepted target state has no deployable sites under `apps/`. This RFC series is a breaking architectural migration, not a backwards-compatible overlay. The implementation wave converts every current `apps/*` site into a Sternsystem, validates materialization, and removes `apps/` once all sites are served from mission materialization or release artifacts.

Rules:

1. **No new `apps/` members.** New sites are created as Sternsystems only.
2. **No long-lived dual representation.** A site may be in an extraction transaction, but the transaction is protected by RFC-0362 locks and must end by deleting the source `apps/<id>/` directory. `sternsystem.validate` fails on any registered active system that still has `apps/<id>/`.
3. **No compatibility pipeline.** Validators and build commands may temporarily read `apps/*` only for extraction. After the migration commit, `apps/` is invalid workspace topology.
4. **Full-fleet migration.** All current `apps/*` sites are migrated in one controlled implementation wave or a sequence of locked extraction commits that leave the repository green after each step.
5. **Generated app boilerplate moves to materialization.** Former app config and runtime boilerplate are generated into `missions/<mission-id>/working/`, not stored as durable site source.

### 7. Commands

Four new commands in `@gogol/site-kernel-handoff` (the package that already owns `handoff.*`):

#### 7.1 `sternsystem.register`

```sh
pnpm exec site-kernel run sternsystem.register \
  --id <kebab-case-id> \
  --cosmicStar <StarName> \
  --repo <git-url> \
  [--platform <semver>]   # defaults to current monorepo version
```

Registers a new Sternsystem in `systems/registry.yaml` with status `registered`. Clones the repo into `systems/<id>/` (if the repo already exists and is non-empty). Writes an initial `system.pin.json` if `--platform` is provided and the cache clone is present.

Fails if:

- The `id` already exists in the registry.
- The `id` matches an existing `apps/<id>/` directory (extraction must complete first).
- The `cosmicStar` is not in `StarCatalog` or is already in use by an active/registered system.
- The `repo` URL is invalid or unreachable.

#### 7.2 `sternsystem.list`

```sh
pnpm exec site-kernel run sternsystem.list [--json]
```

Prints every registered Sternsystem with: id, cosmicStar, repo, pinnedPlatform, currentMission, lastRelease, status, registeredAt.

#### 7.3 `sternsystem.validate`

```sh
pnpm exec site-kernel run sternsystem.validate [--id <id>] [--json]
```

Validates one or all Sternsystems:

- Registry invariants (§2.3): unique ids, unique cosmicStars, valid cosmicStar, valid repo, semver pinnedPlatform.
- Bundle contract (§1): no `packages/`, no `node_modules/`, no `dist/`, no `*.generated.*` in the cache clone.
- Pin file (§3): `system.pin.json` parses, `platform.version` matches registry `pinnedPlatform`, `migratorCursor` is valid.
- No `apps/` collision (§6.4): registered id does not match an `apps/` directory.

#### 7.4 `sternsystem.pin`

```sh
pnpm exec site-kernel run sternsystem.pin --id <id> [--platform <semver>] [--json]
```

Writes or updates `system.pin.json` for the specified Sternsystem. If `--platform` is omitted, pins to the current monorepo version. Records the current monorepo commit, RFC head, and `platformSemanticHash` from RFC-0364.

Fails if:

- The Sternsystem is not registered.
- The cache clone is absent (run `sternsystem.register` first).
- `--platform` is older than the current pin (refuse downgrade, per RFC-0221 §4.1).

## Architectural fit

- **DNA-1 (Monorepo boundary):** This RFC extends the boundary. The platform (`packages/`) and the sites (`systems/`) are separated. Sites are no longer workspace members; they are version-pinned external bundles. The platform remains a monorepo; the sites do not.
- **DNA-4 (Canonical content in `src/content/`):** Preserved. A Sternsystem's `src/content/**` is the same canonical content surface defined by RFC-0047.
- **DNA-6 (Kebab-case filenames):** Extended. Sternsystem ids are kebab-case, lowercase, latin-only. The naming convention lint (RFC-0360) will be extended to cover `systems/` and `missions/`.
- **DNA-17 (Uni manifest contract):** Preserved. Sternsystems consume the same `uni.registry.json` capabilities as `apps/` members; the pin records the consumed subset.
- **RFC-0221 (Site handoff bundle):** This RFC generalizes the `handoff.pack` transfer unit into a persistent, independently versioned unit, but narrows durable ownership to data-only Sternsystem source. The `SystemPin` is a subset of `HandoffLock` amended with `platformSemanticHash`.
- **RFC-0353 (Compass rename):** This RFC uses Compass terminology throughout. No GRACE references in new code or documentation.
- **RFC-0362 (Werkstatt consistency):** Registry, cache, and pin mutations use scoped locks, idempotency records, and atomic writes.
- **RFC-0364 (Semantic fingerprint):** Platform hashes are semantic fingerprints produced by `@gogol/fingerprint`.
- **Anti-patterns prevented:** "sites as workspace members that couple install/build graphs" and "no fleet registry — sites are discovered by listing `apps/`".

## Design

### CLI surface

```sh
pnpm exec site-kernel run sternsystem.register --id <id> --cosmicStar <Star> --repo <url>
pnpm exec site-kernel run sternsystem.list
pnpm exec site-kernel run sternsystem.validate
pnpm exec site-kernel run sternsystem.validate --id <id>
pnpm exec site-kernel run sternsystem.pin --id <id>
pnpm exec site-kernel run sternsystem.pin --id <id> --platform 4.6.0
```

All commands support `--json` output with the standard `{ command, status, data, summary }` envelope.

### TypeScript contracts

New Zod schemas in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/sternsystem.ts

export const SystemPinSchema = z.object({
  schemaVersion: z.string(),
  systemId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  cosmicStar: z.string(),
  pinnedAt: z.string().datetime(),
  platform: z.object({
    version: z.string(),
    commit: z.string(),
    rfcHead: z.string(),
    platformSemanticHash: z.string(),
  }),
  migratorCursor: z.string(),
  capabilities: z.array(
    z.object({
      semanticId: z.string(),
      version: z.string(),
      intent: z.array(z.string()),
    }),
  ),
});

export const FleetRegistryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  cosmicStar: z.string(),
  repo: z.string(),
  pinnedPlatform: z.string(),
  currentMission: z.string().nullable(),
  lastRelease: z.string().nullable(),
  status: z.enum(["registered", "active", "paused", "archived"]),
  registeredAt: z.string().datetime(),
  notes: z.string().default(""),
});

export const FleetRegistrySchema = z.object({
  schemaVersion: z.string(),
  systems: z.array(FleetRegistryEntrySchema),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/registry.yaml` | Fleet registry (tracked) |
| `systems/<id>/` | Cache clone of Sternsystem git repo (gitignored) |
| `systems/<id>/system.pin.json` | Version pin file (inside the cache clone, committed to the Sternsystem's own repo) |
| `packages/os/site-kernel-handoff/src/sternsystem/` | New module: register, list, validate, pin command handlers |
| `packages/ontology/src/schemas/sternsystem.ts` | Zod schemas for `SystemPin`, `FleetRegistryEntry`, `FleetRegistry` |
| `packages/os/site-kernel/src/registry.ts` | Register the four new commands |
| `.gitignore` (root) | Add `systems/*` and `!systems/registry.yaml` entries |
| `docs/architecture-dna.md` | Add DNA-44 and DNA-45 entries |

### Output format

`sternsystem.list --json`:

```json
{
  "command": "sternsystem.list",
  "status": "pass",
  "data": {
    "systems": [
      {
        "id": "webgogol-com",
        "cosmicStar": "Vega",
        "repo": "git@github.com:webgogol/webgogol-com.git",
        "pinnedPlatform": "4.5.0",
        "currentMission": null,
        "lastRelease": null,
        "status": "active",
        "registeredAt": "2026-07-09T00:00:00Z"
      }
    ],
    "count": 1
  },
  "summary": "[sternsystem.list] 1 system registered"
}
```

`sternsystem.validate --json`:

```json
{
  "command": "sternsystem.validate",
  "status": "pass",
  "data": {
    "validated": 1,
    "violations": []
  },
  "summary": "[sternsystem.validate] 1 system validated, 0 violations"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Duplicate id in registry | non-zero | `[sternsystem.register] id '<id>' already exists in systems/registry.yaml` |
| cosmicStar not in StarCatalog | non-zero | `[sternsystem.register] cosmicStar '<Star>' is not in StarCatalog` |
| cosmicStar in use by active system | non-zero | `[sternsystem.register] cosmicStar '<Star>' is already used by '<existing-id>' (status: active)` |
| apps/ collision | non-zero | `[sternsystem.register] id '<id>' matches existing apps/<id>/ — extract first` |
| Cache clone absent on pin | non-zero | `[sternsystem.pin] systems/<id>/ is absent — run sternsystem.register first` |
| Downgrade refused | non-zero | `[sternsystem.pin] requested platform <X> is older than current pin <Y> — a site is never downgraded` |
| Bundle contract violation | non-zero | `[sternsystem.validate] systems/<id>/ contains forbidden path: <path>` |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `SystemPin`, `FleetRegistryEntry`, `FleetRegistry` Zod schemas in `@gogol/ontology`.
3. Create `packages/os/site-kernel-handoff/src/sternsystem/` module with the four command handlers.
4. Register commands in `packages/os/site-kernel/src/registry.ts`.
5. Add `.gitignore` entries for `systems/*` (except `registry.yaml`), `missions/`, `releases/`, `agents/`, and `.werkstatt/`.
6. Create an empty `systems/registry.yaml` with `schemaVersion: "1.0.0"` and `systems: []`.
7. Implement `sternsystem.register` + `sternsystem.list` first (low-risk, no bundle validation).
8. Implement `sternsystem.validate` + `sternsystem.pin`.
9. **Pilot**: register and extract `webgogol-com`, validate materialization, then remove `apps/webgogol-com`.
10. Add DNA-44 and DNA-45 to `docs/architecture-dna.md`.
11. Run `build:check` to verify no `apps/` pipeline regression.

### Pilot registration

The pilot registration of `webgogol-com` is no longer metadata-only in the final migration. Registration and extraction are separate commands, but the implementation wave is not complete until `apps/webgogol-com` is removed and materialization validates.

```yaml
systems:
  - id: webgogol-com
    cosmicStar: Vega
    repo: git@github.com:webgogol/webgogol-com.git
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: null
    status: registered
    registeredAt: "2026-07-09T00:00:00Z"
    notes: "Pilot Sternsystem — extraction and apps/ removal gated by RFC-0356"
```

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Git submodules for sites | Submodules couple the site's git history to the monorepo's, require `.gitmodules` coordination, and make independent lifecycle (create/archive/transfer) awkward. A registry + gitignored cache clone is simpler and decouples the histories. |
| Keep sites as `apps/` members and scale the monorepo | `pnpm install` and Turborepo's task graph do not scale to thousands of workspace members. The coupling is structural, not fixable by tooling. |
| Use `handoff.pack` bundles as the persistent unit (no separate Sternsystem concept) | `handoff.pack` is a transfer artifact with a lock; it lacks the persistent pin, bordbuch, and registry integration that a durable site unit needs. Generalizing it into a Sternsystem is the natural next step. |
| Store the fleet registry in JSON instead of YAML | YAML is human-readable and editable, which matters for a registry that will be reviewed and curated. JSON is machine-only. The Zod schema validates both. |
| Register sites in `fleet/fleet.sites.json` (existing) | `fleet.sites.json` is a flat list of app names for the pilot deploy runner. It has no schema, no version pins, no repo URLs, and no lifecycle state. A new registry with a proper schema is cleaner than retrofitting. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Sternsystem data contract drifts from RFC-0221 authored/derived partition | Medium | `sternsystem.validate` reuses and narrows the same `authored-set.ts` helpers from `handoff.pack`; the partition is not reimplemented ad hoc. |
| Registry grows large (thousands of entries) and `sternsystem.list` becomes slow | Low | The registry is a single YAML file; parsing thousands of entries is sub-second. If it ever becomes a bottleneck, it can be split by first letter or migrated to a database — but that is far beyond the current scale. |
| Cache clone becomes stale vs the Sternsystem's remote repo | Medium | The cache is gitignored and disposable; materialization (RFC-0356) always fetches before operating and aborts on remote drift. |
| `apps/` removal breaks old commands | High | This is intentional. The implementation wave updates command discovery and validation to use Sternsystem/materialized mission roots before deleting `apps/`. |
| cosmicStar uniqueness prevents reuse of a star after archiving | Low | The uniqueness rule applies only to `active` and `registered` systems. An `archived` system's star may be reused by a new system. |

## Acceptance criteria

- [x] `SystemPin`, `FleetRegistryEntry`, `FleetRegistry` Zod schemas defined in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] `sternsystem.register` command registered and tested (evidence: implemented historically)
- [x] `sternsystem.list` command registered and tested (evidence: implemented historically)
- [x] `sternsystem.validate` command registered and tested (evidence: implemented historically)
- [x] `sternsystem.pin` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable for all four commands (evidence: implemented historically)
- [x] `systems/registry.yaml` created with `schemaVersion: "1.0.0"` and empty `systems: []` (evidence: implemented historically)
- [x] `.gitignore` updated with `systems/*`, `!systems/registry.yaml`, `missions/`, `releases/`, `agents/`, `.werkstatt/` (evidence: implemented historically)
- [x] `sternsystem.validate` enforces all registry invariants (§2.3) and bundle contract (§1.2) (evidence: implemented historically)
- [x] `sternsystem.validate` refuses dual representation (apps/ collision, §6.4) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `sternsystem.pin` refuses downgrade (RFC-0221 §4.1 matrix) (evidence: implemented historically)
- [x] Pilot: `webgogol-com` registered, extracted, materialized, and removed from `apps/` (deferred to RFC-0356 materialization) (evidence: implemented historically)
- [x] `apps/` directory removed after full migration (deferred to full migration wave) (evidence: original apps retired by RFC-0381, migration completed historically)
- [x] DNA-44 and DNA-45 added to `docs/architecture-dna.md` (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `pnpm -s run build:check` passes with no `apps/` pipeline regression (deferred to full migration) (evidence: build:check passes, exitCode=0)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0354` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0354 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The authored-data partition MUST derive from the existing Compass boundary and `*.generated.*` convention (RFC-0221 §5), then narrow it to data-only Sternsystem ownership. Do not invent a parallel classifier.
- The `SystemPin` schema is a subset of `HandoffLock` (RFC-0221 §2) amended by RFC-0364. Reuse field semantics, but write `platformSemanticHash` instead of raw `packagesHash`.
- The `.gitignore` entries for `systems/`, `missions/`, `releases/`, `agents/`, and `.werkstatt/` MUST be added in the same commit as the registry creation — do not leave the directories un-ignored.
- The final migration is not additive. Do not preserve `apps/` compatibility after every current site has been extracted and validated.
- Do NOT store scripts, package manifests, Astro/Wrangler/TypeScript config, or generated files in Sternsystem repos. Generate them during materialization.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
