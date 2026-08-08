---
id: RFC-0767
title: "Resolve price markers in semantic projections"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
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
  - DNA-16
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
const resolvedHeading = resolvePriceMarkersForSemantic(heading, lang);
const resolvedLead = lead ? resolvePriceMarkersForSemantic(lead, lang) : undefined;
const resolvedDescription = resolvePriceMarkersForSemantic(description, lang);
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

### 3. Derived prices access

The semantic layer needs access to `derived-prices.generated.json`. This file is already read by `packages/ui` via `loadDerivedPrices`. The resolution function either:
- Reads the file directly from `process.cwd()/src/derived-prices.generated.json` (same pattern as `packages/ui`)
- Or receives the derived prices as a parameter from the caller

The direct-read approach is simpler and matches the existing `loadDerivedPrices` pattern. A shared utility in `packages/ui/src/utils/price-marker.ts` or a new `packages/share/src/semantic/price-marker-resolver.ts` can encapsulate this.

### 4. Frontmatter description markers

After this RFC is implemented, the frontmatter `description` field can safely use `{price:...}` markers:

```yaml
description: "Рекомендуйте Warpgogol бізнесу — {price:referral-fee:activation} за кожну підписку. Після 12 — пілотний мандат ({price:pilot-steward:monthlySubscription}/міс). Після пілоту — повний мандат ({price:full-steward:monthlySubscription}/міс)."
```

The semantic layer resolves these to EUR strings for JSON-LD and meta tags.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** Price markers in frontmatter resolve from `derived-prices.generated.json`, which is derived from PBP entity files. No hardcoded prices in frontmatter.
- **DNA-16 (Semantic layer shares topology with navigation).** The semantic layer reads the same frontmatter as the visible page. Price marker resolution ensures the semantic layer sees the same price values as the visible HTML (in source currency).
- **RFC-0743 (currency selector UI).** This RFC ensures JSON-LD and meta tags have correct price values, complementing the visible HTML price display.
- **RFC-0765 (price marker documentation).** This RFC extends price marker resolution to the semantic layer, the last pipeline stage that lacked support.

## Design

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/build-page.ts` | Resolve price markers in heading, lead, description before building SemanticPageModel |
| `packages/share/src/semantic/price-marker-resolver.ts` | New file: `resolvePriceMarkersForSemantic` function |

### TypeScript contracts

```ts
// packages/share/src/semantic/price-marker-resolver.ts

/**
 * Resolve {price:offering:chargeRef} markers in a string to source-currency
 * (EUR) formatted strings for use in semantic projections (JSON-LD, meta tags).
 *
 * Returns the input string unchanged if no markers are present.
 * Returns "0 €" for unknown offerings or chargeRefs (same fallback as parsePriceMarkers).
 */
export function resolvePriceMarkersForSemantic(
  text: string,
  lang: string,
  derivedPrices?: Record<string, DerivedPriceEntry[]>,
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

- **Missing derived prices file:** `loadDerivedPrices()` returns `null`. Markers resolve to `"0 €"`. No crash. Same behavior as `parsePriceMarkers` in UI components.
- **Unknown offering ID:** Marker resolves to `"0 €"`. No crash.
- **No markers in text:** `resolvePriceMarkersForSemantic` returns the input string unchanged. No performance overhead from regex replacement.
- **Site without multi-currency entitlement:** `derived-prices.generated.json` does not exist. Markers resolve to `"0 €"`. This is acceptable — sites without multi-currency should not use price markers in frontmatter.

## Rollout

- **Immediate:** Upon acceptance, `resolvePriceMarkersForSemantic` is added to `packages/share/src/semantic/` and integrated into `build-page.ts`.
- **No content migration needed:** Existing frontmatter without markers is unaffected. Frontmatter with markers (currently only `vidpovidalni-rekomendatsiyi.md` heading) is automatically resolved.
- **Backward compatible:** The resolution function is additive. No existing API changes.
- **Frontmatter description update:** After implementation, the `description` field in `vidpovidalni-rekomendatsiyi.md` can be updated to use `{price:...}` markers instead of hardcoded prices.

## Alternatives considered

1. **Resolve markers in JSON-LD builder only** — rejected. The `description` field flows into both JSON-LD and `<meta name="description">`. Resolving at the `buildSemanticPageModelWith` level ensures both are correct.

2. **Store resolved prices in the SemanticPageModel** — rejected. This would change the model structure and require all consumers to handle the new field. Resolving markers in the string values before they enter the model is simpler and non-breaking.

3. **Use multi-currency variants in JSON-LD** — rejected. JSON-LD does not have a standard way to express multiple currency variants of a price. Search engines expect a single price. Source currency (EUR) is the canonical price; all other currencies are derived from it.

4. **Do nothing — markers in JSON-LD are harmless** — rejected. Search engines may interpret `{price:referral-fee:activation}` as a literal string, which is meaningless. This could affect how the page is indexed and displayed in search results.

## Risks

- **Semantic layer depends on derived prices file:** The semantic layer currently has no dependency on `derived-prices.generated.json`. This RFC adds one. Mitigation: the dependency is optional — if the file is missing, markers resolve to `"0 €"` and the semantic layer continues to function.
- **Price format in JSON-LD:** The resolved price string (e.g., `"70 €"`) is a human-readable string, not a structured `PriceSpecification` node. This is acceptable for `headline` and `description` fields, which are free-text strings. The existing `Offer` + `PriceSpecification` JSON-LD nodes (from PBP semantic profile) already provide structured price data.
- **Cross-package import:** `packages/share` needs to import derived prices loading logic from `packages/ui` or duplicate it. Mitigation: the `resolvePriceMarkersForSemantic` function reads `derived-prices.generated.json` directly using the same pattern as `loadDerivedPrices` in `packages/ui`. No cross-package import needed.

## Acceptance criteria

- [ ] `resolvePriceMarkersForSemantic` function added to `packages/share/src/semantic/price-marker-resolver.ts`
- [ ] `buildSemanticPageModelWith` in `build-page.ts` resolves markers in heading, lead, and description
- [ ] JSON-LD `headline` contains resolved EUR price string instead of `{price:...}` marker
- [ ] JSON-LD `description` contains resolved EUR price string instead of `{price:...}` marker
- [ ] `<meta name="description">` contains resolved EUR price string
- [ ] Pages without price markers have unchanged JSON-LD and meta tags
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST resolve price markers to source currency (EUR) strings only — not multi-currency variants.
- Agents MUST NOT change the SemanticPageModel structure — only resolve marker strings before they enter the model.
- Agents MUST handle missing `derived-prices.generated.json` gracefully (resolve to `"0 €"`, no crash).
- Agents MAY update frontmatter `description` fields to use `{price:...}` markers after this RFC is implemented.
