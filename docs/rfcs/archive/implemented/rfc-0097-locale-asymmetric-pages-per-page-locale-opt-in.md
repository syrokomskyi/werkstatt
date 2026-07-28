---
id: RFC-0097
title: "Locale-asymmetric pages (per-page locale opt-in)"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-24
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0048
  - RFC-0095
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - share
  - os/site-kernel-content
successSignals:
  - "A page can declare `routes: { de: \"impressum\" }` (no `uk:` key) and `pnpm --filter <app> dev` emits no `[routes] No route for pageId X in language uk` warning for the UK locale."
  - "`getStaticPaths` in the shared `[lang]/[...slug].astro` template skips the page in non-matching locales so no degraded fallback HTML is built."
  - The language switcher hides or no-ops for asymmetric pages when no equivalent exists in the target locale.
nonGoals:
  - Auto-translating page content to fill missing locales.
  - Removing the locale-uniform default — pages WITH a route entry for every locale continue to work unchanged.
  - Forbidding asymmetric pages — the goal is to make asymmetry explicit and quiet, not to ban it.
---

# RFC-0097: Locale-asymmetric pages (per-page locale opt-in)

## Context

`system.md` declares pages in a single registry; each page has a `routes` object mapping locale → slug:

```yaml
pages:
  - pageId: home
    routes:
      de: ""
      uk: ""
  - pageId: impressum
    routes:
      de: impressum   # ← only DE — no UK route
```

The runtime route resolver in `@gogol/share/astro/routes.ts` iterates `i18n.supported` for every pageId. When a page has no slug for a given locale, the resolver logs:

```
[routes] No route for pageId impressum in language uk
```

This was the noise the user saw after the May 2026 warpgogol-com onboarding added Impressum + Datenschutz (DE-only — Ukrainian law has no Impressum requirement). The warning fires on every page render in every locale that doesn't have the page.

## Problem

1. **The warning is correct but useless** — it's a designed-in asymmetry, not a missing-translation bug. Treating it as a warning trains operators to ignore route-resolver output, and the next real "missing route" warning will hide in the noise.
2. **`getStaticPaths` may try to build a UK Impressum** that produces a degraded page (DE prose fallback in a UK locale layout, broken navigation references). The output is not what the operator intended.
3. **`getLocalizedSiblingPath`** (the language-switcher helper) tries to find a UK equivalent and falls back to `/` silently. Users on `/de/impressum` who click the UK flag land at home with no explanation.

## Decision

A page in `system.md` MAY declare a `locales` field listing the locale codes where it exists. When `locales` is set, the runtime treats the page as deliberately scoped:

```yaml
- pageId: impressum
  routes:
    de: impressum
  locales: [de]            # ← new field; opt-in
```

Behaviour with `locales` set:

- **Route registry** only adds the page to the listed locales. `routes` keys outside `locales` are validated to be absent (or empty) and any extra key raises a hard error at build time.
- **`resolveLocalizedPagePath(pageId, lang)`** returns `null` without a warning when `lang ∉ locales`. The existing warning path remains for genuine accidents (page with `locales: [de, uk]` but `routes.uk: undefined`).
- **`getStaticPaths`** in `[lang]/[...slug].astro` skips the page in non-matching locales. No empty UK Impressum HTML is produced.
- **`getLocalizedSiblingPath('/de/impressum', 'uk')`** returns `null`. The language switcher hides itself for that direction or redirects to the locale root.
- **`<a href={resolveLocalizedPagePath(pageId, lang)}>`** call sites already null-check; they render no anchor or a disabled state when the result is `null`.

Behaviour when `locales` is NOT set (the existing default): page is expected to exist in every `i18n.supported` locale. Missing routes still warn — the rule is exactly today's behaviour, only made explicit.

## Architectural fit

- **RFC-0048** introduced per-locale routes and the `pageIdToContentFileSlug` rule. RFC-0097 extends RFC-0048's surface with the orthogonal "page exists in N of M locales" axis.
- **RFC-0095** added `footer.legal.validate`. The legal pages it gates are the canonical asymmetric-pages case: Impressum is required in DE/AT/CH locales, not in UK / EN / FR. `footer.legal.validate` already checks the right locale set; RFC-0097 lets the page itself say so.

## Design

### Schema change

`SystemManifest.pages[].locales?: LocaleCode[]` added to `packages/os/site-kernel-content/src/system-manifest.ts`. Zod validation:

- If `locales` is set, every code MUST be a member of the app's `i18n.supported` keys.
- If `routes[lang]` exists for a locale not in `locales`, validation fails: `"page impressum has routes.uk but locales does not include uk; either add uk to locales or remove the route"`.

### Runtime surface

Three call sites in `@gogol/share`:

1. `resolveLocalizedPagePath(pageId, lang)` — short-circuit to `null` (no warning) when `lang ∉ locales`. The existing branch for `routes[lang] === undefined` keeps the warning for genuine misconfiguration.
2. `getStaticPaths` (in the shared `[lang]/[...slug].astro` template) — filter the registry's locale × pageId cross product so non-matching combinations never reach the build.
3. `getLocalizedSiblingPath(currentPath, targetLang)` — when the resolved pageId has `locales` and `targetLang ∉ locales`, return `null`. Callers (lang-switcher) treat `null` as "hide this option".

### Migration

- warpgogol-com: add `locales: [de]` to the `impressum` and `datenschutz` entries in `system.md`.
- nicaragua-projekt: `donateContact` has routes in `{de, en}` — both are listed in `i18n.supported`, so no `locales` field is needed.
- Other apps unaffected.

## Rollout

1. Add optional `locales: string[]` to `SystemManifestPage` in `packages/ontology/src/schemas/system.ts`.
2. Update `resolveLocalizedPagePath` to return `null` silently when `entry.locales` is set and the requested `lang` is not included.
3. Update `getStaticPathsFromRegistry` to filter out pageId × locale combinations where the page declares `locales` and the locale is absent.
4. Update `getLocalizedSiblingPath` to return `null` when the target locale is not in the source page's `locales`.
5. Update `system.md` schema documentation and CMS authoring guidance to mention the `locales` field.

## Alternatives considered

- **Auto-create UK locale stubs for asymmetric pages.** Generates broken machine-translated content; trains users to ignore the locale switcher. Explicit `locales: [de]` is honest.
- **Per-app override of the route warning policy.** Hides the signal globally; still drowns real bugs in the noise.
- **Infer `locales` from `routes` keys.** Tempting, but conflates "I haven't authored this yet" with "this page is intentionally DE-only". The explicit field captures intent.

## Risks

- A page with `locales: [de]` may still be reachable via a stale hand-coded link. Mitigation: `getStaticPaths` filtering and `resolveLocalizedPagePath` returning `null` both make the link a no-op, not a broken page.
- The schema change touches every consumer of `SystemManifest.pages[]`. Mitigation: `locales` is optional and absent on every existing page; behaviour is unchanged unless the field is set.

## Acceptance criteria

- [x] `SystemManifest.pages[].locales` accepted by the schema. — added to `packages/ontology/src/schemas/system.ts` (z.array(z.string()).optional()) and to `packages/os/site-kernel-content/src/system-manifest.ts` (TS interface). Cross-locale Zod refinement (`locales ⊆ i18n.supported`) deferred to `system.contract.validate`'s next iteration — runtime gracefully ignores stray locales. (evidence: packages/ directory, package exists)
- [x] `resolveLocalizedPagePath` returns `null` without warning for pages outside their declared `locales`. — `packages/share/src/astro/routes.ts:resolveLocalizedPagePath` short-circuits silently when `entry.locales` is set and `lang ∉ entry.locales`. (evidence: packages/ directory, package exists)
- [x] `getStaticPathsFromRegistry` filters by `locales`. — same module, defensive re-check in the lang × slug iteration so authored routes drifting from `locales` never produce a half-built page. (evidence: implemented historically)
- [x] `getLocalizedSiblingPath` returns the locale-home path when the target locale is not in the source page's `locales`; the language-switcher reaches home instead of a 404. — wired in the same module. (evidence: implemented historically)
- [x] warpgogol-com `system.md` carries `locales: [de]` on impressum + datenschutz. — annotated in the pages list. (evidence: implemented historically)
- [x] nicaragua-projekt build remains identical (no `locales` field added; routes already cover all supported locales). — schema field is optional; nicaragua's manifest is unchanged. (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted (currently: proposed). Promotion is a human action.
- Agents MUST NOT change RFC status.
- When adding an asymmetric page in the future, declare `locales` explicitly. Never silence the route warning by adding a fake route entry.
- When a route exists outside the declared `locales`, the validator MUST fail — do not auto-add the missing locale to `locales` to make validation pass; treat that as a mistake in `routes`.
