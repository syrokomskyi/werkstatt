# `werkstatt-knowledge` Plugin Specification

**Package:** `@warpgogol/werkstatt-knowledge`  
**Plugin id:** `werkstatt-knowledge`  
**Forge profile id:** `knowledge-typescript-turborepo`  
**Current engine contract:** `werkstatt/plugin@1`  
**Role:** generic governance/runtime contour for evidence-backed knowledge systems.

This file is intentionally separate from the roguelike ontology. The plugin must be reusable for code corpora, company documentation, research archives, game repositories, mixed document sets, and other evidence-backed knowledge bases.

## 1. Design constraint from current Werkstatt

The current runtime resolves exactly one `WerkstattPlugin` per workshop. The hook list is closed to:

```text
materialize
build
checkGate
releaseEvidence
scaffoldProject
```

The current plugin entry is production-stable but architecturally legacy relative to the newer certification/component-graph direction.

Therefore v1 of `werkstatt-knowledge` MUST:

- use the existing five hooks only;
- register deterministic commands/pipelines through Kernel modules;
- avoid introducing a new hook merely for knowledge orchestration;
- avoid compatibility/dependency layers around `plugin@1`;
- keep all knowledge-domain services independent from the plugin entry object so later certification migration is direct.

## 2. Plugin identity

Normative target:

```yaml
schema: werkstatt/plugin@1
id: werkstatt-knowledge
profileId: knowledge-typescript-turborepo
```

A new Forge profile `knowledge-typescript-turborepo` is required. It represents the root workshop, not an individual Web technology.

Recommended root Forge stack intent:

```yaml
project:
  name: roguelike-games-kb
  stack:
    - typescript
    - knowledge
    - turborepo
```

Projection apps may use Astro or other stacks internally without becoming additional Werkstatt plugins under the current contract.

## 3. Path conventions

Normative `StackPathConventions` values:

```yaml
contentDir: knowledge
distDir: .generated/knowledge/dist
entryPoints:
  - knowledge/manifest.yaml
  - knowledge/ontology/schema-registry.yaml
```

Additional well-known project paths are plugin conventions, not `StackPathConventions` fields:

```text
staging/                         non-canonical candidates/transactions
laboratory/                      non-authoritative creative layer
projections/                     generated human/data projections
.generated/knowledge/            materialized/index/release outputs
knowledge.config.yaml            operational project config
../<knowledge-manifest-id>-source fixed sibling source bundle
```

The source-root path MUST NOT be configurable to an arbitrary directory.

## 4. Module loaders

The plugin SHOULD expose domain-independent Kernel modules approximately along these responsibilities:

### `knowledge-source`

Registers deterministic commands for:

```text
knowledge.source.scan
knowledge.source.status
knowledge.source.bind
knowledge.source.verify
```

Responsibilities:

- resolve fixed sibling source root;
- parse source-bundle/source-unit metadata;
- calculate current fingerprints;
- compare with canonical bindings;
- return source drift diagnostics;
- never update source payloads.

### `knowledge-core`

Registers:

```text
knowledge.verify
knowledge.status
knowledge.coverage
knowledge.audit
knowledge.candidate.validate
knowledge.promote
knowledge.transaction.status
```

Responsibilities:

- schemas/identity/authority;
- evidence/claim/relation integrity;
- promotion policy;
- transaction safety;
- governance-decision references.

### `knowledge-extract`

Registers:

```text
knowledge.extract.list
knowledge.extract.run
knowledge.extract.verify
knowledge.refresh.prepare
knowledge.refresh.apply
```

Responsibilities:

- load registered trusted extractors;
- enforce static source read boundary;
- produce staged factual deltas;
- support impact-aware refresh;
- never invoke untrusted source code by default.

### `knowledge-materialize`

Registers:

```text
knowledge.materialize
knowledge.materialize.verify
knowledge.projection.status
knowledge.projection.build
```

Responsibilities:

- canonical graph compilation;
- normalized projection input;
- generated-index builders;
- projection freshness checks.

### `knowledge-release`

Registers:

```text
knowledge.release.check
knowledge.release.evidence
knowledge.release.manifest
```

Responsibilities:

- open/private publication policy;
- canonical/source/projection hash capture;
- release evidence output.

The implementation MAY combine these into fewer Kernel modules if command names/semantics remain clear and package boundaries remain domain-independent.

## 5. Kernel command IO policy

Kernel commands support `reads`/`writes`. The plugin MUST use these declarations to enforce the source boundary.

Rules:

- source-reading commands declare `../<kb-id>-source/**` as reads;
- no command declares source sibling paths as writes;
- canonical-mutating commands write only under `knowledge/**` through a transaction layer plus staging bookkeeping;
- materialization writes only `.generated/**` and configured generated projection targets;
- Web/MCP build commands do not write canonical data.

Commands that violate the IO policy must fail registration or check-gate validation.

## 6. Hooks

### `materialize` — REQUIRED

Meaning for this plugin:

> Compile verified canonical knowledge into the deterministic normalized materialized dataset consumed by projections/indexes.

Preconditions:

- canonical schema/integrity valid;
- source bindings current for certified/release mode;
- no source writes.

Outputs include a materialization manifest with canonical hash/model version.

### `build` — REQUIRED

Meaning:

> Build configured projection packages/apps from the current materialization.

It may invoke Turborepo tasks for `apps/web`, `apps/mcp`, Obsidian builder, and similar configured projections.

It MUST NOT register/use a second stack plugin for those apps under `plugin@1`.

### `checkGate` — REQUIRED

Runs the complete knowledge check gate using Werkstatt’s canonical Diagnostic schemas.

At minimum:

```text
source-root naming
source metadata/version
source drift
source write safety
schema parse/validation
id/key uniqueness
alias integrity
evidence validity
claim support
relation ontology/domain/range
epistemic/promotion policy
governance decision refs
coverage consistency
canonical English
candidate/Laboratory leakage
projection freshness
secret scan
open-release license/publication policy
```

### `releaseEvidence` — REQUIRED

Emits a knowledge-specific evidence packet including:

```text
dataset id/version
model version
canonical hash
source binding matrix and fingerprints
record/edge/claim/evidence counts
coverage summary
check-gate result digest
accepted RFC/ADR references relevant to this release
materialization hash
projection hashes
public license/policy metadata
```

### `scaffoldProject` — REQUIRED

Creates the KB-side Turborepo skeleton:

```text
knowledge/
staging/
laboratory/
apps/ placeholders/configurable projection roots
packages/ core/extractor/projection boundaries
docs/rfc + docs/adr
knowledge.config.yaml
example source-bundle instructions
```

It MUST NOT populate, update, clone, or mutate the sibling source bundle.

A separate source-maintenance process owns `../<kb-id>-source`.

## 7. Deploy adapters

`deployAdapters` MUST be absent/empty in the first `werkstatt-knowledge` contract.

Reasons:

1. knowledge governance is deployment-provider agnostic;
2. the website/MCP are projections, not the plugin’s semantic core;
3. the current `DeployAdapterFactory` shape is not a settled domain contract;
4. adding deploy compatibility around a legacy plugin boundary is specifically undesirable.

Deployment may be handled by ordinary workspace infrastructure until the post-legacy Werkstatt component model provides the appropriate composition mechanism.

## 8. Pipelines

No new engine hook is required.

The plugin SHOULD register logical pipelines through Kernel modules when the concrete `KernelPipelineStep` contract is implemented/confirmed:

### `knowledge.validate`

```text
source.status
→ canonical structural checks
→ evidence/graph checks
→ governance/boundary checks
```

### `knowledge.materialize-and-build`

```text
knowledge.verify
→ materialize
→ projection builds
→ projection freshness verification
```

### `knowledge.release`

```text
knowledge.verify --release
→ materialize
→ build
→ releaseEvidence
```

### `knowledge.refresh-transaction`

The deterministic part MAY orchestrate:

```text
source.status
→ impact analysis
→ extractor runs
→ evidence re-anchor checks
→ staged delta verification
```

AI semantic reconstruction/review remains a Forge agent skill/workflow between deterministic preparation and final promotion/apply. The plugin does not need an embedded LLM runtime.

## 9. Invariants

The plugin exports `StackInvariant[]` for at least the rules in `PLUGIN-INVARIANTS.md`.

Invariant ids use the `KNO-` prefix and are stable public diagnostics identifiers.

## 10. Diagnostics ownership

The plugin MUST import Diagnostic/DiagnosticSeverity/DiagnosticEvidence from Werkstatt’s canonical schemas package. It MUST NOT define a duplicate diagnostic schema.

Knowledge-specific detail belongs in diagnostic ids/evidence/data, not in a competing severity type.

## 11. AI skills versus plugin runtime

`werkstatt-knowledge` itself SHOULD remain deterministic and model-agnostic.

AI orchestration belongs to Forge skills/workflows such as:

```text
knowledge-discover
knowledge-ingest
knowledge-reconstruct
knowledge-review
knowledge-refresh
knowledge-crossgame
knowledge-laboratory
```

The skill reads structured status/evidence, writes candidates/reviews, then calls deterministic plugin commands for validation/promotion.

## 12. Site/MCP coexistence under one-plugin rule

Current normative wiring:

```text
Workshop plugin registry:
  exactly one → werkstatt-knowledge

Turborepo apps:
  apps/web → ordinary projection app
  apps/mcp → ordinary projection app
```

Do **not** register `werkstatt-site` in this same workshop while the engine enforces one plugin. Do not create a composite pseudo-plugin solely to bypass that invariant.

If future certified component composition permits multiple independent capability components, migrate via a superseding Forge/Werkstatt decision. Until then, projection apps remain children of the knowledge workshop.

## 13. Future certification migration shape

Implementation code SHOULD isolate:

```text
source services
verification services
transaction services
extractor registry
materializer
release-evidence producer
```

from the `WerkstattPlugin` object.

The `plugin@1` entry should be a thin adapter from existing hooks/Kernel to these services. When the plugin entry is superseded, those services can become certified components/fibers without rewriting the knowledge model.

## 14. Engine extension points

This formal model does **not** currently require a new legacy engine hook.

If implementation discovers a capability that cannot be expressed by:

- Kernel commands;
- Kernel pipelines;
- the five existing hooks;
- ordinary Turborepo tasks;

then the implementation specification must first prove the missing semantic capability. It must not add an adapter/hook casually. Given the current model, no such missing extension point is identified.
