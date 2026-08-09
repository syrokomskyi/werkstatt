---
id: RFC-0787
title: "Wire agent readiness generators into build.prepare and build.check pipelines"
status: draft
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
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-34
  - RFC-0783
  - RFC-0784
  - RFC-0785
  - RFC-0786
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-34
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
  changed:
    - SITES_BUILD_PREPARE_PIPELINE
    - SITES_BUILD_PREPARE_DEV_PIPELINE
    - SITES_BUILD_CHECK_PIPELINE
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

RFC-0783 through RFC-0786 introduce new agent readiness generators: `agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.markdown-negotiation.generate`, and `agent.dns-aid.generate`. Each RFC specifies pipeline integration individually. This RFC coordinates the wiring — it amends the `SITES_BUILD_PREPARE_PIPELINE`, `SITES_BUILD_PREPARE_DEV_PIPELINE`, and `SITES_BUILD_CHECK_PIPELINE` arrays in `packages/werkstatt-site/src/checks/pipelines/` to include all new generators and validators in the correct order with correct dependencies.

The existing pipeline already runs `agent.manifest.generate` → `agent.openapi.generate` → `agent.routes.generate` → `agent.surface.sign` in `build.prepare`. The new generators must slot into this sequence.

## Problem

Without coordinated pipeline wiring, the new generators from RFC-0783 through RFC-0786 would need to be run manually. An operator who forgets to run `agent.api-catalog.generate` after `agent.manifest.generate` would deploy a site with a stale or missing API Catalog. The pipeline must automatically run all agent readiness generators in the correct dependency order and validate their output in `build.check`.

## Decision

The `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` arrays are amended to include the new agent readiness generators after `agent.surface.sign` and before `public.infrastructure.generate`. The `SITES_BUILD_CHECK_PIPELINE` is amended to include the new validators after `agent.surface.validate` (which already runs in `SITES_CHECK_AUTHOR_PIPELINE`).

## Architectural fit

- **DNA-34** (`.well-known/` discovery) — pipeline wiring ensures all discovery artifacts are generated and validated automatically.
- **DNA-58** (generated-file determinism) — pipeline runs generators in deterministic order, ensuring reproducible builds.
- **Site OS operator model** — pipeline amendments are in `packages/werkstatt-site/src/checks/pipelines/`, the canonical location for pipeline definitions.
- **Dependency ordering** — generators that read the manifest (`agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.dns-aid.generate`) must run after `agent.manifest.generate`. `agent.markdown-negotiation.generate` must run after `page.markdown.generate`. `public.infrastructure.generate` (which emits Link headers per RFC-0784) must run after the agent generators so Link headers can reference all endpoints.

## Design

### CLI surface

No new commands. This RFC amends pipeline arrays only.

### Pipeline amendments

**`SITES_BUILD_PREPARE_PIPELINE`** (and `SITES_BUILD_PREPARE_DEV_PIPELINE` where applicable):

```ts
// After agent.surface.sign (line ~77 in build-prepare.ts):
  { command: "agent.surface.sign" },
  // RFC-0783: API Catalog + MCP Server Card generators (read manifest)
  { command: "agent.api-catalog.generate" },
  { command: "agent.mcp-card.generate" },
  // RFC-0786: DNS-AID declaration generator (reads manifest)
  { command: "agent.dns-aid.generate" },
  // ... existing generators continue ...
  { command: "public.infrastructure.generate" }, // RFC-0784: Link headers
  // ... existing generators continue ...
  { command: "page.markdown.generate" },
  // RFC-0785: Markdown content negotiation Pages Function (after twins exist)
  { command: "agent.markdown-negotiation.generate" },
```

**`SITES_BUILD_CHECK_PIPELINE`**:

```ts
// After SITES_CHECK_AUTHOR_PIPELINE (which includes agent.surface.validate):
  ...SITES_CHECK_AUTHOR_PIPELINE,
  // RFC-0783: validate API Catalog + MCP Server Card
  { command: "agent.api-catalog.validate" },
  { command: "agent.mcp-card.validate" },
  // RFC-0786: validate DNS-AID declaration
  { command: "agent.dns-aid.validate" },
  // ... existing checks continue ...
```

### TypeScript contracts

No new types. The pipeline arrays are `KernelPipelineStep[]` — the amendment is adding entries to existing arrays.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` | Amended — add 4 new generator steps |
| `packages/werkstatt-site/src/checks/pipelines/build-check.ts` | Amended — add 3 new validator steps |

No new files. No changes to `build-prepare-dev.ts` — it imports from `build-prepare.ts`.

### Output format

No new output format. Pipeline steps produce the same `KernelCommandResult` as when run standalone.

### Failure modes

- **Generator fails in pipeline**: Pipeline aborts with non-zero exit code, same as any pipeline step failure. The operator sees which command failed and the error message.
- **`agent.enabled: false`**: All agent generators skip (return `status: "skip"`), pipeline continues. This is already the pattern for `agent.manifest.generate` and `agent.openapi.generate`.
- **Dev pipeline**: `SITES_BUILD_PREPARE_DEV_PIPELINE` includes the agent generators that produce `src/` artifacts (manifest, openapi, routes, sign) but excludes generators that produce `public/` artifacts (api-catalog, mcp-card, dns-aid, markdown-negotiation) since those are not needed for `astro dev`.

## Rollout

- **Adoption**: Pipeline amendments take effect on the next `build.prepare` run. All existing apps automatically get the new generators.
- **No flag day**: The new generators are additive — they produce new files without modifying existing output. Existing builds continue to work.
- **Dev pipeline**: The dev pipeline includes only `src/`-producing agent generators (manifest, openapi, routes, sign). The `public/`-producing generators (api-catalog, mcp-card, dns-aid, markdown-negotiation) are excluded from dev — they are only needed for production builds.
- **Dependency**: This RFC must be implemented after RFC-0783 through RFC-0786. The pipeline steps reference commands that must already be registered.

## Alternatives considered

1. **Standalone pipeline** — a separate `agent.readiness.pipeline` that runs independently. Rejected: agent readiness is part of the normal build, not a separate concern. A standalone pipeline would require operators to remember to run it.

2. **Conditional pipeline steps** — only run agent generators when `agent.enabled: true`. Rejected: the generators already handle the `agent.enabled: false` case internally (skip pattern). Adding pipeline-level conditionals would duplicate the skip logic.

## Risks

- **Build time**: Adding 4 generator steps and 3 validator steps increases build time. Each generator is ~100-300ms (pure functions reading a YAML manifest). Total impact: <2s.
- **Pipeline ordering bugs**: If generators run in the wrong order (e.g. `agent.api-catalog.generate` before `agent.manifest.generate`), they will fail with "no manifest found". Mitigation: the pipeline array is linear and the order is explicit.
- **Dev pipeline bloat**: Including all agent generators in the dev pipeline would slow down `astro dev` startup. Mitigation: only `src/`-producing generators are included in the dev pipeline.

## Acceptance criteria

- [ ] `SITES_BUILD_PREPARE_PIPELINE` includes `agent.api-catalog.generate`, `agent.mcp-card.generate`, `agent.dns-aid.generate` after `agent.surface.sign`
- [ ] `SITES_BUILD_PREPARE_PIPELINE` includes `agent.markdown-negotiation.generate` after `page.markdown.generate`
- [ ] `SITES_BUILD_CHECK_PIPELINE` includes `agent.api-catalog.validate`, `agent.mcp-card.validate`, `agent.dns-aid.validate`
- [ ] `SITES_BUILD_PREPARE_DEV_PIPELINE` includes only `src/`-producing agent generators (no `public/` generators)
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
- The dev pipeline (`SITES_BUILD_PREPARE_DEV_PIPELINE`) MUST NOT include `public/`-producing generators (api-catalog, mcp-card, dns-aid, markdown-negotiation) — they are not needed for `astro dev` and would slow startup.
- Pipeline step ordering: `agent.api-catalog.generate` and `agent.mcp-card.generate` MUST run after `agent.manifest.generate` (they read the manifest). `agent.dns-aid.generate` MUST also run after `agent.manifest.generate`. `agent.markdown-negotiation.generate` MUST run after `page.markdown.generate` (it depends on twins existing).
