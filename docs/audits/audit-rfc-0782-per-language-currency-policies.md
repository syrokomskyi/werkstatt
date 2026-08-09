---
rfcId: RFC-0782
auditId: AUDIT-RFC-0782-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0782

## Verdict: Needs revision

The RFC contains an internal contradiction between Part 2 (proposes `currencies.length > 1` visibility) and the Risks section's "Final decision" (keeps `activeLang !== defaultLang`). The Risks section retains draft deliberation prose ("Wait —", "Actually", "Final decision") that must be cleaned up. A success signal contradicts an acceptance criterion on DE locale behavior.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Internal contradiction on visibility condition**: Part 2 (line 102) says "visibility logic changes: instead of `activeLang !== defaultLang`, the selector is shown when `currencies.length > 1`". The Design section (lines 166-180) describes this change in detail. But the Risks section (line 322) reverses: "**Final decision**: Keep `activeLang !== defaultLang` visibility condition." Part 2 and the Design section were never updated to match the final decision. The RFC body is self-contradictory — an implementer cannot know which approach to follow.

2. **Risks section contains draft deliberation**: Lines 289-322 contain a meandering thought process — "Wait —", "Actually, the simplest approach is...", "**Final decision**". This is thinking-out-loud, not clean RFC prose. The Risks section should state the final decision and rationale concisely, with the deliberation removed. Part 2b (lines 291-322) should be folded into Part 2 or deleted if the final decision is "keep current condition."

3. **Success signal vs acceptance criterion mismatch**: Success signal (line 37) says "DE locale shows EUR-only pricing (no currency selector)". Acceptance criterion (line 329) says `loadTargetCurrencies` returns `[EUR, UAH]` for DE locale. These contradict: if DE has UAH in its policy, DE visitors have UAH price variants in the HTML — they just can't select them because the selector is hidden. The success signal should say "DE locale shows no currency selector" or "DE locale defaults to EUR pricing" rather than "EUR-only pricing."

4. **`currency-selector-component.astro` inline script detail gap**: Part 5 (line 249) says the inline script in `currency-selector-component.astro:56-75` "changes similarly" but doesn't show the code. The current inline script uses `define:vars={{ currencyCodes }}` — it would need `lang` added to `define:vars`. The RFC should spell this out explicitly, as it does for `header-component.astro`.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-11]` is a real invariant (language mirroring), and the RFC body explains how per-language currency policy overlays implement it. `related` references (DNA-4, RFC-0743, RFC-0736, RFC-0781) are all relevant and non-decorative.

## Axis C — Ecosystem fit

1. **Missing AGENTS.md mention**: The RFC changes component internal APIs in `packages/werkstatt-site` (adding `lang` parameter to `getSelectedCurrency`, `setSelectedCurrency`, `initCurrencySelector`). The RFC does not mention whether `packages/werkstatt-site/AGENTS.md` needs a rule update for the locale-scoped localStorage key pattern. If the AGENTS.md documents the `wg-currency` key, it needs updating.

2. **Compass sync not addressed**: The RFC changes component behavior in `packages/werkstatt-site`. If `docs/source-markup.xml` or `docs/technology.xml` reference the currency selector's localStorage key or API, they need synchronization. The RFC should state whether Compass docs are affected.

## Axis D — Forward-only compliance

No issues. The RFC explicitly abandons the old `wg-currency` localStorage key (line 272) with no migration path. No shims, dual-paths, or backward compatibility layers.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224, RFC-0330, RFC-0334. Storage uses localStorage only. No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

No issues. No new CLI commands. Extends existing currency selector (RFC-0743) rather than creating a new component. `packagesImpacted` and `appsImpacted` are correctly scoped. `nonGoals` are meaningful (no new currency types, no server-side detection).

## Axis G — Blind spots

No issues. Edge cases are covered: localStorage unavailable, visitor switches language, old `wg-currency` key. Migration path is documented (old key is harmless dead data). No PII or external services involved.

## Questions for the author

1. Which visibility condition is final — `currencies.length > 1` (Part 2) or `activeLang !== defaultLang` (Risks section)? Part 2 and the Design section must be updated to match the final decision.
2. If the final decision is `activeLang !== defaultLang`, should Part 2 and Part 2b be deleted entirely since no visibility change is needed?
3. Should `packages/werkstatt-site/AGENTS.md` document the locale-scoped localStorage key pattern (`wg-currency:{lang}`)?
