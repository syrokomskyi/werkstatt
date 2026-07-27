---
rfcId: RFC-0562
auditId: AUDIT-RFC-0562-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0562

## Verdict: Needs revision

The RFC is a well-structured architectural umbrella for the five-layer P2P topology, but has two Axis B failures: a title/body contradiction about whether a DNA invariant is established, and a missing `related[]` entry for RFC-0560 (referenced in the threat model). A factual error in the success signals (says "three" adversaries, threat model lists five) and a `versionBump` mismatch (should be `none` for a prose-only frame) should also be fixed before acceptance.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0562 --json` returned zero violations.

## Axis A — Structural completeness

- **Failure modes** table describes behavior conditions but does not specify exit codes or warn-vs-fail distinction. For an architectural frame RFC this is minor, but the template expects exit codes.
- **Acceptance criteria** are prose-level ("All 5 layers are described…", "Threat model enumerates…"). This is appropriate for an umbrella RFC, but the criteria could be sharpened to specify what "described" means — e.g., "each layer section names its RFC id, protocol, and failure model" rather than just "described."
- All other sections (Decision, CLI surface, TypeScript contracts, File system responsibilities, Output format, Rollout, Alternatives, Risks, Implementation notes) contain real content with no template placeholders.

## Axis B — DNA alignment

- **FAIL — Missing `related[]` entry for RFC-0560.** The threat model table (line 197) references "git commit signatures (RFC-0560)" as a mitigation for Byzantine workshops, but RFC-0560 is not listed in `related[]`. The `related` field includes RFC-0558, RFC-0561, RFC-0563–0566, but omits RFC-0560. This is a referential gap — a reader following `related[]` cannot trace the commit-signature mitigation.
- **FAIL — Title/body contradiction on DNA invariant.** The title says "P2P Werkstatt Network Topology **and DNA Invariant**: 5-layer architecture for million-site scale," implying this RFC establishes a new DNA invariant. But the File system responsibilities table (line 263) says "This RFC proposes a new DNA invariant for P2P topology (future, not in this RFC)." The `satisfies` field lists only `DNA-1`. Either the title should drop "DNA Invariant" or the RFC should establish one and add it to `satisfies[]`.
- `satisfies: [DNA-1]` — the RFC body (line 135) explains how the P2P network extends DNA-1 ("Each workshop has a full clone of the monorepo. The monorepo remains the unit of platform code — it is replicated, not fragmented."). This is a valid explanation of how it extends DNA-1.
- `related[]` DNA references (DNA-1, DNA-44, DNA-45, DNA-49) all exist in `docs/architecture-dna.md` and are relevant to the RFC's architectural fit section.

## Axis C — Ecosystem fit

- **No Compass sync identification.** The RFC does not identify which `docs/*.xml` files would need synchronization when the P2P topology is adopted. `docs/technology.xml` and `docs/development-plan.xml` would likely need updates to reflect the workshop model and P2P layers. This is a gap for a workspace-scoped architectural RFC.
- **No AGENTS.md update identification.** The RFC introduces the "workshop" concept (isolated VM with its own control plane) but does not identify which `AGENTS.md` files need rule updates. The root `AGENTS.md` would need a section on workshops and P2P layers if this architecture is adopted.
- **Package boundaries** are correct — no cross-package import violations proposed. The per-layer RFCs place code in `packages/os/site-kernel`, which is the correct location for OS commands.
- **Command lifecycle** is internally consistent — `commands.proposed` lists `werkstatt.network.status` and `werkstatt.network.bootstrap`, which are explicitly marked as "proposed names only, not implemented in this RFC."

## Axis D — Forward-only compliance

No issues. The RFC is additive — it extends the single-workshop model with P2P layers, it does not maintain a backward compatibility layer. The rollout phases describe a clean extension path, not a dual-path. No legacy code paths are maintained behind a flag.

## Axis E — Agent-facing policy

No issues. The RFC is `draft` and contains no self-authorizing language. Implementation notes (lines 342–350) reference the correct governance rules: RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). The notes explicitly state "Agents MUST NOT implement any P2P layer based on this RFC alone" and "Agents MUST NOT implement the `werkstatt.network.*` commands." Storage policy is respected — the threat model states "secrets are per-workshop env vars (DNA-40)."

## Axis F — Pragmatism

- **`versionBump: patch` should be `none`.** The RFC template comment says `none` is for "prose-only" RFCs. This RFC is explicitly an architectural frame: "Phase 0 (this RFC): Architectural frame only. No code changes." Since no code changes are produced, `versionBump` should be `none`, not `patch`.
- **`packagesImpacted` is slightly misleading.** The RFC lists `packages/os/site-kernel` and `packages/ontology`, but these packages are impacted by the per-layer RFCs (0563–0566), not by this umbrella RFC. The RFC itself produces no code changes. This is not wrong — it signals the total impact area — but a reader might infer this RFC directly modifies these packages.
- **Minimal command surface** — two proposed umbrella commands (`werkstatt.network.status`, `werkstatt.network.bootstrap`). These earn their existence as top-level entry points for the P2P network. The per-layer RFCs propose their own layer-specific commands. No duplication.
- **Lean contracts** — TypeScript types are conceptual and minimal, appropriately marked "not implemented in this RFC."

## Axis G — Blind spots

- **FAIL — Success signal factual error.** Success signal #2 (line 63) says "The threat model section enumerates the **three** classes of adversaries (byzantine workshop, network observer, rogue operator)." But the threat model table (lines 195–201) lists **five** adversaries: Byzantine workshop, Network observer, Rogue operator, Sybil attacker, Eclipse attacker. The success signal undercounts by two.
- **DNA-recovery blind spot for in-flight missions.** The DNA-recovery section (lines 183–191) describes recovering platform code, membership, registry, content, and artifacts from the network. But it does not address what happens to in-flight missions — open workpieces in `missions/<missionId>/workpiece/` with uncommitted changes. If a workshop loses disk, the workpiece is local state that cannot be recovered from the network. The RFC should state whether in-flight missions are considered disposable during DNA-recovery or whether there's a recovery mechanism (e.g., workpiece commits are pushed to a Sternsystem repo branch before disk failure).
- **Performance** is addressed — DHT lookups are O(log N), SWIM gossip is bounded, platform code replication is O(1) per workshop.
- **Edge cases** are well-covered — network partition, workshop failure, seed node unavailability, Byzantine workshop, false positives in SWIM.

## Questions for the author

1. The title says "DNA Invariant" but the body says the DNA invariant is "future, not in this RFC." Should this RFC establish a new DNA invariant (e.g., DNA-57) for P2P topology, or should the title be revised to remove "DNA Invariant"?
2. What happens to in-flight missions (open workpieces with uncommitted changes) when a workshop loses all local state? The DNA-recovery section describes recovering platform code, membership, registry, content, and artifacts, but not in-progress mission workpieces. Are these considered disposable, or is there a recovery mechanism?
3. RFC-0560 (signed commits) is referenced in the threat model as a mitigation for Byzantine workshops but is missing from `related[]`. Should it be added, or is the reference indirect via RFC-0563?
