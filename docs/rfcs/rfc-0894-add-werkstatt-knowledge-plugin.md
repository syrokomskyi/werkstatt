---
id: RFC-0894
title: "Add werkstatt-knowledge plugin for evidence-backed knowledge systems"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt:
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0770
  - RFC-0776
  - RFC-0777
dependsOn:
  - RFC-0770
satisfies:
  - DNA-64
versionBump: minor
commands:
  proposed:
    - knowledge.source.scan
    - knowledge.source.status
    - knowledge.source.bind
    - knowledge.source.verify
    - knowledge.verify
    - knowledge.status
    - knowledge.coverage
    - knowledge.audit
    - knowledge.candidate.validate
    - knowledge.promote
    - knowledge.transaction.status
    - knowledge.extract.list
    - knowledge.extract.run
    - knowledge.extract.verify
    - knowledge.refresh.prepare
    - knowledge.refresh.apply
    - knowledge.materialize
    - knowledge.materialize.verify
    - knowledge.projection.status
    - knowledge.projection.build
    - knowledge.release.check
    - knowledge.release.evidence
    - knowledge.release.manifest
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-knowledge"
successSignals:
  - "Knowledge systems can be created and validated using the same Forge/Werkstatt lifecycle as sites and games"
  - "Source boundary is enforced at the kernel command IO level"
  - "Plugin works within the existing five-hook contract without requiring engine extensions"
nonGoals:
  - "Implementing the full knowledge domain logic (source scanning, graph compilation, evidence validation) — this RFC adds the plugin structure and command stubs"
  - "Adding a new engine hook — the spec explicitly confirms no new hook is needed"
  - "Adding deploy adapters — deployAdapters is intentionally empty in v1"
  - "Creating a composite pseudo-plugin to bypass the one-plugin rule"
---

# RFC-0894: Add werkstatt-knowledge plugin for evidence-backed knowledge systems

## Context

The Werkstatt engine currently supports three stack plugins: `werkstatt-site` (Astro), `werkstatt-phaser-game` (Phaser), and `werkstatt-godot-game` (Godot). All three follow the `werkstatt/plugin@1` contract with five lifecycle hooks and kernel module registration.

A new domain is needed: evidence-backed knowledge systems. These systems manage canonical knowledge graphs with source bindings, evidence chains, promotion policies, and deterministic materialization. The first consumer is a roguelike games knowledge base, but the plugin must be reusable for code corpora, company documentation, research archives, and other evidence-backed knowledge bases.

The full specification is vendored at `docs/specs/werkstatt-knowledge-plugin/SPEC-v1.0.md` with invariants at `docs/specs/werkstatt-knowledge-plugin/PLUGIN-INVARIANTS.md`.

## Problem

There is no Werkstatt plugin for knowledge systems. The existing plugins are designed for Web sites (Astro) and games (Phaser, Godot) — their path conventions, validators, and build hooks do not match the knowledge-system lifecycle:

- Knowledge systems have a **source boundary** (fixed sibling source bundle) that must not be written to
- Knowledge systems have **canonical/staging/laboratory** tiers with promotion policies
- Knowledge systems produce **materialized datasets** consumed by projections, not built artifacts
- Knowledge systems require **evidence-backed claims** with source bindings and fingerprint verification
- Knowledge systems are **deployment-provider agnostic** — projections are ordinary apps, not plugin-managed deployments

## Decision

Introduce a new package `@warpgogol/werkstatt-knowledge` (`packages/werkstatt-knowledge/`) implementing `werkstatt/plugin@1` with:

- **Plugin id:** `werkstatt-knowledge`
- **Profile id:** `knowledge-typescript-turborepo`
- **Path conventions:** `contentDir: knowledge`, `distDir: .generated/knowledge/dist`, `entryPoints: knowledge/manifest.yaml, knowledge/ontology/schema-registry.yaml`
- **Module loaders:** 5 modules (knowledge-source, knowledge-core, knowledge-extract, knowledge-materialize, knowledge-release) registering ~23 kernel commands
- **Hooks:** All five hooks implemented (materialize, build, checkGate, releaseEvidence, scaffoldProject)
- **Deploy adapters:** Intentionally empty — deployment is handled by ordinary workspace infrastructure
- **Invariants:** KNO-001..028 from `PLUGIN-INVARIANTS.md`

A new Forge profile `knowledge-typescript-turborepo` is added to `packages/forge/profiles/`.

## Architectural fit

- **One-plugin rule:** The plugin works within the existing one-plugin-per-workshop constraint. Projection apps (Web, MCP, Obsidian builder) are ordinary Turborepo apps, not separate plugins.
- **Five-hook contract:** The spec explicitly confirms no new engine hook is needed. All knowledge lifecycle operations are expressed through kernel commands and the five existing hooks.
- **Source boundary enforcement:** Kernel command `reads`/`writes` declarations enforce that source-reading commands declare `../<kb-id>-source/**` as reads and no command declares source paths as writes.
- **Diagnostic ownership:** The plugin imports `Diagnostic`, `DiagnosticSeverity`, `DiagnosticEvidence` from `@warpgogol/werkstatt/schemas` — no duplicate diagnostic schema.
- **Legacy plugin boundary:** The plugin is a thin adapter from hooks/Kernel to isolated knowledge services. When the plugin entry is eventually superseded by the certification component model, the services can become certified components without rewriting the knowledge model.
- **DNA-64:** The engine (`@warpgogol/werkstatt`) does not import this plugin. The plugin imports engine types only.

## Design

### Package structure

```text
packages/werkstatt-knowledge/
  package.json
  tsconfig.json
  eslint.config.js
  AGENTS.md
  extract.config.yaml
  src/
    index.ts                              # Plugin entry — werkstattKnowledgePlugin
    paths/knowledge-paths.ts              # StackPathConventions + well-known paths
    invariants/knowledge-invariants.ts    # KNO-001..028 StackInvariant[]
    source/
      module.ts                           # knowledge-source KernelModule
      scan.ts                             # knowledge.source.scan
      status.ts                           # knowledge.source.status
      bind.ts                             # knowledge.source.bind
      verify.ts                           # knowledge.source.verify
    core/
      module.ts                           # knowledge-core KernelModule
      verify.ts                           # knowledge.verify
      status.ts                           # knowledge.status
      coverage.ts                         # knowledge.coverage
      audit.ts                            # knowledge.audit
      candidate-validate.ts              # knowledge.candidate.validate
      promote.ts                          # knowledge.promote
      transaction-status.ts              # knowledge.transaction.status
    extract/
      module.ts                           # knowledge-extract KernelModule
      list.ts                             # knowledge.extract.list
      run.ts                              # knowledge.extract.run
      verify.ts                           # knowledge.extract.verify
      refresh-prepare.ts                 # knowledge.refresh.prepare
      refresh-apply.ts                   # knowledge.refresh.apply
    materialize/
      module.ts                           # knowledge-materialize KernelModule
      materialize.ts                     # knowledge.materialize
      materialize-verify.ts             # knowledge.materialize.verify
      projection-status.ts              # knowledge.projection.status
      projection-build.ts               # knowledge.projection.build
    release/
      module.ts                           # knowledge-release KernelModule
      check.ts                            # knowledge.release.check
      evidence.ts                         # knowledge.release.evidence
      manifest.ts                         # knowledge.release.manifest
    hooks/
      materialize.ts                     # hooks.materialize
      build.ts                            # hooks.build
      check-gate.ts                      # hooks.checkGate
      release-evidence.ts               # hooks.releaseEvidence
      scaffold-project.ts               # hooks.scaffoldProject
```

### Command IO policy

- Source-reading commands declare `../<kb-id>-source/**` as `reads`
- No command declares source sibling paths as `writes`
- Canonical-mutating commands write only `knowledge/**` through a transaction layer
- Materialization writes only `.generated/**` and configured projection targets
- Build commands do not write canonical data

### Pipelines

The plugin registers logical pipelines through kernel modules:

- `knowledge.validate`: source.status → structural checks → evidence/graph checks → governance/boundary checks
- `knowledge.materialize-and-build`: knowledge.verify → materialize → projection builds → projection freshness
- `knowledge.release`: knowledge.verify --release → materialize → build → releaseEvidence
- `knowledge.refresh-transaction`: source.status → impact analysis → extractor runs → evidence re-anchor → staged delta verification

### Invariants

KNO-001..028 from `PLUGIN-INVARIANTS.md`, covering: manifest validity, source root naming, source metadata, source write safety, source drift, extractor policy, canonical schema validity, id uniqueness, evidence validity, claim support, relation ontology, epistemic status, canonical English, staging/laboratory leakage, governance decisions, coverage consistency, materialization determinism, secret scan, release license, projection freshness, and transaction safety.

## Rollout

- **Phase 1 (this RFC):** Create package structure, register all commands as stubs, implement hooks with orchestration logic, create Forge profile. Commands return meaningful placeholder results.
- **Phase 2 (future RFCs):** Implement domain logic for each command (source scanning, graph compilation, evidence validation, promotion policy, materialization).
- **Phase 3 (future):** AI skills (knowledge-discover, knowledge-ingest, knowledge-reconstruct, knowledge-review, knowledge-refresh) as Forge skills, not plugin runtime.

## Alternatives considered

1. **Extend werkstatt-site with knowledge commands:** Rejected — knowledge systems have fundamentally different path conventions, lifecycle, and source boundary model. Mixing them into the site plugin would violate the thin-plugin principle.

2. **Create a composite plugin wrapping site + knowledge:** Rejected — the spec explicitly forbids composite pseudo-plugins to bypass the one-plugin rule. Projection apps are ordinary Turborepo apps under the knowledge workshop.

3. **Wait for the certification component model before creating the plugin:** Rejected — the spec requires working within the current `plugin@1` contract. The plugin is structured as a thin adapter so future migration is direct.

4. **Add a new engine hook for knowledge orchestration:** Rejected — the spec explicitly confirms no new hook is needed. All knowledge lifecycle operations fit within the five existing hooks and kernel commands.

## Risks

- **Command stubs:** Phase 1 commands are stubs. Agents must not assume the commands perform real domain logic until Phase 2 implementation.
- **One-plugin constraint:** A workshop using `werkstatt-knowledge` cannot simultaneously use `werkstatt-site`. Projection apps that need Astro must be ordinary apps, not a second plugin.
- **Source bundle management:** The plugin does not manage the sibling source bundle. A separate source-maintenance process owns `../<kb-id>-source`.

## Acceptance criteria

- [ ] Package `@warpgogol/werkstatt-knowledge` created at `packages/werkstatt-knowledge/` with `package.json`, `tsconfig.json`, `eslint.config.js`
- [ ] Plugin entry `src/index.ts` exports `werkstattKnowledgePlugin: WerkstattPlugin` with `schema: "werkstatt/plugin@1"`, `id: "werkstatt-knowledge"`, `profileId: "knowledge-typescript-turborepo"`
- [ ] Path conventions: `contentDir: "knowledge"`, `distDir: ".generated/knowledge/dist"`, `entryPoints: ["knowledge/manifest.yaml", "knowledge/ontology/schema-registry.yaml"]`
- [ ] Invariants KNO-001..028 exported from `src/invariants/knowledge-invariants.ts`
- [ ] 5 kernel modules registered as `moduleLoaders`: `knowledge-source`, `knowledge-core`, `knowledge-extract`, `knowledge-materialize`, `knowledge-release`
- [ ] All ~23 kernel commands registered with correct `name`, `description`, `scope`, `cacheable: false`
- [ ] 5 hooks implemented: `materialize`, `build`, `checkGate`, `releaseEvidence`, `scaffoldProject`
- [ ] `deployAdapters` absent/empty
- [ ] Forge profile `knowledge-typescript-turborepo.yaml` created at `packages/forge/profiles/`
- [ ] `packages/AGENTS.md` updated with `werkstatt-knowledge` entry
- [ ] Root `AGENTS.md` updated with `werkstatt-knowledge` in plugin list and package taxonomy
- [ ] `pnpm install` succeeds
- [ ] `pnpm --filter @warpgogol/werkstatt-knowledge run typecheck` passes
- [ ] `pnpm --filter @warpgogol/werkstatt-knowledge run test` passes

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The plugin MUST import Diagnostic types from `@warpgogol/werkstatt/schemas` — no duplicate diagnostic schema.
- The plugin MUST NOT import from `@warpgogol/werkstatt-site` or any other stack plugin.
- The plugin MUST NOT be imported by the engine package (`@warpgogol/werkstatt`) — DNA-64.
- Command stubs MUST return properly typed `KernelCommandResult` objects with meaningful status.
- All file writes in hooks MUST use `writeFileIfChanged` from `@warpgogol/werkstatt/kernel`.
