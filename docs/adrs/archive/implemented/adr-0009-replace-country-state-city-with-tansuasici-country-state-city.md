---
id: ADR-0009
title: "Replace country-state-city with tansuasici/country-state-city"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: package
decider: architecture
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt: 2026-07-30
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0237
  - RFC-0238
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0009: Replace country-state-city with tansuasici/country-state-city

## Context

`@warpgogol/geo` (introduced by RFC-0237) provides a shared geo gazetteer for the Programmatic Surface. The city catalog builder in `packages/geo/src/cities.ts` imports `City` from the `country-state-city` npm package (v3.2.1) and calls `City.getCitiesOfCountry(alpha2)` to enumerate cities for a given country.

The `country-state-city` package is licensed under **GPL 3.0**, which is a copyleft license incompatible with the project's distribution model (proprietary sites built on top of shared packages). This creates a licensing risk for any build artifact that bundles or derives from `country-state-city` data.

The package is referenced in:

- `packages/geo/package.json` — dependency declaration
- `packages/geo/src/cities.ts:15` — `import { City } from "country-state-city"`
- `packages/geo/src/service.ts:32` — comment referencing `country-state-city`
- `packages/geo/AGENTS.md:12` — guidance to use ISO-backed sources

## Decision

Replace the `country-state-city` dependency with `@tansuasici/country-state-city` (MIT-licensed) in `packages/geo`.

- Swap the npm dependency in `packages/geo/package.json`.
- Adapt `packages/geo/src/cities.ts` to the new API: `CountryStateCity.getCitiesByCountryId(numericId)` replaces `City.getCitiesOfCountry(alpha2)`.
- Update comments in `service.ts` and guidance in `AGENTS.md` to reference the new package name.

## Justification

The operator made this decision to eliminate the GPL 3.0 licensing risk. The replacement library `@tansuasici/country-state-city` (MIT) provides equivalent data (250+ countries, 5K+ states, 150K+ cities, ISO 3166-1 compliant) with full TypeScript definitions.

Alternatives considered:

- **Keep `country-state-city` and accept GPL 3.0** — rejected: copyleft license is incompatible with proprietary distribution.
- **Use a different MIT-licensed geo library** — not evaluated: the operator explicitly chose `@tansuasici/country-state-city`.
- **Self-host the city data** — rejected: unnecessary maintenance burden when a well-maintained MIT package exists.

The API differs: the old package uses `City.getCitiesOfCountry(alpha2)` (ISO alpha-2 code), while the new package uses `CountryStateCity.getCitiesByCountryId(numericId)` (numeric country ID). The adapter code in `cities.ts` must resolve the numeric ID from the alpha-2 code (e.g. via `CountryStateCity.getCountryByIso2(alpha2)`).

## Consequences

- Positive: Eliminates GPL 3.0 copyleft risk from the geo gazetteer dependency chain. MIT license is compatible with all distribution models.
- Positive: Full TypeScript type definitions included in the new package.
- Negative: API migration required — `City.getCitiesOfCountry(alpha2)` → `CountryStateCity.getCitiesByCountryId(numericId)`, with an extra alpha-2 → numeric ID resolution step.
- Negative: City data may differ slightly between the two sources; composite-city overrides keyed by `baseId` (RFC-0238) must be re-validated against the new dataset.
- Technical debt: The `DEFAULT_OVERRIDES.cityNames` entries in `service.ts` are keyed by slugs derived from the old library's city names. If the new library uses different canonical names, override keys may need updating.

## Evolution

Revisit this decision if:

- The `@tansuasici/country-state-city` package becomes unmaintained or its data quality degrades.
- The city data differs significantly from the old library, causing route slug changes that break existing SEO.
- A new MIT-licensed geo library with better data coverage or API ergonomics becomes available.

Run `pnpm exec werkstatt run geo.catalog.validate --json` after the migration to verify catalog integrity.
