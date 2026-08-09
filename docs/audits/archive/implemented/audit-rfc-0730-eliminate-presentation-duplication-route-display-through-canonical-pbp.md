---
rfcId: RFC-0730
auditId: AUDIT-RFC-0730-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0730

## Verdict: Needs revision

The RFC correctly identifies the presentation duplication problem and proposes a sound architectural direction (canonical fields + pipe formatting). However, it contains a factual error about `guarantees` being canonical, an internal contradiction about keeping `presentation` in `offeringSchema`, an incomplete file system responsibilities table, and an undefined `formatPrice()` contract.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-12 (warning)**: `RFC-0730.supersedes` includes `RFC-0482`, but `RFC-0482.supersededBy` is empty (expected `RFC-0730`). This will be resolved when RFC-0730 is accepted — the `supersededBy` field on RFC-0482 must be set to `RFC-0730` during the transition.

## Axis A — Structural completeness

1. **File system responsibilities table is incomplete.** The table (lines 201–211) lists `pages/{lang}/*.md` but does not mention `prose/{lang}/*.md` or `funnel/{lang}/*.md`, which also contain `presentation.*` content references. Specifically:
   - `prose/{lang}/agb.md` — references `presentation.price.monthlyAmount`, `presentation.price.setupAmount`, `presentation.changePrice`, `presentation.hourlyRate`, `presentation.billingDay` (21 matches in DE, 13 in UK)
   - `prose/{lang}/ratgeber-website-kosten.md` — references `presentation.price.*`, `presentation.changePrice`, `presentation.hourlyRate`
   - `prose/{lang}/barrierefreiheit.md` — references `presentation.dates.lastReviewDate` (non-offering entity, but reference path changes if presentation is removed from offerings)
   - `prose/{lang}/impressum.md` — references `presentation.dates.lastUpdateDate` (non-offering entity)
   - `funnel/{lang}/create-site.md` — references `presentation.price.*`, `presentation.guarantees.delivery.label`, `presentation.growthModules.*.price`, `presentation.growthModules.*.label`
   - `funnel/{lang}/change-site.md` — references `presentation.changePrice`

   The acceptance criterion "No content references to `presentation.*` remain in any page or prose file" (line 272) mentions prose but not funnel. The file system table mentions neither.

2. **`price-card-section.manifest.yaml` and `price-card-section.types.generated.ts` not in file system table.** The price-card section's props schema is defined in its manifest and the types are generated from it. Both need updating to accept structured `PriceCardPricingProp` objects instead of strings. The table only lists `price-card-section.astro` and `price-card-section.types.ts` but not the manifest or generated types.

3. **`formatPrice()` is mentioned but never defined.** The RFC says the component "calls `formatPrice()` (from `@warpgogol/share/formula-eval` or a new `@warpgogol/share/format` utility)" (line 129), but provides no TypeScript contract, no import path, and no explanation of how it relates to RFC-0729's `money` pipe formatter. The TypeScript contracts section (lines 170–199) does not include `formatPrice()`.

## Axis B — DNA alignment

1. **DNA-55 reference is tenuous.** DNA-55 is the "Spec vendoring contract" — it governs how external specification packages are vendored as immutable snapshots under `docs/specs/<spec-id>/`. The RFC says it "applies `pbp-specification-package/ADR-012` (decimal string money) to the display layer" (line 150). While ADR-012 is a spec decision within the vendored PBP spec package, DNA-55 itself is about vendoring mechanics (integrity manifests, immutability, amendment channels), not about applying spec decisions to display layers. The RFC's use of ADR-012 is correct, but claiming it "satisfies DNA-55" is a stretch. Consider whether DNA-55 is the right invariant to cite, or whether DNA-4 alone is sufficient.

2. **DNA-4 alignment is correct and well-justified.** The RFC strengthens DNA-4 by eliminating the presentation duplication loophole.

## Axis C — Ecosystem fit

1. **`guarantees` is NOT in `offeringSchema`.** The RFC claims `presentation.guarantees` duplicates `guarantees` — "Already in `guarantees` — no migration needed, references updated to canonical" (line 95). However, `offeringSchema` in `packages/pbp/src/schemas/offering.ts` does NOT include a `guarantees` field. The schema is `.strict()`, which means `guarantees` at the top level of an offering file should be rejected by the Zod schema. The content file `digital-foundation.md` has `guarantees:` at the top level (line 78 in UK) — this either passes because the Astro collection uses a permissive `z.object({}).catchall(z.any())` schema and the loader validation is not enforcing strict mode, or it fails silently. The RFC needs to either:
   - Add `guarantees` to `offeringSchema` as a typed field, or
   - Explain that `guarantees` should be modeled as `policyRefs` pointing to guarantee policy entities, or
   - Explain how `guarantees` is currently valid in the strict schema.

2. **`presentation` remains in `offeringSchema` — contradicts the goal.** The RFC says "The `offeringSchema` field remains in the Zod schema as `z.record(z.string(), z.unknown()).optional()` for backward compatibility with non-offering entities that still use it" (line 88). But non-offering entities (legal-identity, web-presence, public-document, business) have their own schemas — keeping `presentation` in `offeringSchema` does not provide backward compatibility for them. It only means offerings can still include `presentation`. The RFC should remove `presentation` from `offeringSchema` entirely. The other entity schemas already have their own `presentation` fields.

3. **Content reference syntax in structured props is incorrect.** The RFC's example (lines 137–140) shows:

   ```yaml
   monthly:
     amount: business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.amount.value
   ```

   This is a bare path string, not a content reference. Content references use `=(...)` formula syntax or `{collection.file.field}` brace syntax. The bare path would be interpreted as a literal string. The example should use:

   ```yaml
   monthly:
     amount: =(business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.amount.value)
   ```

4. **`price-card-section.manifest.yaml` propsSchema not mentioned.** The manifest defines `monthly`, `yearly`, `setup` as `type: string` (lines 30–35). Changing these to structured objects requires updating the manifest's `propsSchema` and regenerating the types. The RFC doesn't mention this.

## Axis D — Forward-only compliance

1. **Keeping `presentation` in `offeringSchema` is a backward compatibility mechanism.** The RFC says the field "remains in the Zod schema" (line 88) while saying "Offering files MUST NOT include `presentation`" (line 88). This is a dual-path — the schema accepts it but the policy forbids it. Forward-only discipline says no backward compatibility layers. If `presentation` is removed from offerings, remove it from `offeringSchema` too. There is no enforcement mechanism (no validator checks for `presentation` presence on offerings) — only `PBP-LEGACY-KEY` and `PBP-MONEY` flag specific keys/values inside it.

## Axis E — Agent-facing policy

1. **Empty `reviewers`** — V-25 flags empty reviewers. Informational for `draft` status; will be blocking at `reviewing`+.

2. **Implementation notes are clear and explicit.** The notes correctly reference RFC-0224, RFC-0330, RFC-0334, RFC-0480, and the UK→DE translation guide. No self-authorizing language detected.

3. **No NEEDS CLARIFICATION markers found.**

## Axis F — Pragmatism

1. **`formatPrice()` is vague.** The RFC mentions `formatPrice()` in two places (lines 129, 270) but never defines it. It says "from `@warpgogol/share/formula-eval` or a new `@warpgogol/share/format` utility" — the implementer doesn't know which. RFC-0729 provides a `money` pipe formatter inside `resolveFormula`, not a standalone `formatPrice()` function. The RFC should either:
   - Define `formatPrice()` as a standalone export from `@warpgogol/share/formula-eval` (extracting the `money` formatter logic), or
   - Use `resolveFormula` with a pipe expression inside the component, or
   - Define it in a new `@warpgogol/share/format` module with a TypeScript contract.

2. **`growthModules` price migration is unclear.** The current `growthModules.visibility.price` is `+29 € / місяць / до 12 цільових сторінок під послуги в локації` — a complex display string with qualifiers that go beyond a simple price. The RFC says to migrate to `relatedOfferings` with `label`/`description` display fields, and "Prices are referenced via content refs to the related offering's canonical charges, not duplicated" (line 255). But the RFC doesn't explain how the qualifier text ("up to 12 target pages for services in the location") would be handled — is it part of `description`? Is it a separate field? The `relatedOfferings` schema only gains `label` and `description` — there's no field for a price qualifier.

## Axis G — Blind spots

1. **Malformed content references in `funnel/{lang}/create-site.md`.** Lines 46–50 contain nested `=(...)` expressions like `=(business-profile.offerings/digital-foundation.presentation.=(business-profile.offerings/digital-foundation.presentation.growthModules.visibility.price`. This is existing broken content that the RFC's migration would need to address. The RFC doesn't mention it.

2. **Additional presentation fields not addressed.** The DE `digital-foundation.md` presentation block includes `price.monthlyAmount`, `price.yearlyAmount`, `price.setupAmount`, `price.moduleVisibilityAmount`, `price.moduleBookingAmount`, `price.moduleTrustAmount`, `price.moduleMultilangAmount`, `price.moduleAutomationAmount` (lines 88–95). These are numeric amounts used in `agb.md` for legal calculations. The RFC's migration table (lines 92–100) doesn't mention these fields. The UK presentation block doesn't have them — only the DE block does. The RFC needs to address where these canonical numeric values live (they're already in `pricing.charges` as decimal strings, but the `*Amount` presentation fields are bare numbers without currency formatting).

3. **Non-offering `presentation` references in prose files.** `prose/{lang}/barrierefreiheit.md` references `business-profile.documents/legal-notice.presentation.dates.lastReviewDate` and `business-profile.web/primary.presentation.domains.primary`. These are non-offering presentation fields that the RFC explicitly leaves in place (nonGoals line 48). The RFC should clarify that these references are intentionally unchanged.

## Questions for the author

1. **`guarantees` field**: `offeringSchema` does not include `guarantees` — it's `.strict()` and would reject it. How is `guarantees` currently valid in the offering content files? Should `guarantees` be added to `offeringSchema` as a typed field, or should guarantee data be modeled as `policyRefs` pointing to guarantee policy entities?

2. **`presentation` in `offeringSchema`**: Why keep `presentation` in `offeringSchema` if offering files MUST NOT include it? Non-offering entities have their own schemas with their own `presentation` fields. Should `presentation` be removed from `offeringSchema` entirely to enforce the prohibition?

3. **`formatPrice()`**: Where does `formatPrice()` live — `@warpgogol/share/formula-eval` or a new `@warpgogol/share/format`? What is its TypeScript signature? How does it relate to RFC-0729's `money` pipe formatter? Can the price-card component use `resolveFormula` with `=(ref | money currency=EUR locale=de)` instead of a standalone function?
