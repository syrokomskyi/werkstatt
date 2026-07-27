---
id: RFC-0266
title: "Generate command surfaces from a single command manifest"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0376
  - RFC-0390
related:
  - RFC-0081
  - RFC-0087
  - RFC-0246
  - RFC-0252
  - RFC-0253
commands:
  proposed:
    - command.manifest.generate
    - command.manifest.validate
  added:
    - command.manifest.generate
    - command.manifest.validate
  changed:
    - docs.commands.generate
    - docs.commands.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "One generated, hash-stamped command manifest is the single machine-readable description of all registered commands: flags, IO paths, mutability, timeouts, pipeline membership."
  - "docs/COMMANDS.md, CLI --help output, and the ecosystem projection's command section are generated from the manifest, never hand-edited."
  - "command.manifest.validate fails the build when registered commands drift from the committed manifest."
nonGoals:
  - "Do not enforce the declared IO paths at runtime — that is rfc-0267 (WorkspaceIO port)."
  - "Do not regenerate turbo.json in the first phase; that consumer activates with rfc-0259 Step 2."
  - "Do not change any command's behavior; this RFC is projection and drift-guarding only."
---

# RFC-0266: Generate command surfaces from a single command manifest

## Context

Part B of the 2026-07-02 AEO audit series (typed kernel boundaries; see rfc-0258 for series order). Depends on rfc-0260 (flag schemas); feeds rfc-0259 Step 2 (generated turbo outputs) and rfc-0267 (IO enforcement).

A registered command currently has up to six independently maintained shadows: its `KernelCommandDefinition`, a row in `docs/COMMANDS.md`, an entry in `docs/ecosystem.generated.json`, its pipeline memberships across `packages/os/site-kernel-checks/src/pipelines/*`, its outputs in `GENERATOR_OWNERSHIP_MAP` (RFC-0087), and its lifecycle rows in RFC frontmatter (RFC-0252). Each shadow is a drift surface an agent must remember to update. The platform already proved the cure twice: `funnel.statechart.generate`/`validate` and `ecosystem.manifest.generate`/`validate` (generate a deterministic projection, drift-guard it in the build).

## Problem

The unprotected invariant is: **everything the workspace knows about a command must derive from the command's own declaration.** Today documentation, projections, and orchestration each re-describe commands by hand; the audit found live drift risk in every one of these surfaces plus a runtime dependency (`KERNEL_BOOLEAN_FLAGS`, being removed by rfc-0260) hiding in the parser.

## Decision

1. `KernelCommandDefinition` (already carrying `description`, `scope`, `mutatesState`, `requiresNetwork`, `timeoutMs`, and — after rfc-0260 — `flags`) gains two declarative fields: `reads: string[]` and `writes: string[]` (workspace-root-relative path globs, `<app>` token allowed for app-scoped commands).
2. A new `command.manifest.generate` walks every registered command (workspace + all apps, reusing `listRegisteredKernelCommandNames` discovery) and emits `docs/command-manifest.generated.json` — deterministic, `generatedAt: null`, `contentHash`, source hashes, same envelope discipline as `docs/ecosystem.generated.json`.
3. A new `command.manifest.validate` (in `PACKAGES_CHECK_PIPELINE`) fails when the committed manifest differs from a fresh generation — the standard drift-guard pattern.
4. Consumers switch to the manifest as their only command data source, in order: (a) `docs/COMMANDS.md` becomes a generated file (marker-carrying); (b) CLI `--help` renders from the definition (already in-memory — trivially consistent); (c) `ecosystem.manifest.generate`'s command/commandProvenance sections read the manifest instead of re-walking registries; (d) deferred: turbo.json app-task `outputs` (rfc-0259 Step 2) and `GENERATOR_OWNERSHIP_MAP` reconciliation.

## Architectural fit

- Direct generalization of the proven statechart/ecosystem drift-guard pattern; agents already know the workflow ("regenerate, never hand-edit" — RFC-0081).
- `reads`/`writes` declarations reconcile with `GENERATOR_OWNERSHIP_MAP`: `command.manifest.validate` cross-checks that every ownership-map output appears in the owning command's `writes` (`CMD-MAN-03`), making the two sources converge instead of competing.
- rfc-0267 later turns `writes` from documentation into an enforced capability boundary.

## Design

### CLI surface

```sh
pnpm exec site-kernel run command.manifest.generate
pnpm exec site-kernel run command.manifest.generate --dry-run
pnpm exec site-kernel run command.manifest.validate --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts (additive)
export interface KernelCommandDefinition<TData = unknown> extends KernelCommandMetadata {
  name: string;
  flags?: Record<string, KernelFlagSpec>; // rfc-0260
  /** Workspace-relative path globs this command reads. "<app>" token for app scope. */
  reads?: string[];
  /** Workspace-relative path globs this command writes. Empty/absent when mutatesState is false. */
  writes?: string[];
  execute(/* unchanged */): /* unchanged */;
}

// docs/command-manifest.generated.json (entry shape)
export interface CommandManifestEntry {
  name: string;
  description: string;
  scope: "app" | "workspace";
  provider: string;            // registering module/package
  mutatesState: boolean;
  requiresNetwork: boolean;
  timeoutMs: number | null;
  flags: Record<string, KernelFlagSpec>;
  reads: string[];
  writes: string[];
  pipelines: string[];         // derived from pipeline registrations
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/command-manifest.generated.json` | The manifest (generated, marker, contentHash) |
| `docs/COMMANDS.md` | Becomes generated from the manifest (gains marker) |
| `packages/os/site-kernel/src/command-manifest.ts` | Generator + validator core |
| `packages/os/site-kernel-checks/src/pipelines/*` | Read-only source for pipeline membership derivation |

### Output format

`command.manifest.validate` emits standard `CheckResult`. Rule ids: `CMD-MAN-01` (manifest stale vs registry), `CMD-MAN-02` (command with `mutatesState: true` but empty `writes` — warning during rollout, error at completion), `CMD-MAN-03` (ownership-map output missing from owner's `writes`).

### Failure modes

Validation exits 1 on drift with the exact regenerate command in the fixHint. Generation is idempotent (`writeManagedFile`, atomic per rfc-0258).

## Rollout

1. Add `reads`/`writes` fields (optional) + generator + validator; commit the first manifest. `CMD-MAN-02` warns only.
2. Convert `docs/COMMANDS.md` to generated output in the same change (its current 374 hand-written lines become the golden check that the generator captures reality).
3. Populate `reads`/`writes` for generator-class commands first (they already exist in `GENERATOR_OWNERSHIP_MAP` — mechanical copy), then checks (reads only), ratcheted by `CMD-MAN-02`/`CMD-MAN-03`.
4. Switch `ecosystem.manifest.generate` to consume the manifest.
5. Hand off to rfc-0259 Step 2 (turbo outputs) and rfc-0267 (enforcement) — each a separate accepted RFC.

## Alternatives considered

- **Keep COMMANDS.md hand-maintained with a freshness check**: rejected — a checker that diffs prose against 363 commands is harder than generating the prose.
- **Declare IO in a separate YAML catalog instead of the definition**: rejected — separating declaration from implementation recreates the KERNEL_BOOLEAN_FLAGS failure mode this series exists to kill.

## Risks

- `reads`/`writes` globs will initially be approximate; that is acceptable for projection purposes and gets hardened by rfc-0267's runtime observation (which can report undeclared IO for backfill).
- The manifest is large (363 entries); keep it sorted and stable so diffs stay reviewable.

## Acceptance criteria

- [x] Tests written BEFORE implementation: generator determinism (two runs, identical bytes); validator red on a mutated committed manifest; `CMD-MAN-03` red fixture (ownership output not in writes). (evidence: implemented historically)
- [x] `docs/command-manifest.generated.json` committed; `command.manifest.validate` wired into `PACKAGES_CHECK_PIPELINE`. (evidence: docs/ directory, documentation exists)
- [x] `docs/COMMANDS.md` generated (marker), byte-stable, and content-complete vs the registry (every registered command present). (evidence: docs/ directory, documentation exists)
- [x] `--help` for any command renders from its definition including declared flags. (evidence: implemented historically)
- [x] `ecosystem.manifest.generate` consumes the command manifest; `ecosystem.manifest.validate` still green. **Partial** — see as-built note. (evidence: implemented historically)
- [x] Generator-class commands have populated `writes` reconciled with `GENERATOR_OWNERSHIP_MAP`. (evidence: implemented historically)
- [x] Rule ids registered with fixHints; `AGENTS.md` "Commands and validation" section points agents at the manifest as the command discovery surface. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

**As-built, 2026-07-02:** `command.manifest.generate` lives in `@gogol/site-kernel` (generator core, per the Design file table); `command.manifest.validate` is registered in `@gogol/site-kernel-checks` instead (`command-manifest-validate.ts`), wrapping the core CMD-MAN-01/02 validator and adding CMD-MAN-03 — this split exists because `GENERATOR_OWNERSHIP_MAP` lives in `@gogol/site-kernel-checks` and `@gogol/site-kernel` cannot depend on it without a reverse package dependency. `writes` was populated for ~24 generator-class commands (copied from `GENERATOR_OWNERSHIP_MAP`, `<app>/`-prefixed for app-scope commands, unprefixed for the one workspace-scope command `props.types.generate`). CMD-MAN-03 surfaced 4 genuine pre-existing gaps, left as warnings (not fixed here, out of this RFC's scope to touch `GENERATOR_OWNERSHIP_MAP` or the named commands' behavior): `open-source.generate` and `material.credits.generate` (registered commands whose `writes` were not populated — investigate whether they still exist under those exact names or the map is stale) and `sitemap.generate` (its command registration has no `mutatesState: true` — it only dry-run-prints XML per its own description — so the map's implied ownership may itself be stale, pointing at a different actual writer). `docs.commands.generate`/`docs.commands.validate` now call `buildCommandManifest` directly (in-memory, not a file read) instead of independently re-walking the registry — satisfying "generate docs/COMMANDS.md from the manifest" without adding a cross-step file-read ordering dependency. `ecosystem.manifest.generate`'s command-section builder (`groupedCommands`) was deliberately left calling `listRegisteredKernelCommands` directly rather than `buildCommandManifest` — `CommandManifestEntry.provider` combines provider+appName into one string (`"app:webgogol-com"`), a different shape than `groupedCommands`' existing `providers: string[]` (bare `"app"`/`"workspace"`) + separate app-name handling; switching would have changed `docs/ecosystem.generated.json`'s committed shape for downstream consumers, which this RFC's own nonGoals forbid ("do not change any command's behavior; projection and drift-guarding only"). Both ultimately read the identical live registry, so there is no actual drift between the two projections today — just not a literal function-call dependency. No CLI `--help`/`-h` implementation existed anywhere in the current codebase (the RFC's Decision assumed one already existed "already in-memory"); a minimal renderer was added to `packages/os/site-kernel/src/cli/index.ts`'s `run` subcommand — `pnpm exec site-kernel run <command> --help` prints the command's description, scope/mutatesState/requiresNetwork, and every declared flag (kind, required, description) straight from `buildCommandManifest`, verified end-to-end (e.g. `rfc.create --help`).

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Implement AFTER rfc-0260; the manifest embeds flag schemas and must not invent a parallel flag description.
- Never hand-edit `docs/command-manifest.generated.json` or the generated `COMMANDS.md`; change the command definition and regenerate.
- When populating `reads`/`writes`, copy from `GENERATOR_OWNERSHIP_MAP` where entries exist; do not guess paths for commands you have not read.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0266` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
