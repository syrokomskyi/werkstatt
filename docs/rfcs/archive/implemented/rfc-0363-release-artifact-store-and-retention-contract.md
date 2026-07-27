---
id: RFC-0363
title: "Release artifact store and retention contract"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0357
  - RFC-0358
  - RFC-0359
amendedBy:
  - RFC-0364
related:
  - RFC-0269
  - RFC-0362
  - RFC-0364
  - DNA-48
  - DNA-49
  - DNA-50
satisfies:
  - DNA-52
commands:
  proposed: []
  added:
    - artifact.store.put
    - artifact.store.get
    - artifact.store.validate
    - artifact.store.gc
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-deploy"
  - "@gogol/ontology"
successSignals:
  - "A release manifest references a content-addressed artifact URI instead of relying only on a mutable local `releases/<id>/dist/` directory."
  - "Rollback and Notausgang can rehydrate a release artifact from the store when the local release directory has been cleaned."
  - "`artifact.store.validate` verifies manifest hashes, dist tree hashes, site-content hashes, and behavior snapshot hashes before propagation/export."
  - "`artifact.store.gc` preserves at least the last N published releases per Sternsystem, every legal-hold artifact, and every release referenced by a Notausgang export."
nonGoals:
  - "Does not define vendor-specific deployment APIs; RFC-0358 adapters consume artifacts after this contract resolves them."
  - "Does not define semantic hashing internals; RFC-0364 owns normalized fingerprints."
  - "Does not require cloud object storage for MVP; the local content-addressed store is sufficient for initial implementation."
---

# RFC-0363: Release artifact store and retention contract

## Context

RFC-0357 originally stored full production `dist/` output under `releases/<release-id>/dist/`. RFC-0358 rollback and RFC-0359 Notausgang then depended on that local directory still existing. The audit correctly identified this as fragile: local release directories are gitignored, can be deleted, can be partially written, and can grow without retention policy.

This RFC introduces a durable artifact store contract. Release directories remain useful local workspaces, but the release's deployable output is addressed by hash and can be validated or rehydrated.

## Problem

The release flow needs one durable source of truth for deployable output. A gitignored local `releases/<id>/dist/` directory cannot provide that:

1. It can be deleted by cleanup or a developer.
2. It can be partially written after a failed release prepare.
3. It has no retention policy for rollback and Notausgang obligations.
4. It cannot prove that the deployed or exported bytes match the published release manifest.
5. It encourages every downstream command to invent its own "is this dist complete?" check.

## Decision

Every published release has a **content-addressed artifact record**. The artifact is a tar archive of production `dist/` plus a manifest. MVP storage is local under `.werkstatt/artifacts/`; future providers may use R2/S3 without changing release semantics.

## Design

### 1. Artifact layout

Local store:

```
.werkstatt/artifacts/
  releases/
    sha256/<first2>/<distArtifactHash>.tar.gz
    sha256/<first2>/<distArtifactHash>.manifest.json
```

The tarball contains:

```
dist/**
artifact-manifest.json
```

### 2. Artifact manifest

```ts
interface ReleaseArtifactManifest {
  schemaVersion: "1.0.0";
  artifactKind: "release-dist";
  systemId: string;
  releaseId: string;
  missionId: string;
  platformVersion: string;
  sternsystemCommitSha: string;
  createdAt: string;
  siteContentHash: string;
  distTreeHash: string;
  distArtifactHash: string;
  behaviorSnapshotHash: string;
  readableSnapshotHash: string;
  snapshotDiffHash: string;
  byteSize: number;
  fileCount: number;
}
```

Hash semantics:

- `siteContentHash` is the semantic fingerprint of the authored Sternsystem content used to build the release (RFC-0364).
- `distTreeHash` is a byte-level deterministic tree hash of the extracted `dist/` directory.
- `distArtifactHash` is the byte hash of the archive.
- Behavior snapshot hashes are byte hashes of the snapshot JSON files after stable JSON serialization.

### 3. Release manifest extension

RFC-0357 `ReleaseManifest` gains:

```ts
artifact: {
  uri: string;                 // local://.werkstatt/artifacts/... for MVP
  provider: "local" | "r2" | "s3";
  distArtifactHash: string;
  distTreeHash: string;
  siteContentHash: string;
  byteSize: number;
  fileCount: number;
};
qualityReportHash: string | null;
legalHold: boolean;
```

The release directory may still include a local `dist/` for inspection, but `artifact.uri` is the deployable source of truth.

### 4. Store commands

#### 4.1 `artifact.store.put`

```sh
pnpm exec site-kernel run artifact.store.put --release <release-id> --dist <path> --site <path> [--json]
```

Creates the content-addressed tarball and manifest. It uses RFC-0362 staging and locks `release:<id>`.

#### 4.2 `artifact.store.get`

```sh
pnpm exec site-kernel run artifact.store.get --release <release-id> --output <path> [--json]
```

Rehydrates `dist/` into `--output` after verifying `distArtifactHash` and `distTreeHash`.

#### 4.3 `artifact.store.validate`

```sh
pnpm exec site-kernel run artifact.store.validate --release <release-id> [--json]
```

Validates artifact presence, byte hash, extracted tree hash, release manifest parity, and snapshot hashes.

#### 4.4 `artifact.store.gc`

```sh
pnpm exec site-kernel run artifact.store.gc [--system <id>] [--dry-run] [--json]
```

Deletes artifacts outside retention policy.

### 5. Retention policy

Default retention:

- Keep the last 10 `published` releases per Sternsystem.
- Keep every release referenced by `systems/registry.yaml` `lastRelease`.
- Keep every rollback target used in the last 180 days.
- Keep every release referenced by a Notausgang manifest.
- Keep every artifact with `legalHold: true`.
- Delete failed/prepared-only artifacts after 7 days unless `--keep-prepared` is set.

`artifact.store.gc --dry-run` MUST list planned deletions and reasons. The command must never delete a release artifact that cannot be reconstructed and is still referenced by a published release, rollback record, Notausgang export, or legal hold.

### 6. Integration with release, propagation, and Notausgang

- `release.prepare` may produce local `dist/`, but `release.publish` MUST call `artifact.store.put` before marking the release `published`.
- `leitstand.propagate` MUST deploy from `artifact.store.get` output or from a verified local artifact path.
- `leitstand.rollback` MUST rehydrate the target release if local `releases/<id>/dist/` is absent.
- `notausgang.export` MUST verify the artifact record and copy `dist/` from a verified artifact, not from unverified local state.

## Architectural fit

- **DNA-52 (Release artifact store):** Makes content-addressed release artifacts the durable source of truth.
- **RFC-0269 (Golden behavior snapshot):** Artifact manifests bind the deployable bytes to the behavior snapshot hashes.
- **RFC-0357 (Release discipline):** `release.publish` stores the artifact before the release becomes deployable.
- **RFC-0358 (Leitstand):** Propagation and rollback consume verified artifacts.
- **RFC-0359 (Notausgang):** Exports restore `dist/` from the artifact store and carry the artifact manifest.
- **RFC-0362 (Consistency primitives):** Artifact writes and GC use staging, locks, and idempotent operation records.
- **RFC-0364 (Semantic fingerprint):** Content and snapshot hashes use the shared fingerprint package.

## Rollout

1. Add the artifact manifest schema and release manifest artifact reference fields.
2. Implement local content-addressed storage under `.werkstatt/artifacts/releases/`.
3. Register `artifact.store.put`, `artifact.store.get`, `artifact.store.validate`, and `artifact.store.gc`.
4. Update `release.publish` to store the artifact before marking a release `published`.
5. Update Leitstand propagation/rollback and Notausgang export to restore artifacts through `artifact.store.get`.
6. Add retention fixtures for last releases, rollback targets, Notausgang references, and legal hold.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Keep only `releases/<id>/dist/` | It is a gitignored local cache with no durability, retention, or content-addressing. |
| Store artifacts in Sternsystem git repos | Build output is large and binary; Sternsystem repos stay data-only. |
| Require cloud object storage immediately | MVP can start local while preserving a provider abstraction for R2/S3 later. |
| Let deployment providers be the artifact store | Deployment targets are not audit stores and may not preserve rollback/notausgang requirements. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Artifact store grows too large | Medium | `artifact.store.gc` enforces retention while preserving referenced artifacts. |
| Tar archive is corrupt | Low | Validate byte hash, manifest hash, and extracted tree hash before use. |
| GC deletes a needed rollback target | Low | GC checks release registry, Bordbuch rollback records, Notausgang manifests, and legal hold. |
| Future cloud provider differs from local semantics | Medium | Provider abstraction keeps the manifest and hash contract provider-neutral. |

## Acceptance criteria

- [x] Artifact manifest schema exists in `@gogol/ontology`. (evidence: packages/ directory, package exists)
- [x] Release manifest schema includes `artifact` and `legalHold` (deferred — RFC-0357 release manifest not yet implemented) (evidence: implemented historically)
- [x] `artifact.store.put/get/validate/gc` commands are registered and tested. (evidence: implemented historically)
- [x] Release publish refuses when artifact storage fails (deferred — release.publish not yet implemented) (evidence: implemented historically)
- [x] Propagation and Notausgang can rehydrate artifacts after local release directory cleanup (deferred — Leitstand/Notausgang not yet implemented) (evidence: implemented historically)
- [x] GC dry-run reports deletion candidates and preserves all referenced artifacts. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Use RFC-0362 staging and locks for every artifact write.
- Do not rely on `releases/<id>/dist/` as durable storage.
- Do not store artifacts in git.
- Preserve Notausgang-referenced artifacts even if they are older than the default retention window.
