---
reviewId: REVIEW-CODE-2026-07-13-02
date: 2026-07-13
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: ef239bf5b^...HEAD (RFC-0378 implementation commits on ecosystem-evolution; range also includes adjacent RFC-0377 commits)
filesReviewed:
  - packages/os/site-kernel/src/site-workspace-resolver.ts
  - packages/os/site-kernel/src/discovery.ts
  - packages/os/site-kernel/src/runtime/registry.ts
  - packages/os/site-kernel/src/cli/index.ts
  - packages/os/site-kernel/bin/site-kernel.mjs
  - packages/os/site-kernel/src/types.ts
  - packages/os/site-kernel/README.md
  - packages/os/site-kernel/src/workspace-discovery.ts
  - packages/os/site-kernel/src/rfc/handlers/validate-rules.ts
  - packages/os/site-kernel-checks/src/ecosystem/manifest.ts
  - packages/os/site-kernel-checks/src/pipelines/index.ts
  - packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts
  - packages/os/site-kernel-handoff/src/handoff-pack.ts
  - packages/os/site-kernel-handoff/src/materialize.ts
  - packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts
  - packages/forge/os/rfc/handlers/validate-rules.ts
  - docs/rfcs/rfc-0378-redefine-the-werkstatt-command-surface-beyond-apps.md
  - docs/command-manifest.generated.yaml (spot-checked)
  - docs/ecosystem.generated.yaml (spot-checked)
  - AGENTS.md (spot-checked)
  - apps/AGENTS.md (spot-checked)
  - packages/AGENTS.md (spot-checked)
---

# Code Review: RFC-0378 implementation

## Verdict: Needs revision

The implementation delivers the core RFC-0378 promise: a site workspace resolver, `--site` CLI flag, `sites list`, `SITES_*` pipelines, and generated fleet/ecosystem projections. Mechanical checks and validation suites pass. However, two agent-facing clarity gaps and one incomplete spec item remain: generated command manifests still label per-site providers as `app`, the `@gogol/site-kernel` README advertises stale exports and commands, and `notausgang-commands.ts` was supposed to be rewired through the resolver per the RFC decision table but still hardcodes `apps/<systemId>/`. These are fixable in a small follow-up commit and do not require rejecting the change.

## Mechanical floor

Pass.

- `pnpm --filter @gogol/site-kernel --filter @gogol/site-kernel-checks --filter @gogol/site-kernel-handoff --filter @gogol/site-kernel-onboarding --filter @gogol/share --filter @gogol/surface --filter @gogol/forge run build:check` — all 7 packages pass `tsc --noEmit`.
- `npx tsx packages/os/site-kernel/src/cli/index.ts run rfc.validate --id RFC-0378 --json` — zero violations for RFC-0378.
- `workspace.surface.validate`, `cosmic.catalog.validate`, `cosmic.name.unique`, `manifest.contract.validate`, `ecosystem.manifest.validate`, `page.block.validate` — all green in the validation suite run during implementation.

## Axis A — Structural correctness

- **Dead code in `packages/os/site-kernel/src/discovery.ts`**. The file still declares `APP_CONFIG_FILENAMES`, `shouldIgnoreName`, and `readPackageName`, but `discoverSiteWorkspaces` now delegates entirely to `site-workspace-resolver.ts`. Only `resolveAppConfigPath` (which uses `APP_CONFIG_FILENAMES`) is still used by `loadWorkspaceConfig`; `shouldIgnoreName` and `readPackageName` are unused. Remove or relocate them to keep the discovery module coherent.
- **Duplicated resolver logic**. `site-workspace-resolver.ts` re-implements `APP_CONFIG_FILENAMES`, `shouldIgnoreName`, `readPackageName`, and config-path resolution that previously lived in `discovery.ts`. The duplication is acceptable because `discovery.ts` now delegates to the resolver, but the dead code above should be cleaned up to make the split explicit.
- **No issues** with typing or error handling in the new resolver; `resolveSiteWorkspace` throws descriptive diagnostics for unknown ids and dual representation.

## Axis B — DNA alignment

No issues.

- DNA-1 (monorepo boundary): `site-kernel-handoff` imports the resolver from `@gogol/site-kernel`; no `apps/* → apps/*` or `apps/* → services/*` imports introduced.
- DNA-42 (Compass scaffolding): `site-workspace-resolver.ts` carries `MODULE_CONTRACT`, `CHANGE_SUMMARY`, and an `@ai-invariant` line for dual representation.
- DNA-23 (cosmic naming): not touched.

## Axis C — Ecosystem fit

- **Command provider terminology drift**. `packages/os/site-kernel/src/runtime/registry.ts` at line 162 still builds manifest keys as `app:${site.name}:${commandName}` and emits `provider: "app"` / `provider: "app:webgogol-com"` in `docs/command-manifest.generated.yaml` and `docs/ecosystem.generated.yaml`. The RFC renamed the agent-facing command surface from `--app` to `--site`; leaving the generated provider label as `app` creates a visible inconsistency in the Agent Control Plane projection. The `KernelRegisteredCommandInfo.provider` type (`packages/os/site-kernel/src/types.ts` line 104) is also still `"workspace" | "app"`. Consider `"workspace" | "site"` and updating the manifest builder accordingly.
- **Pipeline naming is correct**. `SITES_CHECK_PIPELINE`, `SITES_BUILD_PREPARE_PIPELINE`, etc. replace the old `APPS_*` constants, and the exported pipeline names in `ecosystem/manifest.ts` are now `sites-check.*`.
- **Ecosystem projection is complete**. `docs/ecosystem.generated.yaml` now includes `sternsystems: []` and `missions: []` blocks alongside the existing `apps`, `packages`, and `services` sections.
- **pnpm workspace updated**. `pnpm-workspace.yaml` gained `missions/*/workpiece`, satisfying the dependency-resolution requirement for materialized mission workpieces.

## Axis D — Forward-only compliance

No issues.

- The `--app` flag is rejected as unknown by the CLI parser; there is no alias or dual-path fallback.
- `APPS_*` pipeline constants were renamed, not preserved behind a compatibility re-export.
- The V-23 validator fix (`JSON.parse` → `yamlParse`) was applied in both `@gogol/site-kernel` and `@gogol/forge`, removing a latent bug that would have blocked future RFCs from transitioning to `implemented`.

## Axis E — Agent-facing clarity

- **Stale `README.md` exports and examples**. `packages/os/site-kernel/README.md` still lists `discoverKernelApps`, `loadKernelAppConfig`, and `listKernelApps` as key exports (lines 13–14) and documents `pnpm exec site-kernel list` (line 30). The actual exports are `discoverSiteWorkspaces`, `resolveSiteWorkspace`, `listSiteWorkspaces`, and `sites list`. The README is the first place another agent looks; stale entries will mislead.
- **Per-site provider label says `app`**. As noted in Axis C, generated manifests use `provider: app` and `provider: app:webgogol-com`. An agent reading `docs/command-manifest.generated.yaml` sees a command provided by an "app" while the CLI requires `--site`; the mismatch is confusing.
- **`handoff-pack.ts` error message uses old terminology**. `packages/os/site-kernel-handoff/src/handoff-pack.ts` line 104 says "requires the app name" and line 120 says "no app at apps/${siteName}". Since the flag is `--site`, the message should say "site name" and "no site at ...".
- **Otherwise clear**. Variable names (`siteName`, `siteId`, `discoverSiteWorkspaces`) are readable; new error messages include resolvable-site lists and RFC references.

## Axis F — Pragmatism

- **`notausgang-commands.ts` not rewired through the resolver**. The RFC decision table (line 196) explicitly states that `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` | `apps/<systemId>/` path construction should be rewired through the resolver. Lines 181 and 188 still hardcode `path.join(workspaceRoot, "apps", systemId, "src", "content")` and `path.join(workspaceRoot, "apps", systemId, "provenance")`. This leaves a gap for any Sternsystem whose materialized workpiece lives under `missions/<missionId>/workpiece`. Because `apps/` is still transitional and RFC-0381 will remove it, this is acceptable only if the gap is tracked; as implemented, it contradicts the spec.
- **Handoff materialize/pack still target `apps/`**. `materialize.ts` injects into `apps/<targetApp>` and `handoff-pack.ts` reads from `apps/<siteName>`. These are transitional by design (`apps/` is not removed until RFC-0381), but they should probably accept the resolved site directory rather than assuming `apps/` once mission workpieces exist. Deferring this to RFC-0381 is reasonable if documented.
- **New command earns its existence**. `fleet.sites.generate` is a single, well-scoped command that replaces hand-editing `fleet/fleet.sites.yaml`.

## Axis G — Blind spots

- **Migration path for generated manifest consumers**. If `provider: app` is renamed to `provider: site`, check that any downstream consumers of `docs/command-manifest.generated.yaml` or `docs/ecosystem.generated.yaml` handle the new value. The projection is generated, so a single regeneration commit can update all call sites.
- **Resolver performance**. `resolveSiteWorkspace` re-reads `systems/registry.yaml` and scans `apps/` on every call. This is fine for build-time CLI use but may deserve caching if it ever moves onto a hot path.
- **Dual representation race**. The resolver correctly errors on dual representation, but the error is only caught at resolution time; there is no build-time validator for the invariant beyond `workspace.surface.validate` (which checks generated fleet projection drift).

## Spec compliance

| Requirement from RFC-0378 | Status | Evidence |
| --- | --- | --- |
| Site workspace resolver resolves apps/ and missions/<id>/workpiece, refuses dual representation | Done | `packages/os/site-kernel/src/site-workspace-resolver.ts:137-158` |
| `--app` → `--site`, `apps list` → `sites list` | Done | `packages/os/site-kernel/src/cli/index.ts:65-74`, `packages/os/site-kernel/src/cli/index.ts:149-160` |
| `APPS_*_PIPELINE` → `SITES_*_PIPELINE`, exported pipeline names `sites-check.*` | Done | `packages/os/site-kernel-checks/src/pipelines/index.ts:13-20`, `packages/os/site-kernel-checks/src/ecosystem/manifest.ts:144-153` |
| `pnpm-workspace.yaml` includes `missions/*/workpiece` | Done | `pnpm-workspace.yaml` (verified by `rfc.verification.emit` probe) |
| `fleet.sites.generate` registered and `fleet/fleet.sites.yaml` generated | Done | `fleet/fleet.sites.yaml` carries GENERATED header; command registered |
| `docs/ecosystem.generated.yaml` projects `sternsystems` and `missions` | Done | `docs/ecosystem.generated.yaml:168-169` |
| AGENTS.md docs updated to `--site` / `sites-check.*` | Done | No `--app`/`apps-check` found in root/apps/packages `AGENTS.md` |
| `notausgang-commands.ts` path construction rewired through resolver | Missing | `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts:181,188` still hardcode `apps/<systemId>/` |
| No `--app` alias or compatibility shim | Done | CLI parser rejects `--app` as unknown |
| `site-kernel` bin works on Node.js v24 | Done | `packages/os/site-kernel/bin/site-kernel.mjs:10-21` uses `spawn` + `--import` instead of `tsx/esm/api register()` |

## Questions for the author

1. **Provider terminology**: Should the generated command/ecosystem manifests rename `provider: app` to `provider: site` and `provider: app:<site>` to `provider: site:<site>` to match the `--site` flag and `sites list` terminology, or is `app` intentionally retained as a historical provider category?
2. **`notausgang-commands.ts` resolver wiring**: The RFC decision table says `apps/<systemId>/` path construction should be rewired through the resolver. Was this deferred intentionally because `notausgang.export` operates on registry system ids rather than site ids, or is it an oversight?
3. **`site-kernel` README**: Is the stale README (`discoverKernelApps`, `listKernelApps`, `site-kernel list`) left for a separate documentation sweep, or should it be corrected as part of this RFC's doc regeneration?
