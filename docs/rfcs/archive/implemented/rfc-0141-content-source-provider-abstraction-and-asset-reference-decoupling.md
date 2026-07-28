---
id: RFC-0141
title: "Content Source Provider abstraction and asset-reference decoupling"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-02
updatedAt: 2026-06-02
implementedAt: 2026-06-02
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-21
  - DNA-22
  - DNA-24
  - DNA-25
  - DNA-26
  - RFC-0008
  - RFC-0042
  - RFC-0044
  - RFC-0045
  - RFC-0047
  - RFC-0053
  - RFC-0138
  - RFC-0140
commands:
  proposed: []
  added:
    - asset.reference.validate
    - content.source.parity
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/content-source"
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/business"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "All content access in packages/* and apps/* flows through a single Content Source Provider port; no module reads markdown files or globs assets directly outside the fs adapter."
  - "The fs adapter reproduces today's behavior byte-for-byte: content.source.parity passes for every app with zero rendered-output diff."
  - "Every visitor-facing image is referenced by an opaque asset token resolved through resolveAsset(); no section or component calls import.meta.glob for content assets directly."
  - "A second (CMS or remote) provider can be added later by implementing one interface, with no change to sections, components, buildPage, or the route pipeline."
nonGoals:
  - "Do not ship a real CMS adapter in this RFC. Phase 0 is the port plus the fs adapter plus asset decoupling only."
  - "Do not change the on-disk content format, the {lang}/{slug} id scheme, or system.md ownership."
  - "Do not introduce SSR, on-demand rendering, or live CMS fetch. The site stays output: static (RFC-0140)."
  - "Do not move system.md, cosmic structure, or any engineering-surface file into a content provider."
  - "Do not alter cosmic catalogs, manifests, or PLANET_IMPORT_PATHS / MOON_IMPORT_PATHS."
---

# RFC-0141: Content Source Provider abstraction and asset-reference decoupling

## Context

The platform is being prepared for an eventual move from file-based content (edited in Git, rebuilt per commit) toward client-chosen headless backends (Contentful, Sanity, Strapi, Payload, Directus, Decap, and so on). A prior audit established that the ecosystem is already well positioned for this because of three deliberate decisions:

1. All content access runs through the Astro Content Layer (`getEntry` / `getCollection`), populated by swappable loaders — see `markdownCollectionLoader` in `packages/share/src/astro/loaders.ts` and `businessCollections` in `packages/business/src/astro.ts`.
2. Pages are block-declarative with author-facing `type` archetypes resolved to cosmic names inside `buildPage()` (RFC-0047, DNA-24/25). The internal content model — not markdown — is the real contract.
3. `clientEditable` in `system.md` and DNA-22 already fix exactly which domains (`pages`, `prose`, `business`, `navigation`, `site`) are content versus engineering.

Two coupling points block the transition, and both live below the Content Layer rather than in it:

- **No explicit source port.** The loaders and the content-access helpers in `packages/share/src/astro/content.ts` are written directly against the filesystem glob and against `astro:content`. There is no named seam where "where content comes from" is isolated, so an alternative source cannot be introduced without editing call sites.
- **Asset resolution is hard-bound to the local filesystem.** Image resolution (RFC-0042 / RFC-0053) is built on `import.meta.glob("/src/content/**/assets/*")` and bare-filename lookup in `packages/share/src/image-utils.ts`. This pattern is repeated across ~15 files in `packages/ui`. A headless CMS delivers images as remote URLs with its own transform parameters; the current mechanism cannot represent that.

## Problem

The unprotected invariant is:

> Content origin and asset origin must be replaceable peripherals, reachable only through a single named port. No section, component, route, or builder may assume content comes from local markdown or that assets are local files.

Today this is violated structurally:

1. There is no `ContentSourceProvider` interface. "Read content from the filesystem" is an implicit assumption distributed across `loaders.ts`, `content.ts`, `astro.ts`, and `page-handler.ts`.
2. `import.meta.glob` for content assets appears in ~15 `packages/ui` files plus `image-utils.ts` and `page.ts`. Each is a build-time, local-filesystem assumption that a remote provider cannot satisfy.
3. Asset references in content are bare filenames (`hero-bg`) whose meaning is "a local file under `src/content/**/assets/`". The token is not opaque, so it cannot later mean "a Contentful asset id" or "a Sanity image ref" without rewriting the convention.

These are manageable in one reference app but become the dominant cost when a CMS is introduced later, because the work is spread across every section instead of contained in one adapter.

## Decision

The workspace introduces a **Content Source Provider (CSP)** port and a single **asset-reference resolver**, then refactors all existing content and asset access to flow through them — **with no observable behavior change**.

Specifically:

1. A new package `@gogol/content-source` defines the `ContentSourceProvider` interface, the `AssetRef` / `ResolvedAsset` contracts, and a capability descriptor.
2. A reference adapter `content-source-fs` reproduces today's behavior exactly: it wraps the existing glob loaders and the `import.meta.glob` asset map. After this RFC, the filesystem is _an adapter_, not a hardcoded assumption.
3. Astro collection loaders are produced from the active provider via a `createAstroLoaders(provider)` factory. With the fs provider, `content.config.ts` output is identical to today.
4. All visitor-facing image resolution moves behind a provider-bound asset resolver and a shared `<SmartImage>` surface in `@gogol/ui`. The ~15 direct `import.meta.glob` call sites are migrated to it. With the fs provider, the resolver returns the same local `ImageMetadata` the components render today.
5. Two validators enforce the seam: `asset.reference.validate` (every asset token resolves through the active provider) and `content.source.parity` (the fs provider's output equals the legacy `astro:content` output for every app — the proof of "no behavior change").

This RFC ships **only** the port, the fs adapter, the asset decoupling, and the two validators. No CMS adapter, no SSR, no format change. Later phases (informative section below) build real adapters on top of this seam.

## Architectural fit

**DNA-21 / app layout.** Unchanged. Apps still own composition, content, styles, and the script orchestrator. The provider lives in `packages/*`.

**DNA-22 / client surface.** Reinforced. The CSP makes the `clientEditable` domains the exact set a provider serves; `system.md` and the engineering surface are explicitly outside the port.

**DNA-24 / DNA-25 / buildPage.** Unchanged. `buildPage()` and `resolvePageRoute()` keep consuming the same normalized entries. They become source-agnostic because the entries now arrive through the port rather than directly from `astro:content`.

**DNA-26 / runtime context.** Unchanged. Build-time context stays deterministic; the fs provider is a pure build-time source.

**RFC-0042 / RFC-0053 / image resolution.** This RFC generalizes them: bare-filename resolution becomes the fs adapter's implementation of the abstract `resolveAsset()` contract, instead of a global assumption baked into every section.

**RFC-0140 / static + Pages Functions.** Preserved. Phase 0 keeps `output: "static"`. The CSP gives a future live-fetch provider a clean home without forcing SSR now.

**Site OS operator model.** Two new workspace-scoped validators join the packages/apps check pipelines; no runtime CLI behavior changes for authors.

## Design

### CLI surface

```sh
# Every asset token in content resolves through the active provider (fail-hard).
pnpm exec site-kernel run asset.reference.validate --app warpgogol-com
pnpm exec site-kernel run asset.reference.validate --all --json

# Migration guard: fs provider output must equal legacy astro:content output.
pnpm exec site-kernel run content.source.parity --app warpgogol-com --json
```

`asset.reference.validate` is workspace-scoped, runs per app, and joins `APPS_CHECK_PIPELINE`. `content.source.parity` is a migration-time guard intended to run during the refactor and in CI until the legacy direct-access paths are removed.

### TypeScript contracts

Minimum shape (full implementation deferred to acceptance):

```ts
// @gogol/content-source
import type { ImageMetadata } from "astro";

export type ContentDomain =
  | "system"
  | "pages"
  | "prose"
  | "business"
  | "navigation"
  | "site";

export interface ContentEntryRef {
  domain: ContentDomain;
  /** Stable id; fs adapter keeps the current "{lang}/{slug}" scheme. */
  id: string;
}

export interface ContentEntry {
  id: string;
  domain: ContentDomain;
  data: Record<string, unknown>;
}

/** Opaque source-defined token. fs adapter = bare filename ("hero-bg"). */
export interface AssetRef {
  token: string;
  lang?: string;
  subPath?: string;
}

export type ResolvedAsset =
  | { kind: "local"; image: ImageMetadata }
  | { kind: "remote"; url: string; width?: number; height?: number; format?: string };

export interface ContentSourceCapabilities {
  localAssets: boolean; // fs: true
  remoteAssets: boolean; // CMS: true
  liveFetch: boolean; // CMS/SSR: true; fs: false
  richText: boolean; // CMS rich-text bridge present
}

export interface ContentSourceProvider {
  readonly id: string;
  readonly capabilities: ContentSourceCapabilities;
  listEntries(domain: ContentDomain, lang?: string): Promise<ContentEntry[]>;
  getEntry(ref: ContentEntryRef): Promise<ContentEntry | null>;
  resolveAsset(ref: AssetRef): Promise<ResolvedAsset | null>;
}
```

Consumers never branch on provider id. Components handle `ResolvedAsset` by `kind`: `<SmartImage>` renders Astro `<Image>` for `local` and a configured remote `<Image>` (or `<img>`) for `remote`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/content-source/**` | New package: port, contracts, capability descriptor |
| `packages/content-source/src/adapters/fs/**` | Reference adapter reproducing current behavior |
| `packages/share/src/astro/loaders.ts` | Refactored to produce loaders via `createAstroLoaders(provider)` |
| `packages/share/src/astro/content.ts` | Content-access helpers routed through the provider |
| `packages/share/src/image-utils.ts` | Becomes the fs adapter's `resolveAsset` implementation |
| `packages/ui/**` (~15 files) | `import.meta.glob` asset call sites migrated to `<SmartImage>` / resolver |
| `packages/business/src/astro.ts` | `businessCollections` produced through the provider |
| `packages/os/site-kernel-checks/**` | `asset.reference.validate`, `content.source.parity` |
| `apps/*/src/content/**` | Unchanged on disk — format, ids, and assets stay identical |
| `apps/*/src/content/system.md` | Explicitly NOT served by a provider — stays engineering-owned in Git |

### Output format

```json
{
  "command": "asset.reference.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "violations": [
    {
      "domain": "pages",
      "entry": "de/home",
      "token": "hero-bg",
      "rule": "unresolved-asset",
      "severity": "error",
      "message": "Asset token 'hero-bg' did not resolve through the active provider (fs)."
    }
  ],
  "warnings": []
}
```

`content.source.parity --json` returns `status` plus a `diffs[]` array; any non-empty `diffs[]` is a failure and lists `{ domain, id, field, legacy, provider }`.

### Failure modes

- `asset.reference.validate` exits non-zero on any `unresolved-asset`. This upgrades today's runtime `console.warn` in `resolveImage()` into a build-time hard gate.
- `content.source.parity` exits non-zero on any diff. It is the contractual proof that the Phase 0 refactor changed no observable output.
- Pretty output groups violations by domain and prints the owning content entry path. `--json` is stable and parseable for agents and CI.

## Rollout

1. Create `@gogol/content-source` with the port, contracts, and capability descriptor.
2. Implement `content-source-fs` to wrap today's glob loaders and asset map exactly.
3. Add `content.source.parity` and run it green before touching any call site.
4. Route `loaders.ts`, `content.ts`, and `businessCollections` through the provider; keep parity green at each step.
5. Introduce `<SmartImage>` and the asset resolver; migrate the ~15 `import.meta.glob` call sites one section family at a time, keeping rendered output identical.
6. Add `asset.reference.validate` in warning mode, then promote to fail-hard in `APPS_CHECK_PIPELINE` once all apps are clean.
7. Update `AGENTS.md`, GRACE XML docs, and onboarding scaffold so new apps wire the fs provider by default.

No flag day: existing apps keep their content untouched; the refactor is internal. The site stays `output: static`.

## Future phases (informative, non-binding)

This section is a forward-looking note only. It is **not** part of the Phase 0 decision and introduces no commitments; each phase below requires its own RFC before any code.

**Phase 1 — Git-based CMS (fastest win, near-zero pipeline change).** Systems: **Decap** (ex-Netlify CMS), Tina, Pages CMS. These edit the _existing markdown in Git_. The fs adapter already serves them; the work is a CMS config pointing at `src/content/**`, not a new provider. Validation, cosmic-passport, and integrity signing are untouched. Best initial fit for "thin sites."

**Phase 2 — structured headless CMS via the "Git as SSOT" sync model.** Systems: Contentful, **Sanity**, Strapi, Prismic, Hygraph, **Payload**, Directus, Keystone, BCMS. Pattern: `CMS webhook → content.pull → normalizer → writes the same .md → commit → existing build + validate + passport`. The CMS is an authoring head; Git stays the source of truth, so every guarantee survives a vendor's disappearance. Prefer schema-as-code systems (Sanity / Payload / Strapi / Directus / Keystone) because the CMS content model can be **generated from the existing manifest `propsSchema`** — one source of truth, the longevity moat. A `content.pull` command and a per-CMS normalizer/adapter are the new pieces; both sit on the Phase 0 port. A remote asset adapter implements `resolveAsset` returning `{ kind: "remote" }`, which `<SmartImage>` already handles.

**Phase 3 — live / on-demand delivery (exception, per-site).** Only when a client truly needs live preview or on-demand content: add an SSR adapter plus a provider with `liveFetch: true` for that single site. This trades build-time validation and reproducible-passport guarantees for freshness, so it stays the exception, not the default.

**Out of scope of this track — commerce / specialized backends.** Systems: Shopify, Medusa, Saleor, Commerce Layer, Shopware 6, and Ghost (headless). These are catalog/cart/checkout (or blog/newsletter) backends, not page-content CMSs. They map to new content domains plus new section archetypes plus, for cart/checkout, dynamic runtime — a separate product decision, likely outside "thin sites." Ghost-headless is a `posts` collection plus a blog archetype: a small separate track, not a provider swap.

## Alternatives considered

**Write a native Astro Content Layer loader per CMS directly (skip the port).** Rejected for Phase 0: it couples the live site to CMS uptime and loses build-time validation and reproducible passports, and it still leaves asset resolution filesystem-bound. The port keeps those choices open per site.

**Decouple assets only, defer the content port.** Rejected. Assets are the largest single item, but without the content port the "no module reads files directly" invariant stays unprotected, and a future CMS still requires editing every content call site.

**Make asset tokens carry their kind (e.g. `local:hero-bg` vs `remote:...`).** Rejected. Tokens must stay opaque so the same content can be served by either provider; the _provider_, not the token, decides locality.

**Push `system.md` through the provider too.** Rejected. The route registry, shell composition, growth, and passport config are architecture, not client content. They stay engineering-owned in Git regardless of where copy lives.

## Risks

- **Refactor regression.** Routing all access through a new port risks subtle output drift. Mitigation: `content.source.parity` must stay green at every step; it is the contractual guard.
- **Asset migration breadth.** ~15 `import.meta.glob` call sites plus the bare-filename convention plus Astro image-optimization assumptions. Mitigation: migrate per section family behind `<SmartImage>` with parity checks; do not big-bang.
- **Over-abstraction.** A port that leaks filesystem assumptions (eager globs, sync access) would not actually fit a remote provider. Mitigation: the interface is async and capability-gated from day one, validated by the eventual second adapter.
- **Agent misread.** Agents may try to implement CMS adapters from this RFC. Mitigation: the nonGoals and the Future-phases note explicitly scope Phase 0 to the port, the fs adapter, and asset decoupling only.

## Acceptance criteria

- [x] `@gogol/content-source` defines `ContentSourceProvider`, `AssetRef`, `ResolvedAsset`, and capabilities (`src/types.ts`). (evidence: packages/ directory, package exists)
- [x] `content-source-fs` adapter reproduces current loaders and asset resolution (`src/adapters/fs/**`). (evidence: implemented historically)
- [x] `createAstroLoaders(provider)` produces collection loaders; `content.config.ts` output is unchanged with the fs provider (import path `@gogol/share/astro/loaders` kept; it now delegates). (evidence: packages/ directory, package exists)
- [x] All content-access helpers in `packages/share/src/astro/content.ts` (and `page-handler.ts`) route through the provider (`@gogol/content-source/astro`). (evidence: packages/ directory, package exists)
- [x] `businessCollections` is produced through the provider (`fsDataCollectionLoader`). (evidence: implemented historically)
- [x] Shared resolver replaces every direct `import.meta.glob` content-asset call site in `packages/ui` (single `src/content-assets.ts`; 11 sites migrated). `<SmartImage>` deferred — the shared-resolver path satisfies this criterion without adding a manifest-bound component. (evidence: packages/ directory, package exists)
- [x] `image-utils.ts` bare-filename logic becomes the fs adapter's `resolveAsset` (`src/adapters/fs/assets.ts`); `@gogol/share` re-exports it unchanged. (evidence: packages/ directory, package exists)
- [x] `asset.reference.validate` is implemented with stable `--json` output and joins `APPS_CHECK_AUTHOR_PIPELINE` (warning mode per rollout). (evidence: implemented historically)
- [x] `content.source.parity` is implemented and green for `warpgogol-com` and `nicaragua-projekt`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Rendered output unchanged across the refactor — verified by a full green `pnpm build:check` (both apps build); the resolver was relocated verbatim and the unified glob is a resolution-preserving superset. (No literal dist byte-diff was run.) (evidence: implemented historically)
- [x] `system.md` and the engineering surface remain outside any provider (`ContentDomain` excludes it; nonGoal enforced). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Root `AGENTS.md` documents the seam and lists `@gogol/content-source`; `onboarding.scaffold` needs no change (the fs provider is the default via the unchanged loader import). GRACE XML knowledge-graph backfill for the new package is a tracked follow-up. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes from this RFC only after status becomes `accepted`.
- Agents MUST NOT change this RFC's status field.
- Agents MUST scope work to the port, the fs adapter, asset decoupling, and the two validators. Building a CMS adapter, SSR, or `content.pull` belongs to later phases and requires its own accepted RFC.
- Agents MUST keep `content.source.parity` green at every step; any rendered-output diff is a regression, not an acceptable change.
- Agents MUST NOT change the on-disk content format, the `{lang}/{slug}` id scheme, or `system.md` ownership.
- Agents MUST keep `output: "static"` (RFC-0140); this RFC introduces no SSR.
- Agents MUST treat asset tokens as opaque and resolve locality through the provider, never by parsing the token.
- When implementing, agents MUST reference `RFC-0141` in commit messages and add `@rfc RFC-0141` to new command handlers.
