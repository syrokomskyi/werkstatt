---
id: RFC-0601
title: "Add generated.drift.validate command for content drift in generated files"
status: accepted
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
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0375
  - RFC-0600
  - RFC-0345
  - RFC-0236
  - RFC-0602
  - RFC-0603
  - RFC-0607
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
  proposed:
    - generated.drift.validate
  added:
    - generated.drift.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-codegen"
successSignals:
  - "generated.drift.validate detects content drift in public/humans.txt when the committed version differs from what humans.generate would produce."
  - "generated.drift.validate detects content drift in public/sitemap-content.xml when route configuration changed but the file was not regenerated."
  - "generated.drift.validate detects schema evolution drift in src/surface/states/pointer.yaml when the surface state shape changed."
  - "The command exits non-zero with a DRIFT-01 diagnostic for each drifted file."
  - "After re-running the owning generator, the command passes with zero violations."
nonGoals:
  - "Do not check binary file drift — preview images are handled by RFC-0602 (deterministic rendering)."
  - "Do not check timestamp drift — that is the domain of RFC-0603 (timestamp determinism)."
  - "Do not auto-fix drifted files — the command is informational: it reports and exits non-zero."
  - "Do not check files outside the site workpiece — scope is strictly the site's public/ and src/ directories."
  - "Do not replace RFC-0236 (material.credits.drift.validate) — that RFC targets a specific prose credits generator. This RFC is the general-purpose drift validator for all text-based generated files."
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

# RFC-0601: Add generated.drift.validate command for content drift in generated files

## Context

A public folder regeneration experiment on warpgogol-com (2026-07-30) revealed content drift in several text-based generated files after regeneration:

- **`public/humans.txt`**: The committed version differed from the regenerated version — team member updates were not reflected in the committed file.
- **`public/sitemap-content.xml`**: Route configuration changes (added/removed pages) were not reflected in the committed sitemap.
- **`src/surface/states/pointer.yaml`**: Schema evolution in the surface state format caused the committed pointer to differ from the regenerated one.
- **`src/content-ref-index.generated.yaml`**: Content reference changes were not reflected in the committed index.
- **`src/entitlements.generated.yaml`**: Entitlement configuration changes were not reflected in the committed file.

In all cases, the committed file was stale — it did not match what the owning generator would produce from the current source data. This is **content drift**: the file exists, has the right name, and carries the GENERATED marker, but its content diverged from what the generator would produce.

RFC-0236 addressed this for `material.credits.generate` specifically. RFC-0345 addressed idempotent writes and volatile timestamps. Neither provides a **general-purpose** drift validator for all text-based generated files.

## Problem

There is no general-purpose command that detects content drift in text-based generated files. The existing tools each cover a narrow slice:

- `generated.files.validate` (RFC-0375): Checks existence, not content.
- `generated.marker.validate`: Checks the GENERATED marker, not content.
- `material.credits.drift.validate` (RFC-0236): Only for prose credits pages.
- `writeFileIfChanged` (RFC-0345): Prevents future drift from redundant writes, but does not detect **existing** drift in committed files.

The gap: a committed generated file can diverge from its generator's current output without any command detecting it. This happens when:

1. Source data changes but the generator is not re-run before commit.
2. Schema evolution changes the output format but committed files are not regenerated.
3. Manual edits to generated files (which should be caught by the marker check, but sometimes slip through).
4. Generator logic changes (bug fix, new feature) that change output but committed files are not regenerated.

## Decision

The kernel gains a `generated.drift.validate` command that re-generates each text-based generated file in memory and compares it against the committed version on disk. On any byte-level difference (after line-ending normalization), the command reports a DRIFT-01 violation.

## Architectural fit

- **DNA-58 (Generated-file content determinism)**: This RFC is the enforcement command for DNA-58 (proposed by RFC-0607). DNA-58 extends the determinism principle from DNA-18 (Uni registry) to all text-based generated files. Until RFC-0607 is accepted and DNA-58 is added to `docs/architecture-dna.md`, this RFC has no `satisfies` entry.
- **DNA-18 (Uni registry is the single UI index)**: Related — DNA-18 established the determinism pattern for the registry. DNA-58 generalizes it. This RFC does not satisfy DNA-18 directly.
- **RFC-0345 (idempotent file writes)**: Complementary — RFC-0345 prevents future drift from redundant writes; this RFC detects existing drift in committed files.
- **RFC-0236 (material.credits.drift.validate)**: Predecessor — RFC-0236 proved the drift-validate pattern for a specific generator using a separable pure render function. This RFC generalizes the pattern using a `dryRun` flag on each generator's command handler (see Dry-run mode below).
- **RFC-0375 (generated.files.validate)**: Complementary — RFC-0375 checks existence, this RFC checks content.
- **RFC-0600 (generated.stale.validate)**: Complementary — RFC-0600 checks for orphaned files, this RFC checks for content drift in owned files.
- **RFC-0602 (deterministic rendering)**: Related — RFC-0602 addresses binary file rendering determinism. This RFC skips binary files.
- **RFC-0603 (timestamp determinism)**: Related — RFC-0603 addresses timestamp non-determinism in generated files. Timestamp drift is a subset of content drift.

## Design

### CLI surface

```sh
pnpm exec site-kernel run generated.drift.validate --site warpgogol-com
pnpm exec site-kernel run generated.drift.validate --site warpgogol-com --json
```

Scope: `workspace` (operates per-site via `--site`).

### TypeScript contracts

The command uses the canonical `Diagnostic` and `CheckResult` types from `@warpgogol/site-kernel` (RFC-0203):

```ts
import type { Diagnostic, CheckResult, KernelCommandResult } from "@warpgogol/site-kernel";

// DRIFT-01: error-severity Diagnostic — committed file content differs from generator output
// DRIFT-02: info-severity Diagnostic — generator does not support dryRun, skipped

// The command returns KernelCommandResult<CheckResult> with:
// - data.diagnostics: Diagnostic[] (DRIFT-01 as error, DRIFT-02 as info)
// - data.summary: { error: number, warning: number, info: number }
// - exitCode: 1 if any DRIFT-01 diagnostic exists, 0 otherwise

// Each Diagnostic carries:
// - ruleId: "DRIFT-01" | "DRIFT-02"
// - severity: "error" | "info"
// - message: human-readable description
// - file: workspace-relative POSIX path to the drifted file
// - data: { generator: string } — owning kernel command name
// - fixHint: "Re-run: pnpm exec site-kernel run <generator> --site <id>"
```

### Algorithm

1. **Resolve the site workspace** via the kernel's site resolver (mission-aware, supports both `apps/<id>` and `missions/<missionId>/workpiece/` paths).
2. **Determine git-tracked files** via `git ls-files` scoped to the site directory. Only git-tracked files can have drift — untracked files are skipped.
3. **Iterate over all `GENERATOR_OWNERSHIP_MAP` entries**: a. **Skip binary entries** — entries whose output file extension is in the binary set: `.png`, `.ico`, `.webp`, `.mp4`, `.webm`, `.jpg`, `.jpeg`, `.gif`, `.tiff`, `.heic`, `.heif`, `.svg` (binary detection is extension-based). b. **Expand glob patterns and placeholders** — entries with `{lang}`, `{route}`, `{app}`, `{id}`, `{system}` placeholders or glob patterns (`*`, `**`) are expanded using the same `expandGlob` / placeholder resolution logic as `generated.files.validate` (RFC-0375). This includes resolving site languages from `system.md`, routes from the content collection, and app IDs from the workspace discovery. c. **Skip conditional entries** — entries with `conditional: true` in the ownership map are skipped (same as RFC-0375). These files are produced conditionally and may not exist on every site. d. **Resolve workspace-absolute paths** — entries whose output path starts with `packages/` or is workspace-absolute are resolved relative to `workspaceRoot`, not the site directory. These files are included in drift validation (they are generated files regardless of location).
4. **For each expanded text-based generated file that exists on disk and is git-tracked**: a. Identify the owning generator from the ownership map entry. b. Re-invoke the generator's command handler with `dryRun: true` in the `KernelRuntimeContext` (see Dry-run mode below). c. Capture the in-memory rendered output from the handler's result. d. Read the file from disk. e. Normalize line endings to LF in both the rendered output and the disk file. f. Compare byte-for-byte. On mismatch → emit a DRIFT-01 error Diagnostic.
5. **Files that do not exist** are skipped (RFC-0375 handles missing files).
6. **Files that are not git-tracked** are skipped (untracked files cannot have drift).
7. **Generators without `dryRun` support** are skipped with a DRIFT-02 info Diagnostic (not an error).

### Dry-run mode

Each generator's command handler must support `dryRun: true` in `KernelRuntimeContext`. When `dryRun` is true, the handler:

1. Executes all read operations (source data loading, content collection reads) as normal.
2. Renders the output content in memory.
3. **Suppresses all side effects** — no file writes, no cache updates, no network requests, no fingerprint cache writes.
4. Returns the rendered content in the command result's `data` field (e.g., `data.renderedFiles: { [path: string]: string }`).

This is a **new pattern** — distinct from RFC-0236, which uses a separable pure render function (`renderMaterialCreditProse`) called directly by the validator. RFC-0601 uses the `dryRun` flag on the command handler instead, invoked via `executeRegisteredCommand` with `dryRun: true`. This unifies the mechanism: the validator calls the same handler that `build.prepare` calls, just with `dryRun` enabled.

**Output fidelity requirement**: `dryRun` mode MUST produce byte-identical output to normal mode (after line-ending normalization). If a generator's `dryRun` mode produces different output (e.g., skips a timestamp field, omits a cache-dependent section), the drift check is invalid. Each generator's `dryRun` implementation must be verified to produce identical output. Generators that cannot guarantee output fidelity MUST NOT be given `dryRun` support and are skipped with DRIFT-02.

**Side-effect suppression**: If a generator's render function has side effects (e.g., writes to cache, makes network requests), `dryRun` mode MUST suppress them. This requires careful implementation per generator.

Generators that do not yet support `dryRun` are skipped with a DRIFT-02 info Diagnostic (not an error). This allows incremental adoption — add `dryRun` to one generator at a time.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-drift-validate.ts` | New module — implements `runGeneratedDriftValidate` |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Read — `GENERATOR_OWNERSHIP_MAP` for generator→file mapping |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | Changed — register `DRIFT-01` and `DRIFT-02` rule descriptors |
| `packages/os/site-kernel-codegen/src/*.ts` | Changed — add `dryRun` support to each generator's command handler |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Register command |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add to `build.check` pipeline (after `generated.marker.validate`, before `generated.stale.validate`) |
| Site `public/` and `src/` text files | Validated |
| Workspace-absolute generated files (e.g., `packages/ui/src/sections/`) | Validated (resolved relative to `workspaceRoot`) |

### Output format

Canonical `CheckResult` (RFC-0203) with `diagnostics: Diagnostic[]`:

```json
{
  "command": "generated.drift.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "DRIFT-01",
      "severity": "error",
      "message": "Committed file content differs from generator output",
      "file": "public/humans.txt",
      "data": { "generator": "humans.generate" },
      "fixHint": "Re-run: pnpm exec site-kernel run humans.generate --site warpgogol-com"
    },
    {
      "ruleId": "DRIFT-02",
      "severity": "info",
      "message": "Generator does not support dryRun mode; skipped",
      "file": "public/sitemap-content.xml",
      "data": { "generator": "sitemap.generate" }
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 1 }
}
```

### Failure modes

- **DRIFT-01** (error): Committed file content differs from generator output. Exits non-zero (exit code 1).
- **DRIFT-02** (info): Generator does not support `dryRun` mode. Does not exit non-zero — this is a gradual adoption signal.
- The command is read-only — it does not modify any files.

## Rollout

- **Pipeline position**: The command runs in `build.check` (not `build.prepare` — `build.prepare` regenerates files, which would self-heal drift before the validator sees it). Specifically, it is added to `SITES_BUILD_CHECK_PIPELINE` in `build-check.ts` after `generated.marker.validate` and before `generated.stale.validate`.
- **Gradual adoption**: Generators without `dryRun` support are skipped with DRIFT-02 info diagnostics. This allows incremental adoption — add `dryRun` to one generator at a time.
- **Total scope**: The `GENERATOR_OWNERSHIP_MAP` contains approximately 30-40 text-based generator entries (excluding binary). Each generator requires a `dryRun` implementation that suppresses side effects and returns rendered content. The implementation notes recommend starting with the simplest generators (humans.generate, robots.generate, ai.generate) and gradually extending.
- **Existing apps**: Must re-run `build.prepare` before the first `build.check` to ensure all generated files are fresh. After that, drift detection is automatic.
- **New apps**: Automatically benefit — all generators should support `dryRun` from the start.
- **CI integration**: The command runs in CI `build.check` and fails the build on any DRIFT-01 violation.
- **Interaction with non-`build.prepare` generators**: Some generated files (bordbuch, cosmic-passport-key) are produced by separate commands outside `build.prepare`. If `generated.drift.validate` checks these files, they might always show as drifted because they were not regenerated by `build.prepare`. The validator should skip files whose owning generator is not in `SITES_BUILD_PREPARE_PIPELINE` (use the pipeline step list to determine this).

## Alternatives considered

- **Regenerate in temp directory and diff**: Rejected — regenerating in a temp directory requires running the full generator (including side effects like fingerprint cache writes). The `dryRun` approach is cleaner because it renders in memory without side effects.
- **Use git diff after `build.prepare`**: Rejected — this conflates drift detection with build success. If `build.prepare` fails, the git diff is meaningless. The validator must be independent of the build pipeline.
- **Extend RFC-0236 to cover all generators**: Rejected — RFC-0236 is specifically for `material.credits.generate` and its nonGoals explicitly say "Do not add drift guards for every generated file." A new RFC is the right scope.

## Risks

- **Generator side effects in dryRun**: If a generator's render function has side effects (e.g., writes to cache, makes network requests), `dryRun` mode must suppress them. This requires careful implementation per generator. Risk: a generator might not fully suppress side effects, causing unexpected state changes during validation.
- **dryRun output fidelity**: If a generator's `dryRun` mode produces different output than its normal mode (e.g., skips a timestamp field, omits a cache-dependent section), the drift check produces false positives. Mitigation: each generator's `dryRun` implementation must be verified to produce byte-identical output to normal mode. Generators that cannot guarantee fidelity MUST NOT be given `dryRun` support.
- **Performance**: Re-rendering all text-based generated files in memory could be slow. A typical site has approximately 30-50 text-based generated files. Per-file re-rendering cost is dominated by source data loading (already cached in the command-result cache for most generators). Estimated total: 5-15 seconds for a medium site. Mitigation: the command runs in `build.check` (not `build.prepare`), so it does not slow down the dev loop.
- **False positives from line-ending differences**: The comparison normalizes line endings to LF, so CRLF on Windows is not a false positive. Trailing whitespace differences are also normalized (trimmed per line) to avoid false positives from editor auto-formatting.
- **Maintenance burden**: Each generator must implement `dryRun` mode. This is incremental — generators without `dryRun` are skipped (DRIFT-02), not failed. Total scope: ~30-40 text-based generators in the ownership map.
- **Glob and placeholder expansion complexity**: Expanding `{lang}`, `{route}`, `{system}` placeholders and glob patterns requires the same resolution logic as `generated.files.validate`. Risk: expansion bugs could miss files or produce false paths. Mitigation: reuse the existing `expandGlob` and placeholder resolution from RFC-0375.

## Acceptance criteria

- [ ] `generated.drift.validate` command registered in `01-codegen.ts` with `scope: workspace`
- [ ] `runGeneratedDriftValidate` implemented in `src/generated-drift-validate.ts`
- [ ] DRIFT-01 and DRIFT-02 registered in `diagnostics/rules/core-infra.ts`
- [ ] DRIFT-01 (error) detects content drift in text-based generated files
- [ ] DRIFT-02 (info) emitted for generators without `dryRun` support
- [ ] Binary files (PNG, ICO, WebP, MP4, WebM, JPG, JPEG, GIF, TIFF, HEIC, HEIF, SVG) are skipped via extension-based detection
- [ ] Line-ending normalization (LF) and trailing whitespace trim applied before comparison
- [ ] Git-tracking detection via `git ls-files` — untracked files skipped
- [ ] Glob patterns and placeholders (`{lang}`, `{route}`, `{system}`) expanded using RFC-0375 logic
- [ ] Conditional entries (`conditional: true`) skipped
- [ ] Workspace-absolute paths (e.g., `packages/ui/`) resolved relative to `workspaceRoot`
- [ ] Files whose owning generator is not in `SITES_BUILD_PREPARE_PIPELINE` are skipped
- [ ] Command added to `build.check` pipeline after `generated.marker.validate`, before `generated.stale.validate`
- [ ] `--json` output follows canonical `CheckResult` shape with `diagnostics: Diagnostic[]` (DRIFT-01 as error, DRIFT-02 as info)
- [ ] Unit test in `src/tests/generated-drift-validate.test.ts` covers drift detection, clean-pass, dryRun-skip, binary-skip, and glob-expansion scenarios
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The command MUST follow the canonical `CheckResult` pattern with `diagnostics: Diagnostic[]` (RFC-0203). DRIFT-01 is an error-severity Diagnostic; DRIFT-02 is an info-severity Diagnostic. Do NOT use separate `violations[]`/`notices[]` arrays.
- DRIFT-01 and DRIFT-02 MUST be registered in `diagnostics/rules/core-infra.ts` via `rule()` to pass `diagnostic.shape.lint` (DSL-02).
- Each generator's `dryRun` mode is invoked via `executeRegisteredCommand` with `dryRun: true` in `KernelRuntimeContext`. The handler suppresses side effects and returns rendered content in `data.renderedFiles`.
- Each generator's `dryRun` mode MUST be opt-in (default `false`) to avoid breaking existing callers. The `dryRun` flag is read from `KernelRuntimeContext`, not a CLI flag.
- Agents MUST start by adding `dryRun` to the simplest generators (humans.generate, robots.generate, ai.generate) and gradually extend to more complex ones.
- The command MUST NOT run in `build.prepare` — only in `build.check`. Running in `build.prepare` would self-heal drift before detection.
- The command MUST skip files whose owning generator is not in `SITES_BUILD_PREPARE_PIPELINE` to avoid false positives from non-`build.prepare` generators.
- RFC-0607 (DNA-58) MUST be accepted before this RFC transitions to `accepted`. Once DNA-58 is added to `docs/architecture-dna.md`, update this RFC's `satisfies` field to include DNA-58.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
