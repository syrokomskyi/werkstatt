---
id: RFC-0859
title: "Establish the lifecycle fiber and effect runtime"
status: draft
kind: architecture
scope: workspace
owners: [architecture]
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
enhancedAt:
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0855
  - werkstatt-release-certification/AMD-007
dependsOn:
  - RFC-0858
batch: agent-runtime-certification-program
satisfies: [DNA-51, DNA-64]
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: ["@warpgogol/werkstatt"]
successSignals:
  - "Every component operation and acquired resource belongs to one cancellable lifecycle fiber"
  - "Drain, quiescence, cancellation, teardown, and activation are deterministic under failure"
  - "The four effect classes enforce their distinct commit, abort, compensation, or withholding laws"
nonGoals:
  - "Do not resolve dependency graphs or reconcile desired component sets"
  - "Do not implement untrusted-code isolation, certification, or promotion"
  - "Do not add force-unload, best-effort teardown, or plugin compatibility"
---

# RFC-0859: Establish the lifecycle fiber and effect runtime

## Context

RFC-0858 defines immutable components and closed effect declarations, but declarations do not create runtime ownership. Current kernel registrations and resources survive for process lifetime; there is no owner fiber, drain boundary, quiescence proof, reverse-order teardown, or transactional component-set activation. RFC-0855 requires those semantics before replaceable capabilities can become production dependencies.

## Problem

Without one runtime, unload can remove a provider while dependents still call it, cancellation can interrupt an irreversible emission, teardown order can leak listeners/processes/locks, and failed replacement can leave a partially active graph. Individual disposers do not solve coordination, in-flight work, or multi-effect transaction boundaries.

## Decision

Werkstatt gains an engine-owned structured-concurrency runtime in which every component activation owns one lifecycle fiber, every child operation/resource/effect is scoped beneath it, and component-set transition is a bounded activation transaction with deterministic drain, quiescence, LIFO unwind, commit, abort, compensation, rollback, and quarantine outcomes.

## Architectural fit

- **DNA-51:** idempotency, locks, staging, and atomic transition laws become the activation transaction floor.
- **DNA-64:** lifecycle belongs to the stack-agnostic engine; components never manage a parallel scheduler/registry.
- **RFC-0855:** implements the closed lifecycle and four effect classes without expanding the Law Kernel.
- **RFC-0858:** consumes component identities/effect declarations exactly; it does not redefine them.

## Design

### CLI surface

No CLI command. Packet 060 provides an internal runtime API and exhaustive tests. Operator/evolution commands arrive in later RFCs.

### TypeScript contracts

```ts
type ComponentLifecycleState =
  | "declared" | "waiting" | "loading" | "active"
  | "draining" | "unloading" | "disposed" | "failed" | "quarantined";

interface ComponentFiber {
  readonly component: ResolvedComponentIdentityV1;
  readonly state: ComponentLifecycleState;
  run<T>(operation: OwnedOperation<T>): Promise<T>;
  drain(deadline: Deadline): Promise<QuiescenceResult>;
  dispose(): Promise<EffectUnwindReportV1>;
}

interface ActivationTransactionV1 {
  transactionId: string;
  priorSetHash: string;
  proposedSetHash: string;
  prepare(): Promise<void>;
  commit(): Promise<void>;
  abort(reason: Diagnostic): Promise<void>;
}
```

State transitions are closed and exhaustive. New calls stop at `draining`; existing operations complete or cancel only at declared cancellation points. Dependents drain before providers. Resources/effects unwind in LIFO order within reverse topological component order.

Effect laws:

| Class                   | Runtime law                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `revertible`            | disposer required; unwind before owner disposal                  |
| `transactional`         | prepare/commit/abort plus idempotency key                        |
| `compensatable`         | explicit compensation plus equivalence evidence                  |
| `irreversible-emission` | withheld until commit boundary; never described as rollback-safe |

Timeout, cancellation, disposer failure, compensation failure, or unknown effect is a typed non-pass. No force unload exists. Failed rollback quarantines the candidate and exposes a critical incident result.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/component-runtime/fiber.ts` | structured component/operation ownership |
| `packages/werkstatt/src/component-runtime/lifecycle.ts` | closed state machine |
| `packages/werkstatt/src/component-runtime/effects.ts` | effect handlers and unwind reports |
| `packages/werkstatt/src/component-runtime/activation.ts` | set activation transaction |
| `packages/werkstatt/src/component-runtime/tests/**` | state/effect/failure/concurrency suites |

No resolver, sandbox provider, deploy adapter, certification authority, or site workspace is owned here.

### Output format

Internal transition methods return strict result/report unions containing transaction ID, component/set identities, prior/next state, completed/cancelled operations, effect outcomes, diagnostics, and rollback/quarantine disposition. Unknown or partial data cannot map to success.

### Failure modes

| Condition | Required result |
| --- | --- |
| Invalid state edge or double activation | reject before mutation |
| Drain timeout | abort replacement; restore prior active set or quarantine |
| Disposer failure | continue bounded unwind, report failure, no disposed success |
| Transaction commit failure | abort/rollback idempotently |
| Compensation lacks equivalence | quarantine; critical incident |
| Irreversible emission before commit | hard invariant failure |

## Rollout

1. Implement pure state/effect contracts and fake-clock tests.
2. Add fiber ownership and cancellation propagation.
3. Add activation transaction and prior-set rollback.
4. Expose only an internal engine API; no production component activation occurs.
5. Packet 070 supplies deterministic resolution; packet 080 supplies test-only fixtures; packet 230 performs production cutover.

## Alternatives considered

### Independent AbortControllers and disposers

Rejected because they do not encode dependency order, quiescence, transaction boundaries, or effect-class laws.

### Force unload after timeout

Rejected because it can corrupt in-flight state and misrepresent irreversible effects as rolled back.

### Reuse plugin hook lifecycle

Rejected because five coarse hooks do not own individual registrations/resources or dependent drains.

## Risks

- **Deadlock/livelock:** bounded deadlines, deterministic order, wait-for diagnostics, and fake-clock stress tests.
- **Cancellation races:** structured ownership and explicit cancellation points; arbitrary interruption is forbidden.
- **Compensation theatre:** equivalence evidence is mandatory and failure quarantines.
- **Performance:** active call bookkeeping is bounded per component/operation and benchmarked in tests.
- **False positives:** invalid state/effect transitions have zero suppressible false positives.
- **Agent confusion:** exact ownership table prevents resolver/sandbox/certification scope creep.

## Acceptance criteria

- [ ] The closed lifecycle rejects every invalid transition and reaches no partially active state under injected failure.
- [ ] Structured fibers own all child operations/resources and propagate cancellation only at declared boundaries.
- [ ] Drain stops new calls, waits boundedly for quiescence, and unwinds dependents/providers and effects in deterministic reverse/LIFO order.
- [ ] All four effect classes enforce their distinct prepare/commit/abort/dispose/compensate/withhold laws, with unknown classes rejected.
- [ ] Activation failure restores the exact prior set or yields quarantine plus critical incident; it never reports success after incomplete rollback.
- [ ] Exhaustive state tests, property/stress tests, scoped build, RFC/Compass validation, and clean-tree checks pass.

## Implementation notes for agents

- Implement only after acceptance and a sealed packet 060.
- Do not add dependency selection, dynamic production commands, isolation, certification, or promotion.
- Never add force unload, swallowed disposer errors, unbounded wait, or best-effort success.
- Preserve exact component/effect identities from RFC-0858; no local aliases.
- Use deterministic clocks/schedulers in tests; do not depend on wall-clock sleeps.
- Escalate any new effect class or Law Kernel change through a separate accepted RFC.
