---
id: RFC-0249
title: "Establish autonomous package quality and CI gates"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-30
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0081
  - RFC-0087
  - RFC-0092
  - RFC-0203
  - RFC-0224
  - RFC-0245
commands:
  proposed:
    - ci.local.validate
    - test.signal.validate
  added:
    - ci.local.validate
    - test.signal.validate
  changed:
    - packages-check.run
    - ecosystem.manifest.generate
    - ecosystem.manifest.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/content-source"
  - "@gogol/geo"
successSignals:
  - "`pnpm lint:packages` passes and is part of the autonomous package quality gate."
  - "ESLint configuration either registers `@typescript-eslint` rules used in disable comments or rejects stale unknown disable directives through a documented local rule."
  - "Workspace-internal `as any` casts are removed or replaced by typed seams, including dynamic import boundaries."
  - "CI uses the same pnpm major version declared by root `packageManager`."
  - "The Agent Control Plane records whether each package test script is real, no-op, absent, or skipped."
nonGoals:
  - "Do not require every package to gain full unit coverage in the first implementation."
  - "Do not replace package-specific build checks with one monolithic script."
  - "Do not implement this gate while the RFC remains draft."
---

# RFC-0249: Establish autonomous package quality and CI gates

## Context

The repository is designed for autonomous AI-agent maintenance. That only works if the standard gates catch type-safety, lint, command, and CI drift before an agent hands work back.

The 2026-06-30 audit found several gaps:

- `pnpm lint:packages` fails with local `no-as-any` violations in `packages/content-source/src/astro.ts`, `packages/geo/src/slug.ts`, and `packages/os/site-kernel-checks/src/content-business.ts`.
- The same lint run reports unknown rule comments for `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-require-imports`.
- Root `package.json` declares `packageManager: "pnpm@11.8.0"`, while `.github/workflows/changelog.yml` pins `pnpm/action-setup` to `version: 10.33.0`.
- Existing workflows cover RFC governance, changelog, and scaffold smoke checks, but there is no general PR gate that runs package lint, package checks, app author checks, and tests together.
- `pnpm test` passes, but several packages expose no-op or empty test scripts, which makes the green result ambiguous for agents.

## Problem

The unprotected invariant is: **a green autonomous gate must mean the repository is type-safe, lint-clean, command-clean, and honest about test coverage.**

Today an agent can run `pnpm test` and get a pass while package lint is broken, CI pnpm version is inconsistent, and some packages have no real tests. That creates a false sense of completion and encourages type-safety bypasses such as `as any` at workspace API boundaries.

## Decision

The workspace gains an autonomous package quality gate that local agents and CI run consistently.

Two commands formalize the gate:

- `ci.local.validate`: workspace-scoped composite validation that mirrors the required PR checks without deployment credentials.
- `test.signal.validate`: workspace-scoped classifier that records each package's test posture as `real`, `noop`, `absent`, or `skipped`.

The Agent Control Plane manifest records test signal classification per package so agents can tell whether `pnpm test` exercised meaningful tests.

ESLint configuration must be internally coherent: any rule referenced by disable comments is registered, or the comments are removed and local rules own the policy. Workspace-internal API calls must not use `as any` to mask type errors.

## Architectural fit

This RFC reinforces RFC-0092's package import determinism and the root AGENTS rule forbidding `as any` for workspace-internal APIs. It also complements RFC-0245 by making ACP package entries carry test-signal metadata.

The commands belong in `@gogol/site-kernel-checks`, because they are workspace governance checks. CI workflow updates belong at `.github/workflows/*` and should call the same commands agents run locally.

## Design

### CLI surface

```sh
pnpm exec site-kernel run test.signal.validate --json
pnpm exec site-kernel run ci.local.validate --json
pnpm lint:packages
pnpm exec site-kernel run packages-check.run --json
pnpm test
```

`ci.local.validate` is a composite read-only command. It should run, or verify that CI runs, the minimum autonomous gate:

- package lint;
- package checks;
- app author checks for every deployable app;
- RFC validation;
- tests;
- test signal validation.

### TypeScript contracts

```ts
type TestSignalKind = "real" | "noop" | "absent" | "skipped";

interface PackageTestSignal {
  packageName: string;
  directory: string;
  script?: string;
  signal: TestSignalKind;
  evidence: string;
  requiredAction?: string;
}

interface TestSignalValidateResult extends CheckResult {
  command: "test.signal.validate";
  diagnostics: Diagnostic[];
  packages: PackageTestSignal[];
}

interface CiLocalValidateResult extends CheckResult {
  command: "ci.local.validate";
  checkedCommands: string[];
}
```

No-op test detection should classify obvious forms:

- `node -e "process.exit(0)"`
- `echo "No tests yet"`
- missing `test` script
- scripts that only print placeholders and exit zero

The first rollout may report no-op and absent tests as warnings. Packages that claim production-critical runtime behavior can be promoted to fail-hard by a later accepted RFC or by explicit package contract.

### File system responsibilities

| Path | Role |
| --- | --- |
| `eslint.config.js` | Registers rules and local lint policy coherently |
| `package.json` | Source for root package manager version and scripts |
| `pnpm-workspace.yaml` | Source of workspace package enumeration |
| `packages/*/package.json`, `packages/os/*/package.json`, `integrations/*/package.json` | Source of package test scripts |
| `.github/workflows/*.yml` | CI workflows must use root package manager version and run the autonomous gate |
| `packages/os/site-kernel-checks/src/ecosystem.ts` | Adds test-signal projection to ACP manifest |
| `packages/os/site-kernel-checks/src/test-signal.ts` | New classifier command |
| `packages/os/site-kernel-checks/src/ci-local.ts` | New local CI mirror command |

### Output format

```json
{
  "command": "test.signal.validate",
  "status": "warn",
  "packages": [
    {
      "packageName": "@gogol/ui",
      "directory": "packages/ui",
      "script": "node -e \"console.log('No tests yet')\"",
      "signal": "noop",
      "evidence": "test script prints a placeholder and exits zero",
      "requiredAction": "Add a real test script or mark the package as intentionally skipped with a package-level rationale."
    }
  ],
  "diagnostics": [
    {
      "ruleId": "test.signal.validate",
      "severity": "warning",
      "file": "packages/ui/package.json",
      "message": "@gogol/ui test script is a no-op placeholder.",
      "fixHint": "Add real tests or document an explicit skipped test signal."
    }
  ],
  "summary": { "error": 0, "warning": 1, "info": 0 }
}
```

### Failure modes

`ci.local.validate` exits non-zero if any fail-hard member command fails. Warning-only test signal debt returns zero while producing diagnostics, unless the affected package has opted into a stricter package contract.

`test.signal.validate` exits zero for warn-only classifications during first rollout. It exits non-zero for malformed package manifests, unreadable workspace definitions, or inconsistent explicit skip metadata.

CI should fail on:

- package lint errors;
- package-check errors;
- RFC validation errors;
- app author check errors;
- test command failures;
- pnpm version mismatch.

## Rollout

1. Repair current lint failures without using `as any` at workspace-internal API boundaries.
2. Align GitHub workflows with root `packageManager` and remove hardcoded mismatched pnpm versions.
3. Add `test.signal.validate` and project its result into `docs/ecosystem.generated.json`.
4. Add `ci.local.validate` as the local mirror of required CI checks.
5. Add a general CI workflow that runs the autonomous gate on pull requests.
6. Keep no-op/absent tests as warnings at first; promote selected package classes after package owners define minimum coverage contracts.

## Alternatives considered

Relying on `pnpm test` alone was rejected because it cannot distinguish real tests from placeholders.

Putting all logic directly into GitHub Actions was rejected because local agents need the same deterministic gate without reading CI YAML.

Disabling unknown ESLint rule warnings was rejected because stale disable comments make agents believe a rule exists when it does not.

Allowing `as any` at dynamic import boundaries was rejected for workspace-internal APIs. When a dynamic module lacks a type, the seam should use `unknown`, a type guard, or a narrow interface.

## Risks

The first `test.signal.validate` rollout may produce a large warning set. The command should classify, not shame: its value is making test posture explicit.

`ci.local.validate` can become slow if it eagerly runs every app check. The command may support `--changed` later, but the default full gate must remain deterministic and available.

CI workflow changes can consume more minutes. The gate should use pnpm and turbo caching, but not skip required checks silently.

## Acceptance criteria

- [x] Current `pnpm lint:packages` failures are fixed without workspace-internal `as any` bypasses. (evidence: implemented historically)
- [x] ESLint configuration and disable comments are coherent; no unknown rule comments remain in normal lint output. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `test.signal.validate` is registered and classifies every workspace package from `pnpm-workspace.yaml`. (evidence: implemented historically)
- [x] `docs/ecosystem.generated.json` includes per-package test signal data after regeneration. (evidence: docs/ directory, documentation exists)
- [x] `ci.local.validate` is registered and documents the same command set as the general CI workflow. (evidence: implemented historically)
- [x] GitHub workflows use the pnpm version declared by root `packageManager` or a documented Corepack path that respects it. (evidence: implemented historically)
- [x] A general PR CI workflow runs package lint, package checks, RFC validation, app author checks, tests, and test signal validation. (evidence: implemented historically)
- [x] `ci.local.validate --json`, `packages-check.run --json`, `pnpm test`, and `rfc.validate` pass after implementation. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code, lint, or CI changes only when this RFC has `status: accepted` or `status: implemented`.
- Agents MUST NOT replace `as any` with a different type assertion that hides the same missing contract. Prefer typed interfaces, `unknown`, and type guards.
- Agents MUST keep CI and local gates aligned; do not add a GitHub-only check without a local command or documented reason.
- Agents MUST treat no-op tests as explicit debt, not as a green proof of behavior.
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` only after every acceptance criterion is satisfied, validators pass, and the implementing commit references `RFC-0249`.
