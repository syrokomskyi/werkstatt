---
id: RFC-0540
title: "Autonomous-mode binding defaults in forge.init"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
amendedBy: []
related:
  - RFC-0391
  - RFC-0393
  - RFC-0539
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
  changed:
    - forge.init
    - forge.doctor
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "A freshly bootstrapped external project runs fo-idea-create-rfc end-to-end without a single degraded binding step"
  - "Only bindings forge genuinely cannot know (stack-dependent) remain null after forge.init"
nonGoals:
  - "Filling stack-dependent bindings (typecheck, test, scopedBuild) — the bootstrap skill fills them in dialogue (see the bootstrap redesign RFC)"
  - "Changing binding values in this monorepo's forge.yaml — WGogol keeps site-kernel-backed bindings"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0540: Autonomous-mode binding defaults in forge.init

## Context

RFC-0393 introduced the bindings contract: fo-skills reference project-specific commands via `ref(forge.yaml bindings.commands.*)` instead of hardcoding them. RFC-0391 made `forge.init` write a default `forge.yaml` — with **all command bindings set to `null`** (`defaultForgeConfig` in `packages/forge/src/config/forge-config.ts`).

The degradation contract (RFC-0393) says: required binding unresolvable → skill refuses to start; optional binding absent → step skipped with a `Degraded:` line. That contract was designed for commands forge cannot know. But forge's own CLI (`bin/cli.ts`) registers `rfc.validate`, `rfc.create`, `adr.validate`, `spec.validate`, and the rest of the governance surface in every consumer project — forge **does** know these commands.

The result today: a freshly bootstrapped external project gets fo-skills that immediately refuse to start (`fo-idea-create-rfc` requires `commands.validateRfc`) or run degraded — even though the working command is sitting in the same package.

## Problem

- `defaultForgeConfig` writes `validateRfc: null`, `validateAdr: null`, `implementStamp: null`, `specValidate: null` — all four are provided by the forge CLI itself. The null default is a self-inflicted degradation.
- First-run experience of the npm package is broken by default: the flagship skills (`fo-idea`, `fo-idea-create-rfc`) fail their required-binding check until the operator hand-edits `forge.yaml`.
- Nothing distinguishes "binding forge can default" from "binding only the project can know" — the config template treats them identically.

## Decision

`forge.init` writes forge-CLI-backed defaults for every command binding whose implementation ships inside `@wgogol/forge`, using the package manager recorded in `forge.yaml` (e.g. `pnpm exec forge rfc.validate {id} --json`); stack-dependent bindings (`typecheck`, `test`, `scopedBuild`) remain `null` and are filled by the bootstrap skill in dialogue.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — strengthens the contract's intent: bindings de-hardcode _project-specific_ values. Commands forge itself provides are not project-specific; defaulting them removes false degradation while keeping the de-hardcoding seam intact (a project can still override).
- **RFC-0393 degradation contract** — unchanged. Degradation now fires only where genuine uncertainty exists (stack commands), which is what the contract was for.
- **RFC-0391 (portable init)** — amends the `defaultForgeConfig` it introduced.
- **RFC-0539 (skill packs)** — together they define the out-of-the-box npm experience: portable skills + working bindings.

## Design

### Default binding matrix

| Binding | Default written by `forge.init` | Rationale |
| --- | --- | --- |
| `commands.validateRfc` | `<pm> exec forge rfc.validate {id} --json` | forge CLI command |
| `commands.validateAdr` | `<pm> exec forge adr.validate {id} --json` | forge CLI command |
| `commands.implementStamp` | `<pm> exec forge rfc.implement.stamp --id {id} --implementation-commit {commit}` | forge CLI command |
| `commands.specValidate` | `<pm> exec forge spec.validate --spec={id} --json` | forge CLI command |
| `commands.typecheck` | `null` | stack-dependent |
| `commands.test` | `null` | stack-dependent |
| `commands.scopedBuild` | `null` | stack-dependent |

`<pm> exec` is derived from `project.packageManager` via a runner mapping:

| `packageManager` | Runner prefix                    |
| ---------------- | -------------------------------- |
| `pnpm`           | `pnpm exec`                      |
| `npm`            | `npx`                            |
| `yarn`           | `yarn exec`                      |
| `bun`            | `bunx`                           |
| `none` / unknown | `npx` (fallback, with a warning) |

The matrix lives in one exported constant so future forge commands join it in one place:

### TypeScript contracts

```ts
// packages/forge/src/config/forge-config.ts
interface ForgeCliBindingDefault {
  key: string;              // e.g. "commands.validateRfc"
  template: string;         // e.g. "forge rfc.validate {id} --json" (pm-runner prepended at init)
}
export const FORGE_CLI_BINDING_DEFAULTS: ForgeCliBindingDefault[];

// defaultForgeConfig(packageManager: string) applies FORGE_CLI_BINDING_DEFAULTS;
// stack-dependent keys stay null.
```

### Command behavior changes

| Command | Change |
| --- | --- |
| `forge.init` | Writes the default matrix into new `forge.yaml` files. Existing `forge.yaml` untouched (skip-with-warning stands, RFC-0391). |
| `forge.doctor` | Reports a `defaultable-binding-null` notice when a binding present in `FORGE_CLI_BINDING_DEFAULTS` is `null` in the project's `forge.yaml` — nudging older projects to adopt the defaults. Notice, not error. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/config/forge-config.ts` | `FORGE_CLI_BINDING_DEFAULTS` + `defaultForgeConfig` |
| `forge.yaml` (consumer projects) | Receives defaults on init |
| `forge.yaml` (this monorepo) | Unchanged — site-kernel bindings stay |

### Output format

`forge.doctor --json` gains:

```json
{
  "bindings": {
    "notices": [
      { "key": "commands.validateRfc", "rule": "defaultable-binding-null", "suggestion": "pnpm exec forge rfc.validate {id} --json" }
    ]
  }
}
```

### Failure modes

- Unknown `project.packageManager` → `forge.init` falls back to `npx` and logs a warning. The `none` value is treated the same way.
- Operator overrides a defaulted binding → fully respected; doctor stays silent on non-null values.
- A forge CLI command is renamed → the matrix is the single point of update; stale consumer configs surface via the doctor notice.
- Existing `forge.yaml` with null forge-CLI bindings → `forge.init` does not rewrite it (skip-with-warning, RFC-0391). The operator adopts the defaults by running `forge.init` in a clean directory or by manually updating `forge.yaml`. The `forge.doctor` `defaultable-binding-null` notice guides adoption.

## Rollout

1. Add `FORGE_CLI_BINDING_DEFAULTS` and make `defaultForgeConfig` package-manager-aware.
2. Extend `forge.doctor` with the `defaultable-binding-null` notice.
3. New projects comply from day one via `forge.init`; existing consumer projects adopt at their own pace guided by the doctor notice. No flag day; existing `forge.yaml` files are never rewritten.

## Alternatives considered

- **Stack-profile-driven defaults for all bindings** — fuller, but works only for supported stacks and couples this RFC to project scaffolding; the operator chose CLI-backed defaults with bootstrap-dialogue for stack commands.
- **Resolve forge commands at runtime instead of writing them into forge.yaml** (skills detect "forge provides this" and bypass bindings) — rejected: creates a second resolution path, breaks the single-seam principle of DNA-54, and hides the effective command from the operator.
- **Keep null defaults, document manual setup** — rejected: the first-run experience of the npm package is the product; documentation does not fix a broken default.

## Risks

- **Template drift** — if a forge CLI command changes flags, consumer `forge.yaml` files keep the old string. Mitigation: doctor notice surfaces only null bindings, not stale ones — accepted residual risk, revisit if renames actually happen (upgrade tooling is covered by the npm publication RFC).
- **Package-manager detection wrong** — `yarn exec` semantics differ across yarn versions. Mitigation: fall back to `npx` on anything unrecognized; the operator can always override.
- **Agent misinterpretation** — an agent might "helpfully" default `typecheck` to a guessed command. Mitigation: explicit MUST NOT below.
- **False-positive doctor notice** — an operator who intentionally sets a forge-CLI binding to `null` (to disable that command) will see a `defaultable-binding-null` notice. This is acceptable: the doctor notice is advisory (not error), and intentionally disabling a forge-CLI command is an unusual action. No suppression mechanism is provided — the operator can ignore the notice.

## Acceptance criteria

- [x] `FORGE_CLI_BINDING_DEFAULTS` exported from `packages/forge/src/config/forge-config.ts`; `defaultForgeConfig` accepts the package manager and applies the matrix (evidence: packages/forge/src/config/forge-config.ts:156-191, defaultForgeConfig:197-228)
- [x] A `forge.yaml` produced by `forge.init` in a clean directory contains non-null forge-CLI bindings and null stack bindings exactly per the matrix (evidence: packages/forge/src/tests/init-bindings.test.ts:38-54, runInit produces correct binding matrix)
- [x] `forge.doctor` emits `defaultable-binding-null` notices with suggestions in `--json` output (evidence: packages/forge/src/onboarding/doctor.ts:167-179, packages/forge/src/tests/doctor-bindings.test.ts:55-82)
- [x] `forge.doctor` does NOT emit `defaultable-binding-null` for bindings that are non-null in `forge.yaml` (operator overrides are respected) (evidence: packages/forge/src/tests/doctor-bindings.test.ts:85-122, zero notices for non-null bindings)
- [x] Existing `forge.yaml` files (including this monorepo's) are never modified by `forge.init` (evidence: packages/forge/src/onboarding/init.ts:81-82 skip-with-warning, packages/forge/src/tests/init-bindings.test.ts:86-113)
- [x] Unit tests cover pm-runner derivation (pnpm/npm/yarn/bun/none/unknown) and the doctor notice (evidence: packages/forge/src/tests/forge-config.test.ts:54-65, packages/forge/src/tests/doctor-bindings.test.ts:55-82)
- [x] `packages/forge/AGENTS.md` bindings section updated (evidence: packages/forge/AGENTS.md:83-84)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate RFC-0540 --json` returns status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT write defaults for `typecheck`, `test`, or `scopedBuild` — those are filled only by the bootstrap skill in operator dialogue.
- Agents MUST NOT modify an existing `forge.yaml` when running `forge.init` — skip-with-warning semantics (RFC-0391) are preserved.
- Agents MUST NOT change this monorepo's `forge.yaml` bindings as part of implementing this RFC — WGogol keeps its site-kernel-backed values.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0540 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
