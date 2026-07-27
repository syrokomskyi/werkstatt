---
id: RFC-0010
title: "Add client-side language detection with hard fallback to default"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-14
updatedAt: 2026-06-04
implementedAt: 2026-04-14
closedAt: 2026-05-01
supersedes: []
supersededBy: RFC-0038
related:
  - RFC-0002
  - RFC-0008
  - DNA-02
  - DNA-11
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - main
  - my-main
packagesImpacted: []
successSignals:
  - "Static build completes without Astro.request.headers warnings"
  - "Root / path redirects to detected or default language without server-side headers"
  - "Unsupported browser language falls back to defaultLanguageCode deterministically"
  - "Same pattern deployable to all apps via copy-paste"
nonGoals:
  - "Does not remove server-side middleware (kept for SSR mode if enabled in future)"
  - "Does not add new kernel commands"
  - "Does not change the default language configuration"
  - "Does not extract shared utilities to packages/ (per-app copy pattern)"
---

# RFC-0010: Add client-side language detection with hard fallback to default

## Context

All apps in this monorepo use static builds (`output: "static"` in `astro.config.mjs`). The current language redirect implementation relies on Astro middleware (`src/middleware/language-redirect.ts`) that accesses `request.headers.get("accept-language")` to detect the visitor's preferred language.

During static site generation (SSG), Astro attempts to prerender pages but the middleware receives a synthetic request without real HTTP headers. This produces the warning:

```
[WARN] `Astro.request.headers` was used when rendering the route `src/pages/index.astro'`.
`Astro.request.headers` is not available on prerendered pages.
```

While the warning is benign (the code falls back to `defaultLanguageCode`), it indicates a structural mismatch: server-side header detection should not be used in a static build context.

## Problem

Three architectural issues exist:

1. **Build-time warnings pollute CI output** — the `Astro.request.headers` warning appears on every build, masking real issues.

2. **Static/prerendered root page cannot access headers** — the root `index.astro` is generated as static HTML and served by CDN. By the time a visitor's browser receives this HTML, no server-side logic has run.

3. **Inconsistent fallback behavior** — the middleware has fallback logic, but the static `index.astro` hard-codes `defaultLanguageCode` without attempting browser language detection. A German visitor with `Accept-Language: en-US` gets redirected to `/de/` (default) even if `/en/` exists.

## Decision

Root language detection moves from server-side middleware to **client-side JavaScript** in the static `index.astro` page. The decision:

1. **Static `index.astro` emits a lightweight inline script** that:
   - Reads `navigator.languages` or `navigator.language` (browser API)
   - Matches against `SUPPORTED_LANG_CODES` (hardcoded in the inline script)
   - Falls back to `defaultLanguageCode` if no match or if detection fails
   - Performs `window.location.replace()` to the detected language prefix

2. **Middleware is simplified or bypassed** for the root path in static mode:
   - The middleware remains for potential future SSR mode
   - In static builds, the middleware's root redirect is bypassed by the client-side script

3. **The fallback is deterministic and ironclad**:
   - If browser language detection fails → use `defaultLanguageCode`
   - If detected language is not in `SUPPORTED_LANG_CODES` → use `defaultLanguageCode`
   - If `navigator.languages` is empty or undefined → use `defaultLanguageCode`

## Architectural fit

- **DNA-02** — Language-prefixed URLs remain first-class; root `/` is only a detection/redirect entry point.
- **DNA-11** — Middleware is preserved but its root redirect becomes a no-op in static mode; client-side detection takes precedence.
- **RFC-0002** — Language switcher assumes `lang` flows from URL; this RFC ensures the initial URL detection happens correctly.
- **RFC-0008** — Content fallback is orthogonal; this RFC handles URL routing fallback, not content entry fallback.
- **Static-first invariant** — No server-side logic required for language detection; CDN can serve the root HTML unchanged.

## Design

### Client-side detection script

The inline script in `index.astro`:

```html
<script is:inline>
  // [RFC-0010] Client-side language detection with hard fallback
  (function() {
    var SUPPORTED_LANG_CODES = ['de', 'en'];
    var DEFAULT_LANG = 'de';

    function detectLanguage() {
      var navLangs = navigator.languages || [navigator.language || ''];
      for (var i = 0; i < navLangs.length; i++) {
        var code = navLangs[i].split('-')[0].toLowerCase();
        if (SUPPORTED_LANG_CODES.indexOf(code) !== -1) {
          return code;
        }
      }
      return DEFAULT_LANG;
    }

    var lang = detectLanguage();
    window.location.replace('/' + lang + '/');
  })();
</script>
```

Key characteristics:

- **ES5 syntax** for maximum browser compatibility (no `const`, arrow functions, template literals)
- **No external dependencies** — no imports, no fetch, no external scripts
- **Immediate execution** — wrapped IIFE runs synchronously before any paint
- **Hard fallback** — `DEFAULT_LANG` is returned if any step fails

### Meta refresh fallback

For browsers with JavaScript disabled, a `<meta http-equiv="refresh">` tag falls back to `defaultLanguageCode`:

```html
<meta http-equiv="refresh" content="0;url=/de/" />
```

This is the current behavior and remains unchanged. The meta refresh target is always `defaultLanguageCode` because server-side header detection is not available.

### Middleware modification

`src/middleware/language-redirect.ts` is updated to:

1. Skip root `/` redirect when running in static/prerender context (detected via `import.meta.env.PRERENDER`)
2. Continue handling non-root paths that lack language prefix (edge case protection)

```ts
// Inside middleware
if (pathname === '/' && import.meta.env.PRERENDER) {
  return next(); // Let static HTML handle it
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/nicaragua-projekt/src/pages/index.astro` | Modified — client-side detection script replaces hard redirect |
| `apps/nicaragua-projekt/src/middleware/language-redirect.ts` | Modified — skip root redirect in prerender context |
| `apps/nicaragua-projekt/src/configure/common.ts` | Reference — `defaultLanguageCode` source of truth |
| `apps/main/src/pages/index.astro` | Port — apply same pattern (future rollout) |
| `apps/my-main/src/pages/index.astro` | Port — apply same pattern (future rollout) |

## Rollout

### Phase 1: nicaragua-projekt (reference implementation)

1. Update `src/pages/index.astro` with client-side detection script
2. Update `src/middleware/language-redirect.ts` to skip root in prerender
3. Verify `pnpm --filter nicaragua-projekt build` produces no `Astro.request.headers` warnings
4. Verify root `/` redirects to detected language in browser
5. Verify unsupported language (e.g., `fr`) falls back to `/de/`

### Phase 2: main and my-main (port)

Apply the same pattern to `apps/main` and `apps/my-main` via copy-and-adapt:

1. Copy the inline script pattern to each app's `src/pages/index.astro`
2. Adjust `SUPPORTED_LANG_CODES` and `DEFAULT_LANG` per app's configuration
3. Update middleware if root redirect exists
4. Verify builds without warnings

### New apps

From day one, new apps use the client-side detection pattern in `index.astro` and do not implement server-side root redirect in middleware.

## Alternatives considered

- **Keep server-side detection with SSR mode** — rejected because `output: "static"` is a deliberate invariant for CDN hosting and fast cold starts.
- **Use Astro.preferredLocale** — rejected because it requires `output: "server"` or hybrid mode and does not eliminate the header access warning.
- **Generate multiple root files** — rejected because it would require `/index.html` to exist per language, which complicates CDN configuration and violates the single-entry-point pattern.
- **Remove root redirect entirely** — rejected because direct navigation to `/` is common; forcing 404 is poor UX.

## Risks

| Risk | Mitigation |
| --- | --- |
| **Flash of wrong language** | The inline script runs before paint; `window.location.replace()` does not create history entry. No visual flash expected. |
| **SEO impact** | Root `/` has `robots: noindex` (already configured); search engines index language-specific URLs directly. |
| **Client-side detection failure** | Hard fallback to `defaultLanguageCode` ensures redirect always happens. |
| **Middleware/root race condition** | Middleware skips root in prerender; no double-redirect possible. |

## Acceptance criteria

- [x] `apps/nicaragua-projekt/src/pages/index.astro` contains inline ES5 detection script (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Script hardcodes `SUPPORTED_LANG_CODES` matching `LANGUAGE_MAPPING` from `src/utils/localization.ts` (evidence: implemented historically)
- [x] Script uses `defaultLanguageCode` from `src/configure/common.ts` as fallback (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/src/middleware/language-redirect.ts` skips root redirect in prerender context (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm --filter nicaragua-projekt build` produces no `Astro.request.headers` warnings (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Browser with `Accept-Language: en` redirects to `/en/` (if supported) (evidence: implemented historically)
- [x] Browser with `Accept-Language: fr` redirects to `defaultLanguageCode` (evidence: implemented historically)
- [x] Browser with JavaScript disabled falls back to meta-refresh to `defaultLanguageCode` (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC only when `status: accepted`.
- Agents MUST NOT change the `status` field.
- Agents MUST ensure the inline script uses ES5 syntax (var, function, no template literals) for IE11 compatibility.
- Agents MUST hardcode `SUPPORTED_LANG_CODES` and `DEFAULT_LANG` in the inline script — do not attempt to import TypeScript modules into inline browser code.
- Agents MUST preserve the existing meta refresh tag as a no-JS fallback.
- Agents MUST test that the build produces no `Astro.request.headers` warnings.
- Agents MUST verify the middleware modification does not break non-root redirects (e.g., `/old-path` → `/de/old-path`).
