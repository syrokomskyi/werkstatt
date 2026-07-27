---
id: RFC-0253
title: "Share workspace discovery and parse CI workflows structurally"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0087
  - RFC-0203
  - RFC-0245
  - RFC-0246
  - RFC-0249
commands:
  proposed:
    - workspace.discovery.validate
  added:
    - workspace.discovery.validate
  changed:
    - ecosystem.manifest.generate
    - ecosystem.manifest.validate
    - workspace.surface.validate
    - test.signal.validate
    - ci.local.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Workspace package enumeration is implemented once and consumed by ACP generation, workspace surface validation, and test signal classification."
  - "`ci.local.validate` parses `.github/workflows/*.yml` as YAML and verifies actual `jobs.*.steps[].run` commands."
  - "A command mentioned only in a workflow comment no longer satisfies `ci.local.validate`."
  - "Root package-manager/Corepack checks are based on structured workflow data, not string scanning."
nonGoals:
  - "Do not replace GitHub Actions with a different CI provider."
  - "Do not implement changed-file or partial CI optimization in this RFC."
  - "Do not implement this hardening while the RFC remains draft."
---

# RFC-0253: Share workspace discovery and parse CI workflows structurally

## Context

RFC-0246 hardened the Agent Control Plane by deriving workspace packages from `pnpm-workspace.yaml`. RFC-0249 added `test.signal.validate` and `ci.local.validate`.

The 2026-07-01 audit found two remaining maintainability gaps:

1. Workspace package discovery is duplicated:
   - `packages/os/site-kernel-checks/src/ecosystem.ts` defines its own `workspacePackageGlobsFromYaml`, `expandWorkspacePattern`, and `collectWorkspacePackageDirectories`.
   - `packages/os/site-kernel-checks/src/test-signal.ts` defines a near-identical copy.
2. `ci.local.validate` checks workflow commands with raw `source.includes(command)` and scans `pnpm/action-setup` versions using line windows.

Both implementations pass today, but they are brittle:

- A future workspace glob feature may be fixed in one discovery copy and missed in another.
- A command mentioned in a YAML comment can satisfy `ci.local.validate`.
- A multiline shell block, matrix job, or reusable workflow could be misread by string matching.
- Package-manager validation is not tied to actual workflow step structure.

## Problem

The unprotected invariant is: **workspace topology and CI gate checks must be parsed from structured source-of-truth data exactly once.**

Duplicated workspace discovery creates drift risk. String-based workflow validation creates false positives and false negatives. Both are especially dangerous because they guard agent planning and CI trust.

## Decision

The platform will introduce a shared workspace discovery helper and structured GitHub Actions parser.

Workspace discovery:

- A single helper enumerates workspace package directories from `pnpm-workspace.yaml`.
- The helper is consumed by:
  - `ecosystem.manifest.generate`;
  - `ecosystem.manifest.validate`;
  - `workspace.surface.validate`;
  - `test.signal.validate`;
  - future package/debt commands.
- A focused `workspace.discovery.validate` command pins helper behavior and reports malformed workspace patterns.

CI workflow validation:

- `ci.local.validate` parses `.github/workflows/*.yml` using the repository's YAML parser.
- It verifies actual `jobs.<jobId>.steps[].run` commands and `steps[].uses` actions.
- It ignores comments and non-step prose.
- It validates Corepack/pnpm setup from structured steps, not raw text.

## Architectural fit

This RFC consolidates RFC-0246 and RFC-0249 implementation details without changing their public intent.

The shared helper should live in the lowest appropriate workspace package:

- If other packages beyond checks need workspace discovery, place it in `@gogol/site-kernel`.
- If it remains only a checks/governance utility, place it in `@gogol/site-kernel-checks/src/workspace-discovery.ts` and export it internally.

The preferred project decision is to place the helper in `@gogol/site-kernel` if it can remain framework-free and dependency-light, because workspace discovery is a kernel concern rather than a check-specific concern.

## Design

### CLI surface

```sh
pnpm exec site-kernel run workspace.discovery.validate --json
pnpm exec site-kernel run workspace.surface.validate --json
pnpm exec site-kernel run test.signal.validate --json
pnpm exec site-kernel run ci.local.validate --json
pnpm exec site-kernel run ecosystem.manifest.validate --json
```

`workspace.discovery.validate` is workspace-scoped and read-only.

### Workspace discovery contract

```ts
interface WorkspacePackageInfo {
  name: string;
  directory: string;
  absoluteDirectory: string;
  packageJsonPath: string;
  workspacePattern: string;
  kind: "app" | "package" | "os-package" | "integration" | "other";
  packageJson: {
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    gogol?: unknown;
  };
}

interface WorkspaceDiscoveryResult {
  workspaceRoot: string;
  packageGlobs: string[];
  packages: WorkspacePackageInfo[];
  diagnostics: Diagnostic[];
}
```

Rules:

- Include all positive `pnpm-workspace.yaml` patterns.
- Respect negative `!` patterns if the repository begins using them.
- Ignore directories starting with `.` or `-` during glob expansion unless pnpm semantics require otherwise.
- Preserve the contributing `workspacePattern` for diagnostics.
- Sort output deterministically by relative directory.
- Do not import app code.

### CI workflow parser contract

```ts
interface GithubWorkflow {
  path: string;
  name?: string;
  on?: unknown;
  jobs: Record<string, GithubWorkflowJob>;
}

interface GithubWorkflowJob {
  name?: string;
  steps: GithubWorkflowStep[];
}

interface GithubWorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowCommandOccurrence {
  workflowPath: string;
  jobId: string;
  stepIndex: number;
  stepName?: string;
  command: string;
}
```

`ci.local.validate` must compare required commands against `run` step content only. It may support exact line matching or shell-block command extraction, but comments must never count.

### CI validation rules

`ci.local.validate` emits:

- `CI-LOCAL-01`: required command missing from real run steps.
- `CI-LOCAL-02`: required app author check missing for a discovered app.
- `CI-LOCAL-03`: workflow uses `pnpm/action-setup` with mismatched major version.
- `CI-LOCAL-04`: workflow uses pnpm without Corepack or matching setup.
- `CI-LOCAL-05`: workflow YAML is malformed or missing required `jobs`.
- `CI-LOCAL-06`: required command appears only in comments/non-run text.

`workspace.discovery.validate` emits:

- `WORKSPACE-DISCOVERY-01`: package matched by pnpm workspace is not classified.
- `WORKSPACE-DISCOVERY-02`: package.json missing `name`.
- `WORKSPACE-DISCOVERY-03`: unsupported workspace glob pattern.
- `WORKSPACE-DISCOVERY-04`: duplicate package directory matched by multiple patterns without deterministic tie-break.

### File system responsibilities

| Path | Role |
| --- | --- |
| `pnpm-workspace.yaml` | Source of workspace package globs |
| `.github/workflows/*.yml` | Source of CI workflow steps |
| `packages/os/site-kernel/src/workspace-discovery.ts` | Preferred shared helper location |
| `packages/os/site-kernel-checks/src/workspace-discovery.ts` | Alternative helper location if kept checks-local |
| `packages/os/site-kernel-checks/src/ecosystem.ts` | Consumes shared discovery; removes local duplicate functions |
| `packages/os/site-kernel-checks/src/test-signal.ts` | Consumes shared discovery; removes local duplicate functions |
| `packages/os/site-kernel-checks/src/ci-local.ts` | Parses workflows structurally |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Registers new rule ids |
| `packages/os/site-kernel-checks/src/tests/` | Adds workspace discovery and CI parser tests |

## Rollout

1. Create shared workspace discovery helper and tests using a temporary workspace fixture with apps, packages, `packages/os`, and integrations.
2. Refactor `ecosystem.ts` to consume the helper.
3. Refactor `test-signal.ts` to consume the helper.
4. Add `workspace.discovery.validate` and include it in `PACKAGES_CHECK_PIPELINE` near `workspace.surface.validate`.
5. Replace `ci.local.validate` string scanning with YAML parsing.
6. Add tests showing that commands in comments do not satisfy CI validation.
7. Add tests for multiline `run` blocks and Corepack/pnpm action detection.
8. Regenerate `docs/ecosystem.generated.json` if helper output changes source hashes or projections.

## Best project decision

The best project decision is to treat workspace discovery as a kernel-level primitive. It is not a check rule; it is repository topology. Keeping it in one framework-free helper prevents every future governance command from growing its own pnpm-workspace parser.

For CI, the best decision is structured YAML parsing even if the first parser is modest. `ci.local.validate` is a trust gate; a comment should never pass a gate.

## Alternatives considered

Keeping duplicate discovery functions was rejected because RFC-0246 already established workspace discovery as a core Agent Control Plane invariant.

Using a general glob library directly in each command was rejected because it repeats policy decisions about ignored directories, negative patterns, package kind classification, and deterministic ordering.

Keeping `source.includes(command)` in `ci.local.validate` was rejected because it cannot distinguish comments, step names, documentation blocks, and actual commands.

Executing the workflow locally to prove commands run was rejected as too heavy and platform-dependent. Structural parsing is sufficient for this RFC.

## Risks

Pnpm workspace glob semantics can be richer than the repository's current patterns. The helper should support current patterns first and emit explicit diagnostics for unsupported patterns rather than silently guessing.

Parsing shell command blocks exactly is hard. The first implementation can use line-level matching in `run` blocks while still avoiding comments/non-run text.

Moving discovery into `@gogol/site-kernel` can create dependency pressure if the helper imports check-specific types. Keep the helper framework-free and use shared `Diagnostic` types already owned by the kernel.

## Acceptance criteria

- [x] A single workspace discovery helper is used by ACP generation and test signal classification. (evidence: implemented historically)
- [x] Duplicate workspace glob expansion functions are removed from `ecosystem.ts` and `test-signal.ts`. (evidence: implemented historically)
- [x] `workspace.discovery.validate` is registered and included in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `ci.local.validate` parses GitHub workflow YAML and reads actual `jobs.*.steps[].run` / `uses` fields. (evidence: implemented historically)
- [x] Commands mentioned only in comments or step names do not satisfy `ci.local.validate`. (evidence: implemented historically)
- [x] Corepack and `pnpm/action-setup` version checks use structured workflow step data. (evidence: implemented historically)
- [x] Tests cover workspace discovery fixtures, workflow comments, multiline run blocks, and pnpm version mismatch. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run ecosystem.manifest.validate --json`, `workspace.surface.validate --json`, `test.signal.validate --json`, `ci.local.validate --json`, `packages-check.run --json`, `pnpm test`, and `rfc.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted` or `status: implemented`.
- Start by writing tests around current behavior before moving the helper.
- Do not change `pnpm-workspace.yaml` semantics as part of this RFC unless a test shows current semantics are wrong.
- Keep output ordering deterministic; ACP drift is intentionally strict.
- When parsing workflow YAML, use the repository's existing `yaml` dependency rather than ad hoc regular expressions.
- Keep `ci.local.validate` read-only; it should report workflow drift, not rewrite workflows.
