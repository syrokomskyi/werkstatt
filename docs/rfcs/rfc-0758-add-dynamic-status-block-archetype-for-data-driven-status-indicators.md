---
id: RFC-0758
title: "Add dynamic-status-block archetype for data-driven status indicators"
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
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0757
  - RFC-0026
  - RFC-0047
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-17
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/ui"
  - "@warpgogol/ontology"
successSignals:
  - "A new `dynamic-status-block` archetype is registered in the archetype catalog with a cosmic name, semantic role, and props schema."
  - "The section renders a data-driven status indicator (e.g. open-mandate counter, live capacity meter) from build-time or runtime data without requiring custom code per site."
  - "The archetype is available to all sites via `section.scaffold` and the standard block-declarative page composition pipeline."
nonGoals:
  - "Does not introduce a real-time data fetching mechanism — the block reads build-time data or server-side injected values, not client-side API polling."
  - "Does not add a new Site OS command — the archetype is a UI section, not a pipeline step."
  - "Does not replace the `impact` or `social-proof` archetypes — those are for static curated content, not data-driven indicators."
  - "Does not define the data source contract — the block receives data via props; how the data is fetched or generated is the site's composition responsibility."
  - "Does not add client-side hydration or React islands — the block renders at build time (SSG) or via server-side data injection."
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

# RFC-0758: Add dynamic-status-block archetype for data-driven status indicators

## Context

The platform's archetype catalog (`packages/ontology/archetypes/sections/`) includes 28 section archetypes covering common page patterns: hero, approach, comparison-cards, faq-list, final-cta, send-message, etc. All are static-content sections — their content is authored in page block props and rendered at build time.

A new page planned for warpgogol-com ("Відповідальні рекомендації" — Responsible Recommendations) includes a section showing the current number of open mandates ("Відкритих мандатів: 1"). This is a data-driven status indicator — the value changes over time and is not authored content. None of the existing 28 archetypes cover this pattern:

- `impact` — static curated stats (e.g. "50 projects delivered")
- `social-proof` — static testimonials
- `transparency` — static transparency claims
- `markdown` — static authored content

The closest is `impact`, but it is designed for curated static statistics with `stats[]` arrays, not for a single data-driven counter that reads from an external source at build time.

## Problem

1. **No archetype for data-driven status.** Sites that need to display a single data-driven value (open mandate count, live capacity, available slots, active projects) have no shared archetype. They must either misuse `impact` (designed for static curated stats) or `markdown` (designed for static authored content), or build a site-local section — which violates the composition-only principle.

2. **Forced workarounds.** Without a proper archetype, sites either hardcode the value (stale data) or create a site-local section (code in a thin site). Both are wrong: hardcoded values drift, and site-local sections fragment the shared UI catalog.

3. **No build-time data injection pattern.** The block-declarative page system (DNA-24, RFC-0026) supports `contentRef` for prose and `{collection.file.field}` references for business data, but there is no section archetype designed specifically to render a single data-driven indicator value with a label and optional context text.

## Decision

A new `dynamic-status-block` archetype is added to the shared archetype catalog. It renders a single data-driven status indicator: a value, a label, and optional context text. The value is injected via block props at build time (from content collections, derived data, or `{collection.file.field}` references). The archetype follows the standard section framework (SectionShell + SectionHeader + body) and uses `--ds-*` biome tokens for all visual styling.

## Architectural fit

- **DNA-17 (Uni manifest contract):** The new archetype ships a colocated `manifest.yaml` declaring `id`, `cosmicName`, `layer: section`, `semanticId`, `role`, `version`, `intent[]`, `industryFit[]`, and `contentSchemaKey`. The archetype YAML in `packages/ontology/archetypes/sections/` is the authoritative schema.
- **DNA-19 (Closed ontology vocabularies):** The `semanticRole` is a new value derived from the archetype catalog (open type alias since RFC-0084). The `cosmicName` is a `PlanetName` from the `PlanetCatalog` — no new cosmic names are added.
- **DNA-24 (Block-declarative pages):** The archetype is consumed via `blocks[].type: dynamic-status-block` in page content files. No `.astro` file is needed in sites — the section is rendered by the shared `buildPage` pipeline.
- **RFC-0026 (Block-declarative pages):** The archetype participates in the standard block composition pipeline. Its `propsSchema` composes shared section-props fragments (`section-visual`, `section-header`).
- **RFC-0047 (Thin apps):** The section implementation lives in `packages/ui/src/sections/dynamic-status-block/`. Sites reference it via `type: dynamic-status-block` in their page block configuration — no site-local code.
- **RFC-0101..0107 (Section framework):** The section is a thin dispatcher composed of `<SectionShell>` → `<SectionHeader>` → body (value + label + context). All visual styling flows through `--ds-*` biome tokens.
- **Layer C:** No URL, JSON-LD, or sitemap changes — `breaksC: false`.

## Design

### CLI surface

The section is materialized by the existing `section.scaffold` command:

```sh
pnpm exec site-kernel run section.scaffold --archetype dynamic-status-block --site warpgogol-com
```

No new commands. The archetype is registered in the archetype catalog and consumed via standard block-declarative page composition.

### TypeScript contracts

```ts
// Archetype propsSchema (Zod shape)
interface DynamicStatusBlockProps {
  // Composed from section-visual + section-header
  value: string | number;         // The data-driven indicator value
  label: string;                  // Label shown next to the value (e.g. "Open mandates")
  contextText?: string;           // Optional explanatory text below the value
  valuePrefix?: string;           // Optional prefix (e.g. currency symbol)
  valueSuffix?: string;           // Optional suffix (e.g. " available")
  tone?: "default" | "success" | "warning" | "muted";  // Visual tone of the value
  animated?: boolean;             // Optional count-up animation (RFC-0040 style)
}
```

The archetype YAML:

```yaml
id: dynamic-status-block
displayName: Dynamic status block
version: 1.0.0
semanticRole: data-driven-status-indicator
expectedIntents:
  - build-trust
  - establish-identity
  - clarify-positioning
expectedIndustryFit:
  - trades-and-construction
  - consulting-and-coaching
  - legal-services
  - non-profit
layoutHint: single-column
bodyKind: composite
propsSchema:
  $shape: zod
  compose:
    - section-visual
    - section-header
  shape: |
    z.object({
      value: z.union([z.string(), z.number()]),
      label: z.string().min(1),
      contextText: z.string().optional(),
      valuePrefix: z.string().optional(),
      valueSuffix: z.string().optional(),
      tone: z.enum(["default", "success", "warning", "muted"]).optional(),
      animated: z.boolean().optional(),
    }).strict()
acceptedCosmicNames:
  - <picked by cosmic.name.pick during section.scaffold>
constraints: {}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/archetypes/sections/dynamic-status-block.yaml` | New archetype definition with propsSchema, semanticRole, acceptedCosmicNames |
| `packages/ontology/archetypes/index.yaml` | Register `dynamic-status-block` in `blockTypeToCosmicName`, `roleByCosmicName`, `planetImportPaths` |
| `packages/ui/src/sections/dynamic-status-block/dynamic-status-block-section.astro` | Section template: SectionShell + SectionHeader + value/label/context rendering |
| `packages/ui/src/sections/dynamic-status-block/dynamic-status-block-section.manifest.yaml` | Section manifest with `archetype: dynamic-status-block`, cosmicName, propsSchema |
| `packages/ui/src/sections/dynamic-status-block/dynamic-status-block-section.types.ts` | TypeScript prop shape |
| `packages/ui/src/sections/dynamic-status-block/dynamic-status-block-section.css` | Colocated CSS using only `--ds-*` tokens |
| `packages/ui/src/sections/dynamic-status-block/dynamic-status-block-section.story.md` | At least one realistic props example |
| `packages/share/src/page.ts` | Add `PLANET_IMPORT_PATHS` entry for the picked cosmic name |

### Output format

No `--json` output. The section renders as HTML at build time via the standard `buildPage` pipeline.

### Failure modes

- **Missing value prop:** `page.block.validate` fails at build time with a props schema violation — the `value` field is required.
- **Non-numeric value with `animated: true`:** If `value` is a string and `animated` is true, the animation is skipped and the value is rendered as-is. A `console.warn` is emitted at build time.
- **Empty `contextText`:** If `contextText` is absent or empty, only the value and label are rendered — no context section.

## Rollout

- **Materialization:** The section is created via `section.scaffold` which generates the full file set (archetype YAML, section files, manifest, CSS, story). The cosmic name is picked by `cosmic.name.pick` from the `PlanetCatalog`.
- **warpgogol-com adoption:** The "Відповідальні рекомендації" page (separate RFC) will use `type: dynamic-status-block` in its block configuration with a `{collection.file.field}` reference or hardcoded value for the open-mandate count.
- **New sites:** Available to all sites via standard block-declarative page composition. No migration needed — the archetype is additive.
- **Pipeline integration:** `section.contract.validate` in `PACKAGES_CHECK_PIPELINE` validates the new section's manifest, archetype reference, and cosmic name. `page.block.validate` validates block props against the archetype's `propsSchema`.
- **No migrator needed:** The archetype is additive — no existing blocks are changed or removed.

## Alternatives considered

- **Misuse the `impact` archetype.** Rejected — `impact` is designed for static curated statistics with a `stats[]` array (e.g. "50 projects", "12 years experience"). It has no single-value data-driven indicator pattern and no `contextText` field. Using it for a dynamic counter would require props outside its schema.

- **Site-local section.** Rejected — the operator decided that all archetypes remain shared. A site-local section for a data-driven status indicator would fragment the UI catalog and prevent reuse by other sites.

- **Use `markdown` with inline value.** Rejected — `markdown` renders authored prose content. A data-driven value would need to be injected into the markdown at build time, which is not how `contentRef` works. The value would be stale unless manually updated.

- **Extend `impact` with a `dynamicValue` prop.** Rejected — `impact` has a specific semantic role (`impact-highlight`) and `bodyKind: stats`. Adding a single-value data-driven mode would overload the archetype and confuse its intent. A separate archetype is cleaner.

## Risks

- **Data freshness.** The block renders at build time (SSG). The value is only as fresh as the last build. For truly real-time indicators (e.g. "3 spots left, updating live"), this archetype is insufficient. Mitigation: the archetype is designed for build-time data injection, not real-time updates. Sites needing real-time data should use a client-side hydrated island (separate concern).

- **Archetype proliferation.** Adding a new archetype for every niche use case could inflate the catalog. Mitigation: `dynamic-status-block` is a general pattern (data-driven single-value indicator) that is broadly reusable, not a one-site-specific section. The `impact` archetype covers multi-stat curated grids; this covers single-value data-driven indicators.

- **Cosmic name collision.** The `acceptedCosmicNames` list must use a free `PlanetName` from the `PlanetCatalog`. Mitigation: `cosmic.name.pick` during `section.scaffold` selects a free name automatically.

- **Agent misinterpretation.** Agents may confuse `dynamic-status-block` with `impact`. Mitigation: the `Implementation notes for agents` section clarifies the distinction: `impact` = static curated stats grid; `dynamic-status-block` = single data-driven value with label and context.

## Acceptance criteria

- [ ] `dynamic-status-block.yaml` archetype created in `packages/ontology/archetypes/sections/` with `propsSchema` (value, label, contextText?, valuePrefix?, valueSuffix?, tone?, animated?), `semanticRole: data-driven-status-indicator`, `bodyKind: composite`, and `acceptedCosmicNames` (evidence: archetype YAML file)
- [ ] Archetype registered in `packages/ontology/archetypes/index.yaml` (`blockTypeToCosmicName`, `roleByCosmicName`, `planetImportPaths`) (evidence: index.yaml entries)
- [ ] Section files created in `packages/ui/src/sections/dynamic-status-block/` via `section.scaffold` (`.astro`, `.manifest.yaml`, `.types.ts`, `.css`, `.story.md`) (evidence: file set exists)
- [ ] `PLANET_IMPORT_PATHS` updated in `packages/share/src/page.ts` for the picked cosmic name (evidence: page.ts entry)
- [ ] `section.contract.validate` passes for the new section (evidence: validator output, zero violations)
- [ ] `page.block.validate` accepts `type: dynamic-status-block` blocks with valid props (evidence: validator output)
- [ ] `AGENTS.md` updated where agent behavior rules changed (evidence: `packages/ui/AGENTS.md` or `packages/ontology/AGENTS.md` if needed)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Draft RFCs cannot grant implementation permission.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST use `section.scaffold` to materialize the section — never copy a sibling section folder. The scaffold command guarantees the file set, manifest fields, propsSchema wiring, and import-path registration.
- Agents MUST NOT confuse `dynamic-status-block` with `impact`: `impact` = static curated multi-stat grid; `dynamic-status-block` = single data-driven value with label and optional context.
- Agents MUST NOT add client-side hydration or React islands to this section — it renders at build time (SSG). Real-time data is out of scope.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
