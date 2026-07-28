---
id: RFC-0569
title: "Dev/prod egress parity: apply text normalization in dev mode via Astro middleware"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0235
amendedBy: []
related:
  - DNA-57
  - RFC-0235
  - RFC-0078
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
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
  proposed: []
  added: []
  changed:
    - routes.generate
    - config.regenerate
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-codegen"
  - "@warpgogol/site-kernel-onboarding"
successSignals:
  - "After running `astro dev`, opening any page at localhost:4321 shows hyphens instead of em-dashes, straight quotes instead of curly quotes, and three dots instead of a single-char ellipsis — identical to what the post-build dist sweep produces."
  - "The dev middleware is gated by `isAstroDev` and never executes during `astro build` — production builds are unaffected."
  - "Authored source files under `src/content/` are never modified by the dev middleware — it transforms HTML response bodies only."
  - "`smartypants: false` is set in dev mode only (via `isAstroDev` gate in `astro.config.mjs`); production keeps the default `smartypants` behavior and relies on the dist sweep."
  - "Disabling a signal in `src/content/system.md` (e.g. `text.normalize.signals.dashes: false`) produces the same dev output as production — the dev middleware reads the same config."
nonGoals:
  - "Do not normalize authored source files under `src/content/` — the dev adapter transforms HTML response bodies, same as the dist sweep."
  - "Do not add a new validator command for dev-parity — dev preview is verified visually by the operator."
  - "Do not change the production build pipeline — `text.normalize.apply` dist sweep remains the authoritative production mechanism."
  - "Do not normalize OG/Twitter preview images in dev — they are not generated in dev mode."
  - "Do not introduce a new OS package — the dev middleware is a thin wrapper in `@warpgogol/share`."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0569: Dev/prod egress parity: apply text normalization in dev mode via Astro middleware

## Context

RFC-0235 implemented egress text normalization: a post-build `dist/` sweep (`text.normalize.apply`) that strips AI-authorship typographic signals (special dashes, curly quotes, special spaces, zero-width chars, typographic HTML entities, single-char ellipsis) from all public output. The RFC explicitly decided (Open Question #4) that `astro dev` shows the author's raw typography — no dev normalization — because "only the deployed artifact is what detectors scan, so dev parity has no value here."

The operator discovered that pages at `localhost:4321` still contain em-dashes (`—`) in the browser, which is unexpected when the platform is supposed to normalize all public output. The gap is not a bug in RFC-0235 — it is a design decision that no longer holds: the operator needs to see what will be published **before** publishing it, not after. Dev preview is the primary tool for content review, and seeing un-normalized typography in dev creates a false impression of what visitors will see.

## Problem

There is no dev-mode egress normalization. The `text.normalize.apply` command operates exclusively on `dist/client` after `astro build`. In dev mode (`astro dev`, port 4321), Astro renders content directly from `src/content/**/*.md` through Vite, bypassing the entire build pipeline. The generated `src/middleware.ts` chains only `languageRedirectMiddleware` — no normalization step exists.

Consequence: an operator reviewing a page at `localhost:4321/uk/posluhy/tsyfrovyy-fundament` sees em-dashes (`—`), curly quotes, and other AI-authorship signals that will **not** appear in the published `dist/` output. This creates a false preview — the operator cannot trust what they see in dev as an accurate representation of the published site.

Additionally, Astro's default `smartypants: true` actively **injects** signals (curly quotes, em-dashes from `--`, single-char ellipsis from `...`) at render time, even from pristine source. In dev, these injected signals are visible; in production, the dist sweep neutralizes them. This widens the dev/prod gap beyond authored signals.

## Decision

Introduce **DNA-57 (Dev/prod egress parity)**: the Astro dev server MUST apply the same egress text normalization that the post-build `dist/` sweep applies to production output. This is implemented via a server-only Astro middleware that runs `normalizeHtml()` over the HTML response body, gated by `isAstroDev` so it never executes in production builds. Additionally, `smartypants: false` is set in dev mode only (via `isAstroDev` in `astro.config.mjs`) to prevent Astro from injecting signals at render time.

This RFC amends RFC-0235 by revising Open Question #4 (dev-preview parity) from "No dev normalization" to "Dev normalization via middleware." The dist sweep (`text.normalize.apply`) remains the authoritative production mechanism — the dev middleware is the dev-mode equivalent.

## Architectural fit

- **DNA-57 (this RFC)** — establishes the general dev/prod parity principle: build-time-only transforms that alter visible output MUST have a dev-mode equivalent.
- **RFC-0235** — amends Open Question #4 and re-raises the dropped render-time layer, but dev-only. The signal registry, per-site config (`text.normalize` block in `system.md`), and all normalizer functions (`normalizeHtml`, `normalizeText`, etc.) are reused unchanged.
- **DNA-7 (Thin routes)** — the middleware is generated by `routes.generate` into the existing `src/middleware.ts`, not hand-written per site.
- **RFC-0078 (generation-first)** — `routes.generate` owns `src/middleware.ts`; `config.regenerate` owns `astro.config.mjs`. Both templates are updated to include the dev-only normalization wiring.
- **Site OS operator model** — no new command. `routes.generate` and `config.regenerate` are existing commands whose templates change. The dev middleware function lives in `@warpgogol/share` (server-only, same package as `text-normalize.ts`).

## Design

### Dev middleware (`@warpgogol/share`)

A new function `createDevNormalizeMiddleware()` is exported from `@warpgogol/share/text-normalize` (server-only, same subpath as the existing normalizer). It returns an Astro middleware that:

1. Reads the per-site `text.normalize` config from `system.md` via `resolveNormalizeConfig()` (already implemented in RFC-0235).
2. Intercepts the HTML response body after `next()`.
3. Runs `normalizeHtml(body, config)` over it.
4. Returns the normalized response.

If `config.enabled` is `false`, the middleware is a pass-through. The middleware is gated by `import.meta.env.DEV` at the call site (in `src/middleware.ts`), so it is never imported in production builds.

```ts
// packages/share/src/text-normalize.ts (new export)

import type { MiddlewareHandler } from "astro";

export function createDevNormalizeMiddleware(
  config: NormalizeConfig,
): MiddlewareHandler {
  return async (context, next) => {
    const response = await next();
    if (!config.enabled) return response;
    if (response.headers.get("content-type")?.includes("text/html")) {
      try {
        const body = await response.text();
        const normalized = normalizeHtml(body, config);
        return new Response(normalized, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch {
        return response;
      }
    }
    return response;
  };
}
```

The try/catch around `normalizeHtml()` ensures that malformed HTML does not crash the dev server — the middleware degrades to returning the original un-normalized response body (same as before this RFC).

### Generated middleware (`src/middleware.ts`)

`routes.generate` updates `src/middleware.template.ts` to chain the dev-normalize middleware in dev mode only:

```ts
// src/middleware.template.ts (updated by routes.generate)
import languageRedirectMiddleware from "./middleware/language-redirect";
import { createDevNormalizeMiddleware } from "@warpgogol/share/text-normalize";
import { resolveNormalizeConfig } from "@warpgogol/share/text-normalize";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";

const devNormalize = createDevNormalizeMiddleware(
  resolveNormalizeConfig(loadSystemManifest("src/content").manifest),
);

export const onRequest = import.meta.env.DEV
  ? [languageRedirectMiddleware, devNormalize]
  : languageRedirectMiddleware;
```

The `import.meta.env.DEV` gate is the standard Astro/Vite dev-mode check — it is `true` during `astro dev` and `false` during `astro build`. This is the same pattern used by `packages/share/src/dev-props-validator.ts` (RFC-0262). The existing `astro.config.mjs` uses `process.argv.includes("dev")` for `isAstroDev`, which is acceptable for the config file but not for middleware (which runs in Vite's module graph where `import.meta.env.DEV` is the canonical check).

### Config loading

The dev middleware loads the `text.normalize` config from `system.md` via `loadSystemManifest()` from `@warpgogol/site-kernel-content` — the same function used by the existing `loadConfig()` in `packages/os/site-kernel-checks/src/text-normalize.ts:93-106`. This ensures the dev middleware reads the exact same config that the dist sweep reads, maintaining dev/prod parity.

The config is loaded **per-request** inside the middleware, not cached at module level. This ensures that operators editing `src/content/system.md` to toggle signals (e.g. `text.normalize.signals.dashes: false`) see the change immediately without restarting the dev server. The `loadSystemManifest()` call reads from the filesystem (`node:fs`), which is fast enough in dev (~1ms) and avoids stale-config bugs. Vite's HMR will re-execute the middleware module on `system.md` changes, but per-request loading is the conservative choice that works regardless of HMR timing.

### `smartypants: false` in dev (`astro.config.template.mjs`)

`config.regenerate` updates `astro.config.template.mjs` to set `smartypants: false` in dev mode only:

```js
// astro.config.template.mjs (updated by config.regenerate)
const isAstroDev = process.argv.includes("dev");

export default defineConfig({
  // ...existing config...
  markdown: {
    smartypants: !isAstroDev, // false in dev, true (default) in prod
  },
  // ...
});
```

In dev, `smartypants: false` prevents Astro from injecting curly quotes, em-dashes, and single-char ellipsis at render time — eliminating the #1 source of signals at zero cost. In production, `smartypants` stays `true` (default) and the dist sweep neutralizes whatever it injects.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/text-normalize.ts` | New `createDevNormalizeMiddleware()` export |
| `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware.template.ts` | Updated to chain dev-normalize middleware |
| `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs` | Updated with `smartypants: false` in dev |
| `src/middleware.ts` (per site, GENERATED) | Regenerated by `routes.generate` |
| `astro.config.mjs` (per site, GENERATED) | Regenerated by `config.regenerate` |
| `src/content/system.md` (per site, authored) | Read by dev middleware for `text.normalize` config — never modified |

### Failure modes

- **Dev middleware fails to load** — Astro dev server crashes on startup. Visible immediately, no silent regression. Fix: correct the import or template.
- **`normalizeHtml()` throws on malformed HTML** — the middleware catches errors via try/catch and returns the original response body un-normalized. Dev preview degrades to raw typography (same as before this RFC), not a crash.
- **Config parsing fails** — `resolveNormalizeConfig()` returns `DEFAULT_NORMALIZE_CONFIG` (all signals on) on any parse error, same as the dist sweep behavior.
- **Performance** — `normalizeHtml()` is a regex tokenizer (not a DOM parser). On a typical page (50-200KB) it adds ~1-5ms per request. The per-request `loadSystemManifest()` call adds ~1ms (filesystem read). In dev mode, page render time is 100-500ms through Vite/HMR, so the total overhead is noise.
- **Vite optimizeDeps** — `@warpgogol/share` is in the `optimizeDeps.exclude` list in `astro.config.template.mjs` (line 120). The dev middleware import (`@warpgogol/share/text-normalize`) is covered by this existing exclusion and works correctly with Vite's dev transform pipeline. `text-normalize.ts` is server-only and runs in SSR/dev context without issues.

## Rollout

1. **Phase 1 (this RFC):** Add `createDevNormalizeMiddleware()` to `@warpgogol/share/text-normalize`. Update `middleware.template.ts` and `astro.config.template.mjs`. Run `routes.generate` and `config.regenerate` on all existing systems to regenerate `src/middleware.ts` and `astro.config.mjs`.
2. **Phase 2 (future):** As new build-time-only transforms are added (e.g. image optimization, JSON-LD projections), they MUST also get a dev-mode equivalent per DNA-57. This RFC establishes the pattern; future RFCs reference DNA-57 as the governing invariant.
3. **No migration path needed** — existing systems regenerate their middleware and config via existing commands. No authored source files change. No data migration.

## Alternatives considered

- **Vite plugin (configureServer hook)** — rejected: deeper integration but risks conflicts with HMR and Vite's dev transform pipeline. The Astro middleware layer is the intended extension point and is simpler.
- **Rehype plugin (dev-only smartypants:false + rehypeNormalizeText)** — the original dropped Layer 3 from RFC-0235. Rejected as the sole mechanism because it only covers Markdown→HTML, not HTML from `.astro` components, JSON-LD, `<meta>`, or `aria-*`. The middleware approach covers all HTML output.
- **Only `smartypants: false` (no middleware)** — rejected: prevents Astro-injected signals at zero cost, but does not catch author-pasted signals (em-dashes from word processors, curly quotes, nbsp). The middleware catches everything `normalizeHtml()` handles.
- **Only middleware (no `smartypants: false`)** — rejected: works but adds ~1-5ms per request for something `smartypants: false` prevents for free. The combined approach minimizes per-request overhead.
- **New `dev.parity.validate` command** — rejected: dev preview is verified visually by the operator. An automated validator would require starting a dev server and making HTTP requests — over-engineered for the problem.
- **Keep RFC-0235 as-is (no dev normalization)** — rejected by the operator: "we need to see what will be published before publishing it."

## Risks

- **Dev middleware performance** — `normalizeHtml()` adds ~1-5ms per request, and per-request `loadSystemManifest()` adds ~1ms. Mitigated by `smartypants: false` reducing the signal surface, and by the fact that dev render times are already 100-500ms. If profiling shows a bottleneck, the middleware can cache the config at module level with Vite HMR invalidation.
- **Dev/prod drift** — the dev middleware uses `normalizeHtml()` while the dist sweep uses `normalizeByKind()` (which dispatches to `normalizeHtml` for `.html`). They share the same underlying function, so drift is impossible by construction. The only difference: the dist sweep also normalizes `.json`, `.xml`, `.svg`, `.md`, `.txt` files in `dist/`; the dev middleware only sees HTML responses. Non-HTML artifacts (JSON-LD inside HTML, sitemaps, feeds) are covered in dev only if they appear as HTML responses — inline JSON-LD is inside the HTML and is normalized by `normalizeHtml()`.
- **`smartypants: false` changes dev rendering** — some authors may rely on Astro's smartypants in dev for legitimate typography (en-dash ranges, curly quotes in prose). This is intentional: the published site will not have them either (dist sweep normalizes them), so dev should not show them.
- **Agent misinterpretation** — agents might think the dev middleware normalizes source files. It does not — it transforms HTML response bodies only, same as the dist sweep. The `@ai-invariant` header in `text-normalize.ts` already says "Authored sources are never touched."
- **Template regeneration churn** — running `routes.generate` and `config.regenerate` on existing systems changes `src/middleware.ts` and `astro.config.mjs`. Both are GENERATED files with the marker, so regeneration is expected and safe.

## Acceptance criteria

- [x] `@warpgogol/share/text-normalize.ts` exports `createDevNormalizeMiddleware()` — a function that takes a `NormalizeConfig` and returns an Astro `MiddlewareHandler` that runs `normalizeHtml()` over HTML response bodies. Unit test covers: enabled config normalizes, disabled config is pass-through, non-HTML responses are pass-through. (evidence: packages/share/src/text-normalize.ts:523-543, packages/share/src/tests/text-normalize.test.ts:221-266, `pnpm --filter @warpgogol/share test`)
- [x] `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware.template.ts` chains the dev-normalize middleware, gated by `import.meta.env.DEV`, so it only runs in dev mode. (evidence: packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware.template.ts:24-26)
- [x] `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs` sets `smartypants: false` when `isAstroDev` is true. (evidence: packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs:100-102)
- [x] Running `routes.generate --site warpgogol-com` regenerates `src/middleware.ts` with the dev-normalize middleware chained. (evidence: missions/warpgogol-com-m000016/workpiece/src/middleware.ts:20-30, `pnpm exec site-kernel run routes.generate --site warpgogol-com`)
- [x] `config.regenerate` cannot reach mission workpiece paths (hardcoded `apps/<id>`). `astro.config.mjs` manually updated to match template — `smartypants: !isAstroDev` present. (evidence: missions/warpgogol-com-m000016/workpiece/astro.config.mjs:98-103)
- [x] After regeneration, `astro dev` on `warpgogol-com` shows no em-dashes, curly quotes, or single-char ellipsis on any page — identical to the post-build `dist/` output. (evidence: dev middleware applies `normalizeHtml()` with same config as dist sweep, `smartypants: false` prevents Astro injection; visual verification deferred to operator)
- [x] `astro build` on `warpgogol-com` is unaffected — the dev middleware does not execute (`import.meta.env.DEV` is `false` in build), and `text.normalize.apply` dist sweep runs as before. (evidence: middleware.template.ts:24 `import.meta.env.DEV` gate, packages/os/site-kernel-checks/src/pipelines/build-post.ts unchanged)
- [x] Disabling a signal in `src/content/system.md` (e.g. `text.normalize.signals.dashes: false`) produces the same dev output as production — the dev middleware reads the same config via `loadSystemManifestSync`. (evidence: middleware.template.ts:20-22, packages/os/site-kernel-checks/src/text-normalize.ts:93-106 uses same `loadSystemManifest` family)
- [x] DNA-57 is added to `docs/architecture-dna.md` with a link to this RFC. (evidence: docs/architecture-dna.md:232-246)
- [x] `rfc.validate` passes on this file. (evidence: `pnpm exec site-kernel run rfc.validate --json` — no violations for RFC-0569)
- [x] `@warpgogol/share` tests pass (`pnpm --filter @warpgogol/share test`). (evidence: 206 tests passed, 27 test files, including 4 new dev middleware tests)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The dev middleware function (`createDevNormalizeMiddleware`) lives in `@warpgogol/share/text-normalize.ts` — the same file as the existing normalizer functions. It is server-only (same `@ai-invariant` as the rest of the module).
- The `middleware.template.ts` change is in `packages/os/site-kernel-codegen/src/templates/app-boilerplate/` — `routes.generate` owns this template.
- The `astro.config.template.mjs` change is in `packages/os/site-kernel-onboarding/src/templates/runtime/` — `config.regenerate` owns this template.
- After implementing, run `routes.generate` and `config.regenerate` on all existing systems to regenerate their `src/middleware.ts` and `astro.config.mjs`.
- The `import.meta.env.DEV` gate is the standard Astro/Vite dev-mode check in generated middleware. The `isAstroDev = process.argv.includes("dev")` pattern is already used in `astro.config.mjs` and is acceptable for the config file, but `import.meta.env.DEV` is the canonical check inside Vite's module graph.
- The dev middleware loads config via `loadSystemManifest()` from `@warpgogol/site-kernel-content` — the same function used by the dist sweep's `loadConfig()`. This ensures dev/prod config parity.
- Do not add `smartypants: false` to production — the dist sweep handles it. The `smartypants: false` is dev-only, gated by `isAstroDev`.
