---
id: RFC-0602
title: "Enforce timestamp determinism in generated files"
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
  - RFC-0345
  - RFC-0601
  - RFC-0603
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

The kernel gains a `generated.timestamp.validate` command that scans all text-based generated files for volatile timestamp patterns (`new Date().toISOString()`, `Date.now()`, `new Date()` in generator source code) and for timestamp fields in generated output that change between consecutive builds. The command fails on any violation.

## Architectural fit

- **DNA-18 (Uni registry is the single UI index)**: Extends the determinism principle — generated files must be byte-identical across consecutive builds with unchanged source data.
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

**Phase 1 — Source code lint**: Scans generator source files in `packages/os/site-kernel-codegen/src/` and `packages/os/site-kernel-checks/src/` for non-deterministic timestamp patterns:

- `new Date().toISOString()`
- `new Date()`
- `Date.now()`
- `process.env.BUILD_TIMESTAMP` (when used as a generated file field value)

Each match is a TS-TIME-01 violation unless the generator is on an allowlist (e.g., bordbuch status projection, which legitimately uses a deterministic build timestamp from git commit SHA).

**Phase 2 — Output drift detection**: Runs `build.prepare` twice in sequence and checks if any text-based generated file changed between the two runs. If a file changed, it contains a volatile value. The command diffs the two versions to identify the volatile field.

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
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` | New module — implements `runGeneratedTimestampValidate` |
| `packages/os/site-kernel-codegen/src/*.ts` | Scanned for non-deterministic timestamp patterns |
| `packages/os/site-kernel-checks/src/*.ts` | Scanned for non-deterministic timestamp patterns |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Register command |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add to `build.check` pipeline |

### Output format

```json
{
  "command": "generated.timestamp.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "TS-TIME-01",
      "file": "packages/os/site-kernel-codegen/src/open-source-page.ts",
      "line": 730,
      "message": "Non-deterministic timestamp: new Date().toISOString() in generator source",
      "fix": "Replace with null or a deterministic value (e.g., git commit SHA)"
    }
  ]
}
```

### Failure modes

- **TS-TIME-01** (error): Non-deterministic timestamp found in generator source or generated output.
- The command exits non-zero on any violation.
- The command is read-only — it does not modify files.

## Rollout

- **Default behavior**: The command runs in `build.check` (not `build.prepare`). It fails on any TS-TIME-01 violation.
- **Existing apps**: Must fix all timestamp violations before the first `build.check` passes. The command reports exact file and line, so fixes are mechanical.
- **New apps**: Automatically benefit — the lint catches timestamp regressions before they reach production.
- **Allowlist**: Generators that legitimately need a build timestamp (e.g., bordbuch status) must be added to an explicit allowlist in the command configuration. The allowlist is reviewed during architecture review.

## Alternatives considered

- **Rely on RFC-0345 alone**: Rejected — RFC-0345 was a one-time fix, not a lint. New generators can introduce volatile timestamps without detection.
- **Use eslint rule for `no-new-date`**: Rejected — eslint rules are too broad. `new Date()` is legitimate in many contexts (e.g., logging, cache invalidation). The lint must be scoped to generator source files only and check output, not just source.
- **Add timestamp normalization to `generated.drift.validate` (RFC-0601)**: Rejected — normalizing timestamps in drift detection hides the root cause. The fix should be in the generator, not the validator.

## Risks

- **False positives for legitimate timestamps**: Some generators may need a build timestamp for compliance or audit purposes. Mitigation: the allowlist mechanism exempts these generators.
- **Phase 2 performance**: Running `build.prepare` twice is expensive. Mitigation: phase 2 is opt-in via `--deep` flag; phase 1 (source lint) is the default and is fast.
- **Maintenance burden**: The allowlist must be maintained. Each entry should have a justification comment.

## Acceptance criteria

- [ ] `generated.timestamp.validate` command registered in `01-codegen.ts` with `scope: workspace`
- [ ] `runGeneratedTimestampValidate` implemented in `src/generated-timestamp-validate.ts`
- [ ] TS-TIME-01 detects `new Date().toISOString()`, `new Date()`, `Date.now()` in generator source files
- [ ] Allowlist mechanism for generators with legitimate timestamp needs
- [ ] `--deep` flag enables phase 2 (double-build drift detection)
- [ ] Command added to `build.check` pipeline
- [ ] `--json` output follows standard `CheckResult` shape with `violations[]`
- [ ] Unit test in `src/tests/generated-timestamp-validate.test.ts` covers source lint, allowlist exemption, and clean-pass scenarios
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Phase 1 (source lint) MUST be implemented first — it is fast and catches the root cause.
- Phase 2 (double-build drift) is opt-in via `--deep` and MAY be implemented later.
- The allowlist MUST be a data structure in the command module, not a magic comment in source files. Each entry MUST have a `reason` field explaining why the timestamp is legitimate.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
