---
id: RFC-0857
title: "Make release-certification RFC materialization just-in-time"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt: 2026-08-15
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0855
  - RFC-0856
amendedBy: []
related:
  - RFC-0396
  - RFC-0397
  - werkstatt-release-certification/CERT-001
  - werkstatt-release-certification/CERT-002
  - werkstatt-release-certification/CERT-010
satisfies:
  - DNA-55
  - DNA-65
versionBump: none
batch: agent-runtime-certification-program
dependsOn: []
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: []
successSignals:
  - "No blocked release-certification node is created outside spec.materialize"
  - "Draft CERT packets use stable qualified spec-node references until just-in-time materialization"
  - "Sealing fails unless the referenced node resolves to an accepted materialized RFC"
  - "Every JIT governance range is protected by one Steward preparation lease and recorded in the seal commit"
nonGoals:
  - "Do not weaken dependency-front materialization or add a planning/bypass mode to spec.materialize"
  - "Do not accept AMD-007 during RFC-0855 charter implementation"
  - "Do not reorder, combine, or parallelize RFC-0855 packets"
  - "Do not implement the RFC-0856 control plane or any certification capability in this amendment"
---

# RFC-0857: Make release-certification RFC materialization just-in-time

## Context

RFC-0855 establishes a strictly sequential program whose packets 140 through 240 implement nodes CERT-002 through CERT-010 from the accepted `werkstatt-release-certification` specification. RFC-0856 establishes the packet control plane and requires each packet to name its governing decision.

The accepted specification intentionally uses lazy dependency-front materialization. RFC-0396 and the current `spec.materialize` handler create a spec-backed RFC only when every declared spec dependency is already `implemented`. At charter-planning time, CERT-001 is materialized as draft RFC-0848, so CERT-002 through CERT-010 are not on the materialization front.

RFC-0855 nevertheless says that its document-only charter implementation creates every child RFC before preparing the full packet set. It also requires AMD-007 to remain proposed until packet 040. Those requirements cannot all be satisfied without either bypassing `spec.materialize`, accepting AMD-007 early, or weakening the dependency-front rule.

## Problem

The conflict creates three unsafe choices for an implementing agent:

1. manually create blocked CERT RFCs and hand-edit `forge-spec.yaml`, violating DNA-55 and RFC-0396;
2. accept AMD-007 during charter implementation, collapsing the explicit packet-040 human decision boundary;
3. leave unresolved RFC identifiers or prose placeholders in future packets, violating RFC-0855's weak-agent packet contract.

The stable identity already exists: `<spec-id>/<node-id>`. What does not yet exist is the repository RFC identifier, and it cannot truthfully exist until the node reaches the materialization front.

## Decision

RFC-0855 and RFC-0856 use qualified spec-node references as the durable governing decision for spec-backed draft packets, and one leased Program Steward materializes and governs each CERT RFC inside a recorded just-in-time preparation range before that packet can be sealed or executed.

## Architectural fit

- **DNA-55:** immutable specification snapshots remain authoritative; only `spec.materialize` writes `materializedAs` into the permitted projection field.
- **DNA-65:** implementation dependencies remain explicit. Packet order does not replace RFC dependencies; sealing verifies the materialized RFC and its direct dependencies after resolution.
- **RFC-0396:** dependency-front materialization remains fail-hard, with no bulk-planning exception and no manual RFC-number allocation.
- **RFC-0397:** proposed AMD-007 may inform draft preparation but does not alter the effective spec until the operator accepts it in packet 040.
- **RFC-0855:** the 000–240 order, operational-unavailability policy, Law Kernel boundary, and one-packet-at-a-time rule are unchanged.
- **RFC-0856:** the packet control plane gains one precise resolution rule; the Executor still cannot create, select, or accept its own governing RFC.
- **Compass:** RFC-0855's existing Compass synchronization scope must describe qualified spec-node resolution, preparation ancestry, and recovery. `docs/styling.xml` remains a reviewed no-change because this policy has no styling effect.

## Design

### Effective amendments to RFC-0855

RFC-0855 charter implementation creates and validates:

- RFC-0856 and every non-spec child RFC whose responsibility is introduced by the program;
- AMD-007 as a proposed amendment;
- every draft packet from 000 through 240;
- qualified governing references for CERT-backed packets, even when their repository RFC identifiers do not yet exist.

It does **not** pre-materialize blocked CERT-002 through CERT-010 RFCs. The RFC-0855 acceptance criterion requiring every new child RFC to exist in draft is narrowed to non-spec children. For spec-backed children, the equivalent charter criterion is a resolvable qualified spec-node reference plus complete just-in-time materialization instructions.

Packets 140, 150, 160, 170, 180, 210, 220, 230, and 240 use these governing references respectively:

```text
werkstatt-release-certification/CERT-002
werkstatt-release-certification/CERT-003
werkstatt-release-certification/CERT-004
werkstatt-release-certification/CERT-005
werkstatt-release-certification/CERT-006
werkstatt-release-certification/CERT-007
werkstatt-release-certification/CERT-008
werkstatt-release-certification/CERT-009
werkstatt-release-certification/CERT-010
```

### Effective amendments to RFC-0856

`ProgramPacketV1.governingDecision` accepts a repository RFC id or a qualified specification decision reference:

```ts
type GoverningDecisionRef = RepositoryRfcRef | QualifiedSpecDecisionRef;

interface ResolvedGoverningDecisionV1 {
  reference: GoverningDecisionRef;
  kind: "rfc" | "spec-node" | "spec-amendment";
  resolvedRfc: RepositoryRfcRef | null;
  status: string;
}
```

Runtime schemas, not permissive TypeScript interpolation, close the vocabulary. Repository RFC ids match `^RFC-\d{4}$`. A qualified reference is split at its final `/`; the prefix must resolve to an accepted spec id and the suffix must exactly match either an effective `forge-spec.yaml` roadmap node id or an amendment id from that spec. This supports existing node vocabularies such as `CERT-002` and `RFC-PBP-020` without teaching generic Forge code domain prefixes. Unknown, ambiguous, or multiply resolved values fail.

A spec-node reference remains stable after materialization; the packet is not rewritten merely to substitute the assigned RFC id. The resolved repository RFC is a checked projection recorded in the manifest, preparation report, and validation output.

Draft validation of a spec-node reference requires:

1. the spec exists and has `status: accepted`;
2. the node exists in the effective spec projection;
3. the packet declares the exact future preparation procedure;
4. `forge-spec.yaml` may legitimately have no `materializedAs` value for the node.

Sealed validation additionally requires:

1. `materializedAs` resolves to exactly one repository RFC;
2. the RFC's `specRef` points back to the same spec node;
3. the RFC has completed audit and enhance and has `status: accepted` or `implemented`;
4. every direct RFC dependency required for implementation is `implemented`;
5. the packet's normative sources include the materialized RFC, its plan, the effective spec sources, and all applicable accepted amendments with exact hashes;
6. the predecessor completion boundary and program sequence permit this packet.

An unresolved, draft, reviewing, rejected, superseded, multiply mapped, or manually linked governing RFC fails sealing. Spec-level acceptance inheritance remains governed by RFC-0396; this amendment does not invent a second acceptance path.

### Steward preparation range

RFC-0856's existing `program.packet.lease` command governs both preparation and execution. It does not gain a second command name. Its lease contract becomes phase-aware:

```ts
type ProgramLeasePhase = "preparation" | "execution";

interface ProgramPacketLeaseV1 {
  schema: "forge/program-packet-lease@1";
  program: string;
  packetId: string;
  phase: ProgramLeasePhase;
  actor: ProgramActor;
  baseCommit: string;
  sealCommit: string | null;
  tokenHash: string;
  startedAt: string;
  heartbeatAt: string;
  timeoutSeconds: number;
}

interface ProgramPacketPreparationV1 {
  schema: "forge/program-packet-preparation@1";
  program: string;
  packetId: string;
  baseCommit: string;
  preparationCommits: string[];
  preparationHead: string;
  changedFiles: string[];
  governingDecision: GoverningDecisionRef;
  resolvedRfc: RepositoryRfcRef;
  materializationCommit: string;
  validations: Array<{
    command: string;
    status: "pass";
    evidenceDigest: string;
  }>;
  cleanTrees: true;
  preparedBy: ProgramActor;
}
```

Preparation starts only at `HEAD === baseCommit`, where `baseCommit` is the predecessor packet's committed completion boundary. One live local preparation lease exists for the packet and names a Steward actor. The subsequent canonical governance commits form a descendant range; history rewriting, a second preparation lease, and an Executor lease are forbidden while it is open.

`program.packet.seal` no longer requires `HEAD === baseCommit` for a prepared spec-backed packet. It requires that `baseCommit` be an ancestor of `HEAD`, the matching preparation lease be live, every intervening commit belong to the validated preparation range, and the range contain no implementation or unrelated changes. The command writes the sealed packet, manifest update, and preparation report as pending tracked artifacts. Their canonical commit is the seal boundary. The preparation report names the already-known `preparationHead`, never its own seal commit. Lease release verifies that `HEAD` is the commit that introduced those pending artifacts; only then may a distinct Executor acquire an execution lease.

The preparation range's semantic allow-list is derived rather than self-authored:

1. the one `forge-spec.yaml` projection selected by `governingDecision`;
2. exactly one newly materialized RFC whose reciprocal `specRef` matches that decision;
3. that RFC's canonical audit and plan files;
4. generated RFC indexes or decision projections required by their owning commands;
5. the current packet, program manifest, preparation report, and recovery record owned by RFC-0856.

No existing unrelated RFC, source file, mission workpiece, mirror, credential, provider state, or deployment artifact is allowed. After materialization, all wildcard-derived paths collapse to exact observed paths in the preparation report. A changed file that cannot be proven to have one of these roles fails sealing.

### Deterministic RFC dependencies

The Program Steward fills the materialized RFC's direct `dependsOn` in this exact order:

1. resolve every direct dependency of the effective spec node to its materialized repository RFC, preserving spec order;
2. resolve the immediately preceding program packet's governing decision to a repository RFC and append it when it is not already present;
3. remove duplicates while preserving first occurrence.

Every referenced RFC must be `implemented` before sealing. A missing materialization, a predecessor that cannot resolve to a repository RFC, or a mismatch between effective spec dependencies, packet order, and RFC frontmatter fails preparation. Packet order remains separately authoritative; `dependsOn` does not replace the predecessor completion check.

### Just-in-time preparation protocol

After the predecessor packet's completion commit exists, the Program Steward—not the Packet Executor—performs this protocol before sealing a CERT packet:

1. validate the program, predecessor completion, clean trees, current branch, and source hashes;
2. acquire the only preparation lease at `HEAD === baseCommit` with an idempotency key;
3. run `spec.status --spec=werkstatt-release-certification --json` and verify the intended node is on the front;
4. run `spec.materialize --spec=werkstatt-release-certification --nodes=<CERT-NNN> --json` and commit its RFC/projection pair canonically;
5. complete the normal RFC audit, enhance, plan, and explicit acceptance workflow for the created RFC;
6. derive and verify bidirectional `specRef`/`materializedAs`, direct `dependsOn`, program batch, and responsibility boundaries;
7. refresh the draft packet's current-code facts, exact hashes, validations, diagnostics, file allow-list, and recovery instructions;
8. validate the complete preparation range and let `program.packet.seal` write the pending preparation report, packet, and manifest;
9. commit the seal boundary, release the preparation lease, and only then permit a distinct Executor execution lease.

The assigned RFC id is recorded in validation evidence, the preparation report, and the program manifest's resolved-decision projection. The stable packet field remains the qualified spec-node reference.

If preparation stops after any canonical commit, the same live Steward may resume from that commit after revalidating ancestry and artifacts. After timeout, only `program.packet.lease --action=recover` may transfer or block the range. Recovery records the prior lease digest, observed preparation head, completed governance stages, discovered RFC/projection pair, and the chosen continuation target. It never deletes the materialized RFC, rewrites commits, or silently restarts from `baseCommit`.

### CLI surface

This amendment adds, changes, and removes no command. It preserves the existing materialization surface:

```sh
pnpm exec werkstatt run spec.status \
  --spec=werkstatt-release-certification --json

pnpm exec werkstatt run spec.materialize \
  --spec=werkstatt-release-certification --nodes=CERT-002 --json

pnpm exec werkstatt run program.packet.lease \
  --program=RFC-0855 --packet=140-resolved-certification-profile \
  --action=start --phase=preparation \
  --steward=human:andrii-syrokomskyi --json
```

RFC-0856's future `program.packet.validate` and `program.packet.seal` implementations apply the resolution rules above as part of their already-proposed behavior; this amendment does not add a separate resolver command.

### File system responsibilities

| Path | Responsibility |
|---|---|
| `docs/specs/werkstatt-release-certification/forge-spec.yaml` | Carries `materializedAs` written only by `spec.materialize` |
| `docs/specs/werkstatt-release-certification/amendments/amd-007-*.md` | Remains proposed through charter implementation; accepted explicitly in packet 040 |
| `docs/rfcs/rfc-0855-*.md` | Amended program charter; not edited in place by this RFC |
| `docs/rfcs/rfc-0856-*.md` | Amended packet-control-plane contract; not edited in place by this RFC |
| RFC-0855/RFC-0856 frontmatter | Metadata-only reciprocal `amendedBy: RFC-0857`; normative bodies remain unchanged |
| future materialized CERT RFCs | Created only by `spec.materialize` when their node is on the front |
| `docs/plans/agent-runtime-certification/NNN-*.md` | Draft packets retain stable qualified spec-node governing references |
| `docs/plans/agent-runtime-certification/program.yaml` | Projects each stable reference and, after materialization, its resolved repository RFC id |
| `docs/plans/agent-runtime-certification/preparations/*.json` | Tracked preparation-range evidence committed with the seal boundary |
| `.forge/program-leases/**` | Untracked phase-aware preparation/execution leases; raw tokens never enter git |
| `docs/{requirements,technology,development-plan,knowledge-graph,verification-plan,source-markup}.xml` | RFC-0855 charter synchronization includes JIT preparation and qualified-decision truth |
| `docs/styling.xml` | Reviewed no-change rationale only; this amendment changes no visual contract |

### Output format

This documentation-only amendment has no runtime output. RFC-0856's future validation output reports both identities when a spec node is materialized:

```json
{
  "governingDecision": "werkstatt-release-certification/CERT-002",
  "resolvedRfc": "RFC-XXXX",
  "decisionStatus": "accepted",
  "baseCommit": "<predecessor-completion-sha>",
  "preparationHead": "<last-governance-sha>",
  "preparationCommits": ["<sha>"],
  "preparationLease": "valid"
}
```

Before materialization, draft validation reports `resolvedRfc: null`. Sealed validation never accepts `null`.

### Failure modes

| Condition | Required result |
|---|---|
| Spec node is blocked | Do not materialize or seal; wait for the governing predecessor implementation |
| Proposed amendment would change the node | Draft may cite it as proposed; sealing waits for explicit acceptance or rejection |
| `materializedAs` was hand-edited or lacks a reciprocal `specRef` | Fail validation; repair only through the canonical spec workflow |
| More than one RFC claims the same spec node | Fail validation; do not choose one heuristically |
| Materialized RFC is not accepted or implemented | Fail sealing; complete its governance pipeline first |
| Packet contains an unresolved `RFC-XXXX` placeholder | Fail draft validation |
| Executor attempts materialization or packet preparation | Fail role validation; return control to the Steward |
| Later implementation changes current code facts or hashes | Regenerate and independently revalidate the draft before sealing |
| A second preparation/execution lease exists | Fail start/seal; timed-out ownership requires explicit recovery |
| Preparation `HEAD` does not descend from `baseCommit` | Fail sealing; never rebase or rewrite the sealed lineage |
| Preparation range changes an unowned file | Fail sealing and block the packet for Steward correction |
| RFC exists without its reciprocal projection, or projection exists without its RFC | Fail preparation; record recovery and repair through the canonical spec workflow |
| Preparation report omits a governance commit or changed path | Fail sealing; recompute evidence from git rather than trusting prose |

No failure in this table is warn-only or suppressible.

## Rollout

1. Accept RFC-0857 before persisting the RFC-0855 implementation plan.
2. Add metadata-only reciprocal `amendedBy: RFC-0857` edges to RFC-0855 and RFC-0856 without rewriting their accepted bodies.
3. Make the RFC-0855 plan treat RFC-0857 as the normative correction for charter artifacts, Compass projections, and acceptance evidence.
4. Make the RFC-0856 implementation plan and packet-000 implementation include generic qualified spec resolution, phase-aware leases, preparation reports, descendant-range validation, and recovery.
5. During RFC-0855 charter implementation, create non-spec children and all packet drafts, but leave CERT-002 through CERT-010 unmaterialized.
6. Accept AMD-007 only at packet 040.
7. Materialize each CERT node just in time under the Steward protocol, beginning with CERT-002 after packet 130 completes.

No source code, spec projection, child RFC, or packet is created by implementing RFC-0857 itself. Its effect is the normative correction consumed by the two amended RFC pipelines.

## Alternatives considered

### Create every CERT RFC manually during charter implementation

Rejected because it bypasses `spec.materialize`, manual RFC numbering and `materializedAs` mutation, and the dependency-front guarantee.

### Add a blocked-node or planning mode to `spec.materialize`

Rejected because it weakens RFC-0396 globally to accommodate one program. A planning scaffold that looks like a materialized RFC would be indistinguishable from a prematurely actionable decision to weaker agents.

### Accept AMD-007 before charter implementation

Rejected because packet 040 is the explicit human reconciliation boundary. Early acceptance would make the packet ceremonial and could still not truthfully implement CERT-001 dependencies.

### Put `RFC-XXXX` placeholders in future packets

Rejected because unresolved prose placeholders are forbidden by RFC-0855 and force weak executors to make an architectural choice during implementation.

### Rewrite the packet to the repository RFC id after materialization

Rejected because the spec node is the durable identity and the RFC number is a projection. Rewriting the governing identity adds avoidable packet churn and weakens traceability; sealing can resolve and bind both identities without replacing either.

## Risks

- **Late design discovery:** a CERT RFC is authored closer to execution. This is intentional freshness, bounded by the accepted spec, AMD-007, prior completions, and the full RFC governance pipeline.
- **Steward workload:** each CERT packet gains an explicit preparation phase. That cost is the required human/independent control boundary, not automatable ceremony.
- **Spec-reference ambiguity:** permissive strings could be misparsed. RFC-0856 must use closed patterns and exact repository lookup; unknown forms fail.
- **False readiness:** a node may be materialized while its program predecessor is incomplete even when its spec dependencies are satisfied. Packet sealing therefore requires both the spec front and the stricter program predecessor completion.
- **Agent role confusion:** an Executor may try to materialize its own governing RFC. Packet instructions and validation reject this; preparation belongs exclusively to the Steward.
- **Prepared-packet drift:** future packet facts may stale before use. JIT refresh and source-hash validation are mandatory before sealing.
- **Interrupted governance:** materialization and governance span multiple commits. Phase-aware leases, preparation reports, canonical resume, and explicit stale recovery prevent ambiguous restart or orphan acceptance.
- **Preparation contention:** two Stewards may race before sealing. The first live preparation lease is exclusive; all other starts fail until release or recorded timeout recovery.
- **False positives:** identity, bidirectional mapping, status, order, and hash checks have zero intended false positives and no suppression. A confirmed contract error requires normative correction.

## Acceptance criteria

- [ ] RFC-0855 planning distinguishes non-spec child RFC creation from JIT CERT materialization and cites RFC-0857 as the controlling amendment.
- [ ] RFC-0855 and RFC-0856 frontmatter contain reciprocal `amendedBy: RFC-0857` metadata while their accepted bodies remain unchanged.
- [ ] RFC-0856 planning defines repository-resolved generic qualified spec-node syntax and separate draft, preparation, sealed, active, and completion validation without adding a new command name.
- [ ] Draft packets 140–240 use exact `werkstatt-release-certification/CERT-NNN` governing references and contain no invented repository RFC ids.
- [ ] Every CERT packet requires a single phase-aware Steward preparation lease, `spec.status` front verification, `spec.materialize`, audit, enhance, plan, explicit acceptance, hash refresh, preparation report, independent sealing, and lease release before Executor start.
- [ ] Sealing accepts only a complete descendant preparation range from predecessor `baseCommit`, records every governance commit and changed file, and rejects unrelated paths or rewritten ancestry.
- [ ] Sealing requires one reciprocal `specRef`/`materializedAs` mapping to an accepted or implemented RFC whose `dependsOn` is the ordered de-duplicated union of effective spec dependencies and the preceding packet's resolved RFC, all implemented.
- [ ] Interrupted preparation resumes from the last canonical Steward commit or becomes blocked through a tracked recovery record; it never deletes materialization artifacts or rewrites history.
- [ ] AMD-007 remains proposed until packet 040 and no immutable specification snapshot is edited.
- [ ] No blocked spec node is manually created, no `materializedAs` is hand-edited, and no planning/bypass mode is added to `spec.materialize`.
- [ ] Requirements, technology, development-plan, knowledge-graph, verification-plan, and source-markup Compass projections describe JIT preparation; styling records a reviewed no-change rationale.
- [ ] `rfc.validate RFC-0857 --json`, affected RFC validation, spec validation, dependency validation, and clean-tree checks pass.

## Implementation notes for agents

- RFC-0857 is a normative amendment, not permission to edit accepted RFC-0855 or RFC-0856 in place.
- Agents MUST cite RFC-0857 wherever the original child-RFC wording of RFC-0855 or governing-decision wording of RFC-0856 would otherwise be read literally.
- Agents MUST NOT run `spec.materialize` for a blocked node or edit `forge-spec.yaml` manually.
- Agents MUST NOT accept AMD-007 as part of charter documentation work; packet 040 owns that explicit decision.
- The Program Steward MAY prepare a CERT packet only after its predecessor completion boundary is committed and the node is on the spec front.
- The Program Steward MUST acquire the packet's preparation lease at the exact predecessor completion commit before materialization or governance mutation.
- The Packet Executor MUST NOT materialize, audit, enhance, plan, accept, refresh, or seal its own governing CERT RFC.
- An Executor lease MUST NOT start while a preparation lease is live or before its committed preparation report and seal boundary validate.
- A qualified spec-node reference is not implementation authority. Sealing still requires an accepted or implemented materialized RFC and all direct dependencies implemented.
- Agents MUST derive JIT RFC `dependsOn`; they MUST NOT guess, omit, or replace dependencies with `related` references.
- Agents MUST continue interrupted preparation from canonical committed state or use recorded recovery; they MUST NOT reset, rebase, delete an orphan-looking RFC, or rerun materialization blindly.
- If the program sequence and effective spec front disagree, stop and amend the specification or program RFC; do not bypass either gate.
- Use `rfc.create` only for non-spec child RFCs. Use `spec.materialize` exclusively for CERT-002 through CERT-010.
