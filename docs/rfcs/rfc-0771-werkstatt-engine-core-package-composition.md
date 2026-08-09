---
id: RFC-0771
title: "Werkstatt engine core package composition"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
  - RFC-0769
  - RFC-0770
  - DNA-53
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
  - DNA-2
  - DNA-51
  - DNA-52
  - DNA-53
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/os/site-kernel
  - packages/os/site-kernel-handoff
  - packages/os/site-kernel-deploy
  - packages/os/site-kernel-integrity
  - packages/os/site-kernel-observability
  - packages/os/site-kernel-changelog
  - packages/fingerprint
  - packages/agent-gate
  - packages/share
  - packages/ontology
successSignals:
  - "Module map covers every packages/os/* package (including site-kernel-check-warpgogol) and every packages/fingerprint export"
  - "No engine module imports Astro, sharp, playwright, or any stack-specific dependency; agent-gate/astro subpath moves to site plugin"
nonGoals:
  - "No physical code moves — that is RFC-0772"
  - "No plugin composition — that is RFC-0774..0778"
  - "No check-core or check-runner-node reclassification — these are site-plugin packages consumed by site-kernel-check-warpgogol; they are listed in the site plugin table but their internal structure is not mapped here"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0771: Werkstatt engine core package composition

## Context

Charter RFC-0769 defines `@warpgogol/werkstatt` as one consolidated engine package. Today the engine is spread across ~11 `packages/os/*` packages plus `packages/fingerprint` and parts of `packages/agent-gate`/`packages/share`. This RFC is the normative inventory: which module goes into the engine, which goes into the site plugin, and which stays workshop-local. RFC-0772 executes the moves; RFC-0774/0775 compose the site plugin.

## Problem

Without a normative module map, the consolidation (RFC-0772) would make ad hoc keep/move decisions per file, producing exactly the kind of hidden coupling the program exists to remove. The map must be decided once, reviewed by the operator, and then executed mechanically.

## Decision

The engine package `packages/werkstatt` (npm: `@warpgogol/werkstatt`) is composed as follows.

### Into the engine (stack-agnostic)

| Engine module | Source today | Notes |
| --- | --- | --- |
| `kernel/` | `packages/os/site-kernel` | registry, discovery, CLI, pipelines, cache, command manifest, commit-message, pipeline-budget, dht, swim, gitmesh, lagebild |
| `mission/` | `packages/os/site-kernel-handoff/src/mission` | mission lifecycle, workpiece, migrate; stack steps become plugin hooks (RFC-0770) |
| `sternsystem/` | `.../src/sternsystem` | registry IO, pin, sync, mirrors |
| `release/` | `.../src/release` | release state machine, manifests |
| `leitstand/` | `.../src/leitstand` | propagate/promote/rollback; build+gate become plugin hooks |
| `bordbuch/` | `.../src/bordbuch` | append-only log, commit helper |
| `notausgang/` | `.../src/notausgang` | emergency export |
| `artifact-store/` | `.../src/artifact-store` | content-addressed store |
| `evidence/` | `.../src/evidence` | R2 sync/fetch |
| `nachweis/` | `.../src/nachweis` | N3 verification lifecycle (RFC-0707): ingest, consent, sign, timestamp, verify, approve, publish; stack-agnostic (no Astro imports) |
| `subdomain/` | `.../src/subdomain` | subdomain registration/validation/listing for Leitstand deploy targets |
| `dns/` | `.../src/dns` | DNS record CRUD, validation, TXT normalization for deploy orchestration |
| `behavior-snapshot/` | `.../src/behavior-snapshot` | behavior snapshot generation/validation for release evidence |
| `migrators/` | `.../src/migrators` | forward migrator registry (86 items); data-structure migrations, stack-agnostic |
| `deploy/` | `.../src/deploy` + `packages/os/site-kernel-deploy` | adapter interface in engine; `client-export.ts` (workspace export with gitignore filtering) is stack-agnostic and stays in engine; concrete Cloudflare adapter moves to site plugin |
| `identity/` | `.../src/identity` | passport bootstrap glue |
| `werkstatt/` (primitives) | `.../src/werkstatt` | locks, idempotency, atomic staging, git-exec (DNA-51) |
| `integrity/` | `packages/os/site-kernel-integrity` | artifact hashing/signing |
| `observability/` | `packages/os/site-kernel-observability` | observability module |
| `fingerprint/` | `packages/fingerprint` | both entry points; DNA-53 rule carries over; exported as `@warpgogol/werkstatt/fingerprint`; phantom `@warpgogol/share` dependency in package.json is removed during RFC-0772 (no source imports exist) |
| `agent-gate/` (root) | `packages/agent-gate` (root entry `src/index.ts`) | framework-agnostic gate runtime: MCP handler, action pipeline, rate limiting; `import type` from `@warpgogol/share/agent` and `@warpgogol/ontology` resolved by rule 2 (types taken into `werkstatt/schemas`) |
| `changelog/` (framework) | `packages/os/site-kernel-changelog` (pipeline core) | AI changelog pipeline (collect → summarize → write) is stack-agnostic; `changelog-command.ts` and `changelog/` pipeline core stay in engine; site-specific renderers/targets (HTML output format, section templates) move to the site plugin |

### Into the site plugin (RFC-0774/0775 authority)

| Plugin module | Source today | Notes |
| --- | --- | --- |
| `site-kernel-astro` | `packages/os/site-kernel-astro` | Astro path conventions (thin adapter) |
| `site-kernel-checks` | `packages/os/site-kernel-checks` | content validation, Compass scaffolding, Axiom gate, methodologies config |
| `site-kernel-codegen` | `packages/os/site-kernel-codegen` | file generation: icons, open-source page, Compass backfill, content reference index |
| `site-kernel-content` | `packages/os/site-kernel-content` | Markdown collection, YAML frontmatter, semantic site model loading |
| `site-kernel-onboarding` | `packages/os/site-kernel-onboarding` | site scaffolding templates, token application |
| `site-kernel-audit` | `packages/os/site-kernel-audit` | deterministic + LLM content audit engine (consumed by site-kernel-checks) |
| `site-kernel-check-warpgogol` | `packages/os/site-kernel-check-warpgogol` | warpgogol-com specific check package; depends on site-kernel-astro, site-kernel-content, check-core, check-runner-node |
| `check-core` | `packages/check-core` | Zod schemas for check runs, evidence graphs, reports — site-check infrastructure |
| `check-runner-node` | `packages/check-runner-node` | Playwright-based evidence capture for site checks |
| `agent-gate/astro` | `packages/agent-gate/src/astro.ts` | Astro adapter: wires `createAgentGate` into Astro APIRoutes; imports `astro`, `astro:env/server`, `@warpgogol/integration` — all stack-specific |
| Cloudflare deploy adapter | `.../src/deploy` (concrete adapter) | concrete Cloudflare Workers deploy implementation; engine keeps the adapter interface only |
| changelog renderers | `packages/os/site-kernel-changelog` (renderers) | site-specific HTML output format, section templates |
| site domain packages | `packages/ui`, `packages/pbp`, `packages/ontology` (UI taxonomy), `packages/tokens`, `packages/share` (site remainder), `packages/growth`, `packages/integration`, `packages/chat`, `packages/faq`, `packages/content-source`, `packages/studio-gate`, `packages/pbp-rate-adapters` | full site capability from `@warpgogol/werkstatt-site` |

### Stays workshop-local (never published)

| Item | Source today | Notes |
| --- | --- | --- |
| `warpgogol-skills` | `packages/warpgogol-skills` | workshop-local skill pack (wg prefix) |
| `services/*` | `services/` | backend runtime compositions (cf-analytics-poller, check-warpgogol-runner, fleet-probe-runner, lagebild-sync-worker) |
| `integrations/*` | `integrations/` | truth-monitor, truth-sources — workshop-local external integrations |
| `fleet/*` | `fleet/` | fleet management artifacts |
| `tools/kernel.config.ts` | `tools/kernel.config.ts` | workshop composition point — imports engine + plugin |
| hooks | `hooks/` | pre-commit, pre-user-prompt, setup-worktree |
| docs | `docs/` | RFCs, ADRs, audits, plans, specs, authoring guides |

### Cross-cutting rules

1. **Dependency direction:** engine modules may depend only on other engine modules and third-party packages. Zero `@warpgogol/*` imports outside the engine (same autonomy discipline as forge, enforced by RFC-0772's guard). Type-only imports (`import type`) from `@warpgogol/share` or `@warpgogol/ontology` are resolved by rule 2 — the needed types are taken into `werkstatt/schemas`.
2. **`share`/`ontology` split:** engine modules that today import `@warpgogol/share` or `@warpgogol/ontology/operations` take the needed schemas with them into the engine (`werkstatt/schemas`); the site-facing remainder of `share`/`ontology` moves to the site plugin. The exact symbol-level split is executed in RFC-0772 with the rule: operations schemas (mission, release, leitstand, sternsystem, werkstatt, artifact-store, naming-policy) → engine; UI taxonomy, page/content schemas, cosmic catalogs, archetypes, shared-section-props, external-surfaces → site plugin. The `ontology` split is multi-dimensional: `src/operations/` → engine, `src/schemas/`, `src/cosmic/`, `src/archetypes/`, `src/shared-section-props/`, `src/external-surfaces/` → site plugin. `@warpgogol/integration` (imported only by `agent-gate/astro.ts`) stays in the site plugin.
3. **`agent-gate` split:** the root entry (`@warpgogol/agent-gate` → `src/index.ts`) is framework-agnostic and goes into the engine; the `/astro` subpath (`src/astro.ts`) is the only Astro-aware module and goes into the site plugin. The `MODULE_CONTRACT` in `index.ts` confirms: "astro.ts is the only astro-aware caller."
4. **Site-kernel name retirement:** the `site-kernel` CLI binary name is retired; the engine CLI is `werkstatt` (alias kept only inside this workshop's transition window in RFC-0776, then removed — no legacy).

## Architectural fit

- **DNA-64 (RFC-0769)** — this map is the boundary's concrete content. DNA-64 is not yet established in `docs/architecture-dna.md` (RFC-0769 is `draft`); this RFC cannot be `accepted` until RFC-0769 is `accepted` and DNA-64 is appended. This is a forward dependency — RFC-0771 is in the same wave as RFC-0770 and both depend on RFC-0769.
- **DNA-51/52/53** — consistency primitives, artifact store, and fingerprint governance move as intact modules; their invariants transfer verbatim to engine documentation. `satisfies[]` includes all three.
- **DNA-46..50** — mission/materialization/release/Leitstand/Notausgang semantics unchanged; only stack-specific steps are re-routed through RFC-0770 hooks.

## Design

### Engine package layout

```
packages/werkstatt/
├── package.json            → name: @warpgogol/werkstatt, bin: werkstatt
├── extract.config.yaml     → RFC-0773
├── src/
│   ├── kernel/  mission/  sternsystem/  release/  leitstand/
│   ├── bordbuch/  notausgang/  artifact-store/  evidence/
│   ├── deploy/  identity/  werkstatt/  integrity/  observability/
│   ├── fingerprint/  agent-gate/  changelog/
│   ├── plugin/             → RFC-0770 contract + registry
│   └── schemas/            → operations schemas taken from share/ontology
└── bin/werkstatt.ts
```

Subpath exports mirror today's per-package entry points (`@warpgogol/werkstatt/fingerprint`, `/fingerprint/semantic`, `/mission`, `/leitstand`, ...) so plugin and workshop imports stay flat and tree-shakeable.

### Decision protocol for unlisted files

For any file not covered by the map: (1) does it import a stack dependency (astro, sharp, playwright, parse5 for HTML checks)? → plugin; (2) is it consumed by mission/release/leitstand lifecycle? → engine; (3) otherwise → workshop-local. Ambiguous cases are logged in the RFC-0772 implementation plan for operator review.

## Rollout

This RFC is a specification; it has no runtime rollout. It is `implemented` when the module map is complete, reviewed, and referenced by RFC-0772's implementation plan.

## Alternatives considered

- **Keep handoff as a separate package.** Rejected: handoff IS the engine's lifecycle core; separating it recreates the version matrix problem.
- **Move `fingerprint` into the plugin.** Rejected: release hashing, artifact store, and build identity are engine concerns; DNA-53 is stack-agnostic.
- **Split changelog entirely into the site plugin.** Rejected: the pipeline (collect → summarize → write) is generic; only renderers/targets are site-specific.

## Risks

- **share/ontology symbol split underestimated.** `share` has 191 items; the operations/site boundary may cut through modules. The `ontology` split is multi-dimensional (operations → engine, schemas/cosmic/archetypes/shared-section-props/external-surfaces → site plugin). Mitigation: the split rule is by schema domain, and RFC-0772 plans the exact file list before moving.
- **Hidden Node-version or bundler assumptions** in kernel CLI when run from `node_modules` instead of workspace. Mitigation: RFC-0773 extraction smoke test runs the CLI from a packed tarball.

## Acceptance criteria

- [ ] Module map table reviewed and accepted by the operator
- [ ] Every `packages/os/*` package and `packages/fingerprint`, `packages/agent-gate` assigned to engine, plugin, or workshop-local
- [ ] Engine subpath export list drafted
- [ ] Decision protocol for unlisted files documented
- [ ] RFC-0772 references this map as its normative input
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
