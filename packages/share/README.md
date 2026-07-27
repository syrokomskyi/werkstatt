# @gogol/share

App-agnostic shared utilities for all WGogol Astro apps: entity-ID normalisation, i18n helpers, base Zod schemas, block-declarative page builder, runtime context, and browser scripts.

## When to use

Before implementing entity-ID normalisation, localisation helpers, or base page schemas in any `apps/*` file, check this package first. Re-implementing these utilities in an app is a violation.

## Entry points

| Import | What it provides |
| --- | --- |
| `@gogol/share` | **Deprecated compatibility barrel** — re-exports domains below (except `page` and `i18n`). Import from subpaths instead. |
| `@gogol/share/content` | `toDataEntryId`, `getEntryLanguage`, `stripEntryLanguage`, `createDispatcherResolver<T>` (generic), `deepMerge`, `deepMergeEntryData`, `mergeComponentContent`, `resolveFieldPath` |
| `@gogol/share/i18n` | `createLocalizationHelpers` factory |
| `@gogol/share/schemas` | `componentOverridesSchema`, `ComponentOverrides` |
| `@gogol/share/astro` | `getComponentContent`, `getLayoutContent` |
| `@gogol/share/middleware` | `createLanguageRedirectMiddleware` |
| `@gogol/share/scripts` | `initLordIconOnDemand`, `runStandardLayoutOrchestration` |
| `@gogol/share/runtime-context` | `RuntimeContext`, `EMPTY_RUNTIME_CONTEXT` (DNA-26, RFC-0026) |
| `@gogol/share/visibility` | `VisibilityExprSchema`, `evalVisibility`, `EMPTY_FEATURE_GRAPH` |
| `@gogol/share/page` | `buildPage`, `resolveComponentPath`, `PageEntry`, `ResolvedBlock` (DNA-24/25, RFC-0026) |
| `@gogol/share/semantic` | Semantic output models, extractors, JSON-LD, LLMs projections, page builders |
| `@gogol/share/semantic/models` | Semantic data models |
| `@gogol/share/semantic/jsonld` | JSON-LD builders |
| `@gogol/share/semantic/llms` | LLMs.txt output projection |
| `@gogol/share/semantic/extract` | Semantic extractors |
| `@gogol/share/semantic/page-utils` | Page-level semantic utilities |
| `@gogol/share/semantic/build-page` | `buildPage` (semantic layer) |
| `@gogol/share/semantic/output-projection` | Output projection helpers |

## Usage examples

### Entity IDs

```typescript
import { toDataEntryId, getEntryLanguage } from "@gogol/share/content";
```

### i18n helpers

```typescript
import { createLocalizationHelpers } from "@gogol/share/i18n";

const { isLanguageCode, getLocalizedUrl } = createLocalizationHelpers({ de: "Deutsch", en: "English" });
```

### Block-declarative page builder (DNA-25)

```astro
---
// src/pages/[lang]/[...slug].astro
import { buildPage } from "@gogol/share/page";

const page = await buildPage(entry, { locale: lang });
---
{page.blocks.map((block) => <Fragment set:html={block.rendered} />)}
```

### RuntimeContext (DNA-26)

```typescript
import { EMPTY_RUNTIME_CONTEXT, type RuntimeContext } from "@gogol/share/runtime-context";
// EMPTY_RUNTIME_CONTEXT = { locale: "de", segment: null, flags: {} }
```

### Layout orchestration (browser script)

```typescript
const { runStandardLayoutOrchestration } = await import("@gogol/share/scripts");
await runStandardLayoutOrchestration({ headerOffset: 80 });
```

## Adding a utility

A utility belongs here if it is: (1) app-agnostic — no `astro:content` or app-local imports; (2) stable API; (3) used or will be used by more than one app. New domains MUST ship as a subpath from day one — do not add to the root barrel.

## Validation

```sh
pnpm --filter @gogol/share build:check
```
