---
id: RFC-0566
title: "Immutable Platform Deploy with Atomic Rollback: Content-addressed artifacts and symlink-swap deployment across workshops"
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
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0358
amendedBy: []
related:
  - DNA-44
  - DNA-48
  - DNA-49
  - DNA-52
  - RFC-0357
  - RFC-0358
  - RFC-0562
  - RFC-0563
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
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
  added:
    - deploy.artifact.build
    - deploy.artifact.verify
    - deploy.atomic.swap
    - deploy.atomic.rollback
    - deploy.artifact.gc
    - deploy.status
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel-handoff
  - packages/os/site-kernel-integrity
successSignals:
  - "A workshop can build an immutable deploy artifact from platform code + site content and verify its content hash."
  - "An atomic symlink swap deploys a new artifact with zero downtime — the old artifact remains accessible until the swap completes."
  - "A failed deployment is rolled back atomically — the symlink swaps back to the previous artifact with no partial state."
  - "A multi-workshop deployment uses two-phase commit — either all workshops swap or none do, with automatic rollback on any failure."
nonGoals:
  - "Do not implement SWIM membership or failure detection — that is RFC-0564 (Layer 2)."
  - "Do not implement DHT-based site lookups — that is RFC-0565 (Layer 3)."
  - "Do not implement git-mesh platform code replication — that is RFC-0563 (Layer 1)."
  - "Do not replace the existing Leitstand (DNA-49) — this RFC adds a complementary symlink-swap deployment path for local deployments. The Leitstand continues to manage Cloudflare Workers deployments via adapter plugins."
  - "Do not implement blue-green deployments — this RFC uses symlink swap, which is simpler and sufficient. Blue-green may be revisited for zero-downtime database migrations."
  - "Do not implement canary deployments — this RFC deploys to all workshops atomically. Canary deployments are a future extension."
  - "Do not implement custom artifact formats — this RFC uses directory-based artifacts with content-addressed hashes (SHA-256), consistent with the existing artifact store (DNA-52)."
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

# RFC-0566: Immutable Platform Deploy with Atomic Rollback: Content-addressed artifacts and symlink-swap deployment across workshops

## Context

DNA-49 (Fleet propagation / Leitstand, RFC-0358) established the Leitstand as the fleet operation component that deploys published releases to Sternsystem deployment targets. DNA-48 (Release discipline, RFC-0357) established releases as immutable artifacts with behavior snapshots. DNA-52 (Release artifact store, RFC-0363) established content-addressed release artifacts.

Currently, the Leitstand deploys to Cloudflare Workers via adapter plugins. Deployments are per-site, not per-workshop. There is no atomic rollback — the Leitstand's `leitstand.rollback` redeploys a previous artifact, but this is a redeployment, not an instant swap.

RFC-0562 (P2P topology) defined Layer 5 as "Immutable Platform Deploy with Atomic Rollback": immutable release artifacts with atomic symlink-swap deployment, control-plane/data-plane separation, and two-phase commit across workshops. This RFC specifies how that layer works.

## Problem

1. **No atomic rollback.** The current Leitstand `leitstand.rollback` redeploys a previous artifact. This is not instant — it goes through the full deployment pipeline. A rollback takes the same time as a deployment, leaving the site in a broken state during the rollback.

2. **No control-plane/data-plane separation.** Currently, platform code and site content are deployed together. A platform code change requires redeploying all sites. At scale, this is expensive and risky. Control-plane (platform code) and data-plane (site content) should be separated, allowing independent deployment.

3. **No multi-workshop atomic deploy.** The current Leitstand deploys to one deployment target at a time. At scale, a deployment that spans multiple workshops must be atomic — either all workshops update or none do. A partial deployment leaves some workshops on the new version and others on the old version, causing inconsistency.

4. **No immutable artifacts for platform code.** DNA-52 established content-addressed release artifacts for site content. Platform code is deployed as a git SHA, not as an immutable artifact. An immutable platform artifact would allow instant rollback to any previous platform version.

## Decision

Platform deployment uses **immutable content-addressed artifacts** with **atomic symlink-swap** deployment. Platform code and site content are built into separate artifacts. Each artifact is a directory with a `dist/` subtree and a `manifest.json`, identified by a SHA-256 content hash. Deployment is an atomic symlink swap — `current` symlink points to the new artifact directory. Rollback is an atomic symlink swap back to the previous artifact. Multi-workshop deployments use a **two-phase commit**: prepare (all workshops build and verify artifacts) → commit (all workshops swap symlinks). If any workshop fails to prepare, the deployment is aborted. If any workshop fails to commit, all workshops roll back.

The symlink-swap mechanism is an **additional** deployment path for local (workshop-internal) deployments. Cloudflare Workers deployments continue via the existing Leitstand adapter plugin (`leitstand.propagate`, DNA-49). The two paths coexist: `deploy.*` commands manage local symlink-swap deployments; `leitstand.*` commands manage remote Cloudflare Workers deployments. DNA-49's rollback semantics ("redeploys a previous published artifact") remain accurate for the Cloudflare Workers path. The symlink-swap path adds instant local rollback without redeployment.

## Architectural fit

- **DNA-48 (Release discipline):** Releases are immutable artifacts. This RFC extends immutability to platform code artifacts, not just site content artifacts.
- **DNA-49 (Fleet propagation / Leitstand):** This RFC adds a local symlink-swap deployment path alongside the existing Leitstand. The existing `leitstand.propagate` and `leitstand.rollback` commands continue to manage Cloudflare Workers deployments via adapter plugins. The new `deploy.*` commands manage local symlink-swap deployments. DNA-49's rollback semantics ("redeploys a previous published artifact from the release store") remain accurate for the Cloudflare Workers path. The symlink-swap path does not change DNA-49 — it adds a complementary mechanism for local deployments.
- **DNA-52 (Release artifact store):** Platform code artifacts are stored in the same artifact store as release artifacts, using the same content-addressed format.
- **RFC-0562 (P2P topology):** This RFC implements Layer 5 of the five-layer architecture. It uses platform code from Layer 1 (git-mesh, RFC-0563) and site content from Layer 4 (Sternsystem repos, DNA-44).
- **RFC-0563 (Git-Mesh):** `deploy.artifact.build` uses the platform code from the local git clone. `gitmesh.verify` ensures the code is signed before building the artifact.
- **Scaling:** Artifact builds are O(1) per workshop. Symlink swaps are O(1) — instant. Multi-workshop two-phase commit is O(N) in the number of workshops, but each workshop acts in parallel. At hundred-workshop scale, the prepare phase takes ~30 seconds (parallel builds) and the commit phase takes <1 second (parallel symlink swaps).

## Design

### Control-plane / data-plane separation

```
.werkstatt/artifacts/
  platform/
    <sha-256>/          # immutable platform artifact
      dist/             # built platform code
      manifest.json     # artifact manifest (hash, build time, git SHA, Ed25519 signature)
  current -> .werkstatt/artifacts/platform/<sha-256>/  # atomic symlink
```

Platform artifacts are stored under `.werkstatt/artifacts/platform/`, consistent with the existing release artifact store at `.werkstatt/artifacts/releases/` (DNA-52). The `current` symlink points to the active platform artifact. Swapping the symlink is an atomic operation (`rename(2)` on POSIX). The old artifact remains on disk for instant rollback.

Site content artifacts (Sternsystem releases) remain in the existing `.werkstatt/artifacts/releases/` store (DNA-52). This RFC does not change the site artifact path.

### CLI surface

```sh
# Build an immutable platform artifact from the local git clone
pnpm exec site-kernel run deploy.artifact.build --json

# Verify an artifact's content hash
pnpm exec site-kernel run deploy.artifact.verify --hash <sha-256> --json

# Atomic symlink swap to deploy a new artifact
pnpm exec site-kernel run deploy.atomic.swap --hash <sha-256> --json

# Atomic rollback to the previous artifact
pnpm exec site-kernel run deploy.atomic.rollback --json

# Check deployment status
pnpm exec site-kernel run deploy.status --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/deploy/types.ts

export interface PlatformArtifact {
  hash: string;              // SHA-256 content hash
  gitSha: string;            // platform code git SHA
  builtAt: string;           // ISO-8601
  buildHost: string;         // workshop that built the artifact
  manifest: ArtifactManifest;
}

export interface ArtifactManifest {
  hash: string;
  files: ArtifactFile[];
  totalSize: number;         // bytes
  builtAt: string;
  gitSha: string;
  signature: string;         // Ed25519 signature by the building workshop
}

export interface ArtifactFile {
  path: string;              // relative path within artifact
  hash: string;              // SHA-256 file hash
  size: number;              // bytes
}

export interface DeployStatus {
  currentHash: string;       // current platform artifact hash
  previousHash: string | null; // previous artifact hash (for rollback)
  currentGitSha: string;     // current platform code git SHA
  deployedAt: string;        // ISO-8601
  workshops: WorkshopDeployStatus[]; // multi-workshop status
}

export interface WorkshopDeployStatus {
  workshopId: string;
  endpoint: string;
  currentHash: string;
  status: "prepared" | "committed" | "rolled-back" | "failed";
  lastDeployAt: string;
}

export interface AtomicSwapResult {
  swapped: boolean;
  previousHash: string;
  newHash: string;
  swapTimeMs: number;        // symlink swap duration
}

export interface TwoPhaseCommitResult {
  phase: "prepare" | "commit" | "abort";
  workshops: WorkshopDeployStatus[];
  committed: boolean;
  rolledBack: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/deploy/` | New directory in the existing handoff package, alongside `leitstand/` and `artifact-store/`. `artifact.ts`, `swap.ts`, `rollback.ts`, `two-phase.ts`, `types.ts` modules. |
| `.werkstatt/artifacts/platform/<sha-256>/` | Immutable platform artifact directory. Created by `deploy.artifact.build`. Never modified after creation. |
| `.werkstatt/artifacts/platform/current` | Symlink to the active platform artifact. Swapped atomically by `deploy.atomic.swap`. |
| `.werkstatt/artifacts/releases/` | Existing site artifact store (DNA-52). Not changed by this RFC. |

### Output format

```json
{
  "command": "deploy.atomic.swap",
  "status": "ok",
  "data": {
    "swapped": true,
    "previousHash": "abc123...",
    "newHash": "def456...",
    "swapTimeMs": 2
  },
  "summary": "deploy.atomic.swap: swapped to def456 in 2ms"
}
```

### Failure modes

| Condition | Behavior | Exit code |
| --- | --- | --- |
| Artifact build fails | `deploy.artifact.build` fails with build error. No artifact is created. No symlink swap occurs. | 1 |
| Artifact hash mismatch | `deploy.artifact.verify` fails with `hash-mismatch` error code. The artifact is corrupted. `deploy.atomic.swap` refuses to swap to a corrupted artifact (exit 1, error code `hash-mismatch`). | 1 |
| Symlink swap fails (filesystem error) | `deploy.atomic.swap` fails with `swap-failed` error code. The `current` symlink still points to the previous artifact. No partial state. | 1 |
| First deployment (no `current` symlink) | `deploy.atomic.swap` creates the `current` symlink (no previous artifact to roll back to). `deploy.atomic.rollback` fails with `no-previous-artifact` error code. | 0 (swap) / 1 (rollback) |
| Workshop fails during prepare phase | Two-phase commit aborts. All workshops that prepared roll back their prepare state. No symlink swaps occur. `deploy.atomic.swap` exits with `prepare-aborted` error code. | 1 |
| Workshop fails during commit phase | Two-phase commit rolls back. All workshops that committed swap back to the previous artifact. Workshops that haven't committed yet do not commit. `deploy.atomic.swap` exits with `commit-rolled-back` error code. | 1 |
| Workshop goes offline during commit | SWIM (RFC-0564) marks the workshop as dead. The commit phase continues for alive workshops. The dead workshop will swap on restart when it catches up via git-mesh. | 0 (alive) / 1 (dead workshop) |
| Disk full during artifact build | `deploy.artifact.build` fails with `disk-full` error code. Old artifacts are not affected. Operator must free disk space. | 1 |

## Rollout

- **Phase 1 (single workshop, no atomic swap):** The existing Werkstatt deploys via the Leitstand to Cloudflare Workers. No immutable platform artifacts. No symlink swap. This is the current state.
- **Phase 2 (immutable artifacts):** `deploy.artifact.build` creates immutable platform artifacts. `deploy.artifact.verify` verifies content hashes. The Leitstand continues to deploy to Cloudflare Workers, but artifacts are stored in the artifact store for future use. Existing Sternsystems are not affected — they continue to deploy via `leitstand.propagate`. Immutable artifacts are opt-in: a workshop operator runs `deploy.artifact.build` explicitly.
- **Phase 3 (atomic symlink swap):** `deploy.atomic.swap` deploys by swapping the `current` symlink. `deploy.atomic.rollback` rolls back by swapping back. The Leitstand is extended to use symlink swap for local deployments. Cloudflare Workers deployments continue via the adapter plugin. Existing Sternsystems that deploy to Cloudflare Workers are not affected. New local deployments use symlink swap.
- **Phase 4 (multi-workshop two-phase commit):** Multi-workshop deployments use two-phase commit. All workshops prepare in parallel. All workshops commit in parallel. Any failure triggers rollback across all workshops. This phase is future work beyond the pilot (RFC-0562, Phase 3–4).

## Alternatives considered

1. **Blue-green deployments.** Run two identical environments (blue and green) and switch traffic between them. Rejected: blue-green requires double the infrastructure. Symlink swap achieves the same result with a single environment and zero downtime.
2. **Canary deployments.** Deploy to a subset of workshops first, then gradually roll out. Rejected: canary adds complexity. The pilot uses trusted workshops where atomic deploy is sufficient. Canary may be revisited for large-scale rollouts.
3. **Container-based deployment.** Use Docker containers with orchestration (Kubernetes). Rejected: containers add operational overhead. Symlink swap is simpler and works on any POSIX system without container infrastructure.
4. **In-place deployment (overwrite current).** Overwrite the current deployment directory. Rejected: in-place deployment is not atomic. A failure during overwrite leaves the deployment in a broken state. Symlink swap is atomic.
5. **Database-backed deployment state.** Track deployment state in a database. Rejected: a database is a single point of failure. The symlink filesystem is the deployment state — `current` points to the active artifact, `previous` points to the rollback target.

## Risks

- **Disk space.** Immutable artifacts accumulate on disk. Each artifact is a full build (~200–500 MiB). Mitigation: artifact retention policy (default: keep last 5 artifacts). `deploy.artifact.gc` removes old artifacts not referenced by any symlink.
- **Symlink swap on non-POSIX systems.** Atomic `rename(2)` is POSIX-only. On Windows, symlink semantics differ. Mitigation: workshops run on Linux (Ubuntu), as established in AGENTS.md. The artifact store is POSIX-only.
- **Two-phase commit blocking.** If a workshop is slow to prepare, the entire deployment waits. Mitigation: prepare timeout (default 60 seconds). Workshops that don't prepare within the timeout are excluded from the commit phase.
- **Partial commit failure.** If a workshop fails to commit (swap symlink) after other workshops have committed, the network is in an inconsistent state. Mitigation: the commit phase retries failed workshops. If a workshop is dead (SWIM), it will swap on restart.
- **Artifact integrity.** A corrupted artifact could be deployed if the hash is not verified. Mitigation: `deploy.atomic.swap` verifies the artifact hash before swapping. `deploy.artifact.verify` can be run independently.
- **Agent misinterpretation.** LLM agents may attempt to manually edit artifacts or symlinks. Mitigation: artifacts are immutable (never modified after creation). Symlinks are managed by `deploy.atomic.swap` only. Manual edits break the immutability guarantee.

## Acceptance criteria

- [x] `PlatformArtifact`, `ArtifactManifest`, `ArtifactFile`, `DeployStatus`, `AtomicSwapResult` types defined in `packages/os/site-kernel-handoff/src/deploy/types.ts` (evidence: `packages/os/site-kernel-handoff/src/deploy/types.ts:1-90`)
- [x] `WorkshopDeployStatus`, `TwoPhaseCommitResult` types defined in `packages/os/site-kernel-handoff/src/deploy/types.ts` (Phase 4 only — may be deferred to a follow-up RFC) (evidence: `packages/os/site-kernel-handoff/src/deploy/types.ts:60-90` — types defined as stubs, Phase 4 logic deferred)
- [x] `deploy.artifact.build` command builds an immutable platform artifact from the local git clone and stores it in `.werkstatt/artifacts/platform/<sha-256>/` (evidence: `packages/os/site-kernel-handoff/src/deploy/artifact-build.ts`)
- [x] `deploy.artifact.verify` command verifies an artifact's content hash against its `manifest.json` (evidence: `packages/os/site-kernel-handoff/src/deploy/artifact-verify.ts`)
- [x] `deploy.atomic.swap` command performs an atomic symlink swap using `rename(2)` and verifies the artifact hash before swapping (evidence: `packages/os/site-kernel-handoff/src/deploy/atomic-swap.ts` + `atomicSymlinkSwap` in `deploy-utils.ts`)
- [x] `deploy.atomic.rollback` command rolls back to the previous artifact by swapping the `current` symlink back (evidence: `packages/os/site-kernel-handoff/src/deploy/atomic-rollback.ts`)
- [x] `deploy.artifact.gc` command removes old artifacts not referenced by any symlink, with `--dry-run` support (evidence: `packages/os/site-kernel-handoff/src/deploy/artifact-gc.ts`)
- [x] `deploy.status` command reports current and previous artifact hashes, deployment time, and git SHA (evidence: `packages/os/site-kernel-handoff/src/deploy/deploy-status.ts`)
- [x] Artifacts are stored in `.werkstatt/artifacts/platform/<sha-256>/` with a `manifest.json` containing file list, hashes, git SHA, and Ed25519 signature (evidence: `writeManifest` in `deploy-utils.ts`, `ArtifactManifest` in `types.ts`)
- [x] `current` symlink is swapped atomically using `rename(2)` — a unit test verifies that a concurrent reader never sees a partial state (evidence: `atomicSymlinkSwap` in `deploy-utils.ts` uses `symlinkSync` + `rename`, test in `deploy.test.ts`)
- [x] First deployment (no `current` symlink) creates the symlink; `deploy.atomic.rollback` fails with `no-previous-artifact` error code (evidence: test 'deploy.atomic.swap: first deploy' and 'deploy.atomic.rollback: fails with no-previous-artifact' in `deploy.test.ts`)
- [ ] Two-phase commit (Phase 4): a unit test simulates prepare failure → abort, and commit failure → rollback, verifying no partial state remains (Phase 4 deferred — types defined as stubs)
- [x] Artifacts are never modified after creation (immutability) — a test verifies that modifying an artifact directory causes `deploy.artifact.verify` to fail (evidence: test 'immutability: modifying an artifact directory causes verify to fail' in `deploy.test.ts`)
- [x] Artifact manifest is signed with Ed25519 using `@warpgogol/site-kernel-integrity` signing utilities (evidence: `signJsonPayload` in `artifact-build.ts`, exported from `site-kernel-integrity/src/signing.ts`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate` — no RFC-0566-specific errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT modify artifacts after creation — artifacts are immutable. Any change creates a new artifact with a new hash.
- Agents MUST NOT manually edit the `current` symlink — use `deploy.atomic.swap` only.
- `deploy.atomic.swap` MUST verify the artifact hash before swapping. A hash mismatch aborts the swap with exit code 1 and error code `hash-mismatch`.
- `deploy.atomic.rollback` MUST swap to the `previous` symlink target, not rebuild from source. If no previous artifact exists, it fails with `no-previous-artifact` error code.
- The two-phase commit MUST timeout if a workshop doesn't prepare within the configured timeout (default 60 seconds).
- The two-phase commit MUST roll back all workshops if any workshop fails to commit.
- Artifacts MUST be stored in `.werkstatt/artifacts/platform/<sha-256>/` with a `manifest.json` containing the file list, hashes, git SHA, and Ed25519 signature.
- The artifact `manifest.json` MUST be signed with Ed25519 using the signing utilities from `@warpgogol/site-kernel-integrity` (`signLatestBuildArtifacts`, `verifyManifestSignature`). The signing key is managed by the workshop operator via the existing integrity key management flow.
- `deploy.artifact.build` builds the platform by running `pnpm build` for all `packages/*` and copying the resulting `dist/` trees into the artifact directory. Build cost is O(total package count) — approximately 60–120 seconds on the current monorepo. Disk space per artifact is approximately 200–500 MiB (all package `dist/` trees).
- `deploy.artifact.gc` MUST retain at least the last 5 artifacts by default and MUST NOT delete artifacts referenced by the `current` or `previous` symlinks.
