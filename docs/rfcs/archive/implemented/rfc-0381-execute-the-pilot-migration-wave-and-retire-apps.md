---
id: RFC-0381
title: "Execute the pilot migration wave and retire apps"
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
createdAt: 2026-07-12
updatedAt: 2026-07-13
enhancedAt: 2026-07-12
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0354
  - RFC-0356
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - DNA-46
  - DNA-47
  - DNA-48
  - DNA-49
  - DNA-50
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0357
  - RFC-0358
  - RFC-0359
  - RFC-0378
  - RFC-0379
  - RFC-0380
satisfies:
  - DNA-44
  - DNA-46
  - DNA-47
  - DNA-48
  - DNA-49
  - DNA-50
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/ontology"
successSignals:
  - "webgogol-com is registered as a Sternsystem in systems/registry.yaml with repo pointing to ../systems-git/webgogol-com"
  - "sternsystem.extract --app webgogol-com --repo ../systems-git/webgogol-com copies data-only paths (src/content, public, provenance) into systems/webgogol-com/ and writes system.pin.json"
  - "sternsystem.validate --id webgogol-com passes after extraction"
  - "A mission is opened, materialized, validated, built, reconciled, and closed for webgogol-com, producing a validated distribution"
  - "release.prepare --mission webgogol-com-m000001 produces release candidate webgogol-com-r000001 with behavior snapshots"
  - "release.publish --release webgogol-com-r000001 publishes with artifact store reference and release manifest"
  - "leitstand.propagate --release webgogol-com-r000001 --channel alt deploys to alt-webgogol-com worker"
  - "Health check verifies alt deployment against behavior snapshot fingerprint"
  - "leitstand.propagate --release webgogol-com-r000001 --channel main deploys to production webgogol-com worker"
  - "notausgang.export --system webgogol-com --release webgogol-com-r000001 produces a valid export package"
  - "apps/webgogol-com/ directory is removed from the monorepo after extraction validates"
  - "pnpm-workspace.yaml no longer includes apps/* glob after pilot is complete"
  - "fleet.sites.generate resolves webgogol-com from systems/registry.yaml, not apps/ discovery"
nonGoals:
  - "Does not migrate sites other than webgogol-com — other sites were already removed and will be re-onboarded individually as Sternsystems"
  - "Does not define the Sternsystem bundle contract — that is DNA-44 / RFC-0354"
  - "Does not define mission lifecycle or materialization — that is DNA-46/47 / RFC-0355/0356"
  - "Does not define release discipline — that is DNA-48 / RFC-0357"
  - "Does not define the Leitstand adapter — that is DNA-49 / RFC-0358 / RFC-0379"
  - "Does not define the site workspace resolver or --site flag rename — that is RFC-0378"
  - "Does not set up GitHub hosting for the Sternsystem git repo — pilot uses local bare repo at ../systems-git/webgogol-com"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0381: Execute the pilot migration wave and retire apps

## Context

RFC-0354 established the Sternsystem bundle contract and fleet registry. RFC-0355/0356 defined mission lifecycle and materialization. RFC-0357 defined release discipline. RFC-0358/0379 defined the Leitstand and its Cloudflare Workers adapter. RFC-0378 redefined the Werkstatt command surface to work beyond `apps/`. RFC-0359/0380 defined the Notausgang export and its integrity verification. No site has yet traveled the full path from `apps/<id>` through extraction, mission, release, propagation, and `apps/` retirement.

### Preconditions

This pilot depends on three draft RFCs that must be accepted and implemented before the pilot sequence can execute:

| RFC | Status | What the pilot needs from it |
| --- | --- | --- |
| RFC-0378 | draft | `--site` flag rename, `fleet.sites.generate` from registry, site workspace resolver beyond `apps/` |
| RFC-0379 | draft | `cloudflare-workers` adapter, `--channel` flag, `deploymentConfigSchema` with per-channel `secretsFile`, `cloudflare-pages` removal |
| RFC-0380 | draft | Deep `notausgang.validate` (content hashes, manifest schema, Bordbuch NDJSON) — the pilot's Notausgang validation step is meaningless without it |

If any of these RFCs are rejected or substantially revised, this pilot RFC must be re-audited before execution.

The `apps/` directory currently contains only `webgogol-com` (other sites were removed earlier). This is the pilot candidate. The operator has decided:

1. **Git hosting:** Local bare repo at `../systems-git/webgogol-com` (relative to workspace root). GitHub hosting is a later step.
2. **Propagation order:** Alt channel first (`alt-webgogol-com` → alt.webgogol.com), health-verify, then main channel (`webgogol-com` → production).

## Problem

The following invariants are unexercised:

1. **No end-to-end pilot (DNA-44..49):** The full Sternsystem lifecycle — extract, mission, materialize, build, release, propagate, health-check — has never been executed against a real site. Each command exists and has unit tests, but no integration proof exists.
2. **`apps/` still contains a live site (DNA-44):** The Sternsystem contract states that after extraction validates, the source `apps/<id>` workspace is removed. `apps/webgogol-com/` still exists, meaning the platform has not completed the migration it designed.
3. **No fleet projection from registry (RFC-0378):** `fleet.sites.yaml` is still hand-authored pointing at `apps/webgogol-com`. It should be generated from `systems/registry.yaml`.
4. **No deployment proof (DNA-49, RFC-0379):** The Cloudflare Workers adapter has never propagated a real release to `alt-webgogol-com` or `webgogol-com`.
5. **No Notausgang proof (DNA-50, RFC-0380):** No Notausgang export has been generated and validated for a real Sternsystem release.

## Decision

Execute the pilot migration wave for `webgogol-com`: extract it into a Sternsystem, run a full mission cycle, publish release `webgogol-com-r000001`, propagate to alt then main via the Cloudflare Workers Leitstand adapter, verify health, generate and validate a Notausgang export, and retire `apps/webgogol-com/` from the monorepo.

### Amendment to RFC-0354 §2.3: repo validation

RFC-0354 §2.3 requires `repo` to be a valid git URL (SSH or HTTPS). This RFC amends that contract to also accept **local file paths** (relative or absolute) as valid `repo` values. This supports development, pilot, and on-premise workflows where a remote git host is not yet configured. `sternsystem.validate` accepts `repo` values matching:

- SSH URL: `git@github.com:org/repo.git`
- HTTPS URL: `https://github.com/org/repo.git`
- Local path: `../systems-git/webgogol-com` or `/absolute/path/to/repo`

Local paths must point to a git repository (bare or working) that is accessible from the workspace root. `sternsystem.register` and `sternsystem.validate` enforce this.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** The pilot proves that `sternsystem.extract` produces a valid data-only bundle with pin, and that `apps/` removal is safe after extraction.
- **DNA-45 (Fleet registry):** The pilot registers `webgogol-com` in `systems/registry.yaml` with a real `repo` path and `deployment` config.
- **DNA-46 (Mission lifecycle):** The pilot opens, materializes, builds, and closes a real mission for `webgogol-com`.
- **DNA-47 (Materialization):** The pilot materializes the Werkstück from the pinned Sternsystem data, validates it, and produces a distribution.
- **DNA-48 (Release discipline):** The pilot prepares and publishes release `webgogol-com-r000001` with behavior snapshots, artifact store reference, and a valid release manifest.
- **DNA-49 (Fleet propagation):** The pilot propagates `webgogol-com-r000001` to `alt-webgogol-com` then `webgogol-com` via the Cloudflare Workers adapter, with health verification.
- **DNA-50 (Notausgang export):** The pilot generates and validates a Notausgang export from `webgogol-com-r000001`.
- **RFC-0378 (command surface):** The pilot uses `--site` instead of `--app` and verifies that `fleet.sites.generate` resolves the site from the registry.
- **RFC-0379 (Leitstand adapter):** The pilot exercises the `cloudflare-workers` adapter with real `wrangler deploy` calls.
- **Site OS operator model:** The pilot is a sequenced operator workflow — no new commands, no code changes beyond the RFC-0354 §2.3 repo validation amendment, only command execution and `apps/` removal.

## Design

### Pilot execution sequence

The pilot is a linear sequence of existing commands. No new commands are added. Each step must succeed before the next begins.

#### Step 1: Register the Sternsystem

```sh
pnpm exec site-kernel run sternsystem.register \
  --id webgogol-com \
  --cosmicStar Vega \
  --repo ../systems-git/webgogol-com
```

Creates `systems/registry.yaml` entry with `status: registered`. The `--repo` value is a local path, accepted per the RFC-0354 §2.3 amendment above.

#### Step 2: Initialize the bare git repo

```sh
git init --bare ../systems-git/webgogol-com
```

Creates the local bare repo that will receive the Sternsystem data push.

#### Step 3: Extract the site

```sh
pnpm exec site-kernel run sternsystem.extract \
  --app webgogol-com \
  --repo ../systems-git/webgogol-com
```

Copies `src/content/`, `public/`, `provenance/` from `apps/webgogol-com/` into `systems/webgogol-com/`. Writes `system.pin.json` with current platform version, commit, RFC head, and `platformSemanticHash`. Appends initial Bordbuch `pin-update` entry. Updates registry status to `active`.

#### Step 3a: Validate the Sternsystem

```sh
pnpm exec site-kernel run sternsystem.validate --id webgogol-com
```

Verifies the extracted Sternsystem: pin file parse, authored-data partition, no scripts, no package manifests, no runtime config, no generated files, no `dist/`. This is the gate for proceeding to mission open.

#### Step 4: Open a mission

```sh
pnpm exec site-kernel run mission.open \
  --system webgogol-com \
  --brief "Pilot migration: extract to Sternsystem and release webgogol-com-r000001"
```

Creates mission `webgogol-com-m000001` in `missions/`. Acquires system lock. Appends Bordbuch `mission-open` event.

#### Step 5: Materialize the Werkstück

```sh
pnpm exec site-kernel run mission.materialize \
  --mission webgogol-com-m000001
```

Materializes `missions/webgogol-com-m000001/workpiece/` from the pinned Sternsystem data bundle and generated runtime scaffolding.

#### Step 6: Validate the Werkstück

```sh
pnpm exec site-kernel run mission.validate \
  --mission webgogol-com-m000001
```

Runs `app.contract.full` against the materialized Werkstück. This is the gate for `mission.reconcile` and `mission.close`.

#### Step 7: Build the distribution

```sh
pnpm exec site-kernel run mission.build \
  --mission webgogol-com-m000001
```

Produces `missions/webgogol-com-m000001/distribution/dist/`.

#### Step 8: Prepare the release

```sh
pnpm exec site-kernel run release.prepare \
  --mission webgogol-com-m000001
```

Produces release candidate `webgogol-com-r000001` in `releases/webgogol-com-r000001/`. Runs a production build, captures behavior snapshots (readable + production), runs `behavior.snapshot.diff`, and writes `release.yaml` with state `prepared`.

#### Step 8a: Publish the release

```sh
pnpm exec site-kernel run release.publish \
  --release webgogol-com-r000001
```

Finalizes the release: runs discipline gates (`migrator.validate`, version-compare, `bordbuch.validate`), stores the production `dist/` through `artifact.store.put` (RFC-0363), updates `release.yaml` state to `published`, appends a `release-published` Bordbuch entry, and updates `systems/registry.yaml` `lastRelease`.

#### Step 8b: Validate the release

```sh
pnpm exec site-kernel run release.validate \
  --release webgogol-com-r000001
```

Verifies the published release artifact: manifest integrity, artifact reference present and retrievable, behavior snapshot present, hash matches.

#### Step 9: Propagate to alt channel

```sh
pnpm exec site-kernel run leitstand.propagate \
  --release webgogol-com-r000001 \
  --channel alt
```

Deploys to `alt-webgogol-com` worker via `wrangler deploy`. Health-checks alt.webgogol.com against the behavior snapshot fingerprint.

#### Step 10: Propagate to main channel

```sh
pnpm exec site-kernel run leitstand.propagate \
  --release webgogol-com-r000001 \
  --channel main
```

Deploys to `webgogol-com` worker via `wrangler deploy`. Health-checks webgogol.com against the behavior snapshot fingerprint. Refuses unless `deployment.lastPropagated.alt` records the same release with `healthy: true` (RFC-0379 channel gating).

#### Step 10a: Verify propagation status

```sh
pnpm exec site-kernel run leitstand.status --system webgogol-com
```

Prints the current deployed release, health, and propagation state for both channels.

#### Step 11: Generate Notausgang export

```sh
pnpm exec site-kernel run notausgang.export \
  --system webgogol-com \
  --release webgogol-com-r000001 \
  --output ./notausgang-webgogol-com-r000001
```

#### Step 12: Validate Notausgang export

```sh
pnpm exec site-kernel run notausgang.validate \
  --path ./notausgang-webgogol-com-r000001
```

#### Step 12a: Reconcile the mission

```sh
pnpm exec site-kernel run mission.reconcile \
  --mission webgogol-com-m000001
```

Reconciles the validated Werkstück data changes to the Sternsystem's git repo. Fetches remote, verifies no drift, commits, and pushes. This is the precondition for `mission.close` (RFC-0355 §4.3).

#### Step 13: Close the mission

```sh
pnpm exec site-kernel run mission.close \
  --mission webgogol-com-m000001
```

#### Step 14: Retire apps/webgogol-com

```sh
git rm -r apps/webgogol-com
```

Remove the `apps/*` glob from `pnpm-workspace.yaml`. Run `pnpm install` to update lockfile.

#### Step 15: Generate fleet projection

```sh
pnpm exec site-kernel run fleet.sites.generate
```

`fleet/fleet.sites.yaml` now resolves `webgogol-com` from `systems/registry.yaml`, not `apps/` discovery.

#### Step 16: Verify ecosystem manifest

```sh
pnpm exec site-kernel run ecosystem.manifest.generate
pnpm exec site-kernel run workspace.surface.validate
```

Confirm the ecosystem projection no longer references `apps/webgogol-com` and resolves the site from the registry.

### Registry entry after pilot

```yaml
# systems/registry.yaml
schemaVersion: "1.0.0"
systems:
  - id: webgogol-com
    cosmicStar: Vega
    repo: ../systems-git/webgogol-com
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: webgogol-com-r000001
    status: active
    registeredAt: "2026-07-12T00:00:00Z"
    deployment:
      adapter: cloudflare-workers
      channels:
        alt:
          workerName: alt-webgogol-com
          url: https://alt.webgogol.com
          secretsFile: env:WERKSTATT_SECRETS_ALT
        main:
          workerName: webgogol-com
          url: https://webgogol.com
          secretsFile: env:WERKSTATT_SECRETS_MAIN
      lastPropagated:
        alt:
          releaseId: webgogol-com-r000001
          at: "2026-07-12T15:00:00Z"
          healthy: true
        main:
          releaseId: webgogol-com-r000001
          at: "2026-07-12T16:00:00Z"
          healthy: true
    notes: ""
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/webgogol-com/` | Source for extraction, then removed |
| `systems/webgogol-com/` | Sternsystem data bundle (content, public, provenance, `system.pin.json`, bordbuch) |
| `systems/registry.yaml` | Fleet registry with webgogol-com entry |
| `missions/webgogol-com-m000001/` | Ephemeral mission workspace |
| `releases/webgogol-com-r000001/` | Published release with artifact reference |
| `fleet/fleet.sites.yaml` | Generated projection, no longer hand-authored |
| `pnpm-workspace.yaml` | `apps/*` glob removed after pilot |
| `../systems-git/webgogol-com` | Local bare git repo for Sternsystem data |

### Failure modes

- **Extraction fails:** Abort pilot. `apps/webgogol-com/` remains intact. Registry entry stays `registered`. Re-run `sternsystem.extract` after fixing the data classifier or platform templates. The extraction is idempotent under RFC-0362 operation records.
- **Materialization fails:** Abort pilot. Mission is aborted via `mission.abort --mission webgogol-com-m000001`. `apps/` remains intact. Re-open a new mission after fixing the materialization issue; mission IDs are sequential so the next attempt is `m000002`.
- **Build fails:** Abort pilot. Mission is aborted. Investigate Werkstück validation gaps. The `evidence/build-report.json` in the mission directory contains the build failure detail.
- **Release prepare fails (snapshot diff):** The snapshot diff gate caught a structural difference between readable and production builds. Fix the cause, re-run `mission.build`, then re-run `release.prepare`. The staging directory is cleaned automatically.
- **Release publish fails (discipline gate):** `migrator.validate`, version-compare, or `bordbuch.validate` failed. Fix the underlying issue (migrator gap, platform version, Bordbuch inconsistency) and re-run `release.publish`. The release stays in `prepared` state.
- **Alt propagation fails:** Abort pilot. Main channel is NOT deployed. Alt worker may have a partial deploy — rollback via `leitstand.rollback --system webgogol-com --channel alt`. The RFC-0362 operation record and Bordbuch entry capture the failure.
- **Alt health check fails:** Do NOT propagate to main. Investigate health discrepancy. Rollback alt if needed via `leitstand.rollback --system webgogol-com --channel alt`. The `lastPropagated.alt.healthy: false` state blocks main promotion automatically.
- **Main propagation fails:** Production is NOT affected. Rollback main via `leitstand.rollback --system webgogol-com --channel main`.
- **Main health check fails:** Rollback main immediately via `leitstand.rollback --system webgogol-com --channel main`. Alt remains deployed (can serve as fallback if DNS is pointed).
- **Notausgang validation fails:** Do NOT retire `apps/`. Investigate the integrity failure (missing dist artifact, hash mismatch, Bordbuch corruption). Fix the release or re-export. `apps/` retirement is gated on both `sternsystem.validate` AND `notausgang.validate` passing.
- **apps/ removal after extraction:** Only proceed if `sternsystem.validate --id webgogol-com` passes AND `notausgang.validate` passes. If either fails, keep `apps/` and investigate.

### Pilot recovery and re-run

The pilot is designed to be re-runnable after partial failure. Each command is idempotent under RFC-0362 operation records:

1. **Before mission close:** Any step before `mission.close` can be re-run. The mission stays `open` and the system lock prevents concurrent operations. Stale locks are cleared via `werkstatt.lock.recover`.
2. **After mission close, before release publish:** Re-open a new mission (`m000002`) against the same Sternsystem. The pin is already written; materialization is from the same pinned state.
3. **After release publish, before propagation:** Re-run `leitstand.propagate` with the same release id. The artifact store reference is immutable; re-deployment is safe.
4. **After propagation, before `apps/` removal:** Rollback via `leitstand.rollback`, fix the release, prepare a new release (`r000002`), and re-propagate. The old release remains in the artifact store for audit.
5. **After `apps/` removal:** This is the point of no return. The Notausgang export and the Sternsystem git repo are the safety net. If the Sternsystem needs to be re-extracted, the Notausgang export contains the authored data and dist artifacts.

## Rollout

- **Pilot only:** This RFC covers only `webgogol-com`. Other sites will be re-onboarded individually as Sternsystems in follow-up RFCs.
- **Forward-only:** Once `apps/webgogol-com/` is removed, there is no rollback path to the `apps/` layout. The Notausgang export and the Sternsystem git repo are the safety net.
- **Alt before main:** The alt channel deployment is the gate. Main channel deploys only after alt health check passes.
- **No `apps/*` glob after pilot:** `pnpm-workspace.yaml` drops `apps/*` and `apps/*/workers/*`. Future sites enter via `sternsystem.register` + `mission.materialize`, never via `apps/`.
- **Fleet projection:** `fleet.sites.yaml` becomes a generated file. Hand-editing is forbidden.
- **CI pipeline update:** CI workflows that reference `apps/webgogol-com` paths are updated to resolve via `fleet.sites.yaml` or `systems/registry.yaml`.

### Compass sync

This RFC does not introduce new source files that require `MODULE_CONTRACT` or `MODULE_MAP` scaffolding. The pilot is an execution wave, not a code-generation wave. However, the following Compass-adjacent artifacts must be updated:

- `docs/ecosystem.generated.json` — regenerated via `ecosystem.manifest.generate` after `apps/` removal to reflect the new topology.
- `docs/technology.xml` — update the workspace topology section to reflect that `apps/` is removed and sites are Sternsystems.
- `docs/development-plan.xml` — update if the development plan references `apps/*` as a workspace surface.

### AGENTS.md updates

After the pilot completes, the following AGENTS.md files must be updated:

- **Root `AGENTS.md`** — remove `apps/*` from the monorepo layout description; add `systems/registry.yaml` and `missions/` to the layout description.
- **`apps/AGENTS.md`** — remove or archive this file after `apps/` is empty. If other apps are re-onboarded as Sternsystems, this file is superseded by a `systems/AGENTS.md`.
- **`packages/AGENTS.md`** — no changes needed; packages are unaffected by the pilot.
- **`services/AGENTS.md`** — no changes needed; services are unaffected by the pilot.

## Alternatives considered

- **Keep apps/ as a parallel structure:** Rejected — DNA-44 explicitly states that after extraction validates, the source `apps/<id>` workspace is removed. Keeping it would violate the invariant and create dual representation.
- **Propagate to main first:** Rejected — the operator decided alt-first to catch issues on a non-production URL before affecting production traffic.
- **Use GitHub for Sternsystem git hosting:** Rejected for pilot — local bare repo is simpler and sufficient. GitHub hosting will be a separate step for collaboration and CI.
- **Retire apps/ in a separate RFC:** Rejected — the extraction and retirement are one atomic migration. Splitting them leaves the platform in a half-migrated state with no clear owner for the cleanup step.
- **Run multiple sites in the pilot:** Rejected — `webgogol-com` is the only remaining site in `apps/`. A single-site pilot is the minimal viable proof.

## Risks

- **Production outage:** If main propagation deploys a broken build, production goes down. Mitigation: alt-first gating, health verification with retries, and `leitstand.rollback` for immediate rollback.
- **Data loss during extraction:** If `sternsystem.extract` misses a data path, the Sternsystem bundle is incomplete. Mitigation: `sternsystem.validate` checks for required paths; `notausgang.validate` verifies content hashes.
- **Lock contention:** The pilot acquires registry and system locks. If a prior lock is stuck, `werkstatt.lock.recover` clears it. Only one operator should run the pilot.
- **Wrangler auth:** `wrangler deploy` requires `CLOUDFLARE_API_TOKEN` in the environment. If missing, propagation fails at the preflight check, not mid-deploy.
- **Behavior snapshot mismatch:** If the production build differs from the readable snapshot, `release.publish` refuses to publish. The pilot must resolve any snapshot diff before release.
- **Agent misinterpretation:** Agents may attempt to re-create `apps/webgogol-com/` after removal. Mitigation: `fleet.sites.generate` and `workspace.surface.validate` will fail if `apps/` is referenced but does not exist.

## Acceptance criteria

- [x] `systems/registry.yaml` contains `webgogol-com` with `status: active`, `repo: ../systems-git/webgogol-com`, and `deployment.adapter: cloudflare-workers` (evidence: implemented historically)
- [x] `systems/webgogol-com/` contains `src/content/`, `public/`, `provenance/`, `system.pin.json`, and `bordbuch/events.ndjson` (evidence: implemented historically)
- [x] `sternsystem.validate --id webgogol-com` passes (evidence: implemented historically)
- [x] Mission `webgogol-com-m000001` is opened, materialized, validated, built, reconciled, and closed (evidence: implemented historically)
- [x] `release.prepare --mission webgogol-com-m000001` produces release candidate `webgogol-com-r000001` with behavior snapshots (evidence: implemented historically)
- [x] `release.publish --release webgogol-com-r000001` publishes with artifact store reference (evidence: implemented historically)
- [x] `release.validate --release webgogol-com-r000001` passes (evidence: implemented historically)
- [x] `leitstand.propagate --release webgogol-com-r000001 --channel alt` succeeds and health check passes (evidence: implemented historically)
- [x] `leitstand.propagate --release webgogol-com-r000001 --channel main` succeeds and health check passes (evidence: implemented historically)
- [x] `leitstand.status --system webgogol-com` shows both channels deployed at `webgogol-com-r000001` (evidence: implemented historically)
- [x] `notausgang.export` and `notausgang.validate` pass for `webgogol-com-r000001` (evidence: implemented historically)
- [x] `apps/webgogol-com/` directory is removed from the monorepo (evidence: implemented historically)
- [x] `pnpm-workspace.yaml` no longer includes `apps/*` or `apps/*/workers/*` globs (evidence: implemented historically)
- [x] `fleet.sites.generate` resolves `webgogol-com` from `systems/registry.yaml` (evidence: implemented historically)
- [x] `ecosystem.manifest.generate` and `workspace.surface.validate` pass without referencing `apps/` (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY execute the pilot sequence ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT remove `apps/webgogol-com/` until `sternsystem.validate` AND `notausgang.validate` both pass.
- Agents MUST NOT propagate to the main channel until the alt channel health check passes.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST update `pnpm-workspace.yaml` and run `pnpm install` in the same commit that removes `apps/webgogol-com/`.
- Agents MUST push the Sternsystem data to `../systems-git/webgogol-com` after extraction so the bare repo has content.
- Agents MUST update CI workflow files that reference `apps/webgogol-com` paths to resolve via `fleet.sites.yaml` or `systems/registry.yaml`.
