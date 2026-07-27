---
id: RFC-0149
title: "Unify deployment on Cloudflare Workers via the Astro adapter; retire Pages Functions"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-03
updatedAt: 2026-07-07
implementedAt: 2026-06-03
closedAt:
supersedes:
  - RFC-0140
supersededBy:
amends: []
amendedBy:
  - RFC-0152
  - RFC-0168
  - RFC-0339
related:
  - DNA-01
  - DNA-08
  - DNA-36
  - RFC-0029
  - RFC-0030
  - RFC-0089
  - RFC-0137
  - RFC-0140
  - RFC-0141
commands:
  proposed: []
  added: []
  changed:
    - api.routes.generate
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-astro"
successSignals:
  - "Every @app deploys as a single Cloudflare Workers project (static assets + on-demand routes) from one git-connected build — no second deployment model, no Pages Functions."
  - "The send-message endpoint is a portable Astro APIRoute under src/pages/api/, not a Cloudflare Pages Function under functions/; no onRequest* signature or context.env access remains anywhere."
  - "The site stays static by default (output: static, DNA-01): only routes that explicitly declare prerender = false render on demand."
  - "Build-time image optimization (sharp) is preserved for prerendered pages via the adapter's imageService: compile; no Cloudflare Images binding is provisioned."
  - "Runtime secrets are read through type-safe astro:env/server, projected into each app's env schema from the sections it uses — no per-app secret wiring, no host-specific env access."
  - "No functions/ directory exists in any @app; no legacy Pages wrangler keys, no stale Astro.locals.runtime types remain."
nonGoals:
  - "Do not introduce a real CMS adapter or remote-asset provider — RFC-0141 owns that; this RFC only changes the deployment substrate and the server-endpoint shape."
  - "Do not keep any backward-compatibility path with the Pages Functions model — the migration is a clean replacement (no dual support)."
  - "Do not add bespoke raw-Worker entrypoints or Cloudflare-coupled handler signatures — server endpoints stay portable Astro APIRoutes."
  - "Do not move content, system.md, or cosmic structure — content authoring is untouched."
  - "Do not change the client-side send-message contract — it already POSTs to the host-relative /api/send-message."
---

# RFC-0149: Unify deployment on Cloudflare Workers via the Astro adapter; retire Pages Functions

## Context

RFC-0140 established that section-owned server endpoints (today only `send-message`) ship as **Cloudflare Pages Functions** under `apps/<app>/functions/api/`, keeping each site fully static with **no Astro adapter**. That decision was made to protect two things: build-time image optimization (the Workers-first `@astrojs/cloudflare` adapter restructured the build and collided with the Pages `ASSETS` binding) and a single static deployment target.

Three facts have since changed the trade-off:

1. **Cloudflare is consolidating on Workers.** As of Astro 6, `@astrojs/cloudflare` **no longer supports Cloudflare Pages** — it targets **Cloudflare Workers with static assets** (`main` + `assets.binding`). Pages Functions are now the legacy substrate, and the richer runtime surface the platform invests in (Durable Objects, Queues, KV, D1, R2, request-time middleware) lives on Workers.
2. **The Pages Functions model has actively misfired in operation.** The git-connected project was classified as a Worker-with-assets, which hid the `functions/` convention and the runtime-variable surface entirely. The contortions required to keep the static + Pages Functions model working are the symptom of fighting the platform's direction.
3. **The image-optimization objection is now answerable without giving anything up.** The Astro 6 adapter exposes `imageService: 'compile'`, which runs sharp **at build time for prerendered routes** and uses a no-op passthrough for on-demand routes. Because thin sites render their image-bearing pages statically, build-time sharp optimization is fully preserved — and the optimized output stays host-portable (plain `.webp` files).

The studio runs **only two `@apps`** today (`webgogol-com`, `nicaragua-projekt`). This is the cheapest moment to converge on one deployment model before the site count grows.

## Problem

RFC-0140 protects the invariant "every site is fully static; server behavior lives in `functions/`, never in Astro on-demand routes." That invariant now forces a **second deployment model** (Pages Functions) that:

- diverges from where Astro and Cloudflare are heading (Workers static assets);
- ties the only server endpoint to a **Cloudflare-specific signature** (`onRequestPost(context)`, `context.env`) that does not port to other adapters or hosts;
- leaves stale adapter scaffolding behind — [`apps/webgogol-com/src/env.d.ts`](../../apps/webgogol-com/src/env.d.ts) still declares `App.Locals extends import("@astrojs/cloudflare").Runtime<Env>`, a type that **Astro 6 removed** (`Astro.locals.runtime` no longer exists);
- cannot run request-time middleware (e.g. real `Accept-Language` language detection), because a fully static build executes middleware only at build time.

Unprotected today: there is **no single, platform-aligned deployment contract** for thin sites, and the server-endpoint shape is host-coupled.

## Decision

The workspace **standardizes every `@app` on a single Cloudflare Workers deployment** produced by the `@astrojs/cloudflare` adapter, and **retires the Pages Functions model entirely (no backward compatibility)**:

1. **Adapter + static-first.** Each app's `astro.config` keeps `output: "static"` (DNA-01) and adds `adapter: cloudflare({ imageService: "compile" })`. The site is prerendered by default; only routes that declare `export const prerender = false` render on demand in the Worker.
2. **Server endpoints become portable Astro APIRoutes.** The `send-message` handler moves from a Cloudflare Pages Function (`functions/api/send-message.ts`, `onRequestPost`) to an Astro endpoint (`src/pages/api/send-message.ts`, `export const POST: APIRoute` + `prerender = false`). No `onRequest*` signature and no `context.env` survive anywhere.
3. **Secrets via `astro:env/server`.** Runtime secrets are declared as a typed env schema and read through `astro:env/server` — host-portable and type-safe. The schema for each app is **generated from the sections it uses**, so thin sites wire no secrets by hand.
4. **Request-time middleware where needed.** The language-redirect entry route opts into `prerender = false` so the existing middleware performs a real request-time `Accept-Language` redirect; all content pages stay prerendered.
5. **`functions/` is deleted** from every app, the `api.routes.generate` generator is repurposed to emit Astro endpoints, the Workers `wrangler.jsonc` form replaces the Pages form, and all stale adapter/Pages types are removed. **RFC-0140 is superseded.**

## Architectural fit

- **Architecture DNA — DNA-01 (static-first).** Preserved in letter: `output: "static"`, prerender by default. On-demand rendering is the explicit per-route exception, not the default.
- **DNA-08 (React for islands only).** Unchanged — no new framework, no SSR component model.
- **DNA-36 (everything generated except client content).** Strengthened: the server-endpoint files, the env schema, the adapter config, and `wrangler.jsonc` are all generated from section manifests and templates. The thin site still authors only content.
- **RFC-0141 (content/asset port).** Complementary. `imageService: "compile"` covers today's local (fs-provider) assets; when a site later adopts a remote-CMS asset provider, it switches to `imageService: { build: "compile", runtime: "cloudflare" }` or a remote transform CDN with no change to this deployment contract.
- **Scaling Playbook.** Applies uniformly across stages 1–4: one project type, one build, one deploy, generated end to end.

## Design

### Deployment substrate

Single git-connected **Cloudflare Workers** project per app. Cloudflare runs the app build command and deploys the adapter-emitted Worker; static assets are served from the `ASSETS` binding and on-demand routes execute in `workerd`. No "deploy command" hybrid, no `wrangler pages deploy`.

### `astro.config` (generated template)

```js
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { defineConfig, envField } from "astro/config";

export default defineConfig({
  {{SITE_LINE}}
  output: "static", // DNA-01: prerender by default; opt out per route with prerender = false
  adapter: cloudflare({
    // sharp at BUILD time for prerendered routes; passthrough for on-demand routes.
    // workerd cannot run sharp at request time — thin sites render images statically,
    // so build-time optimization is fully preserved and the output stays host-portable.
    imageService: "compile",
  }),
  // Secret schema is GENERATED from the sections this app uses (see api.routes.generate).
  env: {
    schema: {
      // e.g. TELEGRAM_BOT_TOKEN: envField.string({ context: "server", access: "secret" }),
    },
  },
  integrations: [react()],
  // …vite config unchanged (RFC-0089 optimizeDeps/exclude, manualChunks, ssr.external)…
});
```

### `wrangler.jsonc` (generated template — Workers form)

```jsonc
{
  "name": "{{CLIENT_ID}}",
  "compatibility_date": "2026-06-03",
  "compatibility_flags": ["nodejs_compat", "nodejs_compat_populate_process_env"],
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  },
  "placement": { "mode": "smart" },
  "observability": { "enabled": true }
}
```

Removed vs. the Pages form: `pages_build_output_dir`. The `assets` block returns — but now as the **Workers** static-assets binding (`binding: "ASSETS"`), which is the correct, platform-aligned use, not the contaminant it was inside a Pages project.

### Server endpoint contract (no CF signature)

Section handler (`@gogol/ui/sections/send-message/api`) becomes a portable Astro endpoint factory:

```ts
import type { APIRoute } from "astro";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "astro:env/server";

export const POST: APIRoute = async ({ request }) => {
  // …validation + Telegram transport (logic unchanged from RFC-0140)…
  // secrets come from astro:env/server, NOT context.env / onRequest signature.
};
```

Generated per-app route file (`src/pages/api/send-message.ts`), emitted by `api.routes.generate`:

```ts
// GENERATED …
export const prerender = false; // on-demand: runs in the Worker
export { POST } from "@gogol/ui/sections/send-message/api";
```

The client is unchanged — [`send-message-section.client.ts`](../../packages/ui/src/sections/send-message/send-message-section.client.ts) already POSTs to the host-relative `/api/send-message`.

### Section manifest — declare required secrets

The section `api[]` declaration gains a `secrets` list so the generator can project a typed env schema and finally standardize per-channel secret naming (the follow-up RFC-0140 deferred):

```yaml
api:
  - route: send-message
    handler: "@gogol/ui/sections/send-message/api"
    methods: [POST]
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]
```

### `api.routes.generate` — repurposed (command name unchanged)

| Aspect | Before (RFC-0140) | After (this RFC) |
| --- | --- | --- |
| Emit target | `apps/<app>/functions/api/<route>.ts` | `apps/<app>/src/pages/api/<route>.ts` |
| Export shape | `export { onRequestPost } from …` | `export const prerender = false;` + `export { POST } from …` |
| Handler signature | Cloudflare `onRequestPost(context)` | Astro `APIRoute` |
| Side output | — | projects `secrets[]` into the app's `astro:env` schema |
| GC | removes unused `functions/api/*` | removes unused `src/pages/api/*` **and** any residual `functions/` |

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/functions/**` | **Deleted**; generator GCs any residue |
| `apps/<app>/src/pages/api/<route>.ts` | GENERATED Astro endpoint (`prerender = false`) |
| `apps/<app>/astro.config.mjs` | Adapter + `imageService: compile` + generated `env.schema` |
| `apps/<app>/wrangler.jsonc` | Workers form (`main` + `assets.binding`) |
| `apps/<app>/src/env.d.ts` | Stale `Runtime<Env>` removed; `astro:env` types only |
| `packages/ui/src/sections/**/*.api.ts` | `APIRoute` handlers; read secrets via `astro:env/server` |
| `packages/ui/src/sections/**/*.manifest.yaml` | `api[].secrets` declared |
| `packages/os/site-kernel-codegen/src/api-routes.ts` | Repurposed generator |
| `packages/os/site-kernel-onboarding/src/templates/**` | astro.config + wrangler + package.json templates |
| `packages/os/site-kernel-checks/**` | Ownership/grace rules updated off `functions/` |

### Output format

`api.routes.generate --json` keeps its envelope; `generated[]`/`removed[]` now carry `src/pages/api/*` paths, and a new `envSchema[]` lists projected secret fields:

```json
{
  "command": "api.routes.generate",
  "status": "ok",
  "generated": ["src/pages/api/send-message.ts"],
  "removed": ["functions/api/send-message.ts"],
  "envSchema": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
}
```

### Failure modes

- A used section declaring `api[].secrets` that the app's generated schema cannot project → generator exits non-zero (`missing-secret-projection`).
- A project-specific (non-GENERATED) file at a target route path → skipped with a warning, never overwritten (existing generator guard, preserved).
- A residual `functions/` file lacking the GENERATED marker → left in place with a warning (manual review), matching current GC safety.

## Rollout

Clean replacement, no dual model, no grace period (only two apps):

1. Land the adapter/template/generator changes; regenerate both apps (`build.prepare`).
2. Delete `apps/*/functions/`; confirm `src/pages/api/send-message.ts` is generated.
3. Recreate each Cloudflare project as a **Workers** project (git-connected); set `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` as Worker secrets.
4. `build.check` green on both apps (SSG output intact, images optimized at build, endpoint on demand).
5. New apps comply from day one via the onboarding templates (DNA-36 / RFC-0137).

## Alternatives considered

- **Keep RFC-0140 (static + Pages Functions).** Rejected: a second, legacy deployment model that fights the platform and couples the endpoint to Cloudflare. The operational misfires are its symptom.
- **Raw custom Worker entrypoint wrapping Astro.** Rejected: reintroduces a Cloudflare-coupled signature and bespoke routing; the adapter already gives static assets + on-demand routes + an extensible Worker.
- **`output: "server"` with `prerender = true` on content.** Rejected: inverts the static-first default (DNA-01) and widens the on-demand surface unnecessarily.
- **`imageService: "cloudflare"` (runtime Image Resizing).** Rejected as default: provisions a paid binding and moves optimization to request time for no benefit while assets are local. Reserved as the documented path for the future remote-CMS asset provider (RFC-0141).
- **Raw `import { env } from "cloudflare:workers"` for secrets.** Rejected: host-coupled and untyped; `astro:env/server` is portable and type-safe.

## Risks

- **Prerendering moved to `workerd` in Astro 6.** Prerendered pages now render in the Workers runtime by default; thin sites whose render path touches Node APIs may need `prerenderEnvironment: "node"`. Mitigation: verify `build.check` on both apps; set `prerenderEnvironment: "node"` in the template if prerender breaks. (Build-time pipeline and fs content reads run in Node regardless.)
- **`astro:env/server` in a workspace package.** The section handler imports a virtual module resolved in the app's Astro build. Mitigation: validated by both apps building green; consistent with existing virtual-module use (`astro:middleware`).
- **Endpoint availability in `astro dev`.** The current `start` script warns that Functions are unavailable in `astro dev`; with the adapter, on-demand routes run in dev via `workerd`. Net improvement; update the script and its warning.
- **Agent confusion with superseded RFC-0140.** Mitigation: mark RFC-0140 `supersededBy: RFC-0149`, and rewrite the `astro.config` template comment that asserts "no adapter / Pages Functions."

## Acceptance criteria

- [x] `@astrojs/cloudflare` added to the onboarding `package.json` template; `astro.config` template uses `adapter: cloudflare({ imageService: "compile" })` with `output: "static"`. (evidence: implemented historically)
- [x] `wrangler.jsonc` template uses the Workers form (`main` + `assets.binding: "ASSETS"`); no `pages_build_output_dir`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `api.routes.generate` emits `src/pages/api/<route>.ts` (`prerender = false` + `APIRoute` re-export), GCs `functions/`, and projects `secrets[]` into the app `env` schema. (evidence: implemented historically)
- [x] `send-message` section handler is an `APIRoute` reading `astro:env/server`; no `onRequest*` / `context.env` anywhere in the workspace. (evidence: implemented historically)
- [x] Section manifest declares `api[].secrets`; `--json` output documents `envSchema[]`. (evidence: implemented historically)
- [x] Stale `Runtime<Env>` / `Astro.locals.runtime` types removed from `env.d.ts` template and apps. (evidence: implemented historically)
- [x] `apps/webgogol-com/functions/` and `apps/nicaragua-projekt/functions/` deleted. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `build.check` green on both apps; images optimized at build; `/api/send-message` on demand. (evidence: implemented historically)
- [x] RFC-0140 marked `supersededBy: RFC-0149`; `astro.config` "no adapter" comment rewritten. (evidence: implemented historically)
- [x] `AGENTS.md` (root + `@gogol/ui` sections + onboarding) updated off the Pages Functions model. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC, including marking RFC-0140 superseded until this RFC is accepted.
- There is **no backward-compatibility path**: do not leave `functions/`, `onRequest*` signatures, `context.env` access, or `Astro.locals.runtime` types behind. Remove, do not deprecate.
- Server endpoints MUST stay portable Astro `APIRoute`s reading secrets via `astro:env/server`. Do not introduce Cloudflare-coupled handler signatures or raw `cloudflare:workers` imports.
- Keep the site static-first: `output: "static"`; add `prerender = false` only to routes that require on-demand execution (API endpoints, the language-redirect entry route).
- When implementing, reference `RFC-0149` in commit messages.
