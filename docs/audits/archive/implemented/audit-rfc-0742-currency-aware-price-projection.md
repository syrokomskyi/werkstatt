---
rfcId: RFC-0742
auditId: AUDIT-RFC-0742-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0742

## Verdict: Needs revision

The RFC invents new type names (`PbpWebsiteOfferingProjection`, `PbpAiAnswerOfferingProjection`) that do not exist in the codebase instead of extending the actual existing types (`PbpWebsiteProjection`, `PbpAiAnswerProjection`). It also lists `@warpgogol/share` in `packagesImpacted` without proposing any changes to that package, and references decision numbers (#29, #31–#35) without citing their source (RFC-0735).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Non-existent type names.** Sections 5 and 6 extend `PbpWebsiteOfferingProjection` and `PbpAiAnswerOfferingProjection`, but these types do not exist in `packages/pbp`. The actual types are `PbpWebsiteProjection` (`@/packages/pbp/src/projections/website.ts:10`) and `PbpAiAnswerProjection` (`@/packages/pbp/src/projections/ai-answer.ts:11`). The RFC must either extend the real types or explicitly state that it introduces new per-Offering projection sub-types and explain why the existing top-level projection types are insufficient.

2. **Duplicated interface definitions.** The `PbpPriceProjection` and `PbpPriceDisplayConfig` interfaces are defined twice — once in § Decision (lines 89–113) and again in § TypeScript contracts (lines 224–255). The TypeScript contracts section should be the single canonical definition; the Decision section should describe the shape in prose.

3. **Disclosure note locale mismatch.** § Disclosure note (lines 128–137) shows examples in Russian (`"Цена рассчитана по курсу…"`, `"Ориентировочная цена…"`). The site locales are UK (uk) and DE (de), not RU. The examples should use actual site locales, and the RFC should define the note templates for `uk` and `de` explicitly, not leave them as "Localized per language."

4. **`Intl.NumberFormat` output format.** The example JSON (line 276) shows `"formatted": "3 239 ₴"` with a regular space. `Intl.NumberFormat` produces a non-breaking space (U+00A0) between number and currency symbol. The example should use `\u00A0` or note that the actual output contains a non-breaking space.

5. **`rate` field redundancy.** `PbpPriceProjection.rate` has `value`, `pair`, and `formatted`. The `pair` field (e.g. `"EUR/UAH"`) is derivable from the materialized price's source and target currencies. The RFC should justify why `pair` is stored in the projection rather than computed by the consumer, or remove it.

## Axis B — DNA alignment

1. **DNA-4 satisfaction is weak.** The RFC says "Price projections are derived from canonical PBP content, not stored as content" (line 210). DNA-4 is about where canonical content lives (`src/content/`). The RFC should explain that canonical price data remains in `src/content/business-profile/` and projections are build-time derived data — this is what satisfies DNA-4. The current phrasing doesn't make the connection explicit.

2. **DNA-55 satisfaction is vague.** The RFC says "Extends the existing Website and AI Answer Projections" (line 211). DNA-55 is about the spec vendoring contract — immutability of `docs/specs/`, `pbp/*@1` namespace freezing. The RFC should state that it extends platform-side projection types without modifying the vendored `pbp-specification-package` snapshot, which is what DNA-55 enforces.

## Axis C — Ecosystem fit

1. **Pipeline step not named.** The RFC says "The projection is built as part of the existing projection generation step" (line 220) but does not name the step. The existing projection generation is compiler Phase 12 (Projection) in `packages/pbp/src/compiler/projection.ts`. The RFC should explicitly state which compiler phase or pipeline step is extended.

2. **AGENTS.md update not identified.** `packages/pbp/AGENTS.md` has a detailed API surface section listing all exported types by RFC. The RFC does not mention updating this file to document `PbpPriceProjection`, `PbpPriceDisplayConfig`, and `buildPriceProjection`.

3. **Compass sync not identified.** If the RFC adds new exported types to `@warpgogol/pbp`, `docs/technology.xml` or `docs/knowledge-graph.xml` may need synchronization. The RFC should identify which Compass documents need updates.

## Axis D — Forward-only compliance

No issues. The RFC extends existing projections with optional fields. No compatibility shims, no dual-paths, no legacy maintenance.

## Axis E — Agent-facing policy

1. **Decision numbers without source.** Implementation notes (lines 344–346) reference "decision #31", "decision #34", "decision #33" but do not cite where these decisions are defined. An agent reading this RFC in isolation cannot find decision #31. The RFC should reference RFC-0735 § Design decisions adopted from research document, or inline the decision text.

2. **`allowedUses` enforcement code is illustrative, not contractual.** § allowedUses enforcement (lines 184–196) shows code that returns `null` when `allowedUses.presentation` is false, but the enforcement is described as a MUST. The RFC should clarify whether this is the exact enforcement logic or an illustrative pattern — the actual enforcement point (projection builder vs. projection consumer) should be unambiguous.

## Axis F — Pragmatism

1. **`@warpgogol/share` in `packagesImpacted` is likely incorrect.** The RFC places all types and functions in `packages/pbp/src/projections/price-projection.ts`. § Integration with `money` pipe formatter (lines 198–206) explicitly says "the projection provides the pre-formatted string directly" and "the pipe formatter is used for ad-hoc conversions" — no changes to `@warpgogol/share` are proposed. `packagesImpacted` should list only `@warpgogol/pbp` unless a concrete change to `@warpgogol/share` is identified.

2. **`buildPriceProjection` return type inconsistency.** § Decision (line 147) shows `): PbpPriceProjection;` (non-null), but § TypeScript contracts (line 254) shows `): PbpPriceProjection | null;` (nullable). The nullable variant is correct (§ allowedUses enforcement returns `null`). The Decision section should match.

## Axis G — Blind spots

1. **Locale count not accounted for.** § Risks (line 325) says "6 Offerings × 2 currencies = 12 projections." But `buildPriceProjection` accepts a `locale` parameter, so the projection is per-Offering × per-currency × per-locale. For 2 locales (uk, de) × 6 Offerings × 2 currencies = 24 projections. The RFC should account for locales in its size estimate.

2. **Unsupported locale fallback.** § Failure modes (line 305) covers `Intl.NumberFormat` failure but not unsupported locale. If `locale` is `"ru"` (not a site locale), `Intl.NumberFormat` falls back to the system default. The RFC should specify the fallback locale behavior — does the projection builder validate the locale against the site's supported locales?

3. **Consumer adoption path.** The RFC says the projection is extended with optional `priceProjections` and `priceTraces` fields, but doesn't describe how existing projection consumers (website components, AI answer generators) adopt the new fields. Do they need to check `priceProjections !== undefined`? Is there a default rendering when the field is absent? The RFC should describe the consumer contract.

## Questions for the author

1. Why does the RFC use `PbpWebsiteOfferingProjection` and `PbpAiAnswerOfferingProjection` instead of extending the actual existing types `PbpWebsiteProjection` and `PbpAiAnswerProjection`? Are new per-Offering sub-types intentionally introduced, or is this a naming error?

2. What concrete change does this RFC make to `@warpgogol/share`? If none, remove it from `packagesImpacted`.

3. Where do the disclosure note templates live for `uk` and `de` locales? The RFC shows Russian examples but the site locales are UK and DE. Define the actual note strings for each locale and each `commercialMeaning` value.
