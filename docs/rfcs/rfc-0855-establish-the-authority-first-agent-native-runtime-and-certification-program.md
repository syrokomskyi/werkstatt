---
id: RFC-0855
title: "Establish the authority-first agent-native runtime and certification program"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
implementedAt:
closedAt:
supersedes:
  - RFC-0770
supersededBy:
amends:
  - RFC-0769
amendedBy: []
related:
  - RFC-0848
  - RFC-0849
  - RFC-0850
  - RFC-0851
  - RFC-0852
  - RFC-0853
  - RFC-0854
  - werkstatt-release-certification/overview#target-architecture
  - werkstatt-release-certification/roadmap#implementation-roadmap
  - werkstatt-release-certification/ADR-003
  - werkstatt-release-certification/ADR-005
dependsOn: []
batch: agent-runtime-certification-program
satisfies:
  - DNA-51
  - DNA-52
  - DNA-53
  - DNA-59
  - DNA-64
  - DNA-73
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt-game"
  - "@warpgogol/werkstatt-video"
  - "@warpgogol/forge"
successSignals:
  - "One program index defines the only permitted implementation order from Node 24 through combined runtime/certification cutover and cleanup."
  - "Every implementation packet is self-contained, hash-bound, file-bounded, sequential, and executable by an agent with no prior-session memory."
  - "The protected Law Kernel exists and is independently authoritative before any agent-written component can activate outside a conformance harness."
  - "Every certified release binds the exact immutable resolved component set that produced and evaluated it."
  - "The static one-plugin/five-hook runtime and the legacy release authority are removed in one forward-only program with no compatibility path."
  - "The sole site completes one combined certified runtime cutover before post-cutover cleanup begins."
nonGoals:
  - "This charter does not implement runtime, certification, sandbox, deployment, monitoring, cutover, or cleanup code."
  - "This charter does not authorize production activation of agent-written or third-party code."
  - "This charter does not replace accepted release-certification semantics; a spec amendment changes only their static composition seam and program ordering."
  - "This charter does not adopt Cordis or DeepSeek Harness as a production dependency."
  - "This charter does not preserve a working legacy deployment path during the transition."
  - "This charter does not permit arbitrary failing builds, tests, schemas, or validators between packets."
---

# RFC-0855: Establish the authority-first agent-native runtime and certification program

## Context

RFC-0769 extracted the Werkstatt engine from the site stack, and RFC-0770 implemented `werkstatt/plugin@1`: exactly one static stack plugin, five closed hooks, fixed module loaders, and no lifecycle-owned unregister operation. That boundary completed the engine consolidation successfully, but it is not an agent-native runtime. `KernelModule.register()` adds process-lifetime entries, `KernelRegistry` has no symmetric removal, `registry-cache.ts` retains the result, and `tools/kernel.config.ts` remains the static composition authority. The plugin hooks are coarse, optional, and mostly disconnected from runtime execution.

The accepted `werkstatt-release-certification` specification independently designs the trust substrate needed for reliable evolution: immutable candidate identity, canonical bytes, append-only dossiers, deterministic fail-closed evaluation, a separate Certification Authority, durable evidence, deployment authorization, rollback, continuous health, action packs, and independent evaluator agents. Its static seam still assumes the RFC-0770 model: one active plugin supplies a profile and registered producers through a boot-time registry.

The exploration in `docs/explorations/agent-native-spatiotemporal-runtime.md` established that implementing certification unchanged and then replacing the runtime would create two major cutovers and freeze permanent certification `@1` identities around a component model already known to be temporary. Discarding certification and enabling dynamic code first would be worse: self-extension would exist before independent admission, evidence, isolation, rollback, or promotion authority.

This RFC is the superordinate program charter that reconciles both programs. It preserves the accepted certification truth model, replaces only its static composition seam, and makes certification the first production workload of a new agent-native component runtime. The implementation is deliberately prepared for less capable agents: one packet runs at a time, each packet assumes a fresh context, and no packet may rely on implicit architectural reconstruction.

## Problem

The current and proposed architectures disagree at the exact boundary where permanent identity and authority are about to be implemented:

1. **Static registration has no lifecycle owner.** Commands, pipelines, adapters, and listeners are added to mutable registries without disposers, dependency-aware draining, or transactional replacement.
2. **The plugin is the wrong runtime unit.** One monolithic stack plugin with five hooks cannot express many independently replaceable producers, validators, evaluators, deploy adapters, schedulers, tools, and prompt surfaces.
3. **Dynamic import is not dynamic composition.** A fixed `moduleLoaders` map loaded into a process-lifetime cache cannot reconcile desired state or react to providers appearing and disappearing.
4. **Certification identity would freeze the wrong graph.** RFC-0853 currently binds `pluginId`, `pluginVersion`, `profileId`, and `profileHash`, but not the exact immutable component set that produced and judged a release.
5. **Release and capability evolution can be conflated.** A site release candidate and a candidate version of the runtime are different subjects, even though they need shared identity, evidence, evaluation, storage, promotion, and rollback primitives.
6. **Agent-written activation would be unsafe.** Capability declarations and `node:vm` do not isolate code. The running agent must not redefine the authority, evidence, permissions, or test used to approve itself.
7. **Large RFCs are unsafe execution units.** RFC-0848 already required repeated decomposition after audits found multiple independent blast radii. A weaker agent needs exact inputs, owned files, validation results, and handoff conditions rather than a broad architectural narrative.
8. **Two cutovers would multiply risk.** A static-certification cutover followed by a runtime cutover would repeat deployment unavailability, identity migration, generated-surface rewrites, and clean-up work.

Without one program authority, agents can implement individually plausible pieces that produce two registries, two candidate concepts, incompatible hashes, partial lifecycle behavior, or a self-extension surface that becomes active before its safety boundary.

## Decision

Werkstatt performs one authority-first, forward-only program that replaces `werkstatt/plugin@1` with an engine-owned graph of immutable versioned components, uses the Release Certification System as the first production consumer and protected promotion authority, and completes one combined runtime/certification cutover before enabling agent-written production activation or cleanup.

The program has one protected **Law Kernel**, one dynamic **capability plane**, and one **evolution controller**:

```text
Law Kernel (not replaceable by a running component)
  identity · grants · sandbox admission · locks · activation transaction
  authoritative append · certification · promotion · deployment authorization
  rollback · quarantine · kill switch · audit/Bordbuch integrity
                                  |
                                  v
Dynamic capability plane
  commands · pipelines · validators · producers · evaluators · adapters
  probes · schedulers · tools · prompts · each with provide/require/effects
                                  |
                                  v
Evolution controller
  inspect -> define immutable candidate -> test -> shadow -> canary
          -> observe -> promote or rollback/quarantine
```

### Program laws

1. **Authority precedes evolution.** Agent-written production activation is impossible until every required Law Kernel, sandbox, evidence, rollback, quarantine, and kill-switch control is operational and verified.
2. **The Law Kernel cannot approve a replacement for itself.** Its closed boundary changes only through an accepted RFC and ordinary platform release, never through a capability candidate.
3. **Composition is a resolved immutable graph.** One stack profile remains the workshop identity, but it resolves to a versioned `ResolvedComponentSet`, not exactly one monolithic runtime plugin.
4. **Every registration is lifecycle-owned.** A component owns every registration and acquired resource; unloading drains dependents, waits for quiescence, and unwinds effects deterministically.
5. **Dependencies are versioned capabilities.** Components declare namespaced provides/requires with compatibility or schema identity. Bare string service keys are insufficient.
6. **Effects use a closed four-class model.** Every effect is `revertible`, `transactional`, `compensatable`, or `irreversible-emission`; unknown or misclassified effects block activation.
7. **Release and capability candidates remain distinct.** They share generic identity/evidence/promotion primitives but never share one schema or lifecycle.
8. **Every release binds runtime identity.** A release certificate records the exact `resolvedComponentSetHash`; runtime-dependent evidence becomes stale when the set changes.
9. **Untrusted code is never in-process.** Trusted pinned first-party components may run in-process. Agent-written and third-party components require a provider-neutral, deny-by-default sandbox capability bridge. `node:vm`, `worker_threads`, and an ordinary subprocess are not security boundaries.
10. **Unknown never becomes success.** Missing dependencies, invalid graphs, unavailable authority, late evidence, sandbox failure, unknown effects, and inconclusive evaluation are explicit non-pass states.
11. **The program is fully sequential.** No implementation packet is parallelized. One agent completes, verifies, commits, and hands off one packet before the next begins.
12. **Transition breakage is bounded.** Product runtime and deployment may remain unavailable until the program completes. Each packet must still compile and pass its declared checks; only enumerated transition diagnostics may remain.
13. **No compatibility surface survives.** There is no dual registry, dual-read/dual-write, plugin-to-component adapter, legacy deployment authority, permissive grace path, or automatic migration of old evidence.
14. **Cordis is reference material only.** Its lifecycle and composability semantics inform conformance scenarios; Werkstatt owns its runtime contracts and has no Cordis production dependency.

### Law Kernel boundary

The Law Kernel owns exactly:

- canonical and immutable candidate, component-set, policy, evidence, decision, and event identity;
- capability grants, permission attenuation, sandbox adapter admission, issuer registry, and workload identity;
- locks, idempotency, activation transaction, authority ordering, and immutable evaluation cuts;
- authoritative dossier/artifact append, durable-replica verification, and retention protection;
- Certification Authority, independent evaluator admission, deterministic promotion policy, and signed operation authorization;
- deployment commit authority, rollback coordination, quarantine, kill switch, incident state, and audit/Bordbuch integrity.

Commands, pipelines, validators, evidence producers, evaluator implementations, deploy adapters, probes, schedulers, agent tools, and prompt contributors remain replaceable components. They may propose results and request operations but cannot append authoritative decisions, grant themselves permissions, change their admission policy, or access authority/deployment credentials directly.

### Effect classes

| Class | Examples | Required contract |
|---|---|---|
| `revertible` | registration, listener, timer, lock, temporary file, child process | disposer, LIFO teardown, quiescence |
| `transactional` | local state, registry update, database write | prepare/commit/abort and idempotency key |
| `compensatable` | DNS change, remote mutation, deployment | explicit compensation and equivalence evidence |
| `irreversible-emission` | publish, email, external notification | withheld until commit boundary; never represented as rollback-safe |

A capability candidate that introduces a new external-effect type cannot be automatically promoted. Its effect policy requires a separate accepted architectural decision.

### Component lifecycle

The closed lifecycle is:

```text
declared -> waiting -> loading -> active -> draining -> unloading -> disposed
                     \-> failed                 \-> failed
declared/failed/active ----------------------------> quarantined
```

Provider replacement stops new calls, drains dependents in reverse topological order, completes or cancels in-flight work only at declared boundaries, unwinds effects in LIFO order, and activates the new resolved set transactionally. Failure restores the prior set or quarantines the candidate. Silent pending, force unload, partially active graphs, and unbounded drain are forbidden.

### Candidate separation

```ts
interface ResolvedComponentSetV1 {
  schema: "werkstatt/resolved-component-set@1";
  profileId: string;
  components: ResolvedComponentIdentityV1[];
  dependencyGraphHash: string;
  grantSetHash: string;
  effectPolicyHash: string;
  isolationPolicyHash: string;
  setHash: string;
}

interface ReleaseCandidateRuntimeBindingV1 {
  releaseCandidateId: string;
  resolvedComponentSetHash: string;
  certificationPolicyBundleRootHash: string;
}

interface CapabilityCandidateV1 {
  schema: "werkstatt/capability-candidate@1";
  candidateId: string;
  baseComponentSetHash: string;
  proposedComponentArtifactHash: string;
  proposedComponentSetHash: string;
  requestedGrantSetHash: string;
  effectDeclarationHash: string;
  isolationTier: "trusted-in-process" | "sandboxed";
}
```

These are architectural minimums, not permission for RFC-0855 implementation to add source types. Child contract RFCs must derive the complete strict schemas from the accepted specification and its amendment.

## Architectural fit

### RFC-0769 and DNA-64

RFC-0769 is amended, not discarded. The stack-agnostic engine and stack-profile identity remain. DNA-64 changes from “engine plus exactly one runtime plugin” to “engine plus exactly one stack profile resolving an immutable graph of independently lifecycle-managed components.” Engine-to-stack dependency inversion remains mandatory.

RFC-0770 is superseded in full. Its one-plugin registry, five closed hooks, optional neutral hook defaults, process-lifetime module registration, and warn-only transition are incompatible with the component graph. Useful path, module, pipeline, adapter, and invariant data is re-expressed as typed component capabilities, not wrapped in a compatibility adapter.

### DNA-51, DNA-52, DNA-53, and DNA-59

- DNA-51 locks, idempotency, and atomic staging become Law Kernel activation and authority primitives.
- DNA-52 content-addressed artifact storage stores both release and capability artifacts without conflating their schemas.
- DNA-53 remains the only fingerprint authority for canonical component-set and candidate identity.
- DNA-59 durable evidence becomes shared authority storage for release and capability dossiers while preserving distinct event unions.

### DNA-73 and deployment authority

Deployment remains per-site and sequential. Its authorization moves from command-local release state to a signed certification decision bound to the release candidate, resolved component set, dossier root, target, nonce, and expiry. External effects use transactional/compensatable semantics and remain unavailable until the authority-backed path is complete.

### Release-certification specification

All accepted release-certification decisions remain authoritative except their static RFC-0770 seam and roadmap parallelism. Before any architecture-dependent certification child is implemented, a new accepted spec amendment (expected `AMD-007`) must:

- replace “exactly one active plugin supplies the profile/producers” with “one active stack profile resolves versioned producer/evaluator/adapter capabilities from an exact component set”;
- add `resolvedComponentSetHash` to policy, candidate, evidence, decision, and authority bindings where runtime identity matters;
- keep `ReleaseCandidate` and `CapabilityCandidate` distinct over shared primitives;
- route producer/evaluator execution through lifecycle-managed capabilities;
- make the roadmap strictly sequential and combine CERT-009 with the component-runtime cutover;
- preserve ADR-001 through ADR-020 and AMD-001 through AMD-006 unless the amendment explicitly identifies a direct contradiction.

The immutable snapshot files are never edited. Only `docs/specs/werkstatt-release-certification/amendments/**` and permitted `forge-spec.yaml` projection fields may change under the spec amendment process.

## Design

### CLI surface

RFC-0855 adds, changes, and removes no command. Child RFCs own every executable command and must update `docs/command-manifest.generated.yaml` through `command.manifest.generate` whenever their source changes.

The program-level operator surface is initially the checked-in program index and packet set under:

```text
docs/plans/agent-runtime-certification/
  README.md
  packet-template.md
  000-node-24.md
  010-canonical-json.md
  ...
  230-cleanup.md
```

The charter implementation creates these planning artifacts only after child RFC IDs and exact dependencies exist. A later governance RFC may introduce a generic validator command; this charter does not invent an unimplemented command name.

### Program sequence

The following order is normative. A row may be split further during audit if one packet cannot be completed safely in one fresh-agent session; rows may not be combined, reordered, or parallelized without amending this RFC and the program index.

| Order | Packet | Governing document | One-session responsibility | Completion boundary |
|---:|---|---|---|---|
| 000 | Node 24 runtime | RFC-0854 | closed Node 24 ecosystem cutover and required site republish | all RFC-0854 checks and Alt/Main smoke pass |
| 010 | Canonical identity bytes | RFC-0849 | bounded canonical JSON snapshot/bytes/hash | frozen vectors, limits, build, tests pass |
| 020 | Canonical Diagnostic | RFC-0852 | engine-owned strict Diagnostic cutover | engine/site compile; legacy aliases absent |
| 030 | Specification reconciliation | release-certification AMD-007 | component-set identity, capability execution, linear roadmap, combined cutover | `spec.validate` passes and amendment is accepted |
| 040 | Component and capability contracts | new child RFC | strict component manifest, versioned provide/require, grants, effect declarations, scopes, resolved-set identity | schema, identity, bounds, negative fixtures pass |
| 050 | Fiber and effect runtime | new child RFC | lifecycle state machine, effect ownership, drain/cancel/quiescence, activation transaction | exhaustive state/effect tests pass |
| 060 | Resolution and reconciliation | new child RFC | deterministic dependency resolution, desired-state diff, immutable resolved sets, rollback to prior set | property/stress/reconciliation tests pass |
| 070 | Reflection and conformance harness | new child RFC | live filtered capability catalog and test-only temporary component execution | no production activation surface exists |
| 080 | Isolation contract | new child RFC | provider-neutral sandbox adapter, deny-by-default RPC, grant attenuation, adversarial conformance | ordinary process/vm adapters rejected as security tier |
| 090 | Certification contracts and identities | enhanced RFC-0853 | revise strict contracts for resolved component sets and distinct release/capability candidates | traceability and identity sensitivity pass |
| 100 | Deterministic evaluation | enhanced RFC-0850 | shared bounded selection, evaluation, action packs, dossier hashing | max-size and algebraic properties pass |
| 110 | Forward-only state reset | enhanced RFC-0851 | artifact/operation separation and truthful transition block | only enumerated transition diagnostics remain |
| 120 | Foundation integration | enhanced RFC-0848 | public-API integration across runtime identity, certification identity, evaluation, and state | cross-module integration suite passes |
| 130 | Resolved certification profile | materialized CERT-002 RFC | Law-Kernel-owned immutable policy resolves exact component capabilities | invalid/missing capability graph fails activation |
| 140 | Authority and durable storage | materialized CERT-003 RFC | signed Certification Authority, authoritative append, storage, issuer and retention boundaries | forged/replayed/corrupt/crash cases pass |
| 150 | Certification orchestration | materialized CERT-004 RFC | orchestrator executes through lifecycle capabilities with locks/resume/cuts | no direct static command/module lookup remains |
| 160 | Deterministic site producers | materialized CERT-005 RFC | first trusted production component graph and false-pass removal | all profile dimensions have admitted producers |
| 170 | Independent evaluators | materialized CERT-006 RFC | isolated evaluator capability, risk routing, consensus, held-out inputs | self-review/leak/disagreement cases are non-pass |
| 180 | Capability artifact and sandbox implementation | new child RFC | immutable package store plus first real sandbox provider and capability bridge | sandbox escape/credential/permission tests pass |
| 190 | Evolution controller | new child RFC | inspect/define/test/shadow/canary/observe/promote/rollback/quarantine/kill-switch | no promotion without four-layer evidence |
| 200 | Deployment effect authority | materialized CERT-007 RFC | signed external-effect authorization, Main verification, compensation/rollback | injected failures never produce false Main success |
| 210 | Continuous health and demotion | materialized CERT-008 RFC | monitoring windows, health, capability demotion and incident response | stale/late/shared-outage cases are deterministic |
| 220 | Combined cutover | revised CERT-009 RFC | re-author static modules as components, certify exact set, republish sole site, remove old registry/plugin path | new Main and runtime identities agree; rollback proven |
| 230 | Cleanup | revised CERT-010 RFC | delete only proven-obsolete runtime, release, mission, and compatibility artifacts | plan-bound cleanup report and retained audit pass |

RFC-0854, RFC-0849, and RFC-0852 remain no-regret prerequisites. RFC-0848, RFC-0850, RFC-0851, and RFC-0853 retain their IDs and useful work but are enhanced against RFC-0855 and AMD-007; no duplicate RFCs are created for the same responsibility.

### Weak-agent packet contract

Every packet is written for a fresh agent with no conversation history. It must contain all fields below:

```yaml
schema: werkstatt/program-packet@1
program: RFC-0855
packetId: "NNN-kebab-name"
governingRfc: RFC-XXXX
dependsOnPacket: "NNN-prior-packet"
prerequisiteCommit: "<exact reachable commit>"
normativeSources:
  - path: "<path>"
    sha256: "<digest>"
allowedFiles: ["<exact path or narrow glob>"]
forbiddenFiles: ["<explicit boundary>"]
permittedTransitionDiagnostics: ["<stable id>"]
```

The Markdown body must then provide, in this exact order:

1. objective and explicit non-goals;
2. prerequisite status/commit checks;
3. mandatory reads and exact normative anchors;
4. current code facts with paths and symbols verified when the packet was prepared;
5. allowed and forbidden file boundaries;
6. ordered implementation steps with no hidden branch;
7. exact validation commands and expected status/diagnostic counts;
8. allowed transition failures and the later packet that removes each one;
9. rollback/recovery from the last canonical commit;
10. completion-report template and handoff gate.

`NEEDS CLARIFICATION`, a source hash mismatch, a missing prerequisite commit, an unexpected dirty tree, a change outside `allowedFiles`, or an unlisted non-pass result blocks mutation and returns the packet for preparation. An implementing agent must not update its own packet to authorize unexpected work.

### Completion report

Each packet finishes with a committed report shaped as:

```json
{
  "schema": "werkstatt/program-packet-completion@1",
  "program": "RFC-0855",
  "packetId": "NNN-kebab-name",
  "prerequisiteCommit": "<sha>",
  "implementationCommit": "<sha>",
  "changedFiles": ["<path>"],
  "validations": [
    { "command": "<exact command>", "status": "pass", "evidence": "<safe locator or digest>" }
  ],
  "remainingTransitionDiagnostics": ["<allowed id>"],
  "unexpectedDiagnostics": [],
  "rollbackVerified": true,
  "cleanTrees": true,
  "nextPacketReady": true
}
```

The report is evidence, not authority. The next agent independently verifies commits, hashes, statuses, and clean trees before relying on it.

### Capability promotion contract

A capability candidate cannot promote until all of the following are admitted by the authority:

1. deterministic conformance suite;
2. held-out scenarios unavailable to the authoring agent;
3. regression comparison against the current component set;
4. independent evaluator-agent evidence;
5. shadow execution;
6. bounded canary activation;
7. a policy-defined observation window.

Any `fail`, `stale`, `incomplete`, authority outage, isolation failure, missing independence, or unknown outcome rolls back or quarantines. Automatic promotion is limited to a pre-accepted policy. Requested permission changes, Law Kernel changes, isolation-tier changes, and new external-effect types always require a separate architectural decision.

### File system responsibilities

| Path | Responsibility |
|---|---|
| `docs/rfcs/rfc-0855-*.md` | program laws, sequence, packet contract, and completion definition |
| `docs/specs/werkstatt-release-certification/amendments/amd-007-*.md` | accepted reconciliation of static certification seam; immutable snapshot remains untouched |
| `docs/rfcs/rfc-0848-*.md` through `rfc-0854-*.md` | preserved/enhanced prerequisite and CERT-001 documents |
| future child RFCs with `batch: agent-runtime-certification-program` | independently accepted executable decisions for packets 040–230 |
| `docs/plans/agent-runtime-certification/README.md` | sole packet order, current prerequisite commit, and handoff state |
| `docs/plans/agent-runtime-certification/packet-template.md` | canonical self-contained weak-agent packet structure |
| `docs/plans/agent-runtime-certification/NNN-*.md` | exact execution packets and completion reports |
| `docs/architecture-dna.md` | successor DNA-64 wording and preserved authority/evidence invariants |
| `AGENTS.md`, `packages/AGENTS.md`, package-local `AGENTS.md` | active transition, package ownership, and no-bypass instructions |
| root Compass XML | runtime, authority, relationship, rollout, and verification truth as packets implement it |
| generated command/ecosystem documents | regenerated from owners when child code changes registered surfaces |

RFC-0855 itself edits only governance documents during charter implementation. It does not edit source, mirrors, mission workpieces, provider state, credentials, dossiers, or deployed sites.

### Output format

The charter has no runtime JSON output. Its machine-consumable outputs are the packet YAML frontmatter and the completion report above. Pretty prose must not contradict those fields; if they differ, execution stops and the packet is repaired by its preparer.

### Failure modes

| Failure | Required result |
|---|---|
| Packet prerequisite RFC is not implemented or commit is not reachable | stop before mutation |
| Normative source hash differs | stop; re-audit and regenerate packet |
| `NEEDS CLARIFICATION` remains | stop; return to architecture preparation |
| Agent needs a file outside the allow-list | stop; revise governing RFC/packet, never self-expand scope |
| Declared validation has unexpected non-pass | stop; repair within packet or return for redesign |
| Only listed transition diagnostics remain | handoff may proceed if every other check passes |
| Law Kernel or spec contradiction appears | new RFC/spec amendment before code |
| Missing/invalid sandbox for untrusted code | production activation remains disabled |
| Authority/evidence/promotion is unavailable or inconclusive | `incomplete`; never local fallback or pass |
| Rollback cannot restore the prior set | quarantine, kill switch, critical incident; no success claim |

## Rollout

1. Accept and implement RFC-0855 as a documentation charter: accept AMD-007, revise DNA-64/active agent guidance, create every child RFC, and prepare the complete program index and packet set.
2. Execute packets 000 through 230 exactly in order, one fresh agent and one canonical handoff at a time. No parallel implementation or integration is permitted.
3. Allow the repository runtime and site deployment surface to be intentionally unavailable during the transition. Preserve the currently serving Main artifact until the combined cutover, but do not preserve an executable legacy authority in code.
4. Require each packet's scoped builds/tests/contracts to pass. Only explicitly listed transition diagnostics may remain between packets.
5. Keep agent-written code test-harness-only through packet 170. Packet 180 must provide a real certified sandbox, and packet 190 must provide the complete promotion/demotion loop before any production activation is possible.
6. Make release certification the first production component graph in packets 130–170. This proves lifecycle, dependency, timeout, cancellation, unload, quarantine, and evidence admission before general evolution.
7. Restore deployment only through packet 200's authority-backed effect path. Packet 220 performs one combined runtime and certification cutover and proves rollback.
8. Run cleanup only after the new Main release, exact component set, durable dossier, current health, rollback target, and cutover marker all agree.

The charter implementation and the whole program are different milestones. Implementing RFC-0855 means the architecture, spec amendment, child RFC graph, and packets are complete and validated. The program is complete only after packet 230 and all child RFCs are implemented.

## Alternatives considered

### Implement release certification unchanged, then replace the runtime

Rejected because RFC-0853 would freeze the static plugin identity into permanent schemas, CERT-004 would execute through a registry scheduled for deletion, and the system would undergo two large cutovers.

### Enable dynamic self-extension before certification

Rejected because the running agent could create code before independent authority, immutable evidence, sandbox admission, rollback, and kill-switch controls existed.

### Use Cordis as the production runtime

Rejected. Cordis provides valuable lifecycle semantics but does not model Werkstatt's four external-effect classes, protected authority, release/capability identity, or cross-platform/provider-neutral isolation boundary. Depending on its moving API would add a second adaptation problem for weaker agents.

### Keep `werkstatt/plugin@1` and add reversible registrations around it

Rejected because the monolithic static plugin and fine-grained dynamic graph would become competing composition authorities. The five-hook contract would continue to hide dependencies and external effects.

### One monolithic implementation RFC

Rejected by the operator. A single document cannot be safely implemented by a fresh less-capable agent without silently crossing package, trust, identity, storage, deployment, and migration boundaries.

### Parallelize independent packets

Rejected even where a graph permits it. Lower elapsed time is not worth nondeterministic ownership, stale source hashes, interleaved commits, and ambiguous handoff evidence.

### Keep the old deployment path working until final cutover

Rejected by the operator. Temporary operational unavailability is accepted. Maintaining dual authority would add compatibility code and weaken the forward-only transition.

### Treat any red build as acceptable transition breakage

Rejected. Only known, enumerated operational diagnostics may remain. Arbitrary type, test, schema, state, or validator failures destroy the packet handoff contract.

## Risks

- **Program size:** the sequence is long. Mitigation: no packet may absorb adjacent responsibility; every packet is hash-bound and independently verified.
- **Prepared packet drift:** code or normative documents may change after preparation. Mitigation: exact prerequisite commits and source hashes block stale execution.
- **Premature evolution:** an agent may expose define/run commands before authority. Mitigation: no production activation surface before packets 180–190; conformance execution is test-only.
- **Law Kernel scope creep:** ordinary functionality may be declared protected for convenience. Mitigation: the closed boundary in this RFC; additions require a superseding RFC.
- **Sandbox theatre:** subprocess, worker, or `node:vm` may be mislabeled isolation. Mitigation: explicit rejection and adversarial adapter certification.
- **Effect misclassification:** external mutations may be modeled as reversible. Mitigation: closed classes, admission rejection, and separate policy for new effect types.
- **Identity collision between release and capability candidates:** mitigated by distinct literal schemas and explicit identity builders over shared primitives.
- **False green from old infrastructure:** validators, Axiom archives, adapters, and tests remain non-authorizing until admitted through the authority.
- **Long operational outage:** accepted by the operator. It must remain visible through exact transition diagnostics and may not justify a legacy fallback.
- **Agent self-expands scope:** mitigated by file allow-lists and a rule that only packet preparation—not the implementing agent—may revise them.
- **Spec drift:** mitigated by mandatory AMD-007 before architecture-dependent certification work and `spec.validate` in every affected packet.
- **False positives:** required identity, graph, effect, sandbox, and authority failures have zero intended false positives and no suppression. A confirmed contract defect is corrected normatively; it is never converted to pass.

## Acceptance criteria

- [ ] AMD-007 is accepted and `spec.validate --spec=werkstatt-release-certification --json` passes without editing immutable snapshot files.
- [ ] RFC-0769 is formally amended, RFC-0770 is formally superseded, and DNA-64 states the stack-profile-to-resolved-component-graph boundary.
- [ ] RFC-0848, RFC-0850, RFC-0851, and RFC-0853 are enhanced against RFC-0855/AMD-007 without duplicating RFC-0854, RFC-0849, or RFC-0852.
- [ ] Every new child RFC required by packets 040–230 exists in `draft`, uses `batch: agent-runtime-certification-program`, declares direct `dependsOn`, and has no unresolved duplicate responsibility.
- [ ] `docs/plans/agent-runtime-certification/README.md`, `packet-template.md`, every packet, and every completion-report template exist with exact sequential order and no parallel path.
- [ ] Every packet contains prerequisite commit, normative source hashes, required reads, current code facts, allowed/forbidden files, ordered steps, exact expected validations, permitted transition diagnostics, recovery, and handoff fields.
- [ ] No packet contains `NEEDS CLARIFICATION`, an unbounded file scope, permission to update its own allow-list, a compatibility path, or production agent-written activation before packets 180–190.
- [ ] Root and package AGENTS guidance records full sequential execution, accepted operational unavailability, bounded transition diagnostics, Law Kernel ownership, and no self-authorization.
- [ ] Relevant requirements, technology, development-plan, knowledge-graph, verification-plan, and source-markup Compass contracts describe the program; styling records a reviewed no-change rationale rather than unrelated edits.
- [ ] `rfc.validate` passes for RFC-0855 and every child draft, `spec.validate` passes, all referenced RFC dependencies resolve, and `bash scripts/check-clean-trees.sh` reports clean trees.

## Program completion definition

The program is complete only when packets 000–230 and every governing RFC are implemented; the old plugin/registry and legacy deployment authority are absent; agent-written activation is sandboxed and authority-gated; the sole site is certified against the exact new component-set hash in Main with current health and proven rollback; cleanup has a plan-bound successful report; and every active/generated documentation surface agrees with the executable system.

## Implementation notes for agents

- Implement RFC-0855 only after `status: accepted`; this draft grants no source-code authority.
- Charter implementation is document-only. It prepares AMD-007, child RFCs, DNA/AGENTS/Compass changes, program index, and packets; it does not implement child code.
- Execute one packet at a time with one fresh agent. Do not parallelize even when dependency analysis suggests independence.
- Before any packet mutation, verify the exact prerequisite commit, every normative source hash, every required RFC status, and clean trees. Any mismatch stops the packet.
- Never widen `allowedFiles`, suppress a diagnostic, edit a packet's prerequisites, or invent a compatibility layer from inside an implementation packet.
- Operational unavailability is permitted; arbitrary broken compilation, tests, schemas, state, or validators are not. Only enumerated transition diagnostics may cross a handoff.
- Do not use Cordis as a dependency, `node:vm`/worker/subprocess as an untrusted security boundary, or capability declarations as proof of isolation.
- Do not let a component write authoritative dossiers, sign decisions, access deployment credentials, grant itself capabilities, alter promotion thresholds, or change Law Kernel code.
- Keep release and capability candidate schemas, dossiers, and lifecycles distinct. Share only explicitly generic primitives.
- Follow removal discipline before deleting the static plugin/registry or legacy deployment code. Intentional removal is authorized only by the governing child RFC and occurs in its designated packet.
- Update source owners before generated projections, run `command.manifest.generate` for changed command source and `ecosystem.manifest.generate` for changed ecosystem surfaces, and never hand-edit generated files.
- If a spec contradiction appears, stop and create an accepted amendment. If a DNA conflict appears, use `rfc.supersede.propose`; do not weaken the invariant locally.
- Use `ecosystem.commit` for platform changes and `mission.git.commit` for workpiece changes. Raw `git commit` is forbidden.
- Before claiming any packet complete, inspect the full diff of every touched file, run all packet validations, commit, verify `git status`, emit the completion report, and run `bash scripts/check-clean-trees.sh`.
