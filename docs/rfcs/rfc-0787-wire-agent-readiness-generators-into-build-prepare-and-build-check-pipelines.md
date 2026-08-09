---
id: RFC-0787
title: "Wire agent readiness generators into build.prepare and build.check pipelines"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0028
  - RFC-0783
  - RFC-0784
  - RFC-0785
  - RFC-0786
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - build.prepare runs all agent readiness generators in correct order without manual intervention
  - build.check validates all agent readiness artifacts and reports drift
nonGoals:
  - New commands — this RFC only wires existing commands into pipelines
  - Command implementations — covered by RFC-0783 through RFC-0786
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0787: Wire agent readiness generators into build.prepare and build.check pipelines

## Context

RFC-0783 through RFC-0786 introduce new agent readiness generators: `agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.markdown-negotiation.generate`, and `agent.dns-aid.generate`. During implementation of those RFCs, the generators and validators were wired into the pipeline arrays individually. This RFC coordinates the final wiring state — it documents the canonical ordering in `SITES_BUILD_PREPARE_PIPELINE` and `SITES_CHECK_AUTHOR_PIPELINE`, and adjusts `SITES_BUILD_PREPARE_DEV_PIPELINE` to exclude `public/`-producing generators that are not needed for `astro dev`.

The existing production pipeline already runs `agent.manifest.generate` → `agent.dns-aid.generate` → `agent.openapi.generate` → `agent.api-catalog.generate` → `agent.mcp-card.generate` → `agent.routes.generate` → `agent.surface.sign` in `build.prepare`. The validators run inside `SITES_CHECK_AUTHOR_PIPELINE` (spread into `SITES_BUILD_CHECK_PIPELINE`). The dev pipeline currently includes `agent.api-catalog.generate` and `agent.mcp-card.generate` — this RFC removes them from the dev pipeline since they produce `public/.well-known/` artifacts not needed for `astro dev`.

## Problem

Without coordinated pipeline wiring, the new generators from RFC-0783 through RFC-0786 would need to be run manually. An operator who forgets to run `agent.api-catalog.generate` after `agent.manifest.generate` would deploy a site with a stale or missing API Catalog. The pipeline must automatically run all agent readiness generators in the correct dependency order and validate their output in `build.check`.

## Decision

The `SITES_BUILD_PREPARE_PIPELINE` already includes all new agent readiness generators before `agent.surface.sign` (manifest → dns-aid → openapi → api-catalog → mcp-card → routes → sign). This ordering is correct: all generators run before signing so the signed manifest is the authoritative artifact. The `SITES_CHECK_AUTHOR_PIPELINE` already includes the new validators (`agent.dns-aid.validate`, `agent.api-catalog.validate`, `agent.mcp-card.validate`) after `agent.surface.validate`. This RFC adjusts `SITES_BUILD_PREPARE_DEV_PIPELINE` to remove `agent.api-catalog.generate` and `agent.mcp-card.generate` (they produce `public/.well-known/` artifacts not needed for `astro dev`) and documents the canonical production pipeline state.

## Architectural fit

- **DNA-58** (generated-file determinism) — pipeline runs generators in deterministic order, ensuring reproducible builds. The linear pipeline array enforces a single canonical ordering for all agent readiness generators.
- **RFC-0028** (`.well-known/` discovery) — pipeline wiring ensures all discovery artifacts are generated and validated automatically. DNA-34 was reclassified to feature by RFC-0161; the governing RFC is RFC-0028.
- **Site OS operator model** — pipeline amendments are in `packages/werkstatt-site/src/checks/pipelines/`, the canonical location for pipeline definitions.
- **Dependency ordering** — generators that read the manifest (`agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.dns-aid.generate`) must run after `agent.manifest.generate`. `agent.markdown-negotiation.generate` must run after `page.markdown.generate` (it depends on twins existing). `public.infrastructure.generate` (which emits Link headers per RFC-0784) must run after the agent generators so Link headers can reference all endpoints. All agent generators run before `agent.surface.sign` so the signed manifest is authoritative.

## Design

### CLI surface

No new commands. This RFC amends pipeline arrays only.

### Pipeline amendments

**`SITES_BUILD_PREPARE_PIPELINE`** (in `build-prepare.ts`) — existing canonical ordering:

```ts
  { command: "agent.manifest.generate" },
  // RFC-0786: DNS-AID declaration (reads manifest)
  { command: "agent.dns-aid.generate" },
  // RFC-0289: OpenAPI projection
  { command: "agent.openapi.generate" },
  // RFC-0783: API Catalog + MCP Server Card (read manifest)
  { command: "agent.api-catalog.generate" },
  { command: "agent.mcp-card.generate" },
  // RFC-0290: Agent Gate route re-exports
  { command: "agent.routes.generate" },
  // RFC-0308: sign manifest, knowledge, OpenAPI (after all generators)
  { command: "agent.surface.sign" },
  // ... non-agent generators continue ...
  { command: "public.infrastructure.generate" }, // RFC-0784: Link headers
  // ... later in pipeline ...
  { command: "page.markdown.generate" },
  // RFC-0785: markdown content negotiation middleware (after twins exist)
  { command: "agent.markdown-negotiation.generate" },
```

All agent generators run before `agent.surface.sign` so the signed manifest is authoritative. No changes needed to the production pipeline ordering.

**`SITES_CHECK_AUTHOR_PIPELINE`** (in `sites-check-author.ts`) — validators already included:

```ts
  { command: "agent.surface.validate" },
  { command: "agent.openapi.validate" },
  // RFC-0786: DNS-AID TXT record validation
  { command: "agent.dns-aid.validate" },
  // RFC-0783: API Catalog + MCP Server Card validation
  { command: "agent.api-catalog.validate" },
  { command: "agent.mcp-card.validate" },
  { command: "agent.surface.verify" },
```

These validators are spread into `SITES_BUILD_CHECK_PIPELINE` via `...SITES_CHECK_AUTHOR_PIPELINE`. No changes needed.

**`SITES_BUILD_PREPARE_DEV_PIPELINE`** (in `build-prepare.ts`) — this RFC removes two steps:

```ts
  { command: "agent.manifest.generate" },
  { command: "agent.openapi.generate" },
  // RFC-0783: REMOVE from dev pipeline — produces public/.well-known/ artifacts
  // { command: "agent.api-catalog.generate" },  ← remove
  // { command: "agent.mcp-card.generate" },      ← remove
  { command: "agent.routes.generate" },
  { command: "agent.surface.sign" },
  // ... src/-producing generators continue ...
  // RFC-0785: markdown negotiation middleware (src/ artifact, needed in dev for testing)
  { command: "agent.markdown-negotiation.generate" },
```

`agent.dns-aid.generate` is already absent from the dev pipeline (it writes to `systems/<id>/dns-records.yaml`, a workspace-level file not needed for `astro dev`). `agent.markdown-negotiation.generate` writes to `src/middleware/markdown-negotiation.ts` — a `src/` artifact needed in dev for testing content negotiation, so it stays.

### TypeScript contracts

No new types. The pipeline arrays are `KernelPipelineStep[]` — the amendment is adding entries to existing arrays.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` | Amended — remove `agent.api-catalog.generate` and `agent.mcp-card.generate` from `SITES_BUILD_PREPARE_DEV_PIPELINE` |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` | No changes — validators already present |
| `packages/werkstatt-site/src/checks/pipelines/build-check.ts` | No changes — validators spread from `SITES_CHECK_AUTHOR_PIPELINE` |

No new files. Both `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` are defined in `build-prepare.ts`.

### Output format

No new output format. Pipeline steps produce the same `KernelCommandResult` as when run standalone.

### Failure modes

- **Generator fails in pipeline**: Pipeline aborts with non-zero exit code, same as any pipeline step failure. The operator sees which command failed and the error message.
- **`agent.enabled: false`**: All agent generators skip (return `status: "skip"`), pipeline continues. This is already the pattern for `agent.manifest.generate` and `agent.openapi.generate`.
- **Dev pipeline**: `SITES_BUILD_PREPARE_DEV_PIPELINE` includes agent generators that produce `src/` artifacts (manifest, openapi, routes, sign, markdown-negotiation) but excludes generators that produce `public/` artifacts (api-catalog, mcp-card) since those are not needed for `astro dev`. `agent.dns-aid.generate` is excluded because it writes to `systems/<id>/dns-records.yaml` (workspace-level, not needed for dev). `agent.markdown-negotiation.generate` is included because it writes to `src/middleware/markdown-negotiation.ts` (needed for testing in dev).

## Rollout

- **Adoption**: Pipeline amendments take effect on the next `build.prepare` run. All existing apps automatically get the new generators.
- **No flag day**: The new generators are additive — they produce new files without modifying existing output. Existing builds continue to work.
- **Dev pipeline**: The dev pipeline includes `src/`-producing agent generators (manifest, openapi, routes, sign, markdown-negotiation). The `public/`-producing generators (api-catalog, mcp-card) are excluded from dev — they are only needed for production builds. `agent.dns-aid.generate` is excluded because it writes to a workspace-level file, not a `src/` or `public/` artifact.
- **Dependency**: This RFC must be implemented after RFC-0783 through RFC-0786. The pipeline steps reference commands that must already be registered.

## Alternatives considered

1. **Standalone pipeline** — a separate `agent.readiness.pipeline` that runs independently. Rejected: agent readiness is part of the normal build, not a separate concern. A standalone pipeline would require operators to remember to run it.

2. **Conditional pipeline steps** — only run agent generators when `agent.enabled: true`. Rejected: the generators already handle the `agent.enabled: false` case internally (skip pattern). Adding pipeline-level conditionals would duplicate the skip logic.

## Risks

- **Build time**: Adding 4 generator steps and 3 validator steps increases build time. Each generator is ~100-300ms (pure functions reading a YAML manifest). Total impact: <2s.
- **Pipeline ordering bugs**: If generators run in the wrong order (e.g. `agent.api-catalog.generate` before `agent.manifest.generate`), they will fail with "no manifest found". Mitigation: the pipeline array is linear and the order is explicit.
- **Dev pipeline bloat**: Including all agent generators in the dev pipeline would slow down `astro dev` startup. Mitigation: only `src/`-producing generators are included in the dev pipeline.

## Acceptance criteria

- [ ] `SITES_BUILD_PREPARE_PIPELINE` includes `agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.dns-aid.generate` before `agent.surface.sign` and after `agent.manifest.generate`
- [ ] `SITES_BUILD_PREPARE_PIPELINE` includes `agent.markdown-negotiation.generate` after `page.markdown.generate`
- [ ] `SITES_CHECK_AUTHOR_PIPELINE` includes `agent.api-catalog.validate`, `agent.mcp-card.validate`, `agent.dns-aid.validate` after `agent.surface.validate`
- [ ] `SITES_BUILD_PREPARE_DEV_PIPELINE` excludes `agent.api-catalog.generate` and `agent.mcp-card.generate` (public/ producers not needed for dev)
- [ ] `SITES_BUILD_PREPARE_DEV_PIPELINE` includes `agent.markdown-negotiation.generate` (src/ producer needed for dev testing)
- [ ] `build.prepare` runs all new generators in correct order without manual intervention
- [ ] `build.check` validates all new artifacts and reports drift
- [ ] `agent.enabled: false` sites skip all new generators without errors
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0787` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0787 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- This RFC MUST be implemented after RFC-0783 through RFC-0786 — the pipeline steps reference commands registered by those RFCs.
- The dev pipeline (`SITES_BUILD_PREPARE_DEV_PIPELINE`) MUST NOT include `public/`-producing generators (api-catalog, mcp-card) — they are not needed for `astro dev` and would slow startup. `agent.dns-aid.generate` is also excluded (writes to workspace-level `systems/<id>/dns-records.yaml`). `agent.markdown-negotiation.generate` IS included (writes to `src/middleware/markdown-negotiation.ts`, needed for dev testing).
- Pipeline step ordering: `agent.api-catalog.generate` and `agent.mcp-card.generate` MUST run after `agent.manifest.generate` (they read the manifest). `agent.dns-aid.generate` MUST also run after `agent.manifest.generate`. `agent.markdown-negotiation.generate` MUST run after `page.markdown.generate` (it depends on twins existing). All agent generators MUST run before `agent.surface.sign` so the signed manifest is authoritative.
