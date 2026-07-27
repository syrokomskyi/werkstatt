---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: b9b8df3...HEAD
filesReviewed:
  - packages/ontology/src/shared-section-props/visual-header.ts
  - packages/ontology/src/shared-section-props/catalog.ts
  - packages/ontology/archetypes/sections/hero-decision-card.yaml
  - packages/share/src/schemas/section-header.ts
  - packages/ui/src/components/section-header/section-header.astro
  - packages/ui/src/components/section-header/section-header.css
  - packages/ui/src/sections/hero-decision-card/hero-decision-card-section.astro
  - packages/ui/src/sections/hero-decision-card/hero-decision-card-section.css
  - packages/ui/src/sections/hero-decision-card/hero-decision-card-section.manifest.yaml
  - packages/ui/src/sections/hero-decision-card/hero-decision-card-section.types.generated.ts
  - packages/faq/src/schema.ts
  - packages/faq/src/astro.ts
  - packages/faq/AGENTS.md
  - packages/ontology/AGENTS.md
  - packages/ui/AGENTS.md
---

# Code Review: b9b8df3...HEAD (RFC-0567 implementation)

### Verdict: Approved

The diff adds three optional, backward-compatible props (`eyebrow`, `ctaNote`, `orderTags`) across four packages. All changes are minimal, forward-only, and DNA-compliant. The mechanical floor passes for all four impacted packages.

### Mechanical floor

Pass — `tsc --noEmit` exits 0 for `@warpgogol/ontology`, `@warpgogol/share`, `@warpgogol/ui`, and `@warpgogol/faq`. `rfc.validate` passes. `page.block.validate` passes.

### Axis A — Structural correctness

No issues.

- All new fields are optional with appropriate Zod validators (`z.string().optional()`, `z.record(z.string(), z.number()).optional()`).
- The `999` magic number in `getFaqEntriesByTags` sort fallback is consistent with the existing `getFaqEntries` function which uses the same value.
- No dead code, no duplicated logic.

### Axis B — DNA alignment

No issues.

- **DNA-17 (Mirror Quintet)**: The `hero-decision-card` section already has its full quintet. The manifest `propsSchema` is extended in place — no new files needed. The generated types file is updated in sync.
- **DNA-10 (no hardcoded tokens)**: New CSS classes use `--ds-*` tokens exclusively (`--ds-text-sm-80`, `--ds-color-text-muted`, `--ds-tracking-md`, `--ds-line-height-md`).
- **DNA-24 (block-declarative pages)**: New props are consumed by authored page blocks and validated by `page.block.validate` — confirmed passing.

### Axis C — Ecosystem fit

No issues.

- Package boundaries respected: `ontology` defines the fragment, `share` mirrors it in Zod, `ui` renders it, `faq` owns its own schema.
- AGENTS.md files updated in `packages/ontology`, `packages/ui`, and `packages/faq` to document the new props.
- No new commands or pipelines introduced.

### Axis D — Forward-only compliance

No issues.

- No compatibility shims or dual paths. The `getFaqEntriesByTags` function is modified in place — the old filter-only behavior is replaced by filter+sort.
- The `orderTags` field is additive to the schema; existing content without it continues to work via the `?? order ?? 999` fallback chain.

### Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding updated in `packages/faq/src/schema.ts` and `packages/faq/src/astro.ts` with RFC-0567 entries.
- JSDoc comments added for `eyebrow` in `packages/share/src/schemas/section-header.ts`.
- Inline comment in `getFaqEntriesByTags` explains the `tags[0]` primary-tag assumption.

### Axis F — Pragmatism

No issues.

- Each new field earns its existence: `eyebrow` is a standard editorial pattern, `ctaNote` addresses a specific expert-content need, `orderTags` enables per-tag FAQ ordering without duplicating entries.
- No speculative generality — all fields are optional with clear use cases documented in the RFC.

### Axis G — Blind spots

No issues.

- **Performance**: `getFaqEntriesByTags` sort is O(n log n) with a map lookup — negligible for FAQ collections (typically <50 entries).
- **Edge cases**: Empty `tags` array → `tags[0]` is `undefined` → `orderTags?.[undefined]` is `undefined` → falls back to `order` → correct behavior.
- **Backward compatibility**: `page.block.validate` confirmed passing with existing content — no content changes required.

### Spec compliance

| Requirement from RFC-0567 | Status | Evidence |
| --- | --- | --- |
| `eyebrow` in `SECTION_HEADER_FRAGMENT` | Done | `visual-header.ts:155` |
| `eyebrow` in `sectionHeaderSchema` | Done | `section-header.ts:55` |
| `eyebrow` rendered in `<SectionHeader>` | Done | `section-header.astro:61` |
| `ctaNote` in archetype + manifest | Done | `hero-decision-card.yaml:29`, `manifest.yaml:35` |
| `ctaNote` rendered in hero template | Done | `hero-decision-card-section.astro:160` |
| `orderTags` in `faqSchema` | Done | `schema.ts:37` |
| `getFaqEntriesByTags` uses `orderTags` | Done | `astro.ts:46-56` |
| `packages/faq/AGENTS.md` documents `orderTags` | Done | `AGENTS.md:20,34` |
| All 4 `build:check` pass | Done | `tsc --noEmit` exit 0 |
| `page.block.validate` passes | Done | status:pass |
| `rfc.validate` passes | Done | status:pass |

### Questions for the author

1. The `tags[0]` primary-tag assumption in `getFaqEntriesByTags` — is this documented to content authors, or only to callers? The RFC documents it, but should the JSDoc on the exported function also mention it?
