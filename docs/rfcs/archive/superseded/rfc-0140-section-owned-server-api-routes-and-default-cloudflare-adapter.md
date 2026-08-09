---
id: RFC-0140
title: "Section-owned server API routes and default Cloudflare adapter"
status: superseded
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-01
updatedAt: 2026-06-04
implementedAt: 2026-06-01
closedAt: 2026-06-03
supersedes: []
supersededBy: RFC-0149
related:
  - RFC-0029
  - RFC-0030
  - RFC-0078
  - RFC-0089
  - RFC-0103
  - RFC-0137
commands:
  proposed:
    - api.routes.generate
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel-checks"
  - "@gogol/ui"
  - "@gogol/ontology"
successSignals:
  - A site that uses a section declaring an `api:` block builds green; the site stays fully static (no NoAdapterInstalled error, because there is no on-demand Astro route).
  - Removing the last section that needs an endpoint regenerates the site with zero `functions/api/*` files (no dead routes).
  - The Telegram/email handler logic for send-message exists exactly once in `@gogol/ui`; every site's `functions/api/send-message.ts` is a thin GENERATED re-export.
  - "`api.routes.generate` is idempotent: a second run on an unchanged site produces zero diff."
nonGoals:
  - Do not standardize per-channel secrets/config (env var names, channel selection). A follow-up RFC owns that.
  - Do not move section handler logic out of the section package into a separate runtime package.
  - "Do not change `output: \"static\"`; sites stay fully SSG and endpoints are Cloudflare Pages Functions, not Astro on-demand routes."
---

# RFC-0140: Section-owned server API routes and default Cloudflare adapter

> **Implementation note (supersedes the original "default Cloudflare adapter" design below).** During implementation the `@astrojs/cloudflare` adapter proved a poor fit: it is a Workers-first adapter that restructures the build output, which (a) broke this project's SSG-tuned build-time image optimization (`ENOENT` on `dist/_astro/*.webp`) and (b) injected a reserved `ASSETS` binding that collided with each app's Cloudflare **Pages** `wrangler.jsonc`. The accepted goal — section-owned endpoints, generated only for used sections, with logic living once in `@gogol/ui` — is fully met **without any Astro adapter** by emitting **Cloudflare Pages Functions** under `functions/api/`. Sites stay 100% static; `wrangler pages deploy` bundles `functions/` automatically. This is strictly simpler ("не усложняем логику") and keeps the SSG image pipeline intact. Sections below that reference the adapter / `src/pages/api/` describe the abandoned design and are kept for provenance; the **Design** section reflects what shipped.

## Context

Sites are scaffolded as radically thin Astro apps with `output: "static"` and no server adapter ([`astro.config.template.mjs`](../../packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs)). They deploy to Cloudflare Pages (RFC-0029) and render entirely from the CDN.

The new `send-message` section (RFC-0103 family) needs a server endpoint to forward a contact message to an outbound channel (Telegram today, email later). A hand-written `apps/warpgogol-com/src/pages/api/send-message.ts` was added with `export const prerender = false`. Astro cannot build an on-demand route without an adapter, so the build fails:

```
[NoAdapterInstalled] Cannot use server-rendered pages without an adapter.
```

(The trailing `Assertion failed … src\win\async.c` is a secondary libuv crash on Windows after the real error; it is not a separate fault.)

`@astrojs/cloudflare` is already a dependency of `warpgogol-com` ([`package.json`](../../apps/warpgogol-com/package.json)) but is not wired into the config. More fundamentally, the endpoint is bespoke, app-local, and duplicated: it violates the "thin apps, thick OS" invariant. The same need will recur for many sections across many sites — there may be dozens of such endpoints, each present only when the section that needs it is present.

## Problem

1. **No adapter.** Any on-demand route breaks every site's build. Sites have no default way to host a server endpoint.
2. **Bespoke, duplicated logic.** The send-message handler lives inside one app. Replicating it per site means dozens of copies that drift; a bug fix would require editing every site.
3. **No declarative link between a section and its endpoint.** Nothing in the section manifest says "this section needs `/api/send-message`," so the OS cannot generate, validate, or garbage-collect these routes.
4. **No conditional generation.** Endpoints must appear only on sites that actually use the owning section, and disappear when the section is removed.

## Decision

Three coordinated changes, all owned by the OS:

1. **Cloudflare adapter by default.** Wire `@astrojs/cloudflare` into the onboarding `astro.config` template for all `@apps`. Keep `output: "static"`: Astro stays SSG-first and only routes that opt in with `prerender = false` are rendered on demand. No per-app adapter logic.

2. **Section-owned API contract.** A section MAY declare an `api:` block in its `*.manifest.yaml`. The handler logic lives once in the section package, co-located with the section (e.g. `packages/ui/src/sections/send-message/send-message-section.api.ts`), and exports a standard Astro `APIRoute`.

3. **`api.routes.generate` codegen.** A new kernel generator scans the site's used section types, and for each used section that declares an `api:` block, writes a **thin GENERATED re-export** at `src/pages/api/<name>.ts`. The file carries the `GENERATED` marker for idempotency and is garbage-collected when the section is no longer used.

## Architectural fit

- **RFC-0029 / DNA-1 (SSG + Cloudflare Pages)**: We keep SSG output and Pages deployment. The adapter only enables on-demand rendering for the small set of routes that explicitly opt out of prerendering.
- **RFC-0078 (Engineering boilerplate generation)**: `api.routes.generate` is a new boilerplate generator in `@gogol/site-kernel-codegen`, following the exact pattern of `routes.generate` — managed files with the `GENERATED` marker, idempotent, registered in `APPS_BUILD_PREPARE_PIPELINE`.
- **RFC-0103 (thin section dispatchers)**: Handler logic is section-owned and co-located, consistent with sections owning their `.astro`, `.types.ts`, `.client.ts`, and `.manifest.yaml`. The `.api.ts` is the server sibling.
- **RFC-0089 (Astro subpath exports)**: Sites consume the handler from `@gogol/ui` via a subpath export, the same way they consume section components; `noExternal` already covers `@gogol/ui`.
- **RFC-0137 (template currency)**: The adapter change flows through the onboarding template, so every new and regenerated app complies automatically.

## Design (as shipped)

### 1. No Astro adapter — sites stay fully static

`astro.config` is unchanged in substance: `output: "static"`, React integration only, **no adapter**. Server behavior is delivered by Cloudflare Pages Functions, which Pages bundles natively. The onboarding [`astro.config.template.mjs`](../../packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs) and both apps carry only a comment documenting that endpoints are Pages Functions under `functions/api/`. `wrangler.jsonc` (Pages, `nodejs_compat`) is unchanged; `wrangler pages deploy dist` picks up `./functions` automatically.

> The `@astrojs/cloudflare` dependency remains declared but unused; a follow-up may prune it. Keeping it avoids an install churn and leaves the door open.

### 2. Section API contract

Section manifests gain an optional `api:` block (ontology schema update in [`manifest.ts`](../../packages/ontology/src/manifest.ts)):

```yaml
# send-message-section.manifest.yaml
api:
  - route: send-message          # → functions/api/send-message.ts  (serves /api/send-message)
    handler: "@gogol/ui/sections/send-message/api"  # subpath export of the Pages Function module
```

```ts
interface SectionApiDeclaration {
  /** Route stem under functions/api/. Serves /api/<route>. Kebab-case. */
  route: string;
  /** Bare-import specifier of the module exporting the Pages Function handler(s). */
  handler: string;
}
// sectionManifestSchema.api?: SectionApiDeclaration[]
```

The handler (logic that lives **once**) is co-located in the section package as a **Cloudflare Pages Function** — `packages/ui/src/sections/send-message/send-message-section.api.ts`:

```ts
// no Astro / adapter imports — a plain Pages Function
export async function onRequestPost(context): Promise<Response> {
  const { request, env } = context; // secrets via env (env.TELEGRAM_BOT_TOKEN, …)
  /* validate + forward to Telegram */
}
```

`@gogol/ui` exposes it via a subpath export (`"./sections/send-message/api": "./src/sections/send-message/send-message-section.api.ts"`), mirroring how section components are exported. Reading secrets from the Pages Function `env` (not `import.meta.env`) is the Cloudflare-native path.

### 3. `api.routes.generate`

New generator in `@gogol/site-kernel-codegen` ([`api-routes.ts`](../../packages/os/site-kernel-codegen/src/api-routes.ts)), registered in `APPS_BUILD_PREPARE_PIPELINE` (right after `routes.generate`) and in `onboarding.scaffold`.

Algorithm:

1. Resolve the site's **used section types**: scan `src/content/pages/**/*.md` block `type` / `use` selectors. Dedupe.
2. Read every section manifest under `packages/ui/src/sections`; index `api[]` declarations by both `semanticId` and `archetype`.
3. For each used type with an `api[]` declaration, emit `functions/api/<route>.ts` as a thin re-export carrying the `GENERATED` marker:

```ts
// GENERATED. Do not change this line unless the file contains project specific changes.
// Section-owned Cloudflare Pages Function (RFC-0140). …
export * from "@gogol/ui/sections/send-message/api";
```

(`export *` re-exports all `onRequest*` handlers the section defines.) 4. **Garbage-collect**: any `functions/api/*.ts` carrying the `GENERATED` marker whose route is no longer wanted is deleted. Files without the marker are treated as project-specific and left untouched (with a warning).

Idempotency and ownership mirror the `writeManagedFile` discipline in [`app-boilerplate.ts`](../../packages/os/site-kernel-codegen/src/app-boilerplate.ts).

### CLI surface

```sh
# Generate API routes for the current app from its used sections
pnpm exec werkstatt run api.routes.generate

# Dry-run: list what would be written / deleted
pnpm exec werkstatt run api.routes.generate --dry-run
```

### TypeScript contracts

```ts
interface ApiRoutesGenerateResult {
  command: "api.routes.generate";
  status: "ok" | "fail";
  generated: string[];   // app-relative paths written
  removed: string[];     // app-relative GENERATED routes garbage-collected
  warnings?: Array<{ file: string; message: string }>;
}
```

### Generator ownership

A directory-glob ownership entry is added to [`generator-ownership.ts`](../../packages/os/site-kernel-checks/src/generator-ownership.ts): `functions/api/{route}.ts` → `api.routes.generate`, so the governance check knows these routes are OS-owned.

## Failure modes

- Section manifest declares `api:` but the handler specifier does not resolve → `api.routes.generate` exits 1 with the unresolved specifier.
- A non-GENERATED file exists at a target path → skipped with a warning; never overwritten (preserves project-specific endpoints).
- `--dry-run` never writes or deletes; exit 0.
- No used section declares an `api:` block → zero files, zero error.

## Rollout

1. **Phase 1 (static + Pages Function)**: Keep `output: "static"`, no adapter; move the send-message handler into `@gogol/ui` as a Pages Function with a subpath export. This unblocks the build (no on-demand Astro route → no NoAdapterInstalled).
2. **Phase 2 (contract)**: Add the `api:` schema to `@gogol/ontology`; declare `api:` in the send-message manifest.
3. **Phase 3 (codegen)**: Implement `api.routes.generate`, register it in the pipeline + onboarding scaffold + ownership registry; replace the hand-written `apps/warpgogol-com/src/pages/api/send-message.ts` with the generated `apps/warpgogol-com/functions/api/send-message.ts`.
4. **New apps**: Comply automatically via the templates and pipeline.

## Alternatives considered

- **Full handler code generated into each site** (from a template, like `wrangler`): rejected — duplicates logic across dozens of sites, drifts, and a bug fix would touch every app. Thin re-export keeps logic in one place.
- **Generate endpoints for every API-declaring section regardless of use**: rejected — ships dead routes to sites that do not use the section; the build would render unused on-demand functions.
- **Dedicated runtime package for handlers** (separate from `@gogol/ui`): rejected for now — sections already own their full quintet; co-location keeps the section self-contained. Can be revisited if handler logic grows.
- **`@astrojs/cloudflare` adapter + Astro on-demand routes** (the originally accepted design): rejected during implementation — the Workers-first adapter restructures the build output, breaking SSG build-time image optimization and colliding with the Pages `ASSETS` binding. Cloudflare Pages Functions deliver the same on-demand capability with zero adapter and a fully static site.
- **`output: "server"`**: rejected — would make the whole site on-demand and lose the CDN-first SSG model.

## Risks

- **Pages Function bundling at deploy**: `wrangler pages deploy dist` must pick up `./functions`. Mitigation: this is the documented Cloudflare Pages convention; `wrangler.jsonc` already enables `nodejs_compat`. Verify with a real deploy.
- **Used-section detection drift**: if a section is referenced by an alias not equal to its `semanticId`/`archetype`, detection could miss it. Mitigation: the generator indexes manifests by both keys, matching the block selector resolution.
- **Secret availability at runtime**: handlers read secrets from the Pages Function `env`; these must be configured in Cloudflare. Out of scope here (follow-up RFC); a missing secret degrades to the handler's error path, not a build failure.

## Acceptance criteria

- [x] `astro.config` stays `output: "static"` with no adapter; the template documents the Pages-Function model. (evidence: implemented historically)
- [x] `warpgogol-com` and `nicaragua-projekt` build green from the repo root (no NoAdapterInstalled; SSG image pipeline intact). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `@gogol/ontology` section manifest schema accepts an optional `api:` block. (evidence: packages/ directory, package exists)
- [x] send-message handler is a Pages Function in `@gogol/ui` with a subpath export; the manifest declares its `api:` route. (evidence: packages/ directory, package exists)
- [x] `api.routes.generate` writes thin GENERATED re-exports only for used, API-declaring sections; garbage-collects stale GENERATED routes; is idempotent. (evidence: implemented historically)
- [x] `api.routes.generate` is registered in `APPS_BUILD_PREPARE_PIPELINE`, `onboarding.scaffold`, and `generator-ownership.ts`. (evidence: implemented historically)
- [x] The hand-written `apps/warpgogol-com/src/pages/api/send-message.ts` is replaced by the generated `functions/api/send-message.ts`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY after the status moves to `accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- Keep handler logic in the section package; the per-site file MUST be a thin re-export carrying the `GENERATED` marker.
- Reuse `writeManagedFile` / `runGeneratedFileSet` for idempotency and ownership.
- Do NOT introduce per-channel secret conventions here; that is a follow-up RFC.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)
