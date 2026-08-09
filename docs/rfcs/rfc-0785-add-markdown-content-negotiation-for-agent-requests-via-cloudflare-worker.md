---
id: RFC-0785
title: "Add markdown content negotiation for agent requests via Cloudflare Worker"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-34
  - RFC-0166
  - RFC-0315
  - RFC-0149
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-34
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
appsImpacted: []
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

# RFC-0785: Add markdown content negotiation for agent requests via Cloudflare Worker

## Context

RFC-0166 established build-time markdown twins — `page.markdown.generate` writes a `.md` twin for every full/summary page in `public/`. RFC-0315 added `Content-Type: text/markdown; charset=utf-8` to the `_headers` template for `/*.md` files. Agents can already fetch markdown twins directly by appending `.md` to any page URL.

However, the [isitagentready.com](https://isitagentready.com/warpgogol.com) audit checks for **HTTP content negotiation**: when an agent sends `Accept: text/markdown` for a page URL (e.g. `GET /about/` with `Accept: text/markdown`), the server should respond with the `.md` twin instead of the HTML page. This is standard HTTP content negotiation per RFC 7231.

Cloudflare Pages is a static hosting platform — it serves files as-is and cannot inspect the `Accept` header to choose between `/about/index.html` and `/about/index.md`. Content negotiation requires a compute layer (Pages Function or Worker).

## Problem

Agents that use HTTP content negotiation (sending `Accept: text/markdown` to request markdown instead of HTML) get the HTML response because Cloudflare Pages static hosting ignores the `Accept` header. The markdown twins exist on disk but are only accessible if the agent knows to append `.md` to the URL.

There is no Cloudflare Pages Function or Worker in the deployment that intercepts requests and performs content negotiation. Without it, agents must rely on out-of-band knowledge (from `agent.json` or `llms.txt`) to discover the `.md` twin pattern, rather than using standard HTTP negotiation.

## Decision

The kernel gains a new `agent.markdown-negotiation.generate` command that scaffolds a Cloudflare Pages Function (`functions/[[path]].ts`) implementing Accept-header-based content negotiation. The Pages Function intercepts GET requests, checks if the `Accept` header includes `text/markdown`, and if a corresponding `.md` twin exists for the requested path, serves it with `Content-Type: text/markdown; charset=utf-8` and a `Vary: Accept` response header. Otherwise, it passes through to the static asset.

## Architectural fit

- **DNA-34** (`.well-known/` discovery) — content negotiation is the HTTP-level complement to `.well-known/` discovery; agents can use either path to find markdown content.
- **RFC-0166** (markdown twins) — this RFC depends on the twins already being generated by `page.markdown.generate`. The Pages Function only redirects; it does not generate content.
- **RFC-0315** (HTTP headers) — the `_headers` template already serves `.md` files with `Content-Type: text/markdown`. The Pages Function reuses this content type for negotiated responses.
- **RFC-0149** (Cloudflare Workers via Astro adapter) — if the site already uses the Astro Cloudflare adapter, the negotiation logic could be an Astro middleware instead of a standalone Pages Function. This is an implementation decision.
- **Site OS operator model** — the generator is `scope: app`, `supportsAllSites: true`. It scaffolds a file in the app's `functions/` directory (Cloudflare Pages Functions convention).

## Design

### CLI surface

```sh
pnpm exec werkstatt run agent.markdown-negotiation.generate --site warpgogol-com
```

`scope: app`, `supportsAllSites: true`. No custom flags. The command writes a Pages Function file and is idempotent — regenerating overwrites with identical content.

The command runs in `build.prepare` after `page.markdown.generate` (twins must exist on disk before the function can serve them).

### TypeScript contracts

```ts
// Cloudflare Pages Function — functions/[[path]].ts
// Generated by agent.markdown-negotiation.generate

interface PagesFunctionContext {
  request: Request;
  env: Record<string, unknown>;
  params: { path?: string };
  next: () => Promise<Response>;
}

/**
 * Content negotiation logic:
 * 1. Only intercept GET requests
 * 2. Check Accept header for text/markdown
 * 3. Map request path to .md twin path
 * 4. If twin exists in static assets, fetch it and return with Content-Type: text/markdown
 * 5. Otherwise, call next() to serve the static HTML
 */
async function handleMarkdownNegotiation(
  context: PagesFunctionContext,
): Promise<Response> {
  const { request, next } = context;
  if (request.method !== "GET") return next();
  const accept = request.headers.get("Accept") ?? "";
  if (!accept.includes("text/markdown")) return next();
  const url = new URL(request.url);
  const twinPath = resolveMarkdownTwinPath(url.pathname);
  if (!twinPath) return next();
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
}

/** Map a page URL pathname to its .md twin path. */
function resolveMarkdownTwinPath(pathname: string): string | null {
  const trimmed = pathname.replace(/\/$/, "");
  if (trimmed === "") return "/index.md";
  return `${trimmed}.md`;
}

export const onRequest = handleMarkdownNegotiation;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `functions/[[path]].ts` | Written by `agent.markdown-negotiation.generate` — Cloudflare Pages Function |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/functions/markdown-negotiation.template.ts` | New template — the Pages Function source |
| `packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.ts` | New module — generate handler |
| `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` | Amended — new command entry |
| `public/**/*.md` | Read implicitly — the Pages Function fetches these at runtime |

### Output format

**Pages Function behavior**:

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

- **No markdown twin exists**: The Pages Function calls `next()` and the static HTML is served. This is correct behavior — not all pages have twins (e.g. pages with `llms.depth: "off"`).
- **Pages Function errors**: If the `fetch()` for the `.md` twin fails (network error, 404), the function falls through to `next()`. The user never sees an error page from the negotiation logic.
- **`agent.enabled: false`**: The generator skips writing the Pages Function and removes any stale one, same skip pattern as other agent surface generators.
- **`Vary: Accept` header**: Always set on negotiated responses to prevent cache poisoning (a cached markdown response being served to a browser requesting HTML).

## Rollout

- **Pipeline integration**: `agent.markdown-negotiation.generate` runs in `build.prepare` after `page.markdown.generate`.
- **Existing apps**: All apps with `agent.enabled !== false` get the Pages Function on their next `build.prepare` run. The function is additive — it only intercepts requests with `Accept: text/markdown`, all other requests pass through unchanged.
- **New apps**: Onboarding scaffold runs `page.markdown.generate` and `agent.markdown-negotiation.generate` in the same pipeline step.
- **`agent.enabled: false` apps**: Generator removes stale Pages Function (same skip pattern as `agent.openapi.generate`).
- **Cloudflare Pages deployment**: The `functions/` directory is automatically detected by Cloudflare Pages. No additional configuration needed.
- **Astro Cloudflare adapter**: If the site uses the Astro Cloudflare adapter (RFC-0149), the negotiation logic could be Astro middleware instead. This is an implementation decision — the generator should detect which deployment mode is active.

## Alternatives considered

1. **`_headers` redirect rules** — use Cloudflare Pages `_redirects` to redirect `Accept: text/markdown` requests to the `.md` file. Rejected: `_redirects` does not support `Accept` header matching; it only matches path patterns.

2. **Cloudflare Worker (separate from Pages)** — deploy a standalone Worker that proxies to Pages. Rejected: Pages Functions are simpler, deploy with the site, and don't require a separate Worker script and route configuration.

3. **No content negotiation — agents discover `.md` twins via `agent.json`** — the `agent.json` manifest already declares `interfaces.twins.pattern: /**.md`. Rejected: while true, isitagentready.com specifically checks for Accept-header negotiation. Supporting both paths (direct `.md` fetch + content negotiation) maximizes agent compatibility.

4. **Astro middleware instead of Pages Function** — if using the Astro Cloudflare adapter, middleware can intercept requests. This is a valid implementation alternative. The RFC leaves this as an implementation decision based on the active deployment mode.

## Risks

- **Performance**: The Pages Function runs on every GET request. If the `Accept` header check is fast (string includes), the overhead is minimal — one header check before pass-through. Cloudflare Pages Functions have ~0ms cold starts on the edge.
- **Cache poisoning**: If a markdown response is cached without `Vary: Accept`, a browser requesting HTML might get the cached markdown. Mitigation: `Vary: Accept` is always set on negotiated responses.
- **Twin path resolution**: The `resolveMarkdownTwinPath` function must handle i18n paths (`/de/preise/` → `/de/preise.md`), trailing slashes, and the root path (`/` → `/index.md`). Edge cases need test coverage.
- **Pages Function vs Astro middleware**: If the site switches deployment modes, the negotiation logic needs to move. Mitigation: the generator detects the active mode and scaffolds the appropriate file.
- **Maintenance burden**: One new generator + one template file. The Pages Function itself is ~30 lines of TypeScript.

## Acceptance criteria

- [ ] `agent.markdown-negotiation.generate` registered in command table `29-agent-surface.ts`
- [ ] Pages Function template created in `packages/werkstatt-site/src/codegen/templates/app-boilerplate/functions/markdown-negotiation.template.ts`
- [ ] `agent.markdown-negotiation.generate` integrated into `build.prepare` pipeline after `page.markdown.generate`
- [ ] `agent.enabled: false` skip pattern works (stale Pages Function removed)
- [ ] `curl -H "Accept: text/markdown" https://warpgogol.com/about/` returns `.md` twin with `Content-Type: text/markdown; charset=utf-8`
- [ ] `curl -H "Accept: text/html" https://warpgogol.com/about/` returns HTML (unchanged behavior)
- [ ] `Vary: Accept` header present on negotiated markdown responses
- [ ] `isitagentready.com` reports markdown content negotiation supported for warpgogol.com after deploy
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0785` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0785 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The Pages Function MUST always set `Vary: Accept` on negotiated responses to prevent cache poisoning.
- The `resolveMarkdownTwinPath` function MUST handle: root path (`/` → `/index.md`), i18n paths (`/de/preise/` → `/de/preise.md`), and trailing slash normalization.
- The generator MUST be idempotent — regenerating produces byte-identical output (DNA-58).
- If the site uses the Astro Cloudflare adapter (RFC-0149), the generator SHOULD detect this and scaffold Astro middleware instead of a standalone Pages Function. This is an implementation decision.
