---
id: RFC-0562
title: "P2P Werkstatt Network Topology: 5-layer architecture for million-site scale"
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
  - DNA-45
  - DNA-49
  - RFC-0179
  - RFC-0354
  - RFC-0558
  - RFC-0560
  - RFC-0561
  - RFC-0563
  - RFC-0564
  - RFC-0565
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
versionBump: none
commands:
  proposed:
    - werkstatt.network.status
    - werkstatt.network.bootstrap
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel
  - packages/ontology
successSignals:
  - "A reader of this RFC can identify all 5 layers of the P2P topology and trace each layer to its dedicated RFC (0563–0566)."
  - "The threat model section enumerates all adversary classes (byzantine workshop, network observer, rogue operator, sybil attacker, eclipse attacker) and maps each to a mitigation layer."
  - "The DNA-recovery section explains how a workshop with no local state can reconstruct full operational capability from the four persistent layers, including the disposability of in-flight mission workpieces."
nonGoals:
  - "Do not implement any P2P layer in this RFC — each layer has its own dedicated RFC (0563–0566)."
  - "Do not implement the `werkstatt.network.*` commands — they are proposed names for future implementation."
  - "Do not change the existing monorepo boundary (DNA-1) — the P2P network extends it, it does not replace it."
  - "Do not specify wire protocols or binary formats — each layer RFC defines its own protocol."
  - "Do not implement economic models, token staking, or incentive mechanisms — the pilot uses trusted workshops only."
  - "Do not establish a new DNA invariant for P2P topology in this RFC — the invariant will be established by a future RFC when the topology is implemented. This RFC is an architectural frame, not a DNA invariant establishment."
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

# RFC-0562: P2P Werkstatt Network Topology: 5-layer architecture for million-site scale

## Context

The Werkstatt currently operates as a single monorepo (DNA-1) with one operator and one control plane. RFC-0179 anticipated thousand-site scale using Workers for Platforms with shared sharded delivery. However, the scaling goal has grown: the platform must support **millions of websites and businesses** and **thousands of programmers**, with LLM-driven modifications, flexible site ownership, and no single point of failure.

The grilling session (2026-07-27) established a five-layered P2P architecture to achieve this scale. This RFC is the **umbrella** for the five-layer topology. It defines the overall architecture, threat model, DNA-recovery strategy, and cross-cutting requirements. Each layer has its own dedicated RFC:

- **Layer 1: Git-Mesh Platform Code Replication** (RFC-0563)
- **Layer 2: SWIM Membership and CRDT Genome** (RFC-0564)
- **Layer 3: DHT Site Registry and Content Placement** (RFC-0565)
- **Layer 4: Git-native site content** (existing — Sternsystem repos via DNA-44)
- **Layer 5: Immutable Platform Deploy with Atomic Rollback** (RFC-0566)

This RFC does not implement any layer. It provides the architectural frame that the per-layer RFCs fit into.

## Problem

1. **Single control plane is a bottleneck.** The current Werkstatt has one operator, one monorepo, one CI/CD pipeline. At million-site scale, a single control plane cannot handle the throughput of thousands of programmers simultaneously editing sites, LLM agents running missions, and deployments propagating.

2. **No workshop isolation.** In the current model, all sites share the same monorepo workspace. A misbehaving LLM agent or a buggy deployment affects all sites. At scale, workshops (isolated VMs with their own control plane) are needed to provide fault isolation and multi-tenant capacity.

3. **No persistent membership.** The fleet registry (`systems/registry.yaml`) is a single file. If the monorepo is lost, the registry is lost. At scale, membership information must be distributed and persistent across workshops.

4. **No content placement strategy.** Site content (Sternsystem repos) is currently in a single GitHub organization. At scale, content must be placed across multiple workshops and mirrors, with the network deciding where to place new content based on capacity and locality.

5. **No atomic rollback across workshops.** The current Leitstand (DNA-49) propagates releases to deployment targets. At scale, a deployment that spans multiple workshops must be atomic — either all workshops update or none do, with rollback if any fails.

## Decision

The Werkstatt platform adopts a **five-layer P2P architecture** for million-site scale. Each layer is an independent, composable subsystem with its own protocol, failure model, and dedicated RFC. The layers are:

1. **Git-Mesh Platform Code Replication (RFC-0563):** P2P replication of platform code (`packages/*`, `docs/*`, tooling) across workshops using git-native protocols. Each workshop has a full clone of the platform monorepo. Replication is eventual-consistent.

2. **SWIM Membership and CRDT Genome (RFC-0564):** SWIM/gossip protocol for failure detection and membership management. A persistent CRDT (Conflict-free Replicated Data Type) genome log records membership history. New workshops join by gossiping with a seed node and converging on the membership view.

3. **DHT Site Registry and Content Placement (RFC-0565):** S/Kademlia-hardened DHT (Distributed Hash Table) for site registry lookups and content placement decisions. The fleet registry (`systems/registry.yaml`) is projected into the DHT. Site lookups ("where is site X?") resolve through the DHT. New site placement is decided by the DHT based on workshop capacity.

4. **Git-native site content (existing):** Sternsystem repos (DNA-44) are already git-native. Content replication uses git push/pull between workshops. Mirrors are git remotes. No new protocol needed — this layer is already implemented by the existing Sternsystem bundle contract.

5. **Immutable Platform Deploy with Atomic Rollback (RFC-0566):** Immutable release artifacts with atomic symlink-swap deployment. Control-plane (platform code) and data-plane (site content) are separated. Rollback is an atomic symlink swap to the previous artifact. Deployments are atomic across workshops via a two-phase commit.

The five layers are **independent but composable**. Each layer can be deployed, upgraded, and operated independently. The layers interact through well-defined interfaces, not through shared state.

## Architectural fit

- **DNA-1 (Monorepo boundary):** The P2P network extends the monorepo boundary. Each workshop has a full clone of the monorepo. The monorepo remains the unit of platform code — it is replicated, not fragmented.
- **DNA-44 (Sternsystem bundle):** Sternsystem repos are the unit of site content. Layer 4 (git-native content) is already implemented by DNA-44. The P2P network replicates Sternsystem repos across workshops.
- **DNA-45 (Fleet registry):** The fleet registry is projected into the DHT (Layer 3). The local `systems/registry.yaml` remains the authoritative source for the local workshop, but the DHT provides global lookup.
- **DNA-49 (Fleet propagation / Leitstand):** Layer 5 (immutable deploy) extends the Leitstand. The Leitstand's propagation model is generalized to multi-workshop deployments with atomic rollback.
- **RFC-0179 (Workers for Platforms):** RFC-0179 addressed thousand-site scale with shared sharded delivery. This RFC addresses million-site scale with P2P workshops. The two are complementary — Workers for Platforms remains the delivery mechanism within each workshop.
- **RFC-0558 (Identity Model):** VC-based identity (RFC-0558) provides the trust layer for the P2P network. Workshop identity, site ownership, and actor delegation are all expressed as VCs that can be verified by any workshop.
- **RFC-0561 (Site Ownership):** The registry `owner` field (RFC-0561) is replicated through the DHT, allowing any workshop to verify site ownership.
- **Scaling Playbook:** This architecture applies at growth stage 4 (million-site scale). Stages 1–3 continue to use the single-workshop model. The P2P layers are additive — they do not replace the single-workshop model, they extend it.

## Design

### Layer overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Werkstatt P2P Network                         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 5: Immutable Deploy (RFC-0566)                           │
│  Atomic symlink-swap, control-plane/data-plane separation       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: Git-native site content (existing, DNA-44)            │
│  Sternsystem repos, git push/pull, mirror remotes               │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: DHT Site Registry (RFC-0565)                          │
│  S/Kademlia DHT, site lookups, content placement                │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: SWIM Membership + CRDT Genome (RFC-0564)              │
│  Gossip failure detection, persistent membership log            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Git-Mesh Platform Code Replication (RFC-0563)         │
│  P2P git clone of monorepo, eventual consistency                │
└─────────────────────────────────────────────────────────────────┘
```

### Workshop model

A **workshop** is an isolated VM with:

- A full clone of the platform monorepo (Layer 1)
- A SWIM membership entry (Layer 2)
- A DHT node (Layer 3)
- Zero or more Sternsystem repo clones (Layer 4)
- An immutable deploy target (Layer 5)

Workshops are **independent**. Each workshop has its own control plane, its own Studio Gate instance, and its own mission lifecycle. Workshops communicate only through the five P2P layers.

### DNA-recovery

A workshop that loses all local state (disk failure, VM destruction) can recover full operational capability from the four persistent layers:

1. **Platform code:** Clone the monorepo from any peer workshop (Layer 1).
2. **Membership:** Join the SWIM network via a seed node, converge on membership view (Layer 2).
3. **Site registry:** Query the DHT for site locations (Layer 3).
4. **Site content:** Clone Sternsystem repos from mirror remotes (Layer 4).
5. **Deploy artifacts:** Pull immutable release artifacts from any peer (Layer 5).

No workshop has state that cannot be reconstructed from the network. This is the **DNA-recovery** property: the workshop's DNA (platform code + membership + registry + content + artifacts) is fully recoverable from peers.

**In-flight missions:** A workshop that loses disk while it has an open mission loses the workpiece (`missions/<missionId>/workpiece/`). Per DNA-46, the workpiece is a **non-canonical disposable Werkstück** — it is explicitly disposable. DNA-recovery does not restore in-flight workpieces. The workshop re-opens a mission from the Sternsystem repo's last committed state. Operators should commit workpiece progress frequently (via `mission.git.commit`) to minimize loss.

### Threat model

| Adversary | Capability | Mitigation |
| --- | --- | --- |
| **Byzantine workshop** | Serves corrupted platform code or site content | Layer 1: git commit signatures (RFC-0560). Layer 4: Sternsystem repo hashes verified against DHT. Layer 5: immutable artifacts with content-addressed hashes. |
| **Network observer** | Eavesdrops on P2P traffic | Layer 2: SWIM gossip is plaintext membership metadata only. Layer 3: DHT lookups are plaintext site ids. No secrets traverse the P2P layers — secrets are per-workshop env vars (DNA-40). |
| **Rogue operator** | Attempts to claim ownership of a site they don't own | RFC-0558: VC-based ownership. RFC-0561: registry `owner` field. Layer 3: DHT replicates the `owner` field. Any workshop can verify ownership. |
| **Sybil attacker** | Creates many fake workshops to dominate the network | Layer 2: SWIM membership is permissioned in the pilot — new workshops require a seed node invitation. Future: proof-of-stake or proof-of-work. |
| **Eclipse attacker** | Surrounds a workshop with malicious peers to isolate it | Layer 2: SWIM random peer selection prevents deterministic isolation. Layer 3: DHT routing uses multiple disjoint paths (S/Kademlia). |

### Compass and AGENTS.md synchronization

When the P2P topology is adopted (Phase 2+), the following Compass and AGENTS.md files will need synchronization:

- **`docs/technology.xml`** — add workshop model, P2P layers, and protocol stack to the technology landscape.
- **`docs/development-plan.xml`** — add P2P topology rollout phases to the development plan.
- **Root `AGENTS.md`** — add a section on workshops, P2P layers, and the workshop model (isolated VM with its own control plane).
- **`packages/os/site-kernel/AGENTS.md`** — add rules for the new `gitmesh.*`, `swim.*`, `dht.*`, and `deploy.*` command namespaces.

This RFC does not modify these files — they will be updated when the per-layer RFCs are implemented.

### Cross-cutting requirements

1. **No secrets in P2P layers.** Environment variables, API keys, and signing keys never traverse the P2P network. They are per-workshop configuration (DNA-40).
2. **VC-based identity everywhere.** Workshop identity, site ownership, and actor delegation are all VCs (RFC-0558). Any workshop can verify any VC without a central authority.
3. **Content-addressed artifacts.** Platform code, site content, and release artifacts are all content-addressed (git SHAs, content hashes). Corruption is detectable.
4. **Eventual consistency.** All layers are eventually consistent. No layer requires synchronous coordination across workshops. The only synchronous operation is the two-phase commit for atomic deploy (Layer 5).
5. **Pilot: trusted workshops only.** The pilot deployment uses a small number of trusted workshops operated by the same organization. Byzantine resistance is designed but not tested in the pilot.

### CLI surface

```sh
# Check network status (proposed, not implemented in this RFC)
pnpm exec site-kernel run werkstatt.network.status --json

# Bootstrap a new workshop into the P2P network (proposed, not implemented in this RFC)
pnpm exec site-kernel run werkstatt.network.bootstrap --seed <seed-node-address> --json
```

These commands are **proposed names only**. Their implementation is deferred to the per-layer RFCs and future implementation RFCs. Exit codes and warn-vs-fail behavior for these commands will be defined in the implementing RFCs.

### TypeScript contracts

```ts
// Conceptual types — not implemented in this RFC

export interface WorkshopIdentity {
  workshopId: string;       // UUID
  endpoint: string;         // host:port for P2P protocols
  operatorVC: string;       // VC subject id of the workshop operator
  joinedAt: string;         // ISO-8601
}

export interface NetworkStatus {
  workshops: number;        // Total workshops in SWIM membership
  sites: number;            // Total sites in DHT
  platformVersion: string;  // Current platform code version (git SHA)
  layers: {
    gitMesh: LayerStatus;
    swim: LayerStatus;
    dht: LayerStatus;
    content: LayerStatus;
    deploy: LayerStatus;
  };
}

export interface LayerStatus {
  operational: boolean;
  peers: number;
  lastSync: string;         // ISO-8601
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/rfc-0563-*.md` | Layer 1: Git-Mesh Platform Code Replication RFC. |
| `docs/rfcs/rfc-0564-*.md` | Layer 2: SWIM Membership and CRDT Genome RFC. |
| `docs/rfcs/rfc-0565-*.md` | Layer 3: DHT Site Registry and Content Placement RFC. |
| `docs/rfcs/rfc-0566-*.md` | Layer 5: Immutable Platform Deploy with Atomic Rollback RFC. |
| `docs/architecture-dna.md` | A future RFC will establish a new DNA invariant for P2P topology when the topology is implemented. This RFC does not modify `architecture-dna.md`. |

### Output format

```json
{
  "command": "werkstatt.network.status",
  "status": "ok",
  "data": {
    "workshops": 3,
    "sites": 1247,
    "platformVersion": "abc123def456",
    "layers": {
      "gitMesh": { "operational": true, "peers": 2, "lastSync": "2026-07-27T12:00:00Z" },
      "swim": { "operational": true, "peers": 2, "lastSync": "2026-07-27T12:00:05Z" },
      "dht": { "operational": true, "peers": 2, "lastSync": "2026-07-27T12:00:10Z" },
      "content": { "operational": true, "peers": 2, "lastSync": "2026-07-27T11:59:00Z" },
      "deploy": { "operational": true, "peers": 2, "lastSync": "2026-07-27T11:58:00Z" }
    }
  },
  "summary": "werkstatt.network.status: 3 workshops, 1247 sites, all layers operational"
}
```

This is a **proposed output shape** — not implemented in this RFC.

### Failure modes

| Condition | Behavior |
| --- | --- |
| Workshop loses disk | DNA-recovery: clone platform code from peers, rejoin SWIM, query DHT, clone Sternsystem repos, pull deploy artifacts. In-flight mission workpieces are lost (disposable per DNA-46); workshop re-opens from last committed state. |
| Workshop goes offline | SWIM marks workshop as suspected, then dead after timeout. DHT routes around it. Other workshops continue operating. |
| Network partition | Each partition continues operating independently. CRDT genome merges on reunion. DHT converges on reunion. Git-mesh syncs on reunion. |
| Byzantine workshop serves corrupted code | Git commit signatures (RFC-0560) detect corruption. Content-addressed artifacts detect tampering. Workshop is evicted via SWIM. |
| Seed node unavailable for bootstrap | Workshop cannot join the network. Operator must provide a reachable seed node. |

## Rollout

- **Phase 0 (this RFC):** Architectural frame only. No code changes. Per-layer RFCs (0563–0566) are created as drafts.
- **Phase 1 (single workshop):** The existing Werkstatt continues to operate as a single workshop. No P2P layers are active. This is the current state.
- **Phase 2 (two workshops, trusted):** A second workshop is bootstrapped. Layer 1 (git-mesh) replicates platform code. Layer 2 (SWIM) establishes membership. Layer 3 (DHT) replicates the registry. Layer 4 (git-native content) syncs Sternsystem repos. Layer 5 (immutable deploy) is not yet multi-workshop — each workshop deploys independently.
- **Phase 3 (multi-workshop deploy):** Layer 5 is upgraded to multi-workshop atomic deploy. Two-phase commit across workshops. Rollback is atomic.
- **Phase 4 (scale):** Additional workshops join. The network scales to hundreds of workshops and millions of sites. Byzantine resistance is tested.

The pilot operates at Phase 1–2. Phases 3–4 are future work beyond the pilot.

## Alternatives considered

1. **Centralized control plane at scale.** Keep a single control plane and scale it vertically (bigger VMs, more CPU, more RAM). Rejected: single point of failure. At million-site scale, a single control plane cannot handle the throughput, and a failure takes down the entire platform.

2. **Sharded control plane (not P2P).** Shard the control plane across multiple VMs with a coordinator. Rejected: the coordinator is a single point of failure. Sharding adds complexity without eliminating the coordinator bottleneck. P2P eliminates the coordinator entirely.

3. **Federated workshops with central registry.** Workshops are independent but share a central registry for site ownership and membership. Rejected: the central registry is a single point of failure. The DHT (Layer 3) distributes the registry across all workshops, eliminating the central registry.

4. **Blockchain-based consensus.** Use a blockchain for membership, registry, and content placement. Rejected: blockchain is overkill for the pilot. The five-layer architecture uses simpler, well-understood protocols (git, SWIM, DHT) that are sufficient for the threat model. Blockchain may be revisited if the threat model requires Sybil resistance at scale.

5. **Single layer (monolithic P2P).** Combine all five layers into a single P2P protocol. Rejected: the layers have different requirements (replication vs. membership vs. lookup vs. content vs. deploy). A monolithic protocol would be over-complex and difficult to upgrade independently. The layered approach allows each layer to evolve independently.

## Risks

- **Complexity.** Five layers is significantly more complex than the current single-workshop model. Each layer has its own protocol, failure model, and operational concerns. Mitigation: the layers are independent and can be rolled out incrementally. The pilot starts with two trusted workshops.
- **Byzantine resistance untested.** The threat model assumes Byzantine workshops, but the pilot uses trusted workshops only. Byzantine resistance is designed but not tested. Mitigation: the pilot is Phase 1–2; Byzantine testing is Phase 4.
- **Network partition handling.** CRDT genome merges on reunion, but merge conflicts in site content (two workshops editing the same site simultaneously) are not automatically resolved. Mitigation: mission lifecycle (DNA-46) ensures one open mission per Sternsystem at a time. The DHT (Layer 3) routes site operations to the workshop that owns the mission.
- **Performance.** DHT lookups add latency to site operations. SWIM gossip adds network overhead. Mitigation: DHT lookups are O(log N) hops. SWIM gossip is bounded by the membership protocol parameters. Local caching reduces lookup frequency.
- **Agent misinterpretation.** LLM agents may attempt to implement P2P layers based on this RFC. Mitigation: this RFC is explicitly an architectural frame. Implementation is deferred to per-layer RFCs and future implementation RFCs. The implementation notes section states this clearly.
- **Operational burden.** Operating a P2P network requires skills that the current team may not have (SWIM, DHT, CRDT operations). Mitigation: the pilot starts with two trusted workshops operated by the same team. Operational runbooks are developed during Phase 2.

## Acceptance criteria

- [x] All 5 layers are described with their dedicated RFC references (0563–0566), each naming its protocol and failure model (evidence: lines 101–105, 125–133; failure modes at lines 308–314)
- [x] Threat model enumerates all adversary classes (byzantine workshop, network observer, rogue operator, sybil attacker, eclipse attacker) and maps each to a mitigation layer (evidence: lines 201–207)
- [x] DNA-recovery section explains how a workshop reconstructs from the four persistent layers, including the disposability of in-flight mission workpieces (DNA-46) (evidence: lines 186–197)
- [x] Cross-cutting requirements section covers secrets, identity, content addressing, consistency, and pilot scope (evidence: lines 220–226)
- [x] Workshop model is defined with its five components (platform clone, SWIM membership, DHT node, Sternsystem repos, deploy target) (evidence: lines 175–181)
- [x] Rollout phases are defined (Phase 0–4) with pilot scope (Phase 1–2) (evidence: lines 316–324)
- [x] Compass and AGENTS.md synchronization points are identified for Phase 2+ adoption (evidence: lines 209–218)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0562 --json → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT implement any P2P layer based on this RFC alone — each layer has its own dedicated RFC (0563–0566) that must be accepted before implementation.
- Agents MUST NOT implement the `werkstatt.network.*` commands — they are proposed names only, not implemented in this RFC.
- This RFC is an **architectural frame**, not an implementation specification. It defines what the layers are and how they relate, not how they work internally.
- The pilot uses trusted workshops only — Byzantine resistance is designed but not tested.
