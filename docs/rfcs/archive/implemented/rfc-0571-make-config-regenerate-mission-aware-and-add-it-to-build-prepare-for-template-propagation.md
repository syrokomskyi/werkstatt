---
id: RFC-0571
title: "Make config.regenerate mission-aware and add it to build.prepare for template propagation"
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
enhancedAt: 2026-07-28
implementedAt: 2026-07-28
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0569
amendedBy: []
related:
  - DNA-44
  - DNA-47
  - RFC-0078
  - RFC-0381
  - RFC-0389
  - RFC-0569
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
  - DNA-47
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - config.regenerate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-onboarding
  - site-kernel-checks
successSignals: []
nonGoals:
  - Expanding config.regenerate to handle additional root config files (tsconfig.json, deploy workflow, .env.example)
  - Adding new commands
  - Backward compatibility with the retired apps/ directory layout
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

# RFC-0571: Make config.regenerate mission-aware and add it to build.prepare for template propagation

## Context

`config.regenerate` (RFC-0078) re-applies root config templates (`package.json`, `astro.config.mjs`, `wrangler.jsonc`, `.gitignore`, `postcss.config.cjs`) from `packages/os/site-kernel-onboarding/src/templates/` to an existing site. It uses the RFC-0081 GENERATED marker protocol to skip customized files.

The command was written for the `apps/<id>` era. It hardcodes `join(context.workspaceRoot, "apps", app)` as the target directory (line 114 of `config-regenerate.ts`). The `apps/` directory is retired (RFC-0381) — sites are now materialized into `missions/<id>/workpiece/` from Sternsystem data bundles. When `config.regenerate --site <id>` is run for a site in an active mission, it fails with `"apps/<id> does not exist"`.

In contrast, codegen generators like `routes.generate` use `requireAstroSitePaths(context)` from `@warpgogol/site-kernel-astro`, which resolves `context.site.directory` — the mission-aware site resolver. These generators work correctly with mission workpieces.

Additionally, `config.regenerate` is **not** in the `SITES_BUILD_PREPARE_PIPELINE` (defined in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`). The pipeline includes `kernel.wire`, `agents.generate`, `overlay.pages.generate`, `routes.generate`, `api.routes.generate`, and other codegen generators — but not `config.regenerate`. This means config files are generated during initial materialization (via `generateFullBoilerplate` in `mission-materialize.ts`) but never regenerated on subsequent `build.prepare` runs.

RFC-0569 documented this as an accepted limitation in its acceptance criteria: `config.regenerate cannot reach mission workpiece paths (hardcoded apps/<id>). astro.config.mjs manually updated to match template.`

## Problem

When root config templates in `packages/os/site-kernel-onboarding/src/templates/runtime/` are updated (e.g. `astro.config.template.mjs`, `package.template.json`), existing mission workpieces do not pick up the changes. There is no mechanism to propagate template updates to already-materialized workpieces.

This violates **DNA-44** (Sternsystem data-only contract): platform-owned files (`package.json`, `astro.config.mjs`, etc.) belong to the platform and are materialized at build time — but the materialization pipeline only generates them once, during initial `mission.materialize`. Subsequent `build.prepare` runs regenerate codegen files (`src/middleware.ts`, routes, etc.) but skip root config files.

This also violates **DNA-47** (Materialization): the Werkstück is materialized from the pinned platform, but template updates after materialization are not propagated. The operator must manually apply template changes to workpiece config files, which is error-prone and defeats the generation-first discipline.

The concrete failure mode: RFC-0569 updated `astro.config.template.mjs` to set `smartypants: false` in dev mode. `routes.generate` propagated the `src/middleware.ts` change to the workpiece (because it's in `build.prepare`), but `config.regenerate` could not propagate the `astro.config.mjs` change — it failed with `"apps/warpgogol-com does not exist"`. The operator had to manually edit the workpiece's `astro.config.mjs`.

## Decision

`config.regenerate` uses `requireAstroSitePaths(context).appDirectory` instead of the hardcoded `join(context.workspaceRoot, "apps", app)` path, making it mission-aware. It is added as the first step in the `SITES_BUILD_PREPARE_PIPELINE`, before `workpiece.imports.validate`, so that root config files are regenerated from templates on every `build.prepare` run.

## Architectural fit

- **DNA-44 (Sternsystem data-only contract):** Platform-owned files (`package.json`, `astro.config.mjs`, `wrangler.jsonc`, `.gitignore`, `postcss.config.cjs`) are materialized at build time, not stored in Sternsystem repos. This RFC ensures they stay in sync with template updates via `build.prepare`, closing the gap where config files were generated once during materialization and never refreshed.
- **DNA-47 (Materialization):** The Werkstück is materialized from the pinned platform. This RFC ensures that runtime scaffolding stays current — `build.prepare` now regenerates both config files and codegen files, so template updates propagate automatically.
- **RFC-0078 (generation-first):** `config.regenerate` was designed for the `apps/` era. This RFC updates it for the mission era by using the same mission-aware site resolver (`requireAstroSitePaths`) that codegen generators already use.
- **RFC-0389 (full boilerplate generation):** `generateFullBoilerplate` generates config files during initial materialization. Adding `config.regenerate` to `build.prepare` means config files are also regenerated on every subsequent `build.prepare` run. The double generation during initial materialization (once by `generateFullBoilerplate`, once by `config.regenerate` in `build.prepare`) is idempotent — same templates, same content, same GENERATED marker.
- **RFC-0569 (dev/prod egress parity):** Documented the `config.regenerate` gap as an accepted limitation. This RFC amends RFC-0569's acceptance criterion to reflect that `config.regenerate` now reaches mission workpiece paths.
- **Site OS operator model:** No new command, no new flags. `config.regenerate` remains `scope: app` with `--site` and `--force` flags. The only change is path resolution and pipeline placement.

## Design

### Path resolution change

`config.regenerate` replaces the hardcoded `apps/` path with `requireAstroSitePaths`:

```ts
// Before (config-regenerate.ts:114)
const appDir = join(context.workspaceRoot, "apps", app);

// After
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
const { appDirectory: appDir } = requireAstroSitePaths(context);
```

`requireAstroSitePaths(context)` resolves `context.site.directory`, which is the mission-aware site workspace resolver. It works for `missions/<id>/workpiece/`, `apps/<id>` (legacy), and any future site workspace layout. The `loadSystemTokens(appDir)` call remains unchanged — it reads `src/content/system.md` from the resolved directory.

The `--site` flag resolution (`input.flags.site` → `context.site?.name`) and the `--force` flag behavior are unchanged.

Two error messages in `config-regenerate.ts` that reference `apps/` are updated to use the resolved `appDir` path instead:

```ts
// Before (line 119)
summary: "config.regenerate: apps/" + app + " does not exist",
// After
summary: "config.regenerate: " + appDir + " does not exist",

// Before (line 128)
summary: "config.regenerate: unable to read apps/" + app + "/src/content/system.md",
// After
summary: "config.regenerate: unable to read " + appDir + "/src/content/system.md",
```

### Pipeline placement

`config.regenerate` is added as the **first step** in `SITES_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`:

```ts
export const SITES_BUILD_PREPARE_PIPELINE: KernelPipelineStep[] = [
  // RFC-0571: regenerate root config files from templates before any validation or codegen
  { command: "config.regenerate" },
  // RFC-0557: validate workpiece @warpgogol/* imports resolve from root node_modules before any generators run
  { command: "workpiece.imports.validate" },
  // ... rest of pipeline unchanged
];
```

Placing `config.regenerate` first ensures `package.json` and `astro.config.mjs` are current before `workpiece.imports.validate` checks import resolvability and before any codegen generators run.

### CLI surface

No new commands, no new flags. The command is invoked the same way:

```sh
pnpm exec werkstatt run config.regenerate --site warpgogol-com
pnpm exec werkstatt run config.regenerate --site warpgogol-com --force
```

It also runs automatically as the first step of `build.prepare`:

```sh
pnpm exec werkstatt run build.prepare --site warpgogol-com
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-onboarding/src/config-regenerate.ts` | Path resolution changed from hardcoded `apps/` to `requireAstroSitePaths` |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | `config.regenerate` added as first pipeline step |
| `<site>/package.json` | Regenerated from `package.template.json` (GENERATED marker protocol) |
| `<site>/astro.config.mjs` | Regenerated from `astro.config.template.mjs` (GENERATED marker protocol) |
| `<site>/wrangler.jsonc` | Regenerated from `wrangler.template.jsonc` (GENERATED marker protocol) |
| `<site>/.gitignore` | Regenerated from `gitignore.template` (GENERATED marker protocol) |
| `<site>/postcss.config.cjs` | Regenerated from `postcss.config.template.cjs` (no marker — always overwritten) |

### Output format

The `--json` output shape is unchanged:

```json
{
  "command": "config.regenerate",
  "app": "warpgogol-com",
  "generated": ["package.json", "astro.config.mjs"],
  "skipped": ["wrangler.jsonc"]
}
```

### Failure modes

- **Missing `system.md`:** If `src/content/system.md` is not found in the resolved site directory, the command exits with code 1 and a descriptive error. Same as current behavior.
- **No site context:** If `context.site` is null, `requireAstroSitePaths` throws `"This command requires an app-scoped runtime context."` — same as all other app-scoped commands.
- **Customized files (no GENERATED marker):** Files without the marker are skipped and listed in `skipped[]`. Use `--force` to overwrite. Same as current behavior.
- **Double generation during materialization:** `generateFullBoilerplate` writes config files, then `build.prepare` (which now includes `config.regenerate`) writes them again. This is idempotent — same templates, same content. The second write is a no-op in practice.

## Rollout

1. **Phase 1 (this RFC):** Fix `config.regenerate` path resolution to use `requireAstroSitePaths`. Add `config.regenerate` as the first step in `SITES_BUILD_PREPARE_PIPELINE`. No migration path needed — the change is transparent. All existing and future mission workpieces automatically get config regeneration on every `build.prepare` run.
2. **Phase 2 (immediate):** Run `build.prepare` on existing mission workpieces to propagate any pending template updates. This is a one-time action per workpiece.
3. **No backward compatibility:** The hardcoded `apps/` path is removed. The `apps/` directory is retired (RFC-0381). No legacy support.

## Alternatives considered

- **Separate `boilerplate.regenerate` command:** A new command that combines `config.regenerate` + all codegen generators. Rejected: unnecessary complexity. `config.regenerate` already exists and handles root config files. Adding it to `build.prepare` achieves the same result without a new command.
- **Manual operator action:** Keep `config.regenerate` out of `build.prepare` and have operators run it manually when needed. Rejected: defeats the purpose of automatic propagation. The operator already has to run `build.prepare` — config regeneration should be part of it.
- **Expand `config.regenerate` to handle all root configs (tsconfig.json, deploy workflow, .env.example):** Rejected: minimal scope. Other generators (`env.example.generate`, `kernel.wire`) already handle those files in `build.prepare`. Expanding `config.regenerate` would create overlap and conflict.

## Risks

- **Double generation during materialization:** `generateFullBoilerplate` writes config files during `mission.materialize`, then `build.prepare` (which now includes `config.regenerate`) writes them again. This is idempotent — same templates, same content, same GENERATED marker. The second write is a no-op. Minor redundancy, no risk.
- **Customized files not updated:** If an operator customized a config file (removed the GENERATED marker), `config.regenerate` skips it. Template updates will not propagate. This is by design (RFC-0081 marker protocol) — `--force` overrides.
- **Agent confusion:** Agents might think `config.regenerate` handles all generated files. It only handles 5 root config files. Codegen generators (`routes.generate`, `agents.generate`, etc.) handle the rest. The `build.prepare` pipeline runs both.
- **`postcss.config.cjs` has no GENERATED marker:** It is always overwritten by `config.regenerate`. This is current behavior and unchanged. If an operator customizes it, the customization is lost on the next `build.prepare` run. This is acceptable — `postcss.config.cjs` is a platform-owned file.

## Acceptance criteria

- [x] `config.regenerate` uses `requireAstroSitePaths(context).appDirectory` instead of `join(context.workspaceRoot, "apps", app)` in `packages/os/site-kernel-onboarding/src/config-regenerate.ts`. (evidence: packages/os/site-kernel-onboarding/src/config-regenerate.ts:39,107)
- [x] `config.regenerate` is the first step in `SITES_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`. (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:20-21)
- [x] Running `config.regenerate --site warpgogol-com` on a mission workpiece succeeds — 4 files generated, 1 skipped (package.json customized). (evidence: `pnpm exec werkstatt run config.regenerate --site warpgogol-com --json` — exitCode: 0, generated: [astro.config.mjs, wrangler.jsonc, .gitignore, postcss.config.cjs], skipped: [package.json])
- [x] Running `config.regenerate --site <id>` on a mission workpiece succeeds (no `"apps/<id> does not exist"` error). (evidence: `pnpm exec werkstatt run config.regenerate --site warpgogol-com --json` — exitCode: 0)
- [x] RFC-0569 acceptance criterion updated: `config.regenerate cannot reach mission workpiece paths` is replaced with `config.regenerate reaches mission workpiece paths via requireAstroSitePaths`. (evidence: docs/rfcs/rfc-0569-dev-prod-egress-parity-apply-text-normalization-in-dev-mode-via-astro-middleware.md:263)
- [x] `pnpm --filter @warpgogol/site-kernel-onboarding build:check` passes. (evidence: `pnpm --filter @warpgogol/site-kernel-onboarding run build:check` — exit code 0)
- [x] `pnpm --filter @warpgogol/site-kernel-checks build:check` passes. (evidence: `pnpm --filter @warpgogol/site-kernel-checks run build:check` — exit code 0, after fixing pre-existing import.meta.env.DEV type error in packages/share/src/text-normalize.ts:538)
- [x] `rfc.validate` passes on this file. (evidence: `pnpm exec werkstatt run rfc.validate RFC-0571 --json` — 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The path resolution change is a five-line edit in `config-regenerate.ts`: add `import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro"`, replace `join(context.workspaceRoot, "apps", app)` with `requireAstroSitePaths(context).appDirectory`, and update two error messages that reference `apps/` to use the resolved `appDir` path instead.
- The pipeline change is a one-line edit in `build-prepare.ts`: add `{ command: "config.regenerate" }` as the first element of `SITES_BUILD_PREPARE_PIPELINE`.
- The RFC-0569 amendment updates the acceptance criterion text from `config.regenerate cannot reach mission workpiece paths (hardcoded apps/<id>)` to `config.regenerate reaches mission workpiece paths via requireAstroSitePaths`.
