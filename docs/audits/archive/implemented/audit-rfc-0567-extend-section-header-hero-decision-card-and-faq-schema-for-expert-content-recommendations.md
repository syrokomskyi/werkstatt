---
rfcId: RFC-0567
auditId: AUDIT-RFC-0567-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0567

## Verdict: Needs revision

The RFC is well-structured and pragmatically scoped, but has a critical gap: it adds `eyebrow` to the ontology fragment but omits the corresponding update to `SectionHeaderProps` in `@warpgogol/share` — the Zod schema that defines the `<SectionHeader>` component's prop type. Without this, the prop cannot be passed type-safely from consuming section templates. Additionally, `@warpgogol/share` is missing from `packagesImpacted`, and the file system responsibilities table has an incorrect path for the generated types file.

## Mechanical validation (rfc.validate)

**Pass** with 1 warning.

- **V-30 (warning):** `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not true. This is a **false positive** — the RFC modifies `packages/ontology/src/shared-section-props/visual-header.ts` and `catalog.ts`, not `packages/ontology/src/external-surfaces/`. No action needed.

## Axis A — Structural completeness

**A-1 (fail): Incorrect file path in file system responsibilities table.** The table lists `packages/ui/src/sections/hero-decision-card/hero-decision-card-section.types.ts` but the actual file is `hero-decision-card-section.types.generated.ts` — auto-generated from the manifest by `props.types.generate` (RFC-0262). The table should either correct the path and note it is regenerated, or remove it since it is auto-generated from the manifest.

**A-2 (fail): Missing file — `packages/share/src/schemas/section-header.ts`.** The `<SectionHeader>` Astro component's TypeScript prop type `SectionHeaderProps` is defined in `packages/share/src/schemas/section-header.ts:47` as a `.strict()` Zod schema. Adding `eyebrow` to `SECTION_HEADER_FRAGMENT` in ontology is not sufficient — `SectionHeaderProps` must also gain `eyebrow: z.string().optional()` for the hero-decision-card template to pass it type-safely. This file is absent from the responsibilities table.

**A-3 (fail): Missing acceptance criterion for `SectionHeaderProps` update.** The acceptance criteria include "`eyebrow` rendered above `heading` in `<SectionHeader>` Astro component" but do not include a criterion for updating the `SectionHeaderProps` Zod schema in `@warpgogol/share`. Without this, the rendering criterion cannot be fulfilled in a type-safe manner.

## Axis B — DNA alignment

**B-1 (fail): `SectionHeaderProps` schema gap breaks DNA-17 Mirror Quintet sync.** DNA-17 requires manifests, types, and `.astro` templates to be updated in sync. The RFC states "Manifests, types, and `.astro` templates are updated in sync" but does not include the `SectionHeaderProps` type in `@warpgogol/share` — the canonical type contract for the `<SectionHeader>` component. The Mirror Quintet for the `section-header` component is: `.astro` + `manifest.yaml` + `SectionHeaderProps` (share) + `.css` + content template. The RFC addresses the `.astro` and `.css` but not the share-side type.

## Axis C — Ecosystem fit

**C-1 (fail): `@warpgogol/share` missing from `packagesImpacted`.** `packagesImpacted` lists `@warpgogol/ontology`, `@warpgogol/ui`, `@warpgogol/faq` but not `@warpgogol/share`. The `sectionHeaderSchema` and `SectionHeaderProps` type live in `packages/share/src/schemas/section-header.ts`. This package must be updated and listed.

**C-2 (minor): `packages/faq/AGENTS.md` not mentioned for update.** The `packages/faq/AGENTS.md` API surface table documents `getFaqEntriesByTags(lang, tags)` as "Filter entries by tags" and the Validation section lists optional field types as `order` (number), `tags` (string[]). After adding `orderTags`, the AGENTS.md should document: (1) `orderTags` in the optional field types, (2) the per-tag ordering behavior of `getFaqEntriesByTags`. The RFC's file system responsibilities table does not mention this documentation update.

## Axis D — Forward-only compliance

No issues. All three props are optional, backward-compatible additions. No compatibility shims, dual-paths, or legacy code behind flags.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224 and RFC-0334. No self-authorizing language.

## Axis F — Pragmatism

**F-1 (minor): `tags[0]` primary-tag assumption undocumented.** The `getFaqEntriesByTags` sort logic uses `const tag = tags[0]` as the "primary queried tag" for `orderTags` lookup. If an entry matches multiple queried tags, only the first tag's order is used. This is a reasonable design choice (caller passes tags in priority order), but the RFC does not document this assumption — it should state that the first tag in the `tags` array is the primary sort context.

## Axis G — Blind spots

No issues. Performance is documented (O(n log n) with map lookup). Edge cases are covered (missing `orderTags` falls back to `order`; tag not in map falls back to `order`). Migration path is documented (backward-compatible, no flag day).

## Questions for the author

1. The `SectionHeaderProps` Zod schema in `packages/share/src/schemas/section-header.ts` is `.strict()` and defines the TypeScript type for `<SectionHeader>` props. Adding `eyebrow` to the ontology fragment alone does not make it passable to the component — `SectionHeaderProps` must also gain `eyebrow: z.string().optional()`. Why is `@warpgogol/share` not in `packagesImpacted`, and why is this file missing from the responsibilities table and acceptance criteria?

2. The file system responsibilities table lists `hero-decision-card-section.types.ts` but the actual file is `hero-decision-card-section.types.generated.ts` (auto-generated by `props.types.generate`). Should the table correct the path and note regeneration, or remove the entry since it is derived from the manifest?

3. The `getFaqEntriesByTags` sort uses `tags[0]` as the primary tag for `orderTags` lookup. If an entry matches multiple queried tags, only the first tag's order applies. Is this the intended behavior, and should it be documented in the RFC body and the `packages/faq/AGENTS.md` API surface table?
