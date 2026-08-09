---
id: RFC-0770
title: "Werkstatt plugin contract and stack profile binding"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt: 2026-08-09
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0769
  - RFC-0392
  - DNA-54
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
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
  added:
    - werkstatt.plugin.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt  # engine package created by RFC-0772
successSignals:
  - "werkstatt.plugin.validate passes in this workshop with the site plugin registered"
  - "Engine package typechecks with zero plugin imports"
nonGoals:
  - "No physical package consolidation — that is RFC-0772"
  - "No plugin implementations — those are RFC-0774..0778"
  - "No multi-plugin workshops"
  - "No Compass XML sync — docs/*.xml synchronization is handled by RFC-0772 when the engine package is created"
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

# RFC-0770: Werkstatt plugin contract and stack profile binding

## Context

Charter RFC-0769 splits the Werkstatt into a stack-agnostic engine (`@warpgogol/werkstatt`) and stack plugins (`@warpgogol/werkstatt-site|game|video`). The engine must never import a plugin (DNA-64). Today the composition point is `tools/kernel.config.ts` with ~30 `moduleLoaders` entries that dynamically import from `@warpgogol/site-kernel*` and `@warpgogol/forge` — a working but informal mechanism. Forge already ships the binding key: stack profiles (`forge/stack-profile@1`, `packages/forge/src/profiles/stack-profile.ts`) with ids `astro-typescript-turborepo`, `phaser-turborepo`, `editframe`.

## Problem

There is no contract answering: what exactly must a stack plugin provide, how does the engine discover it, and how is the forge stack profile bound to the plugin? Without it:

- `site-kernel-handoff` statically imports `site-kernel-checks`/`codegen`/`onboarding`/`astro` (e.g. `mission.materialize` calls `runGenerate*`, Axiom checks) — the inversion required by DNA-64 has no seam to invert through.
- Engine commands like `mission.materialize`, `leitstand.dev-deploy`, `release.prepare` hardcode site-stack steps (Astro build, Axiom gate, surface generation) instead of delegating to plugin hooks.
- A game or video workshop has no way to supply its own build/check/deploy behavior.

## Decision

The engine gains a **plugin contract** (`werkstatt/plugin@1`): a typed interface that a stack plugin implements and registers, plus a **profile binding** rule: `forge.yaml` `profile` field (RFC-0643) resolves to a forge stack profile id, and the workshop's `tools/kernel.config.ts` composes the engine with the plugin whose `profileId` matches.

Key properties:

1. **One plugin per workshop.** The engine refuses to start with zero or multiple registered stack plugins.
2. **Hook-based inversion.** Every place where the engine currently calls site-specific code becomes a named hook on the plugin interface (build, check gate, codegen, onboarding scaffold, content handling, deploy adapters, path conventions).
3. **Plugins extend, never patch.** A plugin registers kernel modules, commands, pipelines, validators, and deploy adapters through the engine's registry API; it cannot monkey-patch engine internals.
4. **Profile binding is data.** The plugin declares `profileId` matching a forge stack profile id; `forge.doctor` and the engine cross-check that `forge.yaml` stack, the installed plugin, and the profile agree.

## Architectural fit

- **DNA-1 (monorepo boundary)** — the plugin contract extends the packages boundary: the engine package (`@warpgogol/werkstatt`) is shared reusable logic in `packages/*`, and the plugin contract ensures it never imports site-specific code, preserving the separation that DNA-1 establishes.
- **DNA-64 (engine/plugin/workshop boundary, RFC-0769)** — this RFC is the contract that makes the boundary enforceable. DNA-64 is not yet in `satisfies[]` because RFC-0769 is still `draft` and the invariant has not been appended to `docs/architecture-dna.md`. Once RFC-0769 is accepted and DNA-64 is registered, this RFC's `satisfies[]` must be amended to include DNA-64.
- **DNA-46..49 (missions, materialization, releases, Leitstand)** — their commands become plugin-hook consumers; semantics unchanged.
- **DNA-54 (forge bindings)** — same philosophy: stack values are data (profile + plugin), not engine code.
- **Site OS operator model** — plugins register modules through the same `defineKernelConfig`/`moduleLoaders` machinery that `tools/kernel.config.ts` uses today; no parallel registration path.

## Design

### TypeScript contracts

```ts
// @warpgogol/werkstatt — engine side (werkstatt/plugin@1)
export interface WerkstattPlugin {
  schema: "werkstatt/plugin@1";
  id: string;                       // "werkstatt-site" | "werkstatt-game" | "werkstatt-video"
  profileId: string;                // forge stack profile id, e.g. "astro-typescript-turborepo"
  /** Kernel modules the plugin contributes (validators, codegen, content, onboarding). */
  moduleLoaders: Record<string, () => Promise<KernelModule>>;
  /** Named pipelines the plugin owns or extends (e.g. build.prepare steps). */
  pipelines?: Record<string, KernelPipelineStep[]>;
  /** Deploy adapters keyed by adapter id (e.g. "cloudflare-workers", "github-pages", "local-render"). */
  deployAdapters?: Record<string, DeployAdapterFactory>;
  /** Lifecycle hooks the engine calls at fixed points. All optional; engine has neutral defaults. */
  hooks?: WerkstattPluginHooks;
  /** Path conventions for project workspaces (content dir, dist dir, entry points). */
  paths: StackPathConventions;
  /** Stack invariants surfaced to agents (AGENTS.md generation, doctor checks). */
  invariants?: StackInvariant[];
}

export interface WerkstattPluginHooks {
  /** mission.materialize: scaffold/regenerate the workpiece after authored data injection. */
  materialize?: (ctx: PluginHookContext) => Promise<HookResult>;
  /** Build the workpiece (replaces the hardcoded astro/pnpm build call). */
  build?: (ctx: PluginHookContext) => Promise<HookResult>;
  /** Quality gate after build (site: Axiom; game: engine-specific checks; video: render verify). */
  checkGate?: (ctx: PluginHookContext & { baseUrl?: string }) => Promise<HookResult>;
  /** release.prepare: produce behavior snapshots / stack-specific release evidence. */
  releaseEvidence?: (ctx: PluginHookContext) => Promise<HookResult>;
  /** onboarding.scaffold: create a new project workspace of this stack. */
  scaffoldProject?: (ctx: PluginHookContext & { projectId: string }) => Promise<HookResult>;
}

export interface PluginRegistry {
  register(plugin: WerkstattPlugin): void;
  /** Throws if zero or more than one stack plugin is registered. */
  resolve(): WerkstattPlugin;
}
```

Exact `KernelModule`, `KernelPipelineStep`, `DeployAdapterFactory` shapes are the existing kernel types, re-homed into the engine by RFC-0771/0772. The hook list is **closed at five hooks** (materialize, build, checkGate, releaseEvidence, scaffoldProject). Adding a new hook requires a superseding RFC, not an amendment. If RFC-0772's inversion of `mission-materialize.ts` and `leitstand-commands.ts` reveals a missing hook, a superseding RFC must be created.

The `pipelines?` field is retained because plugins may need to contribute or extend workspace-level pipelines (e.g. `build.prepare` steps, `packages.check` extensions). The current `tools/kernel.config.ts` has only two workspace pipelines (`icons.generate`, `packages.check`), but the site plugin's build/check pipeline steps are currently hardcoded in engine commands — the inversion in RFC-0772 will move them into plugin-contributed pipeline steps.

### Profile binding

| Layer | Key | Checked by |
| --- | --- | --- |
| `forge.yaml` `profile` field (RFC-0643) | resolves to profile id | `forge.doctor` (existing) |
| forge profile YAML | `id` (e.g. `phaser-turborepo`) | `profile.validate` (existing) |
| plugin package | `profileId` | new `werkstatt.plugin.validate` |
| workshop `tools/kernel.config.ts` | imports engine + one plugin | new `werkstatt.plugin.validate` |

Note: `forge.yaml` `project.stack` is a technology array (e.g. `[typescript, astro, turborepo]`), not a profile id. Profile loading uses the separate `profile` field introduced by RFC-0643. The current workshop `forge.yaml` does not yet have a `profile` field — it will be added during the wave 4 migration (RFC-0776).

### CLI surface

```sh
pnpm exec werkstatt run werkstatt.plugin.validate --json
```

Workspace scope. Verifies: exactly one plugin registered; plugin `profileId` matches the detected forge stack profile; all plugin moduleLoaders resolve; deploy adapters referenced in `systems/registry.yaml` exist in the engine or plugin.

### Output format

```json
{
  "command": "werkstatt.plugin.validate",
  "status": "pass",
  "plugin": { "id": "werkstatt-site", "profileId": "astro-typescript-turborepo" },
  "violations": []
}
```

### Failure modes

- Zero or multiple stack plugins registered → `PLUGIN-01`.
- `profileId` mismatch with `forge.yaml` `profile` field → `PLUGIN-02`.
- Unresolvable module loader → `PLUGIN-03`.
- Deploy adapter referenced in registry but not provided → `PLUGIN-04`.
- `tools/kernel.config.ts` not found → `PLUGIN-05`.

**Transition behavior:** Until the workshop migrates to the engine+plugin model (wave 4, RFC-0776), `PLUGIN-01` (zero plugins) emits a **warning**, not an error. This allows `werkstatt.plugin.validate` to join `packages.check` immediately without breaking CI. After wave 4, all failure modes are enforce (exit 1).

## Rollout

- The contract types land in the engine package (RFC-0772) before any plugin exists; the site plugin (RFC-0774/0775) is the first implementer and validates the contract shape.
- `werkstatt.plugin.validate` joins `packages.check` immediately in **warn-only** mode: `PLUGIN-01` (zero plugins) is a warning, not an error. This workshop has no plugin until wave 4 (RFC-0776).
- After wave 4 migration (RFC-0776), the validator switches to **enforce** mode: all failure modes return exit 1. The `forge.yaml` `profile` field is set during migration.
- Game/video plugins (RFC-0777/0778) implement the same contract; any contract gap found there is fixed forward (no versioned `@2` unless breaking).

### Performance notes

`werkstatt.plugin.validate` performs: (1) dynamic import of each registered module loader (O(n) where n = module count, typically ~30), (2) one `forge.yaml` read + profile lookup, (3) one `systems/registry.yaml` read for deploy adapter cross-check. Expected duration: < 500ms for a workshop with 30 modules and a single registry entry. No recursive file scans.

## Alternatives considered

- **Peer-dependency imports (engine imports plugin by convention name).** Rejected: still a static coupling; breaks DNA-64 and makes the engine untestable without a plugin.
- **Config-only plugins (pure YAML, no code).** Rejected: validators, codegen, and deploy adapters are code; YAML cannot express them. Profiles stay data; plugins stay code.
- **Multiple plugins per workshop (site + video in one).** Rejected for now: one workshop = one stack keeps mission/release semantics unambiguous. A future RFC may relax this.

## Risks

- **Hook granularity.** Too coarse → plugins reimplement engine logic inside hooks; too fine → contract churn. Mitigation: the hook list is closed at five; if RFC-0772's inversion reveals a missing hook, a superseding RFC is required — this prevents silent contract drift.
- **Hidden site assumptions.** Engine code may retain Astro-isms (e.g. `dist/client` layout). RFC-0772 must sweep for such literals and move them into `StackPathConventions`.
- **Missing `tools/kernel.config.ts`.** A new consumer workshop may not have this file before `onboarding.scaffold` runs. `PLUGIN-05` handles this case with a clear error message directing the operator to run onboarding first.

## Acceptance criteria

- [x] `WerkstattPlugin`, `WerkstattPluginHooks`, `PluginRegistry` types defined in the engine package (`packages/werkstatt`) (evidence: `packages/werkstatt/src/plugin-contract.ts`, `packages/werkstatt/src/plugin-registry.ts`)
- [x] `werkstatt.plugin.validate` registered (workspace scope) with documented `--json` output (evidence: `packages/werkstatt/os/werkstatt-plugin.module.ts`, `tools/kernel.config.ts` line 153-154, `docs/command-manifest.generated.yaml` entry `werkstatt.plugin.validate`)
- [x] PLUGIN-01..05 failure modes covered by unit tests (evidence: `packages/werkstatt/src/validate/plugin-validate.test.ts` — 9 tests, all passing)
- [x] Profile binding cross-check implemented (plugin `profileId` ↔ `forge.yaml` `profile` field) (evidence: `packages/werkstatt/src/validate/plugin-validate.ts` PLUGIN-02 check, `readForgeProfile` function)
- [x] Warn-only behavior for PLUGIN-01 implemented and tested (transition period) (evidence: `packages/werkstatt/src/validate/plugin-validate.ts` lines 88-98, test `PLUGIN-01 (warn-only)` — exit 0, severity warning)
- [x] Root `AGENTS.md` documents the plugin contract for agents (evidence: `AGENTS.md` section `Werkstatt plugin contract (RFC-0770)` lines 24-34)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0770` — exit 0, `All 1 RFC(s) passed validation`)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
