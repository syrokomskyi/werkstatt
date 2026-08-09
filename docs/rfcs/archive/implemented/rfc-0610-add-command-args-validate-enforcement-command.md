---
id: RFC-0610
title: "Add command.args.validate enforcement command"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt: 2026-07-30
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0260
  - RFC-0609
  - DNA-54
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - command.args.validate
  added:
    - command.args.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "command.args.validate passes with zero violations when all registered commands use flag-only arguments."
  - "command.args.validate detects any command handler that reads input.args[0] or references the removed args field."
  - "command.args.validate detects any command registration with flags: {} that should declare an id flag."
  - "The command catches new non-compliant commands before they are merged."
nonGoals:
  - "Do not validate flag naming conventions across domains — each domain may use its own flag name (--id, --mission, --spec, --site). The standard is flag-only vs positional, not flag name uniformity."
  - "Do not validate flag descriptions or help text quality — that is a documentation concern, not a structural one."
  - "Do not validate command-specific flag schemas (e.g. whether a flag should be required or optional) — that is the command author's responsibility."
  - "Do not replace KERNEL-FLAG-01 or KERNEL-ARG-01 — those are runtime checks. This command is a static analysis check over command registrations and handler source code."
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

# RFC-0610: Add command.args.validate enforcement command

## Context

RFC-0609 establishes the flag-only standard for all Site OS commands: entity identifiers must be passed via declared flags, positional arguments are removed from `KernelCommandInput`, and `resolveCommandFlags` emits KERNEL-ARG-01 for positional tokens. However, the standard is only as durable as its enforcement. Without an automated check, a new command can be registered with `flags: {}` and a handler reading `input.args[0]` — reintroducing the exact inconsistency RFC-0609 eliminated.

The kernel already has a pattern of static analysis validators: `generator.ownership.lint` checks that generated files have a single owning template, `forge.skill.validate` checks skill files for compliance. This RFC adds an analogous validator for command argument patterns.

## Problem

After RFC-0609 is implemented, there is no automated guard against regression. A developer or agent can:

1. Register a new command with `flags: {}` and read `input.args[0]` in the handler — violating the flag-only standard.
2. Add `?? input.args[0]` as a fallback in a handler — reintroducing the dual-path pattern.
3. Reference the removed `input.args` field in a new handler — relying on a field that should not exist.

Each of these violations is currently invisible until someone tries to use the command with `--id` and gets a KERNEL-FLAG-01 error — the exact problem RFC-0609 was created to solve.

## Decision

The kernel gains a `command.args.validate` command that statically analyzes all registered command definitions and their handler source code for compliance with the flag-only standard established by RFC-0609. The command is added to `PACKAGES_CHECK_PIPELINE` so non-compliant commands fail the workspace package check.

## Architectural fit

- **RFC-0609 (flag-only standard):** This RFC is the enforcement layer for RFC-0609. RFC-0609 establishes the standard; this RFC prevents regression.
- **RFC-0260 (typed flag schemas):** This RFC extends the flag schema validation from runtime (KERNEL-FLAG-01) to static analysis — catching violations before the command is ever invoked.
- **RFC-0393 (forge bindings):** By ensuring all commands use flag-only arguments, this RFC indirectly supports uniform forge.yaml binding templates (`--<flag> {id}` format). However, this RFC does not directly enforce DNA-54 — DNA-54 governs hardcoded literals in forge skill bodies, not command argument patterns.

## Design

### CLI surface

```sh
pnpm exec werkstatt run command.args.validate --json
pnpm exec werkstatt run command.args.validate
```

Scope: `workspace`. No flags needed — the command scans all registered commands in the kernel registry and their handler source files.

### Detection rules

The command performs three static analysis checks:

**ARG-COMPLIANCE-01** — Handler reads `input.args`. After RFC-0609, `KernelCommandInput` no longer has an `args` field. Any handler source file that references `input.args` is non-compliant. While TypeScript also flags this as a type error after RFC-0609, the validator provides structured `CheckResult` diagnostics with fix hints integrated into the `packages-check` pipeline, and catches violations without requiring a full typecheck pass. The check scans handler source files for the pattern `input.args` (after stripping comments and string literals).

**ARG-COMPLIANCE-02** — Command registered with `flags: {}` but handler reads an entity id. A command that declares no flags but whose handler reads `input.flags["id"]` (or any named flag via string literal) is inconsistent — either the flag should be declared in the schema, or the handler should not read it. This catches commands where the registration was not updated to match the handler. This is the only rule that TypeScript cannot catch — it is a structural inconsistency between registration and handler, not a type error.

**ARG-COMPLIANCE-03** — Dual-path fallback (`?? input.args[0]`). Any handler that contains `?? input.args[0]` or `|| input.args[0]` is using the dual-path pattern explicitly prohibited by RFC-0609. Like ARG-COMPLIANCE-01, TypeScript flags this as a type error after RFC-0609 (since `input.args` is removed), but the validator provides structured diagnostics with fix hints.

### TypeScript contracts

```ts
interface CommandArgsViolation {
  rule: "ARG-COMPLIANCE-01" | "ARG-COMPLIANCE-02" | "ARG-COMPLIANCE-03";
  command: string;      // Command name (e.g. "rfc.validate")
  file: string;         // Handler source file path
  line?: number;        // Line number of the violation
  message: string;
  fix: string;          // "Declare the id flag in the command's flags schema and read input.flags[\"id\"]"
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/command-args-validate.ts` | New module — implements `runCommandArgsValidate` |
| `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts` | Register command (alongside `kernel.flags.lint` and `kernel.io.lint`) |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Add command to `PACKAGES_CHECK_PIPELINE` |
| `packages/forge/os/**/*.module.ts` | Scanned for command registrations (flags schema) |
| `packages/os/site-kernel-checks/src/command-tables/*.ts` | Scanned for command registrations (data-driven `CheckCommandEntry[]` tables) |
| `packages/os/site-kernel-*/src/**/*.ts` | Scanned for handler source code (input.args references) |

### Output format

```json
{
  "command": "command.args.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "ARG-COMPLIANCE-01",
      "command": "some.new.command",
      "file": "packages/forge/os/some/handler.ts",
      "line": 42,
      "message": "Handler reads input.args[0] — flag-only standard requires input.flags[\"id\"]",
      "fix": "Declare id in the command's flags schema and read input.flags[\"id\"]"
    }
  ]
}
```

### Failure modes

- **ARG-COMPLIANCE-01** (error): Handler references `input.args`. After RFC-0609, this field does not exist — the reference is a type error and a standard violation.
- **ARG-COMPLIANCE-02** (error): Command registered with `flags: {}` but handler reads `input.flags["<name>"]`. The flag should be declared in the schema.
- **ARG-COMPLIANCE-03** (error): Handler contains `?? input.args[0]` or `|| input.args[0]` — dual-path pattern prohibited by RFC-0609.
- The command exits non-zero on any violation.
- The command is read-only — it does not modify files.

## Rollout

- **Dependency:** RFC-0609 must be implemented first. This RFC's checks assume `input.args` no longer exists in `KernelCommandInput`. If RFC-0609 is not yet implemented, ARG-COMPLIANCE-01 will produce false positives on the 6 commands that still use positional args.
- **Default behavior:** The command runs in `PACKAGES_CHECK_PIPELINE` in fail mode from the start. Since RFC-0609 migrates all existing commands before this RFC is implemented, there should be zero violations on the first run.
- **Existing apps:** No app-level changes — the command scans command registrations and handler source code, not app content.
- **New apps:** Automatically benefit — any new command registered with positional args is caught at build time.
- **Integration with `PACKAGES_CHECK_PIPELINE`:** The command is added to `PACKAGES_CHECK_PIPELINE` (in `packages-check.ts`), alongside `kernel.flags.lint`, `kernel.io.lint`, and `generator.ownership.lint` — all workspace-level governance checks over command/kernel source code. It runs on every `packages-check.run` invocation.

## Alternatives considered

- **Rely on TypeScript compiler only:** After RFC-0609 removes `args` from `KernelCommandInput`, TypeScript will flag `input.args` references (including `?? input.args[0]`) as type errors. This catches ARG-COMPLIANCE-01 and ARG-COMPLIANCE-03 at the type level. Rejected as sufficient — TypeScript does not catch ARG-COMPLIANCE-02 (flags: {} with handler reading a named flag), which is a structural inconsistency between registration and handler, not a type error. Additionally, the validator provides structured `CheckResult` diagnostics with fix hints integrated into the `packages-check` pipeline, and catches violations in CI without requiring a full typecheck pass.

- **Add a lint rule to eslint:** Rejected — eslint rules are generic and would need custom rule development. The kernel's validator pattern (CheckResult, build.check integration) is already established and provides better error messages with fix hints.

- **Manual review during PR:** Rejected — manual review is unreliable, especially with AI agents creating commands. The whole point of RFC-0609 + RFC-0610 is automated enforcement.

## Risks

- **False positives from string literals:** A handler might contain `input.args` in a comment or string literal, not as actual code. Mitigation: the source scanner uses the same comment and string-literal exclusion approach as `generated-timestamp-validate.ts` (RFC-0602) — lines starting with `//` or inside `/* */` blocks are skipped, and matches inside string literals are skipped.
- **False positives from dynamic flag access:** A handler might use `input.flags[flagName]` where `flagName` is a variable, not a string literal. The check for ARG-COMPLIANCE-02 should only flag `flags: {}` registrations where the handler reads a specific named flag via string literal — not dynamic flag access patterns.
- **Performance:** Scanning all handler source files on every `packages-check.run` adds overhead. Mitigation: the scan is limited to `packages/forge/os/**/*.ts`, `packages/os/site-kernel-checks/src/command-tables/*.ts`, and `packages/os/site-kernel-*/src/**/*.ts` — a bounded set of files (~60-90 files). The scan uses regex, not AST parsing, so it is fast.
- **Agent misinterpretation risk:** An agent might see ARG-COMPLIANCE-02 and think it means "all commands must have flags" — but commands that genuinely take no arguments (e.g. `docs.archive`) are compliant with `flags: {}` as long as the handler does not read any flags. The error message should clarify: "Handler reads input.flags['id'] but command declares flags: {} — add the flag to the schema."
- **`as any` escape hatch:** A handler might use `(input as any).args` to bypass both TypeScript's type check and the regex scanner (which looks for `input.args` as a literal pattern). The existing `no-as-any` ESLint rule is the first line of defense against this pattern. The validator does not attempt to catch `as any` casts — that is the lint's responsibility.

## Acceptance criteria

- [x] `command.args.validate` command registered in `07-structure-naming.ts` with `scope: workspace` (evidence: packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts:204-219, `pnpm exec werkstatt run command.args.validate --json` exits 0)
- [x] `runCommandArgsValidate` implemented in `packages/os/site-kernel-checks/src/command-args-validate.ts` (evidence: packages/os/site-kernel-checks/src/command-args-validate.ts:285-376, `pnpm --filter @warpgogol/site-kernel-checks exec tsc --noEmit` passes)
- [x] ARG-COMPLIANCE-01 detects handler source files that reference `input.args` (evidence: packages/os/site-kernel-checks/src/command-args-validate.ts:222-264, test `ARG-COMPLIANCE-01: detects input.args reference` passes)
- [x] ARG-COMPLIANCE-02 detects command registrations with `flags: {}` whose handler reads a named flag (evidence: packages/os/site-kernel-checks/src/command-args-validate.ts:270-282, tests `ARG-COMPLIANCE-02: hasEmptyFlags*` and `extractNamedFlagReads*` pass)
- [x] ARG-COMPLIANCE-03 detects `?? input.args[0]` and `|| input.args[0]` patterns (evidence: packages/os/site-kernel-checks/src/command-args-validate.ts:240-257, tests `ARG-COMPLIANCE-03: detects ?? input.args[0]` and `|| input.args[0]` pass)
- [x] Comment and string-literal exclusion prevents false positives (evidence: packages/os/site-kernel-checks/src/command-args-validate.ts:228-232 uses `stripCommentsAndStrings`, tests `comment exclusion` and `string-literal exclusion` pass)
- [x] Command added to `PACKAGES_CHECK_PIPELINE` (evidence: packages/os/site-kernel-checks/src/pipelines/packages-check.ts:142-143, `{ command: "command.args.validate" }` after `kernel.io.lint`)
- [x] `--json` output follows standard `CheckResult` shape with `diagnostics[]` (evidence: `pnpm exec werkstatt run command.args.validate --json` returns `{ data: { command, status, diagnostics, summary } }`)
- [x] Unit test in `src/tests/command-args-validate.test.ts` covers all three rules, comment exclusion, and clean-pass scenarios (evidence: packages/os/site-kernel-checks/src/tests/command-args-validate.test.ts, 14 tests pass)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0610 --json` exits 0 with zero violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- **RFC-0609 MUST be implemented first.** This RFC's checks assume `input.args` is removed from `KernelCommandInput`. Implementing this RFC before RFC-0609 will produce false positives on the 6 commands that still use positional args.
- The source scanner should use the same `stripCommentsAndStrings` approach as `generated-timestamp-validate.ts` (RFC-0602) to avoid false positives from comments and string literals.
- The scanner should scan handler source files in `packages/forge/os/**/*.ts`, `packages/os/site-kernel-checks/src/command-tables/*.ts`, and `packages/os/site-kernel-*/src/**/*.ts` — not all `.ts` files in the monorepo.
- ARG-COMPLIANCE-02 should only flag `flags: {}` registrations where the handler reads a specific named flag via string literal (e.g. `input.flags["id"]`). Dynamic flag access (`input.flags[variable]`) should not trigger this rule.
- The command MUST be added to `PACKAGES_CHECK_PIPELINE` in fail mode (not warning mode) — since RFC-0609 migrates all existing commands first, there should be zero violations on the first run.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0610 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
