---
id: RFC-0260
title: "Declare kernel command flags as typed schemas"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
amendedBy: []
related:
  - RFC-0203
  - RFC-0229
  - RFC-0246
commands:
  proposed:
    - kernel.flags.lint
  added:
    - kernel.flags.lint
  changed:
    - rfc.list
    - rfc.create
    - rfc.validate
    - rfc.command-lifecycle.validate
    - rfc.check
    - rfc.index.generate
    - rfc.graph
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "No command behavior depends on the global KERNEL_BOOLEAN_FLAGS set; the set is deleted."
  - "A typo'd flag on any migrated command fails with KERNEL-FLAG-01 and a list of valid flags instead of being silently ignored."
  - "`executeKernelCommand` rejects malformed option objects (e.g. `args:` instead of `argv:`) with an explicit error."
  - "`kernel.flags.lint` fails when a command reads an undeclared flag."
nonGoals:
  - "Do not generate documentation or turbo contracts from the schemas in this RFC — that is rfc-0266."
  - "Do not change flag semantics of any existing command during migration; declared schemas must encode current behavior."
  - "Do not introduce a third-party CLI framework (commander/yargs); the kernel parser stays first-party."
---

# RFC-0260: Declare kernel command flags as typed schemas

## Context

Part B of the 2026-07-02 AEO audit series (typed kernel boundaries; see rfc-0258 for series order).

`parseKernelArgv` in `packages/os/site-kernel/src/runtime.ts` decides whether `--foo bar` means "boolean `foo` + positional `bar`" or "`foo=bar`" by consulting a single hand-maintained module-level set, `KERNEL_BOOLEAN_FLAGS` (~20 names). Every one of the 363 registered commands that reads `input.flags.x === true` implicitly depends on its flag being listed there. `KernelCommandDefinition` (`packages/os/site-kernel/src/types.ts`) declares no flags at all; `execute()` receives an untyped `Record<string, KernelFlagValue>`.

This class of defect has already shipped twice:

- The boolean-flag parse bug fixed during the RFC-0229 work (a boolean flag swallowed the following positional).
- Commit `8b3e62ab`: `app.qa.validate` passed `args:` where `ExecuteKernelCommandOptions` expects `argv:`; an `as any` cast hid it and `--phase=05-audit` silently disappeared.

A live symptom during this audit: `pnpm exec werkstatt run rfc.create -- --title "…"` fails, because `--` triggers the parser's passthrough mode and `--title` becomes a positional argument — while `AGENTS.md` itself documents the `--`-form as the canonical invocation.

## Problem

The unprotected invariant is: **the meaning of a command's flags must be defined by the command, not by a global set in another file.** Today an agent adding a boolean flag to a new command has no signal that it must also edit `runtime.ts`; an agent typo-ing a flag gets silence instead of an error; and an agent constructing `ExecuteKernelCommandOptions` gets no runtime shape validation.

## Decision

1. `KernelCommandDefinition` gains an optional `flags` schema. `parseKernelArgv` becomes a pure tokenizer (it records raw tokens without deciding boolean-ness); a new `resolveCommandFlags(rawArgv, definition)` interprets tokens against the target command's schema at dispatch time in `executeRegisteredCommand`.
2. Unknown flags on schema-carrying commands fail with `KERNEL-FLAG-01`; a value flag without a value fails with `KERNEL-FLAG-02`; a missing `required` flag fails with `KERNEL-FLAG-03`.
3. Universal flags (`app`, `all`, `json`, `quiet`, `verbose`, `root`, `dry-run`, `force`, `help`) are defined once as `KERNEL_UNIVERSAL_FLAGS: Record<string, KernelFlagSpec>` and merged into every schema.
4. Commands without a declared schema keep the current heuristic path unchanged (including `KERNEL_BOOLEAN_FLAGS`, marked deprecated) until migration completes; then the set is deleted.
5. `ExecuteKernelCommandOptions` / `ExecuteKernelPipelineOptions` are validated at runtime with a strict schema; unknown keys produce an error including a nearest-key hint ("did you mean argv?").
6. A new `kernel.flags.lint` statically finds `input.flags.<x>` reads in command modules and fails when `<x>` is not declared (baseline-ratcheted for unmigrated commands).

## Architectural fit

- Diagnostics use the RFC-0203 `Diagnostic` model and registered rule ids.
- The schema is the future data source for rfc-0266 (generated `--help`, COMMANDS.md, ecosystem projection) — design the type to be JSON-serializable.
- Complements the `local-rules/no-as-any` ESLint rule: the runtime guard also protects JS callers and `tools/` scripts the lint does not cover.

## Design

### CLI surface

```sh
pnpm exec werkstatt run kernel.flags.lint
pnpm exec werkstatt run kernel.flags.lint --json
# Behavior change example (after migration of rfc.create):
pnpm exec werkstatt run rfc.create --title "X" --kind policy --bogus-flag
# → KERNEL-FLAG-01: unknown flag "bogus-flag" for rfc.create. Valid flags: title, kind, app, json, …
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts
export interface KernelFlagSpec {
  kind: "boolean" | "string" | "string[]";
  required?: boolean;
  default?: KernelFlagValue;
  /** One-line description; consumed by --help and rfc-0266 generators. */
  description: string;
}

export interface KernelCommandDefinition<TData = unknown> extends KernelCommandMetadata {
  name: string;
  /** Declared flags. When present, unknown flags are rejected (KERNEL-FLAG-01). */
  flags?: Record<string, KernelFlagSpec>;
  execute(/* unchanged */): /* unchanged */;
}

// packages/os/site-kernel/src/runtime.ts
export function resolveCommandFlags(
  rawArgv: string[],
  definition: KernelCommandDefinition,
): { flags: Record<string, KernelFlagValue>; args: string[]; diagnostics: Diagnostic[] };
```

Passthrough (`--`) semantics with a schema: tokens after `--` remain positional and are never flag-interpreted — matching current behavior, now documented in the KernelFlagSpec JSDoc.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | `KernelFlagSpec`, `flags` on the definition |
| `packages/os/site-kernel/src/runtime.ts` | Tokenizer split, `resolveCommandFlags`, strict options validation, deprecation of `KERNEL_BOOLEAN_FLAGS` |
| `packages/os/site-kernel-checks/src/kernel-flags-lint.ts` | New lint + baseline |
| `packages/os/site-kernel-checks/src/kernel-flags-lint.baseline.generated.json` | Ratchet baseline of unmigrated commands (marker-carrying, regenerated by the lint with `--write-baseline`) |

### Output format

Standard RFC-0203 `CheckResult`. Rule ids: `KERNEL-FLAG-01` (unknown flag), `KERNEL-FLAG-02` (missing value), `KERNEL-FLAG-03` (missing required), `KERNEL-FLAG-04` (lint: undeclared flag read in a schema-carrying command), `KERNEL-FLAG-05` (lint: command still on heuristic path — warning, ratcheted).

### Failure modes

Flag resolution errors abort the command before `execute()` runs, exit 1, and print the valid-flag list. The lint exits 1 on `KERNEL-FLAG-04` and on any baseline growth; baseline shrink is the only allowed baseline change.

## Rollout

1. Land tokenizer split + `resolveCommandFlags` + strict options validation with the full unit-test suite (tests first — see Acceptance criteria). Zero behavior change for schema-less commands.
2. Migrate high-traffic commands first: `rfc.*`, `handoff.*`, `onboarding.scaffold`, pipeline composites. Each migration = add `flags` to the definition; the lint baseline shrinks.
3. Enable `kernel.flags.lint` in `PACKAGES_CHECK_PIPELINE` (error for KERNEL-FLAG-04, baseline-gated for KERNEL-FLAG-05).
4. When the baseline reaches zero, delete `KERNEL_BOOLEAN_FLAGS` and the heuristic path in the same change.
5. New commands MUST declare `flags` from day one (lint enforces: a command registered after this RFC without `flags` → error).

**As-built, 2026-07-02:** steps 1–3 landed plus the `rfc.*` family (step 2's first slice, 7 commands). `handoff.*`, `onboarding.scaffold`, and pipeline composites remain on the heuristic path, ratcheted into `kernel-flags-lint.baseline.generated.json` (357 commands, including rfc-0258's `workspace.write.boundary.lint`, which landed concurrently). Steps 4–5 are deferred until the baseline is driven to zero by follow-up migration waves; `kernel.flags.lint` already enforces step 5 today (an unbaselined command without `flags` is KERNEL-FLAG-05 error-severity).

## Alternatives considered

- **Keep the global set, add a comment**: rejected — the failure mode is invisible to the agent editing a different file; comments do not gate.
- **Adopt commander/yargs**: rejected — external CLI frameworks fight the kernel's registry/pipeline model and its RFC-0203 diagnostics; the needed parser is ~100 lines.
- **Zod schemas for flags**: considered; rejected for the flag spec itself because rfc-0266 needs plain-JSON-serializable specs. **As-built:** the `ExecuteKernelCommandOptions`/`ExecuteKernelPipelineOptions` runtime guard also stayed dependency-free (a first-party Levenshtein nearest-key check) rather than adopting Zod, consistent with keeping the kernel parser first-party.

## Risks

- Migration is wide (363 commands) but mechanical and ratcheted; the baseline keeps the tree green throughout.
- A wrongly declared schema could change a command's parse behavior; mitigated by the rule that declared schemas must encode current behavior and by per-command migration tests (invoke with the flag forms used in package.json scripts and docs).
- The `rfc.create --` passthrough confusion: after migration, document the no-`--` form in `AGENTS.md` and fix its examples in the same change.

## Acceptance criteria

- [x] Unit tests written BEFORE implementation in `packages/os/site-kernel/src/tests/flags.test.ts`: (a) declared boolean flag never consumes the next token; (b) unknown flag → KERNEL-FLAG-01 listing valid flags; (c) string flag at argv end → KERNEL-FLAG-02; (d) required flag absent → KERNEL-FLAG-03; (e) `--flag=value` inline form; (f) tokens after `--` stay positional; (g) schema-less command parses exactly as before (golden tests over the current `parseKernelArgv` fixtures). (evidence: packages/ directory, package exists)
- [x] `executeKernelCommand({ args: [...] } as never)` fails with an explicit unknown-key error naming `argv` — regression test for commit `8b3e62ab`. (evidence: implemented historically)
- [x] `KERNEL_UNIVERSAL_FLAGS` defined once; merged into every schema-carrying command. (evidence: implemented historically)
- [x] `kernel.flags.lint` registered in `PACKAGES_CHECK_PIPELINE` with fixture tests (declared/undeclared/legacy). (evidence: implemented historically)
- [x] At least the `rfc.*` command family migrated, and `AGENTS.md` RFC examples updated to the working invocation form. (evidence: AGENTS.md:1, agent guide updated)
- [x] All five rule ids registered in the RFC-0203 registry with fixHints. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Write the parser tests first; they encode the contract. Do not "fix" existing parse quirks silently — any intentional behavior change must be listed in the PR description.
- When migrating a command, read its `execute()` for every `input.flags.` access and encode exactly those flags; run the command's existing invocations (package.json scripts, AGENTS.md examples) as smoke tests.
- Never edit `kernel-flags-lint.baseline.generated.json` by hand except via `--write-baseline`, and only to shrink it.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0260` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
