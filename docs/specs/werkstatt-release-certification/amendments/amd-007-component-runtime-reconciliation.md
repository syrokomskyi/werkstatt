---
schema: forge/spec-amendment@1
id: AMD-007
title: Component-runtime identity and sequential certification reconciliation
status: proposed
createdAt: 2026-08-15
reviewers: []
targets:
  - kind: section
    document: overview
    anchor: target-architecture
  - kind: section
    document: contracts
    anchor: candidate-identity
  - kind: section
    document: roadmap
    anchor: implementation-roadmap
discoveredBy: RFC-0855
---

## Was

The accepted release-certification specification assumes the RFC-0770 composition seam: exactly one active stack plugin supplies one profile, producers, evaluators, and deploy adapters through boot-time registration. Candidate and evidence identity bind `pluginId`, `pluginVersion`, `profileId`, and `profileHash`, while the roadmap can prepare certification capabilities without proving an exact independently lifecycle-managed runtime graph first.

That seam is incompatible with RFC-0855. A static plugin cannot identify the exact producer/evaluator/adapter set, own reversible registrations, express versioned capability dependencies, or prove that the runtime used to produce and judge evidence is the runtime named by the certificate.

## Becomes

### Composition authority

One active Forge stack profile resolves an immutable `ResolvedComponentSet` of versioned producer, evaluator, deploy-adapter, validator, scheduler, probe, and tool capabilities. The Werkstatt Law Kernel owns identity, grants, sandbox admission, locks, authoritative append, certification, promotion, deployment authorization, rollback, quarantine, kill switch, and audit integrity. Replaceable components may propose results and request operations; they cannot append authoritative decisions, grant themselves permissions, change admission policy, or access authority/deployment credentials directly.

The profile remains the workshop's single stack identity. It is not a runtime singleton and does not create a second registry. Every registration and acquired resource is owned by one component lifecycle and unwinds under the RFC-0855 effect contract.

### Runtime identity binding

Every runtime-sensitive policy, release candidate, evidence envelope, gate/health/deployment decision, operation authorization, dossier projection, and certificate gains or transitively binds:

```ts
resolvedComponentSetHash: string;
```

The hash identifies the exact immutable component identities, dependency graph, grant set, effect policy, and isolation policy used for the operation. Evidence becomes stale when its policy forbids reuse across a different resolved set. A certificate never proves a release against an unnamed or merely profile-equivalent runtime.

### Candidate separation

`ReleaseCandidate` and `CapabilityCandidate` remain distinct literal schemas and lifecycles. They may reuse generic canonical identity, artifact, evidence, dossier, evaluation, promotion, and rollback primitives, but they do not share one candidate schema, dossier root, or state machine.

A release candidate binds a site artifact and the resolved component set that produces/evaluates/deploys it. A capability candidate binds a base component-set hash, proposed immutable component artifact, proposed resolved-set hash, requested grants, declared effects, and isolation tier.

### Capability execution and evaluator boundary

Certification producers, evaluator implementations, and deploy adapters execute only through lifecycle-managed capabilities admitted in the resolved component graph. Missing, ambiguous, incompatible, draining, failed, quarantined, or differently hashed capabilities produce an explicit non-pass result.

CERT-006 does not activate agent-written or third-party executable artifacts. A pinned trusted first-party adapter sends a redacted, policy-bounded request to an isolated evaluator workload; the response returns only as untrusted data and must pass strict schema, size, provenance, independence, and authority admission. Executable untrusted artifacts remain disabled until the real sandbox and capability bridge are certified.

### Sequential roadmap and cutover

The release-certification roadmap executes only through the RFC-0855 packet order. No CERT node is implemented in parallel. CERT-002 through CERT-010 are materialized just in time through `spec.materialize` after their effective dependencies and preceding program packet complete, as amended by RFC-0857.

CERT-009 is one combined runtime-and-certification cutover: static modules are re-authored as components, the exact resolved set is certified, the sole site is republished, and old plugin/registry and legacy release-authority paths are removed from active execution together. CERT-010 performs only evidence-backed post-cutover cleanup.

ADR-001 through ADR-020 and AMD-001 through AMD-006 remain effective. AMD-007 changes only the static composition seam, runtime-identity binding, capability execution boundary, and roadmap ordering described above.

## Why

Implementing certification against the static plugin first would permanently encode a runtime identity already scheduled for removal and require two high-risk cutovers. Enabling dynamic components first would expose self-extension before independent identity, evidence, isolation, rollback, quarantine, and promotion authority exist. Binding certification to an exact resolved component set lets the authority substrate arrive before evolution while preserving the accepted certification truth model.

## Impact

- **CERT-001:** strict contracts include resolved-set identity and distinct release/capability candidate schemas.
- **CERT-002:** the certification profile resolves exact versioned capabilities rather than one plugin registry.
- **CERT-003:** authority and durable storage bind exact component-set identity.
- **CERT-004:** orchestration invokes lifecycle-managed capabilities and records their resolved set.
- **CERT-005:** deterministic site producers become the first trusted production component graph.
- **CERT-006:** evaluator execution remains isolated data exchange; agent-written code is still disabled.
- **CERT-007:** deployment authorization binds the exact certified component set and effect policy.
- **CERT-008:** health and demotion operate on release and component-set identity.
- **CERT-009:** runtime and certification cut over together with one rollback proof.
- **CERT-010:** cleanup removes only artifacts proven obsolete by the combined cutover report.
- **Verification:** every identity-sensitivity, graph mismatch, missing capability, stale evidence, evaluator isolation, cutover, and rollback case is fail-closed and deterministic.
