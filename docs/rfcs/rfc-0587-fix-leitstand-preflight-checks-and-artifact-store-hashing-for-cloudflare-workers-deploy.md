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
enhancedAt: 2026-07-29
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

The first real-world Cloudflare Workers propagation of `warpgogol-com-r000001` revealed seven distinct bugs in the Leitstand preflight checks and artifact store. Six of these were fixed as hotfixes directly in the codebase during the deployment attempt; this RFC formalizes those fixes and adds two remaining design improvements that were not yet implemented: tar.gz archive creation in `artifact.store.put` and adapter-declared size limits via `getLimits()`.

DNA-49 (Fleet propagation) and DNA-52 (Release artifact store) define the contracts these commands enforce. The hotfixed bugs and the remaining design gaps prevented the contracts from being fully upheld:

**Already fixed as hotfixes (formalized by this RFC):**

- `findArtifactManifest` returned the first manifest found (oldest), not the latest, causing hash mismatches after re-runs.
- `checkWranglerAvailable` ran `npx wrangler` without `--yes` and without the workpiece `node_modules/.bin` in `PATH` — fixed to use `npx --yes wrangler` with PATH injection.
- `checkDistSize` applied the 25 MiB Workers script limit to the entire dist directory (330 MiB of static assets) — fixed to use 20 GiB total / 25 MiB per-file limits.
- The Cloudflare Workers adapter ran `pnpm exec wrangler` from `dist/server/` — fixed to use `npx --yes wrangler deploy` from `distPath`.
- `process.env` spread into `Record<string, string>` caused type errors — fixed via `filterEnv` helper.
- The adapter silently swallowed wrangler deploy `stdout`/`stderr` on failure — fixed to log both to `console.error`.
- `sourceDotenv` did not filter comments and empty lines — fixed to skip `#` and empty lines.

**Not yet implemented (this RFC's new work):**

- `artifact.store.put` stores `distArtifactHash` as the tree hash, not a tar.gz archive hash. No durable archive is created for restoration.
- `checkDistSize` uses hardcoded limits in `leitstand-commands.ts` instead of adapter-declared limits, making it platform-specific.

## Problem

DNA-49 requires preflight checks to verify dist size, wrangler availability, and artifact integrity before deployment. DNA-52 requires content-addressed artifact storage with hash verification. Six bugs were fixed as hotfixes during the first deployment attempt; two design gaps remain:

1. **No tar.gz archive** (`packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts:111-112`): `artifact.store.put` sets `distArtifactHash = treeHash` and stores only a JSON manifest. No durable archive is created. `artifactStoreRehydrate` (`artifact-store-commands.ts:363-380`) creates an empty directory without restoring any content. DNA-52's "durable, content-addressed records" contract is not fully upheld because there is no archive to restore from.

2. **Duplicate artifact manifests** (`artifact-store-commands.ts:307-331`): `findArtifactManifest` scans `sha256/*/*.manifest.json` and returns the first match by `releaseId`. If the dist content changes between `artifact.store.put` runs (different tree hash → different manifest directory), multiple manifests for the same release exist, and the first found (not necessarily the latest) is returned, causing preflight hash mismatches.

3. **Hardcoded dist size limits** (`leitstand-commands.ts:256-282`): `checkDistSize` hardcodes `20 * 1024 * 1024 * 1024` and `25 * 1024 * 1024` directly in the function body. Each platform (Cloudflare Workers, Netlify, Vercel) has different limits. The limits should be declared by the adapter via a `getLimits()` method and passed through `runPreflight` to `checkDistSize`.

4. **Unexported helpers** (`adapters/cloudflare-workers.ts:28,61`): `filterEnv` and `sourceDotenv` are module-private. Other adapters (netlify, vercel) would need to duplicate them. They should be exported for reuse.

**Already fixed as hotfixes (formalized, not re-implemented by this RFC):**

- `checkWranglerAvailable` now uses `npx --yes wrangler` with workpiece `node_modules/.bin` in `PATH` (`leitstand-commands.ts:218-254`).
- `checkDistSize` now uses 20 GiB total / 25 MiB per-file limits (`leitstand-commands.ts:256-282`).
- Adapter uses `npx --yes wrangler deploy` from `distPath` (`cloudflare-workers.ts:155-163`).
- `filterEnv` filters `undefined` from `process.env` (`cloudflare-workers.ts:28-36`).
- Adapter logs `stdout`/`stderr` on deploy failure (`cloudflare-workers.ts:165-168`).
- `sourceDotenv` skips comments and empty lines (`cloudflare-workers.ts:65-67`).

## Decision

The `artifact.store.put` command gains tar.gz archive creation and idempotent manifest storage. The `DeploymentAdapter` interface gains a `getLimits()` method for adapter-declared size limits, passed through `runPreflight` to `checkDistSize`. `filterEnv` and `sourceDotenv` are exported from the cloudflare-workers adapter module for reuse by future adapters. `artifactStoreRehydrate` extracts the tar.gz archive during restoration. This RFC formalizes six already-applied hotfixes (wrangler resolution, dist size limits, adapter command execution, env filtering, error logging, dotenv parsing) without re-implementing them.

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

// artifact.store.put — idempotent, creates tar.gz; retains siteContentHash
interface ArtifactStorePutData {
  releaseId: string;
  systemId: string;
  distArtifactHash: string;   // sha256 of tar.gz archive
  distTreeHash: string;       // tree hash of dist directory
  siteContentHash: string;    // sha256 of site content (unchanged from current)
  archivePath: string;        // path to tar.gz in artifact store
  byteSize: number;
  fileCount: number;
  uri: string;
  createdAt: string;
}

// filterEnv helper — filters undefined from process.env (exported)
export function filterEnv(env: Record<string, string | undefined>): Record<string, string>;

// sourceDotenv — strips comments (#) and empty lines (exported, async)
export async function sourceDotenv(filePath: string): Promise<Record<string, string>>;

// runPreflight gains adapter parameter for limit resolution
async function runPreflight(
  workspaceRoot: string,
  releaseId: string,
  dep: DeploymentConfig,
  channel: Channel,
  channelConfig: DeploymentChannel,
  adapter: DeploymentAdapter,  // new parameter
  missionId?: string,
): Promise<PreflightCheck[]>;

// checkDistSize uses adapter limits instead of hardcoded values
async function checkDistSize(
  distPath: string,
  limits: DeploymentLimits,  // new parameter
): Promise<{ withinLimit: boolean; detail: string }>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts` | `runArtifactStorePut` creates tar.gz, idempotent manifest; `findArtifactManifest` returns single manifest; `artifactStoreRehydrate` extracts tar.gz |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `runPreflight` receives adapter and passes limits to `checkDistSize`; `checkDistSize` uses adapter-declared limits |
| `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` | `DeploymentAdapter` interface gains `getLimits(): DeploymentLimits` |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` | Export `filterEnv` and `sourceDotenv`; `getLimits()` returns 20 GiB / 25 MiB |
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
- **`artifact.store.put` idempotent overwrite**: If a manifest for the same `releaseId` exists in a different hash directory, it is removed before writing the new one. The old tar.gz archive is NOT removed (content-addressed — may be referenced by other releases). The existing lock at `artifact-store-commands.ts:102-108` (scope `release:${releaseId}`) prevents concurrent puts for the same release.
- **`artifactStoreRehydrate` on missing archive**: If the tar.gz archive does not exist but the manifest is found, throws `archive not found for release <id>`. Does not silently create an empty directory.
- **`checkWranglerAvailable` failure**: Preflight check fails with `wrangler --version exited non-zero: <stderr>`. Deployment is blocked. (Already fixed as hotfix.)
- **`checkDistSize` failure**: Reports which limit was exceeded (total vs per-file) with the offending file path for per-file violations. Limits come from `adapter.getLimits()`.
- **Adapter deploy failure**: Logs full `stdout` and `stderr` to `console.error` before returning `succeeded: false`. Does not re-throw. (Already fixed as hotfix.)
- **`sourceDotenv` on missing file**: Returns empty object (unchanged). Does not throw. (Already fixed as hotfix — skips comments and empty lines.)
- **`filterEnv` with all-undefined**: Returns empty object. Does not throw. (Already fixed as hotfix.)

## Rollout

- **Default behavior**: The new tar.gz archive creation and adapter-declared limits are active immediately upon implementation. No feature flags, no grace period.
- **Existing releases**: Old manifests with tree-hash-based `distArtifactHash` remain findable by `findArtifactManifest` (which searches by `releaseId`, not by hash scheme). `artifactStorePreflight` verifies `distTreeHash` (unchanged field), so old manifests remain compatible. The next `artifact.store.put` for the same release overwrites the manifest with a tar.gz-based one and removes the old manifest. Old tar.gz archives are not created for existing releases — only new `put` runs create them.
- **New releases**: Automatically use tar.gz archive hashing and idempotent manifest storage from day one.
- **Adapter limits**: The `null` adapter declares `maxTotalSize: Infinity` and `maxFileSize: Infinity`. The `cloudflare-workers` adapter declares `maxTotalSize: 20 GiB` and `maxFileSize: 25 MiB`.
- **Pipeline integration**: No pipeline changes. `release.publish` → `artifact.store.put` → `leitstand.propagate` flow is unchanged; only the internal implementations are fixed.
- **Hotfixed bugs**: Six bugs were fixed as hotfixes during the first deployment attempt and are already in the codebase. This RFC formalizes them; no re-implementation is needed for those six.

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

### New work (this RFC implements)

- [ ] `artifact.store.put` creates a `tar.gz` archive and stores `distArtifactHash` as the archive hash (evidence: `artifact-store-commands.ts:<line>`, `artifact.store.put --json` output contains `archivePath`)
- [ ] `artifact.store.put` is idempotent: re-running for the same `releaseId` removes any existing manifest for that release before writing the new one (evidence: only one `.manifest.json` file exists for a release after multiple `put` runs with different dist content)
- [ ] `artifactStoreRehydrate` extracts the tar.gz archive to the output directory (evidence: `artifact-store-commands.ts:<line>`, files present after rehydration)
- [ ] `DeploymentAdapter` interface has `getLimits(): DeploymentLimits` method (evidence: `adapter.ts:<line>`)
- [ ] `checkDistSize` receives limits from `adapter.getLimits()` via `runPreflight` parameter pass-through (evidence: `leitstand-commands.ts:<line>`, no hardcoded limit constants in `checkDistSize`)
- [ ] `cloudflare-workers` adapter `getLimits()` returns `maxTotalSize: 20 * 1024**3`, `maxFileSize: 25 * 1024**2` (evidence: `cloudflare-workers.ts:<line>`)
- [ ] `null` adapter `getLimits()` returns `maxTotalSize: Infinity`, `maxFileSize: Infinity` (evidence: `leitstand-commands.ts:<line>`)
- [ ] `filterEnv` is exported from `cloudflare-workers.ts` (evidence: `export function filterEnv` in module)
- [ ] `sourceDotenv` is exported from `cloudflare-workers.ts` (evidence: `export async function sourceDotenv` in module)
- [ ] `ArtifactStorePutData` retains `siteContentHash` field alongside new `archivePath` (evidence: `artifact-store-commands.ts:<line>`)

### Formalized hotfixes (already in codebase, verified by this RFC)

- [ ] `checkWranglerAvailable` uses `npx --yes wrangler` with workpiece `node_modules/.bin` in `PATH` (evidence: `leitstand-commands.ts:231-232`, preflight passes when wrangler is in workpiece `node_modules`)
- [ ] `checkDistSize` uses 20 GiB total / 25 MiB per-file limits (evidence: `leitstand-commands.ts:257-258`)
- [ ] Adapter uses `npx --yes wrangler deploy` from `distPath` (evidence: `cloudflare-workers.ts:155-163`)
- [ ] Adapter logs `stdout` and `stderr` on wrangler deploy failure (evidence: `cloudflare-workers.ts:165-168`)
- [ ] `filterEnv` filters `undefined` values from `process.env` (evidence: `cloudflare-workers.ts:28-36`)
- [ ] `sourceDotenv` skips comments (`#`) and empty lines (evidence: `cloudflare-workers.ts:65-67`)

### Build and validation

- [ ] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- The tar.gz archive creation MUST use `node:tar` (or equivalent) and NOT shell out to `tar` command — the handoff package must remain cross-platform.
- The `filterEnv` helper MUST be exported from the adapter module so other adapters can reuse it.
- The `sourceDotenv` helper MUST be exported from the adapter module or moved to `@warpgogol/share` if other adapters need it.
- The existing lock at `artifact-store-commands.ts:102-108` (scope `release:${releaseId}`) already prevents concurrent `artifact.store.put` for the same release. The idempotent overwrite does not change the locking behavior — it only removes old manifests within the lock scope.
- `runPreflight` currently does not receive the adapter. The implementation must add an `adapter: DeploymentAdapter` parameter to `runPreflight` and pass it from `runLeitstandPropagate` (where the adapter is already resolved at line 364).
- `artifactStoreRehydrate` must extract the tar.gz archive to the output directory using `node:tar` or equivalent, replacing the current empty-directory creation.
- Related RFCs: RFC-0588 (behavior snapshot route collection), RFC-0589 (_redirects 410 handling).
