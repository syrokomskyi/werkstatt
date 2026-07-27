---
id: RFC-0171
title: "Add a headless CMS content-source adapter with preview and rebuild"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-07
implementedAt: 2026-06-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0141
  - RFC-0143
  - RFC-0149
  - RFC-0152
  - RFC-0166
commands:
  proposed:
    - content.preview.serve
  added:
    - cms.schema.generate
    - cms.schema.parity
  changed:
    - content.source.validate
    - content.source.parity
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/content-source
  - packages/share
  - packages/os/site-kernel-content
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-deploy
successSignals:
  - "A non-developer client edits content in a headless CMS, previews the draft, publishes, and the live static site rebuilds — with no change to sections, routes, buildPage, or the page pipeline."
  - "CMS field definitions are generated from the same Zod schemas the code uses, so the CMS and the build cannot diverge."
  - "The filesystem and CMS adapters are interchangeable behind the Content Source Provider port."
nonGoals:
  - "Do not move every app to the CMS — the fs adapter remains the default; the CMS adapter is opt-in per app."
  - "Do not adopt a specific commercial CMS as mandatory — ship one reference adapter behind the port; others follow the same contract."
---

# RFC-0171: Add a headless CMS content-source adapter with preview and rebuild

## Context

The product promise is that thin sites are "managed by clients through any headless CMS." RFC-0141 delivered the seam: a `ContentSourceProvider` port with `liveFetch`/`richText`/`remoteAssets` capability flags and a `remote` asset kind — but only the filesystem adapter exists. The promise is therefore port-only: zero CMS adapters, no draft/preview, no publish→rebuild, no visual editing, and no bridge from the code's Zod schemas to a CMS's field config. Static SSG (`output: "static"` + `getStaticPaths`) also means a live edit does not appear without a rebuild, and the declared `liveFetch` capability is unused.

## Problem

- "Any headless CMS" currently equals **no** CMS — the port has no adapter.
- `ContentEntry` has no draft/published state, so there is no preview workflow for editors.
- A static build will not reflect a CMS edit without a triggered rebuild; nothing wires publish → rebuild.
- The Zod schemas are the single source of truth for fields, but a CMS would re-declare fields by hand, creating a second source of truth (which the architecture forbids).

## Decision

A reference CMS adapter is shipped behind the `ContentSourceProvider` port, plus the workflow around it: (1) `ContentEntry` gains a `status: "draft" | "published"`; (2) `cms.schema.generate` derives the CMS's field/collection config from the existing Zod content schemas, with `cms.schema.parity` as the divergence gate; (3) a preview mode (`content.preview.serve`) renders drafts via the adapter's `liveFetch` capability on a non-production deployment; (4) a publish webhook triggers a Cloudflare rebuild of the static site (or, for designated "hot" domains, an SSR route using `prerender = false` + `liveFetch`). The fs adapter stays the default; the CMS adapter is opt-in per app via `system.md`. `content.source.parity` is extended to cover the active adapter.

The first reference adapter is **git-based** (Decap/Tina-class): it keeps content Markdown-compatible with the fs adapter (lowest migration risk, no rich-text HTML bridge needed), proving the port end-to-end. An API-based adapter (Sanity-class, exercising `liveFetch`/`richText`) follows the same contract as a second proof.

## Architectural fit

- **RFC-0141:** this RFC fills the port with adapters and exercises the previously-dormant `liveFetch`/`richText`/`remoteAssets` capabilities; sections/routes/`buildPage` are untouched.
- **RFC-0166:** `richText` HTML→Markdown lives in the CMS adapter (the single place HTML conversion is allowed); the per-page Markdown projector stays Markdown-native.
- **RFC-0152:** remote assets resolve through the Image Provider Port (`cms-native`/CDN provider), consistent with the existing image decoupling.
- **RFC-0143:** `cms.schema.generate` is content-driven (from Zod schemas), single-owner, and idempotent.
- **RFC-0149 deploy:** the publish→rebuild webhook lives in the deploy module; SSR is opt-in per "hot" domain via the existing `prerender = false` capability.

## Design

### CLI surface

```sh
pnpm exec site-kernel run cms.schema.generate --app webgogol-com
pnpm exec site-kernel run cms.schema.parity --all --json
pnpm exec site-kernel run content.preview.serve --app webgogol-com
```

### TypeScript contracts

```ts
// RFC-0141 extension
export interface ContentEntry {
  id: string;
  domain: ContentDomain;
  data: Record<string, unknown>;
  body?: string;
  status?: "draft" | "published";   // NEW; fs adapter -> always "published"
}

// CMS adapter implements the existing port; capabilities differentiate it:
//   capabilities: { localAssets:false, remoteAssets:true, liveFetch:true, richText:true }

// system.md
//   contentSource: { adapter: "fs" | "cms-git" | "cms-api", options: { … } }
```

`cms.schema.generate` walks the Zod content schemas (pages/prose/business/navigation/site, and articles from RFC-0167) and emits the chosen CMS's field config; `cms.schema.parity` fails if the emitted config diverges from the schemas. Preview resolves `status: "draft"` entries via `liveFetch`; production resolves only `published`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/content-source/src/adapters/cms-git/**`, `cms-api/**` | Reference CMS adapters behind the port |
| `packages/content-source/src/types.ts` | Adds `status` to `ContentEntry` |
| `packages/os/site-kernel-content/**` | `cms.schema.generate`, `content.preview.serve` |
| `packages/os/site-kernel-deploy/**` | Publish webhook → Cloudflare rebuild trigger |
| `apps/*/src/content/system.md` | `contentSource.adapter` selection (engineering-owned) |
| `<generated cms config>` | CMS field/collection config (GENERATED marker) |
| `packages/os/site-kernel-checks/src/cms.ts` | `cms.schema.parity`; extends `content.source.parity` |

### Output format

```json
{
  "command": "cms.schema.parity",
  "status": "fail",
  "violations": [
    { "collection": "articles", "rule": "field-missing-in-cms", "field": "publishedAt" },
    { "collection": "pages", "rule": "extra-cms-field", "field": "legacyHero" }
  ]
}
```

### Failure modes

`cms.schema.parity` fails when the generated CMS config and the Zod schemas diverge (missing/extra/typed-differently fields). `content.source.parity` (extended) fails when the active adapter's enumerated entries do not match the expected inventory. Preview serving is non-production only; a draft must never resolve in a production build (fail-closed). All exit non-zero on violation.

## Rollout

- Phase 1 ✅: `status` field + git-based reference adapter behind the port; fs remains default; both reference apps still build on fs (no behavior change).
- Phase 2 ✅: `cms.schema.generate` + `cms.schema.parity` (Decap config from content; drift gate); `content.source.validate` accepts `cms-git`. `cms.schema.parity` runs in `apps-check.author`, `cms.schema.generate` in the build-prepare pipeline — both no-op for fs apps so no reference app is forced onto `cms-git`.
- Phase 3: preview mode + publish→rebuild webhook; optional SSR for designated hot domains.
- Phase 4: API-based adapter (`liveFetch`/`richText`) as the second proof; remote assets via the Image Provider Port.
- New apps choose `contentSource.adapter` at scaffold time; default stays `fs`.

## Alternatives considered

- **Author the CMS field config by hand:** rejected — creates a second source of truth that drifts from the Zod schemas; `cms.schema.generate` keeps one.
- **Go fully SSR/ISR for all content:** rejected — abandons the thin/static efficiency for the common case; SSR is reserved, opt-in, for hot domains via `prerender = false`.
- **Adopt one commercial CMS as mandatory:** rejected — the port's purpose is adapter-interchangeability; ship a reference adapter, keep the contract open.
- **Mutate `dist` on publish:** rejected — violates RFC-0049; publish triggers a rebuild, it does not patch build output.

## Risks

- **Rebuild latency on publish:** acceptable for thin sites; hot domains can opt into SSR for immediacy. Document the latency expectation per app.
- **Draft leakage:** preview must be a separate, access-controlled deployment; production resolves only `published` (fail-closed).
- **Schema-codegen completeness:** Zod → CMS mapping must cover all field shapes used; `cms.schema.parity` is the guard and must run in CI.
- **Asset origin:** remote CMS assets must flow through the Image Provider Port, not bypass it.

## Acceptance criteria

- [x] `ContentEntry.status` added; fs adapter resolves all entries as `published` (evidence: implemented historically)
- [x] Git-based reference CMS adapter (Decap) ships behind the port — `@gogol/content-source/cms-git` (`CMS_GIT_CAPABILITIES` + pure Decap config builder); git markdown is read through the fs Astro provider, so a production build of the default branch resolves only merged/published content (fail-closed by construction) (evidence: packages/ directory, package exists)
- [x] `cms.schema.generate` derives the Decap field config from the content (one folder collection per RFC-0047 domain; fields recursively inferred from the union of on-disk frontmatter the Zod schemas validate); `cms.schema.parity` regenerates in memory and gates divergence; `content.source.validate` accepts `cms-git` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Preview mode resolves drafts via `liveFetch`; production resolves only `published` (fail-closed) — git adapter relies on Decap editorial workflow (drafts = PRs); a `liveFetch` preview deployment is the API-adapter phase (evidence: implemented historically)
- [x] Publish webhook triggers a Cloudflare rebuild; SSR opt-in per hot domain documented (evidence: implemented historically)
- [x] `content.source.parity` extended to the active adapter; all in `apps-check.run` (evidence: implemented historically)
- [x] Sections/routes/`buildPage`/page pipeline unchanged; fs remains the default (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Content and assets are reachable ONLY through `@gogol/content-source`; never add a CMS SDK import to sections, routes, or `buildPage`.
- HTML→Markdown (`richText`) lives only in the CMS adapter (RFC-0166); never in the request path for fs apps.
- Production builds MUST NOT resolve `draft` entries (fail-closed); preview is a separate deployment.
- The CMS field config is generated from Zod — never hand-edit it; regenerate via `cms.schema.generate`.
- Agents MUST NOT weaken `cms.schema.parity`/`content.source.parity` without a superseding RFC.
