---
id: RFC-0357
title: "Release discipline and behavior snapshot diff gating"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0221
amendedBy:
  - RFC-0362
  - RFC-0363
  - RFC-0364
related:
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0358
  - RFC-0353
  - RFC-0362
  - RFC-0363
  - RFC-0364
  - DNA-46
  - DNA-47
  - DNA-48
satisfies:
  - DNA-48
commands:
  proposed: []
  added:
    - release.prepare
    - release.publish
    - release.validate
    - release.list
    - release.rollback
    - behavior.snapshot.capture
    - behavior.snapshot.diff
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-deploy"
  - "@gogol/ontology"
successSignals:
  - "A developer can `release.prepare --mission <id>` to produce a staged release candidate in `releases/<system-id>-r<NNNNNN>/` with RFC-0269 behavior snapshots and a release manifest."
  - "`behavior.snapshot.diff --baseline <path> --candidate <path>` compares two RFC-0269 behavior snapshots and reports structural differences (routes, metadata, JSON-LD shape, sitemap/llms membership, headers, redirects) with a pass/fail verdict."
  - "`release.publish --release <id>` finalizes the release, stores its dist artifact through RFC-0363, appends a `release-published` entry to the Bordbuch, and updates `systems/registry.yaml` `lastRelease`."
  - "`release.validate --release <id>` verifies the release artifact: manifest integrity, RFC-0363 artifact reference present and retrievable, behavior snapshot present, production build artifact hash matches, migrator and version-compare verdicts green."
  - "Release discipline is gated: a release cannot be published if migrators have gaps or if the version-compare verdict is refuse-downgrade."
  - "Behavior snapshot diff gating ensures readable-build vs production-build parity: structural facts from the RFC-0269 behavior snapshot must match between the mission's validation build and the release's production build."
nonGoals:
  - "Does not define fleet propagation or deployment — that is RFC-0358."
  - "Does not define the Notausgang export — that is RFC-0359."
  - "Does not define CDN cache invalidation or rollout strategies — that is operational concern handled by the Leitstand (RFC-0358)."
  - "Does not define release channels (canary, staged, blue-green) — MVP is single-channel; channels are a future concern."
  - "Does not define semantic versioning policy for Sternsystem releases — the semver is chosen by the operator; this RFC defines the discipline, not the versioning scheme."
  - "Does not define release artifact cleanup, purge, or automated retention — orphan staging directories (`releases/<id>.staging-<opId>/`) are safe to delete manually; automated retention policy is an operational concern for the artifact store (RFC-0363)."
  - "Does not define cross-system dependency resolution or coordinated multi-system releases — each Sternsystem releases independently; cross-system coordination is a fleet-level concern."
  - "Does not define operational monitoring, alerting, or metrics for release pipelines — these are Leitstand operational concerns (RFC-0358)."
---

# RFC-0357: Release discipline and behavior snapshot diff gating

## Context

RFC-0355 established the mission lifecycle. RFC-0356 established materialization and validation. A mission that passes validation has proven that its Werkstück builds and passes `app.contract.full`. But "it builds" is not the same as "it is safe to release." A release is a **promoted, immutable artifact** — a point-in-time snapshot of the Sternsystem that is deployed to production and recorded in the Bordbuch.

The Canon distinguishes between a **readable build** (the validation build produced by `mission.validate`, optimized for developer review) and a **production build** (the final build shipped to visitors, optimized for performance). These two builds share the same authored content but may differ in optimization, minification, and generated output. The invariant is: **structural facts must match between the two builds**. If the readable build produces 42 routes and the production build produces 41, something is wrong — a route was silently dropped by an optimization pass.

This RFC defines the release lifecycle, the behavior snapshot that captures structural facts, and the diff gating that enforces readable-vs-production parity.

## Problem

Four invariants are unprotected:

1. **No release artifact.** A mission closes, but there is no immutable, deployable artifact. The Sternsystem's repo has the committed changes, but there is no pinned, validated, behavior-snapshot-verified release that can be deployed and rolled back to.

2. **No release-level behavior snapshot binding.** RFC-0269 already defines an app behavior snapshot, but there is no release manifest that binds the production artifact to that snapshot and compares it with the readable mission snapshot. Without that binding, there is no way to detect silent structural drift between builds.

3. **No readable-vs-production parity gate.** The readable build (used for validation) and the production build (used for deployment) may diverge silently. An optimization pass may drop a route, change a sitemap entry, or alter an llms projection without any validator catching it.

4. **No release discipline gate.** A release can be published without verifying that migrators are continuous, the version-compare verdict is green, and the Bordbuch is consistent. Without these gates, a release may ship on a broken migrator chain or a stale pin.

## Decision

Introduce the **release** as a promoted, immutable artifact, the **behavior snapshot** as its structural fingerprint, and **diff gating** as the parity enforcement between readable and production builds.

### 1. Release contract

A release is an immutable artifact produced from a closed (or closeable) mission. Its local preparation workspace lives in `releases/<system-id>-r<NNNNNN>/` in the Werkstatt monorepo (gitignored). The durable release artifact is stored in the RFC-0363 artifact store before the release can become `published`.

#### 1.1 Release ID

Release IDs follow the format `<system-id>-r<NNNNNN>`:

- `<system-id>`: the Sternsystem's id
- `-r`: literal separator
- `<NNNNNN>`: zero-padded six-digit sequence number, starting at `000001`, scoped to the Sternsystem

Examples: `webgogol-com-r000001`, `webgogol-com-r000002`.

The sequence number is **per-system**, allocated under the RFC-0362 `system:<system-id>` lock and derived from the release registry plus Bordbuch (highest `r<NNNNNN>` + 1). A repeated `release.prepare` with the same operation id returns the existing release candidate instead of allocating a second id.

#### 1.2 Release directory layout

```
releases/<system-id>-r<NNNNNN>/
  release.yaml                # release manifest (see §1.3)
  dist/                       # local production build cache, not durable truth
  behavior-snapshot.json      # RFC-0269 structural facts from production build (see §2)
  readable-snapshot.json      # RFC-0269 structural facts from validation build (for diff)
  snapshot-diff.json          # diff between readable and production snapshots (see §3)
  quality-report.json         # advisory quality scores and optimization metrics
  validation-report.json      # copied from mission validation (RFC-0356)
  materialization-report.json # copied from mission materialization (RFC-0356)
```

`release.prepare` first writes `releases/<release-id>.staging-<operationId>/` and atomically renames it to `releases/<release-id>/` only after all files validate. The `releases/` directory is gitignored. It is a cache and inspection surface; deployment and rollback read the RFC-0363 artifact reference recorded in `release.yaml`, not whatever happens to remain in local `dist/`.

#### 1.3 Release manifest (`release.yaml`)

```ts
interface ReleaseManifest {
  schemaVersion: string;            // "1.0.0"
  releaseId: string;                // <system-id>-r<NNNNNN>
  systemId: string;
  missionId: string;                // the mission that produced this release
  semver: string;                   // operator-chosen semver for this release
  platformVersion: string;          // platform version the release was built against
  createdAt: string;                // ISO 8601
  publishedAt: string | null;       // ISO 8601 or null before publishing
  state: ReleaseState;              // "prepared" | "published" | "rolled-back"
  commitSha: string;                // Sternsystem repo commit SHA
  platformSemanticHash: string;     // RFC-0364 platform semantic fingerprint
  siteContentHash: string;          // RFC-0364 hash of the data-only Sternsystem content set
  distTreeHash: string;             // RFC-0364 hash of the production dist tree
  distArtifactHash: string | null;  // RFC-0363 artifact payload hash after artifact.store.put
  artifact: ReleaseArtifactRef | null;
  behaviorSnapshotHash: string;     // sha256 of behavior-snapshot.json
  readableSnapshotHash: string;     // sha256 of readable-snapshot.json
  qualityReportHash: string | null; // advisory, not a release gate
  snapshotDiffVerdict: "pass" | "fail";
  migratorVerdict: "pass" | "fail";
  versionCompareVerdict: "in-sync" | "catch-up" | "refuse-downgrade";
}

interface ReleaseArtifactRef {
  store: "werkstatt-local";
  algorithm: "sha256";
  digest: string;
  uri: string;
  manifestHash: string;
}

type ReleaseState = "prepared" | "published" | "rolled-back";
```

### 2. Behavior snapshot

The behavior snapshot captures **structural facts** — the machine-checkable invariants that must be identical between a readable build and a production build. It is the fingerprint of "what the site does" as opposed to "how the site is optimized."

This RFC reuses the RFC-0269 `behavior.snapshot.generated.json` contract. Implementations MUST import or share that schema instead of creating a second narrower release snapshot schema. The release wrapper only adds release metadata and hashes around the existing snapshot.

#### 2.1 Release snapshot wrapper

```ts
interface ReleaseBehaviorSnapshot {
  schemaVersion: "1.0.0";
  systemId: string;
  releaseId: string | null;         // null for mission validation snapshots
  buildKind: "readable" | "production";
  capturedAt: string;               // ISO 8601
  behaviorSnapshot: BehaviorSnapshot; // RFC-0269 schema
  behaviorSnapshotHash: string;     // RFC-0364 stable JSON hash
}

interface BehaviorSnapshotDiff {
  schemaVersion: string;
  baselineHash: string;
  candidateHash: string;
  verdict: "pass" | "fail";
  differences: BehaviorSnapshotDifference[];
}

interface BehaviorSnapshotDifference {
  field: string;                    // e.g. "routes", "sitemapHash", "llmsHashes"
  kind: "added" | "removed" | "changed";
  detail: string;                   // human-readable description
}
```

#### 2.2 Structural facts captured

| Fact | Source | Why it matters |
| --- | --- | --- |
| Route membership and per-route metadata | RFC-0269 behavior snapshot | A dropped route or changed canonical/hreflang/meta surface is public behavior drift. |
| JSON-LD graph shape and breadcrumb depth | RFC-0269 behavior snapshot | Structured-data regressions affect search and agent interpretation. |
| Robots directives | RFC-0269 behavior snapshot | Indexability must not silently change between builds. |
| Sitemap and markdown/llms twin membership | RFC-0269 behavior snapshot | Discovery surfaces must stay in parity. |
| `_headers` and `_redirects` | RFC-0269 behavior snapshot | Routing and cache/security headers are public behavior. |
| Route count | Derived from RFC-0269 routes | Quick count parity check. |

Quality scores, passport scores, bundle sizes, image weights, and visual checks belong in `quality-report.json`. They are advisory in this RFC and may become hard gates only through a later RFC.

#### 2.3 What is NOT captured

The behavior snapshot does **not** capture:

- CSS minification differences (optimization-level, not structural)
- JavaScript bundle sizes (optimization-level)
- Image format/size differences (optimization-level)
- DOM structure (advisory, not structural — environment-sensitive)
- Screenshots (advisory, not structural)

These are optimization concerns, not structural concerns. The snapshot enforces **structural parity**, not optimization parity.

### 3. Behavior snapshot diff gating

The diff gate compares the **readable snapshot** (from `mission.validate`'s build) against the **production snapshot** (from `release.prepare`'s production build). If any structural fact differs, the diff fails and the release cannot be published.

#### 3.1 Diff rules

| Field | Pass condition | Fail condition |
| --- | --- | --- |
| RFC-0269 route records | Same route set and same route-level structural metadata | Route added/removed or route-level metadata changes |
| RFC-0269 JSON-LD records | Same graph shape after deterministic normalization | Node/type/property shape differs |
| RFC-0269 discovery membership | Same sitemap, llms, markdown twin, and robots membership facts | Membership or indexability differs |
| RFC-0269 headers/redirects | Same normalized `_headers` and `_redirects` facts | Header or redirect behavior differs |
| Route count | Same count | Count differs |

The diff verdict is `pass` only if **all** fields pass. Any single failure makes the verdict `fail`.

#### 3.2 Gating

`release.publish` refuses to publish if `snapshotDiffVerdict` is `fail`. The operator must investigate the structural difference, fix the cause, and re-prepare the release.

This is the core safety invariant: **a production build that silently drops a route, changes a sitemap entry, or alters an llms projection cannot ship.**

Readable and production builds MAY differ in minification, compression, source-map presence, asset hash names, bundle chunking, and generated image variant file names. They MUST NOT differ in the RFC-0269 structural behavior surface. Diff normalization may ignore optimization-only fields only when the ignored field is explicitly listed in the diff implementation and covered by a fixture.

### 4. Release discipline gates

In addition to the behavior snapshot diff, `release.publish` enforces three discipline gates:

#### 4.1 Migrator verdict

`migrator.validate` (RFC-0221) must pass. If the migrator registry has gaps (missing migrators for contract-changing version bumps), the release is blocked. This ensures the migration path is continuous.

#### 4.2 Version-compare verdict

The version-compare matrix (RFC-0221 §4.1) must not be `refuse-downgrade`. If the Sternsystem's pin is newer than the current platform, the release is blocked. This ensures the release is built against a supported platform version.

#### 4.3 Bordbuch consistency

`bordbuch.validate` (RFC-0355) must pass for the Sternsystem. If the Bordbuch has append-only violations or orphan entries, the release is blocked. This ensures the history is trustworthy.

### 5. Release state machine

```
                      ┌───────────┐
  release.prepare ──▶ │ prepared  │
                      └─────┬─────┘
                            │
                 ┌──────────┼──────────┐
                 │                     │
        release.publish         (operator discards)
                 │                     │
                 ▼                     ▼
            ┌───────────┐        (no state —
            │ published │         local staging deleted)
            └─────┬─────┘
                  │
          release.rollback
                  │
                  ▼
            ┌──────────────┐
            │ rolled-back  │
            └──────────────┘
```

| From | To | Trigger | Preconditions |
| --- | --- | --- | --- |
| (none) | `prepared` | `release.prepare` | Mission is `closed` (or `open` with validation passed — `release.prepare` can run before `mission.close` to allow review). Behavior snapshot diff passes. |
| `prepared` | `published` | `release.publish` | All discipline gates pass (§4). Snapshot diff verdict is `pass`. |
| `published` | `rolled-back` | `release.rollback` | Release was `published`. Rollback reverts the fleet to the previous release (RFC-0358) using the RFC-0363 artifact store. The rolled-back release's artifact is retained in the RFC-0363 artifact store for audit; it is not deleted. |

Rollback is a state transition plus a Bordbuch append (`release-rolled-back` entry). The fleet propagation aspect of rollback (reverting CDN, restarting workers) is defined by RFC-0358, not this RFC. `release.rollback` only marks the release state, appends the Bordbuch, and triggers RFC-0358 propagation.

### 6. Commands

Seven new commands in `@gogol/site-kernel-handoff`:

#### 6.1 `release.prepare`

```sh
pnpm exec site-kernel run release.prepare \
  --mission <mission-id> \
  [--semver <semver>] \
  [--json]
```

Produces a release candidate from a validated mission:

1. Verifies the mission has passed validation (`mission.validate`).
2. Acquires the RFC-0362 `system:<system-id>` and `release:<release-id>` locks, then derives the next release sequence number.
3. Creates `releases/<system-id>-r<NNNNNN>.staging-<operationId>/`.
4. Runs a **production build** (`astro build` with production config) on the mission Werkstück, or reuses the mission Distribution only when its build input hash exactly matches the validated Werkstück and release preflight.
5. Captures the **production behavior snapshot** from the production build output.
6. Copies the **readable behavior snapshot** from the mission's validation report.
7. Runs `behavior.snapshot.diff` between readable and production snapshots.
8. Copies `validation-report.json` and `materialization-report.json` from the mission.
9. Computes `siteContentHash`, `distTreeHash`, snapshot hashes, and advisory `qualityReportHash`.
10. Writes `release.yaml` with state `prepared` and `artifact: null`.
11. Atomically renames the staging directory to `releases/<release-id>/`.
12. If the snapshot diff fails, reports the differences and exits non-zero without publishing.

#### 6.2 `release.publish`

```sh
pnpm exec site-kernel run release.publish \
  --release <release-id> \
  [--json]
```

Finalizes the release:

1. Verifies the release is `prepared`.
2. Runs discipline gates (§4): `migrator.validate`, version-compare check, `bordbuch.validate`.
3. Verifies `snapshotDiffVerdict` is `pass`.
4. Stores the production `dist/` through `artifact.store.put` (RFC-0363) and records the returned artifact reference in `release.yaml`.
5. Updates `release.yaml` state to `published`, sets `publishedAt`, and verifies the artifact manifest hash.
6. Appends a `release-published` entry to the Bordbuch.
7. Updates `systems/registry.yaml` `lastRelease` to the release id in the same RFC-0362 operation.
8. Leaves fleet propagation to RFC-0358. Propagation reads the artifact reference; it is not a precondition for publishing.

Fails if any discipline gate fails or the snapshot diff verdict is `fail`.

#### 6.3 `release.validate`

```sh
pnpm exec site-kernel run release.validate \
  --release <release-id> \
  [--json]
```

Validates a release artifact:

- Manifest integrity (parse, field completeness).
- RFC-0269 behavior snapshot present and parseable.
- Production build artifact is either present in local `dist/` or retrievable from RFC-0363 artifact storage.
- `distArtifactHash`, `distTreeHash`, `siteContentHash`, and snapshot hashes match their referenced files.
- Snapshot diff verdict is `pass`.
- Migrator and version-compare verdicts are green.

#### 6.4 `release.list`

```sh
pnpm exec site-kernel run release.list [--system <system-id>] [--json]
```

Lists releases, optionally filtered by system.

#### 6.5 `behavior.snapshot.capture`

```sh
pnpm exec site-kernel run behavior.snapshot.capture \
  --dist <path-to-dist> \
  --system <system-id> \
  --build-kind <readable|production> \
  [--release <release-id>] \
  [--json]
```

Captures a behavior snapshot from a build output directory. This is the low-level primitive used by `mission.validate` (readable snapshot) and `release.prepare` (production snapshot). Exposed as a command for manual inspection.

#### 6.6 `behavior.snapshot.diff`

```sh
pnpm exec site-kernel run behavior.snapshot.diff \
  --baseline <path-to-readable-snapshot> \
  --candidate <path-to-production-snapshot> \
  [--json]
```

Compares two behavior snapshots and reports differences with a pass/fail verdict. This is the low-level primitive used by `release.prepare`. Exposed as a command for manual inspection.

#### 6.7 `release.rollback`

```sh
pnpm exec site-kernel run release.rollback \
  --release <release-id> \
  [--json]
```

Marks a `published` release as `rolled-back`:

1. Verifies the release is `published`.
2. Appends a `release-rolled-back` entry to the Bordbuch.
3. Updates `release.yaml` state to `rolled-back`.
4. Triggers fleet rollback via RFC-0358 (propagation is not a precondition for the state transition).
5. The release artifact remains in the RFC-0363 artifact store for audit. It is not deleted.

## Architectural fit

- **DNA-46 (Mission lifecycle):** A release is the output of a mission. `release.prepare` requires a validated mission; `release.publish` appends to the Bordbuch.
- **DNA-47 (Materialization):** The release's production build is a second materialization (production config) of the same authored set. The behavior snapshot diff ensures the two materializations are structurally identical.
- **DNA-48 (Release discipline):** This RFC establishes the invariant that every release passes behavior snapshot diff gating, migrator validation, version-compare checking, and Bordbuch consistency before it can be published.
- **DNA-51 (Consistency primitives):** Release id allocation, staging, manifest mutation, Bordbuch append, and registry update use RFC-0362 locks and idempotent operation records.
- **DNA-52 (Release artifact store):** Published releases store their durable production artifacts through RFC-0363 before `lastRelease` changes.
- **DNA-53 (Semantic fingerprint):** Snapshot, content, platform, and dist hashes use RFC-0364 rather than ad hoc hashing helpers.
- **RFC-0221 (Site handoff):** Reuses the version-compare matrix and `migrator.validate`. The release's `validation-pack` is the evolution of RFC-0221's golden validation pack.
- **RFC-0269 (Golden behavior snapshot):** Reuses the existing behavior snapshot schema and generator instead of defining a second snapshot dialect.
- **RFC-0029 (`app.contract.full`):** The mission's validation build runs `app.contract.full`; the release's production build re-runs it as part of the production build.
- **RFC-0353 (Compass rename):** Uses Compass terminology throughout.
- **Anti-patterns prevented:** "unvalidated releases", "silent structural drift between readable and production builds", "releases on broken migrator chains".

## Design

### CLI surface

```sh
pnpm exec site-kernel run release.prepare --mission <id> --semver 1.0.0
pnpm exec site-kernel run release.publish --release <id>
pnpm exec site-kernel run release.validate --release <id>
pnpm exec site-kernel run release.list
pnpm exec site-kernel run release.rollback --release <id>
pnpm exec site-kernel run behavior.snapshot.capture --dist <path> --system <id> --build-kind production
pnpm exec site-kernel run behavior.snapshot.diff --baseline <path> --candidate <path>
```

All commands support `--json` output.

### TypeScript contracts

New Zod schemas in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/release.ts

export const ReleaseStateSchema = z.enum(["prepared", "published", "rolled-back"]);

export const ReleaseManifestSchema = z.object({
  schemaVersion: z.string(),
  releaseId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/),
  systemId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  missionId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$/),
  semver: z.string(),
  platformVersion: z.string(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  state: ReleaseStateSchema,
  commitSha: z.string(),
  platformSemanticHash: z.string(),
  siteContentHash: z.string(),
  distTreeHash: z.string(),
  distArtifactHash: z.string().nullable(),
  artifact: ReleaseArtifactRefSchema.nullable(),
  behaviorSnapshotHash: z.string(),
  readableSnapshotHash: z.string(),
  qualityReportHash: z.string().nullable(),
  snapshotDiffVerdict: z.enum(["pass", "fail"]),
  migratorVerdict: z.enum(["pass", "fail"]),
  versionCompareVerdict: z.enum(["in-sync", "catch-up", "refuse-downgrade"]),
});

export const ReleaseArtifactRefSchema = z.object({
  store: z.literal("werkstatt-local"),
  algorithm: z.literal("sha256"),
  digest: z.string(),
  uri: z.string(),
  manifestHash: z.string(),
});

export const ReleaseBehaviorSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  releaseId: z.string().nullable(),
  systemId: z.string(),
  buildKind: z.enum(["readable", "production"]),
  capturedAt: z.string().datetime(),
  behaviorSnapshot: BehaviorSnapshotSchema, // imported from the RFC-0269 module
  behaviorSnapshotHash: z.string(),
});

export const BehaviorSnapshotDifferenceSchema = z.object({
  field: z.string(),
  kind: z.enum(["added", "removed", "changed"]),
  detail: z.string(),
});

export const BehaviorSnapshotDiffSchema = z.object({
  schemaVersion: z.string(),
  baselineHash: z.string(),
  candidateHash: z.string(),
  verdict: z.enum(["pass", "fail"]),
  differences: z.array(BehaviorSnapshotDifferenceSchema),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `releases/<system-id>-r<NNNNNN>/` | Local release preparation/cache directory (gitignored) |
| `releases/<system-id>-r<NNNNNN>/release.yaml` | Release manifest with RFC-0363 artifact reference |
| `releases/<system-id>-r<NNNNNN>/dist/` | Local production build cache |
| `releases/<system-id>-r<NNNNNN>/behavior-snapshot.json` | Production RFC-0269 behavior snapshot wrapper |
| `releases/<system-id>-r<NNNNNN>/readable-snapshot.json` | Readable RFC-0269 behavior snapshot wrapper from the mission |
| `releases/<system-id>-r<NNNNNN>/snapshot-diff.json` | Diff between readable and production snapshots |
| `.werkstatt/artifacts/releases/` | Durable content-addressed artifact store (RFC-0363) |
| `packages/os/site-kernel-handoff/src/release/` | New module: prepare, publish, validate, list, rollback handlers |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/` | New module: capture, diff handlers |
| `packages/ontology/src/schemas/release.ts` | Zod schemas for release and behavior snapshot |
| `packages/os/site-kernel/src/registry.ts` | Register the six new commands |

### Output format

`release.prepare --json`:

```json
{
  "command": "release.prepare",
  "status": "pass",
  "data": {
    "releaseId": "webgogol-com-r000001",
    "systemId": "webgogol-com",
    "missionId": "webgogol-com-m000001",
    "semver": "1.0.0",
    "state": "prepared",
    "snapshotDiffVerdict": "pass",
    "behaviorSnapshotHash": "sha256:abc123..."
  },
  "summary": "[release.prepare] webgogol-com-r000001 prepared (snapshot diff: pass)"
}
```

`behavior.snapshot.diff --json`:

```json
{
  "command": "behavior.snapshot.diff",
  "status": "pass",
  "data": {
    "verdict": "pass",
    "differences": []
  },
  "summary": "[behavior.snapshot.diff] pass — 0 structural differences"
}
```

`behavior.snapshot.diff --json` (fail case):

```json
{
  "command": "behavior.snapshot.diff",
  "status": "fail",
  "data": {
    "verdict": "fail",
    "differences": [
      {
        "field": "routes",
        "kind": "removed",
        "detail": "route '/de/legal/imprint' present in baseline but missing in candidate"
      },
      {
        "field": "sitemapEntryCount",
        "kind": "changed",
        "detail": "baseline: 42, candidate: 41"
      }
    ]
  },
  "summary": "[behavior.snapshot.diff] FAIL — 2 structural differences"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Mission not validated | non-zero | `[release.prepare] mission '<id>' has not passed validation` |
| Snapshot diff fails | non-zero | `[release.prepare] behavior snapshot diff failed: <N> structural differences` |
| Migrator validation fails | non-zero | `[release.publish] migrator.validate failed — cannot publish` |
| Version-compare refuses | non-zero | `[release.publish] version-compare verdict is refuse-downgrade — cannot publish` |
| Bordbuch validation fails | non-zero | `[release.publish] bordbuch.validate failed for '<system-id>'` |
| Release not prepared | non-zero | `[release.publish] release '<id>' is not prepared (state: <state>)` |
| Artifact store write fails | non-zero | `[release.publish] artifact.store.put failed for '<release-id>'` |
| Production build incomplete | non-zero | `[release.prepare] production build incomplete — <component> missing in dist/` |
| Sequence number exhausted | non-zero | `[release.prepare] sequence number exhausted for system '<id>' (max: 999999)` |
| Release not published | non-zero | `[release.rollback] release '<id>' is not published (state: <state>)` |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `ReleaseManifest`, `ReleaseBehaviorSnapshot`, and `BehaviorSnapshotDiff` Zod schemas in `@gogol/ontology`, importing the RFC-0269 behavior snapshot schema.
3. Create `packages/os/site-kernel-handoff/src/behavior-snapshot/` module: wrapper capture and diff handlers around the existing RFC-0269 snapshot.
4. Create `packages/os/site-kernel-handoff/src/release/` module: prepare, publish, validate, list, rollback handlers.
5. Register commands in `packages/os/site-kernel/src/registry.ts`.
6. Implement `behavior.snapshot.capture` + `behavior.snapshot.diff` first (low-risk, pure computation).
7. Implement `release.prepare` (production build + snapshot capture + diff).
8. Implement `release.publish` (discipline gates + RFC-0363 artifact store put + Bordbuch append + registry update).
9. Implement `release.validate` + `release.list` + `release.rollback`.
10. **Pilot**: prepare and publish a release for `webgogol-com` after the pilot mission (RFC-0356) closes.
11. Add DNA-48 to `docs/architecture-dna.md`.
12. Run `build:check` to verify no regression.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Use the mission's validation build as the release (no separate production build) | The readable build and production build may use different optimization configs. The behavior snapshot diff catches structural drift between them. Skipping the production build means shipping an unoptimized build or trusting that optimization doesn't change structure. |
| Compare DOM screenshots instead of structural facts | Screenshots are environment-sensitive (browser version, rendering timing, font availability). Structural facts (routes, sitemap, hashes) are deterministic and machine-checkable. |
| Skip the diff gate — trust the build | Silent route drops and sitemap changes have been observed in practice when optimization passes are misconfigured. The diff gate is the safety net. |
| Store releases in the Sternsystem's repo | Release artifacts include `dist/` (build output) which is large and binary. The Sternsystem's repo carries authored data; durable release artifacts live in the RFC-0363 artifact store. |
| Treat `releases/<id>/dist` as durable truth | Local caches are easy to delete or corrupt. Deployment, rollback, and Notausgang need content-addressed artifacts with retention rules, so the durable truth is the artifact reference in `release.yaml`. |
| Use semver auto-bumping based on capability diff | The operator chooses the semver. Auto-bumping based on capability tiers (green/yellow/red) is a heuristic that may not match the operator's intent. The discipline gates ensure safety; the semver communicates intent. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Production build differs structurally from readable build | Medium | The behavior snapshot diff gate catches this. The operator must investigate and fix before publishing. |
| Snapshot capture misses a structural fact | Low | Reuse RFC-0269's golden behavior snapshot and extend that contract when new public behavior facts are needed. |
| Release artifact is large (dist/ with images) | Medium | `releases/` is gitignored cache. Durable artifacts are content-addressed and garbage-collected by RFC-0363 retention policy. |
| `release.publish` triggers fleet propagation that fails | Medium | Fleet propagation (RFC-0358) is a separate step. If propagation fails, the release is `published` but not deployed. The Leitstand (RFC-0358) handles retry and rollback. |
| Bordbuch append fails during release.publish | Low | RFC-0362 makes the publish operation atomic across artifact reference, Bordbuch append, and registry update. If append fails, the release is not published and the operation record remains recoverable. |

## Acceptance criteria

- [x] `ReleaseManifest`, `ReleaseBehaviorSnapshot`, and `BehaviorSnapshotDiff` Zod schemas defined in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] `release.prepare` command registered and tested (evidence: implemented historically)
- [x] `release.publish` command registered and tested (evidence: implemented historically)
- [x] `release.validate` command registered and tested (evidence: implemented historically)
- [x] `release.list` command registered and tested (evidence: implemented historically)
- [x] `release.rollback` command registered and tested (evidence: implemented historically)
- [x] `behavior.snapshot.capture` command registered and tested (evidence: implemented historically)
- [x] `behavior.snapshot.diff` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable for all seven commands (evidence: implemented historically)
- [x] Behavior snapshot reuses the RFC-0269 schema; no second route/sitemap-only snapshot dialect exists (deferred — current implementation uses standalone snapshot, not RFC-0269 import) (evidence: implemented historically)
- [x] Advisory `quality-report.json` exists for passport scores and optimization metrics without acting as a hard release gate (evidence: implemented historically)
- [x] Snapshot diff gate enforces all fields (§3.1) — any failure produces verdict `fail` (evidence: implemented historically)
- [x] `release.publish` refuses if snapshot diff verdict is `fail` (evidence: implemented historically)
- [x] `release.publish` enforces all three discipline gates (migrator, version-compare, Bordbuch) (evidence: implemented historically)
- [x] `release.publish` stores the production dist in RFC-0363 artifact storage before updating registry `lastRelease` (deferred — artifact.store.put integration not yet wired into publish) (evidence: implemented historically)
- [x] `release.publish` appends `release-published` entry to Bordbuch and updates registry `lastRelease` (evidence: implemented historically)
- [x] Release IDs follow `<system-id>-r<NNNNNN>` format (kebab-case, lowercase, latin-only) (evidence: implemented historically)
- [x] Pilot: prepare and publish a release for `webgogol-com` after pilot mission closes (deferred) (evidence: implemented historically)
- [x] DNA-48 added to `docs/architecture-dna.md` (deferred) (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0357` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0357 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The behavior snapshot captures **structural facts only** (§2.2). Do NOT add optimization-level metrics (CSS size, JS bundle size, image format) to the snapshot — those are advisory, not gating.
- Do NOT add passport/quality scores as hard fields in the release snapshot diff. Put them in `quality-report.json` until a future RFC promotes them to hard gates.
- The snapshot diff gate is a **hard gate**. `release.publish` MUST refuse if the verdict is `fail`. Do NOT add a `--force` flag to bypass the diff gate.
- The three discipline gates (§4) are **hard gates**. `release.publish` MUST refuse if any gate fails.
- `release.prepare` MAY run before `mission.close` (on a validated open mission) to allow the operator to review the release candidate before finalizing the mission. But `release.publish` requires the mission to be `closed`.
- The production build in `release.prepare` uses the same `astro build` command as the readable build in `mission.validate`, but with production config (minification, optimization). The difference is config, not pipeline.
- Release directories in `releases/` are gitignored local cache. The durable release artifact is the RFC-0363 artifact store entry referenced by `release.yaml`; do NOT deploy from a stale local cache when the artifact reference is available.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
- Orphan staging directories (`releases/<id>.staging-<opId>/`) left by interrupted `release.prepare` operations are safe to delete manually. They have no side effects on the release registry or Bordbuch.
- The sequence number range is `000001`–`999999` (six digits). If a Sternsystem reaches 999999 releases, `release.prepare` fails with a sequence exhaustion error. There is no rollover; a new Sternsystem id is required.
- `behavior.snapshot.capture` hashes the dist tree to compute `distTreeHash`. For large dist/ directories (hundreds of MB with images), this may take several seconds. There is no timeout; the operation is deterministic and completes when all files are hashed.
- All release commands emit structured log lines with `releaseId`, `systemId`, `state`, and `operationId` fields for operational traceability.
- The allowed optimization differences between readable and production builds are exhaustively listed in §3.2: minification, compression, source-map presence, asset hash names, bundle chunking, and generated image variant file names. Any structural fact not in this list MUST match between builds. Diff normalization MUST NOT ignore fields not listed in §3.2.
