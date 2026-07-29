---
id: RFC-0587
title: "Fix Leitstand preflight checks and artifact store hashing for Cloudflare Workers deploy"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-29
updatedAt: 2026-07-29
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-49
  - DNA-52
  - RFC-0358
  - RFC-0379
  - RFC-0388
  - RFC-0566
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
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
    - artifact.store.put
    - leitstand.propagate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals:
  - "Behavior snapshot route collection (covered by RFC-0588)"
  - "_redirects 410 handling (covered by RFC-0589)"
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

# RFC-0587: Fix Leitstand preflight checks and artifact store hashing for Cloudflare Workers deploy

## Context

The first real-world Cloudflare Workers propagation of `warpgogol-com-r000001` revealed seven distinct bugs in the Leitstand preflight checks and artifact store. Each bug independently blocked the deployment pipeline and required manual intervention. DNA-49 (Fleet propagation) and DNA-52 (Release artifact store) define the contracts these commands enforce, but the implementation contained errors that prevented the contracts from being upheld:

- `artifact.store.put` called `fs.readFile(distDir)` on a directory, causing `EISDIR`.
- `findArtifactManifest` returned the first manifest found (oldest), not the latest, causing hash mismatches after re-runs.
- `checkWranglerAvailable` ran `npx wrangler` without `--yes` and without the workpiece `node_modules/.bin` in `PATH`, failing to resolve wrangler.
- `checkDistSize` applied the 25 MiB Workers script limit to the entire dist directory (330 MiB of static assets), using the wrong limit type.
- The Cloudflare Workers adapter ran `pnpm exec wrangler` from `dist/server/` which has no `package.json`.
- `process.env` spread into a `Record<string, string>` caused type errors when `undefined` values were present.
- The adapter silently swallowed wrangler deploy `stdout`/`stderr` on failure, making debugging impossible.

## Problem

DNA-49 requires preflight checks to verify dist size, wrangler availability, and artifact integrity before deployment. DNA-52 requires content-addressed artifact storage with hash verification. The current implementation fails to uphold these invariants:

1. **`artifact.store.put` EISDIR** (`packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts:111`): `fs.readFile(distDir)` on a directory crashes. The workaround uses `treeHash` as `distArtifactHash`, but the original design intended a `tar.gz` archive hash.

2. **Duplicate artifact manifests** (`artifact-store-commands.ts:307`): `findArtifactManifest` scans `sha256/*/*.manifest.json` and returns the first match by `releaseId`. Multiple `artifact.store.put` runs create multiple manifests, and the first (oldest) is returned, causing preflight hash mismatches.

3. **Wrangler resolution failure** (`leitstand-commands.ts:218`): `checkWranglerAvailable` ran `npx wrangler` without `--yes` and without the workpiece `node_modules/.bin` in `PATH`. The adapter ran `pnpm exec wrangler` from `dist/server/` which has no `package.json`.

4. **Wrong dist size limit** (`leitstand-commands.ts:228`): `checkDistSize` used `25 * 1024 * 1024` (25 MiB Workers script limit) instead of the 20 GiB static assets limit. A 330 MiB dist directory falsely failed preflight.

5. **Silent deploy failures** (`adapters/cloudflare-workers.ts:165`): The adapter caught wrangler deploy errors but did not log `stdout`/`stderr`, making it impossible to diagnose deployment failures.

6. **`process.env` type error** (`adapters/cloudflare-workers.ts:139`): Spreading `process.env` into `Record<string, string>` fails when `undefined` values are present.

7. **Secrets file parsing** (`adapters/cloudflare-workers.ts:139`): The `sourceDotenv` helper did not filter comments (`#`) and empty lines, polluting environment variables passed to wrangler.

## Decision

The `artifact.store.put`, `leitstand.propagate`, and the `cloudflare-workers` adapter gain correctness fixes: `artifact.store.put` creates a `tar.gz` archive and is idempotent per release; `findArtifactManifest` returns the single manifest for a release; `checkWranglerAvailable` uses `npx --yes wrangler` with workpiece `node_modules/.bin` in `PATH`; `checkDistSize` uses adapter-declared size limits; the adapter logs `stdout`/`stderr` on deploy failure; `process.env` is filtered for `undefined` values; and `sourceDotenv` strips comments and empty lines.

## Architectural fit

- **DNA-49 (Fleet propagation)**: The preflight checks (wrangler availability, dist size, artifact hash) are the enforcement mechanism for DNA-49's propagation gate. This RFC fixes the implementation so the gate works as specified.
- **DNA-52 (Release artifact store)**: `artifact.store.put` is the primary command for DNA-52. The idempotent-put fix and tar.gz archive hash ensure the artifact store has exactly one content-addressed artifact per release, with a durable archive for restoration.
- **RFC-0358**: Established the Leitstand. This RFC fixes bugs in its preflight implementation.
- **RFC-0379**: Implemented the cloudflare-workers adapter with health verification. This RFC fixes the adapter's deploy execution path.
- **RFC-0388**: Unified env-file standard. The `sourceDotenv` fix aligns with this RFC's env-file parsing contract.
- **RFC-0566**: Immutable platform deploy with atomic rollback. The tar.gz archive hash supports the content-addressed artifact requirement.

## Design

### CLI surface

No new commands. Changed commands:

```sh
# Idempotent: overwrites existing manifest for the same release
pnpm exec site-kernel run artifact.store.put --release <id> --dist <path>

# Preflight now uses adapter-declared limits and resolves wrangler from workpiece
pnpm exec site-kernel run leitstand.propagate --release <id> --channel alt
pnpm exec site-kernel run leitstand.propagate --release <id> --channel main
```

### TypeScript contracts

```ts
// Adapter-declared size limits (added to DeploymentAdapter interface)
interface DeploymentLimits {
  maxTotalSize: number;  // bytes; Cloudflare Workers: 20 GiB
  maxFileSize: number;   // bytes; Cloudflare Workers: 25 MiB
}

// Extended DeploymentAdapter interface
interface DeploymentAdapter {
  // ... existing methods ...
  getLimits(): DeploymentLimits;
}

// PropagateInput — already has nodeModulesBinPath, no change needed
interface PropagateInput {
  systemId: string;
  releaseId: string;
  channel: "alt" | "main";
  distPath: string;
  workerName: string;
  url: string;
  secretsFilePath: string | undefined;
  expectedBehaviorSnapshotHash: string;
  nodeModulesBinPath?: string;
}

// artifact.store.put — idempotent, creates tar.gz
interface ArtifactStorePutData {
  releaseId: string;
  systemId: string;
  distArtifactHash: string;   // sha256 of tar.gz archive
  distTreeHash: string;       // tree hash of dist directory
  archivePath: string;        // path to tar.gz in artifact store
  byteSize: number;
  fileCount: number;
  uri: string;
  createdAt: string;
}

// filterEnv helper — filters undefined from process.env
function filterEnv(env: Record<string, string | undefined>): Record<string, string>;

// sourceDotenv — strips comments (#) and empty lines
function sourceDotenv(filePath: string): Record<string, string>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts` | `runArtifactStorePut` creates tar.gz, idempotent manifest; `findArtifactManifest` returns single manifest |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `checkWranglerAvailable` uses npx --yes with PATH; `checkDistSize` uses adapter limits |
| `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` | `DeploymentAdapter` interface gains `getLimits()` |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` | `filterEnv`, `sourceDotenv` fix, error logging |
| `.werkstatt/artifacts/releases/sha256/<prefix>/<hash>.tar.gz` | tar.gz archive written by `artifact.store.put` |
| `.werkstatt/artifacts/releases/sha256/<prefix>/<hash>.manifest.json` | Single manifest per release (idempotent) |

### Output format

`artifact.store.put --json` output gains `archivePath`:

```json
{
  "command": "artifact.store.put",
  "status": "ok",
  "data": {
    "releaseId": "warpgogol-com-r000001",
    "distArtifactHash": "sha256:<tar.gz-hash>",
    "distTreeHash": "sha256:<tree-hash>",
    "archivePath": ".werkstatt/artifacts/releases/sha256/ab/sha256:abc....tar.gz",
    "byteSize": 33554432,
    "fileCount": 154,
    "uri": "sha256:abc..."
  }
}
```

`leitstand.propagate --json` preflight checks now include adapter-specific limits:

```json
{
  "name": "dist-size",
  "passed": true,
  "detail": "Dist size 330.00 MiB within 20 GiB total limit; largest file 5.00 MiB within 25 MiB per-file limit"
}
```

### Failure modes

- **`artifact.store.put` on missing dist**: Throws `dist directory not found` (unchanged).
- **`artifact.store.put` idempotent overwrite**: If a manifest for the same `releaseId` exists, it is removed before writing the new one. The old tar.gz archive is NOT removed (content-addressed — may be referenced by other releases).
- **`checkWranglerAvailable` failure**: Preflight check fails with `wrangler --version exited non-zero: <stderr>`. Deployment is blocked.
- **`checkDistSize` failure**: Reports which limit was exceeded (total vs per-file) with the offending file path for per-file violations.
- **Adapter deploy failure**: Logs full `stdout` and `stderr` to `console.error` before returning `succeeded: false`. Does not re-throw.
- **`sourceDotenv` on missing file**: Returns empty object (unchanged). Does not throw.
- **`filterEnv` with all-undefined**: Returns empty object. Does not throw.

## Rollout

- **Default behavior**: All fixes are active immediately upon implementation. No feature flags, no grace period — the current behavior is broken and blocks deployment.
- **Existing releases**: Releases already in the artifact store with tree-hash manifests remain valid. The next `artifact.store.put` for the same release overwrites the manifest with a tar.gz-based one.
- **New releases**: Automatically use tar.gz archive hashing and idempotent manifest storage from day one.
- **Adapter limits**: The `null` adapter declares `maxTotalSize: Infinity` and `maxFileSize: Infinity`. The `cloudflare-workers` adapter declares `maxTotalSize: 20 GiB` and `maxFileSize: 25 MiB`.
- **Pipeline integration**: No pipeline changes. `release.publish` → `artifact.store.put` → `leitstand.propagate` flow is unchanged; only the internal implementations are fixed.

## Alternatives considered

1. **Tree hash only (no tar.gz)**: Rejected — tar.gz archive provides a single-file artifact that can be restored without the original directory structure. Tree hash alone requires re-hashing the entire directory for verification.

2. **Latest-by-createdAt manifest lookup**: Rejected — leaves duplicate manifests in the store, requiring garbage collection. Idempotent put is cleaner: one manifest per release, no duplicates.

3. **Generic dist size limits with override**: Rejected — adapter-declared limits are more accurate. Each platform (Cloudflare Workers, Netlify, Vercel) has different limits, and hardcoding them in `leitstand-commands.ts` creates a maintenance burden.

4. **Direct wrangler binary from `node_modules/.bin`**: Rejected — requires wrangler in workpiece dependencies, which may not be present. `npx --yes wrangler` is universal and works from any directory.

5. **Structured logger instead of `console.error`**: Rejected — the adapter runs in a CLI context where `console.error` is the appropriate output channel. A structured logger would add complexity without benefit for this use case.

## Risks

- **tar.gz archive disk space**: Each `artifact.store.put` creates a tar.gz archive. For large dist directories (330 MiB), this doubles storage. Mitigation: `artifact.store.gc` already handles retention by age.
- **Idempotent put data loss**: If two agents run `artifact.store.put` for the same release concurrently, the second overwrites the first's manifest. Mitigation: `werkstatt.lock` (DNA-51) should be acquired before `artifact.store.put`.
- **Adapter limits maintenance**: When Cloudflare changes Workers limits, the adapter must be updated. Mitigation: limits are declared in one place (`cloudflare-workers.ts` `getLimits()`).
- **Agent misinterpretation**: Agents may think `artifact.store.put` is not idempotent and avoid re-running it. Mitigation: AGENTS.md update and command `--help` text should state idempotency explicitly.
- **npx network access**: `npx --yes wrangler` may attempt to download wrangler if not cached. Mitigation: preflight check runs `npx --yes wrangler --version` which is fast if wrangler is already cached.

## Acceptance criteria

- [ ] `artifact.store.put` creates a `tar.gz` archive and stores `distArtifactHash` as the archive hash (evidence: `artifact-store-commands.ts:<line>`, `artifact.store.put --json` output contains `archivePath`)
- [ ] `artifact.store.put` is idempotent: re-running for the same `releaseId` overwrites the existing manifest, not creates a duplicate (evidence: only one `.manifest.json` file exists for a release after multiple `put` runs)
- [ ] `findArtifactManifest` returns the single manifest for a release (evidence: `artifact-store-commands.ts:<line>`, no duplicate manifests in `.werkstatt/artifacts/releases/`)
- [ ] `checkWranglerAvailable` uses `npx --yes wrangler` with workpiece `node_modules/.bin` in `PATH` (evidence: `leitstand-commands.ts:<line>`, preflight passes when wrangler is in workpiece `node_modules`)
- [ ] `checkDistSize` uses adapter-declared limits via `adapter.getLimits()` (evidence: `leitstand-commands.ts:<line>`, `cloudflare-workers.ts:<line>` declares `maxTotalSize: 20 GiB`, `maxFileSize: 25 MiB`)
- [ ] Adapter logs `stdout` and `stderr` on wrangler deploy failure (evidence: `cloudflare-workers.ts:<line>`, `console.error` call in failure path)
- [ ] `filterEnv` helper filters `undefined` values from `process.env` (evidence: `cloudflare-workers.ts:<line>`)
- [ ] `sourceDotenv` strips comments (`#`) and empty lines (evidence: `cloudflare-workers.ts:<line>`)
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The tar.gz archive creation MUST use `node:tar` (or equivalent) and NOT shell out to `tar` command — the adapter must remain cross-platform per AGENTS.md exception for `@warpgogol/forge`.
- The `filterEnv` helper MUST be exported from the adapter module so other adapters can reuse it.
- The `sourceDotenv` helper MUST be exported from the adapter module or moved to `@warpgogol/share` if other adapters need it.
- Related RFCs: RFC-0588 (behavior snapshot route collection), RFC-0589 (_redirects 410 handling).
