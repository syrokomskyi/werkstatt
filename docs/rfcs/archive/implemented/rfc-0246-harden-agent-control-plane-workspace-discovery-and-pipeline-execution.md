---
id: RFC-0246
title: "Harden Agent Control Plane workspace discovery and pipeline execution"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-30
updatedAt: 2026-06-30
implementedAt: 2026-06-30
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0365
related:
  - RFC-0087
  - RFC-0203
  - RFC-0222
  - RFC-0224
  - RFC-0245
commands:
  proposed:
    - workspace.surface.validate
  added:
    - workspace.surface.validate
  changed:
    - ecosystem.manifest.generate
    - ecosystem.manifest.validate
    - packages.check
    - packages-check.run
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol-integrations/lagebild-sync-worker"
successSignals:
  - "`docs/ecosystem.generated.json` includes every package matched by `pnpm-workspace.yaml`, including `integrations/lagebild-sync-worker`."
  - "`pnpm exec site-kernel run packages.check --json` and `pnpm exec site-kernel run packages-check.run --json` both execute from the workspace root without requiring a target app."
  - "`ecosystem.manifest.validate --json` fails when any workspace package, integration package, root pipeline, or exported pipeline is omitted from the committed Agent Control Plane manifest."
  - "The manifest exposes deterministic metadata without presenting `1970-01-01T00:00:00.000Z` as a real generation time."
nonGoals:
  - "Do not make `docs/ecosystem.generated.json` normative; it remains a generated projection of live sources."
  - "Do not change app-scoped pipeline semantics except where needed to keep workspace pipelines targetless."
  - "Do not implement this hardening while the RFC remains draft."
---

# RFC-0246: Harden Agent Control Plane workspace discovery and pipeline execution

## Context

RFC-0245 introduced the Agent Control Plane manifest and maintenance debt ledger so autonomous agents can start from one generated map before editing the monorepo. A monthly AEO audit on 2026-06-30 found that the first implementation is useful but not yet complete enough to be trusted as an agent planning surface.

Observed failures:

- `pnpm exec site-kernel run ecosystem.manifest.validate --json` fails because `docs/ecosystem.generated.json` is drifted from live workspace state.
- `pnpm exec site-kernel run packages-check.run --json` executes and reports the drift, but `pnpm exec site-kernel run packages.check --json` fails with `No target app with a kernel config could be resolved.`
- `pnpm-workspace.yaml` includes `integrations/*`, but `packages/os/site-kernel-checks/src/ecosystem.ts` discovers only `packages` and `packages/os`.
- `integrations/lagebild-sync-worker/package.json` is a real workspace package and is invisible in the current manifest.
- The manifest stores `generatedAt: "1970-01-01T00:00:00.000Z"`. The value is deterministic, but an agent may interpret it as stale real time rather than a stable sentinel.

## Problem

The Agent Control Plane is intended to reduce hallucination by giving agents a structured workspace map. Today it can omit an entire workspace family and expose a root pipeline that cannot run through the same Site OS path as a command.

The unprotected invariant is: **every workspace package and every root-level pipeline advertised to agents must be discoverable, executable, and represented with unambiguous metadata.**

If this invariant is not enforced, an autonomous agent can make wrong planning decisions:

- Treat `integrations/*` as out-of-scope because the ACP does not list it.
- Prefer `packages.check` from root configuration and hit an app-resolution error.
- Treat deterministic epoch metadata as evidence that the manifest is obsolete for the wrong reason.
- Fix drift manually instead of repairing the generator or runtime contract.

## Decision

The Site OS hardens the Agent Control Plane in three areas:

1. Workspace package discovery is derived from `pnpm-workspace.yaml` package globs, not hardcoded directory pairs.
2. Workspace pipelines registered in root `tools/kernel.config.ts` execute targetlessly from the workspace root, matching exported composite commands such as `packages-check.run`.
3. The generated manifest gains explicit deterministic metadata so agents can distinguish content freshness from stable output formatting.

A new workspace-scoped validator, `workspace.surface.validate`, guards the relationship between workspace package globs, command registries, root pipelines, and `docs/ecosystem.generated.json`.

## Architectural fit

This RFC extends RFC-0245 without replacing it. The generated manifest remains a projection; authoritative sources remain `pnpm-workspace.yaml`, package manifests, command tables, root `tools/kernel.config.ts`, RFCs, GRACE XML, and AGENTS files.

It also reinforces RFC-0087's single-owner/content-driven/idempotent discipline: generated operator state must be derived from source-of-truth configuration, not maintained by hand-coded path conventions.

The runtime change belongs in `@gogol/site-kernel`, because root pipeline execution is kernel orchestration behavior. The manifest and validation changes belong in `@gogol/site-kernel-checks`, where RFC-0245 already placed the ACP commands.

## Design

### CLI surface

```sh
pnpm exec site-kernel run workspace.surface.validate --json
pnpm exec site-kernel run ecosystem.manifest.generate
pnpm exec site-kernel run ecosystem.manifest.validate --json
pnpm exec site-kernel run packages.check --json
pnpm exec site-kernel run packages-check.run --json
```

`workspace.surface.validate` is workspace-scoped and read-only. It verifies:

- every `pnpm-workspace.yaml` glob that resolves to a `package.json` is represented in the ACP package list;
- every root pipeline in `tools/kernel.config.ts` can be classified as `scope: "workspace"` or `scope: "app"`;
- workspace pipelines do not require `--app`;
- `packages.check` and `packages-check.run` are either aliases over the same step list or explicitly documented as distinct.

### TypeScript contracts

```ts
interface WorkspacePackageGlob {
  pattern: string;
  directories: string[];
}

interface EcosystemManifestV2 {
  generatedMarker: string;
  meta: {
    schemaVersion: 2;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sources: Array<{ path: string; hash: string }>;
  };
  workspace: {
    name: string;
    version: string;
    packageManager: string;
    packageGlobs: string[];
  };
  packages: Array<{
    name: string;
    directory: string;
    workspacePattern: string;
    kind: "app" | "package" | "os-package" | "integration" | "other";
    dependencies: string[];
  }>;
  pipelines: Array<{
    name: string;
    scope: "app" | "workspace";
    commands: string[];
    executableFromRoot: boolean;
  }>;
}

interface WorkspaceSurfaceValidateResult {
  command: "workspace.surface.validate";
  status: "pass" | "fail";
  diagnostics: Diagnostic[];
}
```

The legacy top-level `generatedAt` field is deprecated. During rollout, readers may accept both shapes, but agents should prefer `meta.generatedAt` and `meta.contentHash`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `pnpm-workspace.yaml` | Source of truth for workspace package globs |
| `integrations/*/package.json` | Must be discovered as workspace packages |
| `tools/kernel.config.ts` | Source of root pipeline declarations, including `packages.check` |
| `packages/os/site-kernel/src/runtime.ts` | Owns targetless execution semantics for workspace pipelines |
| `packages/os/site-kernel-checks/src/ecosystem.ts` | Generates and validates ACP manifest content |
| `docs/ecosystem.generated.json` | Generated ACP projection, never hand-edited |

### Output format

```json
{
  "command": "workspace.surface.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "workspace.surface.validate",
      "severity": "error",
      "file": "pnpm-workspace.yaml",
      "message": "Workspace package integrations/lagebild-sync-worker is not present in docs/ecosystem.generated.json.",
      "fixHint": "Update ecosystem manifest generation to derive packages from pnpm-workspace.yaml globs, then run ecosystem.manifest.generate."
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

`workspace.surface.validate` exits non-zero when a workspace package, root pipeline, or generated manifest projection is missing or inconsistent.

`ecosystem.manifest.validate` continues to exit non-zero on drift. Its diagnostic should distinguish:

- manifest file missing;
- manifest content drift;
- workspace package discovery drift;
- unsupported legacy manifest schema.

Pretty output may be truncated by the standard diagnostic printer. `--json` must emit the full `Diagnostic[]`.

## Rollout

1. Introduce manifest schema v2 with dual-reader support for the existing v1 shape.
2. Replace hardcoded package roots with `pnpm-workspace.yaml` glob expansion.
3. Update root pipeline execution so workspace pipelines do not call app target resolution.
4. Add `workspace.surface.validate` to `PACKAGES_CHECK_PIPELINE` after `ecosystem.manifest.validate`.
5. Regenerate `docs/ecosystem.generated.json`.
6. Update root AGENTS guidance to say the ACP is generated and must be regenerated, not hand-edited, when workspace topology changes.

## Alternatives considered

Keeping `collectPackageDirectories()` hardcoded was rejected because every new workspace family would need a code edit and agents would not know the list is incomplete.

Treating `packages.check` as an obsolete alias was rejected because it is already present in root configuration and therefore agent-visible. An advertised pipeline must either run or be removed by a separate accepted RFC.

Keeping the epoch `generatedAt` without explanation was rejected because it optimizes diff stability at the cost of agent interpretation.

## Risks

Glob expansion may accidentally include package fixtures if future workspace patterns are too broad. `workspace.surface.validate` should report the contributing glob for every package so false positives can be traced to `pnpm-workspace.yaml`.

Changing pipeline execution touches central runtime behavior. The implementation should add targeted tests for app-scoped and workspace-scoped pipelines rather than relying on manual command runs.

Manifest schema v2 can break consumers that assume top-level `generatedAt`. The rollout keeps compatibility until all in-repo consumers move to `meta`.

## Acceptance criteria

- [x] Workspace package discovery is derived from `pnpm-workspace.yaml`, including `integrations/*`. (evidence: implemented historically)
- [x] `docs/ecosystem.generated.json` records `integrations/lagebild-sync-worker`. (evidence: docs/ directory, documentation exists)
- [x] Manifest metadata exposes schema version, deterministic policy, source hash or content hash, and no misleading real timestamp. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run packages.check --json` runs from the repository root without an app target. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run packages-check.run --json` and `packages.check` have documented, test-pinned relationship. (evidence: implemented historically)
- [x] `workspace.surface.validate` is registered as a workspace-scoped command and returns canonical diagnostics. (evidence: implemented historically)
- [x] `workspace.surface.validate` is included in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `ecosystem.manifest.validate --json`, `packages-check.run --json`, and `rfc.validate` pass after regeneration. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted` or `status: implemented`.
- Agents MUST NOT hand-edit `docs/ecosystem.generated.json`; modify the generator, then run `ecosystem.manifest.generate`.
- Agents MUST preserve deterministic manifest output. Use hashes and source lists for freshness, not wall-clock timestamps.
- Agents MUST add runtime tests for root workspace pipeline execution before changing `executeKernelPipeline`.
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` only after every acceptance criterion is satisfied, validators pass, and the implementing commit references `RFC-0246`.
