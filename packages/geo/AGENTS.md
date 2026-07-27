# @gogol/geo Agent Guide

This package owns the shared geo gazetteer used by Site OS validators and generators.

## Scope

- Keep the package app-agnostic. Do not read from `apps/*` or site-local content here. The `providerEntries` method accepts an `imageResolver` callback from the consumer — never pass `appDir` or do FS I/O inside this package.
- Treat `createGeoService(config?)` as the public facade for country, region, city, and slug lookups. `config` accepts `countries` (default `["DE"]`), `languages` (default `["de", "uk"]`), and `overrides` (merged on top of `DEFAULT_OVERRIDES`).
- `providerEntries(provider, langs, defaultLang, options?)` resolves geo provider axes (`geo.countries`, `geo.regions`, `geo.cities`) into entries + localized slugs. Unknown provider strings throw. The optional `imageResolver` callback keeps image-probing in the consumer.
- Slug generation uses a `SlugStrategy` registry in `slug.ts`. German and Ukrainian strategies are pre-registered. Add a new language by inserting a `SlugStrategy` entry into the `slugStrategies` Map — no runtime registration API.
- Keep locale-aware URL slugs deterministic. Changes to slug behavior can affect generated routes and must be validated before merge.
- Use ISO-backed sources where possible: `i18n-iso-countries`, `iso-3166-2`, and `country-state-city`.
- Composite-city corrections belong in the central override layer in `service.ts` (`DEFAULT_OVERRIDES.cityNames`), not in downstream validators or generated content.
- Region name overrides go in `GeoOverrides.regionNames` keyed by ISO 3166-2 code (e.g. `"DE-BW"`).

## Validation

- Run `pnpm exec site-kernel run geo.catalog.validate --json` after catalog or slug changes.
- Run `pnpm exec site-kernel run packages-check.run --json` when changing public contracts, exports, or validation-facing behavior.

## Source Markup

- Keep Compass scaffolding (`MODULE_CONTRACT`, `CHANGE_SUMMARY`) current for all non-trivial source files.
- Add stable semantic anchors when a file becomes hard to navigate or carries route/slug invariants.
