---
id: RFC-0602
title: "Enforce timestamp determinism in generated files"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
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
  - RFC-0345
  - RFC-0601
  - RFC-0603
  - DNA-35
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-18
  - DNA-53
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
    - generated.timestamp.validate
  added:
    - generated.timestamp.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-codegen"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "generated.timestamp.validate detects generated files that embed new Date().toISOString() or similar volatile timestamp fields."
  - "After fixing all flagged generators to use null or deterministic values, the command passes with zero violations."
  - "Running build.prepare twice in a row produces zero git-tracked changes to generated files (no timestamp churn)."
  - "The command catches new generators that introduce volatile timestamps before they reach production."
nonGoals:
  - "Do not ban all timestamp fields — some generated files may legitimately need a build timestamp derived from deterministic sources (e.g., git commit SHA, source file mtime). The policy bans new Date().toISOString() and similar non-deterministic values."
  - "Do not address binary file timestamps — that is an OS/filesystem concern, not a generated file concern."
  - "Do not replace RFC-0345 — that RFC fixed specific generators. This RFC adds a lint to prevent regression."
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

# RFC-0602: Enforce timestamp determinism in generated files

## Context

A public folder regeneration experiment on warpgogol-com (2026-07-30) revealed that several generated files still embed volatile timestamps despite RFC-0345's effort to eliminate them. The experiment showed drift in:

- `src/surface/states/pointer.yaml`: The `resolvedAt` field changes on every build.
- `src/content-ref-index.generated.yaml`: A timestamp field changes on every build.
- `src/entitlements.generated.yaml`: A timestamp field changes on every build.

RFC-0345 fixed the most visible offenders (surface state, bordbuch, uni.registry, content plan, claim ledger, grace inventory, entitlements) by setting `generatedAt` to `null`. However, new generators and fields have since introduced volatile timestamps that were not covered by RFC-0345's original audit.

## Problem

RFC-0345 fixed specific generators but did not establish a **lint** to prevent regression. New generators and new fields can introduce `new Date().toISOString()` or similar non-deterministic values without any automated check catching it. The result is timestamp churn: running `build.prepare` twice in a row produces git-tracked changes to generated files even when no source data changed.

This undermines `generated.drift.validate` (RFC-0601) — if files always drift due to timestamps, the drift validator either produces false positives or must be configured to ignore timestamp fields, weakening its signal.

## Decision

The kernel gains a `generated.timestamp.validate` command that scans generator source modules (identified via `GENERATOR_OWNERSHIP_MAP`) for volatile timestamp patterns (`new Date().toISOString()`, `Date.now()`, `new Date()`, `process.env.BUILD_TIMESTAMP` used as a generated file field value) and reports TS-TIME-01 violations. An optional `--deep` flag runs a standalone double-build drift detection (outside `build.check`) to catch volatile fields in generated output. The command fails on any violation in default (source lint) mode.

## Architectural fit

- **DNA-18 (Uni registry is the single UI index)**: Extends the determinism principle — generated files must be byte-identical across consecutive builds with unchanged source data.
- **DNA-53 (Semantic fingerprint governance)**: Volatile timestamps in generated files make `@warpgogol/fingerprint` semantic fingerprints non-deterministic. This RFC prevents timestamp churn from undermining fingerprint stability.
- **DNA-35 (`app.contract.full` canonical readiness signal)**: Adding `generated.timestamp.validate` to `build.check` extends the composite readiness signal — a site with timestamp violations is not ready to deploy.
- **RFC-0345 (idempotent file writes)**: This RFC is the enforcement layer for RFC-0345's policy. RFC-0345 fixed specific generators; this RFC prevents regression.
- **RFC-0601 (generated.drift.validate)**: This RFC is a prerequisite for RFC-0601's effectiveness — if timestamps always drift, content drift detection is masked.
- **RFC-0603 (preview image determinism)**: Related — both RFCs address non-determinism in generated outputs, this one for text, RFC-0603 for binary.

## Design

### CLI surface

```sh
pnpm exec site-kernel run generated.timestamp.validate --site warpgogol-com
pnpm exec site-kernel run generated.timestamp.validate --site warpgogol-com --json
```

Scope: `workspace` (operates per-site via `--site`).

### Two-phase detection

**Phase 1 — Source code lint (default)**: Scans only generator source modules identified by `GENERATOR_OWNERSHIP_MAP` (in `packages/os/site-kernel-checks/src/generator-ownership.ts`). The map's `module` field points to each generator's source file — the lint scans exactly those files, not all `.ts` files in the package. This eliminates ~20+ false positives from legitimate `new Date()` usage in validators (e.g., `team-lifecycle.ts`, `content-freshness.ts`, `canonical-url.ts`, `ratgeber-claim-validate.ts` — all validators, not generators).

Patterns detected:

- `new Date().toISOString()`
- `new Date()`
- `Date.now()`
- `process.env.BUILD_TIMESTAMP` (when used as a generated file field value — currently used in `open-source-page.ts` as a fallback for `metadata.buildTimestamp`)

The lint uses regex with comment and string-literal exclusion: lines starting with `//` or inside `/* */` blocks are skipped, and matches inside string literals (quoted) are skipped. This avoids false positives from comments like `// Fix: replace new Date().toISOString() with null`. AST-based detection (TypeScript compiler API) was considered but rejected for Phase 1 — the regex approach is sufficient given the narrow scan scope (only generator modules from the ownership map, ~15-20 files).

Each match is a TS-TIME-01 violation unless the generator is on an allowlist (see Allowlist below).

**Phase 2 — Output drift detection (opt-in via `--deep`)**: Runs as a **standalone command** (not inside `build.check`) to avoid pipeline inversion. `build.check` must never invoke `build.prepare` — `build.prepare` always runs before `build.check`, not the other way around. When `--deep` is passed, the command runs `build.prepare` twice in sequence (outside the `build.check` pipeline) and checks if any text-based generated file changed between the two runs. If a file changed, it contains a volatile value. The command diffs the two versions to identify the volatile field.

`--deep` is intended for manual diagnostics and CI verification, not for the standard `build.check` pipeline.

### TypeScript contracts

```ts
interface TimestampViolation {
  rule: "TS-TIME-01";
  file: string;        // Source file (phase 1) or generated file (phase 2)
  line?: number;       // Line number (phase 1 only)
  field?: string;      // Volatile field name (phase 2 only)
  message: string;
  fix: string;         // "Replace new Date().toISOString() with null or a deterministic value"
}

interface TimestampAllowlistEntry {
  module: string;      // Repo-relative path to the generator source module
  reason: string;      // Why this generator legitimately uses a timestamp
  pattern: "new Date().toISOString()" | "new Date()" | "Date.now()" | "process.env.BUILD_TIMESTAMP";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` | New module — implements `runGeneratedTimestampValidate` |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Source of `GENERATOR_OWNERSHIP_MAP` — `module` field identifies which files to scan |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Register command |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add Phase 1 (source lint) to `build.check` pipeline |
| Generator modules referenced in `GENERATOR_OWNERSHIP_MAP.module` | Scanned for non-deterministic timestamp patterns (covers `site-kernel-codegen`, `site-kernel-checks`, `site-kernel-handoff`, and any other package with registered generators) |

### Output format

The command follows the standard `CheckResult` shape with `violations[]` and `notices[]`. Allowlist exemptions are reported as notices (not violations), so exempted generators are visible in the output without failing the command.

```json
{
  "command": "generated.timestamp.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "TS-TIME-01",
      "file": "packages/os/site-kernel-codegen/src/open-source-page.ts",
      "line": 445,
      "message": "Non-deterministic timestamp: new Date().toISOString() in generator source",
      "fix": "Replace with null or a deterministic value (e.g., git commit SHA)"
    }
  ],
  "notices": [
    {
      "rule": "TS-TIME-01",
      "file": "packages/os/site-kernel-checks/src/agent/agent-surface-sign.ts",
      "line": 171,
      "message": "Allowlisted: new Date().toISOString() — reason: Ed25519 signing proof creation timestamp (deterministic per RFC-0308)"
    }
  ]
}
```

### Failure modes

- **TS-TIME-01** (error): Non-deterministic timestamp found in generator source or generated output.
- The command exits non-zero on any violation.
- The command is read-only — it does not modify files.
- Allowlist exemptions are notices, not violations — they do not cause a non-zero exit.

## Rollout

- **Migration window**: The command runs in **warning mode** initially — it reports TS-TIME-01 violations as warnings (exit 0) for the first deployment cycle. This gives existing sites time to fix violations without `build.check` breaking. After all sites are clean, the command is promoted to **fail mode** (exit 1 on any violation). The mode is controlled by a `--mode warning|fail` flag, defaulting to `fail`.
- **Default behavior**: In fail mode, the command runs Phase 1 (source lint) in `build.check` (not `build.prepare`). Phase 2 (`--deep`) is never run in `build.check` — it is a standalone diagnostic.
- **Existing apps**: Must fix all timestamp violations before the warning-to-fail promotion. The command reports exact file and line, so fixes are mechanical.
- **New apps**: Automatically benefit — the lint catches timestamp regressions before they reach production.
- **Allowlist**: Generators that legitimately need a build timestamp must be added to an explicit allowlist data structure in the command module. Each entry MUST have a `reason` field explaining why the timestamp is legitimate. The allowlist is reviewed during architecture review.

### Initial allowlist

Based on a codebase audit, the following generators use `new Date().toISOString()` or similar patterns and are candidates for the initial allowlist:

- `packages/os/site-kernel-checks/src/agent/agent-surface-sign.ts` — Ed25519 signing proof `created` timestamp (deterministic per RFC-0308, derived from signing key version)
- `packages/os/site-kernel-checks/src/surface-breaker.ts` — `evaluatedAt` for breaker verdicts (operational state, not a generated file field in the deterministic sense)
- `packages/os/site-kernel-codegen/src/open-source-page.ts` — `process.env.BUILD_TIMESTAMP` fallback (legitimate: build metadata from CI, not `new Date()`)

Generators NOT eligible for the allowlist (must be fixed):

- `packages/os/site-kernel-codegen/src/content-ref-index-generate.ts` — `generatedAt: new Date().toISOString()` (should be `null` per RFC-0345)
- `packages/os/site-kernel-checks/src/surface/shared.ts` — `createdAt: new Date().toISOString()` (should be `null` or deterministic)
- `packages/os/site-kernel-checks/src/page-markdown.ts` — `buildDate: new Date().toISOString().split("T")[0]` (should be `null` or deterministic)
- `packages/os/site-kernel-checks/src/agent/agent-knowledge-compute.ts` — `lastVerified: new Date().toISOString().slice(0, 10)` (should be `null` or deterministic)
- `packages/os/site-kernel-checks/src/surface-enrich.ts` — `generatedAt: new Date().toISOString()` (should be `null`)
- `packages/os/site-kernel-checks/src/surface-demand.ts` — `observedAt` / `importId` (should be `null` or deterministic)
- `packages/os/site-kernel-checks/src/app-qa.ts` — `generatedAt` (should be `null`)
- `packages/os/site-kernel-checks/src/content-ledger.ts` — `ts` / `asOf` (should be `null` or deterministic)
- `packages/os/site-kernel-checks/src/ecosystem-commit.ts` — `validatedAt` (should be `null` or deterministic)

## Alternatives considered

- **Rely on RFC-0345 alone**: Rejected — RFC-0345 was a one-time fix, not a lint. New generators can introduce volatile timestamps without detection.
- **Use eslint rule for `no-new-date`**: Rejected — eslint rules are too broad. `new Date()` is legitimate in many contexts (e.g., logging, cache invalidation). The lint must be scoped to generator source files only and check output, not just source.
- **Add timestamp normalization to `generated.drift.validate` (RFC-0601)**: Rejected — normalizing timestamps in drift detection hides the root cause. The fix should be in the generator, not the validator.

## Risks

- **False positives for legitimate timestamps**: Some generators may need a build timestamp for compliance or audit purposes. Mitigation: the allowlist mechanism exempts these generators with a required `reason` field.
- **Phase 2 performance**: Running `build.prepare` twice is expensive. Mitigation: Phase 2 is opt-in via `--deep` flag and runs as a standalone command, never in `build.check`; Phase 1 (source lint) is the default and is fast.
- **Maintenance burden**: The allowlist must be maintained. Each entry has a `reason` field. The allowlist is reviewed during architecture review.
- **Regex false positives**: Regex-based detection may miss edge cases that AST-based detection would catch. Mitigation: the scan scope is narrow (only `GENERATOR_OWNERSHIP_MAP` generator modules, ~15-20 files), and comment/string-literal exclusion reduces false positives. If false positives become a problem, a follow-up RFC can upgrade to AST-based detection.
- **Cross-package generators**: `GENERATOR_OWNERSHIP_MAP` includes generators from `site-kernel-handoff` (bordbuch.generate) and potentially other packages. The lint scans all modules referenced in the map, regardless of which package they live in.

## Documentation synchronization

- `docs/verification-plan.xml` must register `generated.timestamp.validate` in the `build.check` pipeline section.
- `packages/os/site-kernel-checks/AGENTS.md` must document the new command and module in the module table.

## Acceptance criteria

- [ ] `generated.timestamp.validate` command registered in `01-codegen.ts` with `scope: workspace`
- [ ] `runGeneratedTimestampValidate` implemented in `src/generated-timestamp-validate.ts`
- [ ] Phase 1 scans only generator modules from `GENERATOR_OWNERSHIP_MAP` (not all `.ts` files)
- [ ] TS-TIME-01 detects `new Date().toISOString()`, `new Date()`, `Date.now()`, `process.env.BUILD_TIMESTAMP` in generator source files
- [ ] Comment and string-literal exclusion prevents false positives from comments and string literals
- [ ] Allowlist data structure with `module`, `reason`, and `pattern` fields for generators with legitimate timestamp needs
- [ ] `--deep` flag enables Phase 2 (standalone double-build drift detection, not in `build.check`)
- [ ] `--mode warning|fail` flag controls exit code (warning = exit 0, fail = exit 1)
- [ ] Command added to `build.check` pipeline (Phase 1 only, fail mode after migration window)
- [ ] `--json` output follows standard `CheckResult` shape with `violations[]` and `notices[]`
- [ ] Allowlist exemptions reported as notices, not violations
- [ ] Unit test in `src/tests/generated-timestamp-validate.test.ts` covers source lint, allowlist exemption, comment/string exclusion, and clean-pass scenarios
- [ ] `docs/verification-plan.xml` updated with new command
- [ ] `packages/os/site-kernel-checks/AGENTS.md` updated with new module entry
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Phase 1 (source lint) MUST be implemented first — it is fast and catches the root cause.
- Phase 2 (double-build drift) is opt-in via `--deep` and MAY be implemented later. It MUST NOT be added to the `build.check` pipeline — it is a standalone diagnostic.
- The allowlist MUST be a data structure in the command module, not a magic comment in source files. Each entry MUST have a `module`, `reason`, and `pattern` field.
- The lint MUST use `GENERATOR_OWNERSHIP_MAP` to determine which source files to scan — never scan all `.ts` files in a package.
- The migration window (warning mode) gives existing sites time to fix violations before fail mode is promoted.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
