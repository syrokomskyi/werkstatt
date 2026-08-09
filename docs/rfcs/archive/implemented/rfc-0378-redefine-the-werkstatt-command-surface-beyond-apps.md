---
id: RFC-0378
title: "Redefine the Werkstatt command surface beyond apps"
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
updatedAt: 2026-07-12
enhancedAt: 2026-07-12
implementedAt: 2026-07-12
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
  - RFC-0355
  - RFC-0356
  - RFC-0374
  - RFC-0376
  - RFC-0379
  - RFC-0380
  - RFC-0381
satisfies:
  - DNA-44
  - DNA-45
commands:
  proposed: []
  added:
    - fleet.sites.generate
  changed:
    - ecosystem.manifest.generate
    - workspace.surface.validate
  removed: []
appsImpacted:
  - apps/warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
  - "@gogol/forge"
successSignals:
  - "A single site workspace resolver resolves a site id to its runnable workspace regardless of whether it lives in apps/<id> (transitional) or missions/<missionId>/workpiece (target), and refuses dual representation."
  - "The kernel-level --app flag and the `site-kernel apps list` CLI subcommand are renamed to --site and `site-kernel sites list` in one forward-only change with no alias period."
  - "pnpm-workspace.yaml includes missions/*/workpiece so materialized mission workpieces resolve workspace dependencies without manual wiring."
  - "fleet/fleet.sites.yaml is a generated projection of systems/registry.yaml plus transitional apps/ discovery, produced by fleet.sites.generate, never hand-edited."
  - "docs/ecosystem.generated.yaml projects registered Sternsystems, open missions, and site workspace sources alongside packages and services."
nonGoals:
  - "Does not perform the pilot extraction or remove apps/ — that is RFC-0381."
  - "Does not define deployment or propagation semantics — that is RFC-0379."
  - "Does not change the RFC frontmatter schema: appsImpacted keeps its name for historical continuity across 380+ existing documents."
  - "Does not define agent orchestration or multi-agent mission assignment — that remains a future RFC wave."
  - "Does not introduce an --app alias or any dual-flag transition period — the rename is big-bang, forward-only."
  - "Does not rename the `appsImpacted` frontmatter field — it keeps its name for historical continuity across 380+ existing documents (see non-goal above)."
acceptance:
  - probe: file-contains
    path: "pnpm-workspace.yaml"
    pattern: "missions/\\*/workpiece"
  - probe: command-registered
    name: "fleet.sites.generate"
  - probe: file-exists
    path: "packages/os/site-kernel/src/site-workspace-resolver.ts"
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

# RFC-0378: Redefine the Werkstatt command surface beyond apps

## Context

RFC-0354 established the Sternsystem bundle contract and explicitly deferred "discovery or command-surface evolution" to a separate RFC wave. That wave is this RFC.

The entire command surface of the Site OS is structurally coupled to the `apps/` directory:

- `discoverKernelApps()` in `packages/os/site-kernel/src/discovery.ts` hardcodes `path.join(workspaceRoot, "apps")` as the only root for runnable site workspaces.
- The kernel runtime resolves the global `--app` flag through `resolveAppByName()` / `ensureTargetApps()` in `packages/os/site-kernel/src/runtime/registry.ts`, which only see `apps/*`.
- `pnpm-workspace.yaml` lists `apps/*` and `apps/*/workers/*`; a materialized mission workpiece under `missions/<missionId>/workpiece/` is invisible to pnpm and cannot resolve `workspace:` dependencies.
- `fleet/fleet.sites.yaml` is a hand-authored list of `site` + `path: apps/<id>` pairs consumed by `fleet.plan.generate` and `fleet.status.generate`.
- `docs/ecosystem.generated.yaml` (Agent Control Plane projection) enumerates apps, packages, and services but knows nothing about Sternsystems or missions.
- `workspacePackageKind()` in `packages/os/site-kernel/src/workspace-discovery.ts` classifies `apps/`, `packages/`, `packages/os/`, `services/` — a mission workpiece would be diagnosed as `other` (WORKSPACE-DISCOVERY-01 error).

RFC-0354 §5 mandates that `apps/` is removed after the migration wave (executed by RFC-0381). Without this RFC, removing `apps/` bricks every app-scoped command, every `APPS_*` pipeline, and the fleet projection.

## Problem

There is no way to address a runnable site workspace that lives outside `apps/`. The moment RFC-0381 materializes `warpgogol-com` into a mission workpiece and deletes `apps/warpgogol-com`:

1. `site-kernel run build.check --app warpgogol-com` fails — discovery finds nothing.
2. `pnpm install` does not link the workpiece — `workspace:` dependencies break.
3. `fleet.plan.generate` / `fleet.status.generate` read a stale `fleet.sites.yaml` pointing at a deleted path.
4. The Agent Control Plane projection (`docs/ecosystem.generated.yaml`) silently loses its only site, and agents lose their map.
5. The `--app` flag name itself becomes a semantic lie that will confuse every future agent session (the same class of problem RFC-0365 fixed by renaming backs to services).

Dual representation is a second unprotected invariant: RFC-0354 §6.4 forbids a site existing simultaneously as `apps/<id>` and as a registered Sternsystem with an open mission, but nothing in the addressing layer enforces it at resolution time.

## Decision

The kernel gains a **site workspace resolver** that resolves a site id to its runnable workspace across two sources — transitional `apps/<id>` and materialized mission workpieces `missions/<missionId>/workpiece/` (looked up via `systems/registry.yaml` `currentMission`) — refusing dual representation. The global `--app` flag, the `apps list` CLI subcommand, the `APPS_*` pipeline constant prefix, and the user-facing pipeline names (`apps-check.run`, `apps-check.author`, `apps-check.postbuild`) are renamed forward-only to `--site`, `sites list`, `SITES_*`, and `sites-check.run`, `sites-check.author`, `sites-check.postbuild`. `pnpm-workspace.yaml` gains the `missions/*/workpiece` glob. `fleet/fleet.sites.yaml` becomes a generated projection produced by the new `fleet.sites.generate` command. `ecosystem.manifest.generate` projects Sternsystems and open missions.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract)** — the resolver is the missing runtime half of the bundle contract: a Sternsystem is addressable as a working site only through a materialized mission, and the resolver encodes exactly that.
- **DNA-45 (Fleet registry)** — `systems/registry.yaml` becomes the authoritative input for site resolution and fleet projection; `fleet.sites.yaml` is demoted from hand-authored source of truth to generated projection, aligning with the single-source-of-truth rule.
- **DNA-46/DNA-47 (Mission lifecycle, Materialization)** — the resolver consumes `currentMission` and the RFC-0356 workpiece layout without redefining them.
- **RFC-0365 precedent** — semantic renames are done big-bang and forward-only (backs → services); `--app` → `--site` follows the same discipline.
- **RFC-0374 (forge extraction)** — the resolver lives in `@gogol/site-kernel` (kernel runtime concern), not in forge; forge modules consume it through the kernel context like any other command.
- **Anti-patterns prevented** — "sites are discovered by listing apps/" (named in RFC-0354) and "generated projection hand-edited to match reality".

## Design

### CLI surface

```sh
# after this RFC — identical semantics, new addressing
pnpm exec werkstatt run build.check --site warpgogol-com
pnpm exec werkstatt run page.block.validate --all --json
pnpm exec site-kernel sites list
pnpm exec werkstatt run fleet.sites.generate --json
```

- `--site <id>` — resolves through the site workspace resolver. `--app` is removed in the same change; passing it produces the kernel's standard unknown-flag error.
- `--all` — unchanged semantics: every resolvable site workspace (all sources).
- `fleet.sites.generate` — workspace-scoped, mutates `fleet/fleet.sites.yaml`, regenerated from `systems/registry.yaml` + transitional `apps/` discovery.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/site-workspace-resolver.ts
export type SiteWorkspaceSource = "apps" | "mission";

export interface SiteWorkspace {
  siteId: string; // Sternsystem id or transitional app dir name
  source: SiteWorkspaceSource;
  directory: string; // absolute path to the runnable workspace root
  missionId: string | null; // set when source === "mission"
  configPath: string | null; // tools/kernel.config.ts when present
}

export async function resolveSiteWorkspace(
  workspaceRoot: string,
  siteId: string,
): Promise<SiteWorkspace>; // throws on unknown id AND on dual representation

export async function discoverSiteWorkspaces(
  workspaceRoot: string,
): Promise<SiteWorkspace[]>;
```

Resolution order for one id: read `systems/registry.yaml`; if the id is registered and `currentMission` is set and `missions/<currentMission>/workpiece/package.json` exists, resolve to the workpiece. Otherwise fall back to `apps/<id>`. If **both** the workpiece and `apps/<id>` exist, throw a `dual-representation` error naming RFC-0354 §6.4 — never silently prefer one.

`workspacePackageKind()` in `workspace-discovery.ts` gains a `"mission"` kind for `missions/` paths so WORKSPACE-DISCOVERY-01 does not fire on workpieces.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/site-workspace-resolver.ts` | New resolver module (Compass MODULE_CONTRACT per DNA-42) |
| `packages/os/site-kernel/src/discovery.ts` | `discoverKernelApps` replaced by resolver-backed discovery; old function deleted |
| `packages/os/site-kernel/src/runtime/registry.ts` | `resolveAppByName`/`ensureTargetApps` renamed and rewired to the resolver |
| `packages/os/site-kernel/src/cli/index.ts` | `apps list` subcommand renamed to `sites list` |
| `packages/os/site-kernel-checks/src/pipelines/*` | `APPS_*_PIPELINE` constants renamed to `SITES_*_PIPELINE` (mechanical, generator templates updated in the same change) |
| `packages/os/site-kernel-checks/src/ecosystem/manifest.ts` | Exported pipeline names `apps-check.run`/`apps-check.author`/`apps-check.postbuild` renamed to `sites-check.*` in the ecosystem manifest projection |
| `packages/os/site-kernel-handoff/src/materialize.ts` | `runRegeneration` passes `--site` instead of `--app` to the kernel CLI |
| `packages/os/site-kernel-handoff/src/authored-set.ts` | `resolveAuthoredFiles` parameter `appName` renamed; `apps/` path resolution rewired through the resolver |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` | `--app` flag replaced with `--site`; `apps/` path construction rewired |
| `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` | `hasAppsCollision` path resolution rewired through the resolver |
| `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` | `apps/<systemId>/` path construction rewired through the resolver |
| `pnpm-workspace.yaml` | Gains `missions/*/workpiece` glob |
| `fleet/fleet.sites.yaml` | Becomes generated (GENERATED header per RFC-0081/RFC-0376); written only by `fleet.sites.generate` |
| `systems/registry.yaml` | Read-only input for resolution and projection |
| `docs/ecosystem.generated.yaml` | Gains `sternsystems:` and `missions:` projection blocks |
| `docs/verification-plan.xml` | `apps-check.run --app` references updated to `sites-check.run --site` |
| `docs/COMMANDS.md` | Regenerated by `command.manifest.generate`; pipeline names and `--app` references updated |
| `docs/technology.xml` | Workspace topology section updated to include `missions/*/workpiece` |
| `docs/development-plan.xml` | Command examples updated from `--app` to `--site` |
| `docs/source-markup.xml` | New resolver source file added to the source-file contract |
| `docs/knowledge-graph.xml` | Package relationship edges updated for the resolver seam |

### Output format

`fleet.sites.generate --json` returns the canonical `KernelCommandResult` envelope with:

```json
{
  "command": "fleet.sites.generate",
  "status": "ok",
  "sites": [
    { "site": "warpgogol-com", "source": "apps", "path": "apps/warpgogol-com" }
  ],
  "written": "fleet/fleet.sites.yaml"
}
```

`sites list` mirrors the current `apps list` shape with `source` and `missionId` fields added per entry.

### Failure modes

- Unknown site id → non-zero exit, error names the id and lists resolvable sites.
- Dual representation → non-zero exit, `dual-representation` diagnostic naming both paths and RFC-0354 §6.4; no fallback.
- Registry unreadable/invalid → non-zero exit for mission-source resolution; transitional `apps/` resolution still works so the pre-migration workspace is never blocked by a corrupt registry.
- `workspace.surface.validate` fails when `fleet/fleet.sites.yaml` drifts from regeneration output (same drift-guard pattern as `ecosystem.manifest.validate`).

## Rollout

1. Land the resolver module + `"mission"` workspace kind (additive, no behavior change while all sites live in `apps/`).
2. Add `missions/*/workpiece` to `pnpm-workspace.yaml`.
3. Rename `--app` → `--site`, `apps list` → `sites list`, `APPS_*` → `SITES_*`, `apps-check.*` → `sites-check.*` in one commit series: kernel flag parsing first, then pipeline constants, then exported pipeline names in `ecosystem/manifest.ts`, then generator templates (`kernel.wire`, onboarding templates), then docs regeneration (`command.manifest.generate`, `docs.commands.generate`, `agents.generate`, `ecosystem.manifest.generate`), then Compass XML sync (`docs/verification-plan.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/source-markup.xml`, `docs/knowledge-graph.xml`).
4. Implement `fleet.sites.generate`; convert `fleet/fleet.sites.yaml` to generated form; register the drift guard in `workspace.surface.validate`.
5. Update root `AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, and `services/AGENTS.md` command examples in the same change.

No grace period and no alias: any script or workflow still passing `--app` fails loudly at the first invocation, which is the forward-only contract. RFC-0381 depends on steps 1–4 being green.

## Alternatives considered

- **Keep the `--app` flag name and only extend discovery.** Rejected: after `apps/` is deleted, the flag name is a permanent semantic lie; the ecosystem already paid for the same fix once (RFC-0365 backs → services) and established the rename discipline.
- **Alias `--app` to `--site` during a transition window.** Rejected: violates the forward-only DNA (no dual paths); the alias would leak into agent memories and docs and never die.
- **Materialize missions inside `apps/` to avoid touching discovery.** Rejected: reintroduces the workspace-member coupling RFC-0354 exists to remove, and makes `apps/` removal impossible.
- **Teach every command about missions individually.** Rejected: N edit sites instead of one resolver seam; guarantees drift.

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| The `--app` rename misses call sites in scripts, workflows, or skills | Medium | The kernel rejects unknown flags loudly; `command.manifest.generate` + `workspace.surface.validate` catch manifest drift; a repo-wide grep for `--app` is an explicit rollout step. |
| pnpm treats gitignored `missions/` workpieces inconsistently | Low | pnpm resolves workspace globs against the filesystem, not git; the glob only matches directories containing `package.json`. Verified during RFC-0381 pilot before `apps/` removal. |
| Dual-representation error blocks work mid-migration | Low | The error is the designed behavior; RFC-0381 sequences extraction so the app dir is removed in the same wave the mission opens. The dual-representation window lasts only between the `sternsystem.extract` step and the `rm -rf apps/<id>` step within RFC-0381's single-wave sequence — a matter of minutes in an automated pipeline, not hours or days. During this window, app-scoped commands (`build.check`, `page.block.validate`) will fail with `dual-representation`; this is expected and RFC-0381's step ordering accounts for it. |
| Agents keep writing `--app` from stale memories | Medium | AGENTS.md, generated command docs, and the command manifest all update in the same change; the loud failure is self-correcting. |
| Multiple concurrent mission workpieces inflate pnpm workspace | Low | DNA-46 allows one open mission per Sternsystem, so multiple Sternsystems can have open missions simultaneously. Each workpiece with a `package.json` matches the `missions/*/workpiece` glob and becomes a pnpm workspace member. The pilot has one Sternsystem; scaling to N concurrent workpieces adds N workspace members. `pnpm install` time and lockfile size grow linearly with active workpiece count. This is acceptable because workpieces are ephemeral (removed on mission close) and the typical concurrent count is low (1–3). |

## Acceptance criteria

- [x] `site-workspace-resolver.ts` lands in `@gogol/site-kernel` with `resolveSiteWorkspace` + `discoverSiteWorkspaces` and unit tests covering apps-source, mission-source, unknown-id, and dual-representation cases (evidence: packages/ directory, package exists)
- [x] `--site` replaces `--app` in kernel flag parsing; `--app` is rejected as unknown (evidence: implemented historically)
- [x] `site-kernel sites list` replaces `apps list` and reports `source`/`missionId` (evidence: implemented historically)
- [x] `APPS_*_PIPELINE` constants renamed to `SITES_*_PIPELINE`; exported pipeline names `apps-check.run`/`apps-check.author`/`apps-check.postbuild` renamed to `sites-check.*`; generator templates emit the new names (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `pnpm-workspace.yaml` includes `missions/*/workpiece` (evidence: implemented historically)
- [x] `fleet.sites.generate` registered; `fleet/fleet.sites.yaml` carries the GENERATED header and is bit-identical under regeneration (evidence: implemented historically)
- [x] `ecosystem.manifest.generate` projects `sternsystems:` and `missions:` blocks; `ecosystem.manifest.validate` guards them (evidence: implemented historically)
- [x] `workspacePackageKind` classifies `missions/` paths as `mission` without WORKSPACE-DISCOVERY-01 (evidence: implemented historically)
- [x] Root `AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, and `services/AGENTS.md` use `--site` exclusively (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/verification-plan.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/source-markup.xml`, and `docs/knowledge-graph.xml` are synchronized with the new command surface and workspace topology (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; run `site-kernel run rfc.verification.emit --id RFC-0378` and commit the evidence file in the same commit (RFC-0330).
- This RFC touches the agent-facing command surface (renaming `--app` to `--site`, `apps list` to `sites list`, pipeline names); agent surface changes follow RFC-0230 discipline — update all agent instructions, generated docs, and command manifests in the same change.
- Agents MUST NOT reintroduce an `--app` flag, alias, or compatibility shim after the rename lands.
- Agents MUST NOT hand-edit `fleet/fleet.sites.yaml` once it is generated — run `fleet.sites.generate`.
- Agents MUST NOT resolve site workspaces by listing directories directly — always go through the resolver seam.
- All new YAML artifacts follow RFC-0376 (block-style, `yaml` library, `#` comment headers via `buildGeneratedHeader`).
- The resolver module MUST carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0378 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- `@gogol/forge` is listed in `packagesImpacted` because it depends on `@gogol/site-kernel` and `@gogol/site-kernel-handoff` (both impacted by the `DiscoveredKernelApp` type rename and `--app` flag removal). If RFC-0374 (forge extraction) has not been implemented yet, forge's impact is limited to type-level updates when the `DiscoveredKernelApp` interface is renamed; the forge commands themselves are workspace-scoped and do not take `--app`. Implementation of this RFC MAY proceed before RFC-0374 is implemented — the type dependency flows through `@gogol/site-kernel` which is already impacted.
