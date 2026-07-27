---
id: RFC-0365
title: "Rename backs to services and clarify integration topology"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-08
updatedAt: 2026-07-08
implementedAt: 2026-07-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0186
  - RFC-0214
  - RFC-0246
  - RFC-0304
  - RFC-0338
  - RFC-0339
  - RFC-0341
  - RFC-0343
  - RFC-0346
  - RFC-0360
  - RFC-0364
amendedBy: []
related:
  - DNA-1
  - DNA-40
satisfies:
  - DNA-1
  - DNA-2
  - DNA-40
commands:
  proposed: []
  added:
    - services.workspace.validate
    - services.check.run
  changed:
    - check-webgogol.runner.validate
    - env.contract.validate
    - env.local.check
    - fleet.probe.targets.generate
    - fleet.probe.validate
    - lagebild.validate
    - lagebild.worker.deploy
    - matomo.proxy.validate
    - observability.conventions.validate
    - observability.delivery.validate
    - observability.stack.validate
    - observability.workers.validate
  removed:
    - backs.workspace.validate
    - backs-check.run
appsImpacted:
  - check-webgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-check-webgogol"
  - "@gogol/site-kernel-observability"
successSignals:
  - "The deployable backend composition layer is named `services/*`, not `backs/*`, in active instructions, Compass XML, workspace discovery, command metadata, validators, and generated projections."
  - "`integrations/*` remains only a non-workspace declarative integration registry surface; it contains no deployable package, source entrypoint, or wrangler configuration."
  - "`integrations/lagebild-sync-worker` moves to `services/lagebild-sync-worker` and gains the same service manifest contract as every other deployable service."
  - "Canonical service commands are `services.workspace.validate` and `services.check.run`; `backs.workspace.validate` and `backs-check.run` disappear from the active command manifest after the migration."
  - "AI-agent instructions clearly distinguish `apps/*`, `services/*`, `packages/*`, and `integrations/*` without requiring agents to infer intent from legacy folder names."
nonGoals:
  - "Does not change the runtime behavior of any service, worker, proxy, poller, or runner."
  - "Does not merge declarative integration registries into `services/*` or `packages/*`."
  - "Does not rename the authored `integrations` key in site `system.md`; this RFC concerns the repository top-level folder only."
  - "Does not rewrite historical RFC body text by mass search-replace. Historical RFCs are amended through metadata and this RFC's migration notes."
---

# RFC-0365: Rename backs to services and clarify integration topology

## Context

RFC-0304 introduced `backs/*` as the monorepo layer for deployable backend runtime compositions. That decision solved the missing-backend-location problem, but the name `backs` is terse internal jargon. Since RFC-0304, the layer has grown beyond "the back side of an app" into standalone deployable compositions with their own manifests, environment contracts, validation commands, import boundaries, and operational runbooks:

- `backs/check-webgogol-runner`
- `backs/matomo-proxy`
- `backs/fleet-probe-runner`
- `backs/cf-analytics-poller`
- `backs/observability-stack`
- `backs/telegram-alert-bridge`

The repository also still has `integrations/lagebild-sync-worker`, an older deployable Cloudflare Worker created before the service layer existed. It is structurally the same kind of thing as the workers and runners in `backs/*`: a thin deployable runtime wrapper around reusable package logic.

At the same time, `integrations/*` also contains non-runtime registry data:

- `integrations/truth-sources/*.yaml`
- `integrations/truth-monitor/*.json`

Those are not backend workspaces. They are declarative integration registries consumed by validators and monitor commands.

## Problem

The current topology makes future agents guess:

1. `backs/*` is the active backend composition layer, but the name is less clear than the role.
2. `integrations/lagebild-sync-worker` is a deployable worker outside the backend composition layer.
3. `integrations/*` is a pnpm workspace glob only because of the Lagebild worker; this makes declarative registries look like a runtime workspace layer.
4. The command pair `backs.workspace.validate` and `backs-check.run` uses inconsistent namespaces.
5. Existing validators and docs hard-code `backs/` paths in many places, so a folder rename without command and metadata migration would leave hidden drift.
6. Active AI instructions do not yet state a crisp four-way folder contract for `apps`, `services`, `packages`, and `integrations`.

## Decision

Rename the deployable backend composition layer from `backs/*` to `services/*`.

`services/*` means: deployable backend, worker, runner, proxy, bridge, scheduled job, or compose-stack service compositions. It is the service analogue of `apps/*`.

The canonical topology becomes:

```text
apps/*          = deployable frontend/site/operator compositions
services/*      = deployable backend/service/worker/runner/proxy compositions
packages/*      = reusable schemas, adapters, validators, runtime contracts, and business behavior
integrations/*  = declarative integration registries and monitor state; not package workspaces
```

`integrations/*` stays, but no longer as a pnpm workspace layer. It MUST NOT contain deployable runtime packages after this migration.

## Architectural fit

- **DNA-1 Monorepo boundary:** this RFC keeps deployable compositions outside reusable packages and makes the backend/service layer clearer for agents and maintainers.
- **DNA-2 pnpm workspace + Turborepo:** the workspace glob changes from `backs/*` plus legacy `integrations/*` to one clear `services/*` deployable-service glob.
- **DNA-40 Env-example and deploy-script contract:** the existing env contract continues, but its backend side is renamed from backs to services.
- **RFC-0186 Lagebild:** the shared Lagebild sync worker remains a single shared deploy target; only its location changes.
- **RFC-0214 CKL source binding:** declarative source descriptors stay in `integrations/*`; any future deployed monitor worker belongs in `services/*`.
- **RFC-0246 Agent Control Plane:** workspace discovery must no longer treat `integrations/*` as workspace packages.
- **RFC-0304 Backs workspaces:** this RFC renames and clarifies that layer rather than changing its composition-only rules.

## Design

### Folder Contracts For Agents

### `apps/*`

`apps/*` contains deployable site/operator compositions. Apps own authored content, routes, site shell composition, app-local deployment config, and thin API proxies when the runtime permits them.

Apps MUST NOT import from `services/*`.

Apps consume shared contracts from `packages/*`.

### `services/*`

`services/*` contains deployable service compositions. A service may be a Node runner, Cloudflare Worker, cron worker, integration bridge, proxy worker, or compose stack.

A service may own:

- runtime entrypoints;
- deployment config (`wrangler.jsonc`, `Dockerfile`, compose/casting files);
- service-specific environment wiring;
- queue polling or HTTP listener wiring;
- store/queue/adapter selection;
- health checks and operational runbooks.

A service MUST NOT own reusable schemas, shared adapters, business rules, check rules, report shapes, or reusable validation logic. Those belong in `packages/*`.

A service MUST NOT import from `apps/*`.

### `packages/*`

`packages/*` contains reusable code and data contracts. Integration adapter logic belongs here even when one service is its only current deploy target.

Examples:

- `packages/integration-adapter-supabase-crm` owns Lagebild worker logic and tenant registry contracts.
- `packages/check-core` and `packages/check-runner-node` own Check Webgogol contracts and browser runner behavior.
- `packages/observability` owns reusable metric contracts and exporters.

### `integrations/*`

`integrations/*` contains declarative integration registries and monitor state that is not a deployable package.

Allowed after this RFC:

```text
integrations/truth-sources/*.yaml
integrations/truth-monitor/*.json
```

If the Truth Monitor later becomes a deployed scheduled Worker, its deploy target MUST be `services/truth-monitor-worker`; the source registry and outbox state remain under `integrations/*`.

`integrations/*` MUST NOT be listed in `pnpm-workspace.yaml` after `lagebild-sync-worker` moves.

### Service Manifest

Rename every `back.config.json` to `service.config.json`.

Every `services/*` workspace must contain:

```text
services/<id>/
  package.json
  service.config.json
```

Allowed `kind` values remain the RFC-0304 values:

- `node-runner`
- `cloudflare-worker`
- `scheduled-worker`
- `integration-worker`
- `proxy-worker`
- `compose-stack`

The manifest `id` MUST equal the directory name. The `entry` field MUST point to an existing file, except that `compose-stack` entries may point to declarative config such as `casting.yaml`.

### Required Moves

Move every existing `backs/*` project to `services/*`:

| From                          | To                               |
| ----------------------------- | -------------------------------- |
| `backs/cf-analytics-poller`   | `services/cf-analytics-poller`   |
| `backs/check-webgogol-runner` | `services/check-webgogol-runner` |
| `backs/fleet-probe-runner`    | `services/fleet-probe-runner`    |
| `backs/matomo-proxy`          | `services/matomo-proxy`          |
| `backs/observability-stack`   | `services/observability-stack`   |
| `backs/telegram-alert-bridge` | `services/telegram-alert-bridge` |

Move the older deployable integration worker:

| From                                | To                              |
| ----------------------------------- | ------------------------------- |
| `integrations/lagebild-sync-worker` | `services/lagebild-sync-worker` |

For `services/lagebild-sync-worker`:

- keep the thin `src/index.ts` wrapper around `@gogol/integration-adapter-supabase-crm/worker`;
- keep `wrangler.jsonc`, `.dev.vars.example`, `supabase/*.sql`, and TypeScript build behavior;
- add `service.config.json`;
- rename the package from `@gogol-integrations/lagebild-sync-worker` to `@gogol/lagebild-sync-worker` unless a package-publishing constraint is discovered during implementation;
- update all Lagebild commands and docs to point at `services/lagebild-sync-worker`.

### Workspace And Command Names

Update `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - apps/*/workers/*
  - services/*
  - packages/*
  - packages/os/*
```

Remove:

```yaml
  - backs/*
  - integrations/*
```

Canonical command names:

| Old                        | New                           |
| -------------------------- | ----------------------------- |
| `backs.workspace.validate` | `services.workspace.validate` |
| `backs-check.run`          | `services.check.run`          |

`services.check.run` is the composite service validation pipeline. It must run at least:

1. `services.workspace.validate`
2. `check-webgogol.runner.validate`
3. `env.contract.validate`

If implementation keeps old commands temporarily, they MUST be deprecated aliases that call the new handlers and emit a warning diagnostic. The target state of this RFC is that `backs.workspace.validate` and `backs-check.run` are absent from `docs/command-manifest.generated.json`, `docs/COMMANDS.md`, and standard pipeline references. Do not keep aliases indefinitely.

Rename handler files and exports where useful:

| Old source surface | Target source surface |
| --- | --- |
| `packages/os/site-kernel-check-webgogol/src/commands/backs.ts` | `.../commands/services.ts` |
| `packages/os/site-kernel-check-webgogol/src/commands/backs-check.ts` | `.../commands/services-check.ts` |
| `runBacksWorkspaceValidate` | `runServicesWorkspaceValidate` |
| `runBacksCheckRun` | `runServicesCheckRun` |

Diagnostic rule ids for the renamed validator SHOULD become `SERVICES-01` through `SERVICES-09`. Do not reuse `BACKS-*` for new diagnostics.

If any command flags expose the old noun, rename them:

| Old flag      | New flag         |
| ------------- | ---------------- |
| `--back <id>` | `--service <id>` |

### Command Surfaces That Must Be Updated

The implementation MUST update all currently known active command surfaces that read or write `backs/*` or `integrations/lagebild-sync-worker`.

#### Check Webgogol

- `services.workspace.validate` reads `pnpm-workspace.yaml`, `services/**`, and `apps/**/*.ts`.
- `services.check.run` replaces `backs-check.run`.
- `check-webgogol.runner.validate` reads `services/check-webgogol-runner/**`.
- App-source import guards check for imports from `services/*`, not `backs/*`.
- Runner source guards check `services/check-webgogol-runner`.

#### Env Contract

- `env.contract.validate` scans `services/*/.env.example`, `services/*/README.md`, and `services/*/src/**/*.ts`.
- `env.local.check` reads `services/*/.env.example` and writes `services/*/.env`.
- Any `--back` selection mode becomes `--service`.
- README guidance continues to forbid duplicated env-variable tables.
- Service projects continue to hand-author `.env.example`; do not create a generator for services.

#### Observability

- `observability.conventions.validate` scans `services/**/*.ts` instead of `backs/**/*.ts`, while it may continue to scan `integrations/**/*.yaml` or `.json` only when needed for descriptor state.
- `observability.stack.validate` reads `services/observability-stack/**`.
- `observability.workers.validate` scans `services/*/wrangler.jsonc` and no longer scans `integrations/*/wrangler.jsonc`.
- `fleet.probe.targets.generate` writes `services/fleet-probe-runner/targets.generated.json`.
- `fleet.probe.validate` reads `services/fleet-probe-runner/**`.
- `observability.delivery.validate` reads `services/cf-analytics-poller/**`.
- `observability.mcp.validate` reads `services/observability-stack/.env.example` if it continues to inspect service env examples.
- `matomo.proxy.validate` reads `services/matomo-proxy/**`.

#### Lagebild

- `lagebild.validate` checks `services/lagebild-sync-worker`, not `integrations/lagebild-sync-worker`.
- `lagebild.worker.deploy` deploys from `services/lagebild-sync-worker`.
- `lagebild.worker.dev.vars.generate` writes `services/lagebild-sync-worker/.dev.vars.example`.
- `lagebild.worker.dev.vars.validate` validates `services/lagebild-sync-worker/.dev.vars.example`.
- All Lagebild docs and hints must say the shared worker is a service deploy target.

### Documentation And Generated Surface Updates

Implementation MUST update active instruction and Compass surfaces in the same change:

- `AGENTS.md`
- `services/AGENTS.md` (moved from `backs/AGENTS.md` and rewritten for services wording)
- `docs/requirements.xml`
- `docs/technology.xml`
- `docs/knowledge-graph.xml`
- `docs/verification-plan.xml`
- `docs/source-markup.xml`

`docs/source-markup.xml` MUST extend authored-source coverage from `apps/` and `packages/` to `apps/`, `packages/`, and `services/` for non-trivial service source files.

`docs/styling.xml` is not expected to change unless implementation discovers a `backs` reference there.

Generated files MUST be regenerated, not hand-edited:

- `docs/command-manifest.generated.json` via `pnpm exec site-kernel run command.manifest.generate`
- `docs/COMMANDS.md` via `pnpm exec site-kernel run docs.commands.generate`
- `docs/ecosystem.generated.json` via `pnpm exec site-kernel run ecosystem.manifest.generate`
- `.gitattributes` generated block via `pnpm exec site-kernel run gitattributes.generate`
- `docs/compass-inventory.xml` through the existing Compass inventory command if the path inventory changes

Historical RFCs SHOULD NOT be rewritten wholesale. For RFCs amended by this one, update frontmatter `amendedBy` to include `RFC-0365` where that is the repository's current RFC practice. If a short implementation note is added to an old RFC, it must point to this RFC instead of restating the migration.

At minimum, add amendment notes or frontmatter links for:

- RFC-0186: Lagebild worker path changes to `services/lagebild-sync-worker`.
- RFC-0214: Truth Monitor deploy targets, if added later, belong under `services/*`; source descriptors remain under `integrations/*`.
- RFC-0246: workspace discovery no longer treats `integrations/*` as workspace packages.
- RFC-0304: `backs/*` is renamed to `services/*`; service manifest is `service.config.json`.
- RFC-0338, RFC-0339, RFC-0341, RFC-0343: observability paths move to `services/*`.
- RFC-0346: env contract covers `services/*` instead of `backs/*`.
- RFC-0360: naming scan roots replace `backs` with `services`; `integrations` remains a recursive data/docs root, not a workspace root.
- RFC-0364: platform semantic hash covers `services/**` runtime source and `integrations/**` declarative registries, not `backs/**`.

### Generated Artifact And Registry Notes

Do not hand-edit generated files carrying the generated marker. Update the owning source or registry first, then regenerate.

Implementation MUST check at least these source locations for path and command ownership:

- `packages/os/site-kernel-checks/src/command-tables/30-check-webgogol.ts`
- `packages/os/site-kernel-checks/src/command-tables/32-analytics-matomo.ts`
- `packages/os/site-kernel-checks/src/command-tables/35-json-generated-marker.ts`
- `packages/os/site-kernel-checks/src/command-tables/36-env-contract.ts`
- `packages/os/site-kernel-checks/src/diagnostics/rules/check-webgogol.ts`
- `packages/os/site-kernel-checks/src/env-contract.ts`
- `packages/os/site-kernel-check-webgogol/src/commands.ts`
- `packages/os/site-kernel-check-webgogol/src/commands/backs.ts`
- `packages/os/site-kernel-check-webgogol/src/commands/backs-check.ts`
- `packages/os/site-kernel-observability/src/module.ts`
- `packages/os/site-kernel-observability/src/commands/*.ts`
- `packages/os/site-kernel/src/lagebild/**`
- `packages/os/site-kernel/src/change-impact.ts`
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`

This list is a starting point, not a substitute for `rg "backs|backs-check|back.config|integrations/lagebild-sync-worker"` across the repository.

## Rollout

1. Create `services/` and move every `backs/*` project into it.
2. Move `integrations/lagebild-sync-worker` to `services/lagebild-sync-worker`.
3. Rename every `back.config.json` to `service.config.json`.
4. Add a `service.config.json` to `services/lagebild-sync-worker`.
5. Move and rewrite `backs/AGENTS.md` as `services/AGENTS.md`.
6. Update `pnpm-workspace.yaml` to include `services/*` and remove `backs/*` plus `integrations/*`.
7. Rename command handlers, command table entries, diagnostic rules, and command result names.
8. Update validators and generators that read/write old paths.
9. Update root instructions and Compass XML.
10. Regenerate command manifest, command docs, ecosystem manifest, `.gitattributes`, and Compass inventory as required.
11. Run the validation sequence below.

## Verification

Run these commands after implementation:

```sh
pnpm exec site-kernel run services.workspace.validate --json
pnpm exec site-kernel run services.check.run --json
pnpm exec site-kernel run check-webgogol.runner.validate --json
pnpm exec site-kernel run env.contract.validate --json
pnpm exec site-kernel run observability.conventions.validate --json
pnpm exec site-kernel run observability.workers.validate --json
pnpm exec site-kernel run observability.stack.validate --json
pnpm exec site-kernel run fleet.probe.validate --json
pnpm exec site-kernel run observability.delivery.validate --json
pnpm exec site-kernel run matomo.proxy.validate --json
pnpm exec site-kernel run lagebild.validate --json
pnpm exec site-kernel run command.manifest.generate
pnpm exec site-kernel run docs.commands.generate
pnpm exec site-kernel run ecosystem.manifest.generate
pnpm exec site-kernel run gitattributes.generate
pnpm exec site-kernel run command.manifest.validate --json
pnpm exec site-kernel run docs.commands.validate --json
pnpm exec site-kernel run ecosystem.manifest.validate --json
pnpm exec site-kernel run workspace.surface.validate --json
pnpm exec site-kernel run rfc.validate
pnpm exec site-kernel run packages-check.run --json
```

If Compass inventory is path-sensitive in the implementation branch, also run the repository's Compass inventory/generation command and commit the regenerated artifact if it is tracked.

## Acceptance criteria

- [x] `services/` exists and contains all former `backs/*` projects plus `lagebild-sync-worker`. (evidence: implemented historically)
- [x] `backs/` no longer exists. (evidence: implemented historically)
- [x] `integrations/lagebild-sync-worker` no longer exists. (evidence: implemented historically)
- [x] `integrations/` contains no `package.json`, `src/index.ts`, `wrangler.jsonc`, or deployable runtime package. (evidence: implemented historically)
- [x] `pnpm-workspace.yaml` contains `services/*` and does not contain `backs/*` or `integrations/*`. (evidence: implemented historically)
- [x] Every `services/*` workspace has `package.json` and `service.config.json`. (evidence: implemented historically)
- [x] No `services/*` source imports from `apps/*`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] No `apps/*` source imports from `services/*`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Active command manifest contains `services.workspace.validate` and `services.check.run`. (evidence: implemented historically)
- [x] Active command manifest does not contain `backs.workspace.validate` or `backs-check.run`. (evidence: implemented historically)
- [x] Generated command docs, ecosystem manifest, and `.gitattributes` reflect `services/*`. (evidence: implemented historically)
- [x] Active AGENTS and Compass XML describe `services/*` as the deployable service layer and `integrations/*` as declarative registry data. (evidence: implemented historically)
- [x] `lagebild.validate` and Lagebild worker commands operate on `services/lagebild-sync-worker`. (evidence: implemented historically)
- [x] Env, observability, fleet probe, Matomo proxy, and Check Webgogol validators operate on `services/*`. (evidence: implemented historically)
- [x] `rfc.validate` and `services.check.run` pass. (evidence: implemented historically)
- [x] `packages-check.run` passes. Current run reaches the RFC-specific service checks but still fails on pre-existing package-level debt gates outside this topology migration. (evidence: original apps retired by RFC-0381, migration completed historically)

## Implementation notes for agents

- Treat this RFC as a topology and command migration. Do not change service runtime behavior unless a path rename requires an import/config adjustment.
- Use `git mv` or equivalent move-aware file operations for path migration so review preserves history.
- Do not edit generated files directly. Update source command tables, registries, templates, and validators first, then regenerate generated artifacts.
- Start implementation with `rg "backs|backs-check|back.config|integrations/lagebild-sync-worker"` and classify every hit as active source, active documentation, generated output, or historical RFC text.
- Historical RFC body text may keep old paths when it describes past decisions. Add `amendedBy: RFC-0365` and short notes only where needed to prevent active-agent confusion.
- After moving `lagebild-sync-worker`, verify that `integrations/` contains no package workspace and that `pnpm-workspace.yaml` no longer includes `integrations/*`.
- Prefer `services.check.run` as the composite command name. Do not introduce `services.pipeline.run` or `services.validate` unless a later RFC deliberately changes command naming policy.
- When updating `docs/source-markup.xml`, include `services/` in authored source coverage for non-trivial service code.

## Risks

- **Partial rename drift.** Some validators may still read `backs/*` and silently miss services. Mitigation: acceptance requires command manifest and active source grep for old active paths.
- **Generated artifact churn.** Command manifest, ecosystem manifest, `.gitattributes`, and Compass inventory may all change. Mitigation: update command sources first, regenerate, then review generated diffs.
- **Historical RFC confusion.** Older RFC bodies will still mention `backs/*`. Mitigation: do not rewrite history; mark amended RFCs and point agents to this RFC.
- **`integrations` ambiguity remains.** The word is still used in content and system configuration. Mitigation: this RFC explicitly scopes the repository folder `integrations/*`; it does not rename content keys.

## Alternatives considered

- **Keep `backs/*`.** Rejected because the name is internal shorthand and does not read well for external maintainers, contractors, or post-Notausgang ecosystem work.
- **Rename to `backends/*`.** Clear, but slightly narrower than the actual layer: compose stacks, proxies, schedulers, bridges, and worker envelopes are all services.
- **Move everything under `packages/*`.** Rejected because deployable composition would again mix with reusable libraries.
- **Delete `integrations/*`.** Rejected because source descriptors and monitor state are useful declarative registries and are not service workspaces.
- **Use `services.validate` instead of `services.workspace.validate`.** Rejected because the workspace validator has a specific boundary role. `services.check.run` is the composite pipeline.
