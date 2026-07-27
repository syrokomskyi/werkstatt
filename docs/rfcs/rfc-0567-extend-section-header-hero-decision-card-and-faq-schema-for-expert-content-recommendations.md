---
id: RFC-0567
title: "Extend section-header, hero-decision-card, and FAQ schema for expert content recommendations"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-27
updatedAt: 2026-07-27
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-17
  - DNA-24
  - RFC-0102
  - RFC-0101
  - RFC-0475
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-17
  - DNA-24
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
packagesImpacted:
  - "@warpgogol/ontology"
  - "@warpgogol/ui"
  - "@warpgogol/faq"
successSignals: []
nonGoals:
  - Adding new block types or archetypes
  - Changing the FAQ collection wiring or content location
  - Modifying the cosmic naming catalogs
  - Introducing new Site OS commands
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

# RFC-0567: Extend section-header, hero-decision-card, and FAQ schema for expert content recommendations

## Context

Expert content recommendations for the webgogol.com home page (file 1, "Index plus") identified three content patterns that the current archetype and FAQ schemas cannot express:

1. **Eyebrow text above a section heading** — a short contextual label (region, audience, category) rendered above the heading. The `section-header` fragment (RFC-0102) defines `heading` and `subheading` but has no `eyebrow` prop. The `hero-decision-card` archetype composes `section-header` and inherits this limitation.
2. **CTA note text under hero CTAs** — a short clarifying sentence between the CTAs and the decision card (e.g., "Kurze Angaben genügen — keine perfekten Texte nötig"). The `hero-decision-card` archetype has no prop for this.
3. **Per-tag FAQ ordering** — FAQ entries are tagged for multiple contexts (pricing, contact, home). The `faqSchema` has a single `order` field used across all tag groups, so an entry ordered `1` for pricing cannot be ordered `3` for home. `getFaqEntriesByTags` sorts by `order` regardless of which tag was queried.

## Problem

Three shared contracts lack optional props that expert content recommendations require:

1. **`SECTION_HEADER_FRAGMENT`** (`packages/ontology/src/shared-section-props/visual-header.ts:130`) — the `header` object has `heading`, `subheading`, `align`, `level`, `hideSectionNumber` but no `eyebrow`. Content authors cannot place a short label above the heading without misusing `subheading` (which renders below).
2. **`hero-decision-card` archetype** (`packages/ontology/archetypes/sections/hero-decision-card.yaml`) — the `propsSchema` has `tagline`, `primaryCta`, `secondaryCta`, `decisionCard` but no `ctaNote`. Content authors cannot add a clarifying sentence between the CTAs and the decision card.
3. **`faqSchema`** (`packages/faq/src/schema.ts:30`) — the schema has `order: z.number().optional()` but no `orderTags`. `getFaqEntriesByTags` (`packages/faq/src/astro.ts:45`) sorts by `(a.order ?? 999) - (b.order ?? 999)` regardless of which tag was queried. An FAQ entry ordered `1` for the pricing page appears first on the home page even when it should appear third.

These gaps force content authors to either omit recommended content or misuse existing props (e.g., placing eyebrow text in `subheading`, which renders in the wrong position).

## Decision

Three optional props are added to shared contracts:

1. **`eyebrow`** is added to the `section-header` props fragment as an optional string, rendered above `heading` in `<SectionHeader>`. All sections composing `section-header` inherit it.
2. **`ctaNote`** is added to the `hero-decision-card` archetype `propsSchema` as an optional string, rendered between the CTA group and the decision card.
3. **`orderTags`** is added to `faqSchema` as an optional `Record<string, number>`. `getFaqEntriesByTags` uses `orderTags[queriedTag]` when present, falling back to `order`.

## Architectural fit

- **DNA-17 (Mirror Quintet)** — the `eyebrow` prop extends the `section-header` fragment; the `ctaNote` prop extends the `hero-decision-card` archetype. Both are backward-compatible optional additions to existing `propsSchema` contracts. Manifests, types, and `.astro` templates are updated in sync.
- **DNA-24 (block-declarative pages)** — the new props are consumed by authored page blocks. `page.block.validate` validates them against the extended schemas.
- **RFC-0102 (section-header)** — `eyebrow` is a natural extension of the header fragment, following the same pattern as `subheading`.
- **RFC-0475 (FAQ schema)** — `orderTags` extends the FAQ content schema with a backward-compatible optional field. The `.loose()` Zod schema already allows extra fields, but adding it explicitly to the schema makes it typed and documented.

## Design

### No new CLI commands

This RFC introduces no new Site OS commands. It extends existing schemas and manifests; `page.block.validate` and `faq.validate` automatically pick up the new optional props.

### TypeScript contracts

#### 1. `eyebrow` in section-header fragment

```ts
// packages/ontology/src/shared-section-props/visual-header.ts
// Added to SECTION_HEADER_FRAGMENT.properties.header.properties:

eyebrow: { type: "string", minLength: 1 }
```

The `<SectionHeader>` Astro component renders `eyebrow` as a short text line above `heading`, styled with a muted tone and smaller font size.

#### 2. `ctaNote` in hero-decision-card archetype

```ts
// packages/ontology/archetypes/sections/hero-decision-card.yaml
// Added to propsSchema.properties:

ctaNote:
  type: string
  minLength: 1
```

The `hero-decision-card-section.astro` template renders `ctaNote` as a paragraph between the CTA group and the decision card.

#### 3. `orderTags` in FAQ schema

```ts
// packages/faq/src/schema.ts
// Added to faqSchema:

orderTags: z.record(z.string(), z.number()).optional(),
```

```ts
// packages/faq/src/astro.ts — updated sort in getFaqEntriesByTags:

const tag = tags[0]; // primary queried tag
return all
  .filter((e) => e.tags?.some((t) => tags.includes(t)))
  .sort((a, b) => {
    const aOrder = a.orderTags?.[tag] ?? a.order ?? 999;
    const bOrder = b.orderTags?.[tag] ?? b.order ?? 999;
    return aOrder - bOrder;
  });
```

### File system responsibilities

| Path | Change |
| --- | --- |
| `packages/ontology/src/shared-section-props/visual-header.ts` | Add `eyebrow` to `SECTION_HEADER_FRAGMENT` |
| `packages/ontology/src/shared-section-props/catalog.ts` | Bump `section-header` fragment version |
| `packages/ontology/archetypes/sections/hero-decision-card.yaml` | Add `ctaNote` to `propsSchema` |
| `packages/ui/src/sections/hero-decision-card/hero-decision-card-section.manifest.yaml` | Add `ctaNote` to `propsSchema` |
| `packages/ui/src/sections/hero-decision-card/hero-decision-card-section.astro` | Render `ctaNote` between CTAs and decision card |
| `packages/ui/src/sections/hero-decision-card/hero-decision-card-section.types.ts` | Add `ctaNote?: string` to props type |
| `packages/ui/src/components/section-header/section-header.astro` | Render `eyebrow` above `heading` |
| `packages/faq/src/schema.ts` | Add `orderTags` to `faqSchema` |
| `packages/faq/src/astro.ts` | Update `getFaqEntriesByTags` sort logic |

### Failure modes

- **Missing `eyebrow`** — section renders without eyebrow; no error. Optional prop.
- **Missing `ctaNote`** — hero renders without note; no error. Optional prop.
- **Missing `orderTags`** — `getFaqEntriesByTags` falls back to `order`. Fully backward-compatible.
- **`orderTags` present but tag not in map** — falls back to `order` for that entry.

## Rollout

- **Backward-compatible** — all three props are optional. Existing content without `eyebrow`, `ctaNote`, or `orderTags` continues to work unchanged.
- **No flag day** — no migration required. Existing apps pass `page.block.validate` and `faq.validate` without changes.
- **New apps** automatically get the props when they consume the updated `@warpgogol/ontology`, `@warpgogol/ui`, and `@warpgogol/faq` packages.
- **Adoption** — content authors add `eyebrow`, `ctaNote`, and `orderTags` to authored content as needed. No build pipeline changes.
- **Integration** — `page.block.validate` in `build.check` validates the new props against the extended schemas. `faq.validate` in `build.check` validates `orderTags`.

## Alternatives considered

1. **Local `eyebrow` in `hero-decision-card` only** — rejected because other sections (transparency, price-card, comparison-cards) also benefit from eyebrow text. Adding it to the shared fragment avoids duplicating the prop across multiple archetype schemas.
2. **`ctaNote` as `string[]` (paragraphs)** — rejected as over-engineered for a short clarifying sentence. A single string is sufficient and simpler to author.
3. **`tagOrders` array of `{ tag, order }` pairs** — rejected as more verbose in YAML than a map. `orderTags: { home: 3, pricing: 1 }` is cleaner than `tagOrders: [{ tag: home, order: 3 }, { tag: pricing, order: 1 }]`.
4. **No schema change — content workaround** — rejected because the expert recommendations explicitly require these content patterns, and the archetype constraints prevent them. Workarounds (misusing `subheading` as eyebrow) produce wrong rendering positions.

## Risks

- **Eyebrow overuse** — making `eyebrow` available to all sections may lead to inconsistent usage. Mitigated by: optional prop, content author discretion, no validator forcing it.
- **`orderTags` complexity** — content authors must understand the map structure. Mitigated by: fallback to `order`, simple YAML syntax.
- **Agent misinterpretation** — agents may add `eyebrow` to every section. Mitigated by: this RFC documents it as optional, expert-file-driven.
- **No performance impact** — schema validation is build-time; `getFaqEntriesByTags` sort is O(n log n) with a map lookup.

## Acceptance criteria

- [ ] `eyebrow` prop added to `SECTION_HEADER_FRAGMENT` in `packages/ontology/src/shared-section-props/visual-header.ts`
- [ ] `eyebrow` rendered above `heading` in `<SectionHeader>` Astro component
- [ ] `ctaNote` prop added to `hero-decision-card` archetype schema and manifest
- [ ] `ctaNote` rendered between CTAs and decision card in `hero-decision-card-section.astro`
- [ ] `orderTags` field added to `faqSchema` in `packages/faq/src/schema.ts`
- [ ] `getFaqEntriesByTags` uses `orderTags[queriedTag]` with fallback to `order`
- [ ] `pnpm --filter @warpgogol/ontology build:check` passes
- [ ] `pnpm --filter @warpgogol/ui build:check` passes
- [ ] `pnpm --filter @warpgogol/faq build:check` passes
- [ ] Existing content passes `page.block.validate` without changes (backward-compatible)
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add `eyebrow` to every section — it is optional and used only when expert content recommendations call for it.
- Agents MUST NOT use `ctaNote` for long paragraphs — it is a short clarifying sentence. Longer content belongs in a separate `transparency` or `body.kind: paragraphs` block.
- Agents MUST NOT hardcode `orderTags` values in code — they are authored in FAQ frontmatter.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
