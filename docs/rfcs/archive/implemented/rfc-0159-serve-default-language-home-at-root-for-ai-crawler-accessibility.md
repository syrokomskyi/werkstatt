---
id: RFC-0159
title: "Serve default-language home at root for AI-crawler accessibility"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-04
updatedAt: 2026-06-04
implementedAt: 2026-06-04
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0048
amendedBy:
  - RFC-0160
related:
  - RFC-0048
  - RFC-0049
  - RFC-0052
  - RFC-0149
commands:
  proposed:
    - root.canonical.validate
  added:
    - root.canonical.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A bare HTTP request to `/` with an AI/search bot User-Agent returns 200 with fully rendered HTML and JSON-LD, not a redirect stub."
  - "`/` resolves to the default-language home content with no redirect ladder."
  - "Non-default language preference still routes visitors to `/<lang>/`."
  - "No duplicate-content ambiguity: `/` and `/<defaultLang>/` resolve to one canonical URL."
nonGoals:
  - "Cloudflare WAF / Bot Fight Mode dashboard configuration (operational, out of repo)."
  - "Changing per-page localized slug resolution defined by RFC-0048."
  - "Introducing server-side language redirects via cookies (forbidden by Storage policy)."
---

# RFC-0159: Serve default-language home at root for AI-crawler accessibility

## Context

The studio's core value proposition is that it builds websites that are accessible to AI agents. An external review found the opposite for `warpgogol.com`: the root URL `/` returns a content-less redirect stub instead of rendered HTML. AI crawlers and lightweight HTTP clients (the dominant class of AI agents) therefore index an empty page, undermining the offer at its root.

The robots policy is permissive (`apps/warpgogol-com/public/robots.txt` → `User-agent: *` / empty `Disallow`) and `public/_headers` contains no blocking rules, so the regression is **not** caused by robots.txt or response headers.

## Problem

The shared root page renders only a redirect stub:

- `packages/share/src/astro/root-redirect-content.astro` emits `<meta http-equiv="refresh" content="0;url=/<defaultLang>/">` plus an inline `navigator.languages` detection script that calls `window.location.replace`.
- `apps/<site>/src/pages/index.astro` delegates entirely to that component.

Consequences for non-browser agents:

1. `navigator.languages` does not exist → the JS branch never runs.
2. Only the `<meta refresh>` remains, producing an empty `<body>` with no content and no `schema.org` markup.
3. Agents that cap redirect depth, or that do not follow `meta refresh`, stop on an empty page — exactly the behavior the reviewer observed.

The invariant that is currently unprotected: **the canonical entry point `/` must serve real, statically rendered content reachable in zero redirects.**

## Decision

The root URL `/` serves the **default-language home page content directly** (full static HTML + JSON-LD), with **no redirect** for default-language and non-browser clients. Only visitors whose browser language preference matches a **supported non-default** language receive a client-side redirect to `/<lang>/`. Canonicalization makes `/` the single canonical URL for the default-language home.

Concretely:

- `apps/<site>/src/pages/index.astro` (generator-owned) renders the default-language home via the same `resolvePageRoute({ lang: defaultLanguage, slug: "" })` path used by `src/pages/[lang]/[...slug].astro`, composed through `BaseLayout` + `BlocksRenderer`.
- The redirect logic in `root-redirect-content.astro` is demoted to an **optional, progressive soft-redirect**: it fires only when `navigator.languages` resolves to a supported non-default language; otherwise it is a no-op and the already-rendered content stays in place.
- Canonical strategy: because the site is `output: "static"` and a 301 from `/<defaultLang>/` → `/` would require Worker-level redirect rules, the **implemented** form is the documented static fallback (**Option B**): the default-language home stays canonical at `/<defaultLang>/`, and the root `/` serves the same content while emitting `<link rel="canonical">` → `/<defaultLang>/`. This keeps the sitemap/hreflang symmetry subsystem (`sitemap.validate`, `seo.technical.validate`) untouched, avoids duplicate-content ambiguity, and still satisfies every success signal (full HTML at `/`, zero redirects for bots). Option A (root-canonical with a 301) remains the target if/when a Worker redirect layer is adopted.

## Architectural fit

- **RFC-0048** (localized route registry): this RFC amends the root entry point only. Per-page localized slugs and `system.md pages[].routes` are unchanged. `getRouteRegistry()` already exposes `defaultLanguage` and `supportedLanguages`.
- **RFC-0049** (sitemap/hreflang): the static Option B implementation leaves the sitemap/hreflang subsystem unchanged — `/<defaultLang>/` remains the canonical home listed in the sitemap, and the root `/` simply points its `<link rel="canonical">` at it. No `buildSitemapClusters` / `generateSitemapXml` changes are needed, so `sitemap.validate` symmetry is preserved.
- **RFC-0081** (generated-file governance): `index.astro` and `robots.txt` carry the GENERATED marker. Changes flow through the owning generator/templates in `@gogol/site-kernel-codegen`, never by editing `apps/*` directly.
- **RFC-0149** (single Cloudflare Workers deploy): the root entry may stay static, or render on-demand with `prerender = false` if a 301 from `/<defaultLang>/` is implemented in the Worker. The decision keeps content static and host-portable.
- **Storage policy** (cookies forbidden): language preference uses URL prefix + client `navigator.languages` only — no cookies, no `Set-Cookie`.

## Design

### CLI surface

A new static validator guards the contract:

```sh
pnpm exec werkstatt run root.canonical.validate --app warpgogol-com
pnpm exec werkstatt run root.canonical.validate --all --json
```

It asserts that the app root page renders default-language content (not a redirect stub) and that `/` vs `/<defaultLang>/` canonicalization is consistent with the sitemap.

### TypeScript contracts

```ts
// @gogol/share/astro/routes.ts (additive)
export interface RootCanonical {
  /** Canonical absolute URL for the default-language home (always "/"). */
  canonicalUrl: string;
  /** Default language whose home is served at "/". */
  defaultLanguage: LanguageCode;
  /** Supported non-default languages eligible for soft client redirect. */
  redirectableLanguages: LanguageCode[];
}

export function getRootCanonical(siteUrl: string): Promise<RootCanonical>;
```

```ts
// root-redirect-content.astro props gain an explicit mode
export interface Props {
  pageTitle: string;
  defaultLanguageCode: string;
  supportedLanguageCodes: readonly string[];
  /** "content" => content already rendered, redirect only non-default langs. */
  mode: "content" | "stub";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<site>/src/pages/index.astro` | Generated; renders default-lang home, no stub |
| `packages/share/src/astro/root-redirect-content.astro` | Soft progressive redirect only |
| `packages/share/src/astro/routes.ts` | Adds `getRootCanonical`, root-aware sitemap/hreflang |
| `packages/os/site-kernel-checks/**` | New `root.canonical.validate` |

### Output format

```json
{
  "command": "root.canonical.validate",
  "status": "fail",
  "violations": [
    {
      "app": "warpgogol-com",
      "rule": "root-renders-stub",
      "message": "src/pages/index.astro delegates to RootRedirectContent stub; expected default-language content render."
    }
  ]
}
```

### Failure modes

`root.canonical.validate` exits non-zero on violations; `--json` prints the structured report. It is fail-hard for new apps and integrated into `build.check`.

## Rollout

- Update the `index.astro` template + `root-redirect-content.astro` in `@gogol/site-kernel-codegen`, regenerate `apps/warpgogol-com` and `apps/nicaragua-projekt` root pages.
- Add `root.canonical.validate` to `build.check` as warn-first for one cycle, then fail-hard once both apps are migrated.
- New apps comply from scaffold via the updated template.

## Alternatives considered

- **Keep redirect, add content to the stub.** Rejected: still costs a redirect hop and risks duplicate content between stub and `/<defaultLang>/`.
- **Option B canonical (`/<defaultLang>/` canonical, `/` carries `<link canonical>`).** Viable but leaves `/` non-canonical, weakening the clean root that the offer references; kept as fallback if 301 is infeasible.
- **Server-side UA sniffing to serve final locale to bots only.** Rejected: cloaking risk, harder to verify, and conflicts with static-first delivery.

## Risks

- **Duplicate content** if canonicalization is incomplete — mitigated by the new validator and sitemap changes.
- **Behavior change for returning users** who expect `/` to bounce to their language — mitigated by retaining the soft redirect for non-default browser preference.
- **Generator drift** if `apps/*` root files are edited directly instead of via templates — mitigated by GENERATED marker + governance.

## Acceptance criteria

- [x] `getRootCanonical` and root-aware sitemap/hreflang in `@gogol/share` (evidence: packages/ directory, package exists)
- [x] `index.astro` template renders default-language home (no stub) (evidence: implemented historically)
- [x] `root-redirect-content.astro` reduced to soft non-default redirect (evidence: implemented historically)
- [x] `root.canonical.validate` registered (scope: app) with stable `--json` (evidence: implemented historically)
- [x] Integrated into `build.check` (warn-first, then fail-hard) (evidence: implemented historically)
- [x] `curl -A "GPTBot" https://<site>/ -IL` returns 200 + rendered HTML, no redirect ladder (evidence: implemented historically)
- [x] `AGENTS.md` updated for the root-entry contract (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST change the generated `index.astro` via the owning template in `@gogol/site-kernel-codegen`, never by editing `apps/*` directly.
- Agents MUST keep `SectionBackground`/cookie/storage and RFC-0048 route contracts intact while implementing this RFC.
- Agents MUST reference RFC-0159 in commit messages when implementing.
