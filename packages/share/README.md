# @warpgogol/share

App-agnostic shared utilities for all Warpgogol Astro apps: entity-ID normalisation, i18n helpers, base Zod schemas, block-declarative page builder, runtime context, and browser scripts.

## When to use

Before implementing entity-ID normalisation, localisation helpers, or base page schemas in any `apps/*` file, check this package first. Re-implementing these utilities in an app is a violation.

## Entry points

| Import | What it provides |
| --- | --- |
| `@warpgogol/share` | **Deprecated compatibility barrel** — re-exports domains below (except `page` and `i18n`). Import from subpaths instead. |
| `@warpgogol/share/content` | `toDataEntryId`, `getEntryLanguage`, `stripEntryLanguage`, `createDispatcherResolver<T>` (generic), `deepMerge`, `deepMergeEntryData`, `mergeComponentContent`, `resolveFieldPath` |
| `@warpgogol/share/i18n` | `createLocalizationHelpers` factory |
| `@warpgogol/share/schemas` | `componentOverridesSchema`, `ComponentOverrides` |
| `@warpgogol/share/astro` | `getComponentContent`, `getLayoutContent` |
| `@warpgogol/share/middleware` | `createLanguageRedirectMiddleware` |
| `@warpgogol/share/scripts` | `initLordIconOnDemand`, `runStandardLayoutOrchestration` |
| `@warpgogol/share/runtime-context` | `RuntimeContext`, `EMPTY_RUNTIME_CONTEXT` (DNA-26, RFC-0026) |
| `@warpgogol/share/visibility` | `VisibilityExprSchema`, `evalVisibility`, `EMPTY_FEATURE_GRAPH` |
| `@warpgogol/share/page` | `buildPage`, `resolveComponentPath`, `PageEntry`, `ResolvedBlock` (DNA-24/25, RFC-0026) |
| `@warpgogol/share/semantic` | Semantic output models, extractors, JSON-LD, LLMs projections, page builders |
| `@warpgogol/share/semantic/models` | Semantic data models |
| `@warpgogol/share/semantic/jsonld` | JSON-LD builders |
| `@warpgogol/share/semantic/llms` | LLMs.txt output projection |
| `@warpgogol/share/semantic/extract` | Semantic extractors |
| `@warpgogol/share/semantic/page-utils` | Page-level semantic utilities |
| `@warpgogol/share/semantic/build-page` | `buildPage` (semantic layer) |
| `@warpgogol/share/semantic/output-projection` | Output projection helpers |

## Usage examples

### Entity IDs

```typescript
import { toDataEntryId, getEntryLanguage } from "@warpgogol/share/content";
```

### i18n helpers

```typescript
import { createLocalizationHelpers } from "@warpgogol/share/i18n";

const { isLanguageCode, getLocalizedUrl } = createLocalizationHelpers({ de: "Deutsch", en: "English" });
```

### Block-declarative page builder (DNA-25)

```astro
---
// src/pages/[lang]/[...slug].astro
import { buildPage } from "@warpgogol/share/page";

const page = await buildPage(entry, { locale: lang });
---
{page.blocks.map((block) => <Fragment set:html={block.rendered} />)}
```

### RuntimeContext (DNA-26)

```typescript
import { EMPTY_RUNTIME_CONTEXT, type RuntimeContext } from "@warpgogol/share/runtime-context";
// EMPTY_RUNTIME_CONTEXT = { locale: "de", segment: null, flags: {} }
```

### Layout orchestration (browser script)

```typescript
const { runStandardLayoutOrchestration } = await import("@warpgogol/share/scripts");
await runStandardLayoutOrchestration({ headerOffset: 80 });
```

## Adding a utility

A utility belongs here if it is: (1) app-agnostic — no `astro:content` or app-local imports; (2) stable API; (3) used or will be used by more than one app. New domains MUST ship as a subpath from day one — do not add to the root barrel.

## Validation

```sh
pnpm --filter @warpgogol/share build:check
```
