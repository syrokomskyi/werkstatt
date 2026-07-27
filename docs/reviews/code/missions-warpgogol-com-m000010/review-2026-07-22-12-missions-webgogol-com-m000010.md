---
reviewId: REVIEW-CODE-2026-07-22-01
date: 2026-07-22
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 225b635...HEAD
filesReviewed:
  - missions/warpgogol-com-m000010/workpiece/src/content/pages/uk/pricing.md
  - missions/warpgogol-com-m000010/workpiece/src/content/system.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-first-year.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-setup-included.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-monthly-included.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-not-included.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-extra-change.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-domain.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-vat.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-switch-plan.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-yearly-cancellation.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-price-change.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-external-costs.md
  - missions/warpgogol-com-m000010/workpiece/src/content/faq/uk/pricing-after-cancellation.md
---

# Code Review: 225b635...HEAD (UK pricing page enhancement)

### Verdict: Needs revision

Two findings on axes A and E require fixes before merge: a broken anchor link (`#price-comparison` target does not resolve) and duplicate HTML element IDs across repeated section types. Both are fixable with `anchorId` props on the affected blocks.

### Mechanical floor

Pass — `content.references.validate`, `faq.validate`, `page.block.validate`, and `content.voice.lint` all returned OK. No build errors.

### Axis A — Structural correctness

- **FAIL — Broken anchor link.** The hero block's `secondaryCta.target: "#price-comparison"` (`pricing.md:43`) will not resolve. Section anchor IDs are derived via `resolveSectionAnchor(Astro.props, "audience-cards")` in `audience-cards-section.astro:26`, which reads `pageOverride.anchorId` or falls back to the section type name (`"audience-cards"`). The block `id` field is not used for anchor resolution. Without `anchorId: price-comparison` in the block's `props`, the section's HTML `id` will be `"audience-cards"`, not `"price-comparison"`. The `#price-comparison` link will scroll to nothing.

- **FAIL — Duplicate HTML IDs.** The page declares two `audience-cards` blocks (`price-comparison` at line 60, `not-included` at line 229) and four `transparency` blocks (`setup-included` at line 91, `monthly-included` at line 158, `base-structure` at line 210, `taxes` at line 276). Without explicit `anchorId` props, each pair/group resolves to the same default HTML `id` (`"audience-cards"` and `"transparency"` respectively), producing duplicate element IDs — an HTML validity violation and accessibility issue.

- **PASS — Schema conformity.** All block types, props, and fragment compositions (`body-list`, `body-cards`, `section-visual`, `section-header`) conform to their manifest schemas. `iconColor`, `badge`, `columns`, `effects`, and `cta` are all valid fields.

- **PASS — FAQ schema.** All 12 FAQ files conform to the `faqSchema` (validated by `faq.validate`). `slug`, `question`, `answer`, `order`, and `tags` fields are correct.

### Axis B — DNA alignment

- **PASS — DNA-4 (canonical content).** All user-visible copy lives in `src/content/`. No copy strings in routes or components. The `not-included` block correctly uses PBP references for growth-module prices (`{business-profile.offerings/digital-foundation.presentation.growthModules.visibility.price}` etc.).

- **PARTIAL — DNA-4 (hardcoded prices in computed expressions).** The `price-comparison` block (`pricing.md:82-89`) hardcodes prices in card descriptions ("Налаштування 200 € + 12 × 70 € супроводу = 1 040 €"). These are computed expressions that cannot be expressed as single PBP field references. The hero's `decisionCard.items` also hardcode display values ("70 €", "700 €", "200 €") — consistent with the DE pricing page approach. This is a pragmatic trade-off, not a violation, but the individual base prices (70, 700, 200) are duplicated across multiple blocks and FAQ entries without PBP reference backing.

- **PARTIAL — DNA-4 (hardcoded prices in FAQ answers).** FAQ answers contain hardcoded prices (200 €, 70 €, 700 €, 15 €, 90 €). PBP reference interpolation (`substituteBlockPropReferences`) only runs on block props, not on FAQ content. This is a systemic limitation — FAQ answers are plain strings in the collection schema, not block props. If prices change in the PBP, FAQ answers will become stale. No fix is available within the current architecture; documenting the risk is the only option.

- **PASS — DNA-23 (cosmic naming).** `Epimetheus` (audience-cards) and `Tethys` (transparency) are correctly added to the pricing page's `planets` list in `system.md:295-300`. Both are in the archetype's `acceptedCosmicNames`. Three-way alignment (manifest ↔ archetype ↔ system.md) is maintained.

- **PASS — DNA-24 (block-declarative pages).** The page is frontmatter-only with no markdown body. All content is declared as ordered blocks.

### Axis C — Ecosystem fit

- **PASS — Package boundaries.** No imports across app boundaries. All changes are content files within the mission workpiece.

- **PASS — Cosmic naming.** The new planet registrations in `system.md` are correct and validated by `page.block.validate`.

- **PASS — No RFC triggers.** No new block types, package changes, or route changes. All block types (`hero-decision-card`, `audience-cards`, `transparency`, `ownership-block`, `notausgang-block`, `faq-list`, `final-cta`) are existing archetypes with registered manifests.

- **PASS — Compass sync.** No repository-wide requirements, shared package contracts, or app-package relationships changed. No `docs/*.xml` updates needed.

### Axis D — Forward-only compliance

- **PASS.** No compatibility shims, bridges, or dual-paths. The old UK pricing page content is replaced, not maintained alongside. The DE pricing page is untouched.

### Axis E — Agent-facing clarity

- **FAIL — Broken anchor link (same as Axis A).** The `#price-comparison` target in the hero's secondaryCta is a broken promise to the visitor and to any agent reading the page structure. An agent following the anchor would find no matching element.

- **FAIL — Duplicate IDs (same as Axis A).** Duplicate HTML IDs make it impossible for another agent (or assistive technology) to reliably target a specific section by ID.

- **PASS — No ungrounded assertions.** All PBP references used in the `not-included` block badges correspond to real fields in the business profile (`digital-foundation.md:130-149`). The `growthModules` paths (`visibility`, `booking`, `trust`, `multilingual`, `automation`) all exist with `price` fields.

- **PASS — Factual claims.** The `taxes` block's Kleinunternehmerregelung claim (§ 19 Abs. 1 UStG) is consistent with the AGB. Cancellation terms (30 days, 72h data transfer) match the PBP `guarantees.dataPackage` field. SLA claims (99% uptime, 24h response, 48h small changes) match PBP `guarantees` fields.

### Axis F — Pragmatism

- **PASS — Scope discipline.** The diff touches only UK content files and `system.md`. No scope creep into DE content, packages, or routes.

- **PASS — Existing patterns.** The `faq-list` block with tag filtering is an existing pattern (RFC-0208). The `audience-cards` and `transparency` blocks are existing archetypes used on other pages.

- **NOTE — `base-structure` block visual inconsistency.** The `base-structure` transparency block (`pricing.md:221-227`) has 6 items without icons, while all other transparency blocks on the page have icons on every item. Icons are optional per schema, so this is valid, but the visual inconsistency may be intentional (base structure is a simple list) or an oversight.

### Axis G — Blind spots

- **PASS — Edge cases.** The `faq-list` block with `tag: "pricing"` will correctly filter to 12 FAQ entries. If no entries matched, the section would be omitted from JSON-LD (per `resolveFaqEntries` logic in `build-page.ts:117-118`).

- **NOTE — Price drift risk.** Prices are hardcoded in 4 places: hero `decisionCard.items`, `price-comparison` card descriptions, FAQ answers, and the `not-included` block's `badge` for extra changes ("15 € за зміну / 90 € за годину"). The PBP `presentation.changePrice: 15` and `presentation.hourlyRate: 90` exist but are not referenced in the badge — it hardcodes the values. Only the growth-module badges use PBP references.

### Spec compliance

No formal spec available — the expert file (`2 preis - Chat GPT 5.6 Sol High.md`) served as the informal spec. Compliance was assessed against the session summary.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Restructure pricing page with detailed breakdown | Done | 11 blocks, up from 5 |
| First-year cost comparison | Done | `price-comparison` block (line 60) |
| Setup included breakdown | Done | `setup-included` block (line 91) |
| Monthly included breakdown | Done | `monthly-included` block (line 158) |
| Base structure list | Done | `base-structure` block (line 210) |
| Not-included list with PBP prices | Partial | Growth modules use PBP refs; extra-change badge hardcodes 15 € / 90 € instead of PBP refs |
| Tax/external services info | Done | `taxes` block (line 276) |
| Ownership details | Done | `ownership` block (line 292) |
| Cancellation/exit terms | Done | `notausgang` block (line 324) with CTA to notausgang page |
| FAQ section | Done | `faq-list` block (line 344) + 12 FAQ files |
| Final CTA | Done | `cta` block (line 353) |
| Preserve PBP references | Partial | Growth-module badges use PBP refs; base prices and extra-change badge are hardcoded |
| No RFC triggers | Done | No new block types or package changes |

### Questions for the author

1. **Anchor links**: Will you add `anchorId` props to the `price-comparison`, `not-included`, `setup-included`, `monthly-included`, `base-structure`, and `taxes` blocks so that the hero's `#price-comparison` secondaryCta resolves and no duplicate HTML IDs remain?
2. **Extra-change badge**: The `not-included` block hardcodes "15 € за зміну / 90 € за годину" in the badge (`pricing.md:268`). The PBP has `presentation.changePrice: 15` and `presentation.hourlyRate: 90`. Should these be PBP references instead?
3. **FAQ price drift**: FAQ answers hardcode all prices. Is there a plan to keep these in sync with PBP changes, or is this an accepted maintenance burden?
