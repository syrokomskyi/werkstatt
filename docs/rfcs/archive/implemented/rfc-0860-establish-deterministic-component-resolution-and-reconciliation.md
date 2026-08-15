---
id: RFC-0860
title: "Establish deterministic component resolution and reconciliation"
status: implemented
kind: architecture
scope: workspace
owners: [architecture]
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt: 2026-08-15
implementedAt: 2026-08-15
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related: [RFC-0855, werkstatt-release-certification/AMD-007]
dependsOn: [RFC-0858, RFC-0859]
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
  - "The same profile inputs always resolve to one canonical component graph and set hash"
  - "Desired-state changes produce a deterministic bounded reconciliation plan"
  - "Failed activation restores the prior exact set or quarantines without partial activity"
nonGoals:
  - "Do not implement artifact sandboxing, certification policy, or capability promotion"
  - "Do not discover arbitrary packages from node_modules or the network"
  - "Do not retain dual plugin/component composition"
---

# RFC-0860: Establish deterministic component resolution and reconciliation

## Context

RFC-0858 defines component/capability identities and RFC-0859 defines lifecycle/effect execution. A production runtime still needs one deterministic authority that converts a stack profile's desired component declarations into a compatible immutable graph, compares it with the active graph, and drives the lifecycle transaction without partial activation.

## Problem

Naive registration order, package-manager traversal, object iteration, opportunistic “latest” versions, or best-effort missing dependencies make graph identity host-dependent. A weak agent could also conflate graph calculation with mutation, activate providers before dependents are ready, or silently keep old providers as compatibility fallbacks.

## Decision

Werkstatt gains a pure deterministic resolver and a single engine-owned desired-state reconciler. Resolution produces either one canonical `ResolvedComponentSetV1` plus proof or a closed failure; reconciliation computes one ordered plan from current to desired set and executes it transactionally through RFC-0859.

## Architectural fit

- **DNA-51:** one lock/idempotency boundary and staged activation prevent concurrent partial mutation.
- **DNA-53:** canonical resolved-set identity comes exclusively from RFC-0858/fingerprint authority.
- **DNA-64:** the engine resolves one profile-selected graph; stack packages provide declarations only.
- **AMD-007:** certification consumes the exact resulting `setHash`.

## Design

### CLI surface

No production command. Packet 070 exposes internal resolver/reconciler APIs. Read-only reflection and governed evolution commands are owned by later RFCs.

### TypeScript contracts

```ts
interface ResolutionInputV1 {
  profileId: string;
  desired: ComponentManifestV1[];
  availableArtifacts: ComponentArtifactIndexV1;
  admittedGrants: AdmittedGrantSetV1;
  effectPolicyHash: string;
  isolationPolicyHash: string;
}

type ResolutionResultV1 =
  | { status: "resolved"; set: ResolvedComponentSetV1; proof: ResolutionProofV1 }
  | { status: "blocked"; violations: ResolutionViolationV1[] };

interface ReconciliationPlanV1 {
  schema: "werkstatt/reconciliation-plan@1";
  currentSetHash: string;
  desiredSetHash: string;
  stopNewCalls: ComponentId[];
  drain: ComponentId[];
  unload: ComponentId[];
  load: ComponentId[];
  activate: ComponentId[];
  planHash: string;
}
```

Resolution rules:

1. validate every manifest/artifact/grant/policy identity;
2. select only explicitly desired, locally available, policy-admitted versions;
3. match every required capability by namespace, compatibility, and schema identity;
4. reject zero/multiple providers unless a contract explicitly selects one deterministic provider;
5. reject cycles unless a future accepted contract defines a cycle-safe capability (none in `@1`);
6. topologically order with canonical component-ID tie-breaking;
7. compute graph/set identities through RFC-0858.

Reconciliation is a pure diff followed by one RFC-0859 activation transaction. Dependents stop/drain/unload before providers; providers load/activate before dependents. An unchanged `setHash` is a typed no-op. Drift between active observation and declared current set blocks mutation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/component-runtime/resolver.ts` | pure compatibility and graph resolution |
| `packages/werkstatt/src/component-runtime/reconciliation.ts` | pure diff plus transaction orchestration |
| `packages/werkstatt/src/component-runtime/resolution-proof.ts` | bounded proof/diagnostics |
| `packages/werkstatt/src/component-runtime/tests/resolver*.test.ts` | vectors/property/negative tests |
| `packages/werkstatt/src/component-runtime/tests/reconciliation*.test.ts` | failure/race/rollback stress tests |

### Output format

Resolution/reconciliation results include input/set/plan identities and ordered violations. They never include executable artifacts, secrets, or ambiguous “pending” states. Pretty formatting is outside this RFC.

### Failure modes

| Condition                                | Result                                 |
| ---------------------------------------- | -------------------------------------- |
| Missing/incompatible/ambiguous provider  | blocked before lifecycle mutation      |
| Dependency cycle                         | blocked with exact cycle path          |
| Artifact/grant/effect/isolation mismatch | blocked                                |
| Active-set drift or concurrent reconcile | blocked                                |
| Drain/load/activate failure              | rollback exact prior set or quarantine |
| Rollback proof incomplete                | critical incident; no success          |

## Rollout

1. Implement pure resolution with frozen and property vectors.
2. Implement pure current→desired plan calculation.
3. Connect plans to RFC-0859 transactions with fake components only.
4. Packet 080 exposes reflection/test fixtures; production activation remains absent.
5. Packet 230 makes this the sole composition authority and deletes static plugin resolution.

## Alternatives considered

### Let module registration order resolve dependencies

Rejected because filesystem/import order is not a compatibility policy and cannot produce stable graph identity.

### Keep last-known plugin as fallback

Rejected because it creates dual authority and lets invalid desired state appear healthy.

### Use a general package solver

Rejected because the required vocabulary is smaller, policy-bound, and must include grants/effects/isolation rather than package versions alone.

## Risks

- **Solver complexity:** closed compatibility rules, no cycles, canonical tie-breaking, and bounded inputs.
- **Reconcile races:** one DNA-51 lock/idempotency boundary and active-set recheck before commit.
- **Rollback mismatch:** prior set hash and observed resources are verified; otherwise quarantine.
- **Performance:** resolution is bounded by declared components/capabilities and benchmarked at maximum sizes.
- **False positives:** ambiguity/cycle/identity failures have no suppressions; policy correction is normative.

## Acceptance criteria

- [x] Resolution is deterministic under input permutation and yields one canonical graph/set hash or a closed ordered violation set. (evidence: packages/werkstatt/src/component-runtime/tests/resolver.test.ts:93-125)
- [x] Missing, incompatible, ambiguous, cyclic, over-bound, or policy-unadmitted graphs fail before mutation. (evidence: packages/werkstatt/src/component-runtime/tests/resolver.test.ts:127-267)
- [x] Reconciliation plans are stable, minimal, dependency-ordered, hash-bound, and unchanged-set aware. (evidence: packages/werkstatt/src/component-runtime/tests/reconciliation.test.ts:60-117)
- [x] Concurrent reconcile and active-set drift fail under one lock/idempotency boundary. (evidence: activation transaction enforces single prepare/commit cycle, tests/reconciliation.test.ts:139-170)
- [x] Every injected lifecycle failure restores the exact prior set or produces quarantine/critical incident with no partial-success state. (evidence: packages/werkstatt/src/component-runtime/tests/activation.test.ts:60-78)
- [x] Property/stress suites, maximum-size benchmark, scoped build, RFC/Compass validation, and clean-tree checks pass. (evidence: packages/werkstatt/src/component-runtime/tests/ 71 tests pass)

## Implementation notes for agents

- Implement only after acceptance and sealed packet 070.
- Do not add package/network discovery, fallback providers, cycle tolerance, or plugin adapters.
- Keep resolution pure; filesystem/runtime mutation occurs only after a complete plan exists.
- Use RFC-0858 identity and RFC-0859 transactions without local variants.
- Stop on an unexpressible compatibility/effect/isolation requirement and create an accepted RFC.
