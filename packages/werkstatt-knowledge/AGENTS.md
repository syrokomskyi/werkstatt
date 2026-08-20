# AGENTS.md

## Project

`@warpgogol/werkstatt-knowledge` — Werkstatt plugin for evidence-backed knowledge systems. Implements `werkstatt/plugin@1` with `profileId: "knowledge-typescript-turborepo"`. Provides 5 kernel modules (source, core, extract, materialize, release), 5 lifecycle hooks (materialize, build, checkGate, releaseEvidence, scaffoldProject), and KNO-001..028 stack invariants.

Priorities when modifying:

1. Preserve plugin contract compliance (`werkstatt/plugin@1`).
2. Keep knowledge domain logic isolated from plugin entry object for future certification migration.
3. Make small, typed, and testable changes.
4. Do not break invariants KNO-001..028 or existing commands.

## Stack

- TypeScript (strict)
- Turborepo (workspace orchestration)
- pnpm

Use existing versions from `package.json`. Do not add dependencies if the task can be solved with TypeScript or already-installed packages.

## Commands

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run test
```

Before finishing a change, always run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
```

If commands fail due to environment, state this explicitly — do not claim verification passed.

## Structure

```text
src/
  index.ts                          # Plugin entry — werkstattKnowledgePlugin
  paths/
    knowledge-paths.ts              # Knowledge path conventions
  invariants/
    knowledge-invariants.ts         # KNO-001..028 stack invariant declarations
  source/
    module.ts                       # knowledge-source module registration
    scan.ts                         # knowledge.source.scan (KNO-002, KNO-025)
    status.ts                       # knowledge.source.status (KNO-005)
    bind.ts                         # knowledge.source.bind
    verify.ts                       # knowledge.source.verify (KNO-003, KNO-004, KNO-028)
  core/
    module.ts                       # knowledge-core module registration
    verify.ts                       # knowledge.verify (KNO-001, KNO-007..015, KNO-023..024)
    status.ts                       # knowledge.status
    coverage.ts                     # knowledge.coverage (KNO-018)
    audit.ts                        # knowledge.audit (KNO-016..017, KNO-020)
    candidate-validate.ts           # knowledge.candidate.validate
    promote.ts                      # knowledge.promote (KNO-026)
    transaction-status.ts           # knowledge.transaction.status
  extract/
    module.ts                       # knowledge-extract module registration
    list.ts                         # knowledge.extract.list
    run.ts                          # knowledge.extract.run (KNO-006)
    verify.ts                       # knowledge.extract.verify
    refresh-prepare.ts              # knowledge.refresh.prepare
    refresh-apply.ts                # knowledge.refresh.apply
  materialize/
    module.ts                       # knowledge-materialize module registration
    materialize.ts                  # knowledge.materialize
    materialize-verify.ts           # knowledge.materialize.verify (KNO-019, KNO-027)
    projection-status.ts            # knowledge.projection.status
    projection-build.ts             # knowledge.projection.build
  release/
    module.ts                       # knowledge-release module registration
    check.ts                        # knowledge.release.check (KNO-021, KNO-022)
    evidence.ts                     # knowledge.release.evidence
    manifest.ts                     # knowledge.release.manifest
  hooks/
    index.ts                        # Hooks barrel export
    materialize.ts                  # hooks.materialize
    build.ts                        # hooks.build
    check-gate.ts                   # hooks.checkGate
    release-evidence.ts             # hooks.releaseEvidence
    scaffold-project.ts             # hooks.scaffoldProject
```

## Plugin contract

| Field | Value |
| --- | --- |
| `schema` | `werkstatt/plugin@1` |
| `id` | `werkstatt-knowledge` |
| `profileId` | `knowledge-typescript-turborepo` |
| `moduleLoaders` | `knowledge-source`, `knowledge-core`, `knowledge-extract`, `knowledge-materialize`, `knowledge-release` |
| `deployAdapters` | (none — v1 has no deploy adapters) |
| `hooks` | `materialize`, `build`, `checkGate`, `releaseEvidence`, `scaffoldProject` |
| `paths` | `knowledge` (contentDir), `.generated/knowledge/dist` (distDir), `knowledge/manifest.yaml` + `knowledge/ontology/schema-registry.yaml` (entryPoints) |
| `invariants` | KNO-001..028 |

## Architectural constraints

- Do NOT import from `@warpgogol/werkstatt-site` or any other stack plugin.
- Do NOT import from the engine package beyond plugin contract types and kernel types.
- Do NOT add deploy adapters — SPEC-v1.0 section 7 explicitly requires empty.
- Do NOT add new engine hooks — the hook list is closed at five.
- Do NOT add AI orchestration or skills inside the plugin.
- Keep knowledge domain logic isolated from the plugin entry object for future certification migration.

## RFC-0855

All 25 packets (000–240) are completed. The checked-in `werkstatt/plugin@1` entry is a **legacy code fact** — it still loads and functions, but is architecturally superseded. Do not add a plugin compatibility adapter, import this package into the engine, or enable untrusted production artifacts.

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `lint`        | `pnpm exec eslint "src/**/*.ts"`          |
| `typecheck`   | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Invariants

| ID | Description | Check |
| --- | --- | --- |
| KNO-001 | Canonical manifest id exists and is valid | `knowledge.verify` |
| KNO-002 | Source root resolves only as ../<kb-id>-source | `knowledge.source.scan` |
| KNO-003 | Registered source unit has valid README/package version metadata | `knowledge.source.verify` |
| KNO-004 | No KB operation writes/mutates source bundle/payload | `knowledge.source.verify` |
| KNO-005 | Current source fingerprint/version matches canonical binding for release | `knowledge.source.status` |
| KNO-006 | Source-controlled code is not executed by default extractor policy | `knowledge.extract.run` |
| KNO-007 | knowledge/ contains only schema-valid canonical record forms | `knowledge.verify` |
| KNO-008 | Canonical record ids are unique and keys/aliases do not collide | `knowledge.verify` |
| KNO-009 | All evidence resolves to current source binding | `knowledge.verify` |
| KNO-010 | Required semantic claims/relations have sufficient evidence/review | `knowledge.verify` |
| KNO-011 | All relation types are registered and domain/range valid | `knowledge.verify` |
| KNO-012 | Canonical epistemic status excludes speculation | `knowledge.verify` |
| KNO-013 | Canonical human-authored semantic language is English | `knowledge.verify` |
| KNO-014 | staging/ records are excluded from canonical export | `knowledge.verify` |
| KNO-015 | laboratory/ records cannot appear as canonical authority | `knowledge.verify` |
| KNO-016 | Global ontology/normative changes reference accepted RFC | `knowledge.audit` |
| KNO-017 | Cross-game concept admission/merge/split references accepted decision | `knowledge.audit` |
| KNO-018 | Coverage claims satisfy denominator/verifier rules | `knowledge.coverage` |
| KNO-019 | Materialized/projection canonical hash matches current canonical state | `knowledge.materialize.verify` |
| KNO-020 | No public/repository secrets detected | `knowledge.audit` |
| KNO-021 | Public release has explicit dataset license/publication metadata | `knowledge.release.check` |
| KNO-022 | Public evidence excerpts obey per-source publication policy | `knowledge.release.check` |
| KNO-023 | Generated similarity does not appear as an unreviewed canonical relation | `knowledge.verify` |
| KNO-024 | Workshop resolves werkstatt-knowledge as the sole current Werkstatt plugin | `knowledge.verify` |
| KNO-025 | Source bundle is outside npm/Turbo workspace globs | `knowledge.source.scan` |
| KNO-026 | Canonical mutation uses transaction/promotion pathway | `knowledge.promote` |
| KNO-027 | Materialization is deterministic for identical canonical input/builder version | `knowledge.materialize.verify` |
| KNO-028 | Open source-unit evidence uses resolvable repo/commit/path metadata when available | `knowledge.source.verify` |
