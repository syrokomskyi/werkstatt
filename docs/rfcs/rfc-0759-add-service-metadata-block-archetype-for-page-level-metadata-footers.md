---
id: RFC-0759
title: "Add service-metadata-block archetype for page-level metadata footers"
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
enhancedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0757
  - RFC-0758
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
versionBump: patch
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
  - "A new `service-metadata-block` archetype is registered in the archetype catalog with a cosmic name, semantic role, and props schema."
  - "The section renders a page-level metadata footer: rules version, effective date, next review date, and optional links to related documents."
  - "The archetype is available to all sites via `section.scaffold` and the standard block-declarative page composition pipeline."
nonGoals:
  - "Does not replace the site-level footer component — this is a page-level section, not a shell component."
  - "Does not add a new Site OS command — the archetype is a UI section, not a pipeline step."
  - "Does not define a versioning or review policy — the block displays authored metadata values; the policy behind those values is the site owner's responsibility."
  - "Does not generate metadata automatically — values are authored in block props or referenced via `{collection.file.field}`."
  - "Does not add structured-data (JSON-LD) output — the block is a visible HTML footer, not a semantic projection."
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

# RFC-0759: Add service-metadata-block archetype for page-level metadata footers

## Context

The platform's archetype catalog includes 28 section archetypes, all focused on primary page content (hero, approach, comparison-cards, faq-list, etc.). None cover the pattern of a page-level metadata footer — a small, visually muted block at the bottom of a page that displays service metadata: rules version, effective date, next review date, and links to related documents.

A new page planned for warpgogol-com ("Відповідальні рекомендації" — Responsible Recommendations) includes a service metadata footer (§23 of the expert recommendation): version of the recommendation rules, effective date, next review date, and links to legal pages. This is a common pattern for policy, program, and recommendation pages — the visitor needs to know when the rules were last updated and when they will be reviewed again. Dynamic mandate counts on the same page are handled by a separate `dynamic-status-block` section (RFC-0758).

The closest existing archetypes are `markdown` (static authored content) and `transparency` (trust-building claims), but neither is designed for the specific metadata footer pattern with structured fields (version, dates, links).

## Problem

1. **No archetype for page-level metadata footer.** Sites that need to display service metadata (rules version, dates, review cycle, related links) at the bottom of a page have no shared archetype. They must use `markdown` with manually formatted text — which is not structured, not visually consistent, and not reusable.

2. **No structured metadata fields.** The `markdown` archetype renders freeform prose. A metadata footer needs structured fields: `version`, `effectiveDate`, `nextReviewDate`, `links[]` — each with its own label and value. Without a dedicated archetype, these fields are unstructured text that cannot be validated or styled consistently.

3. **Visual inconsistency.** Without a shared archetype, each site that needs a metadata footer builds it differently — different layouts, different token usage, different accessibility patterns. A shared archetype ensures consistent visual treatment across all sites via `--ds-*` biome tokens.

## Decision

A new `service-metadata-block` archetype is added to the shared archetype catalog. It renders a visually muted page-level metadata footer with structured fields: version, effective date, next review date, optional related links, and optional footnote text. The archetype follows the standard section framework (SectionShell + optional SectionHeader + body) and uses `--ds-*` biome tokens with a `tone: muted` default. Dynamic value indicators (e.g. open mandate counts) are handled by the separate `dynamic-status-block` archetype (RFC-0758), not by this block.

## Architectural fit

- **DNA-17 (Uni manifest contract):** The new archetype ships a colocated `manifest.yaml` declaring `id`, `cosmicName`, `layer: section`, `semanticId`, `role`, `version`, `intent[]`, `industryFit[]`, and `contentSchemaKey`. The archetype YAML in `packages/ontology/archetypes/sections/` is the authoritative schema.
- **DNA-19 (Closed ontology vocabularies):** The `semanticRole` is a new value derived from the archetype catalog (open type alias since RFC-0084). The `cosmicName` is a `PlanetName` from the `PlanetCatalog`.
- **DNA-24 (Block-declarative pages):** The archetype is consumed via `blocks[].type: service-metadata-block` in page content files. No `.astro` file is needed in sites.
- **RFC-0026 (Block-declarative pages):** The archetype participates in the standard block composition pipeline. Its `propsSchema` composes shared section-props fragments (`section-visual`, `section-header`).
- **RFC-0047 (Thin apps):** The section implementation lives in `packages/ui/src/sections/service-metadata-block/`. Sites reference it via `type: service-metadata-block` — no site-local code.
- **RFC-0101..0107 (Section framework):** The section is a thin dispatcher composed of `<SectionShell>` → optional `<SectionHeader>` → body (metadata fields + links). Default `tone: muted` for visual de-emphasis.
- **Layer C:** No URL, JSON-LD, or sitemap changes — `breaksC: false`.

## Design

### CLI surface

The section is materialized by the existing `section.scaffold` command:

```sh
pnpm exec site-kernel run section.scaffold --name service-metadata-block --archetype service-metadata-block
```

No new commands.

### TypeScript contracts

```ts
// Archetype propsSchema (Zod shape)
interface ServiceMetadataBlockProps {
  // Composed from section-visual + section-header (header optional)
  version?: string;              // Rules version (e.g. "1.0")
  effectiveDate?: string;        // ISO date string (e.g. "2026-08-08")
  nextReviewDate?: string;       // ISO date string
  links?: Array<{                // Related document links
    label: string;
    href: string;
    rel?: string;
  }>;
  footnote?: string;            // Optional freeform footnote text
}
```

All string fields support content references (`{collection.file.field}`) — the `buildPage` pipeline resolves them at build time via the standard content reference resolver (`@warpgogol/share/content-reference`). There is no distinction between "content reference fields" and "plain text fields" — every string value in block props is scanned and resolved.

The archetype YAML:

```yaml
id: service-metadata-block
displayName: Service metadata block
version: 1.0.0
semanticRole: page-metadata-footer
description: |
  Page-level metadata footer. RFC-0103 bodyKind: composite; default tone muted.
expectedIntents:
  - build-trust
  - legal-clarity
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
      version: z.string().optional(),
      effectiveDate: z.string().optional(),
      nextReviewDate: z.string().optional(),
      links: z.array(z.object({
        label: z.string().min(1),
        href: z.string().min(1),
        rel: z.string().optional(),
      })).optional(),
      footnote: z.string().optional(),
    }).strict()
acceptedCosmicNames:
  - <picked by cosmic.name.pick during section.scaffold>
constraints: {}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/archetypes/sections/service-metadata-block.yaml` | New archetype definition |
| `packages/ontology/archetypes/index.yaml` | Regenerated by `archetype.registry.build` (not hand-edited) |
| `packages/ui/src/sections/service-metadata-block/service-metadata-block-section.astro` | Section template: SectionShell + optional SectionHeader + metadata fields + links |
| `packages/ui/src/sections/service-metadata-block/service-metadata-block-section.manifest.yaml` | Section manifest |
| `packages/ui/src/sections/service-metadata-block/service-metadata-block-section.types.generated.ts` | Generated TypeScript prop shape (via `props.types.generate`) |
| `packages/ui/src/sections/service-metadata-block/service-metadata-block-section.css` | Colocated CSS using `--ds-*` tokens, muted tone default |
| `packages/ui/src/sections/service-metadata-block/service-metadata-block-section.story.md` | Realistic props example |

### Output format

No `--json` output. The section renders as HTML at build time.

### Failure modes

- **All fields absent:** If all optional fields are absent, the section renders an empty muted block. `page.block.validate` may warn about an empty metadata block, but does not fail — the block is valid but empty.
- **Invalid date format:** Dates are stored as strings and rendered as-is. No date parsing or validation is performed by the section — the author is responsible for providing readable date strings. A future enhancement could add date format validation.
- **Missing `links[]` items:** If `links` is absent or empty, no links section is rendered.

## Rollout

- **Materialization:** The section is created via `section.scaffold` which generates the full file set. The cosmic name is picked by `cosmic.name.pick`.
- **warpgogol-com adoption:** The "Відповідальні рекомендації" page (separate RFC) will use `type: service-metadata-block` for its §23 service metadata footer. Dynamic mandate counts on the same page are handled by a separate `dynamic-status-block` section (RFC-0758).
- **New sites:** Available to all sites. No migration needed — the archetype is additive.
- **Pipeline integration:** `section.contract.validate` and `page.block.validate` validate the new section and its block props. `archetype.registry.build` regenerates `index.yaml` and `PLANET_IMPORT_PATHS` automatically. `props.types.generate` regenerates the TypeScript prop types.
- **No migrator needed:** The archetype is additive.

## Alternatives considered

- **Use `markdown` with manually formatted metadata.** Rejected — `markdown` renders freeform prose. Structured metadata fields (version, dates, links) need consistent rendering, accessible labels, and visual treatment. Manually formatting them in markdown produces inconsistent results and cannot be validated.

- **Site-local section.** Rejected — the operator decided that all archetypes remain shared. A metadata footer is a common pattern for policy and program pages across all sites.

- **Extend the site-level footer component.** Rejected — the site footer is a shell component rendered on every page. A page-level metadata footer is a section that appears only on specific pages with page-specific metadata. They serve different purposes.

- **Use `transparency` archetype.** Rejected — `transparency` is for trust-building claims ("we publish our pricing", "we have an exit policy"), not for structured metadata fields with version, dates, and links.

## Risks

- **Archetype proliferation.** Adding another niche archetype inflates the catalog. Mitigation: `service-metadata-block` is a general pattern (page-level metadata footer) reusable across policy, program, and recommendation pages on all sites.

- **Date format inconsistency.** Dates are freeform strings — authors may use different formats ("2026-08-08", "08.08.2026", "August 8, 2026"). Mitigation: the section renders the string as-is; a future enhancement could add a date format prop or auto-formatting.

- **Cosmic name collision.** Mitigation: `cosmic.name.pick` during `section.scaffold` selects a free name.

- **Agent misinterpretation.** Agents may confuse `service-metadata-block` with the site footer component. Mitigation: the `Implementation notes for agents` section clarifies: this is a page-level section, not a shell component.

## Acceptance criteria

- [ ] `service-metadata-block.yaml` archetype created in `packages/ontology/archetypes/sections/` with `propsSchema` (version?, effectiveDate?, nextReviewDate?, links?, footnote?), `description`, `semanticRole: page-metadata-footer`, `bodyKind: composite`, and `acceptedCosmicNames` (evidence: archetype YAML file)
- [ ] `archetype.registry.build` run to regenerate `packages/ontology/archetypes/index.yaml` including `service-metadata-block` (evidence: index.yaml contains the new entry)
- [ ] Section files created in `packages/ui/src/sections/service-metadata-block/` via `section.scaffold` (`.astro`, `.manifest.yaml`, `.css`, `.story.md`) (evidence: file set exists)
- [ ] `props.types.generate` run to produce `.types.generated.ts` (evidence: generated file exists)
- [ ] `section.contract.validate` passes for the new section (evidence: validator output, zero violations)
- [ ] `page.block.validate` accepts `type: service-metadata-block` blocks with valid props (evidence: validator output)
- [ ] `AGENTS.md` updated where agent behavior rules changed (evidence: `packages/ui/AGENTS.md` or `packages/ontology/AGENTS.md` if needed)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Draft RFCs cannot grant implementation permission.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST use `section.scaffold` to materialize the section — never copy a sibling section folder.
- Agents MUST run `archetype.registry.build` after adding the archetype YAML to regenerate `index.yaml` and `PLANET_IMPORT_PATHS` (RFC-0091 — these are registry-derived, not hand-edited).
- Agents MUST run `props.types.generate` after `section.scaffold` to produce `.types.generated.ts`.
- Agents MUST NOT confuse `service-metadata-block` with the site-level footer component: this is a page-level section rendered on specific pages, not a shell component rendered on every page.
- Agents MUST NOT confuse `service-metadata-block` with `dynamic-status-block` (RFC-0758): this block renders static authored metadata (version, dates, links, footnote); `dynamic-status-block` renders a single data-driven value with label and context.
- Agents MUST NOT add structured-data (JSON-LD) output to this section — it is a visible HTML footer, not a semantic projection.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
