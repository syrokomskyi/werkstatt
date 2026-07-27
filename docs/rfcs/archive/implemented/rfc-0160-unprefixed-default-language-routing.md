---
id: RFC-0160
title: "Unprefixed default-language routing (default at /, non-default under /<lang>/)"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-04
updatedAt: 2026-06-05
implementedAt: 2026-06-05
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0048
  - RFC-0159
amendedBy: []
related:
  - RFC-0048
  - RFC-0049
  - RFC-0055
  - RFC-0097
  - RFC-0149
  - RFC-0159
commands:
  proposed: []
  added:
    - route.topology.validate
  changed:
    - root.canonical.validate
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
---

# RFC-0160: Unprefixed default-language routing (default at /, non-default under /<lang>/)

## Summary

Serve the **default language without a URL prefix**. The default-language home is `/`, default-language pages are `/<slug>` (e.g. `/datenschutz`, `/impressum`), and only **non-default** languages keep their prefix (`/en/`, `/en/privacy`). The `/<defaultLang>/` route tree (`/de/`, `/de/datenschutz`, …) ceases to exist entirely.

> **Scope note (no legacy / no 301).** These are treated as brand-new sites: there is no existing `/<defaultLang>/*` index to preserve, so this RFC ships **no** legacy 301 redirects and **no** backward-compatibility layer. The `/<defaultLang>/` tree is simply not generated.

This completes the intent of RFC-0159: `/` becomes the **true canonical** home (no `/de/` duplicate), so the RFC-0159 root canonical override to `/<defaultLang>/` is removed.

## Context

RFC-0048 established a localized route registry where **every** language — including the default — is addressed under a language prefix (`/de/…`, `/en/…`). RFC-0159 made `/` serve the default-language home content but, on a static host, kept `/<defaultLang>/` canonical (Option B) to avoid touching the sitemap/hreflang symmetry subsystem.

The product decision is to drop the default-language prefix entirely: the default audience should land on clean, prefix-free URLs (`/`, `/datenschutz`), which is also the conventional SEO layout for a primary-language site.

Because the sites are treated as brand-new (no indexed `/<defaultLang>/*` surface to preserve), the static constraint that forced RFC-0159 into Option B no longer applies — the prefixed default tree is simply never emitted, with no redirect layer required.

## Problem

The current URL topology hard-codes `/<lang>/<slug>` for all languages. URL construction is duplicated as inline ternaries (`slug === "" ? `/${lang}/` : `/${lang}/${slug}``) across:

- `packages/share/src/astro/routes.ts` — `resolveLocalizedPagePath`, `getLocalizedSiblingPath`, `getStaticPathsFromRegistry`, `buildSitemapClusters`, `getAlternateLinks`.
- `packages/os/site-kernel-checks/src/sitemap.ts` — `buildClustersFromSystemMd`.
- `packages/share/src/middleware/language-redirect.ts` — prefixes unprefixed paths.
- `apps/<site>/src/pages/[lang]/[...slug].astro` — the single dynamic route.

There is no single seam that decides "does this language carry a prefix?", so the default-prefix policy cannot be changed without scattered edits. There is also no validator guarding the new invariant that **a default-language slug must never collide with a supported language code** (e.g. a page slug `en` would shadow the `/en/` tree).

The unprotected invariant: **the default language is addressed without a prefix; non-default languages are addressed with their prefix; the two URL spaces never collide.**

## Decision

Introduce an explicit, centrally-owned URL policy in the route registry:

- A single helper `localizeUrl(lang, slug, { defaultLanguage })` in `@gogol/share` is the **only** place that maps `(lang, slug)` → URL path:
  - default language, home (`slug === ""`) → `/`
  - default language, page → `/<slug>`
  - non-default language, home → `/<lang>/`
  - non-default language, page → `/<lang>/<slug>`
- Every inline ternary listed in "Problem" is replaced by `localizeUrl`.
- **Authoring is unchanged.** `system.md pages[].routes` keeps the same `{ de: "datenschutz", en: "privacy" }` shape; only URL _projection_ changes.

### Route topology (Astro)

The single `[lang]/[...slug].astro` route is split so Astro emits the two URL spaces without ambiguity (all paths are statically enumerated via `getStaticPaths`, so there is no runtime guessing):

- `apps/<site>/src/pages/index.astro` — default-language **home** at `/` (already RFC-0159; canonical override removed — `/` is self-canonical).
- `apps/<site>/src/pages/[...slug].astro` — default-language **pages** at `/<slug>`. `getStaticPaths` returns only default-language non-home slugs.
- `apps/<site>/src/pages/[lang]/[...slug].astro` — **non-default** languages only. `getStaticPaths` excludes the default language.

All three are generator-owned (RFC-0081) and produced by `routes.generate` in `@gogol/site-kernel-codegen`.

### Registry helpers (split static paths)

- `getStaticPathsForDefaultLang()` → `[{ params: { slug } }]` for default-language non-home pages.
- `getStaticPathsForPrefixedLangs()` → existing behavior, but with the default language excluded.
- `resolvePageIdFromPath(lang, slug)` is unchanged (still keyed by lang+slug); the default route file passes `lang = defaultLanguage`.

### Canonicalization & SEO

- Default-language pages are **self-canonical** (`/`, `/<slug>`).
- `getAlternateLinks` emits `hreflang` per language via `localizeUrl` (de → `/`, `/datenschutz`; en → `/en/`, `/en/privacy`) plus `x-default` → the default-language URL.
- `buildSitemapClusters` / `buildClustersFromSystemMd` emit unprefixed URLs for the default language. Because both the generator and `sitemap.validate` read the same builder, hreflang symmetry stays intact.
- **RFC-0159 amendment:** the root `index.astro` drops `canonicalUrl={…/de/}`. `/` is now canonical. The shared layout `canonicalUrl` override prop remains (still used by other callers / future needs) but the root no longer sets it.

### Middleware

- `createLanguageRedirectMiddleware` becomes a pass-through: unprefixed paths resolve to **default-language content** and MUST NOT be rewritten to `/<defaultLang>/…`. All routing is statically enumerated by the route registry. Non-default detection applies only at `/` (client soft-redirect from RFC-0159).
- **No legacy redirects.** Since the `/<defaultLang>/` tree never existed for these sites, no 301/`_redirects`/Worker rule is generated.

## Architectural fit

- **RFC-0048** (route registry): amended — adds the unprefixed-default URL policy via `localizeUrl`; authoring shape is unchanged.
- **RFC-0159** (root serves default home): amended — `/` becomes the true canonical; the root canonical override to `/<defaultLang>/` is removed; the soft non-default redirect is retained.
- **RFC-0049** (sitemap/hreflang): default-language URLs become unprefixed in clusters and alternates; symmetry preserved because one builder feeds both generate and validate.
- **RFC-0097** (locale-scoped pages): unchanged — `locales[]` opt-in still gates per-language emission; default-language pages simply project to unprefixed URLs.
- **RFC-0055** (i18n middleware generation): the generated middleware factory reflects the new unprefixed-default policy.
- **RFC-0081** (generated-file governance): all three route files + middleware are generator-owned and carry the GENERATED marker.

## Design

### CLI surface

A new validator guards the topology:

```bash
pnpm exec site-kernel run route.topology.validate --app webgogol-com --json
pnpm exec site-kernel run route.topology.validate --all --json
```

It asserts:

- **RT-01** No default-language page slug equals a supported language code (would shadow the `/<lang>/` tree).
- **RT-02** The default-language route files (`index.astro`, `[...slug].astro`) exist and resolve via `resolvePageRoute`; `[lang]/[...slug].astro` excludes the default language in `getStaticPaths`.
- **RT-03** No emitted default-language URL begins with `/<defaultLang>/`.

### TypeScript contracts

```ts
// @gogol/share — single URL policy seam
export function localizeUrl(
  lang: LanguageCode,
  slug: string,
  opts: { defaultLanguage: LanguageCode },
): string;

export async function getStaticPathsForDefaultLang(): Promise<
  Array<{ params: { slug: string } }>
>;
export async function getStaticPathsForPrefixedLangs(): Promise<
  Array<{ params: { lang: string; slug?: string } }>
>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/astro/routes.ts` | Adds `localizeUrl` + split static-paths; all URL building routed through `localizeUrl` |
| `packages/share/src/middleware/language-redirect.ts` | Unprefixed = default content; no rewrite to `/<defaultLang>/` |
| `apps/<site>/src/pages/index.astro` | Default home at `/`, self-canonical (RFC-0159 override removed) |
| `apps/<site>/src/pages/[...slug].astro` | Default-language pages at `/<slug>` (generated) |
| `apps/<site>/src/pages/[lang]/[...slug].astro` | Non-default languages only (generated) |
| `packages/os/site-kernel-codegen/src/templates/**` | Owning templates for the three route files + middleware |
| `packages/os/site-kernel-checks/src/sitemap.ts` | Unprefixed default URLs in clusters |
| `packages/os/site-kernel-checks/src/route-topology.ts` | New `route.topology.validate` |
| `packages/os/site-kernel-checks/src/root-canonical.ts` | RC-03 inverted: root MUST be self-canonical (no override) |

### Failure modes

`route.topology.validate` exits non-zero on violations; `--json` prints the structured report. Fail-hard for new apps; integrated into `build.check` warn-first for one cycle, then fail-hard once both apps are migrated.

## Rollout

1. Add `localizeUrl` + split static-path helpers in `@gogol/share`; route every URL builder through it.
2. Update the route-file templates + middleware template + add the redirects generator in `@gogol/site-kernel-codegen`; regenerate both apps.
3. Update `sitemap.ts` default-URL projection; regenerate sitemaps.
4. Remove the RFC-0159 root canonical override from `index.astro`; invert `root.canonical.validate` RC-03 to forbid the override.
5. Add `route.topology.validate`; wire into `build.check` (warn-first → fail-hard).

## Alternatives considered

- **Single optional `[...path].astro` parsing lang from the first segment.** Rejected: more runtime logic, harder to statically validate, easy to shadow language codes.
- **Keep `/de/` and only alias `/` (RFC-0159 Option B).** Rejected by product — leaves the default audience on prefixed URLs and a `/de/` duplicate.
- **Drop prefixes for all languages (slug-only).** Rejected: collides across languages and breaks hreflang clustering.

## Risks

- **Slug/language-code collision** (`/en` page slug vs `/en/` tree) — mitigated by `route.topology.validate` RT-01.
- **Route ambiguity in Astro** — mitigated by fully static `getStaticPaths` enumeration in three explicit route files.
- **Generator drift** if app route files are edited directly — mitigated by the GENERATED marker + governance.

## Acceptance criteria

- [x] `localizeUrl` is the single URL-policy seam; all inline ternaries removed (evidence: implemented historically)
- [x] Default home at `/`, default pages at `/<slug>`, non-default under `/<lang>/` (evidence: implemented historically)
- [x] Root `index.astro` is self-canonical (RFC-0159 override removed) (evidence: implemented historically)
- [x] `getAlternateLinks` / sitemap emit unprefixed default URLs + `x-default` (evidence: implemented historically)
- [x] Middleware no longer rewrites unprefixed paths to `/<defaultLang>/` (evidence: implemented historically)
- [x] No legacy 301 layer is generated (brand-new sites) (evidence: implemented historically)
- [x] `route.topology.validate` registered (scope: app) with stable `--json` (evidence: implemented historically)
- [x] Integrated into `build.check` (warn-first, then fail-hard) (evidence: implemented historically)
- [x] `sitemap.validate` + `seo.technical.validate` pass with the new topology (evidence: implemented historically)
- [x] `AGENTS.md` updated for the unprefixed-default contract (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST route all URL construction through `localizeUrl` — no new inline `/<lang>/<slug>` ternaries.
- Agents MUST change generated route files via the owning templates in `@gogol/site-kernel-codegen`, never by editing `apps/*` directly.
- Agents MUST keep RFC-0048 authoring shape (`routes[lang]`), RFC-0097 locale opt-in, and storage/cookie policy intact.
- Agents MUST reference RFC-0160 in commit messages when implementing.
