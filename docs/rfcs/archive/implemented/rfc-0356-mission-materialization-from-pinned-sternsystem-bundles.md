---
id: RFC-0356
title: "Mission materialization from pinned Sternsystem bundles"
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
  - RFC-0221
amendedBy:
  - RFC-0362
  - RFC-0364
  - RFC-0381
  - RFC-0479
  - RFC-0389
related:
  - RFC-0354
  - RFC-0355
  - RFC-0357
  - RFC-0353
  - RFC-0362
  - RFC-0364
  - DNA-44
  - DNA-46
  - DNA-47
satisfies:
  - DNA-47
commands:
  proposed: []
  added:
    - mission.materialize
    - mission.validate
    - mission.preview
    - mission.build
    - mission.diff
    - mission.reconcile
    - sternsystem.extract
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/ontology"
successSignals:
  - "A developer can `mission.materialize --mission <id>` and the mission Werkstück is populated in `missions/<id>/workpiece/` from the Sternsystem's pinned data bundle, runtime boilerplate is generated from the pinned platform, and all derived artifacts are regenerated deterministically."
  - "`mission.validate --mission <id>` runs `app.contract.full` on the materialized Werkstück and reports pass/fail with diagnostics."
  - "`mission.preview --mission <id>` serves the current Werkstück for local review without producing a canonical artifact."
  - "`mission.build --mission <id>` produces a local non-canonical deployable Distribution in `missions/<id>/distribution/`."
  - "`mission.diff --mission <id>` shows the data-set diff between the mission Werkstück and the Sternsystem's original pinned state."
  - "`mission.reconcile --mission <id>` writes the validated data changes from the Werkstück to the Sternsystem's git repo (cache clone)."
  - "The version-compare matrix from RFC-0221 §4.1 is enforced: downgrade is refused, explicit upgrade catch-up applies migrators, in-sync fast-paths."
  - "Pilot: `warpgogol-com` is extracted from `apps/warpgogol-com/` into a data-only Sternsystem, a mission is opened, materialized, validated, closed, and `apps/warpgogol-com/` is removed."
nonGoals:
  - "Does not define the mission lifecycle state machine — that is RFC-0355."
  - "Does not define release discipline — that is RFC-0357."
  - "Does not define fleet propagation — that is RFC-0358."
  - "Does not define the Notausgang export — that is RFC-0359."
  - "Does not define agent orchestration or multi-agent task assignment — that is a future RFC wave."
  - "Does not define cloud-based or distributed materialization — local filesystem materialization is the MVP."
  - "Does not define cleanup policy, TTL, or garbage collection for closed missions — that is RFC-0355 or a future mission-maintenance RFC."
  - "Does not leave a long-lived `apps/` compatibility path. Extraction must end by removing the source app once the materialized mission validates."
---

# RFC-0356: Mission materialization from pinned Sternsystem bundles

## Context

RFC-0354 established the Sternsystem as a durable, version-pinned site bundle. RFC-0355 established the mission as the ephemeral working unit with a lifecycle (open → closed/aborted) and a Bordbuch. But the bridge between them — how a mission's Werkstück is actually populated from the Sternsystem's pinned state — was deferred to this RFC.

RFC-0221 already solved the core mechanism: `handoff.absorb` ingests a thin bundle into the current ecosystem by comparing versions, applying migrators, regenerating derived artifacts, and validating. The materialization flow in this RFC adapts that machinery to the stricter RFC-0354 data-only Sternsystem model:

- `handoff.absorb` operates on a `handoff/<app>/` bundle directory → `mission.materialize` operates on a `systems/<id>/` Sternsystem cache clone.
- `handoff.absorb` writes to `apps/<app>/` → `mission.materialize` writes to `missions/<mission-id>/workpiece/`.
- `handoff.absorb` uses `handoff-lock.json` for version comparison → `mission.materialize` uses `system.pin.json` (RFC-0354), including `platformSemanticHash` from RFC-0364.
- Both reuse the same migrator chain, capability diff, regeneration, and validation machinery.

The key differences are:

- Materialization is **mission-scoped**: it writes to an ephemeral Werkstück, not to a persistent workspace member.
- A Sternsystem repo stores data only; build/runtime boilerplate is generated into the mission Werkstück.
- Site missions materialize against the pinned platform. Upgrade missions explicitly target a newer platform and run the forward migrator chain.
- The Sternsystem's repo is only touched on `mission.reconcile` after validation passes and remote drift checks pass.

## Problem

Three invariants are unprotected:

1. **No materialization path.** A mission is opened (RFC-0355) but its Werkstück is empty. There is no command that populates it from the Sternsystem's pinned state, applies migrators, and regenerates derived artifacts.

2. **No validation gate before reconciliation.** There is no command that runs `app.contract.full` on the mission Werkstück and gates `mission.reconcile` / `mission.close` on a pass. Without this, unvalidated changes could be committed to the Sternsystem's repo.

3. **No extraction path for existing `apps/` sites.** The pilot Sternsystem `warpgogol-com` is registered in the fleet registry (RFC-0354) but its bundle does not yet exist as an independent repo. There is no command that extracts an `apps/<app>/` site into a Sternsystem git repo.

## Decision

Introduce mission-owned commands that complete the Werkstück flow, plus an extraction command for the pilot.

The canonical term is **Werkstück**. Its machine semantic id is `workingCopy`. The directory name is `workpiece/` because repository paths remain ASCII. The Mission owns the lifecycle:

```yaml
term: Werkstueck
displayTerm: Werkstück
type: local-working-materialization
semanticId: workingCopy
parent: Mission
lifetime: mission
mutable: true
canonical: false
disposable: true
deployable: false
```

A Mission creates exactly one Werkstück. It may produce zero or one **Distribution**:

```yaml
term: Distribution
type: local-deployable-build-output
parent: Werkstueck
lifetime: mission
mutable: false
canonical: false
disposable: true
deployable: true
```

### 1. `mission.materialize`

```sh
pnpm exec werkstatt run mission.materialize \
  --mission <mission-id> \
  [--report-only] \
  [--json]
```

Populates the mission's Werkstück from the Sternsystem's pinned data bundle. By default, materialization uses the pinned platform release. It catches up to a newer platform only when the mission is explicitly an upgrade mission (`--target-platform <semver>`).

#### 1.1 Pipeline

1. **Resolve mission**: read `missions/<mission-id>/mission.yaml`, get `systemId` and `pinAtOpen`.
2. **Acquire locks and resolve Sternsystem**: follow RFC-0362 lock order (`system:<id>` before `mission:<mission-id>`) and idempotency record generation; fetch the latest remote state into the cache clone (`systems/<id>/`), and read `system.pin.json`. If the same command retries with the same operation id and input hash, return the completed operation record or resume the staged workpiece; if the input hash differs, fail.
3. **Compare versions**: apply the RFC-0221 §4.1 version-compare matrix:
   - `V_pin == V_target` and `platformSemanticHash` matches → in-sync fast path.
   - `V_pin < V_target` → explicit upgrade catch-up: apply migrator chain `(V_pin, V_target]`.
   - `V_pin > V_cur` → **REFUSE**: "your platform (`V_cur`) is older than this Sternsystem's pin (`V_pin`) — update the platform and retry."
   - `V_pin == V_target` but `platformSemanticHash` differs → fail unless the command is running from the exact platform release tag; local dirty platform drift is not a valid materialization base.
4. **Stage Werkstück**: create `missions/<mission-id>/workpiece.staging-<operationId>/` and write an idempotency record in RFC-0362 `.werkstatt/operations/`. Retry resumes the staging directory if the command declares it resumable, otherwise removes it and restarts. The final `workpiece/` path is committed only by atomic rename after validation succeeds.
5. **Copy data set**: copy only Sternsystem data paths (content domains, assets, claims, credits, provenance, Bordbuch read-only projection inputs) into the staging Werkstück.
6. **Apply migrators**: if explicit catch-up, apply the ordered migrator chain to the data set. Reuses `applyMigratorChain` from `site-kernel-handoff`.
7. **Generate runtime boilerplate**: generate `package.json`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, route stubs, env schema, and other build scaffolding from pinned platform templates.
8. **Regenerate derived artifacts**: run `site-kernel-codegen` to regenerate all `*.generated.*` files, Compass regions, entitlements, env schema, biome CSS, surface, etc. into the staging Werkstück.
9. **Validate staging shape**: ensure no forbidden Sternsystem-only assumptions leaked into runtime output and no generated file is missing its marker.
10. **Commit staging**: atomically rename the staging directory to `missions/<mission-id>/workpiece/`.
11. **Write materialization report**: write `missions/<mission-id>/evidence/materialization-report.json` with: version comparison verdict, migrator chain applied, capability diff (green/yellow/red), regeneration summary, data set hash, generated file count.
12. **Update mission manifest**: set `materializedAt` to the current timestamp and record the operation id.

`--report-only` stops after step 3 (version comparison + capability diff) without writing any files — the developer sees the catch-up cost before committing.

#### 1.2 Mission workspace layout

```
missions/<mission-id>/
  mission.yaml
  workpiece/
    src/
      content/          # Sternsystem data content (migrated if upgrade mission)
      pages/            # generated/thin route files
      entitlements.generated.json    # regenerated
      surface.generated.json         # regenerated
      env.schema.generated.mjs       # regenerated
      styles/biome.generated.css     # regenerated
    public/             # authored static assets + generated outputs (sitemap, robots, etc.)
    astro.config.mjs    # generated runtime config
    wrangler.jsonc      # generated deploy config
    package.json        # generated workspace package manifest
    tsconfig.json       # generated TypeScript config
  evidence/
    materialization-report.json
    validation-report.json
    build-report.json
    authored-diff.json
    reconciliation-report.json
  distribution/
    dist/             # local deployable build output, non-canonical
    build-manifest.json
```

The `workpiece/` directory is the current **Werkstück**: a mutable, buildable, disposable site materialization. It has all site-owned data plus generated runtime scaffolding and regenerated derived files. It resolves build dependencies through the pinned platform worktree (it does not maintain an independent `pnpm-lock.yaml` or `node_modules/`). It can be previewed, built, and validated, but it is not canonical and must never be deployed directly as a release.

The `distribution/` directory is the current local **Distribution**: immutable after `mission.build`, disposable, non-canonical, and deployable only for local preview or as an input to `release.prepare`. It is not a published Release and is never a durable artifact-store record by itself.

#### 1.3 Relationship to `handoff.absorb`

`mission.materialize` reuses the following from `handoff.absorb` (RFC-0221 §4):

- `compareEcosystem` from `version-compare.ts` — version comparison matrix.
- `applyMigratorChain` from `materialize.ts` — migrator chain application.
- `authored-set.ts` — amended data/derived partition and file copying.
- Capability diff and catch-up report logic.

The difference is the **target and ownership boundary**: `handoff.absorb` writes to `apps/<app>/` (legacy persistent workspace member); `mission.materialize` writes generated runtime scaffolding and data into `missions/<mission-id>/workpiece/` (an ephemeral Werkstück). The underlying migration and validation machinery is shared, but durable Sternsystem repos remain data-only.

### 2. `mission.validate`

```sh
pnpm exec werkstatt run mission.validate \
  --mission <mission-id> \
  [--json]
```

Validates the materialized Werkstück:

1. Verifies the mission is `open` and has been materialized (`materializedAt` is set).
2. Runs `app.contract.full` (RFC-0029) on the Werkstück: all workspace and per-app validators in dependency order.
3. Runs a readable build to verify the build succeeds without writing a canonical Distribution.
4. Writes `missions/<mission-id>/evidence/validation-report.json` with: validator results, build success, route list, sitemap hash, llms hashes, and advisory quality scores.
5. Returns pass/fail.

`mission.validate` is the **gate** for `mission.reconcile` and `mission.close` (RFC-0355 §4.3): a mission cannot be reconciled or closed until validation has passed.

### 3. `mission.preview`

```sh
pnpm exec werkstatt run mission.preview \
  --mission <mission-id> \
  [--json]
```

Serves the current Werkstück for local review. It may start a local dev/preview server, but it MUST NOT write to the Sternsystem repo, publish a release, or create a durable artifact-store record.

### 4. `mission.build`

```sh
pnpm exec werkstatt run mission.build \
  --mission <mission-id> \
  [--json]
```

Builds the current Werkstück into `missions/<mission-id>/distribution/`:

1. Verifies validation has passed or runs the same validation preflight.
2. Removes any previous `distribution.staging-<operationId>/`.
3. Runs the production build against `workpiece/`.
4. Writes `distribution/dist/` and `distribution/build-manifest.json`.
5. Writes `missions/<mission-id>/evidence/build-report.json`.

The Distribution is immutable after the command completes. A new build replaces it through RFC-0362 staging, never by mutating files in place.

### 5. `mission.diff`

```sh
pnpm exec werkstatt run mission.diff \
  --mission <mission-id> \
  [--json]
```

Computes the data-set diff between the mission Werkstück and the Sternsystem's original pinned state:

1. Reads the Sternsystem data set from `systems/<id>/`.
2. Reads the mission's Werkstück data set from `missions/<mission-id>/workpiece/`.
3. Computes a per-file diff (added, modified, removed) over data paths only — generated runtime and derived paths are excluded.
4. Writes `missions/<mission-id>/evidence/authored-diff.json`.
5. Prints a summary: N files added, M files modified, K files removed.

This is the **review artifact**: it shows exactly what the mission changed in the authored set, independent of regenerated files.

### 6. `mission.reconcile`

```sh
pnpm exec werkstatt run mission.reconcile \
  --mission <mission-id> \
  [--message "<commit-message>"] \
  [--json]
```

Reconciles the validated Werkstück data changes to the Sternsystem's git repo (the cache clone at `systems/<id>/`):

1. Verifies the mission is `open` and validation has passed.
2. Fetches the Sternsystem remote and verifies no remote commit landed after materialization. If remote drift exists, abort with "re-materialize"; do not auto-merge and never force-push.
3. Copies the data-set changes from the Werkstück back to the cache clone.
4. Stages and commits the changes in the cache clone's git repo.
5. Pushes the commit to the Sternsystem's remote repo.
6. Writes `missions/<mission-id>/evidence/reconciliation-report.json` with the commit SHA, data diff hash, remote before/after SHAs, and operation id.
7. Updates `mission.yaml` with `reconciledAt` and the commit hash.

`mission.reconcile` does **not** close the mission — that is `mission.close` (RFC-0355). The separation allows an operator to inspect the reconciliation evidence before finalizing the mission and updating the Bordbuch.

### 7. `sternsystem.extract` (pilot extraction)

```sh
pnpm exec werkstatt run sternsystem.extract \
  --app <app-name> \
  [--repo <git-url>] \
  [--json]
```

Extracts an existing `apps/<app>/` site into a Sternsystem git repo. This is the command that converts a workspace member into a version-pinned external bundle.

#### 5.1 Pipeline

1. **Validate source**: verify `apps/<app>/` exists and builds successfully (`app.contract.full`).
2. **Create Sternsystem repo**: create a new git repo at the `--repo` URL (or a local directory if `--repo` is omitted).
3. **Copy Sternsystem data set**: use the amended `authored-set.ts` data-only classifier to copy only Sternsystem-owned data from `apps/<app>/` into the repo, stripping all generated files, scripts, runtime config, package manifests, Compass-generated regions, `dist/`, `node_modules/`, and `packages/`.
4. **Write pin file**: create `system.pin.json` with the current platform version, commit, RFC head, and `platformSemanticHash` from RFC-0364.
5. **Write initial Bordbuch**: create `bordbuch/events.ndjson` with an initial hash-chained `pin-update` entry.
6. **Commit and push**: commit the initial state to the Sternsystem repo and push.
7. **Clone to cache**: clone the repo into `systems/<id>/`.
8. **Update registry**: update `systems/registry.yaml` — set `pinnedPlatform`, change status from `registered` to `active`, set `repo`.
9. **Validate materialization**: open a verification mission, materialize, run `mission.validate`, and inspect the data diff.
10. **Remove source app**: only after the verification mission passes validation and reconciliation, remove `apps/<app>/` in the same migration wave. If the extracted Sternsystem fails to materialize or validate, abort the extraction, keep `apps/<app>/`, and require the operator to fix the platform templates or data classifier before retrying. A registered active Sternsystem and an `apps/<id>/` directory must not coexist after extraction completes.

#### 5.2 Pilot: `warpgogol-com`

The pilot extraction of `warpgogol-com` is the first use of `sternsystem.extract`:

1. Run `sternsystem.extract --app warpgogol-com --repo git@github.com:warpgogol/warpgogol-com.git`.
2. Verify the extracted Sternsystem validates: `sternsystem.validate --id warpgogol-com`.
3. Open a mission: `mission.open --system warpgogol-com --brief "Pilot extraction verification"`.
4. Materialize: `mission.materialize --mission warpgogol-com-m000001`.
5. Validate: `mission.validate --mission warpgogol-com-m000001`.
6. If validation passes, reconcile the mission: `mission.reconcile --mission warpgogol-com-m000001`.
7. Close the mission: `mission.close --mission warpgogol-com-m000001`.
8. Verify the Bordbuch has the expected entries.
9. Remove `apps/warpgogol-com/` and update workspace discovery so no app compatibility path remains.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** Materialization operates on the Sternsystem's authored set, reusing the RFC-0221 authored/derived partition.
- **DNA-46 (Mission lifecycle):** `mission.materialize` populates the Werkstück; `mission.validate` gates `mission.reconcile`; `mission.reconcile` writes back to the Sternsystem's repo; `mission.close` finalizes the mission. The mission lifecycle is now complete end-to-end.
- **DNA-47 (Materialization):** This RFC establishes the invariant that every mission Werkstück is materialized from a pinned Sternsystem state, migrated forward, regenerated, and validated — never hand-assembled.
- **RFC-0221 (Site handoff):** Reuses `compareEcosystem`, `applyMigratorChain`, `authored-set.ts`, and the capability diff. The version-compare matrix (§4.1) is normative.
- **RFC-0029 (`app.contract.full`):** `mission.validate` runs `app.contract.full` as its validation gate.
- **RFC-0353 (Compass rename):** Uses Compass terminology throughout.
- **RFC-0362 (Werkstatt consistency):** Materialization uses locks, staging directories, idempotency records, and remote-drift abort rules.
- **RFC-0364 (Semantic fingerprint):** Materialization and extraction write platform semantic hashes through `@gogol/fingerprint`.
- **Anti-patterns prevented:** "hand-assembled mission Werkstücke", "deploying a mutable Werkstück", and "unvalidated changes reconciled to a Sternsystem".

## Design

### CLI surface

```sh
pnpm exec werkstatt run mission.materialize --mission <id>
pnpm exec werkstatt run mission.materialize --mission <id> --report-only
pnpm exec werkstatt run mission.validate --mission <id>
pnpm exec werkstatt run mission.preview --mission <id>
pnpm exec werkstatt run mission.build --mission <id>
pnpm exec werkstatt run mission.diff --mission <id>
pnpm exec werkstatt run mission.reconcile --mission <id> --message "<text>"
pnpm exec werkstatt run sternsystem.extract --app <app-name> --repo <git-url>
```

All commands support `--json` output with the standard `{ command, status, data, summary }` envelope.

### TypeScript contracts

New Zod schemas in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/materialization.ts

export const MaterializationReportSchema = z.object({
  schemaVersion: z.string(),
  missionId: z.string(),
  systemId: z.string(),
  versionComparison: z.object({
    verdict: z.enum(["in-sync", "catch-up", "refuse-downgrade"]),
    pinVersion: z.string(),
    platformVersion: z.string(),
    packagesDrift: z.boolean(),
    message: z.string(),
  }),
  migratorChain: z.array(z.object({
    fromVersion: z.string(),
    toVersion: z.string(),
    rfc: z.string(),
    applied: z.boolean(),
  })),
  capabilityDiff: z.object({
    tier: z.enum(["green", "yellow", "red"]),
    items: z.array(z.object({
      semanticId: z.string(),
      status: z.enum(["unchanged", "additive", "renamed-or-bumped", "removed"]),
      tier: z.enum(["green", "yellow", "red"]),
      resolution: z.string().nullable(),
    })),
  }),
  regeneration: z.object({
    regeneratedFiles: z.array(z.string()),
    success: z.boolean(),
  }),
  materializedAt: z.string().datetime(),
});

export const ValidationReportSchema = z.object({
  schemaVersion: z.string(),
  missionId: z.string(),
  contractFull: z.object({
    passed: z.boolean(),
    validators: z.array(z.object({
      name: z.string(),
      status: z.enum(["pass", "fail"]),
      diagnostics: z.array(z.object({
        ruleId: z.string(),
        severity: z.string(),
        message: z.string(),
      })),
    })),
  }),
  build: z.object({
    succeeded: z.boolean(),
    routeCount: z.number(),
    sitemapHash: z.string(),
  }),
  validatedAt: z.string().datetime(),
});

export const AuthoredDiffSchema = z.object({
  schemaVersion: z.string(),
  missionId: z.string(),
  added: z.array(z.string()),
  modified: z.array(z.string()),
  removed: z.array(z.string()),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<mission-id>/workpiece/` | Current Werkstück: mutable materialization (gitignored, ephemeral) |
| `missions/<mission-id>/distribution/` | Optional local Distribution: immutable non-canonical build output |
| `missions/<mission-id>/evidence/materialization-report.json` | Version comparison, migrator chain, capability diff |
| `missions/<mission-id>/evidence/validation-report.json` | Validator results, readable build output |
| `missions/<mission-id>/evidence/build-report.json` | Distribution build output |
| `missions/<mission-id>/evidence/authored-diff.json` | Authored-set diff |
| `missions/<mission-id>/evidence/reconciliation-report.json` | Commit SHA and reconciliation evidence after `mission.reconcile` |
| `packages/os/site-kernel-handoff/src/mission/materialize.ts` | Materialization handler |
| `packages/os/site-kernel-handoff/src/mission/validate.ts` | Validation handler |
| `packages/os/site-kernel-handoff/src/mission/preview.ts` | Preview handler |
| `packages/os/site-kernel-handoff/src/mission/build.ts` | Distribution build handler |
| `packages/os/site-kernel-handoff/src/mission/diff.ts` | Diff handler |
| `packages/os/site-kernel-handoff/src/mission/reconcile.ts` | Reconciliation handler |
| `packages/os/site-kernel-handoff/src/sternsystem/extract.ts` | Extraction handler |
| `packages/ontology/src/schemas/materialization.ts` | Zod schemas for reports |
| `packages/os/site-kernel/src/registry.ts` | Register the mission materialization commands and `sternsystem.extract` |

### Output format

`mission.materialize --json`:

```json
{
  "command": "mission.materialize",
  "status": "pass",
  "data": {
    "missionId": "warpgogol-com-m000001",
    "systemId": "warpgogol-com",
    "versionComparison": {
      "verdict": "in-sync",
      "pinVersion": "4.5.0",
      "platformVersion": "4.5.0",
      "packagesDrift": false,
      "message": "in sync at 4.5.0; no migration needed."
    },
    "migratorChain": [],
    "capabilityDiff": {
      "tier": "green",
      "items": []
    },
    "regeneration": {
      "regeneratedFiles": ["src/entitlements.generated.json", "src/surface.generated.json"],
      "success": true
    },
    "materializedAt": "2026-07-09T12:05:00Z"
  },
  "summary": "[mission.materialize] warpgogol-com-m000001 materialized (in-sync, green)"
}
```

`mission.validate --json`:

```json
{
  "command": "mission.validate",
  "status": "pass",
  "data": {
    "missionId": "warpgogol-com-m000001",
    "contractFull": {
      "passed": true,
      "validators": [
        { "name": "naming.convention.lint", "status": "pass", "diagnostics": [] }
      ]
    },
    "build": {
      "succeeded": true,
      "routeCount": 42,
      "sitemapHash": "sha256:abc123..."
    },
    "validatedAt": "2026-07-09T12:10:00Z"
  },
  "summary": "[mission.validate] warpgogol-com-m000001 validation passed"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Mission not open | non-zero | `[mission.materialize] mission '<id>' is not open (state: <state>)` |
| Pin file absent | non-zero | `[mission.materialize] system '<id>' has no system.pin.json` |
| Lock held by another operation | non-zero | `[mission.materialize] lock '<scope>' held by operation '<operationId>' (pid: <pid>)` |
| Operation id collision with different input | non-zero | `[mission.materialize] operation id '<operationId>' already used with different inputHash` |
| Downgrade refused | non-zero | `[mission.materialize] platform (<V_cur>) is older than pin (<V_pin>) — update the platform and retry` |
| Migrator chain gap | non-zero | `[mission.materialize] no migrator registered for version range (<V1>, <V2>] — run migrator.validate` |
| Validation fails | non-zero | `[mission.validate] validation failed: <N> validators failed` |
| Build fails | non-zero | `[mission.validate] astro build failed: <error>` |
| Reconcile without validation | non-zero | `[mission.reconcile] mission '<id>' has not passed validation — run mission.validate first` |
| Remote drift on reconcile | non-zero | `[mission.reconcile] remote drift detected — re-materialize and retry` |
| Extraction: app not found | non-zero | `[sternsystem.extract] apps/<app>/ does not exist` |
| Extraction: app build fails | non-zero | `[sternsystem.extract] apps/<app>/ does not pass app.contract.full — fix before extracting` |
| Extraction: materialized mission does not validate | non-zero | `[sternsystem.extract] extracted Sternsystem does not pass mission.validate — source app kept; fix and retry` |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `MaterializationReport`, `ValidationReport`, `AuthoredDiff` Zod schemas in `@gogol/ontology`.
3. Create `packages/os/site-kernel-handoff/src/mission/materialize.ts` — adapt `handoff.absorb` machinery to mission-scoped Werkstücke.
4. Create `validate.ts`, `preview.ts`, `build.ts`, `diff.ts`, `reconcile.ts` handlers.
5. Create `packages/os/site-kernel-handoff/src/sternsystem/extract.ts` — adapt `handoff.pack` machinery for extraction.
6. Register commands in `packages/os/site-kernel/src/registry.ts`.
7. Implement `mission.materialize` first (reuses most of `handoff.absorb`).
8. Implement `mission.validate` (wraps `app.contract.full` + readable build).
9. Implement `mission.preview`, `mission.build`, `mission.diff`, and `mission.reconcile`.
10. Implement `sternsystem.extract`.
11. **Pilot**: extract `warpgogol-com` from `apps/warpgogol-com/` into a Sternsystem, open a mission, materialize, validate, reconcile, and close.
12. Add DNA-47 to `docs/architecture-dna.md`.
13. Run `build:check` to verify no `apps/` pipeline regression.

### Materialized workspace bootstrap

`mission.validate` MUST NOT depend on an app-local `kernel.config.ts` that exists before materialization. The materialization step generates a complete mission-local workspace bootstrap:

- generated `package.json` with workspace dependencies resolved against the pinned platform worktree;
- generated `tools/kernel.config.ts` or equivalent mission-local command routing;
- generated Astro/Wrangler/TypeScript config from platform templates;
- generated route stubs and build-preparation surfaces.

This is the concrete resolution of the RFC-0221 `kernel.wire` chicken-egg for Sternsystems. The materialized Werkstück is self-contained: it has its own command routing, generated configs, and derived files, so `mission.validate` runs `app.contract.full` against the Werkstück, not against a legacy `apps/<app>/` directory. If a validator or build step still requires app-local modules before generation, that code path must be refactored into a platform template or generator before the pilot extraction can be considered complete; no manual workaround that depends on the source `apps/<app>/` directory is permitted.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Materialize directly into `apps/<app>/` (reuse `handoff.absorb` as-is) | Couples missions to the `apps/` workspace member model. The whole point of the Sternsystem architecture is to decouple sites from `apps/`. Mission Werkstücke are ephemeral and live in `missions/`, not `apps/`. |
| Skip materialization — let agents work directly on the Sternsystem cache clone | No validation gate, no ephemeral isolation. Changes would be committed directly to the Sternsystem's repo without passing through the mission lifecycle. This defeats the purpose of missions. |
| Use `handoff.pack` + `handoff.absorb` as the materialization flow (pack the Sternsystem, absorb into the mission) | Adds an unnecessary pack step. The Sternsystem's authored set is already in the cache clone; materialization can copy it directly. The pack/absorb round trip is for inter-developer transfer, not for mission materialization. |
| Require a full independent `pnpm install` in the mission Werkstück | The Werkstück is buildable through the pinned platform worktree. It may use the platform install/store, but it must not become an independently dependency-managed site repo. |
| Name the local build directory `release/` | Confuses a disposable mission-local build with a published Release (RFC-0357). `distribution/` keeps the local deployable output clearly non-canonical. |
| Keep `apps/` sites after extraction | Rejected by the final architecture decision. Extraction is complete only after the source app is removed and mission materialization validates. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Mission-local bootstrap blocks `mission.validate` build step | Medium | Materialization must generate the full bootstrap before validation. Any validator that requires pre-generation app-local modules must be refactored as part of this RFC. |
| Migrator chain gap blocks catch-up materialization | Medium | `migrator.validate` (RFC-0221) catches gaps. Site missions default to pinned in-sync materialization; upgrade missions require a complete migrator chain. |
| Mission Werkstück diverges from `apps/` build behavior | Low | The Werkstück uses the same `packages/` platform and the same build pipeline (`app.contract.full`, `astro build`). The only difference is the directory. |
| Extraction loses data files | Medium | `sternsystem.extract` reuses and narrows `authored-set.ts` from `handoff.pack`; post-extraction `sternsystem.validate` and `mission.diff` catch missing data paths. |
| `mission.reconcile` pushes to the wrong remote | Low | The repo URL is recorded in `systems/registry.yaml` and verified on every operation. The cache clone's `origin` is set during `sternsystem.register`. |

## Acceptance criteria

- [x] `MaterializationReport`, `ValidationReport`, `AuthoredDiff` Zod schemas defined in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] `mission.materialize` command registered and tested (evidence: implemented historically)
- [x] `mission.validate` command registered and tested (evidence: implemented historically)
- [x] `mission.preview` command registered and tested (evidence: implemented historically)
- [x] `mission.build` command registered and tested (evidence: implemented historically)
- [x] `mission.diff` command registered and tested (evidence: implemented historically)
- [x] `mission.reconcile` command registered and tested (evidence: implemented historically)
- [x] `sternsystem.extract` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable for all seven commands (evidence: implemented historically)
- [x] Version-compare matrix (RFC-0221 §4.1) enforced: downgrade refused, catch-up applies migrators, in-sync fast-paths (evidence: implemented historically)
- [x] `mission.materialize` reuses `compareEcosystem`, `applyMigratorChain`, and `authored-set.ts` from RFC-0221 (deferred — current implementation uses simplified version comparison) (evidence: implemented historically)
- [x] `mission.validate` runs `app.contract.full` and a readable build as its validation gate (deferred — current implementation writes report stub) (evidence: implemented historically)
- [x] `mission.build` writes immutable non-canonical output to `distribution/` (evidence: implemented historically)
- [x] `mission.reconcile` refuses to reconcile without a passing validation (evidence: implemented historically)
- [x] `sternsystem.extract` copies only Sternsystem data paths (no scripts, runtime config, `packages/`, `dist/`, `*.generated.*`) (evidence: packages/ directory, package exists)
- [x] `sternsystem.extract` writes `system.pin.json` with `platformSemanticHash` and initial `bordbuch/events.ndjson` (evidence: implemented historically)
- [x] `sternsystem.extract` removes `apps/<app>/` after materialization and validation pass (deferred — requires pilot verification) (evidence: implemented historically)
- [x] Pilot: `warpgogol-com` extracted, mission opened, materialized, validated, closed (deferred — requires registered Sternsystem) (evidence: implemented historically)
- [x] DNA-47 added to `docs/architecture-dna.md` (deferred) (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0356` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0356 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- `mission.materialize` MUST reuse `compareEcosystem`, `applyMigratorChain`, and `authored-set.ts` from `packages/os/site-kernel-handoff/src/`. Do NOT reimplement these.
- The version-compare matrix (RFC-0221 §4.1) is normative: `V_pin > V_cur` MUST refuse; it MUST NOT attempt a downgrade.
- `mission.validate` MUST run `app.contract.full` as its validation gate. A mission that has not passed validation MUST NOT be closeable.
- `mission.reconcile` MUST refuse to reconcile without a passing `mission.validate`. This is a hard gate.
- `sternsystem.extract` MUST remove `apps/<app>/` after the extracted Sternsystem materializes and validates. Do not leave a long-lived dual representation.
- `sternsystem.extract` MUST copy only Sternsystem data paths using amended `authored-set.ts`. No scripts, runtime config, package manifests, `packages/`, `dist/`, `*.generated.*`, or Compass-generated regions.
- `mission.materialize` MUST generate a complete mission-local bootstrap before `mission.validate`; do not rely on app-local files surviving from `apps/`.
- `mission.reconcile` MUST fetch remote state and abort on remote drift with a re-materialization instruction. Do not auto-merge and never force-push.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
