# @warpgogol/werkstatt-knowledge

Werkstatt plugin for evidence-backed knowledge systems. Implements `werkstatt/plugin@1` with `profileId: "knowledge-typescript-turborepo"`.

## What this plugin does

The Knowledge plugin provides a structured pipeline for building and maintaining evidence-backed knowledge bases — canonical records, source bindings, extraction, materialization, and release. It enforces 28 stack invariants (KNO-001..028) that govern source integrity, canonical record validity, evidence provenance, ontology governance, and release readiness.

## When you need this plugin

Install this plugin when your project is a knowledge system — a structured dataset where claims are backed by evidence from registered source units. The `knowledge-typescript-turborepo` profile scaffolds the right folder structure, content directory, and tooling.

## Installation

```sh
pnpm add -D @warpgogol/werkstatt @warpgogol/werkstatt-knowledge
```

## Stack profile

| Profile | Project type | First workspace | Use case |
| --- | --- | --- | --- |
| `knowledge-typescript-turborepo` | Knowledge system | `knowledge/my-kb` | Evidence-backed knowledge bases, structured datasets with source provenance |

Create a new knowledge project:

```sh
mkdir my-knowledge-base
cd my-knowledge-base
pnpm dlx @warpgogol/forge@latest create --in-place --profile knowledge-typescript-turborepo
```

## Kernel modules

The plugin registers 5 kernel modules with 23 command stubs:

| Module | Commands | Purpose |
| --- | --- | --- |
| `knowledge-source` | `knowledge.source.scan`, `knowledge.source.status`, `knowledge.source.bind`, `knowledge.source.verify` | Source unit registration, scanning, binding, and verification |
| `knowledge-core` | `knowledge.verify`, `knowledge.status`, `knowledge.coverage`, `knowledge.audit`, `knowledge.candidate.validate`, `knowledge.promote`, `knowledge.transaction.status` | Canonical record validation, coverage analysis, audit, and promotion |
| `knowledge-extract` | `knowledge.extract.list`, `knowledge.extract.run`, `knowledge.extract.verify`, `knowledge.refresh.prepare`, `knowledge.refresh.apply` | Extraction pipeline and refresh operations |
| `knowledge-materialize` | `knowledge.materialize`, `knowledge.materialize.verify`, `knowledge.projection.status`, `knowledge.projection.build` | Materialization and projection building |
| `knowledge-release` | `knowledge.release.check`, `knowledge.release.evidence`, `knowledge.release.manifest` | Release readiness checks, evidence generation, and manifest production |

## Lifecycle hooks

| Hook | Purpose |
| --- | --- |
| `materialize` | Prepares knowledge workspace on mission materialize |
| `build` | Builds knowledge projections |
| `checkGate` | Runs 7 validators (source, verify, coverage, audit, materialize, release, projection) |
| `releaseEvidence` | Generates release evidence for the knowledge base |
| `scaffoldProject` | Scaffolds a new knowledge project with manifest, config, and folder structure |

## Path conventions

| Path | Value |
| --- | --- |
| Content directory | `knowledge` |
| Distribution directory | `.generated/knowledge/dist` |
| Entry points | `knowledge/manifest.yaml`, `knowledge/ontology/schema-registry.yaml` |

## Invariants

The plugin enforces 28 stack invariants (KNO-001..028). See `AGENTS.md` for the full table with descriptions and associated check commands.

Key invariant groups:

- **Source integrity** (KNO-001..006) — manifest validity, source root resolution, source immutability, fingerprint tracking, code execution safety
- **Canonical record validity** (KNO-007..015) — schema validity, id uniqueness, evidence provenance, semantic claim sufficiency, relation type registration, epistemic status, language, staging/laboratory exclusion
- **Ontology governance** (KNO-016..017) — global changes require accepted RFC, cross-game concept admission requires accepted decision
- **Coverage and audit** (KNO-018, KNO-020) — coverage denominator rules, secret detection
- **Materialization** (KNO-019, KNO-027) — canonical hash matching, deterministic materialization
- **Release** (KNO-021..022) — dataset license metadata, per-source publication policy
- **Workshop resolution** (KNO-024) — sole current Werkstatt plugin
- **Source bundle isolation** (KNO-025) — outside npm/Turbo workspace globs
- **Mutation pathway** (KNO-026) — canonical mutation via transaction/promotion
- **Evidence metadata** (KNO-028) — resolvable repo/commit/path metadata

## Architecture

```text
src/
  index.ts                    # Plugin entry — werkstattKnowledgePlugin
  paths/                      # Knowledge path conventions
  invariants/                 # KNO-001..028 stack invariant declarations
  source/                     # knowledge-source module (scan, status, bind, verify)
  core/                       # knowledge-core module (verify, status, coverage, audit, promote)
  extract/                    # knowledge-extract module (list, run, verify, refresh)
  materialize/                # knowledge-materialize module (materialize, projection)
  release/                    # knowledge-release module (check, evidence, manifest)
  hooks/                      # 5 lifecycle hooks
```

## Architectural constraints

- No deploy adapters in v1 (per SPEC-v1.0 section 7).
- No imports from `@warpgogol/werkstatt-site` or other stack plugins.
- No new engine hooks — the hook list is closed at five.
- No AI orchestration or skills inside the plugin.
- Knowledge domain logic is isolated from the plugin entry object for future certification migration.

## RFC

- **RFC-0894** — Add werkstatt-knowledge plugin (specification and implementation).
- **SPEC-v1.0** — `docs/specs/werkstatt-knowledge-plugin/SPEC-v1.0.md`
- **PLUGIN-INVARIANTS** — `docs/specs/werkstatt-knowledge-plugin/PLUGIN-INVARIANTS.md`

## License

Apache-2.0
