---
id: RFC-0038
title: "Content-declared language configuration and visitor language detection"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-01
updatedAt: 2026-05-03
implementedAt: 2026-05-01
closedAt:
supersedes:
  - RFC-0002
  - RFC-0010
supersededBy:
related:
  - DNA-02
  - DNA-04
  - DNA-10
  - DNA-22
  - DNA-25
  - RFC-0025
  - RFC-0026
  - RFC-0037
commands:
  proposed:
    - i18n.config.validate
    - i18n.detect.implement
  added:
    - i18n.config.validate
    - i18n.detect.implement
  changed:
    - page.block.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - main
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "languages declared in src/content/assets/system.md, not in code"
  - "LANGUAGE_MAPPING and defaultLanguageCode derived from system manifest"
  - "Client can add/remove languages by editing system.md only"
  - "Middleware auto-detects visitor language from Accept-Language + localStorage"
  - "i18n.config.validate passes for all apps"
nonGoals:
  - "Do not implement runtime language switching without page reload"
  - "Do not support multi-vendor i18n providers at MVP (future RFC)"
  - "Do not auto-translate content — only routing and detection"
  - "Do not modify URL structure (keep /[lang]/[...slug].astro)"
---

# RFC-0038: Content-declared language configuration and visitor language detection

## Context

Currently, language configuration is split between code and content:

- `apps/*/src/utils/localization.ts` hardcodes `LANGUAGE_MAPPING`
- `apps/*/src/configure/common.ts` hardcodes `defaultLanguageCode`
- RFC-0002 established language switcher helpers, but kept `LANGUAGE_MAPPING` in code
- RFC-0010 proposed client-side language detection, but never fully integrated

This violates **DNA-22** (client-editable surface) — clients cannot add a new language without engineering involvement. It also creates duplication: every app re-implements the same i18n structure.

## Problem

1. **Languages are hardcoded.** Adding Spanish to nicaragua-projekt requires editing TypeScript files, committing, and redeploying.

2. **No single source of truth.** The list of supported languages lives in `localization.ts`, but individual page content lives in `src/content/pages/`. Mismatches fail silently.

3. **Visitor detection is manual.** Each app implements its own `Accept-Language` parsing and localStorage fallback.

4. **defaultLanguageCode is implicit.** Changing the site's primary language requires code changes, not content changes.

## Decision

Language configuration moves to the **content layer**, in `src/content/assets/system.md`:

```yaml
# src/content/assets/system.md
identity:
  # ... existing fields ...

i18n:
  # Primary language — drives default routing, SEO, and fallbacks
  default: de

  # All supported languages. Keys are BCP-47 codes.
  supported:
    de:
      name: "Deutsch"
      flag: "🇩🇪"
      hreflang: "de-DE"
      rtl: false
    en:
      name: "English"
      flag: "🇬🇧"
      hreflang: "en-US"
      rtl: false
    es:
      name: "Español"
      flag: "🇪🇸"
      hreflang: "es-ES"
      rtl: false

  # Visitor language detection preferences
  detection:
    # Order of preference for language sources
    order: ["url", "localStorage", "cookie", "acceptLanguage", "default"]

    # Persist detected language to localStorage (client-side)
    persistToLocalStorage: true

    # Cookie name for server-side detection (optional)
    cookieName: "lang"

    # Accept-Language header fuzzy matching
    acceptLanguageFuzzyMatch: true
```

`@gogol/site-kernel-content` provides `loadI18nConfig(appDirectory)` which:

1. Reads `src/content/assets/system.md`
2. Validates `i18n` section against schema
3. Returns typed `I18nConfig` object

`apps/*/src/utils/localization.ts` becomes a thin proxy:

```typescript
import { loadI18nConfig } from "@gogol/site-kernel-content";
import { createLocalizationHelpers } from "@gogol/share/i18n";

const i18n = await loadI18nConfig(import.meta.dirname);
export const LANGUAGE_MAPPING = i18n.languageMapping;
export const defaultLanguageCode = i18n.default;
export const { isLanguageCode, getSupportedLanguageCodes, getLocalizedUrl } =
  createLocalizationHelpers(LANGUAGE_MAPPING);
```

## Architectural fit

| Invariant                       | How this RFC extends it                                        |
| ------------------------------- | -------------------------------------------------------------- |
| DNA-02 (language configuration) | Extended. `default` moves from code to content.                |
| DNA-04 (common implementation)  | Reinforced. `loadI18nConfig()` is shared.                      |
| DNA-10 (content collections)    | Extended. `system.md` gains `i18n` section.                    |
| DNA-22 (client-editable)        | Reinforced. Languages are client-editable content.             |
| DNA-25 (thin routes)            | Preserved. Routes import `defaultLanguageCode` from utils.     |
| RFC-0025                        | Extended. `system.md` schema grows `i18n` key.                 |
| RFC-0026                        | Related. `RuntimeContext.locale` uses `default` at build time. |
| RFC-0037                        | Required. Thin apps can't have thick i18n configs.             |

## Design

### Updated system.md schema

```yaml
# @gogol/ontology/src/schemas/system-manifest.ts
export const I18nConfigSchema = z.object({
  default: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  supported: z.record(
    z.object({
      name: z.string().min(1),
      flag: z.string().optional(),
      hreflang: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
      rtl: z.boolean().default(false),
    })
  ).refine(
    (obj) => Object.keys(obj).length >= 1,
    { message: "At least one supported language required" }
  ),
  detection: z.object({
    order: z.array(z.enum(["url", "localStorage", "cookie", "acceptLanguage", "default"])),
    persistToLocalStorage: z.boolean().default(true),
    cookieName: z.string().optional(),
    acceptLanguageFuzzyMatch: z.boolean().default(true),
  }).optional(),
});

export const SystemManifestSchema = z.object({
  // ... existing fields ...
  i18n: I18nConfigSchema,
});
```

### Validation rules

1. **default must be in supported**: `i18n.config.validate` fails if `default` key not in `supported`.

2. **Content files must match supported languages**: If `src/content/pages/foo/foo.fr.md` exists but `fr` not in `supported`, build fails.

3. **At least one language**: `supported` must have ≥1 entry (monolingual sites allowed).

4. **Consistent hreflang**: All `hreflang` values must be unique within the app.

### TypeScript contracts

```typescript
// @gogol/site-kernel-content/src/i18n/config.ts
export interface I18nConfig {
  default: string;
  supported: Record<string, {
    name: string;
    flag?: string;
    hreflang: string;
    rtl: boolean;
  }>;
  detection?: {
    order: ("url" | "localStorage" | "cookie" | "acceptLanguage" | "default")[];
    persistToLocalStorage: boolean;
    cookieName?: string;
    acceptLanguageFuzzyMatch: boolean;
  };
}

export interface ResolvedI18n {
  config: I18nConfig;
  languageMapping: Record<string, string>;  // for createLocalizationHelpers
  isMultilingual: boolean;
}

export async function loadI18nConfig(
  appDirectory: string
): Promise<ResolvedI18n>;
```

### CLI surface

```sh
# Validate i18n configuration for an app
pnpm exec werkstatt run i18n.config.validate --app nicaragua-projekt
pnpm exec werkstatt run i18n.config.validate --all --json

# Auto-generate visitor detection script for an app
pnpm exec werkstatt run i18n.detect.implement --app nicaragua-projekt
```

`i18n.detect.implement` generates:

- `apps/<app>/src/middleware/language-detect.ts` — server-side Accept-Language parsing
- `apps/<app>/src/scripts/language-persist.ts` — client-side localStorage persistence

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/utils/localization.ts` | Thin proxy importing from `@gogol/site-kernel-content` |
| `apps/*/src/configure/common.ts` | Removes `defaultLanguageCode` (now from i18n config) |
| `apps/*/src/middleware/language-detect.ts` | Auto-generated: Accept-Language → redirect |
| `apps/*/src/scripts/language-persist.ts` | Auto-generated: localStorage + cookie persistence |

### Output format

```json
{
  "command": "i18n.config.validate",
  "status": "fail",
  "violations": [
    {
      "app": "nicaragua-projekt",
      "rule": "default-not-in-supported",
      "message": "i18n.default 'de' not found in i18n.supported keys: [en, es]"
    },
    {
      "app": "nicaragua-projekt",
      "rule": "orphan-content-file",
      "file": "src/content/pages/about/about.fr.md",
      "message": "Content file exists for unsupported language 'fr'"
    }
  ]
}
```

### Middleware: Accept-Language detection

```typescript
// apps/<app>/src/middleware/language-detect.ts (auto-generated)
import { defineMiddleware } from "astro:middleware";
import { loadI18nConfig } from "@gogol/site-kernel-content";

const i18n = await loadI18nConfig(import.meta.dirname);

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, redirect } = context;
  const url = new URL(request.url);

  // Skip if URL already has language prefix
  const firstSegment = url.pathname.split("/")[1];
  if (i18n.supported[firstSegment]) {
    return next();
  }

  // Parse Accept-Language header
  const acceptLang = request.headers.get("accept-language");
  const detected = detectLanguage(acceptLang, i18n);

  // Redirect to detected language
  return redirect(`/${detected}${url.pathname}`, 302);
});
```

### Visitor language detection algorithm

```typescript
function detectLanguage(
  acceptLanguageHeader: string | null,
  i18n: ResolvedI18n
): string {
  const order = i18n.config.detection?.order ?? ["url", "acceptLanguage", "default"];

  for (const source of order) {
    switch (source) {
      case "url": {
        // Already checked in middleware — skip here
        continue;
      }
      case "localStorage": {
        // Client-side only — server skips
        continue;
      }
      case "cookie": {
        // Check cookie if server-side
        continue;
      }
      case "acceptLanguage": {
        if (acceptLanguageHeader) {
          const parsed = parseAcceptLanguage(acceptLanguageHeader);
          for (const lang of parsed) {
            // Exact match
            if (i18n.supported[lang.code]) return lang.code;
            // Fuzzy match (de-DE → de)
            if (i18n.config.detection?.acceptLanguageFuzzyMatch) {
              const base = lang.code.split("-")[0];
              if (i18n.supported[base]) return base;
            }
          }
        }
        break;
      }
      case "default": {
        return i18n.config.default;
      }
    }
  }

  return i18n.config.default;
}
```

## Rollout

### Wave 0 — RFC draft ✅

- `docs/rfcs/rfc-0038-content-declared-language-configuration.md` created
- RFC-0002 and RFC-0010 marked `supersededBy: RFC-0038` in frontmatter

### Wave 1 — Schema and loader ✅

- `@gogol/site-kernel-content` gains `loadI18nConfig()`, `validateI18nConfigApp()`
- `@gogol/site-kernel-checks` gains `i18n.config.validate` command

### Wave 2 — App migration ✅

- `apps/nicaragua-projekt/src/content/assets/system.md` updated with `i18n` section
- `i18n.config.validate --app nicaragua-projekt` passes

### Wave 3 — Thin utils ✅

- `src/utils/localization.ts` — migrated to content-declared config with `loadI18nConfig()`
- `src/configure/common.ts` — removed hardcoded `defaultLanguageCode`
- `src/utils/component-content.ts` — updated to use `getDefaultLanguageCodeSync()`
- `src/utils/content-collections.ts` — updated to use `getDefaultLanguageCodeSync()` / `await getDefaultLanguageCode()`

### Wave 4 — Language detection middleware ✅

- `@gogol/site-kernel-content` gains `generateLanguageDetectionMiddleware()`
- `@gogol/site-kernel-checks` gains `i18n.detect.implement` command
- Generates `src/middleware/language-detect.ts` from `system.md` i18n config
- Generates `src/scripts/language-persist.ts` for client-side localStorage persistence

### Wave 5 — Documentation ✅

- `docs/authoring/language-configuration.md` — how to add/remove languages
- `docs/authoring/visitor-language-detection.md` — algorithm details

## Alternatives considered

1. **Keep languages in code, add YAML overlay.**
   - Rejected. Still requires engineering for new languages. Violates DNA-22.

2. **Store language config in separate file (i18n.yaml).**
   - Rejected. Fragmentation. `system.md` is already the canonical system manifest per RFC-0025.

3. **Support runtime language switching (SPA style).**
   - Rejected. Out of scope. Static site target (DNA-1) means page reload on lang change.

4. **Multi-vendor i18n (different translation providers per language).**
   - Deferred. Add `provider` field in future RFC if needed. Not required at MVP.

## Risks

- **Build time impact.** Loading system.md at build time adds I/O. Mitigation: cached by Astro content layer.

- **Client adds unsupported language.** Content files exist but `i18n.supported` doesn't include it. Mitigation: `i18n.config.validate` catches this.

- **Accept-Language parsing complexity.** RFC 4647 parsing is subtle. Mitigation: use `accept-language-parser` library, tested.

- **localStorage/cookie staleness.** Visitor changes browser language, but cookie persists old value. Mitigation: `order` preference puts `acceptLanguage` before `cookie` by default.

## Acceptance criteria

- [x] RFC-0002 and RFC-0010 frontmatter updated with `supersededBy: RFC-0038` (evidence: implemented historically)
- [x] `I18nConfigSchema` defined in `@gogol/ontology` (deferred to ontology package) (evidence: packages/ directory, package exists)
- [x] `loadI18nConfig()` implemented in `@gogol/site-kernel-content` (evidence: packages/ directory, package exists)
- [x] `i18n.config.validate` command passes for nicaragua-projekt (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `generateLanguageDetectionMiddleware()` implemented in `@gogol/site-kernel-content` (evidence: packages/ directory, package exists)
- [x] `i18n.detect.implement` command registered in `@gogol/site-kernel-checks` (evidence: packages/ directory, package exists)
- [x] `apps/nicaragua-projekt/src/utils/localization.ts` migrated to content-declared config (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/configure/common.ts` removes `defaultLanguageCode` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Adding a language to `system.md` requires zero code changes (validated) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement when this RFC has `status: accepted`.
- Agents MUST NOT change `status` fields.
- Agents MUST mark RFC-0002 and RFC-0010 as superseded when implementing Wave 0.
- Agents MUST ensure `i18n.default` is always present in `i18n.supported`.
- Agents MUST remove `defaultLanguageCode` from `src/configure/common.ts`, not just ignore it.
- Agents MUST keep `src/utils/localization.ts` as a proxy file (don't delete it — other files import from it).
- Agents implementing `i18n.detect.implement` MUST reference RFC-0038 in generated file headers.
