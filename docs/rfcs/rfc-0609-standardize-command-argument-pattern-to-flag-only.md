---
id: RFC-0609
title: "Standardize command argument pattern to flag-only"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0260
  - RFC-0393
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
    - rfc.validate
    - rfc.command-lifecycle.validate
    - rfc.graph
    - rfc.pipeline.status
    - adr.validate
    - session.validate
    - forge.create
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel"
  - "@warpgogol/forge"
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "All registered commands accept entity identifiers via declared flags only — no command reads input.args[0] for an entity id."
  - "Passing --id to rfc.validate works (no KERNEL-FLAG-01 error)."
  - "forge.yaml binding templates use --id {id} format for all commands, not positional {id}."
  - "KernelCommandInput no longer has an args field — positional args are eliminated at the type level."
  - "command.args.validate (RFC-0610) passes with zero violations on all registered commands."
nonGoals:
  - "Do not standardize flag names across domains — each domain keeps its own flag name (--id for rfc/adr/session, --mission for mission, --spec for spec, --site for sternsystem.extract). The standard is about flag-only vs positional, not about flag name uniformity."
  - "Do not remove the --json flag or other output-format flags — these are cross-cutting flags not related to entity identification."
  - "Do not change the KernelFlagSpec type or the resolveCommandFlags parsing logic beyond removing positional arg support."
  - "Do not address sub-command routing (e.g. rfc.validate vs rfc.acceptance.run) — that is handled by the command name, not by positional args."
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

# RFC-0609: Standardize command argument pattern to flag-only

## Context

The Warpgogol monorepo has 30+ registered Site OS commands across multiple domains (rfc, adr, session, mission, sternsystem, spec, forge, etc.). These commands accept entity identifiers (RFC ids, mission ids, Sternsystem ids, spec ids) via two incompatible patterns:

1. **Positional args** — 6 commands (`rfc.validate`, `rfc.command-lifecycle.validate`, `rfc.graph`, `rfc.pipeline.status`, `adr.validate`, `session.validate`) read the entity id from `input.args[0]` with `flags: {}`.
2. **Declared flags** — 9+ commands (`rfc.implement.stamp`, `sternsystem.validate`, `sternsystem.register`, `sternsystem.pin`, `sternsystem.sync`, `sternsystem.status`, `mission.*`, `spec.*`) read the entity id from `input.flags["id"]` (or domain-specific flag like `--mission`, `--spec`) with a typed `KernelFlagSpec` schema.
3. **Dual-path** — 9 handler files in `site-kernel-checks` and `site-kernel-handoff` accept both via `input.flags["x"] ?? input.args[0]`.

RFC-0260 introduced typed flag schemas (`KernelFlagSpec`) and strict flag validation (KERNEL-FLAG-01 for unknown flags, KERNEL-FLAG-03 for missing required flags). But it did not standardize positional arguments — `KernelCommandInput.args` remains an untyped `string[]` with no schema, no validation, and no self-documentation via `--help`.

The `forge.yaml` bindings (RFC-0393) reflect the same inconsistency: `validateRfc` uses `{id}` positional, `implementStamp` uses `--id {id}` flag, `specValidate` uses `--spec={id}` flag.

## Problem

The split between positional and flag patterns creates three concrete problems:

1. **KERNEL-FLAG-01 false positives.** An agent or operator who assumes `--id` works universally (a reasonable assumption given that 9+ commands accept it) gets a KERNEL-FLAG-01 error on the 6 positional-only commands. The error message says "Unknown flag --id" — which is confusing because `--id` is not unknown to the ecosystem, it is just not declared on that specific command.

2. **No type safety for positional args.** `KernelCommandInput.args` is `string[]` — there is no schema declaring what the first positional arg should be, whether it is required, or what its description is. The `--help` output cannot document positional args because they are not part of the command definition. Agents reading `--help` have no way to discover that `rfc.validate` expects an RFC id as the first argument.

3. **Unenforceable convention.** Without a formal standard, new commands can be registered with either pattern. The ecosystem drifts further with each new command. A validator that checks compliance (RFC-0610) cannot exist until the standard is established.

## Decision

All Site OS commands accept entity identifiers via declared flags only. Positional arguments are removed from `KernelCommandInput`. The `args` field is deleted from the type, and `resolveCommandFlags` no longer populates it. Every command that previously read `input.args[0]` is migrated to declare the identifier in its `flags` schema and read it from `input.flags["<flag-name>"]`.

Flag naming is domain-specific: each command domain uses the flag name already established in that domain (`--id` for rfc/adr/session, `--mission` for mission, `--spec` for spec, `--site` for sternsystem.extract, `--app` for surface.contract.validate). The standard is about flag-only vs positional, not about flag name uniformity across domains.

## Architectural fit

- **DNA-54 (Forge bindings contract):** This RFC extends the forge bindings contract by standardizing how bindings reference entity ids. All binding templates must use `--<flag> {id}` format, not positional `{id}`. This makes bindings self-documenting and machine-checkable.
- **RFC-0260 (typed flag schemas):** This RFC completes RFC-0260's work. RFC-0260 introduced `KernelFlagSpec` and strict flag validation but left positional args untyped. This RFC removes the untyped escape hatch.
- **RFC-0393 (forge bindings):** This RFC standardizes binding template format. `validateRfc` and `validateAdr` bindings change from `{id}` positional to `--id {id}` flag format, matching `implementStamp`.

## Design

### CLI surface

Before (inconsistent):

```sh
pnpm exec site-kernel run rfc.validate RFC-0609 --json          # positional
pnpm exec site-kernel run rfc.implement.stamp --id RFC-0609 ... # flag
pnpm exec site-kernel run adr.validate ADR-0003 --json          # positional
pnpm exec site-kernel run spec.validate --spec=pbp-spec --json  # flag
```

After (uniform flag-only):

```sh
pnpm exec site-kernel run rfc.validate --id RFC-0609 --json
pnpm exec site-kernel run rfc.implement.stamp --id RFC-0609 ...
pnpm exec site-kernel run adr.validate --id ADR-0003 --json
pnpm exec site-kernel run spec.validate --spec pbp-spec --json
```

### TypeScript contracts

`KernelCommandInput` loses the `args` field:

```ts
// Before
export interface KernelCommandInput {
  argv: string[];
  args: string[];                    // ← removed
  flags: Record<string, KernelFlagValue>;
}

// After
export interface KernelCommandInput {
  argv: string[];
  flags: Record<string, KernelFlagValue>;
}
```

`resolveCommandFlags` return type changes — `args` is no longer returned:

```ts
// Before
export function resolveCommandFlags(
  rawArgv: string[],
  definition: KernelCommandDefinition,
): { flags: Record<string, KernelFlagValue>; args: string[]; diagnostics: Diagnostic[] }

// After
export function resolveCommandFlags(
  rawArgv: string[],
  definition: KernelCommandDefinition,
): { flags: Record<string, KernelFlagValue>; diagnostics: Diagnostic[] }
```

When `resolveCommandFlags` encounters a non-flag token (a token not starting with `--`), it emits a new diagnostic:

```ts
export interface KernelDiagnostic {
  ruleId: "KERNEL-ARG-01";
  severity: "error";
  message: `Unexpected positional argument "${token}" for command "${definition.name}". All arguments must be passed as flags.`;
  fixHint: `Convert "${token}" to a flag, e.g. --id ${token}.`;
}
```

### Migration table

| Command | Old pattern | New pattern | Flag name |
| --- | --- | --- | --- |
| `rfc.validate` | `input.args[0]` | `input.flags["id"]` | `--id` |
| `rfc.command-lifecycle.validate` | `input.args[0]` | `input.flags["id"]` | `--id` |
| `rfc.graph` | `input.args[0]` | `input.flags["id"]` | `--id` |
| `rfc.pipeline.status` | `input.args[0]` | `input.flags["id"]` | `--id` |
| `adr.validate` | `input.args[0]` | `input.flags["id"]` | `--id` |
| `session.validate` | `input.args[0]` | `input.flags["id"]` | `--id` |
| `forge.create` | `input.args[0]` (project name) | `input.flags["name"]` | `--name` |

Dual-path handlers (9 files in `site-kernel-checks` and `site-kernel-handoff`) have their `?? input.args[0]` fallback removed. The flag becomes the only source.

### forge.yaml binding updates

| Binding key      | Old template                        | New template                       |
| ---------------- | ----------------------------------- | ---------------------------------- |
| `validateRfc`    | `rfc.validate {id} --json`          | `rfc.validate --id {id} --json`    |
| `validateAdr`    | `adr.validate {id} --json`          | `adr.validate --id {id} --json`    |
| `implementStamp` | `rfc.implement.stamp --id {id} ...` | (unchanged)                        |
| `specValidate`   | `spec.validate --spec={id} --json`  | `spec.validate --spec {id} --json` |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Remove `args` from `KernelCommandInput`; add `KERNEL-ARG-01` diagnostic type |
| `packages/os/site-kernel/src/runtime/argv.ts` | `resolveCommandFlags` stops returning `args`; emits `KERNEL-ARG-01` for positional tokens |
| `packages/forge/os/rfc/rfc.module.ts` | Add `id` flag to `rfc.validate`, `rfc.command-lifecycle.validate`, `rfc.graph`, `rfc.pipeline.status` registrations |
| `packages/forge/os/rfc/handlers/validate.ts` | Read `input.flags["id"]` instead of `input.args[0]` |
| `packages/forge/os/rfc/handlers/lifecycle.ts` | Read `input.flags["id"]` instead of `input.args[0]` |
| `packages/forge/os/rfc/handlers/index-graph.ts` | Read `input.flags["id"]` instead of `input.args[0]` |
| `packages/forge/os/rfc/handlers/pipeline-status.ts` | Read `input.flags["id"]` instead of `input.args[0]` |
| `packages/forge/os/adr/adr.module.ts` | Add `id` flag to `adr.validate` registration |
| `packages/forge/os/adr/handlers/validate.ts` | Read `input.flags["id"]` instead of `input.args[0]` |
| `packages/forge/os/session/handlers/validate.ts` | Read `input.flags["id"]` instead of `input.args[0]` |
| `packages/forge/os/core/core.module.ts` | Add `name` flag to `forge.create` registration |
| `packages/forge/os/core/handlers/create.ts` | Read `input.flags["name"]` instead of `input.args[0]` |
| `packages/os/site-kernel-checks/src/*.ts` (9 files) | Remove `?? input.args[0]` fallback from dual-path handlers |
| `packages/os/site-kernel-handoff/src/handoff-*.ts` (3 files) | Remove `?? input.args[0]` fallback from dual-path handlers |
| `forge.yaml` | Update `validateRfc`, `validateAdr`, `specValidate` binding templates |
| `.agents/skills/fo/*/SKILL.md` | Update command invocation examples that use positional args |

### Output format

No new command is introduced by this RFC. The `command.args.validate` command is defined in RFC-0610.

### Failure modes

- **KERNEL-ARG-01** (error): Unexpected positional argument. Emitted by `resolveCommandFlags` when a token not starting with `--` is encountered. The command does not execute; the diagnostic is reported in the standard diagnostics array.
- **KERNEL-FLAG-03** (existing): Missing required flag. After migration, commands that previously relied on positional args now declare `id` as a required flag — omitting it triggers KERNEL-FLAG-03, not a silent `undefined`.

## Rollout

- **Hard break, no deprecation window.** The 6 positional-only commands are migrated in a single commit. The old syntax (`rfc.validate RFC-0609`) stops working immediately. The new syntax (`rfc.validate --id RFC-0609`) is the only accepted form.
- **forge.yaml bindings updated in the same commit.** All binding templates are changed to flag format simultaneously.
- **Skill files updated in the same commit.** All `.agents/skills/fo/*/SKILL.md` files that reference positional command invocations are updated to flag format.
- **Existing apps:** No app-level changes needed — apps do not invoke kernel commands directly; they are invoked by agents, skills, and CI pipelines. Agents and skills are updated in the same commit.
- **New apps:** Automatically benefit — all commands use flag-only from day one.
- **Integration with `build.check`:** None directly. This RFC changes command registration and argument parsing, not build pipelines. The `command.args.validate` command (RFC-0610) is added to `build.check` in a follow-up RFC.

## Alternatives considered

- **Positional-only (all commands use `input.args[0]`):** Rejected. Would require a new `positionalArgs` field in `KernelCommandDefinition` and migration of 9+ flag-based commands to positional. Loses type safety, self-documentation, and validation. Unix-idiomatic but less safe.

- **Hybrid (flag with positional fallback, `input.flags["id"] ?? input.args[0]`):** Rejected. Already used in 9 handlers but creates two code paths in every handler, making the convention unenforceable. A validator cannot check compliance because both patterns are technically valid. This is not a standard — it is the absence of a standard.

- **Deprecation window (add `--id`, keep positional with warning):** Rejected. Creates double code paths during the window. The validator (RFC-0610) would need to allow both patterns during the window, then be tightened later — two migrations instead of one.

- **Exempt forge.create (keep `<name>` positional):** Rejected. Creates an exception that complicates the validator and the standard. `forge.create --name foo` is not significantly worse than `forge.create foo`, and consistency is more valuable than Unix idiom compatibility for one command.

## Risks

- **Breaking change for agents and skills.** Any agent or skill that invokes the 6 migrated commands with positional syntax will get KERNEL-ARG-01. Mitigation: all skill files are updated in the same commit. Agents reading skill files will see the new syntax. Agents with hardcoded positional invocations will fail visibly with a clear error message and fix hint.
- **Breaking change for external forge consumers.** Projects using `@warpgogol/forge` as an npm package that invoke commands with positional args will break. Mitigation: `@warpgogol/forge` is versioned; this is a minor breaking change (commands still exist, just the invocation syntax changes). The `forge.create` change is the most visible — documented in the changelog.
- **KERNEL-ARG-01 false positives for multi-word values.** If a flag value contains spaces and is not quoted, `resolveCommandFlags` might interpret the second word as a positional arg. Mitigation: this is already the case with the current parser — flag values with spaces must be quoted. No regression.
- **Agent misinterpretation risk.** An agent might see `--id` in a skill file and assume it works for all commands, including ones not yet migrated. Mitigation: after this RFC is implemented, all commands accept `--id` (or their domain-specific flag). There are no positional-only commands left to misinterpret.

## Acceptance criteria

- [ ] `KernelCommandInput` in `packages/os/site-kernel/src/types.ts` no longer has an `args` field
- [ ] `resolveCommandFlags` in `packages/os/site-kernel/src/runtime/argv.ts` emits `KERNEL-ARG-01` for positional tokens and does not return `args`
- [ ] `rfc.validate` accepts `--id RFC-0609` and rejects `RFC-0609` (positional) with KERNEL-ARG-01
- [ ] `adr.validate` accepts `--id ADR-0003` and rejects positional
- [ ] `session.validate` accepts `--id` flag
- [ ] `rfc.command-lifecycle.validate`, `rfc.graph`, `rfc.pipeline.status` accept `--id` flag
- [ ] `forge.create` accepts `--name` flag and rejects positional
- [ ] All 9 dual-path handlers in `site-kernel-checks` and `site-kernel-handoff` no longer read `input.args[0]`
- [ ] `forge.yaml` binding templates for `validateRfc`, `validateAdr`, `specValidate` use flag format
- [ ] All `.agents/skills/fo/*/SKILL.md` files that reference positional command invocations are updated
- [ ] `rfc.validate` passes on this file
- [ ] All affected packages pass `build:check` (typecheck)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The migration is mechanical: for each of the 6 positional-only commands, add `id: { kind: "string", description: "..." }` to the `flags` schema and change `input.args[0]` to `input.flags["id"]` in the handler. Two lines per command.
- For dual-path handlers, remove `?? input.args[0]` — the flag becomes the only source. One line per handler.
- For `forge.create`, add `name: { kind: "string", required: true, description: "Project name." }` to `flags` and change `input.args[0]` to `input.flags["name"]`.
- The `args` field removal from `KernelCommandInput` is a type-level change. TypeScript will flag every handler that still reads `input.args` — use this as a migration checklist.
- `resolveCommandFlags` must emit `KERNEL-ARG-01` for any token not starting with `--` (after the command name). This includes tokens that were previously valid positional args.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0609 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
