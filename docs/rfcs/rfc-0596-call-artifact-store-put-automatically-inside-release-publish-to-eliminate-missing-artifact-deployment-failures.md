---
id: RFC-0596
title: "Call artifact.store.put automatically inside release.publish to eliminate missing-artifact deployment failures"
status: draft
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
  - DNA-48
  - DNA-52
  - RFC-0357
  - RFC-0363
  - RFC-0585
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-52
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
    - release.publish
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals: []
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

# RFC-0596: Call artifact.store.put automatically inside release.publish to eliminate missing-artifact deployment failures

## Context

During deployment of release `warpgogol-com-r000003`, `leitstand.propagate` failed with `preflight failed: artifact-hash`. The root cause: `release.publish` transitioned the release to `published` state but did not store the dist artifact in the artifact store. The `artifact` field in `release.yaml` was `null`, and `distArtifactHash` was `null`.

The operator had to manually run `artifact.store.put --release warpgogol-com-r000003 --dist releases/warpgogol-com-r000003/dist` before `leitstand.propagate` could succeed. This is a manual step that the operator must remember — there is no automated gate.

The current workflow is: `release.prepare` (builds dist) → `release.publish` (marks published) → `artifact.store.put` (stores artifact) → `leitstand.propagate` (deploys). The `artifact.store.put` step is not connected to `release.publish` — it's a separate command that must be run manually.

## Problem

`release.publish` (RFC-0357) transitions a release from `prepared` to `published` state. It verifies the behavior snapshot diff, migrator validation, and version comparison — but does not store the dist artifact. The `artifact` field in `release.yaml` is set to `(manifest.artifact as string) ?? null`, which is `null` because `release.prepare` does not populate it.

`leitstand.propagate` (RFC-0358) requires the artifact to be in the store — it runs `artifactStorePreflight` which checks for the artifact manifest and verifies the `distTreeHash`. If the artifact is missing, propagation fails with `preflight failed: artifact-hash`.

The gap: `release.publish` produces a published release that is not deployable. The operator must know to run `artifact.store.put` between `release.publish` and `leitstand.propagate`. This is a manual discipline step with no automated enforcement.

## Decision

`release.publish` calls `artifact.store.put` inline after transitioning the release to `published` state. The dist directory is resolved from the release directory (`releases/<releaseId>/dist`). The artifact manifest is written, the `distArtifactHash` is computed, and the `artifact` field in `release.yaml` is updated with the artifact URI. The operator no longer needs to run `artifact.store.put` separately — `release.publish` produces a fully deployable release in one step.

## Architectural fit

- **DNA-48 (Release discipline)** — a release cannot be published unless the artifact is stored and hash-verified. Currently this is a manual step; this RFC makes it automatic.
- **DNA-52 (Release artifact store)** — published release artifacts are durable, content-addressed records. This RFC ensures every published release has an artifact store entry.
- **RFC-0357** — established the release lifecycle. This RFC extends `release.publish` with artifact storage.
- **RFC-0363** — established the artifact store. `artifact.store.put` is idempotent — re-running for the same releaseId is safe. This RFC calls it automatically.
- **RFC-0585** — restored `release.prepare` production build and added dist guard. This RFC completes the chain: prepare builds dist, publish stores it.

## Design

### CLI surface

No new commands. `release.publish` gains an inline artifact storage step:

```sh
# release.publish — now stores artifact automatically
pnpm exec site-kernel run release.publish --release warpgogol-com-r000003
# Output:
#   [release.publish] release warpgogol-com-r000003 published
#   [release.publish] artifact stored: sha256:5350baa5... (tar.gz, 2.3 MB)
#   [release.publish] artifact URI: artifact-store://warpgogol-com-r000003

# leitstand.propagate — now works without manual artifact.store.put
pnpm exec site-kernel run leitstand.propagate --system warpgogol-com --release warpgogol-com-r000003 --channel alt
# Preflight passes — artifact is in store
```

### TypeScript contracts

```ts
// release-commands.ts — runReleasePublish extended
async function runReleasePublish(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleasePublishData>> {
  // ...existing validation (snapshot diff, migrator, version compare)...

  // NEW: store artifact inline after state transition
  const distDir = path.join(releaseDir, "dist");
  if (!existsSync(distDir)) {
    throw new Error(
      `[release.publish] dist directory not found at ${distDir} — run release.prepare first`,
    );
  }

  const artifactResult = await runArtifactStorePut({
    flags: { release: releaseId, dist: distDir },
  }, context);

  // Update release manifest with artifact reference
  manifest.artifact = artifactResult.data.artifactUri;
  manifest.distArtifactHash = artifactResult.data.distArtifactHash;
  await writeReleaseManifest(workspaceRoot, manifest);

  // ...existing bordbuch entry, auto-commit...
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `runReleasePublish` calls `runArtifactStorePut` inline after state transition |
| `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts` | Existing `runArtifactStorePut` — called by `release.publish` |
| `releases/<releaseId>/release.yaml` | Updated with `artifact` URI and `distArtifactHash` |
| `releases/<releaseId>/dist/` | Source directory for artifact tar.gz |

### Output format

```json
{
  "command": "release.publish",
  "exitCode": 0,
  "data": {
    "releaseId": "warpgogol-com-r000003",
    "state": "published",
    "publishedAt": "2026-07-30T00:51:45.168Z",
    "artifact": {
      "uri": "artifact-store://warpgogol-com-r000003",
      "distArtifactHash": "sha256:5350baa5afbc8b956fa47c21411de84c1661f490a3f324f940105b53e49e5fa9",
      "sizeBytes": 2345678
    }
  },
  "summary": "[release.publish] release warpgogol-com-r000003 published with artifact"
}
```

### Failure modes

- **dist directory missing**: `release.publish` throws before state transition. The release remains `prepared`, not `published`. The error directs to `release.prepare`.
- **artifact.store.put fails**: `release.publish` throws after state transition but before writing the updated manifest. The release is `published` but the artifact is not stored. The operator can re-run `release.publish` (idempotent — `artifact.store.put` overwrites existing manifest) or run `artifact.store.put` manually.
- **artifact already stored**: `artifact.store.put` is idempotent — it removes the existing manifest and writes a new one. Re-running `release.publish` is safe.
- **dist directory empty**: `artifact.store.put` will create an empty tar.gz. This is a degenerate case — `release.prepare` should not produce an empty dist. The operator should re-run `release.prepare`.

## Rollout

- **Default behavior**: active from day one. Every `release.publish` automatically stores the artifact.
- **Existing systems**: no migration needed. Already-published releases without artifacts remain as they are — `artifact.store.put` can still be run manually for old releases.
- **New systems**: automatically compliant — `release.publish` stores the artifact in one step.
- **Pipeline integration**: no pipeline changes. The artifact storage runs inside `release.publish` itself.
- **`artifact.store.put` as standalone command**: remains available for manual use (e.g., re-storing after dist changes, testing). It is not deprecated — it becomes a fallback for edge cases.

## Alternatives considered

1. **`release.publish` requires artifact in store** — `release.publish` would check `artifactStorePreflight` and refuse if the artifact is missing, directing the operator to run `artifact.store.put` first. Rejected: two-step workflow is error-prone. The operator can forget. The goal is one-step publish.

2. **`release.prepare` calls `artifact.store.put`** — store the artifact during `release.prepare` instead of `release.publish`. Rejected: `release.prepare` builds the dist, but the release is not yet published. Storing an artifact for an unpublished release is premature — the operator might abort the release after prepare. Artifact storage should happen at publish time, when the release is finalized.

3. **`leitstand.propagate` auto-creates artifact** — if the artifact is missing, `leitstand.propagate` would call `artifact.store.put` before deploying. Rejected: propagation is a deployment operation, not a release operation. Artifact storage belongs in the release lifecycle, not the deployment lifecycle. Mixing concerns makes the system harder to reason about.

## Risks

- **Performance**: `artifact.store.put` creates a tar.gz archive of `dist/`. For a typical site (2-5 MB), this takes <1 second. Acceptable for a publish operation.
- **Disk space**: each publish creates a new tar.gz in the artifact store. `artifact.store.gc` (RFC-0363) handles cleanup. Not a concern for normal operation.
- **Partial failure**: if `artifact.store.put` fails after the release is already `published`, the release is published but not deployable. Mitigation: `artifact.store.put` is idempotent — the operator re-runs `release.publish` or `artifact.store.put` manually.
- **Agent confusion**: agents may still run `artifact.store.put` manually before `release.publish`. This is harmless — `artifact.store.put` is idempotent. `release.publish` will overwrite the artifact with the same content.
- **Circular dependency**: `release.publish` calls `runArtifactStorePut` from the same package (`site-kernel-handoff`). No cross-package dependency — both are in the same package.

## Acceptance criteria

- [ ] `release.publish` calls `artifact.store.put` inline after transitioning to `published` state
- [ ] `release.publish` resolves dist directory from `releases/<releaseId>/dist`
- [ ] `release.publish` throws with a descriptive error if `dist/` directory is missing
- [ ] `release.yaml` is updated with `artifact` URI and `distArtifactHash` after artifact storage
- [ ] `release.publish` output includes artifact hash and size in `--json` mode
- [ ] `leitstand.propagate` succeeds after `release.publish` without manual `artifact.store.put`
- [ ] Re-running `release.publish` is safe (idempotent artifact storage)
- [ ] `AGENTS.md` updated with the automatic artifact storage behavior
- [ ] Unit tests cover: publish stores artifact, publish fails on missing dist, re-publish is idempotent
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add a `--skip-artifact-store` flag to bypass artifact storage. Hard gate only.
- Agents MUST NOT remove the standalone `artifact.store.put` command — it remains available for manual use.
- Agents MUST NOT call `artifact.store.put` before the state transition — the release must be `published` first.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
