# `@warpgogol/ontology` — Agent Guide

This package is the **single source of truth for all structural vocabulary** — closed enums, manifest schemas, cosmic catalogs, and shared section props fragments (DNA-19, DNA-23, RFC-0023/0025/0071/0101).

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@warpgogol/ontology` | `src/index.ts` | Barrel: all exports below |
| `@warpgogol/ontology/enums` | `src/enums.ts` | `Layer`, `ComponentRole`, `Industry` — closed enums + Zod schemas. `SemanticRole` is an open type alias (RFC-0084). |
| `@warpgogol/ontology/manifest` | `src/manifest.ts` | `manifestSchema`, per-layer schemas, `KNOWN_INTENTS` |
| `@warpgogol/ontology/cosmic` | `src/cosmic/` | `StarCatalog`, `PlanetCatalog`, `MoonCatalog` + Zod name schemas (DNA-23) |
| `@warpgogol/ontology/schemas` | `src/schemas/` | `constellationSchema`, `biomeSchema`, `systemManifestSchema`, `PageEntrySchema`, `BlockEntrySchema`, `getSectionPropsSchema` (manifest-resolver) |
| `@warpgogol/ontology/operations` | `src/operations/` | Platform operations schemas: `handoff`, `sternsystem`, `werkstatt`, `mission`, `release`, `leitstand`, `notausgang`, `materialization`, `artifact-store`, `naming-policy` |
| `@warpgogol/ontology/shared-section-props` | `src/shared-section-props/` | `SHARED_SECTION_PROPS`, `composeManifestPropsSchema` (RFC-0101–0103) |
| `@warpgogol/ontology` (root) | `src/biome-token-projection.ts` | `BIOME_TO_TOKEN_MAP`, `BIOME_TOKEN_ALIASES`, `BIOME_TOKEN_DERIVED`, `projectBiomeToTokens()`, `getAllProjectedTokenNames()` — single source of truth for biome-YAML-field → `--ds-*` CSS custom property projection (RFC-0071). Consumed by codegen, contract validation, and drift detection. |

## Cosmic naming rules (DNA-23)

- **Pages** → `StarCatalog` (`StarName`)
- **Sections** → `PlanetCatalog` (`PlanetName`)
- **Components** → `MoonCatalog` (`MoonName`)

Cosmic names are manifest/YAML fields and UI strings only. Never use them in import paths, filenames, or directory names.

## Rules for AI agents

- `Layer`, `ComponentRole`, `Industry` are **closed enums**. Adding/removing/renaming a value requires a superseding RFC.
- `SemanticRole` is an **open type alias** since RFC-0084 — section roles are derived from the archetype catalog.
- `Intent` is an open vocabulary (typed as `string` with a known-good list).
- Catalogs are DNA-19 closed enums — extension requires a superseding RFC.
- **Three-way alignment** (DNA-23): if you change a cosmic name, update (1) the manifest.yaml, (2) `PLANET_IMPORT_PATHS`/`MOON_IMPORT_PATHS` in `@warpgogol/share/page`, (3) every `system.md` that pins it.

## Shared section props fragments (RFC-0101–0103)

Nine fragments in `src/shared-section-props/`:

- `section-visual` — background, glass, density, tone, containerVariant, motion
- `section-header` — tone-segmented heading, subheading, align, level
- `body-list`, `body-split-list`, `body-stats`, `body-cards`, `body-paragraphs`, `body-comparison`, `body-rich`

Section manifests compose them via `propsSchemaCompose` instead of duplicating JSON Schema.

## Validation

```sh
pnpm --filter @warpgogol/ontology build:check
```

## Architecture: schemas vs operations split (2026-07-10)

Platform operations schemas (handoff, sternsystem, werkstatt, mission, release, leitstand, notausgang, materialization, artifact-store, naming-policy) live in `src/operations/` and are consumed via `@warpgogol/ontology/operations`. UI ontology schemas (constellation, biome, system manifest, page entry, capability) remain in `src/schemas/` and are consumed via `@warpgogol/ontology/schemas`. The two sub-paths have distinct consumer groups — never mix them.

## Architecture: manifest-resolver extraction (2026-07-10)

`getSectionPropsSchema` lives in `src/schemas/manifest-resolver.ts`, not `page-entry.ts`. It concentrates all filesystem I/O (readdir, readFile, YAML parse) and fragment composition behind one interface. `page-entry.ts` is now purely declarative Zod schemas — no I/O imports.

## Architecture: archetype registry validation (2026-07-10)

`src/archetype-registry.ts` validates `archetypes/index.json` with Zod `safeParse` at import time. If the JSON shape drifts, the module throws a descriptive error (not a silent empty map). The schema mirrors the full index shape: entries, sectionRoles, componentRoles, planetImportPaths, blockTypeToCosmicName, moonImportPaths, roleByCosmicName.

## RFC-0504: New block types in archetype registry

Three new block types were added to `archetypes/index.yaml` for the ratgeber 12-section article layout:

| Block type | Cosmic name | Role | Import path |
| --- | --- | --- | --- |
| `article-header` | `Himalia` | `article-metadata-header` | `@warpgogol/ui/sections/article-header` |
| `toc` | `Metis` | `table-of-contents` | `@warpgogol/ui/sections/toc` |
| `changelog` | `Prometheus` | `changelog-history` | `@warpgogol/ui/sections/changelog` |

These are registered in `blockTypeToCosmicName`, `roleByCosmicName`, and `planetImportPaths`. The `PLANET_IMPORT_PATHS` in `@warpgogol/share/page` is registry-derived, so no manual import-path mapping is needed.

## RFC-0506: External surfaces C-contract — Article fields and FAQPage prohibition

`src/external-surfaces/jsonld-types.yaml` (the Layer C C-contract for JSON-LD types, RFC-0480) is updated:

- **Article type** `optional` fields now include `description` and `mainEntityOfPage` (in addition to `dateModified`, `image`, `articleBody`, `about`, `publisher`).
- **Ratgeber depth-1** `prohibitedTypes` now includes `FAQPage` — FAQ content is rendered as visible HTML blocks, not as JSON-LD.

The C-contract is enforced by `surface.contract.validate` in `build.check` and `seo.structured-data.validate` in `sites-check-postbuild` (SD-RAT-01..04 rules).

## RFC-0530: Organization type in jsonld-types.yaml

`src/external-surfaces/jsonld-types.yaml` now declares an `Organization` type:

- **Required:** `name`, `url`
- **Optional:** `legalName`, `description`, `foundingDate`, `email`, `address`, `sameAs`, `logo`, `image`, `contactPoint`, `identifier`, `founder`, `member`, `areaServed`, `employee`, `makesOffer`

The `optional` list covers all properties that `buildOrganizationNode` (`packages/share/src/semantic/jsonld/organization.ts`) currently emits. The `sameAs` property is populated by RFC-0530's projection chain: `Business.externalIdentifiers` → `schemeRef + value` URLs + social-profile `WebPresence.sameAs` URLs.
