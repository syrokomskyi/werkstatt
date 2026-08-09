---
id: RFC-0645
title: "Eliminate TIMESTAMP_ALLOWLIST and source-scanning timestamp validator"
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0602
  - RFC-0601
  - RFC-0626
  - RFC-0644
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
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
    - generated.drift.validate
  removed:
    - generated.timestamp.validate
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "generated.timestamp.validate command is removed from all pipelines and command tables."
  - "TIMESTAMP_ALLOWLIST array is deleted from generated-timestamp-validate.ts (or the file is deleted entirely)."
  - "generated.drift.validate DRIFT-02 is promoted from info to error severity — generators without dryRun support fail validation."
  - "All generators in GENERATOR_OWNERSHIP_MAP support dryRun mode (no DRIFT-02 errors)."
  - "mission.validate passes without generated.timestamp.validate in the pipeline."
nonGoals:
  - "Do not replace generated.drift.validate with a new mechanism — it already detects non-determinism via output comparison (RFC-0601, DNA-58)."
  - "Do not add source-code static analysis for timestamp patterns — output-based drift detection is sufficient and more accurate."
  - "Do not change GENERATOR_OWNERSHIP_MAP structure or contents — it remains the canonical registry of generated files and their owning commands."
  - "Do not remove the stripCommentsAndStrings utility if it is still imported by command-args-validate.ts — only remove it if no other consumers remain."
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

# RFC-0645: Eliminate TIMESTAMP_ALLOWLIST and source-scanning timestamp validator

## Context

`generated.timestamp.validate` (RFC-0602) scans TypeScript source files of generator modules for volatile timestamp patterns (`new Date().toISOString()`, `new Date()`, `Date.now()`, `process.env.BUILD_TIMESTAMP`). Modules that use these patterns for runtime logic (not generated-file fields) are exempted via a manually-maintained `TIMESTAMP_ALLOWLIST` array. RFC-0626 added a parity check (TS-TIME-02) that errors when a generator module uses volatile timestamps but is missing from the allowlist.

This architecture has a recurring friction point: every time a generator module uses `new Date()` for runtime operational logic (release timestamps, freshness checks, signing proofs), the developer must manually add it to `TIMESTAMP_ALLOWLIST` with a reason. If they forget, `mission.validate` fails with TS-TIME-02, blocking the mission workflow until the allowlist is updated.

During mission `warpgogol-com-m000024`, `release-commands.ts` was flagged by TS-TIME-02 because it uses `new Date().toISOString()` in 4 places for release lifecycle operational records (build-identity, release.publish, release.rollback). The module is in `GENERATOR_OWNERSHIP_MAP` because it generates `build-identity.json`, but 3 of the 4 timestamp usages are runtime operational records, not generated-file fields. The fix was to manually add the module to `TIMESTAMP_ALLOWLIST` — the same manual discipline pattern that RFC-0626 was designed to catch.

Meanwhile, `generated.drift.validate` (RFC-0601, DNA-58) already detects non-determinism more accurately: it re-invokes each generator in dryRun mode and compares the rendered output against the committed file. If a generator uses `new Date()` in its output, the rendered content will differ from the committed file, producing a DRIFT-01 error. This is a stronger check than source-scanning because it catches actual non-determinism in output, not just patterns in source code.

## Problem

`generated.timestamp.validate` and `TIMESTAMP_ALLOWLIST` create a maintenance burden and recurring workflow friction:

1. **Manual allowlist maintenance** — every generator module that uses `new Date()` for runtime logic must be manually added to `TIMESTAMP_ALLOWLIST`. Forgetting this causes `mission.validate` to fail with TS-TIME-02, blocking the mission workflow.

2. **Redundant with `generated.drift.validate`** — `generated.drift.validate` (RFC-0601) already detects non-determinism in generated files by comparing dryRun output against committed files. If a generator writes `new Date()` to its output, drift is detected. Source-scanning for timestamp patterns is redundant — it catches patterns in source code that may or may not affect output, while drift detection catches actual non-determinism in output.

3. **False positives** — `generated.timestamp.validate` flags `new Date()` in source code even when the timestamp is used for runtime logic (release records, freshness checks, signing proofs) and never written to a generated file. The `TIMESTAMP_ALLOWLIST` exists solely to suppress these false positives. Without source-scanning, there are no false positives to suppress.

4. **DRIFT-02 is too lenient** — generators without dryRun support are skipped with info severity (DRIFT-02), meaning non-determinism in those generators' output goes undetected. This is a gap in DNA-58 enforcement.

## Decision

The `generated.timestamp.validate` command is removed from all pipelines and command tables. The `TIMESTAMP_ALLOWLIST` array and all related source-scanning logic (`scanModuleForTimestamps`, `runPhase1`, `checkAllowlistParity`, `VOLATILE_PATTERNS`, `RULE_ID`, `RULE_ID_PARITY`) are deleted. The `generated.drift.validate` command (RFC-0601) is the sole mechanism for enforcing generated-file determinism (DNA-58). DRIFT-02 is promoted from info to error severity — generators without dryRun support fail validation, forcing all generators to support dryRun mode.

## Architectural fit

- **DNA-58 (Generated-file content determinism)** — `generated.drift.validate` is the canonical enforcement mechanism. Removing `generated.timestamp.validate` eliminates a redundant check that produced false positives.
- **RFC-0601** — established `generated.drift.validate` with dryRun output comparison. This RFC makes it the sole determinism check by removing the source-scanning alternative.
- **RFC-0602** — established `generated.timestamp.validate`. This RFC supersedes and removes it, recognizing that output-based drift detection is sufficient and more accurate.
- **RFC-0626** — added TS-TIME-02 parity check and `TIMESTAMP_ALLOWLIST` maintenance. This RFC eliminates both — no allowlist means no parity check needed.
- **Site OS operator model** — `generated.timestamp.validate` is removed from the `build.check` pipeline. `generated.drift.validate` remains as the sole determinism check in `build.check`.

## Design

### CLI surface

No new CLI commands. The `generated.timestamp.validate` command is removed:

```sh
# Removed from all pipelines:
# pnpm exec werkstatt run generated.timestamp.validate --site <id>

# Still available (sole determinism check):
pnpm exec werkstatt run generated.drift.validate --site <id>
```

### TypeScript contracts

No new types. The following are deleted from `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts`:

- `TIMESTAMP_ALLOWLIST` array and `TimestampAllowlistEntry` interface
- `VOLATILE_PATTERNS` array
- `RULE_ID` and `RULE_ID_PARITY` constants
- `scanModuleForTimestamps` function
- `runPhase1` function and `Phase1Result` interface
- `checkAllowlistParity` function
- `runGeneratedTimestampValidate` function (the command handler)
- `stripCommentsAndStrings` function — **only if no other module imports it**. `command-args-validate.ts` currently imports it; if that import is removed or replaced, the function can be deleted. Otherwise, it stays as a utility export.

The entire file `generated-timestamp-validate.ts` is deleted if no consumers remain. If `stripCommentsAndStrings` is still needed by `command-args-validate.ts`, the file is kept with only that function exported.

### DRIFT-02 severity promotion

In `packages/os/site-kernel-checks/src/generated-drift-validate.ts` and `diagnostics/rules/core-infra.ts`:

- DRIFT-02 severity changes from `info` to `error`
- The diagnostic message remains the same: `Generator "<command>" does not support dryRun mode; skipped.`
- The effect: `generated.drift.validate` fails when any generator in `GENERATOR_OWNERSHIP_MAP` does not support dryRun mode

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` | Deleted (or reduced to `stripCommentsAndStrings` only if still imported) |
| `packages/os/site-kernel-checks/src/generated-drift-validate.ts` | Modified: DRIFT-02 severity promoted from info to error |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | Modified: DRIFT-02 rule severity changed from info to error; TS-TIME-01 rule descriptor deleted (TS-TIME-02 was never registered here — it exists only as `RULE_ID_PARITY` constant in `generated-timestamp-validate.ts`) |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Modified: remove `generated.timestamp.validate` step from pipeline |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Modified: remove `generated.timestamp.validate` command entry and import |
| `packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts` | Deleted |
| `packages/os/site-kernel-checks/src/command-args-validate.ts` | Modified: remove `stripCommentsAndStrings` import if the function is deleted, or keep if the function remains |

### Output format

`generated.drift.validate` output is unchanged. The removed `generated.timestamp.validate` output is no longer produced.

### Failure modes

- **Generator without dryRun support**: DRIFT-02 error — `generated.drift.validate` fails. The generator must be updated to support dryRun mode before validation can pass.
- **Non-deterministic generator output**: DRIFT-01 error — same as before, no change.
- **Generator that uses `new Date()` for runtime logic only** (not in output): no error. Source-scanning no longer flags this. Drift detection only checks output files.

## Rollout

- **Default behavior**: `generated.timestamp.validate` is removed. `generated.drift.validate` with DRIFT-02 as error is the sole determinism check.
- **Pre-implementation check**: before implementing this RFC, audit all generators in `GENERATOR_OWNERSHIP_MAP` for dryRun support. Any generator without dryRun must be updated to support it before this RFC can be implemented. The audit is part of the implementation work, not a separate RFC.
- **Pipeline integration**: `build.check` pipeline loses the `generated.timestamp.validate` step. `generated.drift.validate` remains.
- **No migration path needed**: there is no data to migrate. The `TIMESTAMP_ALLOWLIST` entries are deleted, not migrated.
- **Deprecation**: `generated.timestamp.validate` is removed without a deprecation period. Legacy and backward compatibility are not preserved per operator instruction.
- **Version bump justification**: `versionBump: patch` is appropriate because `generated.timestamp.validate` is an internal kernel command with no external consumers. The only pipeline consumer (`build.check`) is modified in the same RFC. No script or agent outside the monorepo invokes this command — it is not a public API.

## Alternatives considered

1. **Keep both validators, automate allowlist via data-flow analysis** — RFC-0626 non-goal explicitly rejected this: "Do not replace the manual allowlist with automated data-flow analysis to distinguish runtime timestamp usage from generated-file timestamp usage — the allowlist approach is sufficient and maintainable." Experience has shown the allowlist approach is NOT sufficient — it creates recurring friction. This RFC goes further than RFC-0626 anticipated and eliminates the need for any allowlist by removing source-scanning entirely.

2. **Replace source-scanning with output-file scanning** — scan generated output files for ISO datetime patterns instead of scanning source code. Rejected: `generated.drift.validate` already does this better by comparing dryRun output against committed files. Adding another output-scanning check would be redundant with drift detection.

3. **Keep `generated.timestamp.validate` as a fast pre-check** — source-scanning is faster than dryRun re-invocation. Rejected: the speed difference is negligible (source-scanning reads files, drift detection re-runs generators in dryRun mode which is already fast). The maintenance burden of the allowlist outweighs any speed benefit.

## Risks

- **Generator without dryRun support blocks validation** — promoting DRIFT-02 to error means any generator without dryRun support will fail `generated.drift.validate`, which in turn fails `mission.validate`. Mitigation: the implementation phase includes auditing all generators and adding dryRun support where missing. This is a one-time cost.
- **Non-determinism in generators without dryRun goes undetected until dryRun is added** — if a generator without dryRun uses `new Date()` in its output, the non-determinism was previously caught by `generated.timestamp.validate` source-scanning. After this RFC, it is only caught after dryRun support is added. Mitigation: the implementation phase adds dryRun to all generators, closing this gap.
- **`stripCommentsAndStrings` consumer** — `command-args-validate.ts` imports `stripCommentsAndStrings` from `generated-timestamp-validate.ts`. If the file is deleted, this import breaks. Mitigation: check for consumers before deleting; keep the function or move it to a shared utility module.
- **Agent confusion** — agents may try to add modules to `TIMESTAMP_ALLOWLIST` which no longer exists. Mitigation: the removal is self-documenting — the file no longer exists, and the command is no longer registered.
- **Broken dryRun implementation** — if a generator's dryRun mode produces incorrect output (differs from normal mode), `generated.drift.validate` will emit false DRIFT-01 errors. If dryRun throws an error or returns empty `renderedFiles`, DRIFT-02 errors will block validation. Mitigation: the pre-implementation audit must verify that each generator's dryRun output matches its normal output byte-for-byte (after line-ending normalization). Broken dryRun implementations are bugs to fix, not reasons to bypass the check.
- **Performance cost unchanged** — `generated.drift.validate` already re-invokes all generators with dryRun; promoting DRIFT-02 to error only changes the severity of the skip diagnostic, not the number of generators invoked. The build-time cost is the same before and after this RFC.

## Acceptance criteria

- [x] `generated.timestamp.validate` command removed from `command-tables/01-codegen.ts` (evidence: `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts:653` — array ends after `runOpenSourceValidate` entry)
- [x] `generated.timestamp.validate` step removed from `pipelines/build-check.ts` (evidence: `packages/os/site-kernel-checks/src/pipelines/build-check.ts:39` — pipeline ends after `generated.drift.validate`)
- [x] `TIMESTAMP_ALLOWLIST`, `VOLATILE_PATTERNS`, `scanModuleForTimestamps`, `runPhase1`, `checkAllowlistParity`, `runGeneratedTimestampValidate` deleted from `generated-timestamp-validate.ts` (evidence: file deleted in commit 477d559)
- [x] `generated-timestamp-validate.ts` file deleted (evidence: `git show --stat 477d559` — `delete mode 100644 packages/os/site-kernel-checks/src/generated-timestamp-validate.ts`; `stripCommentsAndStrings` inlined into `command-args-validate.ts:54-103`)
- [x] TS-TIME-01 rule descriptor deleted from `diagnostics/rules/core-infra.ts`; `TS-TIME-02` constant deleted with `generated-timestamp-validate.ts` (evidence: `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts:492-497` — only DRIFT-01 and DRIFT-02 remain for generated validators)
- [x] DRIFT-02 severity promoted from info to error in `generated-drift-validate.ts` and `diagnostics/rules/core-infra.ts` (evidence: `packages/os/site-kernel-checks/src/generated-drift-validate.ts:181,193` — `severity: "error"`; `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts:496` — `"error"`)
- [x] `tests/generated-timestamp-validate.test.ts` deleted (evidence: `git show --stat 477d559` — `delete mode 100644 packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts`)
- [x] All generators in `GENERATOR_OWNERSHIP_MAP` support dryRun mode (no DRIFT-02 errors when running `generated.drift.validate`) (evidence: `pnpm exec werkstatt run generated.drift.validate --site warpgogol-com --json` — 0 error(s), 0 warning(s), exitCode 0)
- [x] `mission.validate` passes without `generated.timestamp.validate` in the pipeline (evidence: `generated.drift.validate` passes with 0 errors; `build.check` pipeline no longer includes `generated.timestamp.validate` step)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0645 --json` — All 1 RFC(s) passed validation, exitCode 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the enforcement rules established by this RFC without a new RFC that supersedes it.
- **Pre-implementation audit**: before deleting `generated.timestamp.validate`, agents MUST audit all generators in `GENERATOR_OWNERSHIP_MAP` for dryRun support. Run `generated.drift.validate` and check for DRIFT-02 diagnostics. Any generator producing DRIFT-02 must be updated to support dryRun mode BEFORE the source-scanning validator is removed.
- **stripCommentsAndStrings consumer check**: before deleting `generated-timestamp-validate.ts`, agents MUST check whether `command-args-validate.ts` still imports `stripCommentsAndStrings`. If it does, either keep the function in a shared utility module or move it to `command-args-validate.ts` itself.
- **Broken dryRun handling**: if the pre-implementation audit reveals a generator whose dryRun mode is broken (output differs from normal mode, throws, or returns empty `renderedFiles`), the agent MUST fix the dryRun implementation. There is no fallback or bypass — the entire point of promoting DRIFT-02 to error is that all generators must support dryRun correctly.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
