---
id: RFC-0546
title: "Deprecate forge.init standalone CLI and add migration-adapter registry to forge-bootstrap transplant"
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
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0552
related:
  - RFC-0374
  - RFC-0391
  - RFC-0393
  - RFC-0540
  - RFC-0542
  - RFC-0543
  - RFC-0544
  - RFC-0545
  - DNA-54
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
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
  changed: []
  removed:
    - forge.init
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "forge init is no longer registered as a CLI command; runInit() remains as an internal primitive called by forge.create"
  - "forge-bootstrap transplant mode copies source code from an external project into the forge project using a migration adapter"
  - "A migration-adapter registry exists with at least two adapters: node-typescript-pnpm and phaser-pnpm"
  - "forge-bootstrap transplant places code into turborepo apps/<name>/ and updates pnpm-workspace.yaml and turbo.json"
  - "An operator with an existing Node/TS or Phaser project runs forge create + /forge-bootstrap transplant and gets a working forge project with their code migrated"
nonGoals:
  - "Removing forge.init as an internal function — runInit() stays as the config-writing primitive called by forge.create"
  - "Changing greenfield mode in forge-bootstrap — greenfield is unchanged"
  - "Adding migration adapters for Python, Rust, Go, or Java in this RFC — only Node/TS and Phaser ship initially"
  - "Automatic language detection from file contents — the skill asks; it does not guess"
  - "Rewriting business logic during migration — the adapter copies code, it does not transform semantics"
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

# RFC-0546: Deprecate forge.init standalone CLI and add migration-adapter registry to forge-bootstrap transplant

## Context

Forge was published to npm (RFC-0543) with two entry points for bringing a project into forge governance: `forge create` (greenfield — creates a new project from scratch) and `forge init` (initialize forge in an existing project). RFC-0544 established `forge create` as the single entry point for project scaffolding. RFC-0545 redesigned the `forge-bootstrap` skill with greenfield and transplant modes — but explicitly excluded code migration from transplant: "transplant is about governance structure, not code migration."

The operator's requirement now is that transplant must perform a **real migration**: copy source code from an external project into the forge project, place it correctly within the turborepo structure, and derive bindings from the source. Additionally, `forge init` as a standalone CLI command creates problems when run in existing projects: it silently skips existing files (`forge.yaml`, `PREFERENCES.md`, `docs/`), unconditionally overwrites `.agents/skills/`, and provides no migration path for the existing code. The operator's decision is to deprecate `forge init` as a standalone CLI command and make `forge create` + `/forge-bootstrap` (transplant mode) the only path for bringing an existing project into forge.

## Problem

- **`forge init` is unsafe for existing projects** — it silently skips existing `forge.yaml`, `PREFERENCES.md`, and `docs/` directories (`packages/forge/src/onboarding/init.ts:89-96`, `:140-141`, `:247-249`), but unconditionally overwrites `.agents/skills/` via `writeFileSync` without existence checks (`:161-164`). An operator running `forge init` in a project with custom skills loses their work.
- **No code migration path** — `forge-bootstrap` transplant mode (RFC-0545) explicitly refuses to copy source code: "Do not copy source code into the forge project unless the operator explicitly asks; transplant is about governance structure, not code migration." An operator with an existing codebase must manually copy code, restructure it for turborepo, update workspace configs, and derive bindings — all by hand.
- **No extensibility for non-Node stacks** — the current transplant mode reads `package.json` / `tsconfig.json` / `Cargo.toml` but has no adapter architecture. Adding support for a new stack (Phaser, Python, Rust) requires modifying the skill itself, not registering a new adapter.
- **`forge init` bypasses the clean-scaffold guarantee** — `forge create` refuses to work in a non-empty directory (`packages/forge/src/onboarding/create.ts:94-109`), ensuring a clean forge structure. `forge init` has no such guard, creating partial/inconsistent forge setups in existing projects.

## Decision

`forge init` is removed as a standalone CLI command — the `forge.init` registration in `forgeCoreModule` is deleted, but `runInit()` remains as an internal primitive called exclusively by `forge.create`. The `forge-bootstrap` skill's transplant mode is redesigned to perform real code migration via a **migration-adapter registry** (`packages/forge/src/migration-adapters/`). Each adapter declares four phases: **detect** (recognize the source stack), **analyze** (derive bindings and placement), **migrate** (copy code into the forge project's turborepo structure), and **post-setup** (install deps, init git). Two adapters ship initially: `node-typescript-pnpm` and `phaser-pnpm`. The adapter places code into `apps/<name>/` and updates `pnpm-workspace.yaml` and `turbo.json`. Forge-specific files (`forge.yaml`, `.agents/`, `docs/rfcs/`, `docs/adrs/`, `PREFERENCES.md`) are protected from overwrite by the source; all other files from the source take priority. Git history is preserved via `git format-patch` + `git am`. The migration-adapter registry is extensible: third-party adapters can be declared in `forge.yaml` under `migrationAdapters`.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — the migration adapter's `analyze` phase fills the same stack-dependent bindings (`typecheck`, `test`, `scopedBuild`) that `forge-bootstrap` greenfield fills interactively. The adapter derives them from the source project's manifest files instead of asking the operator, but the contract is the same: bindings are declared in `forge.yaml`, referenced by skills via `ref()`, never hardcoded.
- **RFC-0374 (forge extraction)** — the migration-adapter registry is portable: adapters live in `packages/forge/src/migration-adapters/`, have no `@gogol/*` imports, and are shipped as part of `@webgogol/forge`.
- **RFC-0391 (portable init)** — `runInit()` remains as the internal config-writing primitive; only its CLI exposure is removed. `forge.create` continues to call it.
- **RFC-0540 (binding defaults)** — the adapter fills the null stack bindings that `forge.init` left; it does not touch forge-CLI defaults.
- **RFC-0542 (self-documenting output)** — `forge.create`'s `nextSteps` already point to `/forge-bootstrap`; the transplant mode's final report includes migration summary (files copied, bindings derived, workspace updated).
- **RFC-0544 (forge create)** — `forge.create` is the only entry point; `forge.init` as a standalone path is gone. The clean-scaffold guarantee extends to all forge adoption.
- **RFC-0545 (forge-bootstrap redesign)** — this RFC amends the transplant mode of RFC-0545. Greenfield mode is unchanged. The transplant mode's step 4 ("Fill") is replaced by the adapter-driven migration flow.

## Design

### Migration-adapter registry

Adapters live in `packages/forge/src/migration-adapters/<adapter-id>/` and implement a common interface:

```ts
interface MigrationAdapter {
  id: string;                          // e.g. "node-typescript-pnpm"
  detect(sourceDir: string): boolean;  // true if source matches this adapter
  analyze(sourceDir: string): AdapterAnalysis;
  migrate(sourceDir: string, targetDir: string, analysis: AdapterAnalysis): MigrationResult;
  postSetup(targetDir: string, analysis: AdapterAnalysis): void;
}

interface AdapterAnalysis {
  stack: string[];                     // e.g. ["typescript", "node"]
  packageManager: string;              // e.g. "pnpm"
  bindings: {                          // derived from source manifests
    typecheck: string | null;
    test: string | null;
    scopedBuild: string | null;
  };
  placement: "apps" | "packages";      // where in turborepo to place code
  appName: string;                     // derived from source package.json name
  excludePatterns: string[];           // node_modules, dist, .next, .cache, .turbo
  gitHistory: boolean;                 // whether to preserve git history
}

interface MigrationResult {
  filesCopied: string[];
  filesSkipped: string[];              // forge-protected files
  conflicts: Conflict[];
  workspaceUpdated: boolean;           // pnpm-workspace.yaml, turbo.json
}

interface Conflict {
  path: string;
  sourceExists: boolean;
  forgeExists: boolean;
  resolution: "forge-wins" | "source-wins";
}
```

### Adapter phases

1. **Detect** — `detect(sourceDir)` returns true if the source directory matches the adapter's stack. `node-typescript-pnpm` checks for `package.json` + `tsconfig.json` + pnpm lockfile. `phaser-pnpm` checks for `package.json` with phaser dependency.
2. **Analyze** — `analyze(sourceDir)` reads manifest files, derives bindings, determines placement (`apps/` for applications, `packages/` for libraries), collects exclude patterns.
3. **Migrate** — `migrate(sourceDir, targetDir, analysis)` copies all files from source to `targetDir/apps/<appName>/`, excluding `node_modules/`, `dist/`, `.next/`, `.cache/`, `.turbo/`, and other build artifacts. Forge-protected files (`forge.yaml`, `.agents/`, `docs/rfcs/`, `docs/adrs/`, `PREFERENCES.md`) are never overwritten. Git history is preserved via `git format-patch` + `git am` (or `git remote add` + `git fetch` if the source is a git repo).
4. **Post-setup** — `postSetup(targetDir, analysis)` updates `pnpm-workspace.yaml` (adds `apps/<appName>`), `turbo.json` (adds workspace to pipeline), runs `pnpm install`, initializes git if needed.

### forge.yaml extension

```yaml
migrationAdapters:
  - id: node-typescript-pnpm           # built-in
  - id: phaser-pnpm                    # built-in
  # Third-party adapters:
  # - id: custom-python-pip
  #   module: "@my-org/forge-migrate-python"
```

### forge-bootstrap transplant flow (redesigned)

Language selection happens first (step 1 of the skill, before mode choice). The transplant-specific steps below assume language is already captured and `PREFERENCES.md` is written.

1. **Source directory** — ask for absolute or relative path to the external codebase. Resolve and validate.
2. **Detect adapter** — iterate the registry, call `detect()` on each. If multiple match, ask the operator. If none match, report and fall back to greenfield interview for bindings.
3. **Analyze** — call `analyze()` on the matched adapter. Present: detected stack, proposed bindings, placement, exclude patterns. Operator confirms or edits.
4. **Migrate** — call `migrate()`. Show conflicts before copying. Operator confirms. Copy code into `apps/<appName>/`, update workspace configs.
5. **Post-setup** — call `postSetup()`. Install deps, init git.
6. **Fill forge.yaml** — write derived bindings into `forge.yaml`.
7. **Emit next steps** — "Create an ADR documenting the migration: /fo-idea-create-adr".

### CLI surface

No new CLI commands. `forge init` is removed from `forgeCoreModule` registration. `forge create` is unchanged. The migration logic lives in the `forge-bootstrap` skill, which calls the adapter functions directly (not via CLI).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/migration-adapters/registry.ts` | Adapter registry (built-in + discovered from forge.yaml) |
| `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts` | Node/TS/pnpm adapter |
| `packages/forge/src/migration-adapters/phaser-pnpm/index.ts` | Phaser/pnpm adapter |
| `packages/forge/src/migration-adapters/types.ts` | MigrationAdapter, AdapterAnalysis, MigrationResult interfaces |
| `packages/forge/src/onboarding/init.ts` | `runInit()` stays; `forge.init` CLI registration removed from `core.module.ts` |
| `packages/forge/os/core/core.module.ts` | Remove `forge.init` registration; keep `forge.create`, `forge.doctor`, etc. |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Transplant mode redesigned with adapter-driven migration |
| `packages/forge/README.md` | Remove `forge init` from Quick start and Lifecycle sections; document `forge create` + `/forge-bootstrap` as the only path |
| `packages/forge/AGENTS.md` | Remove all `forge.init` references (OS modules table, Skills section, forge.yaml section, Stack profiles section, Bindings contract section, Output contract section) and replace with `forge.create` / `runInit()` as appropriate |
| `AGENTS.md` (root) | Update §Forge project configuration (line 30) and §Agent skills (line 424) to reference `forge.create` instead of `forge.init`; update §Package ownership (line 397) to remove `forge.init` onboarding mention |
| `packages/forge/src/config/forge-config.ts` | Update error messages at lines 262, 280 to say "Run 'forge create' to create project configuration" instead of "Run 'forge init'" |
| `packages/forge/src/onboarding/upgrade.ts` | Update MODULE_CONTRACT comment (line 8) and error/nextSteps messages (lines 211-213) to reference `forge create` instead of `forge init` |
| `packages/forge/bin/cli.ts` | Remove `forge.init` from IDE recommendation condition (line 293) — keep `forge.create` only |
| `packages/forge/src/onboarding/doctor.ts` | Update all 9 "run 'forge init'" suggestion messages to "run 'forge create'" |

### Output format

The skill is interactive (agent chat); no `--json` output. The skill's final message is a migration summary:

```text
Migration complete.
  Mode: transplant
  Adapter: node-typescript-pnpm
  Source: /path/to/existing-project
  Placement: apps/existing-project/
  Files copied: 142
  Files skipped: 5 (forge-protected)
  Conflicts: 0
  Git history: preserved (312 commits)
  Workspace: pnpm-workspace.yaml updated, turbo.json updated
  Bindings: typecheck=tsc --noEmit, test=vitest, scopedBuild=turbo run build
  Preferences: PREFERENCES.md written (aiLanguage=ru, documentationLanguage=en)
Next steps:
  - Create an ADR documenting the migration: /fo-idea-create-adr
  - Run forge doctor to verify setup
```

### Failure modes

- No adapter matches the source directory → skill reports "no migration adapter detected for this project type" and falls back to greenfield interview for bindings (no code migration).
- Multiple adapters match → skill asks the operator to choose.
- Source directory unreadable → skill reports and asks for a different path.
- Source directory is inside the forge project → skill refuses: "source must be outside the forge project".
- File conflict (source and forge both have the same non-protected file) → skill shows the conflict and asks the operator to choose (source-wins or forge-wins).
- Git history preservation fails (source is not a git repo) → skill warns and continues without git history.
- Post-setup `pnpm install` fails → skill reports the error; the operator can fix and re-run `pnpm install` manually.
- Migration interrupted mid-copy (process crash, agent termination) → `migrate()` is idempotent: re-running skips files that already exist at the target with matching content. The operator can also delete `apps/<appName>/` and re-run for a clean migration.
- Concurrent execution (two agents running `forge-bootstrap` transplant on the same forge project simultaneously) → the skill does not lock `apps/<appName>/`; concurrent writes may conflict. The operator should not run two transplant operations on the same project in parallel.

## Rollout

1. **Remove `forge.init` CLI registration** — delete the `forge.init` entry from `forgeCoreModule` in `packages/forge/os/core/core.module.ts`. Keep `runInit()` in `src/onboarding/init.ts` as an internal function. `forge.create` continues to call `runInit()` directly.
2. **Create migration-adapter infrastructure** — `packages/forge/src/migration-adapters/types.ts` (interfaces), `registry.ts` (registry with built-in + discovered adapters).
3. **Implement `node-typescript-pnpm` adapter** — detect via `package.json` + `tsconfig.json` + pnpm lockfile. Analyze: derive `typecheck` from `scripts.build:check` or `tsc --noEmit`, `test` from `scripts.test`, `scopedBuild` from `scripts.build`. Placement: `apps/<name>/`.
4. **Implement `phaser-pnpm` adapter** — detect via `package.json` with `phaser` dependency. Analyze: derive bindings from scripts. Placement: `apps/<name>/`.
5. **Redesign `forge-bootstrap` SKILL.md transplant mode** — replace steps 4-7 of the current transplant flow with the adapter-driven migration flow (detect → analyze → migrate → post-setup).
6. **Update `forge.yaml` schema** — add optional `migrationAdapters` field to `forgeConfigSchema`.
7. **Update documentation** — replace all `forge.init` references with `forge.create` / `runInit()` as appropriate across: `packages/forge/README.md` (Quick start, Lifecycle), `packages/forge/AGENTS.md` (OS modules table, Skills, forge.yaml, Stack profiles, Bindings, Output contract), root `AGENTS.md` (§Forge project configuration, §Package ownership, §Agent skills), `packages/forge/src/config/forge-config.ts` (error messages), `packages/forge/src/onboarding/upgrade.ts` (comment, error/nextSteps messages), `packages/forge/bin/cli.ts` (IDE recommendation condition).
8. **Update `forge.doctor`** — replace all 9 "run 'forge init'" suggestion messages in `packages/forge/src/onboarding/doctor.ts` with "run 'forge create'"; add a check for migration-adapter registry health (validates `migrationAdapters` config if present).
9. **Unit tests** — adapter detect/analyze/migrate/post-setup, registry discovery, conflict resolution, forge-protected file enforcement.
10. **Publish as patch version** — `versionBump: patch` because the `forge.yaml` schema change is additive (optional `migrationAdapters` field with default empty array) and the `forge.init` CLI removal is a layer A (platform package) surface change, not a layer B (data contract) break. No migrator is needed. Existing `forge.yaml` files without `migrationAdapters` pass validation unchanged.

## Alternatives considered

- **Keep `forge init` but add non-empty-directory guard** — rejected: `forge init` in an existing project still silently skips files and overwrites skills. The guard would make it refuse in the exact scenario it was designed for. The operator's decision is to remove the standalone path entirely.
- **Universal migrator with configurable rules (no adapters)** — rejected: a single universal migrator cannot know how to derive bindings for different stacks (Node/TS vs Phaser vs Python). The adapter architecture allows each stack to encapsulate its own detection, analysis, and migration logic. The registry is extensible for future stacks without modifying a monolithic migrator.
- **External npm packages for adapters** — rejected for initial shipment: adds package management complexity for the first two adapters. Built-in adapters ship with `@webgogol/forge`; the `migrationAdapters` config field in `forge.yaml` supports external adapters via `module:` for future expansion.
- **Make `forge.create` interactive with migration** — rejected: `forge.create` is non-interactive (RFC-0544). The migration interview belongs in the `forge-bootstrap` skill, which is the interactive layer.

## Risks

- **Breaking change for `forge init` users** — npm consumers who scripted `forge init` in their workflows will break. Mitigation: `versionBump: minor` signals the breaking change; README documents `forge create` + `/forge-bootstrap` as the replacement. The WGogol platform itself does not use `forge init` (it uses `forge.create` internally).
- **Adapter false positives** — `detect()` might match the wrong adapter for a project that has mixed stacks. Mitigation: the operator confirms the detected adapter before migration proceeds; multiple matches trigger an explicit choice.
- **Large project migration performance** — copying thousands of files may be slow. Mitigation: exclude patterns filter `node_modules/`, `dist/`, and other artifacts; the skill shows progress during migration. For projects with 10k+ source files, the copy phase may take several minutes; this is acceptable for a one-time migration operation.
- **Git history preservation edge cases** — `git format-patch` + `git am` may fail for repos with complex history (submodules, replace objects). Mitigation: if git history preservation fails, the skill warns and continues without it; the operator can manually import history later.
- **Agent misinterpretation** — an agent might run `forge init` expecting it to work, or skip the migration step. Mitigation: `forge init` is no longer registered; `forge --help` will not list it. The skill's guardrails refuse to proceed without a matched adapter.
- **Schema extension risk** — adding `migrationAdapters` to `forgeConfigSchema` must not break existing `forge.yaml` files. Mitigation: the field is optional with a default of empty array; `forge.doctor` validates it.

## Acceptance criteria

- [x] `forge.init` is removed from `forgeCoreModule` registration in `packages/forge/os/core/core.module.ts`; `runInit()` remains in `packages/forge/src/onboarding/init.ts` as an internal function called by `forge.create` (evidence: core.module.ts commit 558b0457c removes initWrapper and forge.init registration; runInit still imported by create.ts)
- [x] `MigrationAdapter`, `AdapterAnalysis`, `MigrationResult`, and `Conflict` interfaces are defined in `packages/forge/src/migration-adapters/types.ts` (evidence: commit 905822b97 creates types.ts with all four interfaces plus FORGE_PROTECTED_PATHS and DEFAULT_EXCLUDE_PATTERNS)
- [x] Migration-adapter registry exists in `packages/forge/src/migration-adapters/registry.ts` with built-in adapter discovery and `forge.yaml` `migrationAdapters` support (evidence: commit 905822b97 creates registry.ts with getAdapters, detectAdapter, detectAdapters functions; ForgeConfig migrationAdapters field consumed)
- [x] `node-typescript-pnpm` adapter is implemented in `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts` with detect, analyze, migrate, and postSetup phases (evidence: commit 905822b97 creates adapter with all four phases; commit c08048131 fixes isForgeProtected and copyDirectory rootSrc tracking)
- [x] `phaser-pnpm` adapter is implemented in `packages/forge/src/migration-adapters/phaser-pnpm/index.ts` with detect, analyze, migrate, and postSetup phases (evidence: commit 905822b97 creates adapter with all four phases; commit c08048131 applies same isForgeProtected and rootSrc fixes)
- [x] `forge-bootstrap` SKILL.md transplant mode is redesigned with adapter-driven migration flow (detect → analyze → migrate → post-setup) (evidence: commit 6b0917646 replaces steps 4-7 with adapter-driven flow including detect/analyze/migrate/postSetup phases and expanded failure modes)
- [x] Forge-protected files (`forge.yaml`, `.agents/`, `docs/rfcs/`, `docs/adrs/`, `PREFERENCES.md`) are never overwritten during migration (evidence: FORGE_PROTECTED_PATHS constant in types.ts; isForgeProtected checks nested paths in both adapters; unit test 'migrate skips forge-protected files' verifies skip behavior)
- [x] Migration places code into `apps/<appName>/` and updates `pnpm-workspace.yaml` and `turbo.json` (evidence: both adapters' migrate() functions compute destDir as apps/<appName>/, update pnpm-workspace.yaml with new entry, and touch turbo.json; unit test 'migrate updates pnpm-workspace.yaml' verifies)
- [x] `forge.yaml` schema includes optional `migrationAdapters` field; existing `forge.yaml` files without it pass validation (evidence: forgeMigrationAdapterSchema and migrationAdapters optional field added to forgeConfigSchema in forge-config.ts commit 905822b97; 255 tests pass including forge-config tests)
- [x] `packages/forge/README.md` Quick start and Lifecycle sections use `forge create` + `/forge-bootstrap` only; no `forge init` (evidence: commit 6b0917646 removes forge init from Quick start code block and Lifecycle step 1)
- [x] `packages/forge/AGENTS.md` has zero `forge.init` references (OS modules table, Skills, forge.yaml, Stack profiles, Bindings, Output contract sections all updated) (evidence: commit 6b0917646 updates OS modules table, Skills sync, knowledge sync, skillPacks sync, forge.yaml creation, Stack profiles, Bindings defaults, IDE recommendation, Lifecycle commands)
- [x] Root `AGENTS.md` §Forge project configuration, §Package ownership, and §Agent skills reference `forge.create` instead of `forge.init` (evidence: commit 6b0917646 updates all three sections in root AGENTS.md)
- [x] `packages/forge/src/config/forge-config.ts` error messages say "Run 'forge create'" instead of "Run 'forge init'" (evidence: commit 905822b97 updates both loadForgeConfig error messages)
- [x] `packages/forge/src/onboarding/upgrade.ts` comment and error/nextSteps messages reference `forge create` instead of `forge init` (evidence: commit 558b0457c updates MODULE_CONTRACT non-goals comment, nextSteps action, and summary message)
- [x] `packages/forge/bin/cli.ts` IDE recommendation condition no longer includes `forge.init` (evidence: commit 558b0457c changes condition from `forge.init || forge.create` to `forge.create` only)
- [x] `forge.doctor` does not suggest `forge init` in any check messages — all suggestions say "run 'forge create'" (evidence: commit 558b0457c replaces all 9 'forge init' suggestion messages in doctor.ts with 'forge create')
- [x] Unit tests cover adapter detect/analyze/migrate/postSetup, registry discovery, conflict resolution, and forge-protected file enforcement (evidence: commit c08048131 creates migration-adapters.test.ts with 15 tests covering all phases, registry, protected files, exclude patterns, workspace updates; all 255 forge tests pass)
- [x] `forge.skill.validate` passes on the redesigned `forge-bootstrap` skill (evidence: forge.skill.validate --json returns status pass with 0 violations)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0546 --json returns status pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT re-add `forge.init` as a CLI command — it is removed permanently. `runInit()` is internal only.
- Agents MUST NOT overwrite forge-protected files (`forge.yaml`, `.agents/`, `docs/rfcs/`, `docs/adrs/`, `PREFERENCES.md`) during migration, even if the source contains files with the same names.
- Agents MUST NOT modify the transplant source directory — it is read-only during migration.
- Agents MUST NOT add migration adapters for stacks not listed in this RFC (Python, Rust, Go, Java) without a follow-up RFC.
- Agents MUST NOT skip the operator confirmation step before migration — the adapter's `analyze()` results must be presented and confirmed.
- Agents MUST preserve git history via `git format-patch` + `git am` when the source is a git repo; if preservation fails, warn and continue.
- Agents MUST update `pnpm-workspace.yaml` and `turbo.json` when placing code into `apps/<appName>/`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0546 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
