# Learned Principles (L2)

Concrete principles distilled from past grilling sessions. Each principle has a condition and a recommended answer. The skill checks these before asking the operator.

<!-- Entries are appended by the skill after meta-analysis and operator approval. -->
<!-- Format:
## <principle title>
- **Condition:** <when this applies>
- **Recommended answer:** <what to recommend>
- **confirmations:** <N>
- **Added:** <date>
-->

### K-0001: Extend infrastructure before feature logic

```knowledge-entry
id: K-0001
layer: L2
created: 2026-08-03
lastConfirmedAt: 2026-08-03
confirmations: 1
status: active
```

- **Condition:** Plan grilling reveals that a feature depends on a schema field, serializer entry, or validation path that doesn't exist in the underlying module yet.
- **Recommended answer:** Add a separate plan step to extend the infrastructure (schema, serializer, validator) before any step that creates or reads the new field/path. Zod safeParse silently strips unknown fields; fixed-order serializers skip unknown fields. Without the extension step, data is silently lost.

### K-0002: Unknown is not green

```knowledge-entry
id: K-0002
layer: L2
created: 2026-08-14
lastConfirmedAt: 2026-08-14
confirmations: 1
status: active
```

- **Condition:** A readiness, quality, safety, or compliance decision depends on evidence that may be missing, stale, malformed, unclassified, or unavailable.
- **Recommended answer:** Represent uncertainty explicitly and fail closed at consequential transitions. Never synthesize success from absence, fallback stubs, grace periods, timeouts, or infrastructure failure.

### K-0003: Quality claims bind to immutable identity

```knowledge-entry
id: K-0003
layer: L2
created: 2026-08-14
lastConfirmedAt: 2026-08-14
confirmations: 1
status: active
```

- **Condition:** A system certifies, approves, tests, scores, or otherwise makes a durable claim about an artifact.
- **Recommended answer:** Bind the claim to the exact source, content, artifact, configuration, policy, and toolchain identity. Any bound-identity change invalidates the claim and requires a new candidate and evidence chain.

### K-0004: Evaluation must not mutate its subject

```knowledge-entry
id: K-0004
layer: L2
created: 2026-08-14
lastConfirmedAt: 2026-08-14
confirmations: 1
status: active
```

- **Condition:** A gate, evaluator, audit, or certification process discovers a defect in the artifact it is judging.
- **Recommended answer:** Keep evaluation read-only with respect to the judged artifact. Emit anchored remediation tasks; perform fixes in a separate authoring flow that produces a new artifact identity and new evidence.

### K-0005: Immutable history and current health are separate

```knowledge-entry
id: K-0005
layer: L2
created: 2026-08-14
lastConfirmedAt: 2026-08-14
confirmations: 1
status: active
```

- **Condition:** A past decision must remain auditable while real-world conditions can change after that decision.
- **Recommended answer:** Preserve historical decisions and evidence as append-only records. Compute current health as a separate projection over later evidence and events; never rewrite the historical decision to imitate present state.

### K-0006: Migration complexity follows the real estate

```knowledge-entry
id: K-0006
layer: L2
created: 2026-08-14
lastConfirmedAt: 2026-08-14
confirmations: 1
status: active
```

- **Condition:** A migration design is accumulating compatibility paths for hypothetical consumers or legacy estates that do not exist in the actual deployment scope.
- **Recommended answer:** Prefer the smallest safe migration that fits the real estate. For a replaceable single target, use a clean cutover and preserve only the audit history that remains valuable; do not build generic legacy infrastructure without a concrete consumer.
