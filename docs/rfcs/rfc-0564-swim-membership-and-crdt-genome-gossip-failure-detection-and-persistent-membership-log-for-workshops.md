---
id: RFC-0564
title: "SWIM Membership and CRDT Genome: Gossip failure detection and persistent membership log for workshops"
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
createdAt: 2026-07-27
updatedAt: 2026-07-27
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - RFC-0558
  - RFC-0562
  - RFC-0563
  - RFC-0565
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
  proposed:
    - swim.join
    - swim.leave
    - swim.members
    - swim.status
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel
successSignals:
  - "A new workshop can join the network by gossiping with a seed node and converging on the membership view within one SWIM round."
  - "A workshop that crashes is detected as dead by other workshops within the SWIM protocol timeout (default 15 seconds)."
  - "A workshop that recovers after being marked dead rejoins the network and its membership entry is restored from the CRDT genome log."
  - "Two workshops that disagree on membership (network partition) converge to the same membership view after the partition heals."
nonGoals:
  - "Do not implement DHT-based site lookups — that is RFC-0565 (Layer 3)."
  - "Do not implement git-mesh platform code replication — that is RFC-0563 (Layer 1)."
  - "Do not implement Byzantine fault tolerance — the pilot uses trusted workshops. SWIM provides failure detection, not Byzantine detection."
  - "Do not implement proof-of-stake or Sybil resistance — the pilot uses permissioned membership (seed node invitation)."
  - "Do not implement custom gossip protocols — this RFC uses the standard SWIM protocol with Lifeguard extensions."
  - "Do not encrypt gossip traffic — SWIM messages contain only membership metadata (workshop id, endpoint, status). No secrets in gossip messages."
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

# RFC-0564: SWIM Membership and CRDT Genome: Gossip failure detection and persistent membership log for workshops

## Context

RFC-0562 (P2P topology) defined Layer 2 as "SWIM Membership and CRDT Genome": SWIM/gossip protocol for failure detection and membership management, with a persistent CRDT genome log recording membership history. This RFC specifies how that layer works.

Currently, the Werkstatt has no membership concept — there is one operator and one workshop. At million-site scale with hundreds of workshops, the network needs to know which workshops are alive, which are dead, and which have joined or left. This is the membership problem.

The grilling session (2026-07-27) established that the SWIM protocol (Scalable Weakly-consistent Infection-style Process Group Membership) is the standard solution for P2P membership. A CRDT (Conflict-free Replicated Data Type) genome log provides persistent membership history that survives workshop restarts and network partitions.

## Problem

1. **No membership awareness.** The current Werkstatt has no concept of workshop membership. There is one workshop. At scale, the network needs to know which workshops exist, which are alive, and which are dead.

2. **No failure detection.** If a workshop crashes, other workshops have no way to know. The DHT (RFC-0565) and git-mesh (RFC-0563) would try to contact a dead workshop and time out, adding latency. A failure detection layer is needed to proactively mark workshops as dead.

3. **No persistent membership history.** If a workshop restarts, it loses its membership view. It needs to re-converge from scratch. A persistent CRDT genome log records membership history, allowing a restarting workshop to restore its membership view from the log.

4. **No join/leave protocol.** There is no protocol for a new workshop to join the network or for a workshop to leave gracefully. Without this, the network cannot grow or shrink.

## Decision

The Werkstatt P2P network uses the **SWIM protocol** (with Lifeguard extensions) for failure detection and membership management. Each workshop runs a SWIM member that gossips with peers on a configurable interval (default 5 seconds). A persistent **CRDT genome log** (`werkstatt.genome.log`) records membership events (join, leave, suspect, dead, alive) as an append-only, merge-free log. New workshops join via `swim.join` with a seed node address. Workshops leave gracefully via `swim.leave`.

## Architectural fit

- **DNA-1 (Monorepo boundary):** SWIM membership is per-workshop, not per-site. The monorepo boundary is unaffected. Each workshop is one SWIM member.
- **RFC-0558 (Identity Model):** Workshop identity is a VC subject id. SWIM membership entries reference the workshop operator's VC subject id, not a free-form name.
- **RFC-0562 (P2P topology):** This RFC implements Layer 2 of the five-layer architecture. It provides the membership view that Layer 1 (git-mesh, RFC-0563) and Layer 3 (DHT, RFC-0565) use to discover peers.
- **RFC-0563 (Git-Mesh):** `gitmesh.sync` uses the SWIM membership view to find peer workshop addresses for git remotes.
- **RFC-0565 (DHT):** The DHT uses the SWIM membership view to find DHT nodes for routing.
- **Scaling:** SWIM is O(N) per workshop per round — each workshop gossips with a constant number of peers per round. At hundred-workshop scale, SWIM gossip is negligible overhead. At thousand-workshop scale, SWIM's indirect ping and suspicion mechanism keep false positives low.

## Design

### CLI surface

```sh
# Join the P2P network via a seed node
pnpm exec site-kernel run swim.join --seed 10.0.0.2:7946 --json

# Leave the network gracefully
pnpm exec site-kernel run swim.leave --json

# List current membership view
pnpm exec site-kernel run swim.members --json

# Check SWIM status (am I alive? how many peers?)
pnpm exec site-kernel run swim.status --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/swim/types.ts

export interface SwimMember {
  workshopId: string;       // UUID
  endpoint: string;         // host:port for SWIM gossip
  operatorVC: string;       // VC subject id of the workshop operator
  status: SwimMemberStatus;
  joinedAt: string;         // ISO-8601
  lastSeen: string;         // ISO-8601
}

export type SwimMemberStatus = "alive" | "suspect" | "dead" | "left";

export interface SwimConfig {
  bindAddr: string;         // e.g., "0.0.0.0:7946"
  seedNodes: string[];      // seed node endpoints for bootstrap
  probeIntervalMs: number;  // default 5000
  probeTimeoutMs: number;   // default 500
  suspicionTimeoutMs: number; // default 15000
  indirectChecks: number;   // default 3
}

export interface SwimMembershipView {
  members: SwimMember[];
  total: number;
  alive: number;
  suspect: number;
  dead: number;
}

// CRDT genome log entry
export interface GenomeLogEntry {
  workshopId: string;
  event: SwimMemberStatus;  // join=alive, leave=left, etc.
  timestamp: string;        // ISO-8601
  source: string;           // workshop that observed the event
  signature: string;        // Ed25519 signature by the source workshop
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/swim/` | New directory. `member.ts`, `gossip.ts`, `genome-log.ts`, `types.ts` modules. |
| `werkstatt.swim.json` | SWIM configuration file. Bind address, seed nodes, probe intervals. Created by `werkstatt.network.bootstrap` (RFC-0562). |
| `werkstatt.genome.log` | CRDT genome log. Append-only NDJSON file with `GenomeLogEntry` records. Survives workshop restarts. |

### Output format

```json
{
  "command": "swim.members",
  "status": "ok",
  "data": {
    "members": [
      { "workshopId": "ws-001", "endpoint": "10.0.0.1:7946", "operatorVC": "did:web:workshop1.com#operator-v1", "status": "alive", "joinedAt": "2026-07-27T10:00:00Z", "lastSeen": "2026-07-27T12:00:00Z" },
      { "workshopId": "ws-002", "endpoint": "10.0.0.2:7946", "operatorVC": "did:web:workshop2.com#operator-v1", "status": "alive", "joinedAt": "2026-07-27T10:05:00Z", "lastSeen": "2026-07-27T12:00:05Z" }
    ],
    "total": 2,
    "alive": 2,
    "suspect": 0,
    "dead": 0
  },
  "summary": "swim.members: 2 members, all alive"
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| Workshop crashes | Other workshops detect via SWIM probe timeout → suspect → dead (after suspicion timeout). DHT routes around dead workshop. Git-mesh skips dead workshop remotes. |
| Workshop restarts | Reads `werkstatt.genome.log` to restore membership view. Re-joins via `swim.join` with a seed node. Status transitions from dead → alive. |
| Network partition | Each partition maintains its own membership view. Workshops in the minority partition are marked dead by the majority. On reunion, CRDT genome log merges — dead workshops that are actually alive transition back to alive. |
| Seed node unavailable | `swim.join` fails with `seed-unreachable` error. Operator must provide a reachable seed node. |
| All peers dead | Workshop is isolated. `swim.status` reports `peers: 0`. Workshop continues operating locally but cannot sync platform code or resolve DHT lookups. |
| False positive (workshop marked dead but alive) | SWIM Lifeguard extensions reduce false positives. The alive workshop will re-join on next probe cycle, transitioning from dead → alive. |

## Rollout

- **Phase 1 (single workshop):** No SWIM protocol active. The existing Werkstatt operates as a single workshop with no peers. `swim.members` reports one member (self).
- **Phase 2 (two workshops):** A second workshop joins via `swim.join`. SWIM gossip begins. Both workshops maintain a membership view with two members. The CRDT genome log records join events.
- **Phase 3 (auto-sync):** SWIM runs continuously in the background. Probe interval is configurable. Workshops automatically detect failures and new joins.
- **Phase 4 (scale):** Hundreds of workshops. SWIM's indirect ping and suspicion mechanism keep false positives low. The CRDT genome log grows linearly with membership events.

## Alternatives considered

1. **Centralized membership service.** A central service tracks workshop membership. Rejected: single point of failure. If the membership service is down, no workshop can join or detect failures.
2. **Heartbeat-based membership.** Each workshop sends heartbeats to all others. Rejected: O(N²) message complexity. SWIM's gossip-based approach is O(N) per round.
3. **Raft consensus for membership.** Use Raft to maintain a replicated membership log. Rejected: Raft requires a leader and quorum. SWIM is leaderless and eventually consistent, which is sufficient for membership.
4. **No persistent log (in-memory only).** Keep membership in memory only. Rejected: a restarting workshop loses its membership view and must re-converge from scratch. The CRDT genome log allows instant restoration.
5. **Gossip-based membership without SWIM.** Use a simpler gossip protocol without SWIM's suspicion mechanism. Rejected: without suspicion, a slow workshop may be incorrectly marked dead. SWIM's suspicion timeout reduces false positives.

## Risks

- **False positives.** A slow workshop under heavy load may be marked dead. Mitigation: SWIM Lifeguard extensions adapt probe intervals based on RTT. The suspicion timeout is configurable.
- **Genome log growth.** The CRDT genome log grows indefinitely with membership events. Mitigation: log compaction (future RFC) can snapshot the current membership view and truncate old entries.
- **Sybil attacks.** In the pilot, membership is permissioned (seed node invitation). In the future, an open network would be vulnerable to Sybil attacks. Mitigation: future RFC for proof-of-stake or proof-of-work.
- **Gossip overhead.** At hundred-workshop scale, SWIM gossip adds ~1KB/s per workshop. At thousand-workshop scale, this grows but remains negligible compared to git-mesh and DHT traffic.
- **Agent misinterpretation.** LLM agents may attempt to manually edit `werkstatt.genome.log`. Mitigation: the log is append-only and signed. Manual edits break signature verification. The implementation notes state this clearly.

## Acceptance criteria

- [ ] `SwimMember`, `SwimMemberStatus`, `SwimConfig`, `SwimMembershipView`, `GenomeLogEntry` types defined in `packages/os/site-kernel/src/swim/types.ts`
- [ ] `swim.join` command joins the network via a seed node
- [ ] `swim.leave` command leaves the network gracefully
- [ ] `swim.members` command lists current membership view
- [ ] `swim.status` command reports local SWIM status
- [ ] `werkstatt.swim.json` config file schema defined and validated
- [ ] `werkstatt.genome.log` CRDT genome log format defined (NDJSON, append-only, signed)
- [ ] Workshop restart restores membership view from genome log
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT manually edit `werkstatt.genome.log` — it is append-only and signed. Manual edits break signature verification.
- Agents MUST NOT hardcode seed node addresses — they are read from `werkstatt.swim.json`.
- SWIM gossip messages MUST NOT contain secrets — only membership metadata (workshop id, endpoint, status, operator VC id).
- The CRDT genome log MUST be NDJSON (one `GenomeLogEntry` per line) for easy append and tail.
- `swim.leave` MUST broadcast a `left` event before shutting down, so other workshops don't wait for the suspicion timeout.
