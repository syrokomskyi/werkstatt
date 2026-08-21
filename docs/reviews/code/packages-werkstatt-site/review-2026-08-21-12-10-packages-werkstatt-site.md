---
reviewId: REVIEW-CODE-2026-08-21-01
date: 2026-08-21
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 34b7b142...HEAD
filesReviewed:
  - packages/werkstatt-site/src/domain/pbp/entities/client-testimonial.ts
  - packages/werkstatt-site/src/domain/pbp/schemas/client-testimonial.ts
  - packages/werkstatt-site/src/domain/pbp/schemas/index.ts
  - packages/werkstatt-site/src/domain/pbp/index.ts
  - packages/werkstatt-site/src/domain/pbp/schemas/__tests__/client-testimonial.test.ts
  - packages/werkstatt-site/src/domain/ontology/archetypes/sections/gratitude.yaml
  - packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml
  - packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.astro
  - packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.manifest.yaml
  - packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.css
  - packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.types.generated.ts
  - docs/rfcs/rfc-0900-add-client-testimonial-pbp-entity-and-gratitude-section-for-client-gratitude-display-on-nachweise-page.md
---

# Code Review: 34b7b142...HEAD (RFC-0900 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and follows established patterns. Two minor findings require attention: a missing `.types.ts` manual types file for the section (DNA-5 quintet completeness) and a potential type safety gap in the Astro component's data casting pattern.

### Mechanical floor

Pass — only pre-existing errors in `packages/werkstatt-shared` (Plyr) and `packages/forge` (ADR handler). No new errors introduced by this diff.

### Axis A — Structural correctness

- **Finding A1 (minor):** `gratitude-section.astro` casts `pageOverride` to `GratitudeSectionContent` via `cast<GratitudeSectionContent>(pageOverride)` but does not validate the `header` field is present before accessing `props.header?.heading` with `need()`. The `need()` call will throw at build time if `header` is missing, which is acceptable (fail-fast), but the error message will be generic. This matches the pattern used by `faq-list-section.astro` and other existing sections, so it is consistent — but worth noting as a shared pattern weakness, not a new finding.

### Axis B — DNA alignment

- **DNA-5 (Mirror Quintet):** The gratitude section ships with `.astro`, `manifest.yaml`, `types.generated.ts`, `.css`, and content `.md` files. However, the quintet also expects a manual `.types.ts` file (see `faq-list-section.types.ts` referenced in `faq-list-section.astro:29`). The gratitude section does not have a `gratitude-section.types.ts` file. The `faq-list-section.astro` imports `FaqListItem` from `./faq-list-section.types.ts` — the gratitude section defines `TestimonialData` inline in the Astro component instead. This is acceptable since the inline type is simple, but for quintet completeness a `.types.ts` file may be expected by `mirror.quintet.validate`. **Finding B1 (minor):** Consider extracting `TestimonialData` to a `gratitude-section.types.ts` file if `mirror.quintet.validate` requires it.
- **DNA-17 (Uni manifest contract):** The manifest declares all required fields: `id`, `cosmicName: Gonggong`, `layer: section`, `semanticId: gratitude`, `role: client-gratitude`, `version: 1.0.0`, `intent[]`, `industryFit[]`, `contentSchemaKey`. Pass.
- **Cosmic name uniqueness:** `Gonggong` is confirmed unused by any other section archetype. Pass.

### Axis C — Ecosystem fit

- **Package boundaries:** All imports flow correctly from the section component to `@warpgogol/werkstatt-site/share` and `@warpgogol/werkstatt-shared/share/page`. No cross-package boundary violations. Pass.
- **Pipeline placement:** No new commands or validators introduced — the RFC explicitly lists no new commands in `nonGoals`. Pass.
- **Compass sync:** The RFC's file system responsibilities table lists `docs/requirements.xml` and `docs/technology.xml` updates, but neither file has a PBP entity registry or UI section catalog inventory to update. The plan correctly notes "if one exists" — none do. Pass.
- **AGENTS.md updates:** No section catalog table or PBP entity list exists in `packages/werkstatt-site/AGENTS.md`. Pass.
- **Archetype registry:** `archetype.registry.build` was run and the index was rebuilt with the new gratitude entry. Pass.

### Axis D — Forward-only compliance

No compatibility shims, bridges, or dual-paths. The implementation is purely additive — new entity, new section, new archetype. Pass.

### Axis E — Agent-facing clarity

- **Compass scaffolding:** New source files (`client-testimonial.ts` entity, `client-testimonial.ts` schema, `gratitude-section.astro`) all carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments. Pass.
- **No ungrounded assertions:** All comments reference real RFCs and patterns. Pass.
- **Anti-fabrication:** The placeholder testimonial content files explicitly state "Agents MUST NOT fabricate testimonials" and use `status: draft` to ensure the section is hidden until human authoring. Pass.

### Axis F — Pragmatism

- **Existing patterns:** The implementation follows the exact pattern of `consent.ts`, `claim.ts`, `faq-list-section.manifest.yaml`, and `faq-list.yaml`. Pass.
- **Minimal command surface:** No new commands. Pass.
- **Scope discipline:** The diff touches only what's necessary — PBP entity, schema, archetype, section, tests, content. Pass.

### Axis G — Blind spots

- **Empty state:** The section returns early (`if (testimonials.length === 0) return`) when no published testimonials exist, rendering no DOM element. This is per-design and handles partial locale coverage. Pass.
- **Performance:** `getCollection("business-profile")` is called twice (once for testimonials, once for evidence-sources). This is O(n) at build time and acceptable for static generation. The evidence-source lookup could be optimized to only run when testimonials have `evidenceRef`, but the current approach is clear and correct. **Finding G1 (minor):** Consider lazy-loading evidence-source entries only when at least one testimonial has `evidenceRef` set.
- **Edge cases:** The `resolveEvidenceLink` function correctly returns `null` when `evidenceRef` is missing, the evidence-source is not found, or has no `slug`. Pass.

### Spec compliance

| Requirement from RFC-0900 | Status | Evidence |
| --- | --- | --- |
| client-testimonial Zod schema | Done | `schemas/client-testimonial.ts:17` |
| Registered in pbpSchemaById and discriminated union | Done | `schemas/index.ts:152,189` |
| PbpClientTestimonial interface + schema ID | Done | `entities/client-testimonial.ts:17-22` |
| gratitude-section.astro with gratitude-card class | Done | `gratitude-section.astro:96-118` |
| Manifest with cosmicName Gonggong | Done | `gratitude-section.manifest.yaml:6` |
| Archetype with acceptedCosmicNames [Gonggong] | Done | `gratitude.yaml:24-25` |
| props.types.generate produces types | Done | `gratitude-section.types.generated.ts:1-105` |
| Registry includes gratitude | Done | `index.yaml:166-174` |
| Gratitude block in nachweise.md DE+UK | Done | `de/nachweise.md:50-55`, `uk/nachweise.md:50-55` |
| Testimonial content per locale | Done (draft) | Placeholder entities with status: draft |
| Empty state behavior | Done | `gratitude-section.astro:64-66` |
| rfc.validate passes | Done | Command output: All 1 RFC(s) passed |

### Questions for the author

1. Should `TestimonialData` be extracted to a `gratitude-section.types.ts` file for Mirror Quintet completeness, or is the inline interface sufficient since `mirror.quintet.validate` has not been run yet?
2. The evidence-source `getCollection` call runs even when no testimonials have `evidenceRef` — should this be lazy-loaded for build performance, or is the current eager approach preferred for simplicity?
