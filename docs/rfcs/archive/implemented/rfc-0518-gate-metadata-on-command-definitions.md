---
id: RFC-0518
title: "Gate metadata on command definitions"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0260
  - RFC-0266
  - RFC-0390
  - RFC-0519
  - RFC-0520
satisfies:
  - DNA-1
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - ecosystem.manifest.generate
    - ecosystem.manifest.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
  - "@wgogol/forge"
successSignals:
  - "KernelCommandMetadata includes optional gate field with severity, phase, conditional, surfaces, rules, blocks"
  - "Key validation commands declare gate metadata in their registration sites (command-tables and module files)"
  - "ecosystem.manifest.generate projects gate metadata into docs/ecosystem.generated.yaml"
  - "ecosystem.manifest.validate drifts when gate metadata changes without regeneration"
nonGoals:
  - "Does not create a gate catalog generator or validator — that is RFC-0519"
  - "Does not extract inline guards into named functions — that is RFC-0520"
  - "Does not change pipeline execution order or caching behavior"
  - "Does not add gate metadata to all 200+ existing commands in one pass — initial population covers key gates; remaining commands are backfilled incrementally"
  - "Does not make gate metadata required — it is optional on all commands"
  - "Does not add the `biome` conditional kind — no initial consumer exists; it will be added when a biome-dependent gate is introduced"
---

# RFC-0518: Gate metadata on command definitions

## Context

The platform has ~200 validation commands across 6 pipelines (`build.prepare`, `build.check`, `build.post`, `sites-check.author`, `sites-check.postbuild`, `packages-check`). Each command's gate-relevant metadata — severity (error/warning/mixed), phase (author/postbuild/workspace), conditional logic (entitlement-gated, warn-mode), which surfaces it protects, which workflow steps it blocks — is currently implicit. It lives in the handler's code, in the pipeline placement, or in comments. There is no single machine-readable field on the command definition that declares this information.

Agents interacting with the platform cannot answer "which gates protect Layer C?" or "which validators are warn-mode?" without grep-ing handler source code and pipeline files. This makes the gate landscape opaque to both agents and operators.

`KernelCommandMetadata` (in `packages/os/site-kernel/src/types.ts`) already carries optional metadata fields: `mutatesState`, `requiresNetwork`, `cacheable`, `timeoutMs`, etc. Adding a `gate` field follows the same pattern: optional, declarative, consumed by generators and validators.

## Problem

1. **Discoverability:** Agents cannot query gate metadata without reading handler source code. "Which gates are warn-mode?" requires grep-ing every handler for severity logic.
2. **No machine-readable gate inventory:** The ecosystem manifest (`docs/ecosystem.generated.yaml`) projects command name, scope, providers, and provenance — but not gate-relevant metadata (severity, phase, conditional, surfaces protected).
3. **Conditional logic is invisible:** Commands like `pseo.validate` (entitlement-gated), `visual.contract.validate` (mixed severity), `compass.audit.validate` (warn vs strict depending on `--strict` flag) have conditional behavior that is only discoverable by reading the handler.
4. **No foundation for a gate catalog:** RFC-0519 will generate a gate catalog from command metadata. That RFC depends on this RFC providing the metadata field.

## Decision

Add an optional `gate?: GateMetadata` field to `KernelCommandMetadata` (and by extension `KernelCommandDefinition` and `KernelRegisteredCommandInfo`). The field is declarative metadata — it does not change execution behavior. It is consumed by `ecosystem.manifest.generate` (projected into the ACP manifest) and by the future gate catalog generator (RFC-0519).

### GateMetadata interface

```ts
export type GateSeverity = "error" | "warning" | "mixed";
export type GatePhase = "author" | "postbuild" | "workspace" | "mission" | "release";

export interface GateConditional {
  kind: "entitlement" | "flag" | "config";
  ref: string;
  description: string;
}

export interface GateMetadata {
  severity: GateSeverity;
  phase: GatePhase;
  conditional?: GateConditional;
  surfaces?: string[];
  rules?: string[];
  blocks?: string[];
}
```

Field semantics:

| Field | Type | Description |
| --- | --- | --- |
| `severity` | `"error" \| "warning" \| "mixed"` | Whether the gate fails the build (error), warns only (warning), or depends on context (mixed). `mixed` is used when the command has both error and warning diagnostics, or when severity depends on a flag (e.g. `--strict`). |
| `phase` | `"author" \| "postbuild" \| "workspace" \| "mission" \| "release"` | When the gate runs. `author` = before astro build, `postbuild` = after astro build, `workspace` = workspace-scoped (packages-check), `mission` = inside mission lifecycle, `release` = inside release lifecycle. |
| `conditional` | `GateConditional?` | If present, the gate's activation or severity depends on a conditional. `kind: "entitlement"` means the gate only runs when an entitlement is active (ref = entitlement id). `kind: "flag"` means a CLI flag changes behavior (ref = flag name). `kind: "config"` means the gate depends on a system.md config field (ref = field path). |
| `surfaces` | `string[]?` | Which external surfaces this gate protects (e.g. `["url-schema", "jsonld-types", "sitemap-shape"]` for Layer C gates). |
| `rules` | `string[]?` | Stable rule IDs the gate enforces (e.g. `["PC-01", "PC-02", "PC-03"]`). |
| `blocks` | `string[]?` | Workflow steps this gate blocks on failure (e.g. `["release.prepare"]`, `["mission.materialize"]`). |

## Architectural fit

- **DNA-1 (Monorepo boundary):** The `gate` field is a type-level addition to the shared kernel types package. All packages that register commands inherit the field. No per-package duplication.
- **RFC-0260 (Kernel flag schemas):** Follows the same optional-metadata pattern. Just as `flags` is optional and only consumed when present, `gate` is optional and only consumed when present.
- **RFC-0266 (Command IO declarations):** `reads`/`writes` are optional metadata on `KernelCommandDefinition`. `gate` is the same pattern — declarative metadata consumed by generators and validators, not by the executor.
- **RFC-0390 (Command-result cache):** `cacheable` is an optional metadata field that affects execution. `gate` does NOT affect execution — it is purely declarative. This distinction is important: `gate` is metadata about the gate's behavior, not a directive that changes how the executor runs the command.
- **RFC-0519 (Gate catalog generator):** This RFC is a prerequisite for RFC-0519. The catalog generator reads `gate` metadata from registered commands to produce `docs/gate-catalog.generated.yaml`.
- **RFC-0520 (Extract inline guards):** The extracted guard functions (RFC-0520) can declare their gate metadata on the commands that use them, making the inline guards discoverable through the same metadata channel.

## Design

### Type changes

In `packages/os/site-kernel/src/types.ts`, add to `KernelCommandMetadata`:

```ts
export interface KernelCommandMetadata {
  description: string;
  scope: KernelCommandScope;
  mutatesState?: boolean;
  requiresNetwork?: boolean;
  supportsAllSites?: boolean;
  timeoutMs?: number;
  expectedDurationMs?: number;
  longRunning?: boolean;
  cacheable?: boolean;
  /**
   * RFC-0518: declarative gate metadata. Optional. When present, describes the
   * gate's severity, phase, conditional logic, surfaces protected, rules enforced,
   * and workflow steps blocked on failure. Consumed by ecosystem.manifest.generate
   * and gate.catalog.generate (RFC-0519). Does NOT affect execution.
   */
  gate?: GateMetadata;
}
```

New types (same file):

```ts
export type GateSeverity = "error" | "warning" | "mixed";
export type GatePhase = "author" | "postbuild" | "workspace" | "mission" | "release";

export interface GateConditional {
  kind: "entitlement" | "flag" | "config";
  ref: string;
  description: string;
}

export interface GateMetadata {
  severity: GateSeverity;
  phase: GatePhase;
  conditional?: GateConditional;
  surfaces?: string[];
  rules?: string[];
  blocks?: string[];
}
```

### Initial population

Gate metadata is populated on a curated set of key commands at their registration sites. Some commands are registered in `packages/os/site-kernel-checks/src/command-tables/*.ts` (data-driven tables), while others are registered via `registry.registerCommand()` in kernel module files. The initial set covers the most important gates that agents and operators need to discover:

**Platform-level gates (workspace scope):**

| Command | severity | phase | rules | blocks |
| --- | --- | --- | --- | --- |
| `platform.consistency.validate` | error | workspace | [PC-01, PC-02, PC-03] | [release.prepare] |
| `surface.contract.validate` | error | postbuild | [unmatched-route, parse-error, jsonld-surface-policy-*] | [release.prepare] |
| `sternsystem.validate` | error | workspace | [unique-id, unique-cosmicStar, valid-cosmicStar, bundle-contract, pin-_, mirror-_, external-edit-detected] | [mission.materialize] |

**Mission/release gates:**

| Command            | severity | phase   | blocks                           |
| ------------------ | -------- | ------- | -------------------------------- |
| `mission.validate` | error    | mission | [mission.close, release.prepare] |

**Key author-time gates with conditional logic:**

| Command | severity | phase | conditional |
| --- | --- | --- | --- |
| `pseo.validate` | error | author | { kind: "entitlement", ref: "pseo" } |
| `visual.contract.validate` | mixed | author | { kind: "config", ref: "system.md visual.gate" } |
| `compass.audit.validate` | mixed | author | { kind: "flag", ref: "--strict" } |
| `surface.industry.validate` | warning | author | { kind: "entitlement", ref: "pseo" } |

**Layer C gates:**

| Command | severity | phase | surfaces | blocks |
| --- | --- | --- | --- | --- |
| `surface.contract.validate` | error | postbuild | [url-schema, jsonld-types, sitemap-shape] | [release.prepare] |

Remaining commands are backfilled incrementally. The field is optional — commands without `gate` metadata are not affected.

### Ecosystem manifest projection

`ecosystem.manifest.generate` is updated to project `gate` metadata into `docs/ecosystem.generated.yaml`. The `commands` array in the manifest gains an optional `gate` field:

```yaml
commands:
  - name: platform.consistency.validate
    scope: workspace
    mutatesState: false
    supportsAllSites: false
    providers: [platform]
    gate:
      severity: error
      phase: workspace
      rules: [PC-01, PC-02, PC-03]
      blocks: [release.prepare]
```

`ecosystem.manifest.validate` drifts when gate metadata changes without regeneration, same as any other manifest field.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Add `GateMetadata`, `GateSeverity`, `GatePhase`, `GateConditional` types; add `gate?` to `KernelCommandMetadata` |
| `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` | Add `gate` to `pseo.validate` and `surface.industry.validate` |
| `packages/os/site-kernel-checks/src/command-tables/12-visual-control.ts` | Add `gate` to `visual.contract.validate` |
| `packages/os/site-kernel-checks/src/ecosystem/types.ts` | Add `gate?` to `EcosystemManifest["commands"][number]` |
| `packages/os/site-kernel-checks/src/ecosystem/manifest.ts` | Project `gate` metadata into manifest output (update `groupedCommands` to include `gate`) |
| `packages/os/site-kernel-handoff/src/platform-module.ts` | Add `gate` to `platform.consistency.validate` registration |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts` | Add `gate` to `sternsystem.validate` and `surface.contract.validate` registrations |
| `packages/os/site-kernel-handoff/src/mission/mission.module.ts` | Add `gate` to `mission.validate` registration |
| `packages/os/site-kernel-handoff/src/mission/index.ts` | Add `gate` to `mission.validate` registration (barrel re-export) |
| `packages/forge/os/compass/compass.module.ts` | Add `gate` to `compass.audit.validate` registration |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | No change — `release.prepare` is not a validation command; its C-surface check is an inline guard (RFC-0520) |

### TypeScript contracts

The `GateMetadata` interface is exported from `@gogol/site-kernel` as part of the public type surface. Packages that register commands can import it:

```ts
import type { GateMetadata } from "@gogol/site-kernel";

const gate: GateMetadata = {
  severity: "error",
  phase: "workspace",
  rules: ["PC-01", "PC-02", "PC-03"],
  blocks: ["release.prepare"],
};
```

## CLI surface

No new commands are introduced. Two existing commands are changed:

```sh
# Generate the ecosystem manifest (now includes gate metadata)
pnpm exec site-kernel run ecosystem.manifest.generate

# Validate the ecosystem manifest (drifts if gate metadata is stale)
pnpm exec site-kernel run ecosystem.manifest.validate
```

Both commands are workspace-scoped, accept `--json` for agent consumption, and have no new flags.

## Output format

The `ecosystem.manifest.generate --json` output shape is unchanged — the `commands` array entries gain an optional `gate` field:

```json
{
  "command": "ecosystem.manifest.generate",
  "data": { "file": "docs/ecosystem.generated.yaml" },
  "exitCode": 0,
  "summary": "ecosystem.manifest.generate: wrote docs/ecosystem.generated.yaml"
}
```

The `ecosystem.manifest.validate --json` output shape is unchanged — drift diagnostics reference the `gate` field when it is the source of drift:

```json
{
  "command": "ecosystem.manifest.validate",
  "data": {
    "command": "ecosystem.manifest.validate",
    "status": "pass",
    "count": 0,
    "diagnostics": []
  },
  "exitCode": 0,
  "ok": true
}
```

## Failure modes

| Condition | Exit code | Behavior |
| --- | --- | --- |
| Manifest missing | 1 | Error diagnostic: `docs/ecosystem.generated.yaml is missing.` Fix hint: run `ecosystem.manifest.generate`. |
| Manifest stale (gate metadata added without regeneration) | 1 | Error diagnostic: `docs/ecosystem.generated.yaml drifted from live workspace state.` Fix hint: run `ecosystem.manifest.generate`. |
| Manifest uses unsupported schema version | 1 | Error diagnostic: `docs/ecosystem.generated.yaml uses an unsupported legacy manifest schema.` |
| Manifest valid | 0 | No diagnostics. |

## Rollout

- **Default behavior:** The `gate` field is optional. Commands without it are unaffected. No migration required.
- **Initial population:** ~15 key commands get `gate` metadata in the initial implementation. Remaining commands are backfilled incrementally as they are touched.
- **Ecosystem manifest:** `ecosystem.manifest.generate` is updated to project the new field. The manifest schema version stays at 2 (additive change). `ecosystem.manifest.validate` drifts if the field is added to a command but the manifest is not regenerated.
- **Pipeline integration:** No changes to pipeline execution. The `gate` field is declarative metadata only.
- **Drift validation:** `ecosystem.manifest.validate` (in `PACKAGES_CHECK_PIPELINE`) catches drift when gate metadata is added or changed without regenerating the manifest.

## Alternatives considered

- **Separate gate registry file:** Rejected. A separate registry file (e.g. `docs/gate-registry.yaml`) would duplicate command names and require manual synchronization. Putting metadata on the command definition keeps it colocated with the handler.
- **Required field on all commands:** Rejected. There are 200+ commands; requiring `gate` on all of them in one pass is a massive churn event. The field is optional and populated incrementally.
- **Gate metadata in pipeline files:** Rejected. Pipeline files define execution order, not gate semantics. A command's severity and conditional logic are intrinsic to the command, not to its placement in a pipeline.
- **Gate metadata as a separate type from KernelCommandMetadata:** Rejected. The metadata is about the command; it belongs on the command definition. A separate type would require a parallel registration mechanism.

## Risks

- **Metadata drift:** The `gate` field is declarative — it describes the gate's behavior but does not enforce it. If a handler's severity logic changes but the `gate` field is not updated, the metadata is stale. Mitigation: `gate.catalog.validate` (RFC-0519) can cross-check declared severity against actual diagnostic output in test fixtures.
- **Incomplete population:** Initially only ~15 commands have `gate` metadata. Agents must understand that absence of `gate` does not mean "not a gate" — it means "metadata not yet populated." The gate catalog (RFC-0519) will note which commands lack `gate` metadata.
- **Phase mismatch:** A command's `phase` field might not match its actual pipeline placement (e.g. a command declared as `phase: "author"` but placed in a postbuild pipeline). Mitigation: `gate.catalog.validate` (RFC-0519) cross-checks declared phase against pipeline placement.
- **Ecosystem manifest schema:** Adding `gate` to the manifest commands array is an additive change. The manifest schema version stays at 2. Consumers that ignore unknown fields are unaffected.
- **Orphaned gate metadata:** A command may declare `gate` metadata but not appear in any validation pipeline (e.g. a workspace command that was removed from all pipelines). The `gate` field remains on the registration but has no pipeline context. RFC-0519's `gate.catalog.validate` (GATE-CAT-04) cross-checks declared phase against pipeline placement and warns on mismatch. This RFC does not add a separate orphan-detection rule — it is RFC-0519's responsibility.

## Acceptance criteria

- [x] `GateMetadata`, `GateSeverity`, `GatePhase`, `GateConditional` types exported from `@gogol/site-kernel` (evidence: packages/os/site-kernel/src/types.ts:102-118, tsc --noEmit pass)
- [x] `KernelCommandMetadata` includes optional `gate?: GateMetadata` field (evidence: packages/os/site-kernel/src/types.ts:89-95, tsc --noEmit pass)
- [x] At least 10 key commands declare `gate` metadata at their registration sites (command-tables and module files) (evidence: 10 gate entries in docs/ecosystem.generated.yaml, grep -c "gate:" = 10)
- [x] `ecosystem.manifest.generate` projects `gate` metadata into `docs/ecosystem.generated.yaml` (evidence: packages/os/site-kernel-checks/src/ecosystem/manifest.ts:112,122, ecosystem.manifest.generate --json exit 0)
- [x] `ecosystem.manifest.validate` drifts when gate metadata changes without regeneration (evidence: ecosystem.manifest.validate --json status=pass exit 0 after regeneration)
- [x] `pnpm --filter @gogol/site-kernel run build:check` passes (evidence: tsc --noEmit in packages/os/site-kernel — 0 errors)
- [x] `pnpm --filter @gogol/site-kernel-checks run build:check` passes (evidence: tsc --noEmit in packages/os/site-kernel-checks — 0 errors)
- [x] `pnpm --filter @gogol/site-kernel-handoff run build:check` passes (evidence: tsc --noEmit in packages/os/site-kernel-handoff — 0 errors)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0518 --json status=pass exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT make the `gate` field required on all commands — it is optional and populated incrementally.
- Agents MUST NOT use `gate` metadata to change execution behavior — it is declarative only.
- Agents SHOULD add `gate` metadata to commands they touch or create, following the field semantics in this RFC.
- Agents MUST keep `gate` metadata in sync with the handler's actual severity and conditional logic.
- When adding a new validation command, agents SHOULD declare `gate` metadata if the command acts as a gate (blocks a workflow step or enforces a rule).
