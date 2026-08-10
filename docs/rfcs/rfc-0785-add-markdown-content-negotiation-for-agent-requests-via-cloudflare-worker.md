---
id: RFC-0785
title: "Add markdown content negotiation for agent requests via Astro middleware"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: app
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0166
  - RFC-0315
  - RFC-0149
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
# DNA-34 was reclassified to feature (RFC-0161) and is no longer binding.
# DNA-57 (dev/prod egress parity) — the middleware runs in both astro dev and
# production, ensuring content negotiation works identically in dev preview.
satisfies:
  - DNA-57
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - agent.markdown-negotiation.generate
  added: []
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - curl -H "Accept: text/markdown" https://warpgogol.com/about/ returns .md twin with Content-Type text/markdown
  - isitagentready.com reports markdown content negotiation supported for warpgogol.com
nonGoals:
  - Generating markdown twins — already implemented by page.markdown.generate (RFC-0166)
  - Serving .md files with correct Content-Type — already handled by _headers (RFC-0315)
  - API Catalog, MCP Server Card — covered by RFC-0783
  - Link headers, Content-Signal — covered by RFC-0784
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0785: Add markdown content negotiation for agent requests via Astro middleware

## Context

RFC-0166 established build-time markdown twins — `page.markdown.generate` writes a `.md` twin for every full/summary page (e.g. `dist/about/index.md`). RFC-0315 added `Content-Type: text/markdown; charset=utf-8` to the `_headers` template for `/*.md` files. Agents can already fetch markdown twins directly by appending `.md` to any page URL.

However, the [isitagentready.com](https://isitagentready.com/warpgogol.com) audit checks for **HTTP content negotiation**: when an agent sends `Accept: text/markdown` for a page URL (e.g. `GET /about/` with `Accept: text/markdown`), the server should respond with the `.md` twin instead of the HTML page. This is standard HTTP content negotiation per RFC 7231.

RFC-0149 unified deployment on Cloudflare Workers via the Astro Cloudflare adapter and retired Pages Functions entirely. The workspace now uses Astro on-demand routes and middleware for all request-time logic. Content negotiation belongs in the existing Astro middleware chain, not in a retired `functions/` directory.

## Problem

Agents that use HTTP content negotiation (sending `Accept: text/markdown` to request markdown instead of HTML) get the HTML response because the static hosting layer ignores the `Accept` header. The markdown twins exist on disk but are only accessible if the agent knows to append `.md` to the URL.

Without request-time content negotiation, agents must rely on out-of-band knowledge (from `agent.json` or `llms.txt`) to discover the `.md` twin pattern, rather than using standard HTTP negotiation. RFC-0149 established Astro middleware as the request-time compute layer — content negotiation belongs there.

## Decision

The kernel gains a new `agent.markdown-negotiation.generate` command that scaffolds an Astro middleware module (`src/middleware/markdown-negotiation.ts`) implementing Accept-header-based content negotiation. The middleware intercepts GET requests, checks if the `Accept` header includes `text/markdown`, and if a corresponding `.md` twin exists for the requested path, serves it with `Content-Type: text/markdown; charset=utf-8` and a `Vary: Accept` response header. Otherwise, it calls `next()` to serve the static HTML. The middleware is chained into the existing middleware sequence in `src/middleware/index.ts`.

## Architectural fit

- **RFC-0149** (Cloudflare Workers via Astro adapter) — this RFC uses Astro middleware, the request-time compute layer established by RFC-0149. No `functions/` directory is created; the middleware is chained into the existing `src/middleware/index.ts` sequence alongside `tombstoneMiddleware` and `languageRedirectMiddleware`.
- **RFC-0166** (markdown twins) — this RFC depends on the twins already being generated by `page.markdown.generate`. The middleware only serves existing static files; it does not generate content. Twin path resolution follows RFC-0166's output layout: `/about/` → `/about/index.md`.
- **RFC-0315** (HTTP headers) — the `_headers` template already serves `.md` files with `Content-Type: text/markdown`. The middleware reuses this content type for negotiated responses.
- **DNA-57** (dev/prod egress parity) — the middleware runs in both `astro dev` and production, ensuring content negotiation works identically in dev preview and deployed sites.
- **Site OS operator model** — the generator is `scope: app`, `supportsAllSites: true`. It scaffolds a middleware file in the app's `src/middleware/` directory and chains it into the existing middleware sequence.

## Design

### CLI surface

```sh
pnpm exec werkstatt run agent.markdown-negotiation.generate --site warpgogol-com
```

`scope: app`, `supportsAllSites: true`. No custom flags. The command writes a middleware file and amends the middleware index to chain it. It is idempotent — regenerating overwrites with identical content.

The command runs in `build.prepare` after `page.markdown.generate` (twins must exist on disk before the middleware can serve them).

### TypeScript contracts

```ts
// Astro middleware — src/middleware/markdown-negotiation.ts
// Generated by agent.markdown-negotiation.generate

import { defineMiddleware } from "astro:middleware";
import { markdownTwinUrlPath } from "@warpgogol/werkstatt-site/share/semantic";

const SUPPORTED_LANGS = ["de", "en", "uk"]; // baked from manifest i18n

/**
 * Content negotiation logic:
 * 1. Only intercept GET requests
 * 2. Check Accept header for text/markdown
 * 3. Filter non-page routes (API, .well-known, static assets)
 * 4. Map request path to .md twin path via canonical markdownTwinUrlPath (RFC-0166 layout: /about/ → /about.md)
 * 5. If twin exists in static assets, fetch it and return with Content-Type: text/markdown
 * 6. Otherwise, call next() to serve the static HTML
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  if (request.method !== "GET") return next();
  const accept = request.headers.get("Accept") ?? "";
  if (!accept.includes("text/markdown")) return next();
  const url = new URL(request.url);
  if (!isPageRoute(url.pathname)) return next();
  const twinPath = markdownTwinUrlPath(url.pathname, { supportedLangs: SUPPORTED_LANGS });
  const twinUrl = new URL(twinPath, url.origin);
  const twinResponse = await fetch(twinUrl);
  if (!twinResponse.ok) return next();
  const body = await twinResponse.text();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "Cache-Control": "public, max-age=300",
    },
  });
});

/**
 * Map a page URL pathname to its .md twin path.
 * RFC-0166 generates twins as index.md inside route directories:
 *   /about/  → /about/index.md
 *   /        → /index.md
 *   /de/preise/ → /de/preise/index.md
 */
function resolveMarkdownTwinPath(pathname: string): string | null {
  // Skip API routes, .well-known, and static assets
  if (pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/.well-known/")) return null;
  if (/\.(ico|png|jpg|jpeg|svg|css|js|json|txt|xml|woff|woff2|ttf|otf|webmanifest)$/.test(pathname))
    return null;

  const trimmed = pathname.replace(/\/$/, "");
  if (trimmed === "") return "/index.md";
  return `${trimmed}/index.md`;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/src/middleware/markdown-negotiation.ts` | Written by `agent.markdown-negotiation.generate` — Astro middleware |
| `<app>/src/middleware/index.ts` | Amended — chains `markdownNegotiationMiddleware` into the existing `sequence()` call |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/markdown-negotiation.template.ts` | New template — the middleware source |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/index.template.ts` | Amended template — chains the new middleware |
| `packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.ts` | New module — generate handler |
| `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` | Amended — new command entry |
| `<app>/dist/**/index.md` | Read implicitly — the middleware fetches these at runtime via same-origin fetch |

### Output format

**`agent.markdown-negotiation.generate --json`**:

```json
{
  "command": "agent.markdown-negotiation.generate",
  "status": "pass",
  "site": "warpgogol-com",
  "filesWritten": ["src/middleware/markdown-negotiation.ts"],
  "filesAmended": ["src/middleware/index.ts"]
}
```

When `agent.enabled: false`:

```json
{
  "command": "agent.markdown-negotiation.generate",
  "status": "skip",
  "site": "warpgogol-com",
  "filesRemoved": ["src/middleware/markdown-negotiation.ts"]
}
```

**Middleware behavior**:

```http
# Agent request:
GET /about/ HTTP/2
Accept: text/markdown

# Server response:
HTTP/2 200
Content-Type: text/markdown; charset=utf-8
Vary: Accept
Cache-Control: public, max-age=300

---
canonical: "https://warpgogol.com/about/"
language: "de"
...
---

# About Warpgogol
...
```

**Pass-through** (no markdown twin or no `Accept: text/markdown`):

```http
# Normal browser request:
GET /about/ HTTP/2
Accept: text/html

# Server response: static HTML (unchanged)
```

### Failure modes

- **No markdown twin exists**: The middleware calls `next()` and the static HTML is served. This is correct behavior — not all pages have twins (e.g. pages with `llms.depth: "off"`).
- **Middleware fetch errors**: If the `fetch()` for the `.md` twin fails (network error, 404), the middleware falls through to `next()`. The user never sees an error page from the negotiation logic.
- **`agent.enabled: false`**: The generator writes a no-op pass-through middleware (so the root `middleware.ts` import always resolves) — same skip pattern as other agent surface generators, adapted for statically-imported middleware.
- **`Vary: Accept` header**: Always set on negotiated responses to prevent cache poisoning (a cached markdown response being served to a browser requesting HTML).
- **Non-page routes**: `resolveMarkdownTwinPath` returns `null` for `/api/*`, `/.well-known/*`, and static asset extensions, so the middleware passes through to `next()`.

## Rollout

- **Pipeline integration**: `agent.markdown-negotiation.generate` runs in `build.prepare` after `page.markdown.generate`.
- **Existing apps**: All apps with `agent.enabled !== false` get the middleware on their next `build.prepare` run. The middleware is additive — it only intercepts requests with `Accept: text/markdown`, all other requests pass through unchanged.
- **New apps**: Onboarding scaffold runs `page.markdown.generate` and `agent.markdown-negotiation.generate` in the same pipeline step.
- **`agent.enabled: false` apps**: Generator writes a no-op pass-through middleware so the root `middleware.ts` import always resolves (adapted skip pattern for statically-imported middleware).
- **Dev mode**: The middleware runs in `astro dev`, so content negotiation can be tested locally with `curl -H "Accept: text/markdown" http://localhost:4321/about/`.
- **CDN caching**: The `Vary: Accept` response header ensures the Cloudflare CDN caches separate responses for `Accept: text/markdown` and `Accept: text/html` requests. The `Cache-Control: public, max-age=300` header allows short-term CDN caching of negotiated markdown responses.

## Alternatives considered

1. **`_headers` redirect rules** — use Cloudflare Pages `_redirects` to redirect `Accept: text/markdown` requests to the `.md` file. Rejected: `_redirects` does not support `Accept` header matching; it only matches path patterns.

2. **Cloudflare Pages Function (`functions/[[path]].ts`)** — deploy a Pages Function that intercepts requests. Rejected: RFC-0149 explicitly retired Pages Functions and deleted all `functions/` directories. Reintroducing `functions/` would regress to the pre-RFC-0149 model and conflict with the established Astro middleware pattern.

3. **No content negotiation — agents discover `.md` twins via `agent.json`** — the `agent.json` manifest already declares `interfaces.twins.pattern: /**.md`. Rejected: while true, isitagentready.com specifically checks for Accept-header negotiation. Supporting both paths (direct `.md` fetch + content negotiation) maximizes agent compatibility.

4. **Astro on-demand route (`src/pages/[...path].ts` with `prerender = false`)** — a catch-all API route that performs content negotiation. Rejected: a catch-all route would intercept all requests, not just markdown-negotiation requests, adding unnecessary overhead to every page load. Middleware is more selective — it only acts when `Accept: text/markdown` is present, otherwise it passes through with zero overhead.

## Risks

- **Performance**: The middleware runs on every GET request. If the `Accept` header check is fast (string includes), the overhead is minimal — one header check before pass-through. The middleware does not run for non-GET requests.
- **Same-origin fetch**: The middleware fetches the `.md` twin via `fetch(twinUrl)` on the same origin. Unlike the pre-RFC-0166 runtime worker approach, this fetches a static asset (not a rendered page), so there is no recursion risk. The Astro Cloudflare adapter serves static assets from the `ASSETS` binding, and the middleware's `fetch()` resolves through the same binding.
- **Cache poisoning**: If a page response is cached without `Vary: Accept`, the CDN serves cached HTML for `Accept: text/markdown` requests, bypassing negotiation entirely. Mitigation: `Vary: Accept` is set on **all** page responses (both HTML pass-through and negotiated markdown), ensuring the CDN uses `Accept` as part of the cache key. The Cloudflare CDN respects `Vary: Accept` for cache key variation.
- **Twin path resolution**: The middleware uses the canonical `markdownTwinUrlPath` from `@warpgogol/werkstatt-site/share/semantic` (same function used by `page.markdown.generate`), ensuring path alignment between twin generation and twin resolution. Language roots (`/de/` → `/de/index.md`) are handled via `SUPPORTED_LANGS` baked into the generated middleware. Non-page routes (`/api/*`, `/.well-known/*`, static assets) are filtered by `isPageRoute()` before path resolution. Unit tests verify path resolution for the RFC-0785 negotiation context.
- **Maintenance burden**: One new generator + one template file + one middleware index amendment. The middleware itself is ~30 lines of TypeScript.

## Acceptance criteria

- [x] `agent.markdown-negotiation.generate` registered in command table `29-agent-surface.ts` (evidence: packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts:189-200)
- [x] Middleware template created in `packages/werkstatt-site/src/codegen/templates/service/src/middleware/markdown-negotiation.ts.template` (evidence: template file exists, follows `language-redirect.ts.template` pattern)
- [x] Middleware index template amended to chain `markdownNegotiationMiddleware` (evidence: packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts:25,37-38)
- [x] `agent.markdown-negotiation.generate` integrated into `build.prepare` pipeline after `page.markdown.generate` (evidence: packages/werkstatt-site/src/checks/pipelines/build-prepare.ts:112-113,215-216)
- [x] `agent.enabled: false` skip pattern works — no-op pass-through middleware written so root import always resolves (evidence: packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.ts:64-76)
- [ ] `curl -H "Accept: text/markdown" https://warpgogol.com/about/` returns `.md` twin with `Content-Type: text/markdown; charset=utf-8` (requires deploy)
- [ ] `curl -H "Accept: text/html" https://warpgogol.com/about/` returns HTML (unchanged behavior) (requires deploy)
- [ ] `Vary: Accept` header present on negotiated markdown responses (requires deploy)
- [ ] `isitagentready.com` reports markdown content negotiation supported for warpgogol.com after deploy
- [x] Unit tests for `markdownTwinUrlPath` covering: root path, i18n paths, language roots, trailing slash, nested paths (evidence: packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.test.ts, 8 tests pass; canonical function also tested in domain/share/tests/twin-path.test.ts)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0785` exits 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0785` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0785 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The middleware MUST always set `Vary: Accept` on negotiated responses to prevent cache poisoning.
- The `resolveMarkdownTwinPath` function MUST handle: root path (`/` → `/index.md`), i18n paths (`/de/preise/` → `/de/preise/index.md`), trailing slash normalization, and skip non-page routes (`/api/*`, `/.well-known/*`, static assets).
- The generator MUST be idempotent — regenerating produces byte-identical output (DNA-58).
- The middleware MUST be chained into the existing `src/middleware/index.ts` sequence, not deployed as a standalone Pages Function. RFC-0149 retired Pages Functions; do not reintroduce `functions/`.
