---
id: RFC-0601
title: "Add generated.drift.validate command for content drift in generated files"
status: draft
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
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-18
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

- **DNA-18 (Uni registry is the single UI index)**: Extends the determinism principle — generated files must match what their generator produces from current source data.
- **RFC-0345 (idempotent file writes)**: Complementary — RFC-0345 prevents future drift from redundant writes; this RFC detects existing drift in committed files.
- **RFC-0236 (material.credits.drift.validate)**: Predecessor — RFC-0236 proved the drift-validate pattern for a specific generator. This RFC generalizes it.
- **RFC-0375 (generated.files.validate)**: Complementary — RFC-0375 checks existence, this RFC checks content.
- **RFC-0600 (generated.stale.validate)**: Complementary — RFC-0600 checks for orphaned files, this RFC checks for content drift in owned files.

## Design

### CLI surface

```sh
pnpm exec site-kernel run generated.drift.validate --site warpgogol-com
pnpm exec site-kernel run generated.drift.validate --site warpgogol-com --json
```

Scope: `workspace` (operates per-site via `--site`).

### TypeScript contracts

```ts
interface DriftDiagnostic {
  rule: "DRIFT-01";
  file: string;           // Relative to site directory
  generator: string;      // Owning kernel command name
  message: string;
  fix: string;            // "Re-run: pnpm exec site-kernel run <generator> --site <id>"
}
```

### Algorithm

1. Iterate over all `GENERATOR_OWNERSHIP_MAP` entries that produce **text-based** files (skip binary entries like PNG, ICO, WebP, MP4, WebM).
2. For each text-based generated file that exists on disk: a. Identify the owning generator from the ownership map. b. Re-invoke the generator's render function in **dry-run mode** (in-memory only, no file writes). c. Compare the in-memory output against the file on disk (after normalizing line endings to LF). d. On mismatch → DRIFT-01 violation.
3. Files that do not exist are skipped (RFC-0375 handles missing files).
4. Files that are not git-tracked are skipped (untracked files cannot have drift).

### Dry-run mode

Each generator must support a `dryRun: true` option that renders content in memory without writing to disk. This is the same pattern used by `material.credits.drift.validate` (RFC-0236). Generators that do not yet support `dryRun` are skipped with a DRIFT-02 notice (not an error).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-drift-validate.ts` | New module — implements `runGeneratedDriftValidate` |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Read — `GENERATOR_OWNERSHIP_MAP` for generator→file mapping |
| `packages/os/site-kernel-codegen/src/*.ts` | Changed — add `dryRun` option to each generator function |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Register command |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add to `build.check` pipeline |
| Site `public/` and `src/` text files | Validated |

### Output format

```json
{
  "command": "generated.drift.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "DRIFT-01",
      "file": "public/humans.txt",
      "generator": "humans.generate",
      "message": "Committed file content differs from generator output",
      "fix": "Re-run: pnpm exec site-kernel run humans.generate --site warpgogol-com"
    }
  ],
  "notices": [
    {
      "rule": "DRIFT-02",
      "file": "public/sitemap-content.xml",
      "generator": "sitemap.generate",
      "message": "Generator does not support dryRun mode; skipped"
    }
  ]
}
```

### Failure modes

- **DRIFT-01** (error): Committed file content differs from generator output. Exits non-zero.
- **DRIFT-02** (notice): Generator does not support `dryRun` mode. Does not exit non-zero — this is a gradual adoption signal.
- The command is read-only — it does not modify any files.

## Rollout

- **Default behavior**: The command runs in `build.check` (not `build.prepare` — `build.prepare` regenerates files, which would self-heal drift before the validator sees it).
- **Gradual adoption**: Generators without `dryRun` support are skipped with DRIFT-02 notices. This allows incremental adoption — add `dryRun` to one generator at a time.
- **Existing apps**: Must re-run `build.prepare` before the first `build.check` to ensure all generated files are fresh. After that, drift detection is automatic.
- **New apps**: Automatically benefit — all generators should support `dryRun` from the start.
- **CI integration**: The command runs in CI `build.check` and fails the build on any DRIFT-01 violation.

## Alternatives considered

- **Regenerate in temp directory and diff**: Rejected — regenerating in a temp directory requires running the full generator (including side effects like fingerprint cache writes). The `dryRun` approach is cleaner because it renders in memory without side effects.
- **Use git diff after `build.prepare`**: Rejected — this conflates drift detection with build success. If `build.prepare` fails, the git diff is meaningless. The validator must be independent of the build pipeline.
- **Extend RFC-0236 to cover all generators**: Rejected — RFC-0236 is specifically for `material.credits.generate` and its nonGoals explicitly say "Do not add drift guards for every generated file." A new RFC is the right scope.

## Risks

- **Generator side effects in dryRun**: If a generator's render function has side effects (e.g., writes to cache, makes network requests), `dryRun` mode must suppress them. This requires careful implementation per generator. Risk: a generator might not fully suppress side effects, causing unexpected state changes during validation.
- **Performance**: Re-rendering all text-based generated files in memory could be slow for sites with many generated files. Mitigation: the command runs in `build.check` (not `build.prepare`), so it does not slow down the dev loop.
- **False positives from line-ending differences**: The comparison normalizes line endings to LF, so CRLF on Windows is not a false positive. However, trailing whitespace differences could cause false positives if the generator and the committed file differ in trailing whitespace. Mitigation: the comparison should also trim trailing whitespace per line.
- **Maintenance burden**: Each generator must implement `dryRun` mode. This is incremental — generators without `dryRun` are skipped (DRIFT-02), not failed.

## Acceptance criteria

- [ ] `generated.drift.validate` command registered in `01-codegen.ts` with `scope: workspace`
- [ ] `runGeneratedDriftValidate` implemented in `src/generated-drift-validate.ts`
- [ ] DRIFT-01 detects content drift in text-based generated files
- [ ] DRIFT-02 notice emitted for generators without `dryRun` support
- [ ] Binary files (PNG, ICO, WebP, MP4, WebM) are skipped
- [ ] Line-ending normalization (LF) applied before comparison
- [ ] Command added to `build.check` pipeline (not `build.prepare`)
- [ ] `--json` output follows standard `CheckResult` shape with `violations[]` and `notices[]`
- [ ] Unit test in `src/tests/generated-drift-validate.test.ts` covers drift detection, clean-pass, and dryRun-skip scenarios
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The command MUST follow the existing `CheckResult` pattern with `violations[]` and `notices[]`.
- Each generator's `dryRun` mode MUST be opt-in (default `false`) to avoid breaking existing callers.
- Agents MUST start by adding `dryRun` to the simplest generators (humans.generate, robots.generate, ai.generate) and gradually extend to more complex ones.
- The command MUST NOT run in `build.prepare` — only in `build.check`. Running in `build.prepare` would self-heal drift before detection.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
