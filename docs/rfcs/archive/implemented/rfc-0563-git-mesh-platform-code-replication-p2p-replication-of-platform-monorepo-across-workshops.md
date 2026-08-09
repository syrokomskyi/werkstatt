---
id: RFC-0563
title: "Git-Mesh Platform Code Replication: P2P replication of platform monorepo across workshops"
status: implemented
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
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-44
  - RFC-0478
  - RFC-0560
  - RFC-0562
  - RFC-0564
  - RFC-0566
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
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
    - gitmesh.sync
    - gitmesh.status
    - gitmesh.verify
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel
successSignals:
  - "A workshop can clone the platform monorepo from a peer workshop and verify that all commit signatures are valid."
  - "A workshop with a corrupted local clone can re-sync from peers and restore to a verified state."
  - "Two workshops that diverge (one pulls a new commit, the other hasn't yet) converge automatically when the lagging workshop syncs."
nonGoals:
  - "Do not implement SWIM membership or failure detection — that is RFC-0564 (Layer 2)."
  - "Do not implement DHT-based site lookups — that is RFC-0565 (Layer 3)."
  - "Do not implement multi-workshop atomic deploy — that is RFC-0566 (Layer 5)."
  - "Do not replicate Sternsystem repos (site content) — that is Layer 4, already handled by git remotes via DNA-44."
  - "Do not implement a custom git protocol — this RFC uses standard git push/pull/fetch over SSH or HTTPS."
  - "Do not implement automatic conflict resolution for platform code — platform code conflicts are resolved by human review and merge, not by automated CRDT merge."
  - "Do not implement peer discovery in this RFC — Phase 2 peer discovery depends on RFC-0564 (SWIM), which is currently draft. Phase 1 (single remote) does not depend on RFC-0564 and can be implemented independently."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0563: Git-Mesh Platform Code Replication: P2P replication of platform monorepo across workshops

## Context

DNA-1 (Monorepo boundary) established the platform monorepo as the single unit of platform code. RFC-0478 (Platform versioning enforcement) established that the platform version is a git SHA recorded in `system.pin.json`. Currently, there is one monorepo and one clone — the operator's local workspace.

RFC-0562 (P2P topology) defined Layer 1 as "Git-Mesh Platform Code Replication": P2P replication of the platform monorepo across workshops. Each workshop has a full clone of the monorepo. This RFC specifies how that replication works.

The grilling session (2026-07-27) established that platform code replication uses standard git protocols (push/pull/fetch) between workshops, with commit signatures (RFC-0560) providing integrity verification. No custom protocol is needed — git is already the replication protocol.

## Problem

1. **Single clone is a single point of failure.** The platform monorepo exists in one git remote (GitHub). If GitHub is unavailable, or the remote is lost, no workshop can get platform code. At million-site scale, the platform code must be available from multiple sources.

2. **No peer-to-peer replication.** Currently, all clones pull from the same remote. Workshops cannot replicate platform code directly from each other. If a workshop is behind a firewall that blocks GitHub, it cannot get platform code updates.

3. **No integrity verification on replication.** `git fetch` verifies commit hashes, but does not verify commit signatures. A workshop that pulls from a compromised remote may receive commits with valid hashes but invalid signatures. RFC-0560 added Ed25519 commit signatures, but there is no command that verifies all signatures in a clone.

4. **No sync status visibility.** There is no command to check whether a workshop's local clone is up-to-date with the network. The operator has no visibility into replication lag.

## Decision

Platform code replication uses **standard git protocols** (push/pull/fetch) between workshops. Each workshop maintains a full clone of the platform monorepo with multiple git remotes: the canonical remote (e.g., GitHub) and peer workshop remotes. The `gitmesh.sync` command fetches from all configured remotes and converges on the latest signed commit. The `gitmesh.verify` command verifies all commit signatures in the local clone against the operator's public key from `werkstatt.identity.json`.

## Architectural fit

- **DNA-1 (Monorepo boundary):** The monorepo remains the unit of platform code. Git-mesh replicates it; it does not fragment it. Each workshop has a full clone, not a subset.
- **RFC-0478 (Platform versioning):** The platform version is a git SHA. Git-mesh replicates git SHAs. The pin file (`system.pin.json`) records which SHA a Sternsystem is pinned to. Git-mesh ensures that SHA is available in the local clone.
- **RFC-0560 (Signed commits):** Commit signatures provide integrity verification. `gitmesh.verify` checks all signatures in the clone. A workshop that receives unsigned or badly signed commits can detect and reject them.
- **RFC-0562 (P2P topology):** This RFC implements Layer 1 of the five-layer architecture. It depends on Layer 2 (SWIM, RFC-0564) for peer discovery — `gitmesh.sync` needs to know which peer workshops to fetch from.
- **RFC-0566 (Immutable deploy):** Layer 5 uses the platform code from the local clone to build immutable deploy artifacts. Git-mesh ensures the clone is up-to-date and verified.
- **Scaling:** Platform code replication is O(1) per workshop — each workshop has one clone. Replication traffic is proportional to commit frequency, not to the number of sites. At million-site scale, platform code replication is negligible overhead.

## Design

### CLI surface

```sh
# Sync platform code from all configured remotes
pnpm exec werkstatt run gitmesh.sync --json

# Check sync status (am I up-to-date?)
pnpm exec werkstatt run gitmesh.status --json

# Verify all commit signatures in the local clone
pnpm exec werkstatt run gitmesh.verify --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/gitmesh/types.ts

export interface GitMeshConfig {
  remotes: GitMeshRemote[];
  trackedBranch: string;    // branch to sync (default: "main")
  syncIntervalMs: number;   // auto-sync interval (0 = manual only)
  verifySignatures: boolean; // verify commit signatures on sync
}

export interface GitMeshRemote {
  name: string;             // e.g., "origin", "peer-workshop-1"
  url: string;              // git URL (SSH or HTTPS)
  trusted: boolean;         // trusted peer for signature verification
}

export interface GitMeshSyncResult {
  synced: boolean;
  fromRemote: string;       // which remote had the latest commits
  commitsReceived: number;
  currentSha: string;       // HEAD after sync
  signaturesVerified: number;
  signaturesFailed: number;
}

export interface GitMeshStatus {
  localSha: string;
  remoteSha: string;        // latest known remote SHA
  behind: number;           // commits behind remote
  ahead: number;            // commits ahead of remote (local-only)
  lastSync: string;         // ISO-8601
  remotes: GitMeshRemote[];
}

export interface GitMeshVerifyResult {
  totalCommits: number;
  signedCommits: number;
  unsignedCommits: number;
  invalidSignatures: number;
  verified: boolean;        // true if all signed commits have valid signatures
}
```

### Convergence algorithm

`gitmesh.sync` fetches the configured `trackedBranch` (default: `main`) from all remotes in `werkstatt.gitmesh.json`. Among all remote-tracking branches (e.g., `refs/remotes/peer-1/main`, `refs/remotes/origin/main`), the commit with the **highest committer timestamp** is selected as the latest. If multiple remotes have the same latest commit, the first reachable remote (in config order) is reported in `fromRemote`. HEAD is advanced via `git merge --ff-only` to the latest commit — this ensures the local branch only moves forward, never diverges.

If `verifySignatures` is `true` and the latest commit has an invalid or missing signature, HEAD is **not** advanced. The command reports the signature failure and leaves the local clone at its current HEAD. The operator decides whether to trust the commit (by setting `verifySignatures: false` and re-running) or to wait for a corrected commit from the canonical remote.

If the remote tip is **not** a descendant of the local HEAD (non-fast-forward, indicating a force-push on the canonical remote), `gitmesh.sync` does **not** auto-reset. It reports `non-fast-forward` and warns the operator. The operator must explicitly reset (`git reset --hard <remote-tip>`) after verifying the force-push is legitimate.

### gitmesh.status semantics

`gitmesh.status` is a **local-only query** based on remote-tracking branches updated by the last `gitmesh.sync`. It does not perform network I/O — no `git ls-remote`, no fetch. The `remoteSha` field reflects the latest known remote state from the last successful sync. For real-time remote state, the operator runs `gitmesh.sync` first, then `gitmesh.status`.

This makes `gitmesh.status` safe to run frequently (e.g., in a health check loop) without network overhead.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/gitmesh/` | New directory. `sync.ts`, `status.ts`, `verify.ts`, `types.ts` modules. |
| `werkstatt.gitmesh.json` | Git-mesh configuration file. Lists remotes (canonical + peers), tracked branch, sync interval, verify flag. In Phase 1, auto-created by `gitmesh.sync` from existing `.git/config` remotes if the file does not exist. In Phase 2+, created by `werkstatt.network.bootstrap` (RFC-0562), edited by operator. |
| `werkstatt.identity.json` | Operator identity file (from RFC-0558). Contains the operator's public key used by `gitmesh.verify` for signature verification. Independent of `werkstatt.gitmesh.json` — the two files do not reference each other. |
| `.git/config` | Git remotes are added/updated by `gitmesh.sync` based on `werkstatt.gitmesh.json`. |
| `.git/gitmesh.lock` | Lock file acquired by `gitmesh.sync` to prevent concurrent execution. Released on command exit. |
| `packages/os/site-kernel/AGENTS.md` | Updated with a `gitmesh/` section documenting the new subsystem, similar to existing `src/cache/` and `src/change-impact.ts` documentation. |

### Output format

```json
{
  "command": "gitmesh.sync",
  "status": "ok",
  "data": {
    "synced": true,
    "fromRemote": "peer-workshop-2",
    "commitsReceived": 3,
    "currentSha": "abc123def456...",
    "signaturesVerified": 3,
    "signaturesFailed": 0
  },
  "summary": "gitmesh.sync: received 3 commits from peer-workshop-2, all signatures verified"
}
```

### Failure modes

All commands exit 0 on success and 1 on error. Warnings are logged to stderr but do not affect the exit code unless the command cannot complete its primary operation.

| Condition | Behavior | Exit code |
| --- | --- | --- |
| No remotes configured | `gitmesh.sync` fails with `no-remotes` error. | 1 |
| All remotes unreachable | `gitmesh.sync` fails with `all-remotes-unreachable` error. Local clone remains at current HEAD. | 1 |
| Some remotes unreachable | `gitmesh.sync` syncs from reachable remotes. Unreachable remotes are logged as warnings. Exit 0 if at least one remote synced. | 0 |
| Signature verification fails (verifySignatures: false) | `gitmesh.sync` logs the invalid commit but does not abort the sync. `gitmesh.verify` reports the invalid signature. The operator decides whether to trust the commit. | 0 |
| Signature verification fails (verifySignatures: true) | `gitmesh.sync` does not advance HEAD. Reports the invalid signature. Local clone remains at current HEAD. | 1 |
| Non-fast-forward (force-push detected) | `gitmesh.sync` does not auto-reset. Reports `non-fast-forward` and warns the operator. | 1 |
| Divergent branches (local commits not on any remote) | `gitmesh.sync` reports `ahead: N` in status. Local commits are not lost. Operator must push or merge. | 0 |
| Clone corruption (missing objects) | `gitmesh.sync` detects corruption via `git fsck` and re-clones from a trusted remote. | 1 |
| Concurrent `gitmesh.sync` invocation | Second invocation fails with `sync-in-progress` error. The lock file `.git/gitmesh.lock` prevents concurrent execution. | 1 |
| Interrupted fetch (crash mid-fetch) | Partial fetch results remain in the object store but HEAD is not advanced. The next `gitmesh.sync` completes the fetch and advances HEAD. `git fsck` is run before each sync to detect corruption. | 1 (if detected) |
| Uncommitted local changes | `gitmesh.sync` refuses to advance HEAD. Warns the operator to commit or stash local changes first. | 1 |

## Rollout

- **Phase 1 (single remote):** The existing Werkstatt operates with one remote (GitHub). If `werkstatt.gitmesh.json` does not exist, `gitmesh.sync` auto-creates it from the existing `.git/config` remotes (all existing remotes are added with `trusted: true`). `gitmesh.sync` is equivalent to `git pull`. `gitmesh.verify` is a new capability — verifying commit signatures. Phase 1 does **not** depend on RFC-0564 (SWIM) — there are no peers to discover.
- **Phase 2 (peer remotes):** When a second workshop joins (RFC-0562 Phase 2), `werkstatt.gitmesh.json` is configured with peer remotes. `gitmesh.sync` fetches from all remotes and converges on the latest signed commit.
- **Phase 3 (auto-sync):** `syncIntervalMs` is set to a non-zero value. `gitmesh.sync` runs automatically on a timer. Workshops stay in sync without manual intervention.
- **Phase 4 (signature enforcement):** `verifySignatures` is set to `true`. `gitmesh.sync` refuses to advance HEAD to a commit with an invalid signature. This is a hard enforcement mode for Byzantine resistance.

## Alternatives considered

1. **Custom replication protocol.** Build a custom P2P protocol for platform code replication. Rejected: git already provides replication (push/pull/fetch), content addressing (SHA), and signature verification (GPG/trailer). A custom protocol would duplicate these capabilities and add maintenance burden.
2. **Git bundle transfer.** Use `git bundle` to transfer commits as files over HTTP. Rejected: bundles are a point-in-time snapshot, not a live replication channel. Standard git remotes provide incremental fetch and are simpler to operate.
3. **IPFS for platform code.** Store the monorepo in IPFS and replicate via IPFS pins. Rejected: IPFS adds a new dependency and operational burden. Git remotes are already understood by all developers and operators.
4. **Read-only mirrors only.** Configure workshops as read-only mirrors of the canonical remote, never syncing from peers. Rejected: if the canonical remote is unavailable, read-only mirrors cannot update. Peer-to-peer sync provides resilience when the canonical remote is down.

## Risks

- **Replication lag.** A workshop may lag behind the latest platform code. Missions materialized on a lagging workshop use an older platform version. Mitigation: `gitmesh.status` makes lag visible. `mission.materialize` can check `gitmesh.status` and warn if the workshop is behind.
- **Signature verification cost.** Verifying all commit signatures in a large repository is expensive. Mitigation: `gitmesh.verify` verifies incrementally — only new commits since the last verification. The first full verification is expensive but subsequent runs are cheap.
- **Signature verification false positives.** Key rotation (RFC-0558 future `rotateKey`) may cause commits signed with old keys to appear as invalid. Estimated false-positive rate: <0.1% (only during the key rotation window). Mitigation: `gitmesh.verify` accepts a list of valid public keys (current + previous until expiry). The operator configures the accepted key list in `werkstatt.identity.json`.
- **Trusted remote compromise.** If a trusted remote is compromised, `gitmesh.sync` may pull malicious commits with valid signatures (if the attacker has the private key). Mitigation: key rotation (RFC-0558 future `rotateKey`) invalidates compromised keys. The operator can remove the compromised remote from `werkstatt.gitmesh.json`.
- **Git object safety.** `git fetch` from untrusted remotes carries a risk of crafted packfiles exploiting git vulnerabilities (e.g., CVE-2024-32002-style path traversal). Mitigation: only fetch from remotes listed in `werkstatt.gitmesh.json` (configured by operator). Future: sandboxed git operations (e.g., `git fetch` in a container with restricted filesystem access).
- **Merge conflicts.** If two workshops push different commits to the same branch, a merge conflict occurs. Mitigation: platform code changes go through the canonical remote (GitHub PR flow). Peer-to-peer sync is for pull-only replication, not for parallel push. Only the canonical remote accepts pushes.
- **Agent misinterpretation.** LLM agents may attempt to push platform code changes directly to peer remotes. Mitigation: `gitmesh.sync` is pull-only. Platform code changes go through the standard PR flow on the canonical remote.

## Acceptance criteria

- [x] `GitMeshConfig`, `GitMeshRemote`, `GitMeshSyncResult`, `GitMeshStatus`, `GitMeshVerifyResult` types defined in `packages/os/site-kernel/src/gitmesh/types.ts` (evidence: packages/os/site-kernel/src/gitmesh/types.ts:14-57, pnpm --filter @warpgogol/site-kernel build:check passes)
- [x] `gitmesh.sync` command fetches from all configured remotes and converges on latest signed commit (evidence: packages/os/site-kernel/src/gitmesh/sync.ts:76-92, convergence algorithm selects highest committer timestamp)
- [x] `gitmesh.status` command reports local SHA, remote SHA, behind/ahead counts, and last sync time (evidence: packages/os/site-kernel/src/gitmesh/status.ts:52-77, no network I/O — local-only query)
- [x] `gitmesh.verify` command verifies all commit signatures against operator public key (evidence: packages/os/site-kernel/src/gitmesh/verify.ts:38-54, loads public keys from werkstatt.identity.json)
- [x] `werkstatt.gitmesh.json` config file schema defined and validated (evidence: packages/os/site-kernel/src/gitmesh/config.ts:28-66, validateConfig() enforces all fields, tests in src/tests/gitmesh.test.ts)
- [x] `gitmesh.sync` is pull-only — never pushes to remotes (evidence: packages/os/site-kernel/src/gitmesh/sync.ts uses only gitFetch and gitMergeFfOnly from git-ops.ts, no push function exists in git-ops.ts)
- [x] `gitmesh.verify` reports unsigned commits, invalid signatures, and total verified (evidence: packages/os/site-kernel/src/gitmesh/verify.ts:107-119, counts signed/unsigned/invalid separately, does not abort on first invalid)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec werkstatt run rfc.validate RFC-0563 --json → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT implement push operations in `gitmesh.sync` — it is pull-only. Platform code changes go through the canonical remote PR flow.
- Agents MUST NOT auto-advance HEAD to commits with invalid signatures when `verifySignatures` is `true`.
- `gitmesh.verify` MUST NOT abort on the first invalid signature — it reports all invalid signatures in one pass.
- The `werkstatt.gitmesh.json` config file MUST NOT contain secrets (no SSH keys, no tokens). Git remotes use SSH agent or HTTPS credential helper.
- `gitmesh.verify` requires both `werkstatt.gitmesh.json` (for sync config) and `werkstatt.identity.json` (for the operator's public key) to be present. The two files are independent — `werkstatt.gitmesh.json` does not reference `werkstatt.identity.json`.
- `packages/os/site-kernel/AGENTS.md` MUST be updated with a `gitmesh/` section documenting the new subsystem.
- `docs/technology.xml` and `docs/development-plan.xml` SHOULD be updated to reflect the new git-mesh subsystem as part of the P2P topology (RFC-0562 Layer 1).
