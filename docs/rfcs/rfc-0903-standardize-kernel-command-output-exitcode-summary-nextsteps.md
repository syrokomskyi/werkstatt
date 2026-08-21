---
id: RFC-0903
title: "Standardize kernel command output: exitCode, summary, nextSteps"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0542
  - RFC-0579
  - RFC-0609
  - RFC-0260
  - DNA-35
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-82
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - werkstatt.commands.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt-shared"
successSignals:
  - "werkstatt.commands.validate is registered and runnable"
  - "werkstatt.commands.validate reports zero violations after all command handlers are fixed"
  - "Every return path in packages/werkstatt/src/ and packages/werkstatt-site/src/ command handlers has explicit exitCode, summary with [command.name] prefix, and nextSteps on failure"
  - "DNA-82 is documented in docs/architecture-dna.md"
nonGoals:
  - "Does not standardize command naming convention (hyphens vs dots) — deferred to a separate RFC"
  - "Does not require nextSteps on success paths — nextSteps remain optional on success"
  - "Does not add werkstatt.commands.validate to PACKAGES_CHECK_PIPELINE — gated adoption (register only, pipeline integration deferred until all commands comply)"
  - "Does not cover forge CLI commands — forge has its own output contract (RFC-0542)"
  - "Does not change the KernelCommandResult type or KernelNextStep interface"
  - "Does not change the rendering of nextSteps in execute-command.ts or forge CLI"
  - "Does not require nextSteps on pass-state validators (empty array or undefined is acceptable on success)"
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

# RFC-0903: Standardize kernel command output: exitCode, summary, nextSteps

## Context

The Werkstatt kernel has 257 registered commands across `packages/werkstatt/src/` (engine) and `packages/werkstatt-site/src/` (site plugin). RFC-0579 introduced `nextSteps` as an optional field in `KernelCommandResult` and populated it for `mission.validate` and archive commands. RFC-0542 established a self-documenting output contract for the forge CLI (separate runtime, separate package). RFC-0609 standardized command argument patterns to flag-only.

Despite these prior efforts, the engine and site plugin command output remains inconsistent:

- **`exitCode`**: Many success return paths omit `exitCode: 0`, relying on the runtime default (`result?.exitCode ?? 0` in `execute-command.ts:241`). This caused test failures where `result.exitCode` was `undefined` on success paths (documented in session memory about `mission.validate` tests).
- **`summary`**: Some modules prefix summaries with `[command.name]` (nachweis, mission, leitstand), others use `command: OK` (check commands via `passResult`), and some omit `summary` entirely.
- **`nextSteps`**: Present in 78 of 637 files with return statements. Three modules (`integrity.*`, `artifact.store.*`, `changelog.*`) have zero `nextSteps` on any return path, including failure paths. The `result-helpers.ts` `failResult`/`diagnosticsResult` functions auto-generate default failure `nextSteps`, but commands that bypass helpers have no such safety net.

There is no automated enforcement of output format consistency. A command handler can return `{ data, summary }` without `exitCode` or `nextSteps` and nothing catches it until a test or runtime consumer breaks.

## Problem

- **No invariant requires explicit `exitCode` on success paths.** The runtime default `?? 0` masks missing `exitCode` values, making it impossible to distinguish "command forgot to set exitCode" from "command intentionally succeeded" in tests and programmatic consumers.
- **No invariant requires `summary` format consistency.** Agents and operators parsing command output cannot rely on a stable prefix pattern. Log aggregation tools cannot filter by command name reliably.
- **No invariant requires `nextSteps` on failure paths.** Three modules (`integrity.*`, `artifact.store.*`, `changelog.*`) return `exitCode: 1` without any `nextSteps`, leaving operators and agents without actionable guidance on what to do next.
- **No automated validator checks command output format.** The existing `result-helpers.ts` functions (`failResult`, `diagnosticsResult`) auto-generate `nextSteps` on failure, but commands that construct `KernelCommandResult` directly bypass this safety net. There is no static analysis that catches missing fields.
- **DNA-82 does not exist yet.** Without a DNA invariant, the standard is not formally established and cannot be referenced by other RFCs or enforced by `app.contract.full` (DNA-35).

## Decision

Every kernel command handler in `packages/werkstatt/src/` and `packages/werkstatt-site/src/` MUST return a `KernelCommandResult` where: (1) `exitCode` is explicitly set on every return path (both `0` and `1`); (2) `summary` is present on every return path and starts with the `[command.name]` prefix; (3) `nextSteps` is present and non-empty when `exitCode` is `1`, containing at least one `KernelNextStep` with `kind: "required"`. On success, `nextSteps` is optional. A new `werkstatt.commands.validate` command performs static analysis of return statements in handler files to enforce these rules. DNA-82 codifies this standard.

## Architectural fit

- **DNA-82** (new): Establishes the kernel command output standard — explicit `exitCode`, `[command.name]`-prefixed `summary`, `nextSteps` on failure.
- **DNA-35** (`app.contract.full`): `werkstatt.commands.validate` is a workspace-level validator that can be integrated into `PACKAGES_CHECK_PIPELINE` once all commands comply, contributing to the canonical readiness signal.
- **RFC-0542**: Established self-documenting output for forge CLI commands. This RFC extends the same principle (structured `nextSteps`, consistent output) to the engine and site plugin kernel commands, which are a separate runtime surface.
- **RFC-0579**: Introduced `nextSteps` as an optional `KernelCommandResult` field. This RFC makes `nextSteps` mandatory on failure paths, building on RFC-0579's foundation.
- **RFC-0609**: Standardized command argument patterns to flag-only. This RFC standardizes command output format — the two are complementary (input standard + output standard).
- **Site OS operator model**: `werkstatt.commands.validate` is a `scope: workspace` command registered in the engine kernel. It scans handler files in `packages/werkstatt/src/` and `packages/werkstatt-site/src/` without executing commands.

## Design

### CLI surface

```sh
# Run from workspace root — scans all handler files in engine + site plugin
pnpm exec werkstatt run werkstatt.commands.validate

# JSON output for CI integration
pnpm exec werkstatt run werkstatt.commands.validate --json
```

**Flags**: Optional `--mode=warning|error` controls whether violations are blocking (default: `error`).

**Scope**: `workspace` — the command reads source files across packages but does not modify them.

### TypeScript contracts

No new types are introduced. The existing types are referenced:

```ts
// Existing — packages/werkstatt/src/kernel/types.ts:152-163
export interface KernelNextStep {
  action: string;
  kind: "required" | "optional";
}

export interface KernelCommandResult<TData = unknown> {
  data?: TData;
  exitCode?: number;
  summary?: string;
  timing?: KernelCommandTiming;
  nextSteps?: KernelNextStep[];
}
```

The validator produces diagnostics using the existing `Diagnostic` type:

```ts
interface CommandOutputViolation {
  ruleId: string;       // CMD-OUTPUT-01 | CMD-OUTPUT-02 | CMD-OUTPUT-03
  file: string;         // handler file path
  commandName: string;  // inferred from file/registration
  line?: number;        // return statement line (if extractable)
  message: string;
  severity: "error" | "warning";
}
```

**Rule IDs**:

- `CMD-OUTPUT-01`: Missing explicit `exitCode` on a return path.
- `CMD-OUTPUT-02`: Missing `summary` or `summary` does not start with `[command.name]`.
- `CMD-OUTPUT-03`: Return path with `exitCode: 1` has no `nextSteps` or empty `nextSteps`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/**/*.ts` | Scanned for command handler return statements |
| `packages/werkstatt-site/src/**/*.ts` | Scanned for command handler return statements |
| `packages/werkstatt/src/kernel/registry.ts` | Read to identify registered command names and handler file mappings |
| `packages/werkstatt-shared/src/checks/result-helpers.ts` | Read to identify helper-based returns (exempt from direct return scanning) |
| `docs/architecture-dna.md` | Updated with DNA-82 entry (already added in this RFC's preparation) |

The command does **not** modify any files. It produces diagnostics only.

### Output format

```json
{
  "command": "werkstatt.commands.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "CMD-OUTPUT-01",
      "file": "packages/werkstatt/src/integrity/integrity-check.ts",
      "commandName": "integrity.check",
      "line": 42,
      "message": "Return path missing explicit exitCode",
      "severity": "error"
    },
    {
      "ruleId": "CMD-OUTPUT-03",
      "file": "packages/werkstatt/src/changelog/changelog-generate.ts",
      "commandName": "changelog.generate",
      "line": 87,
      "message": "Failure return path (exitCode: 1) has no nextSteps",
      "severity": "error"
    }
  ],
  "summary": { "error": 2, "warning": 0, "info": 0 }
}
```

In pretty mode, violations are listed grouped by file with rule ID and message.

### Failure modes

- **CMD-OUTPUT-01** (error): A return statement in a command handler does not include `exitCode`.
- **CMD-OUTPUT-02** (error): A return statement is missing `summary`, or `summary` does not start with `[command.name]`.
- **CMD-OUTPUT-03** (error): A return statement has `exitCode: 1` but does not include `nextSteps` or includes an empty `nextSteps: []`.
- **Helper-exempt returns**: Return statements that delegate to `passResult`, `failResult`, `diagnosticsResult`, or `buildAuditResult` are exempt — the helpers are trusted to produce compliant output. The validator verifies helper compliance separately by scanning `result-helpers.ts`.
- **`--mode=warning`**: All violations become warnings (non-blocking, `exitCode: 0`). Default is `--mode=error` (blocking, `exitCode: 1`).
- **No handler files found**: Exits `0` with summary `[werkstatt.commands.validate] no handler files found`.
- **Static analysis limitations**: The validator uses regex/AST scanning of return statements. False negatives are possible for dynamically constructed return objects. False positives are possible for non-`KernelCommandResult` returns in the same file. Mitigated by only scanning files with command handler registration patterns (`registry.registerCommand` or `ALL_COMMANDS` entries).

## Rollout

**Gated adoption — no flag day:**

1. **Register `werkstatt.commands.validate`** as a standalone command. Do NOT add it to `PACKAGES_CHECK_PIPELINE` yet.
2. **Run the validator manually** to identify all non-compliant command handlers. The initial run will produce a large number of violations across ~150+ commands.
3. **Fix command handlers incrementally** — add explicit `exitCode`, `[command.name]`-prefixed `summary`, and failure `nextSteps` to each handler. Fixes can be batched by module (e.g. fix all `integrity.*` commands first, then `changelog.*`, etc.).
4. **Update `result-helpers.ts`** if needed — ensure `passResult` also returns explicit `exitCode: 0` and `[command.name]`-prefixed `summary` so that helper-based commands automatically comply.
5. **Once all commands comply**, a separate RFC adds `werkstatt.commands.validate` to `PACKAGES_CHECK_PIPELINE` as a blocking step.

**New commands** created after this RFC is accepted MUST comply from the start — agents writing new command handlers MUST include explicit `exitCode`, `[command.name]`-prefixed `summary`, and failure `nextSteps`.

**No migration tool** is provided — the validator is diagnostic-only. Fixes are manual edits to handler files.

## Alternatives considered

1. **Make `nextSteps` mandatory on all return paths (including success).** Rejected — would force empty `nextSteps: []` on pure query commands (`*.list`, `*.status`) where there is no meaningful next step. Creates noise without value. The failure-only requirement targets where guidance is actually needed.

2. **Runtime sampling instead of static analysis.** Rejected — running commands with test inputs to verify output shape is fragile, slow, and requires mock contexts. Static analysis of return statements is faster and catches structural issues without execution.

3. **Extend `result-helpers.ts` instead of adding a validator.** Rejected — helpers only cover commands that use them. Commands that construct `KernelCommandResult` directly bypass helpers. A validator is needed to catch all return paths regardless of how they construct the result.

4. **Include naming convention normalization (hyphens → dots).** Rejected — naming changes are breaking for existing pipeline definitions and `forge.yaml` bindings. Deferred to a separate RFC to keep this RFC focused on output format.

5. **Add to `PACKAGES_CHECK_PIPELINE` immediately in warning mode.** Rejected — even warning mode adds noise to every `mission.validate` run. Gated adoption (register only, run manually) is cleaner — fix first, then integrate into pipeline.

## Risks

- **False positives in static analysis**: The validator scans return statements by regex/AST patterns. Files that contain both command handlers and helper functions may produce false positives on non-`KernelCommandResult` returns. Mitigated by only scanning files with `registry.registerCommand` or `ALL_COMMANDS` patterns.
- **False negatives for dynamic returns**: Return objects constructed via spread (`return { ...base, exitCode: 1 }`) or conditional assignment may not be detected. This is an acceptable limitation — the validator catches the common case of direct object literal returns.
- **Large initial violation count**: The first run of `werkstatt.commands.validate` will report many violations across ~150+ commands. This is expected and not a blocker — the command is not in any pipeline. Fixes are incremental.
- **Agent misinterpretation**: Agents may interpret this RFC as requiring `nextSteps` on success paths. The RFC explicitly states `nextSteps` is optional on success. Agents MUST read the non-goals section.
- **Helper drift**: If `result-helpers.ts` is modified to not produce `[command.name]`-prefixed `summary` or explicit `exitCode`, all helper-based commands silently become non-compliant. The validator mitigates this by scanning `result-helpers.ts` separately.
- **Maintenance burden**: New command handlers must be checked manually until the validator is added to a pipeline. Agent discipline is required during the gated adoption period.

## Acceptance criteria

- [ ] DNA-82 is documented in `docs/architecture-dna.md` (evidence: `docs/architecture-dna.md:343-345`)
- [ ] `werkstatt.commands.validate` command is registered in the engine kernel with `scope: workspace`
- [ ] `werkstatt.commands.validate` produces `CMD-OUTPUT-01`, `CMD-OUTPUT-02`, `CMD-OUTPUT-03` diagnostics
- [ ] `werkstatt.commands.validate` exempts returns that delegate to `passResult`/`failResult`/`diagnosticsResult`/`buildAuditResult`
- [ ] `--json` output format is documented and stable (evidence: `--json` output includes `command`, `status`, `diagnostics`, `summary`)
- [ ] `--mode=warning|error` flag is implemented (default: `error`)
- [ ] Unit tests cover all three rule IDs and helper-exempt returns
- [ ] `packages/werkstatt-shared/src/checks/result-helpers.ts` `passResult` returns explicit `exitCode: 0` and `[command.name]`-prefixed `summary`
- [ ] `packages/werkstatt-shared/src/checks/result-helpers.ts` `failResult` returns `[command.name]`-prefixed `summary`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add `werkstatt.commands.validate` to `PACKAGES_CHECK_PIPELINE` during implementation — gated adoption means register only. Pipeline integration requires a separate RFC after all commands comply.
- Agents MUST NOT require `nextSteps` on success paths — `nextSteps` is optional on success per this RFC's decision and non-goals.
- Agents MUST NOT use this RFC to normalize command naming (hyphens → dots) — naming is explicitly a non-goal and requires a separate RFC.
- When fixing existing command handlers, agents SHOULD start with modules that have zero `nextSteps` (`integrity.*`, `artifact.store.*`, `changelog.*`) and then proceed by module.
- Agents MUST verify `result-helpers.ts` compliance separately — if `passResult` or `failResult` do not produce `[command.name]`-prefixed `summary` or explicit `exitCode`, fix the helpers first so that all helper-based commands automatically comply.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec forge rfc.supersede.propose --id RFC-0903 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
