---
id: RFC-0864
title: "Establish the governed capability evolution controller"
status: draft
kind: architecture
scope: workspace
owners: [architecture]
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt: 2026-08-15
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related: [RFC-0855, werkstatt-release-certification/AMD-007]
dependsOn: [RFC-0863]
batch: agent-runtime-certification-program
satisfies: [DNA-51, DNA-53, DNA-64]
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: ["@warpgogol/werkstatt"]
successSignals:
  - "Every capability change is an immutable candidate with reproducible definition, evaluation, observation, and authority evidence"
  - "Shadow, canary, promotion, rollback, quarantine, and kill-switch transitions are forward-only and policy-admitted"
  - "The controller cannot modify its own Law Kernel, permissions, effect policy, or isolation boundary"
nonGoals:
  - "Do not permit self-amendment of governance, permissions, effect semantics, isolation, or certification policy"
  - "Do not make generated code authoritative before human or policy admission"
  - "Do not replace packet, RFC, release, deployment, or incident governance"
---

# RFC-0864: Establish the governed capability evolution controller

## Context

RFC-0863 provides immutable capability artifacts and a real sandbox. That is sufficient to execute an admitted artifact, but not to govern change over time. Packet 200 adds the controller that may propose and evaluate capability candidates while every authority-bearing transition remains constrained by the Law Kernel.

## Problem

Without a single transition model, an agent could mutate a live capability, promote on one attractive metric, hide regressions behind averages, or keep a harmful candidate active because rollback is ambiguous. Autonomous code generation is unsafe unless definition, testing, observation, promotion, rollback, and quarantine are separately evidenced and authority-checked.

## Decision

Werkstatt gains a governed capability evolution controller with the forward-only sequence `inspect → define immutable candidate → test → shadow → canary → observe → promote | rollback | quarantine`. Every candidate is content-addressed; every transition consumes explicit evidence and Law Kernel authority; rollback creates a new transition to a previously admitted artifact rather than rewriting history.

## Architectural fit

- **DNA-51:** all controller transitions are idempotent, resumable, transactional, and compensating.
- **DNA-53:** audit correlation spans proposal, artifact, evaluation, observation, authority, deployment, and outcome.
- **DNA-64:** replaceable capability artifacts cannot change engine-owned graph, lifecycle, policy, or isolation contracts.
- **RFC-0863:** candidates use only immutable artifacts and admitted sandbox providers.
- **RFC-0855:** the Law Kernel and packet program remain the non-replaceable control plane.

## Design

### CLI surface

No public command is standardized here. The controller is a package API driven by later accepted orchestration. Any operator-facing create/promote/rollback command requires its own command RFC and command-manifest update.

### TypeScript contracts

```ts
type EvolutionStage =
  | "defined"
  | "tested"
  | "shadowed"
  | "canary"
  | "promoted"
  | "rolled-back"
  | "quarantined";

interface CapabilityCandidateV1 {
  schema: "werkstatt/capability-candidate@1";
  candidateId: string;
  parentArtifactHash: string;
  artifactHash: string;
  intentHash: string;
  policyHash: string;
  stage: EvolutionStage;
}

interface EvolutionEvidenceBundleV1 {
  definition: DefinitionEvidenceV1;
  evaluation: EvaluationEvidenceV1;
  observation: ObservationEvidenceV1;
  authority: AuthorityEvidenceV1;
  artifact: ArtifactEvidenceV1;
}
```

The controller accepts an inspection snapshot and a bounded intent, creates exactly one immutable candidate artifact, and records its lineage. Candidate mutation is forbidden; a revision is a new candidate. Transition reducers validate expected current stage, evidence hashes, policy version, authority, idempotency key, and monotonic sequence.

Evidence is deliberately multi-layered:

1. **Definition:** intended behavior, scope, generated diff/source, constraints, lineage.
2. **Evaluation:** deterministic fixtures, conformance, security, performance, regression and differential results.
3. **Observation:** shadow/canary workload identity, exposure, duration, sample sufficiency, segmented metrics, incidents, novelty and uncertainty.
4. **Authority:** Law Kernel decision, actor/policy identity, allowed transition, expiry, kill-switch state.
5. **Artifact:** exact candidate/parent bytes, sandbox admission, dependencies, provenance and signatures.

Shadow receives real inputs only under privacy/redaction policy and cannot produce authoritative side effects. Canary receives narrowly bounded authority, population, time, budget, effects, and automatic abort thresholds. Promotion requires every mandatory layer to pass; missing, stale, contradictory, or statistically insufficient evidence blocks. A rollback activates a known admitted artifact via a new signed transition and preserves the failed lineage. Quarantine revokes activation and future transition eligibility pending a new authority decision. A kill switch terminates active candidates and denies new invocations independently of controller health.

The controller cannot propose or admit changes to Law Kernel rules, actor authority, permission schema, effect semantics, isolation contract/provider admission, canonical identity/diagnostic contracts, controller code, or evidence evaluator policy. Such changes require the normal human-governed RFC/program/release path.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/evolution/contracts.ts` | candidates, stages, evidence, decisions |
| `packages/werkstatt/src/evolution/reducer.ts` | monotonic transition reducer |
| `packages/werkstatt/src/evolution/controller.ts` | inspect/define/evaluate/observe orchestration |
| `packages/werkstatt/src/evolution/guards.ts` | Law Kernel, evidence, boundary, kill-switch checks |
| `packages/werkstatt/src/evolution/tests/**` | replay, race, poisoning, rollback and quarantine tests |

Candidate artifacts and run evidence use the stores established by earlier packets; live source trees are never the activation target.

### Output format

Each attempted transition returns candidate/parent/stage identities, previous and requested stage, all evidence hashes, authority and policy identity, observations and thresholds, decision (`admit | deny | incomplete`), diagnostic, transition record hash, and compensating action. Output is canonical, redacted, and append-only.

### Failure modes

| Condition | Result |
| --- | --- |
| Candidate/artifact/evidence hash changes | deny and quarantine |
| Stage, sequence, or idempotency conflict | return deterministic conflict; no mutation |
| Required evidence missing/stale/contradictory | incomplete; remain at current safe stage |
| Shadow attempts side effect | terminate and quarantine |
| Canary threshold, budget, or incident boundary crossed | automatic rollback/quarantine and kill switch as policy requires |
| Controller requests forbidden self-change | deny, security diagnostic, escalation |
| Controller crashes mid-transition | resume or compensate from durable transition record |

## Rollout

1. Implement contracts and pure transition reducer with exhaustive property tests.
2. Add candidate lineage, immutable evidence bundles, and fake sandbox/evaluator fixtures.
3. Run shadow-only trials with side effects denied.
4. Enable bounded canaries under manual authority and automatic aborts.
5. Permit policy-admitted promotion only after rollback, quarantine, kill-switch, crash recovery, and evidence-poisoning exercises pass.

## Alternatives considered

### Let an agent edit a live capability in place

Rejected because mutable activation destroys review identity, reproducibility, and rollback evidence.

### Promote from deterministic tests alone

Rejected because runtime novelty, distribution shifts, latency, costs, privacy, and side effects require bounded observation.

### Let the controller evolve governance and isolation

Rejected because a replaceable capability must not expand its own authority or redefine its evaluator.

## Risks

- **Metric gaming:** multi-layer evidence, segmented thresholds, independent evaluators, and non-overridable safety gates.
- **Evidence poisoning:** immutable provenance, identity binding, differential evaluators, and contradiction checks.
- **Canary harm:** minimum exposure, bounded effects/budget/time, automatic abort, quarantine, and kill switch.
- **Rollback illusion:** rollback is exercised, evidence-bearing, and activates previously admitted immutable bytes.
- **Controller capture:** self-change boundary is structural and enforced outside the controller.
- **Operational complexity:** one explicit reducer and canonical evidence bundle replace hidden mutable workflow state.

## Acceptance criteria

- [ ] Candidate and evidence schemas are strict, immutable, content-addressed, lineage-bound, and reject unknown or contradictory fields.
- [ ] A pure reducer enforces the declared forward-only stages, idempotency, sequence checks, replay safety, and explicit compensating transitions.
- [ ] Test, shadow, canary, observation, promotion, rollback, quarantine, and kill-switch behaviors have deterministic, crash, race, poisoning, and threshold tests.
- [ ] Shadow cannot create authoritative effects; canary authority is bounded by population, time, budget, effect, policy, and automatic abort thresholds.
- [ ] Promotion requires passing definition, evaluation, observation, authority, and artifact evidence; missing or stale evidence cannot be waived.
- [ ] The controller cannot change Law Kernel, permissions, effect/isolation contracts, canonical identities/diagnostics, controller code, or evaluator policy.
- [ ] Rollback and quarantine preserve append-only lineage and exact artifact/evidence identity.
- [ ] Scoped tests/build, RFC/Compass validation, secret scan, and clean-tree verification pass.

## Implementation notes for agents

- Implement only after acceptance and a sealed packet 200.
- Never mutate a candidate or live artifact; define a new content-addressed candidate.
- Never treat generation, tests, shadow, or canary as promotion authority on its own.
- Never bypass incomplete evidence, automatic abort, quarantine, or the kill switch.
- Never allow the controller or candidate to modify its governing policy, isolation, permissions, evaluator, or Law Kernel.
- If required evidence or authority is unavailable, remain at the current safe stage and return `incomplete`.
