# @gogol/ontology

Closed-enum vocabulary, manifest schema, and cosmic catalogs for the WGogol Uni UI Ontology (DNA-23, RFC-0023).

## Purpose

Single source of truth for all structural vocabulary used across `packages/ui`, `packages/business`, validation commands, and app `system.yaml` files. Keeping enums and catalogs in one package ensures that a name added to the `MoonCatalog` is immediately visible to both the manifest validator and the codegen tooling.

## Entry points

| Import | What it provides |
| --- | --- |
| `@gogol/ontology` | Barrel — all exports below |
| `@gogol/ontology/enums` | `Layer`, `ComponentRole`, `Industry` — closed enums + Zod schemas. `SemanticRole` is an open type alias (`string`) since RFC-0084 — section roles are derived from the archetype catalog and validated by `archetype.registry.validate`. |
| `@gogol/ontology/manifest` | `manifestSchema`, per-layer schemas, `KNOWN_INTENTS` advisory list |
| `@gogol/ontology/cosmic` | `StarCatalog`, `PlanetCatalog`, `MoonCatalog` + Zod name schemas (DNA-23) |
| `@gogol/ontology/schemas` | `constellationSchema`, `biomeSchema`, `systemManifestSchema`, `PageEntrySchema`, `BlockEntrySchema`, `getSectionPropsSchema` |
| `@gogol/ontology/operations` | Platform operations schemas: `handoff`, `sternsystem`, `werkstatt`, `mission`, `release`, `leitstand`, `notausgang`, `materialization`, `artifact-store`, `naming-policy` |

## Cosmic naming rules (DNA-23)

- **Pages** → `StarCatalog` (`StarName`)
- **Sections** → `PlanetCatalog` (`PlanetName`)
- **Components** → `MoonCatalog` (`MoonName`)

Cosmic names are manifest/YAML fields and UI strings only. Never use them in import paths, filenames, or directory names.

## Usage

```typescript
import { MoonCatalog, moonNameSchema } from "@gogol/ontology/cosmic";
import { manifestSchema, type ComponentManifest } from "@gogol/ontology/manifest";
import { Layer, type SemanticRole } from "@gogol/ontology/enums";
// SemanticRole is an open string alias since RFC-0084. To enumerate the
// currently declared section roles at runtime, read sectionRoles[] from
// packages/ontology/archetypes/index.json.
```

### Validate a manifest file

```typescript
const result = manifestSchema.safeParse(rawYaml);
```

### Block-declarative schema (DNA-24)

```typescript
import { BlockEntrySchema, PageEntrySchema } from "@gogol/ontology/schemas";
```

### Platform operations schemas

```typescript
import { handoffManifestSchema, systemPinSchema } from "@gogol/ontology/operations";
```

### Archetype registry

The archetype registry (`src/archetype-registry.ts`) validates `archetypes/index.json` with Zod at import time. Shape drift throws a descriptive error instead of producing silently empty maps.

## Validation

```sh
pnpm --filter @gogol/ontology build:check
```
