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

### K-0002: Domain-specific packages without stack dependencies stay in the plugin

```knowledge-entry
id: K-0002
layer: L2
created: 2026-08-09
lastConfirmedAt: 2026-08-09
confirmations: 2
status: active
```

- **Condition:** A package has no stack-specific dependencies (no Astro, sharp, playwright) and depends only on engine packages, but its semantics are domain-specific (content editing, check infrastructure, MCP tool projection for site workflows).
- **Recommended answer:** Classify as site plugin, not engine. The engine is for lifecycle/platform concerns (missions, releases, mirrors, artifact store, fingerprint, integrity). Dependency on engine packages does not make a package engine — the question is whether the package's purpose is stack-agnostic lifecycle or domain-specific tooling. When the charter (RFC-0769) does not list the concern as engine, and the package's semantics are tied to a specific domain (site content editing, site quality checks), it belongs in the plugin even if it has no Astro imports.
