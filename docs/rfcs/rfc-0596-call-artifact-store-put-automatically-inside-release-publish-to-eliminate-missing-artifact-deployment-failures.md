---
id: RFC-0596
title: "Call artifact.store.put automatically inside release.publish to eliminate missing-artifact deployment failures"
status: accepted
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

`release.publish` stores the dist artifact **before** transitioning the release to `published` state. The dist directory is resolved from the release directory (`releases/<releaseId>/dist`). A lock-free `storeArtifactCore` helper (extracted from `runArtifactStorePut`) is called inline — it creates the tar.gz archive, computes the `distArtifactHash`, writes the artifact manifest, and returns the artifact URI and hash. These are written to `release.yaml` before the state transition. Only after the artifact is successfully stored does `release.publish` transition the release to `published`. This eliminates the partial failure window: if artifact storage fails, the release remains `prepared`; if the state transition fails, the artifact is stored and re-running `release.publish` is safe (idempotent artifact storage + state transition).

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
# release.publish — now stores artifact automatically before state transition
pnpm exec site-kernel run release.publish --release warpgogol-com-r000003
# Output:
#   [release.publish] artifact stored: sha256:5350baa5... (tar.gz, 2.3 MB)
#   [release.publish] artifact URI: local://.werkstatt/artifacts/releases/sha256/53/5350baa5....manifest.json
#   [release.publish] release warpgogol-com-r000003 published

# leitstand.propagate — now works without manual artifact.store.put
pnpm exec site-kernel run leitstand.propagate --system warpgogol-com --release warpgogol-com-r000003 --channel alt
# Preflight passes — artifact is in store
```

### TypeScript contracts

The existing `runArtifactStorePut` is split into two parts:

1. **`storeArtifactCore(workspaceRoot, releaseId, distDir)`** — lock-free core logic: hash dir, create tar.gz, compute `distArtifactHash`, write manifest, return `{ uri, distArtifactHash, distTreeHash, byteSize, fileCount }`. This is called by `release.publish` directly, without lock acquisition.

2. **`runArtifactStorePut`** — thin wrapper that acquires `release:${releaseId}` lock, calls `storeArtifactCore`, releases lock. Used by the standalone `artifact.store.put` command.

```ts
// release-commands.ts — runReleasePublish extended
async function runReleasePublish(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ReleasePublishData>> {
  // ...existing validation (snapshot diff, migrator, version compare, reconcile check)...
  // ...existing dist directory check (already present at release-commands.ts:529-535)...

  // NEW: store artifact BEFORE state transition (eliminates partial failure)
  // release.publish already holds release:${releaseId} and system:${systemId} locks,
  // so we call the lock-free core directly — not runArtifactStorePut which would deadlock.
  const artifactResult = await storeArtifactCore(
    workspaceRoot,
    releaseId,
    path.join(releaseDir, "dist"),
  );

  // Update release manifest with artifact reference
  manifest.artifact = artifactResult.uri;
  manifest.distArtifactHash = artifactResult.distArtifactHash;
  await writeReleaseYaml(workspaceRoot, releaseId, manifest);

  // NOW transition to published — only after artifact is stored
  manifest.state = "published";
  manifest.publishedAt = now;
  await writeReleaseYaml(workspaceRoot, releaseId, manifest);

  // ...existing bordbuch entry, registry update...
}

// Extended ReleasePublishData
export interface ReleasePublishData {
  releaseId: string;
  systemId: string;
  state: "published";
  publishedAt: string;
  artifactUri: string | null;      // existing field, now populated
  distArtifactHash: string | null;  // NEW field
  distVerified: boolean;            // existing field
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `runReleasePublish` calls `storeArtifactCore` inline before state transition; `ReleasePublishData` extended with `distArtifactHash` |
| `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts` | `runArtifactStorePut` refactored: core logic extracted into `storeArtifactCore` (lock-free), wrapper retains lock acquisition for standalone use |
| `packages/os/site-kernel-handoff/AGENTS.md` | Updated with automatic artifact storage behavior in the release section |
| `releases/<releaseId>/release.yaml` | Updated with `artifact` URI and `distArtifactHash` before state transition |
| `releases/<releaseId>/dist/` | Source directory for artifact tar.gz |

### Output format

```json
{
  "command": "release.publish",
  "exitCode": 0,
  "data": {
    "releaseId": "warpgogol-com-r000003",
    "systemId": "warpgogol-com",
    "state": "published",
    "publishedAt": "2026-07-30T00:51:45.168Z",
    "artifactUri": "local://.werkstatt/artifacts/releases/sha256/53/5350baa5....manifest.json",
    "distArtifactHash": "sha256:5350baa5afbc8b956fa47c21411de84c1661f490a3f324f940105b53e49e5fa9",
    "distVerified": true
  },
  "summary": "[release.publish] release warpgogol-com-r000003 published with artifact"
}
```

The `artifactUri` and `distVerified` fields already exist in `ReleasePublishData`. `distArtifactHash` is a new field added by this RFC. The URI format is `local://<manifest-path>`, matching what `storeArtifactCore` returns.

### Failure modes

- **dist directory missing**: `release.publish` already checks this at lines 529-535 (existing code, not new). Throws before artifact storage and before state transition. The release remains `prepared`.
- **artifact storage fails**: `storeArtifactCore` throws before the state transition. The release remains `prepared`. The `artifact` and `distArtifactHash` fields in `release.yaml` remain `null`. The operator can re-run `release.publish` (all validation gates pass again, artifact storage retries, state transition follows). No partial failure state.
- **state transition fails (YAML write)**: The artifact is stored in the artifact store, but the release remains `prepared` in `release.yaml`. Re-running `release.publish` is safe: `storeArtifactCore` is idempotent (removes existing manifest, writes new one with same content), and the state transition retries. The old tar.gz archive is not removed (content-addressed) — `artifact.store.gc` handles cleanup.
- **artifact already stored**: `storeArtifactCore` is idempotent — it removes the existing manifest and writes a new one. Re-running `release.publish` is safe.
- **dist directory empty**: `storeArtifactCore` will create an empty tar.gz. This is a degenerate case — `release.prepare` should not produce an empty dist. The operator should re-run `release.prepare`.
- **Lock conflict**: `release.publish` holds `release:${releaseId}` and `system:${systemId}` locks. It calls `storeArtifactCore` (lock-free) directly, NOT `runArtifactStorePut` (which acquires `release:${releaseId}` and would deadlock). The standalone `artifact.store.put` command still acquires its own lock for manual use.

## Rollout

- **Default behavior**: active from day one. Every `release.publish` automatically stores the artifact before transitioning to `published`.
- **Existing systems**: no migration needed. Already-published releases without artifacts remain as they are — `artifact.store.put` can still be run manually for old releases.
- **New systems**: automatically compliant — `release.publish` stores the artifact in one step.
- **Pipeline integration**: no pipeline changes. The artifact storage runs inside `release.publish` itself.
- **`artifact.store.put` as standalone command**: remains available for manual use (e.g., re-storing after dist changes, testing). It is not deprecated — it becomes a fallback for edge cases.
- **`release.validate`**: should be extended to check that published releases have a non-null `artifact` field. This closes the validation gap — a published release without an artifact is invalid. This is a minor extension, not a separate RFC.

## Alternatives considered

1. **`release.publish` requires artifact in store** — `release.publish` would check `artifactStorePreflight` and refuse if the artifact is missing, directing the operator to run `artifact.store.put` first. Rejected: two-step workflow is error-prone. The operator can forget. The goal is one-step publish.

2. **`release.prepare` calls `artifact.store.put`** — store the artifact during `release.prepare` instead of `release.publish`. Rejected: `release.prepare` builds the dist, but the release is not yet published. Storing an artifact for an unpublished release is premature — the operator might abort the release after prepare. Artifact storage should happen at publish time, when the release is finalized.

3. **`leitstand.propagate` auto-creates artifact** — if the artifact is missing, `leitstand.propagate` would call `artifact.store.put` before deploying. Rejected: propagation is a deployment operation, not a release operation. Artifact storage belongs in the release lifecycle, not the deployment lifecycle. Mixing concerns makes the system harder to reason about.

## Risks

- **Performance**: `storeArtifactCore` creates a tar.gz archive of `dist/`. For a typical site (2-5 MB), this takes <1 second. Acceptable for a publish operation.
- **Disk space**: each publish creates a new tar.gz in the artifact store. `artifact.store.gc` (RFC-0363) handles cleanup. Not a concern for normal operation.
- **Orphaned artifacts**: if the state transition fails after artifact storage, the artifact is in the store but the release is `prepared`. Re-running `release.publish` creates a new artifact (same content, same hash) — the old manifest is removed by the idempotent cleanup in `storeArtifactCore`. The old tar.gz archive is not removed (content-addressed) — `artifact.store.gc` handles this.
- **Agent confusion**: agents may still run `artifact.store.put` manually before `release.publish`. This is harmless — `artifact.store.put` is idempotent. `release.publish` will overwrite the artifact with the same content.
- **No circular dependency**: `release.publish` calls `storeArtifactCore` from the same package (`site-kernel-handoff`). No cross-package dependency — both are in the same package.
- **Existing `systemId` derivation bug**: `runArtifactStorePut` derives `systemId` as `releaseId.split("-m")[0]` (line 162 of `artifact-store-commands.ts`), but release IDs use `-r` (e.g., `warpgogol-com-r000003`), not `-m`. There is no `-m` substring, so `split("-m")[0]` returns the entire release ID. This means the artifact manifest's `systemId` field currently contains the release ID instead of the system ID. This is an existing bug that becomes more visible when `release.publish` calls `storeArtifactCore` automatically. The implementation should fix this by deriving `systemId` from the release manifest (which has the correct `systemId` field) rather than parsing the release ID. This fix is in scope for this RFC since it touches the same code path.

## Acceptance criteria

- [x] `release.publish` calls `storeArtifactCore` inline BEFORE transitioning to `published` state
- [x] `storeArtifactCore` is extracted from `runArtifactStorePut` as a lock-free helper; `runArtifactStorePut` wraps it with lock acquisition for standalone use
- [x] `release.publish` does NOT call `runArtifactStorePut` directly (would deadlock on `release:${releaseId}` lock)
- [x] `release.publish` resolves dist directory from `releases/<releaseId>/dist` (existing check, not new code)
- [x] `release.yaml` is updated with `artifact` URI and `distArtifactHash` before state transition
- [x] `release.publish` `--json` output includes `artifactUri` and `distArtifactHash` fields
- [x] `leitstand.propagate` succeeds after `release.publish` without manual `artifact.store.put`
- [x] Re-running `release.publish` for a `prepared` release is safe (idempotent artifact storage + state transition)
- [x] If `storeArtifactCore` fails, the release remains `prepared` (no partial failure)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` updated with the automatic artifact storage behavior
- [x] `release.validate` checks that published releases have a non-null `artifact` field
- [x] Existing `systemId` derivation bug in `artifact-store-commands.ts` is fixed (use release manifest's `systemId`, not `releaseId.split("-m")`)
- [x] Unit tests cover: publish stores artifact before transition, publish fails on missing dist (remains prepared), artifact storage failure leaves release prepared, re-publish is idempotent, lock-free helper does not deadlock
- [x] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add a `--skip-artifact-store` flag to bypass artifact storage. Hard gate only.
- Agents MUST NOT remove the standalone `artifact.store.put` command — it remains available for manual use.
- Agents MUST store the artifact BEFORE the state transition. The release becomes `published` only after the artifact is stored and `release.yaml` is updated. This eliminates the partial failure window where a release is `published` but not deployable.
- Agents MUST NOT call `runArtifactStorePut` from inside `release.publish` — it acquires `release:${releaseId}` which is already held by `release.publish`, causing a deadlock. Call `storeArtifactCore` (lock-free) directly.
- Agents MUST fix the existing `systemId` derivation bug in `artifact-store-commands.ts` (`releaseId.split("-m")` → use release manifest's `systemId` field) as part of this RFC's implementation.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
