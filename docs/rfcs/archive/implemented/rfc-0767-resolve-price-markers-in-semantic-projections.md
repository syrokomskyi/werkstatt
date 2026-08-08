---
id: RFC-0767
title: "Resolve price markers in semantic projections"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0743
  - RFC-0765
  - RFC-0766
  - ADR-0033
satisfies:
  - DNA-4
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/ui"
successSignals:
  - "JSON-LD headline and description contain resolved EUR price strings instead of literal {price:...} markers"
  - "Meta description tag contains resolved EUR price string"
  - "Pages without price markers have unchanged JSON-LD and meta tags (no regression)"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not add multi-currency variants to JSON-LD — JSON-LD uses source currency (EUR) only"
  - "Does not change the semantic model structure — only resolves marker strings before they enter the model"
  - "Does not resolve price markers in prose body for semantic projections — prose body is not part of JSON-LD"
  - "Does not resolve price markers in the frontmatter title field — titles are short page names that do not contain price markers in practice"
  - "Does not resolve price markers in block-derived SemanticBlock content (items, body, summaries) — block extractors produce structured data for ItemList nodes, not headline/description fields; price markers in block props are resolved at the component render level (RFC-0765)"
---

# RFC-0767: Resolve price markers in semantic projections

## Context

The semantic layer (`packages/share/src/semantic/`) builds `SemanticPageModel` objects from page frontmatter. These models drive JSON-LD generation (`buildJsonLd`) and meta tags (`<meta name="description">`, Open Graph, etc.).

`buildSemanticPageModelWith` in `packages/share/src/semantic/build-page.ts` reads frontmatter fields:

- `title` → `page.title` → JSON-LD `name`
- `description` → `page.description` → JSON-LD `description`, `<meta name="description">`
- `header.heading` (from blocks) → `page.heading` → JSON-LD `headline`
- `header.subheading` / `tagline` (from blocks) → `page.lead` → JSON-LD `abstract`

When these fields contain `{price:offering:chargeRef}` markers (which they now do after RFC-0765 implementation replaced hardcoded prices with markers), the markers appear as literal strings in JSON-LD and meta tags:

```json
{
  "headline": "Рекомендуйте Warpgogol і отримайте {price:referral-fee:activation} за кожну підписку",
  "description": "Рекомендуйте Warpgogol бізнесу — 70 € за кожну підписку..."
}
```

This is incorrect: search engines and social crawlers see the marker syntax instead of the actual price.

## Problem

The semantic layer reads frontmatter values as-is and passes them through to JSON-LD. It has no knowledge of price markers. The `extractPageHeading` function in `build-page.ts` reads `header.heading` from block props — if the heading contains `{price:...}`, the marker flows into `page.heading` and then into JSON-LD `headline`.

The same applies to `page.description` (from frontmatter `description`) and `page.lead` (from `header.subheading` or `tagline`).

There are two issues:

1. **JSON-LD `headline`** — reads from `page.heading` which comes from block `header.heading`. After RFC-0765, hero headings use `{price:...}` markers. The marker appears literal in JSON-LD.
2. **JSON-LD `description` and `<meta name="description">`** — reads from `page.description` which comes from frontmatter `description`. If the description contains markers (currently it doesn't, but it should for consistency), they would appear literal.

The `description` frontmatter field currently has hardcoded prices (`70 €`, `300 €/міс`, `2 000 €/міс`). These should also become `{price:...}` markers for consistency, but only if the semantic layer can resolve them.

## Decision

The semantic layer resolves `{price:...}` markers to their **source currency (EUR) string representation** before building the `SemanticPageModel`. This means:

- `{price:referral-fee:activation}` → `"70 €"` in JSON-LD and meta tags
- `{price:pilot-steward:monthlySubscription}` → `"300 €"` in JSON-LD and meta tags

Source currency is used because JSON-LD and meta tags are consumed by search engines and social crawlers that do not support client-side currency switching. The EUR price is the canonical source price from which all other currencies are derived.

### 1. Resolution point

Price markers are resolved in `buildSemanticPageModelWith` in `build-page.ts`, after `extractPageHeading` returns the heading and lead, and before they are passed to `buildMarkdownPageSemantic`. The `description` from frontmatter is also resolved at this point.

```ts
const { heading, lead } = extractPageHeading(allBlocks, title, description);
const derivedPrices = reader.getDerivedPrices();
const resolvedHeading = resolvePriceMarkersForSemantic(heading, lang, derivedPrices);
const resolvedLead = lead ? resolvePriceMarkersForSemantic(lead, lang, derivedPrices) : undefined;
const resolvedDescription = resolvePriceMarkersForSemantic(description, lang, derivedPrices);
```

### 2. Resolution function

A new function `resolvePriceMarkersForSemantic` in `packages/share/src/semantic/` resolves `{price:...}` markers to source-currency strings:

```ts
function resolvePriceMarkersForSemantic(text: string, lang: string): string {
  return text.replace(PRICE_MARKER_RE, (match, offeringId, chargeRef) => {
    const ref = OFFERING_URI_PREFIX + offeringId;
    const entry = derivedPrices?.[ref]?.find(e => e.chargeRef === chargeRef);
    const sourceAmount = entry?.trace?.source?.amount ?? "0";
    return formatSourcePrice(sourceAmount, lang);
  });
}
```

Where `formatSourcePrice` formats the amount with the source currency symbol (e.g., `70 €` for EUR).

### 3. Derived prices access and type relocation

The semantic layer needs access to `derived-prices.generated.json`. This file is currently read by `packages/ui` via `loadDerivedPrices`. To avoid a circular dependency (`packages/share` cannot import from `packages/ui`), the `DerivedPriceEntry` type, `OFFERING_URI_PREFIX` constant, and `PRICE_MARKER_RE` regex are **moved from `packages/ui` to `packages/share/src/semantic/price-marker-resolver.ts`**. `packages/ui` imports them from `@warpgogol/share/semantic`.

The `loadDerivedPrices` function is also relocated to `packages/share/src/semantic/derived-prices-loader.ts` (a Node-only subpath export, not in the semantic barrel — avoids pulling `node:fs` into client bundles). Both `packages/ui` and the semantic readers import it from `@warpgogol/share/semantic/derived-prices-loader`.

Derived prices are accessed via a new `getDerivedPrices()` method on the `SemanticContentReader` interface. This preserves the `build-page.ts` module contract ("Do not read files — all I/O flows through the injected reader"). The method is called once per page in `buildSemanticPageModelWith` and the result is passed to `resolvePriceMarkersForSemantic`.

### 4. Frontmatter description markers

After this RFC is implemented, the frontmatter `description` field can safely use `{price:...}` markers:

```yaml
description: "Рекомендуйте Warpgogol бізнесу — {price:referral-fee:activation} за кожну підписку. Після 12 — пілотний мандат ({price:pilot-steward:monthlySubscription}/міс). Після пілоту — повний мандат ({price:full-steward:monthlySubscription}/міс)."
```

The semantic layer resolves these to EUR strings for JSON-LD and meta tags.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** Price markers in frontmatter resolve from `derived-prices.generated.json`, which is derived from PBP entity files. No hardcoded prices in frontmatter.
- **RFC-0743 (currency selector UI).** This RFC ensures JSON-LD and meta tags have correct price values, complementing the visible HTML price display.
- **RFC-0765 (price marker documentation).** This RFC extends price marker resolution to the semantic layer, the last pipeline stage that lacked support.

## Design

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/price-marker-resolver.ts` | New file (pure, no `node:fs`): `resolvePriceMarkersForSemantic` function, `DerivedPriceEntry` type, `OFFERING_URI_PREFIX` and `PRICE_MARKER_RE` constants, `formatSourcePrice` helper. Exported from semantic barrel. |
| `packages/share/src/semantic/derived-prices-loader.ts` | New file (Node-only, imports `node:fs`): `loadDerivedPrices` function. Subpath export only — NOT in semantic barrel to avoid pulling `node:fs` into client bundles. |
| `packages/share/src/semantic/build-page.ts` | Add `getDerivedPrices()` to `SemanticContentReader` interface; call `reader.getDerivedPrices()` once, resolve markers in heading, lead, description before building SemanticPageModel |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Implement `getDerivedPrices()` in `createFsSemanticReader` using `loadDerivedPrices` from `@warpgogol/share/semantic/derived-prices-loader` |
| `packages/pbp/src/semantic-model.ts` | Implement `getDerivedPrices()` in `astroSemanticReader` using `loadDerivedPrices` from `@warpgogol/share/semantic/derived-prices-loader` |
| `packages/ui/src/sections/price-card/price-variants.ts` | Import `DerivedPriceEntry` from `@warpgogol/share/semantic`; import `loadDerivedPrices` from `@warpgogol/share/semantic/derived-prices-loader` |
| `packages/ui/src/utils/price-marker.ts` | Import `OFFERING_URI_PREFIX` and `PRICE_MARKER_RE` from `@warpgogol/share/semantic` |

### TypeScript contracts

```ts
// packages/share/src/semantic/price-marker-resolver.ts

/**
 * Derived price entry shape (moved from packages/ui to packages/share
 * so both the semantic layer and UI components share a single type).
 */
export interface DerivedPriceEntry {
  chargeRef: string;
  targetCurrency: string;
  amount: { value: string; currency: string };
  trace: {
    source: { amount: string; currency: string };
    rate: { value: string; pair: string };
  };
}

export const OFFERING_URI_PREFIX = "https://warpgogol.com/id/offerings/";
export const PRICE_MARKER_RE = /\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\}/g;

/**
 * Format a source-currency amount for semantic projections.
 * Unlike formatPrice in packages/ui, this does NOT append a recurrence
 * suffix — JSON-LD headline/description fields are free-text strings
 * where the recurrence context is already in the surrounding sentence.
 * Uses Intl.NumberFormat with currencyDisplay: "narrowSymbol".
 * Output contains a non-breaking space (U+00A0) between number and symbol.
 */
function formatSourcePrice(amount: string, lang: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0\u00A0€";
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "EUR",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

/**
 * Resolve {price:offering:chargeRef} markers in a string to source-currency
 * (EUR) formatted strings for use in semantic projections (JSON-LD, meta tags).
 *
 * Returns the input string unchanged if no markers are present.
 * Returns "0 €" (with non-breaking space) for unknown offerings or chargeRefs
 * (same fallback as parsePriceMarkers in packages/ui).
 */
export function resolvePriceMarkersForSemantic(
  text: string,
  lang: string,
  derivedPrices?: Record<string, DerivedPriceEntry[]> | null,
): string;
```

### Output format

Before resolution (current behavior):

```json
{
  "headline": "Рекомендуйте Warpgogol і отримайте {price:referral-fee:activation} за кожну підписку",
  "description": "Рекомендуйте Warpgogol бізнесу — {price:referral-fee:activation} за кожну підписку..."
}
```

After resolution:

```json
{
  "headline": "Рекомендуйте Warpgogol і отримайте 70 € за кожну підписку",
  "description": "Рекомендуйте Warpgogol бізнесу — 70 € за кожну підписку..."
}
```

### Failure modes

- **Missing derived prices file (ENOENT):** `loadDerivedPrices()` returns `null`. Markers resolve to `"0\u00A0€"`. No crash. Same behavior as `parsePriceMarkers` in UI components.
- **Malformed JSON (parse error):** `loadDerivedPrices()` throws `SyntaxError` from `JSON.parse`. The exception propagates — a malformed generated file is a bug in the generation pipeline (`derived-prices.materialize`), not a missing-file scenario. The build fails loudly so the operator fixes the generator.
- **Unknown offering ID:** Marker resolves to `"0\u00A0€"`. No crash.
- **No markers in text:** `resolvePriceMarkersForSemantic` returns the input string unchanged. No performance overhead from regex replacement.
- **Site without multi-currency entitlement:** `derived-prices.generated.json` does not exist. Markers resolve to `"0\u00A0€"`. This is acceptable — sites without multi-currency should not use price markers in frontmatter.

## Rollout

- **Immediate:** Upon acceptance, `resolvePriceMarkersForSemantic` and the relocated types/constants are added to `packages/share/src/semantic/` and integrated into `build-page.ts`. `packages/ui` imports the relocated types/constants from `@warpgogol/share/semantic`.
- **No content migration needed:** Existing frontmatter without markers is unaffected. Frontmatter with markers (currently only `vidpovidalni-rekomendatsiyi.md` heading) is automatically resolved.
- **Additive:** The resolution function is additive — it resolves markers in existing string fields without changing the SemanticPageModel structure. No existing API is removed.
- **Frontmatter description update:** After implementation, the `description` field in `vidpovidalni-rekomendatsiyi.md` can be updated to use `{price:...}` markers instead of hardcoded prices.

## Alternatives considered

1. **Resolve markers in JSON-LD builder only** — rejected. The `description` field flows into both JSON-LD and `<meta name="description">`. Resolving at the `buildSemanticPageModelWith` level ensures both are correct.

2. **Store resolved prices in the SemanticPageModel** — rejected. This would change the model structure and require all consumers to handle the new field. Resolving markers in the string values before they enter the model is simpler and non-breaking.

3. **Use multi-currency variants in JSON-LD** — rejected. JSON-LD does not have a standard way to express multiple currency variants of a price. Search engines expect a single price. Source currency (EUR) is the canonical price; all other currencies are derived from it.

4. **Do nothing — markers in JSON-LD are harmless** — rejected. Search engines may interpret `{price:referral-fee:activation}` as a literal string, which is meaningless. This could affect how the page is indexed and displayed in search results.

## Risks

- **Semantic layer depends on derived prices file:** The semantic layer currently has no dependency on `derived-prices.generated.json`. This RFC adds one. Mitigation: the dependency is optional — if the file is missing, markers resolve to `"0 €"` and the semantic layer continues to function.
- **Price format in JSON-LD:** The resolved price string (e.g., `"70 €"`) is a human-readable string, not a structured `PriceSpecification` node. This is acceptable for `headline` and `description` fields, which are free-text strings. The existing `Offer` + `PriceSpecification` JSON-LD nodes (from PBP semantic profile) already provide structured price data.
- **Cross-package type relocation:** `DerivedPriceEntry`, `OFFERING_URI_PREFIX`, and `PRICE_MARKER_RE` move from `packages/ui` to `packages/share`. This is a breaking change for `packages/ui` imports — all imports of these symbols are updated to use `@warpgogol/share/semantic`. The `loadDerivedPrices` function also moves to `packages/share/semantic/derived-prices-loader.ts` (Node-only subpath) to avoid a circular dependency. Derived prices are accessed in the semantic layer via `reader.getDerivedPrices()` on the `SemanticContentReader` interface, preserving the `build-page.ts` module contract (no direct file I/O).

## Acceptance criteria

- [x] `resolvePriceMarkersForSemantic` function added to `packages/share/src/semantic/price-marker-resolver.ts` (evidence: packages/share/src/semantic/price-marker-resolver.ts:73-84, packages/share/src/tests/price-marker-resolver.test.ts:1-120)
- [x] `DerivedPriceEntry` type, `OFFERING_URI_PREFIX`, `PRICE_MARKER_RE` moved from `packages/ui` to `packages/share/src/semantic/price-marker-resolver.ts` (evidence: packages/share/src/semantic/price-marker-resolver.ts:25-34, packages/ui/src/sections/price-card/price-variants.ts:19-21)
- [x] `packages/ui` imports relocated symbols from `@warpgogol/share/semantic` (evidence: packages/ui/src/sections/price-card/price-variants.ts:17-18, packages/ui/src/utils/price-marker.ts:11-14, packages/ui/src/sections/markdown/prose-pipeline.ts:39)
- [x] `buildSemanticPageModelWith` in `build-page.ts` loads derived prices once and resolves markers in heading, lead, and description (evidence: packages/share/src/semantic/build-page.ts:251-256, packages/share/src/tests/build-page-price-markers.test.ts:68-162)
- [x] JSON-LD `headline` contains resolved EUR price string (with non-breaking space U+00A0) instead of `{price:...}` marker (evidence: packages/share/src/tests/build-page-price-markers.test.ts:95-98, packages/share/src/tests/price-marker-resolver.test.ts:43-45)
- [x] JSON-LD `description` contains resolved EUR price string (with non-breaking space U+00A0) instead of `{price:...}` marker (evidence: packages/share/src/semantic/build-page.ts:254-256, packages/share/src/tests/price-marker-resolver.test.ts:43-45)
- [x] `<meta name="description">` contains resolved EUR price string (evidence: packages/share/src/semantic/build-page.ts:256 — resolvedDescription flows into baseInput.description which feeds meta tags via MarkdownPageInput)
- [x] Pages without price markers have unchanged JSON-LD and meta tags (evidence: packages/share/src/tests/build-page-price-markers.test.ts:134-162)
- [x] Missing `derived-prices.generated.json` (ENOENT) resolves markers to `"0\u00A0€"` without crash (evidence: packages/share/src/tests/price-marker-resolver.test.ts:63-68, packages/share/src/tests/build-page-price-markers.test.ts:112-131)
- [x] Malformed `derived-prices.generated.json` (parse error) throws — build fails loudly (evidence: packages/share/src/semantic/derived-prices-loader.ts:30-31 — JSON.parse throws SyntaxError on malformed input, ENOENT is the only caught exception)
- [x] `tsc --noEmit` passes (evidence: `pnpm --filter @warpgogol/share,@warpgogol/ui,@warpgogol/site-kernel-content,@warpgogol/pbp run build:check` — all 4 packages pass)
- [x] `vitest run` passes (evidence: `pnpm --filter @warpgogol/share run test -- --run` — 33 files, 320 tests passed)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0767 — see command output below)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST resolve price markers to source currency (EUR) strings only — not multi-currency variants.
- Agents MUST NOT change the SemanticPageModel structure — only resolve marker strings before they enter the model.
- Agents MUST handle missing `derived-prices.generated.json` gracefully (resolve to `"0 €"`, no crash).
- Agents MAY update frontmatter `description` fields to use `{price:...}` markers after this RFC is implemented.
