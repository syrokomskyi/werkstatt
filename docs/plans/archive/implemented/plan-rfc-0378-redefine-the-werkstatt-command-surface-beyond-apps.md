---
rfcId: RFC-0378
planId: PLAN-RFC-0378-01
status: draft
owner: architecture
createdAt: 2026-07-12
updatedAt:
scope:
  apps:
    - apps/warpgogol-com
  packages:
    - packages/os/site-kernel
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-handoff
    - packages/forge
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/source-markup.xml
    - docs/knowledge-graph.xml
    - docs/COMMANDS.md
    - docs/ecosystem.generated.yaml
    - AGENTS.md
    - apps/AGENTS.md
    - packages/AGENTS.md
    - services/AGENTS.md
---

# Implementation Plan: RFC-0378

## 1. Objectives

- [ ] Land the site workspace resolver module in `@gogol/site-kernel` with `resolveSiteWorkspace` + `discoverSiteWorkspaces` and unit tests — maps to acceptance criterion: resolver module with tests
- [ ] Rename `--app` → `--site`, `apps list` → `sites list`, `APPS_*` → `SITES_*`, `apps-check.*` → `sites-check.*` in one forward-only change — maps to acceptance criteria: flag rename, CLI subcommand rename, pipeline constant rename, exported pipeline name rename
- [ ] Add `missions/*/workpiece` to `pnpm-workspace.yaml` and classify `missions/` paths in `workspacePackageKind` — maps to acceptance criteria: pnpm workspace glob, workspace kind
- [ ] Implement `fleet.sites.generate` and convert `fleet/fleet.sites.yaml` to generated form — maps to acceptance criteria: command registered, generated file with GENERATED header, drift guard
- [ ] Update `ecosystem.manifest.generate` to project `sternsystems:` and `missions:` blocks — maps to acceptance criterion: ecosystem manifest projection
- [ ] Synchronize all Compass XML files and AGENTS.md files with the new command surface — maps to acceptance criteria: AGENTS.md files use `--site`, Compass XML files synchronized
- [ ] Run validation suite and emit verification evidence — maps to acceptance criterion: `rfc.validate` passes

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/os/site-kernel`**

- `src/site-workspace-resolver.ts` — NEW: resolver module with `SiteWorkspace`, `SiteWorkspaceSource`, `resolveSiteWorkspace`, `discoverSiteWorkspaces`
- `src/discovery.ts` — `discoverKernelApps` replaced by resolver-backed discovery; old function deleted
- `src/runtime/registry.ts` — `resolveAppByName`/`ensureTargetApps` renamed and rewired to resolver
- `src/cli/index.ts` — `--app` flag renamed to `--site`; `apps list` subcommand renamed to `sites list`; `printUsage` updated
- `src/workspace-discovery.ts` — `workspacePackageKind` gains `"mission"` kind for `missions/` paths
- `src/types.ts` — `DiscoveredKernelApp` renamed to `DiscoveredSiteWorkspace`; `KernelRuntimeContext.app` renamed to `.site`; `supportsAllApps` renamed to `supportsAllSites`; `KernelAppsListResult` renamed to `SiteWorkspacesListResult`

**`packages/os/site-kernel-checks`**

- `src/pipelines/apps-check.ts` → `src/pipelines/sites-check.ts` — `APPS_CHECK_PIPELINE` → `SITES_CHECK_PIPELINE`
- `src/pipelines/apps-check-author.ts` → `src/pipelines/sites-check-author.ts` — `APPS_CHECK_AUTHOR_PIPELINE` → `SITES_CHECK_AUTHOR_PIPELINE`
- `src/pipelines/apps-check-postbuild.ts` → `src/pipelines/sites-check-postbuild.ts` — `APPS_CHECK_POSTBUILD_PIPELINE` → `SITES_CHECK_POSTBUILD_PIPELINE`
- `src/pipelines/build-prepare.ts` — `APPS_BUILD_PREPARE_PIPELINE` → `SITES_BUILD_PREPARE_PIPELINE`
- `src/pipelines/build-check.ts` — `APPS_BUILD_CHECK_PIPELINE` → `SITES_BUILD_CHECK_PIPELINE`
- `src/pipelines/build-post.ts` — `APPS_BUILD_POST_PIPELINE` → `SITES_BUILD_POST_PIPELINE`
- `src/pipelines/index.ts` — re-exports updated names
- `src/module.ts` — command names `apps-check.run` → `sites-check.run`, `apps-check.author` → `sites-check.author`, `apps-check.postbuild` → `sites-check.postbuild`; pipeline references updated; `supportsAllApps` → `supportsAllSites`
- `src/ecosystem/manifest.ts` — exported pipeline names `apps-check.run`/`apps-check.author`/`apps-check.postbuild` → `sites-check.*`
- `src/fleet-leitstand.ts` — `discoverSites` rewired to use `discoverSiteWorkspaces` instead of reading `apps/` directory directly
- NEW: `src/fleet-sites-generate.ts` — `fleet.sites.generate` command handler

**`packages/os/site-kernel-handoff`**

- `src/materialize.ts` — `runRegeneration` passes `--site` instead of `--app`; `appName` parameter renamed
- `src/authored-set.ts` — `resolveAuthoredFiles` parameter `appName` renamed; `apps/` path resolution rewired through resolver
- `src/sternsystem/sternsystem-extract.ts` — `--app` flag replaced with `--site`; `apps/` path construction rewired
- `src/sternsystem/registry-io.ts` — `hasAppsCollision` path resolution rewired through resolver
- `src/notausgang/notausgang-commands.ts` — `apps/<systemId>/` path construction rewired through resolver

**`packages/forge`**

- Type-level updates: if `DiscoveredKernelApp` is imported anywhere, update to `DiscoveredSiteWorkspace`. No command-level changes (forge commands are workspace-scoped).

**Site OS commands**

- NEW: `fleet.sites.generate` — workspace-scoped, mutates `fleet/fleet.sites.yaml`
- CHANGED: `ecosystem.manifest.generate` — projects `sternsystems:` and `missions:` blocks
- CHANGED: `workspace.surface.validate` — drift guard for `fleet/fleet.sites.yaml`

### 2.2 Configuration and data

- `pnpm-workspace.yaml` — gains `missions/*/workpiece` glob
- `fleet/fleet.sites.yaml` — converted to generated form with GENERATED header (RFC-0081/RFC-0376)
- `systems/registry.yaml` — read-only input (no changes to the file itself, only to readers)
- `docs/ecosystem.generated.yaml` — gains `sternsystems:` and `missions:` projection blocks

### 2.3 Documentation and specs

- `AGENTS.md` (root) — command examples updated from `--app` to `--site`
- `apps/AGENTS.md` — command examples updated
- `packages/AGENTS.md` — command examples updated
- `services/AGENTS.md` — command examples updated
- `docs/verification-plan.xml` — `apps-check.run --app` references updated to `sites-check.run --site`
- `docs/COMMANDS.md` — regenerated by `command.manifest.generate`
- `docs/technology.xml` — workspace topology section updated to include `missions/*/workpiece`
- `docs/development-plan.xml` — command examples updated from `--app` to `--site`
- `docs/source-markup.xml` — new resolver source file added to source-file contract
- `docs/knowledge-graph.xml` — package relationship edges updated for resolver seam

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0378`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/forge run build:check`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0378`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0378`
- Repo-wide grep for `--app` to verify no remaining call sites

## 3. Step sequence

### Step 1. Create the site workspace resolver module

**Goal:** Land the resolver that resolves a site id to its runnable workspace across `apps/<id>` and `missions/<missionId>/workpiece/`.

**Agent actions:**

- Create `packages/os/site-kernel/src/site-workspace-resolver.ts` with `SiteWorkspaceSource`, `SiteWorkspace`, `resolveSiteWorkspace`, `discoverSiteWorkspaces`
- Resolution order: read `systems/registry.yaml`; if id is registered and `currentMission` is set and `missions/<currentMission>/workpiece/package.json` exists, resolve to workpiece; otherwise fall back to `apps/<id>`; if both exist, throw `dual-representation` error naming RFC-0354 §6.4
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)
- Export from `packages/os/site-kernel/src/index.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check`

**Completion criterion:** `site-workspace-resolver.ts` exists, exports `resolveSiteWorkspace` and `discoverSiteWorkspaces`, and `build:check` passes.

**Human review:** No

---

### Step 2. Add `"mission"` workspace kind and unit tests for the resolver

**Goal:** Make `workspacePackageKind` recognize `missions/` paths and verify the resolver with unit tests.

**Agent actions:**

- Update `workspacePackageKind()` in `packages/os/site-kernel/src/workspace-discovery.ts` to classify `missions/` paths as `"mission"` kind
- Write unit tests covering: apps-source resolution, mission-source resolution, unknown-id error, dual-representation error, registry unreadable fallback to `apps/`
- Place tests alongside resolver or in the test directory convention used by the package

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel run test`

**Completion criterion:** `workspacePackageKind` classifies `missions/` as `"mission"` without WORKSPACE-DISCOVERY-01; all resolver unit tests pass.

**Human review:** No

---

### Step 3. Rename `--app` → `--site` and `apps list` → `sites list` in the kernel CLI

**Goal:** Replace the global `--app` flag with `--site` and rename the `apps list` subcommand to `sites list`.

**Agent actions:**

- In `packages/os/site-kernel/src/cli/index.ts`: replace `--app`/`--app=` parsing with `--site`/`--site=`; update `printUsage` to show `sites list` and `--site`
- In `packages/os/site-kernel/src/types.ts`: rename `DiscoveredKernelApp` → `DiscoveredSiteWorkspace`, `KernelAppsListResult` → `SiteWorkspacesListResult`, `KernelRuntimeContext.app` → `.site`, `KernelRuntimeContext.appExplicit` → `.siteExplicit`, `supportsAllApps` → `supportsAllSites`
- In `packages/os/site-kernel/src/runtime/registry.ts`: rename `resolveAppByName` → `resolveSiteByName`, `ensureTargetApps` → `ensureTargetSites`; rewire to call `resolveSiteWorkspace`/`discoverSiteWorkspaces`
- In `packages/os/site-kernel/src/discovery.ts`: replace `discoverKernelApps` with resolver-backed `discoverSiteWorkspaces`; delete old function
- Update all internal references in `packages/os/site-kernel/src/`

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel run test`

**Completion criterion:** `--site` replaces `--app` in kernel flag parsing; `--app` is rejected as unknown; `site-kernel sites list` replaces `apps list`; `build:check` passes.

**Human review:** No

---

### Step 4. Rename `APPS_*` pipeline constants and `apps-check.*` command names

**Goal:** Rename all pipeline constants and user-facing pipeline/command names from `APPS_*` to `SITES_*` and `apps-check.*` to `sites-check.*`.

**Agent actions:**

- Rename pipeline files and constants in `packages/os/site-kernel-checks/src/pipelines/`:
  - `APPS_CHECK_PIPELINE` → `SITES_CHECK_PIPELINE`
  - `APPS_CHECK_AUTHOR_PIPELINE` → `SITES_CHECK_AUTHOR_PIPELINE`
  - `APPS_CHECK_POSTBUILD_PIPELINE` → `SITES_CHECK_POSTBUILD_PIPELINE`
  - `APPS_BUILD_PREPARE_PIPELINE` → `SITES_BUILD_PREPARE_PIPELINE`
  - `APPS_BUILD_CHECK_PIPELINE` → `SITES_BUILD_CHECK_PIPELINE`
  - `APPS_BUILD_POST_PIPELINE` → `SITES_BUILD_POST_PIPELINE`
- Update `src/pipelines/index.ts` re-exports
- Update `src/module.ts`: command names `apps-check.run` → `sites-check.run`, `apps-check.author` → `sites-check.author`, `apps-check.postbuild` → `sites-check.postbuild`; `supportsAllApps` → `supportsAllSites`; pipeline references
- Update `src/ecosystem/manifest.ts`: exported pipeline names `apps-check.run`/`apps-check.author`/`apps-check.postbuild` → `sites-check.*`
- Update `src/fleet-leitstand.ts`: `discoverSites` rewired to use `discoverSiteWorkspaces`
- Update all internal references across `packages/os/site-kernel-checks/src/`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`

**Completion criterion:** All `APPS_*` constants renamed to `SITES_*`; exported pipeline names renamed to `sites-check.*`; `build:check` passes.

**Human review:** No

---

### Step 5. Rewire `@gogol/site-kernel-handoff` to use `--site` and the resolver

**Goal:** Update all handoff package files that reference `--app`, `appName`, or `apps/` paths.

**Agent actions:**

- `src/materialize.ts`: `runRegeneration` passes `--site` instead of `--app`; `appName` parameter renamed to `siteId`
- `src/authored-set.ts`: `resolveAuthoredFiles` parameter `appName` renamed; `apps/` path resolution rewired through resolver
- `src/sternsystem/sternsystem-extract.ts`: `--app` flag replaced with `--site`; `apps/` path construction rewired through resolver
- `src/sternsystem/registry-io.ts`: `hasAppsCollision` path resolution rewired through resolver
- `src/notausgang/notausgang-commands.ts`: `apps/<systemId>/` path construction rewired through resolver

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

**Completion criterion:** No `--app` or `appName` references remain in `@gogol/site-kernel-handoff`; `build:check` passes.

**Human review:** No

---

### Step 6. Update `@gogol/forge` type references

**Goal:** Update any type-level references in forge that depend on renamed types from `@gogol/site-kernel`.

**Agent actions:**

- Search `packages/forge/src/` for imports of `DiscoveredKernelApp`, `KernelAppsListResult`, `supportsAllApps`, or any `--app` references
- Update imports to use new type names (`DiscoveredSiteWorkspace`, `SiteWorkspacesListResult`, `supportsAllSites`)
- If no references found, this step is a no-op (forge commands are workspace-scoped)

**Validation:**

- `pnpm --filter @gogol/forge run build:check`

**Completion criterion:** `@gogol/forge` `build:check` passes with updated type references.

**Human review:** No

---

### Step 7. Add `missions/*/workpiece` to `pnpm-workspace.yaml`

**Goal:** Make materialized mission workpieces visible to pnpm workspace resolution.

**Agent actions:**

- Add `missions/*/workpiece` to the `packages` list in `pnpm-workspace.yaml`
- Run `pnpm install` to verify the glob is accepted (no matching directories needed yet)

**Validation:**

- `pnpm install` succeeds without errors

**Completion criterion:** `pnpm-workspace.yaml` includes `missions/*/workpiece`; `pnpm install` succeeds.

**Human review:** No

---

### Step 8. Implement `fleet.sites.generate` and convert `fleet/fleet.sites.yaml` to generated form

**Goal:** Create the `fleet.sites.generate` command and make `fleet/fleet.sites.yaml` a generated projection.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/fleet-sites-generate.ts` with the command handler
- Command reads `systems/registry.yaml` + transitional `apps/` discovery (via `discoverSiteWorkspaces`), writes `fleet/fleet.sites.yaml` with GENERATED header (RFC-0081/RFC-0376)
- Register `fleet.sites.generate` in `src/module.ts` as workspace-scoped, `mutatesState: true`
- Add drift guard to `workspace.surface.validate`: fail when `fleet/fleet.sites.yaml` drifts from regeneration output
- Convert existing `fleet/fleet.sites.yaml` to generated form (add GENERATED header, regenerate)
- `fleet.sites.generate --json` returns `KernelCommandResult` with `sites` array and `written` path

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run fleet.sites.generate --json`
- `pnpm exec site-kernel run workspace.surface.validate`

**Completion criterion:** `fleet.sites.generate` registered; `fleet/fleet.sites.yaml` carries GENERATED header and is bit-identical under regeneration; drift guard in `workspace.surface.validate` passes.

**Human review:** No

---

### Step 9. Update `ecosystem.manifest.generate` to project Sternsystems and missions

**Goal:** Extend the ecosystem manifest to include `sternsystems:` and `missions:` blocks.

**Agent actions:**

- Update `packages/os/site-kernel-checks/src/ecosystem/manifest.ts` `buildEcosystemManifest` to read `systems/registry.yaml` and project registered Sternsystems
- Project open missions by scanning `missions/` for workpiece directories with `package.json`
- Add `sternsystems:` and `missions:` blocks to the `EcosystemManifest` type and output
- Update `ecosystem.manifest.validate` to guard the new blocks

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run ecosystem.manifest.generate --json`
- `pnpm exec site-kernel run ecosystem.manifest.validate`

**Completion criterion:** `ecosystem.manifest.generate` projects `sternsystems:` and `missions:` blocks; `ecosystem.manifest.validate` passes.

**Human review:** No

---

### Step 10. Regenerate generated docs and update AGENTS.md files

**Goal:** Synchronize all generated documentation and agent instruction files with the new command surface.

**Agent actions:**

- Run `pnpm exec site-kernel run command.manifest.generate` to regenerate `docs/COMMANDS.md`
- Run `pnpm exec site-kernel run docs.commands.generate` to regenerate command docs
- Run `pnpm exec site-kernel run agents.generate` to regenerate agent docs
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to regenerate `docs/ecosystem.generated.yaml`
- Update `AGENTS.md` (root), `apps/AGENTS.md`, `packages/AGENTS.md`, `services/AGENTS.md` — replace any `--app` references with `--site`, `apps list` with `sites list`, `apps-check.*` with `sites-check.*`

**Validation:**

- Repo-wide grep for `--app` should return zero results in tracked files (excluding RFC files and this plan)
- `pnpm exec site-kernel run workspace.surface.validate`

**Completion criterion:** All generated docs regenerated; all AGENTS.md files use `--site` exclusively; no `--app` references remain in non-RFC tracked files.

**Human review:** No

---

### Step 11. Synchronize Compass XML files

**Goal:** Update all `docs/*.xml` Compass files to reflect the new command surface and workspace topology.

**Agent actions:**

- `docs/verification-plan.xml`: update `apps-check.run --app` references to `sites-check.run --site`
- `docs/technology.xml`: update workspace topology section to include `missions/*/workpiece`
- `docs/development-plan.xml`: update command examples from `--app` to `--site`
- `docs/source-markup.xml`: add `packages/os/site-kernel/src/site-workspace-resolver.ts` to the source-file contract
- `docs/knowledge-graph.xml`: update package relationship edges for the resolver seam

**Validation:**

- `pnpm exec site-kernel run workspace.surface.validate`

**Completion criterion:** All five Compass XML files updated and `workspace.surface.validate` passes.

**Human review:** No

---

### Step 12. Run validation suite and emit verification evidence

**Goal:** Run all required checks and emit the RFC-0330 verification evidence file.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0378 --json`
- Run `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0378`
- Run `pnpm --filter @gogol/site-kernel run build:check`
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @gogol/forge run build:check`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0378`
- Commit the evidence file

**Validation:**

- All commands return exit code 0

**Completion criterion:** `rfc.validate` passes; all `build:check` pass; acceptance probes pass; verification evidence file committed.

**Human review:** No

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0378`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/forge run build:check`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0378`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0378` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0378.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0378` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| The `--app` rename misses call sites in scripts, workflows, or skills | Step 10 includes a repo-wide grep for `--app` as a completion criterion; the kernel rejects unknown flags loudly |
| pnpm treats gitignored `missions/` workpieces inconsistently | Step 7 verifies `pnpm install` succeeds with the new glob; pnpm resolves workspace globs against the filesystem, not git |
| Dual-representation error blocks work mid-migration | Step 1 implements the error as designed behavior; the window lasts only between extract and rm steps in RFC-0381's single-wave sequence |
| Agents keep writing `--app` from stale memories | Step 10 updates all AGENTS.md files and generated docs in the same change; the loud failure is self-correcting |
| Multiple concurrent mission workpieces inflate pnpm workspace | Acceptable: DNA-46 limits one open mission per Sternsystem; workpieces are ephemeral; typical concurrent count is low (1–3) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44, DNA-45, DNA-46, or DNA-47, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0378 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the `DiscoveredKernelApp` type rename causes breaking changes in packages not listed in `packagesImpacted`, stop and create a follow-up RFC to address the additional impact surface.
- If `fleet.sites.generate` cannot produce a bit-identical output under regeneration (non-deterministic), stop and investigate the source of non-determinism before proceeding.
