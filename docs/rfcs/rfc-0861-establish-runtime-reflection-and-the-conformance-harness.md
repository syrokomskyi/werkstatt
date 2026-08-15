---
id: RFC-0861
title: "Establish runtime reflection and the conformance harness"
status: accepted
kind: contract
scope: workspace
owners: [architecture]
reviewers:
  - human:andrii-syrokomskyi
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
dependsOn: [RFC-0860]
batch: agent-runtime-certification-program
satisfies: [DNA-64]
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: ["@warpgogol/werkstatt"]
successSignals:
  - "Agents can inspect one filtered live capability catalog bound to an exact resolved-set hash"
  - "Conformance tests can activate temporary trusted fixtures without exposing a production activation surface"
  - "Reflection never leaks secrets, raw grants, private state, executable artifacts, or authority credentials"
nonGoals:
  - "Do not expose define/install/promote commands or production dynamic activation"
  - "Do not execute agent-written or third-party code"
  - "Do not make reflected metadata authoritative evidence"
---

# RFC-0861: Establish runtime reflection and the conformance harness

## Context

After packets 050–070, Werkstatt can describe, run, resolve, and reconcile trusted components internally. Agents and certification producers need a truthful view of the active graph and a deterministic way to exercise lifecycle semantics. Exposing internal registries directly would leak implementation/private authority and could accidentally become a production activation API before isolation and promotion exist.

## Problem

A stale manifest is not live reflection; a raw registry exposes too much; and an unrestricted test loader is a hidden self-extension surface. Without a closed contract, agents can infer unavailable capabilities, treat desired state as active, run fixtures outside lifecycle ownership, or use conformance success as production admission.

## Decision

Werkstatt gains a read-only, policy-filtered live capability catalog and a test-only conformance harness that runs pinned trusted fixtures through the real RFC-0859/0860 lifecycle and reconciliation contracts. Neither surface activates production components or grants authority.

## Architectural fit

- **DNA-64:** reflection is an engine projection of the one resolved graph, not another registry.
- **RFC-0855:** agent-written code remains test-harness-only; reflection cannot cross the Law Kernel boundary.
- **RFC-0860:** catalog identity and state come from the active resolved set and observed lifecycle.
- **AMD-007:** certification can cite exact available producer/evaluator/adapter capabilities without trusting reflection as authority.

## Design

### CLI surface

No production CLI. The public package API exposes read-only reflection to trusted engine consumers. The conformance harness is exported only from a test subpath and refuses non-test runtime mode.

### TypeScript contracts

```ts
interface CapabilityCatalogV1 {
  schema: "werkstatt/capability-catalog@1";
  observedAt: string;
  resolvedComponentSetHash: string;
  entries: CapabilityCatalogEntryV1[];
  catalogHash: string;
}

interface CapabilityCatalogEntryV1 {
  capability: CapabilityId;
  version: string;
  schemaHash: string;
  componentId: ComponentId;
  lifecycleState: "waiting" | "active" | "draining" | "failed" | "quarantined";
  callable: boolean;
}

interface ConformanceScenarioV1 {
  scenarioId: string;
  fixtureArtifactHash: string;
  initialSet: ResolvedComponentSetV1;
  desiredSet: ResolvedComponentSetV1;
  injectedEvents: ConformanceEventV1[];
  expectedTrace: ConformanceExpectationV1[];
}
```

Catalog entries are canonically ordered and filtered by caller-visible capability, not raw internal grants. `callable` is derived from active state plus policy; absence/unknown state is false. The catalog omits secrets, raw grant payloads, component private state, credentials, prompts, executable bytes, lease tokens, and authority signing material.

The harness accepts only fixtures embedded in the test bundle, hash-pinned before execution, and explicitly marked trusted. It uses fake clocks/schedulers/failure injection and the real lifecycle/resolver APIs. Environment/runtime guards make production invocation fail before loading a fixture.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/component-runtime/reflection.ts` | filtered live catalog |
| `packages/werkstatt/src/component-runtime/conformance.ts` | scenario/result contracts |
| `packages/werkstatt/src/component-runtime/testing/**` | test-only harness and trusted fixtures |
| `packages/werkstatt/src/component-runtime/tests/conformance*.test.ts` | lifecycle/resolution scenarios |
| `packages/werkstatt/package.json` | public reflection and test-only subpath exports |

### Output format

Reflection returns the strict catalog. Conformance returns scenario/fixture/set identities, ordered trace, expected/actual comparisons, injected failures, terminal state, cleanup report, and violations. A conformance pass is test evidence only and contains no admission/promotion decision.

### Failure modes

| Condition                                | Result                                               |
| ---------------------------------------- | ---------------------------------------------------- |
| Catalog set hash differs from active set | fail closed                                          |
| Caller requests hidden/private field     | field absent; schema forbids it                      |
| Fixture is unpinned/untrusted/unknown    | reject before import                                 |
| Harness invoked outside test mode        | reject before import                                 |
| Trace/cleanup differs or unknown         | conformance fail                                     |
| Agent treats pass as admission           | no authority API exists; typed result says test-only |

## Rollout

1. Add filtered reflection and snapshot/negative tests.
2. Add test-only harness with trusted embedded fixtures.
3. Port lifecycle/composability reference scenarios without adding Cordis dependency.
4. Use the harness to qualify later isolation/certification implementations.
5. Production activation remains absent until packets 190–200.

## Alternatives considered

### Expose the kernel registry

Rejected because it is mutable, unfiltered, static-authority-shaped, and leaks irrelevant internals.

### Add a temporary production `component.run`

Rejected because it would bypass sandbox, certification, promotion, rollback, and kill switch.

### Depend on Cordis tests/runtime

Rejected; scenarios may inform expectations, but Werkstatt owns contracts and has no production dependency.

## Risks

- **Information leakage:** strict allow-listed projection and negative secret/private-field tests.
- **Test surface escapes to production:** test-only export plus runtime guard and package-boundary tests.
- **Stale catalog:** active-set hash and lifecycle observation are captured atomically.
- **False confidence:** result explicitly non-authoritative; certification/admission APIs are absent.
- **False positives:** catalog/trace mismatches are deterministic and unsuppressible.

## Acceptance criteria

- [ ] Catalog entries are canonical, live-state-derived, exact-set-bound, caller-filtered, and schema-strict.
- [ ] Reflection leaks no secrets, raw grants, private state, artifacts, prompts, credentials, or authority material under negative tests.
- [ ] The harness accepts only pinned trusted embedded fixtures and fails before import outside test mode.
- [ ] Conformance scenarios exercise real lifecycle/resolution APIs with deterministic clocks, cancellation, drain, rollback, quarantine, and cleanup traces.
- [ ] No production define/install/run/activate/promote command or authority decision is exported.
- [ ] Scoped tests/build, package-export checks, RFC/Compass validation, and clean-tree verification pass.

## Implementation notes for agents

- Implement only after acceptance and sealed packet 080.
- Never expose a raw registry or add production activation “for testing.”
- Treat catalog data and conformance results as projections/evidence, not authority.
- Keep fixtures embedded, trusted, hash-pinned, and test-only; no network/package discovery.
- Stop if a requested field may expose secret/private/authority data.
