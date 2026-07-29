---
rfcId: RFC-0565
auditId: AUDIT-RFC-0565-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0565

## Verdict: Approved

The RFC is architecturally sound and aligns well with DNA-45 and the 5-layer P2P topology (RFC-0562). No failures on axes B, D, or E. Minor findings on axes C and F regarding missing cross-references, unexplained `packages/ontology` impact, and unspecified Compass/AGENTS.md sync points — all addressable during enhance without restructuring the RFC.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Failure modes** — the table describes behavior per condition but does not specify exit codes or warn-vs-fail distinction. For example, "Site not in DHT" should specify whether `dht.lookup` exits 0 with `found: false` or exits non-zero. The output format example suggests exit 0, but this should be explicit.
- **Rollout** — Phase 1 says "`dht.register` is a no-op (only one workshop)." The RFC should clarify whether a no-op `dht.register` still writes to the local registry or truly does nothing. This matters for agents that might call the command expecting a side effect.
- **Acceptance criteria** — "DHT entries are signed with Ed25519 by the registering workshop" is checkable, but "DHT entries include `owner` field from RFC-0561" depends on RFC-0561 being implemented first. The RFC should note this dependency in the criteria or in implementation notes.

## Axis B — DNA alignment

- **DNA-45 (Fleet registry)** — `satisfies: [DNA-45]` is justified. The RFC body explains that the DHT is a "distributed projection" of `systems/registry.yaml`, which remains authoritative. This extends DNA-45 by adding a distributed lookup layer without replacing the registry. ✓
- **DNA-44 (Sternsystem bundle)** — listed in `related[]`. The RFC correctly distinguishes DHT metadata (id, owner, mirrors, endpoint) from Sternsystem content (repos). ✓
- **No new DNA invariant** — the RFC does not claim to establish a new DNA invariant. This is consistent with RFC-0564 (SWIM), which also satisfies only DNA-1 without creating a new invariant. The 5-layer architecture itself is expected to be codified by RFC-0562. No issue.
- **No conflicts** with existing DNA invariants. ✓

## Axis C — Ecosystem fit

- **Missing `related[]` entries** — the RFC body references RFC-0558 (VC-based identity, for signature verification), RFC-0563 (git-mesh, in nonGoals), and RFC-0566 (immutable deploy, in nonGoals), but none appear in `related[]`. RFC-0558 is directly relevant — the `owner` field and signature verification depend on it. RFC-0563 and RFC-0566 are part of the same 5-layer architecture. All three should be in `related[]`.
- **Compass sync not identified** — the RFC introduces 4 new commands and a new architectural subsystem (DHT). It does not identify which `docs/*.xml` files need synchronization. At minimum, `docs/technology.xml` and `docs/development-plan.xml` likely need updates to record the DHT layer.
- **AGENTS.md updates not identified** — `packages/os/site-kernel/AGENTS.md` may need rules about DHT module conventions (signing, config file location, SWIM integration). The RFC should flag this.

## Axis D — Forward-only compliance

No issues. The RFC explicitly states the local registry remains authoritative and the DHT is a projection — this is a source/projection relationship, not a dual-path or compatibility shim. No legacy code paths are maintained behind a flag. ✓

## Axis E — Agent-facing policy

- **Status gate** — the RFC is `draft` and contains no self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓
- **Implementation notes** — reference RFC-0224 (accepted→implemented), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). ✓
- **Storage policy** — DHT entries are in-memory/network, not cookies or localStorage. `werkstatt.dht.json` is a server-side config file. ✓
- **Secret management** — the RFC explicitly states "Agents MUST NOT store secrets in DHT entries — only public site metadata." ✓

## Axis F — Pragmatism

- **`packages/ontology` impact unexplained** — `packagesImpacted` lists `packages/ontology`, but the RFC body never describes what changes in that package. All TypeScript contracts are placed in `packages/os/site-kernel/src/dht/`. If ontology types are needed (e.g., for site metadata schemas), the RFC should explain. Otherwise, remove `packages/ontology` from `packagesImpacted`.
- **`DHTPlacementResult.reason`** — free-form string. Consider an enum (`least-loaded | nearest | owner-preference`) for machine-checkable placement decisions. Minor.
- **Command surface** — 4 commands (lookup, register, placement, status) each map to distinct DHT operations. `dht.status` is a standard network diagnostic pattern. ✓

## Axis G — Blind spots

- **Concurrent registration** — the RFC does not consider what happens when two workshops register the same site simultaneously. S/Kademlia's eventual consistency means both entries may exist briefly. The RFC should specify which entry wins (e.g., latest `lastUpdated` timestamp, or owner-signature-based priority).
- **`dht.placement` without SWIM** — if SWIM (RFC-0564) is not running or no capacity metrics are available, `dht.placement` cannot make an informed decision. The RFC should specify fallback behavior (e.g., place locally, or fail with `no-capacity-data`).
- **`dht.register` cost** — the RFC specifies lookup latency (O(log N)) but not registration cost. Registration involves storing the entry on K nodes, which is also O(log N) but with a higher constant factor (replication). This should be documented.
- **Cache invalidation** — Phase 3 introduces local caching with TTL. The RFC does not specify how cache invalidation works when a site is re-registered or moved to a different workshop. A stale cache entry could direct lookups to a dead workshop.

## Questions for the author

1. What happens when two workshops concurrently `dht.register` the same site id with different `workshopEndpoint` values? Which entry is authoritative, and how is the conflict resolved?
2. What is the fallback behavior for `dht.placement` when SWIM capacity metrics are unavailable (e.g., single-workshop Phase 1, or SWIM not yet bootstrapped)?
3. Why is `packages/ontology` listed in `packagesImpacted`? What specific ontology changes does this RFC require?
