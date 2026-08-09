---
id: RFC-0775
title: "Werkstatt site plugin domain layer consolidation"
status: draft
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
  - RFC-0769
  - RFC-0770
  - RFC-0774
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
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
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "All site domain packages consolidated into packages/werkstatt-site"
  - "warpgogol-com builds and deploys end-to-end using the consolidated plugin"
nonGoals:
  - "No engine modules — that is RFC-0774"
  - "No workshop migration — RFC-0776"
  - "No new domain features"
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

# RFC-0775: Werkstatt site plugin domain layer consolidation

## Context

RFC-0774 composes the engine half of `@warpgogol/werkstatt-site`. This RFC composes the **domain half**: the business-specific packages that make a site workshop produce real Astro sites — UI components, PBP entities, ontology, tokens, share utilities, growth adapters, integration adapters, chat, surface, geo, FAQ, passport, content-source, studio-gate, check-core, check-runner-node, and warpgogol-skills. Per operator decision, all site domain packages consolidate into the one site plugin package.

## Problem

Today these packages live as ~20 separate `packages/*` entries with cross-dependencies (see `docs/PACKAGE_GRAPH.md`). They are consumed by `packages/ui` (top-level consumer) and by site workpieces at build time. After the engine consolidation (RFC-0772), these packages still import engine types — but the engine no longer imports them. They need a single published home so that any site workshop gets the full site capability from one npm install.

## Decision

All site domain packages fold into `packages/werkstatt-site/src/domain/`:

| Domain module | Source today |
| --- | --- |
| `domain/ui/` | `packages/ui` (sections, components, icons, LordIcon assets) |
| `domain/pbp/` | `packages/pbp` + `packages/pbp-rate-adapters` |
| `domain/ontology/` | `packages/ontology` (UI taxonomy, cosmic catalogs — site-facing parts only; operations schemas went to engine per RFC-0771) |
| `domain/tokens/` | `packages/tokens` |
| `domain/share/` | `packages/share` (site-facing parts only; operations schemas went to engine) |
| `domain/growth/` | `packages/growth` + `packages/growth-adapter-matomo` + `packages/growth-adapter-null` + `packages/growth-adapter-plausible` |
| `domain/integration/` | `packages/integration` + `packages/integration-adapter-stripe` + `packages/integration-adapter-supabase-crm` |
| `domain/chat/` | `packages/chat` + `packages/chat-adapter-null` + `packages/chat-adapter-uchat` |
| `domain/surface/` | `packages/surface` |
| `domain/geo/` | `packages/geo` |
| `domain/faq/` | `packages/faq` |
| `domain/passport/` | `packages/passport` |
| `domain/content-source/` | `packages/content-source` |
| `domain/studio-gate/` | `packages/studio-gate` |
| `domain/check-core/` | `packages/check-core` |
| `domain/check-runner/` | `packages/check-runner-node` |
| `domain/observability/` | `packages/observability` |
| `domain/nebula/` | `packages/nebula` |
| `domain/star-map/` | `packages/star-map` |
| `domain/skills/` | `packages/warpgogol-skills` |

### Subpath exports

The plugin re-exports domain packages under `@warpgogol/werkstatt-site/<name>` (e.g. `@warpgogol/werkstatt-site/ui`, `@warpgogol/werkstatt-site/pbp`) so existing import specifiers in workpiece code map mechanically: `@warpgogol/ui` → `@warpgogol/werkstatt-site/ui`, etc. The RFC-0776 migration sweep performs this rewrite.

### Cross-cutting rules

1. **Intra-plugin imports only.** Domain modules may import each other and the engine (`@warpgogol/werkstatt`); they must not import `@warpgogol/forge` or workshop-local packages.
2. **LFS assets travel with the plugin.** `packages/ui` has LFS-tracked LordIcon JSON and PNG assets; these move into `domain/ui/` and the plugin's `.gitattributes` covers them. RFC-0773 verification gate catches LFS pointer issues.
3. **Skill packs.** `warpgogol-skills` becomes `domain/skills/` and is still discovered via `forge.yaml` `skillPacks` — the pack prefix `wg` and dir path change to point inside the plugin.

## Architectural fit

- **DNA-5, 17 (Mirror Quintet)** — UI sections/components keep their `.astro` + `.manifest.yaml` + `.css` + content `.md` + schema quintet; the plugin is the new home, the contract is unchanged.
- **DNA-20 (superseded by RFC-0471, PBP)** — PBP lives in `domain/pbp/`; the `pbp/*@1` namespace is preserved as `@warpgogol/werkstatt-site/pbp`.
- **DNA-56 (Studio Gate)** — `domain/studio-gate/` is the MCP server; it imports engine mission commands through the plugin's `moduleLoaders`, not through static engine imports.
- **DNA-64** — domain modules are inside the plugin, not the engine; the autonomy guard (RFC-0772) does not scan them.

## Design

### Package layout

```
packages/werkstatt-site/
├── src/
│   ├── paths/  checks/  codegen/  content/  onboarding/  audit/   ← RFC-0774
│   ├── deploy/  changelog/  build/  release-evidence/              ← RFC-0774
│   └── domain/
│       ├── ui/  pbp/  ontology/  tokens/  share/  growth/
│       ├── integration/  chat/  surface/  geo/  faq/  passport/
│       ├── content-source/  studio-gate/  check-core/  check-runner/
│       ├── observability/  nebula/  star-map/  skills/
│       └── index.ts          ← barrel re-exporting subpath exports
├── extract.config.yaml       ← RFC-0773
└── package.json
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt-site/src/domain/**` | Consolidated domain modules |
| old `packages/{ui,pbp,ontology,tokens,share,growth,...}` | Deleted after move |

### Failure modes

No new failure modes beyond those of the individual packages. The consolidation is mechanical: imports change, behavior does not.

## Rollout

- Executed in the same wave as RFC-0774; the two RFCs share a single `packages/werkstatt-site` target.
- Domain packages move after engine modules (RFC-0774) so that `domain/` can import from `src/` engine modules already in place.
- The RFC-0776 migration sweep rewrites all workpiece and workshop imports from `@warpgogol/<old>` to `@warpgogol/werkstatt-site/<name>`.

## Alternatives considered

- **Keep domain packages as separate npm packages.** Rejected by the operator: any site workshop gets the full site capability from one install.
- **Leave domain packages in the workshop, not published.** Rejected by the operator: other site workshops would have to reinvent or copy them.

## Risks

- **Package size.** `packages/ui` alone is the largest package in the monorepo (2683 items). The consolidated plugin will be very large. Mitigation: subpath exports keep tree-shaking effective; consumers only pull what they import.
- **LFS binary assets.** LordIcon JSON files, PNGs. RFC-0773 verification gate (step 3) catches pointer files.
- **`share`/`ontology` split boundary.** RFC-0771 sends operations schemas to the engine; the site-facing remainder comes here. The split must be clean — no circular imports between `domain/share/` and engine `src/schemas/`.

## Acceptance criteria

- [ ] All site domain packages moved into `packages/werkstatt-site/src/domain/`
- [ ] Subpath exports `@warpgogol/werkstatt-site/<name>` work for each domain module
- [ ] `packages/ui` sections and components build and render correctly in warpgogol-com
- [ ] LFS assets materialize correctly in extraction dry-run (RFC-0773)
- [ ] Old domain package directories deleted
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
