# @warpgogol/ui Agent Guide

Apply this guide when working in `packages/ui/**`.

## Purpose

- `@warpgogol/ui` owns shared UI primitives used across Warpgogol apps.
- LordIcon JSON sources and generated Astro icon components live here.
- Apps consume this package through `@warpgogol/ui` imports instead of app-local icon folders.

## Component contract

- Every component under `packages/ui/src/components/<slug>/` MUST have a colocated manifest file.
- The manifest filename MUST match the component slug and repository naming convention: prefer `<slug>-component.manifest.yaml`; keep legacy names only when the directory already participates in an older validated contract.
- The folder is incomplete until it contains, at minimum, the authored `.astro` file and its `.manifest.yaml`.
- The manifest MUST declare a valid component-layer contract: `id`, `uniName`, `layer: component`, `semanticId`, `archetype`, `cosmicName`, `role`, `version`, `intent`, `industryFit`, and `contentSchemaKey` when applicable.
- `cosmicName` MUST be a unique `MoonCatalog` value and MUST NOT reuse the five passport-reserved names.
- `role` MUST be one of the closed `ComponentRoleValues` from `@warpgogol/ontology`; do not invent ad-hoc roles in component manifests.
- If the component is shell-invoked via `system.md pages[].shell.*`, register its `cosmicName` in `MOON_IMPORT_PATHS` in `packages/share/src/page.ts` in the same change.
- AI agents MUST treat a new component without its manifest as an incomplete change and add the manifest before considering the task done.
- Header desktop navigation must preserve readable full labels. When labels do not fit, keep the adaptive overflow disclosure in the shared header component rather than truncating every label or adding app-local header overrides.
- **Prop propagation across composing components:** When adding or changing a prop on a component that is rendered by another component (e.g. `nachweis-card` rendered by `nachweis-list` and `nachweis-detail`), update the prop interface in ALL composing components. Components that spread props (`{...record}`) silently accept new fields but components that pass props explicitly (`slug={slug} ...`) silently drop them. Always check both patterns when modifying a component's Props interface.

## Section archetype contract (RFC-0072)

Every section under `packages/ui/src/sections/<slug>/` MUST:

- Have `<slug>-section.manifest.yaml` with required field `archetype: <id>` whose value resolves to an entry in `packages/ontology/archetypes/sections/<id>.yaml`.
- Carry a `cosmicName` listed in the archetype's `acceptedCosmicNames`. The picker `cosmic.name.pick` chooses a free name during `section.scaffold`; do not hand-pick.
- Have colocated `<slug>-section.types.ts` exporting the TypeScript prop shape consumed by the `.astro` template. The **runtime contract** is the JSON Schema composed from the manifest's `propsSchemaCompose` plus inline `propsSchema` — evaluated by `page.block.validate` against authored page blocks. There is **no** sidecar `*.props.schema.ts` Zod file: it was retired by RFC-0123 because the manifest is the single source of truth (RFC-0110 / RFC-0119).
- Have colocated `<slug>.css` using only `--ds-*` tokens (no raw colors / sizes; enforced by `tokens.colors.lint` + `tokens.ds.lint`; section-framework primitives additionally enforced by `tokens.colors.section-shell.lint` per RFC-0122).
- **Use `main > section:first-of-type`, never `main > :first-child`** in CSS rules targeting the first section. Astro dev mode injects `<script>` tags as the first child of `<main>`; `:first-child` matches the script tag instead of the section, breaking header-offset and min-height rules.
- Have `<slug>-section.story.md` with at least one realistic props example.

`section.contract.validate` enforces these in `PACKAGES_CHECK_PIPELINE`. Detect near-duplicates with `section.similarity.report`.

**New sections are materialized only by `section.scaffold`.** Never copy a sibling section folder; the scaffold command guarantees the file set, the manifest fields, the `propsSchemaCompose` wiring, and the import-paths registration in `@warpgogol/share/src/page.ts` `PLANET_IMPORT_PATHS`.

**Structural UI labels must use optional label props with fallbacks for i18n.** Shared sections that render structural UI text (e.g. `<dt>` labels in metadata blocks, `aria-label` on `<nav>`) MUST NOT hardcode English strings. Instead, add optional label props (e.g. `versionLabel`, `linksLabel`) to the archetype `propsSchema` and manifest `propsSchema`, and use the `props.<label> ?? "English fallback"` pattern in the `.astro` template. This lets content authors override labels per-block for localization without requiring a full site-labels lookup. Discovered during RFC-0759 code review (finding E-1).

## Canonical structure

```text
packages/ui/
├── src/
│   ├── assets/icons/lordicon/         # Canonical JSON sources
│   ├── icons/
│   │   ├── gen/lordicon/              # Generated Astro components and set index files
│   │   ├── lord-icon-base.astro       # Shared runtime wrapper
│   │   ├── lord-icon-types.ts         # Shared types
│   │   └── index.ts                   # Icons entrypoint
│   └── index.ts                       # Package entrypoint
├── README.md
└── package.json
```

## Usage

### Open-source registry security rule

- **Never display exact dependency versions on public open-source pages.** Showing exact version numbers exposes the deployment to targeted attacks against known vulnerabilities in specific package versions. Version data remains in the downloadable SBOM (`sbom.cdx.json`) for those who need it. The component table shows package name, license, scope, and source link only.
- RFC-0634: The open-source registry section reads `build-identity.json` locally via `readFileSync(join(process.cwd(), "public", ".well-known", "build-identity.json"))` at build time, not via runtime `fetch(Astro.url.origin)`. This ensures each channel's prerendered HTML embeds its own deployment metadata. Use `process.cwd()` (not `import.meta.url`) for path resolution because the component lives in `packages/ui` but `public/` is in the workpiece root.
- RFC-0743: The `price-card` section reads `src/derived-prices.generated.json` from `process.cwd()` at build time when an `offeringRef` prop is present. This file is generated by `derived-prices.materialize` (RFC-0740) and is gitignored. Sites without multi-currency pricing do not produce this file; the section silently degrades to single-currency display (ENOENT returns null). The file shape is `Record<offeringRef, DerivedPriceEntry[]>` where each entry has `chargeRef`, `targetCurrency`, `amount.{value,currency}`, and `trace.{source,rate}`.

### Generated icons (new pattern — RFC-0016)

```astro
---
import { ArrowUpIcon, UserProfileIcon } from "@warpgogol/ui/icons";
---
<ArrowUpIcon size={24} color="primary" trigger="hover" />
```

## Generation workflow

Regenerate derived icon components after changing JSON sources:

```bash
rtk pnpm exec site-kernel run icons.generate
```

The command:

1. Reads JSON files from `packages/ui/src/assets/icons/lordicon/`
2. Writes Astro components to `packages/ui/src/icons/gen/lordicon/`
3. Rebuilds per-set `index.ts` export files
4. Rebuilds master `index.ts` at `packages/ui/src/icons/index.ts` (RFC-0016)

The command is registered at the workspace level in the repository root `tools/kernel.config.ts`.

## List-based section content contract (RFC-0100)

RFC-0100 standardizes authored list-item shapes across all shared list-based sections.

### Canonical types (from `@warpgogol/ui`)

```ts
interface VendorIconConfig {
  vendor: string;      // e.g., "lordicon"
  collection: string;  // e.g., "doodle-outline"
  name: string;        // e.g., "GlobeHover"
  size?: number;       // Defaults to 24 if omitted
}

interface StandardListItem {
  text: string;
  icon?: VendorIconConfig;
}
```

### Section authoring rules

- All list-based sections consume `StandardListItem[]`, never `string[]`.
- Icons are configured per-item via `item.icon`; no section-level fallback props.
- Default icon size is `24` when `icon.size` is absent.
- Icon + text rows use `align-items: center` for vertical alignment.
- No legacy string-only item support; no backward compatibility layer.

### Affected sections (RFC-0100 + RFC-0103 migrated)

The list-item contract is consumed by every body.kind: list / split-list section, and remains as a sub-shape inside `price-card.includes`.

## RFC-0101..0107 section framework (current architecture)

Every shared section MUST be a thin dispatcher composed of canonical primitives:

```
<SectionShell> → <SectionHeader>? → <SectionBody.{list|split-list|stats|cards|paragraphs|comparison|rich}> → <SectionCta(Group)>?
```

Composite archetypes (hero, hero-decision-card, people, donation-card, price-card, faq-list, markdown) wrap their bespoke layout inside `<SectionShell>` and consume `<SectionHeader>`, `<SectionCta>`, `<SectionImage>`, and effect-aware hosts internally.

### Visual contract (RFC-0101)

- `background: SectionBackground` — discriminated union `kind: color | image | texture | transparent | fade` (only `vertical | horizontal` directions for fade).
- `effects: EffectAssignment[]` — composable visual effect assignments consumed by `<SectionShell>` and explicit effect hosts.
- `density: compact | normal | spacious`.
- `tone: default | warning | success | muted`.
- `containerVariant` controls the content measure only; no value may make section content span the full viewport on wide screens. `full` means the widest platform container (`--ds-size-container-max`), while shell backgrounds may still paint edge-to-edge.
- All colours resolve through `--ds-*` biome tokens; no raw hex/rgb in section CSS.

### Header contract (RFC-0102)

- `header.heading` is either a string or an array of `{ text, tone }` segments (tones: default / primary / accent / muted / inverse).
- `header.eyebrow` is an optional short contextual label rendered above the heading (RFC-0567).
- `header.align` and `body.align` are independent.
- `header.subheading` is one short line of context; longer text belongs in `body.kind: paragraphs`.

### Body contract (RFC-0103)

- One of seven `body.kind` values, dispatched to the matching `<SectionBody-{kind}>` component.
- `body-list` / `body-split-list` / `body-cards` / `body-stats` provide the canonical row / card / stat shapes (RFC-0110 catalog).

### CTA + image contract (RFC-0104)

- CTAs are `CtaConfig` with discriminated `target.kind: internal | external | anchor`.
- **CTA alignment MUST follow `header.align`.** When a section renders an inline CTA (not via `<SectionCtaGroup>`), wrap the `<a>` in a `<div class="...__cta-wrap--align-{left,center,right}">` that applies `text-align` to center or right-align the CTA when the header is centered or right-aligned. The `ctaAlign` variable in the `.astro` frontmatter reads `props.header?.align` with the section's default fallback. Never render a bare `<a>` CTA without an alignment wrapper.
- Authored images flow through `<SectionImage>` with `fade` as a property of the image, not the section. `<SectionImage>` — and every other image-bearing component — renders via `<ResponsiveImage>` (RFC-0152, see below), never a raw `<img>`/Astro `<Image>`.

### Site background (RFC-0105)

- Full-viewport background is a shell-layer block (`<SiteBackground>`), not a section. At most one per page.
- Section `background.kind: transparent` lets the site background show through.

### Motion (RFC-0106)

- Sections opt into reveal / parallax / stagger via `motion` on `<SectionShell>`. The biome `motionStance` is the upper bound; pages may downgrade but never override upward.
- GSAP scripts load via `runStandardLayoutOrchestration` opt-ins; `kernel.wire` generates the flags based on the composed pages.

### Manifest composition (RFC-0103 + RFC-0107)

Section manifests stop carrying duplicate visual / header / body JSON Schema. They compose canonical fragments instead:

```yaml
propsSchemaCompose:
  - section-visual
  - section-header
  - body-list
```

The fragments live in `packages/ontology/src/shared-section-props/` and merge into one strict JSON Schema at validation time. Nine fragments are available (per RFC-0110):

- `section-visual` — RFC-0101 visual modifiers (background, glass, density, tone, containerVariant, motion).
- `section-header` — RFC-0102 header (tone-segmented heading + eyebrow + subheading + align + level).
- `body-list` / `body-split-list` / `body-stats` / `body-cards` / `body-paragraphs` / `body-comparison` / `body-rich` — RFC-0103 body kinds, one per non-composite archetype.

Composite archetypes (hero, hero-decision-card, people, donation-card, price-card, faq-list, markdown) compose only `section-visual` + `section-header` and declare their bespoke fields locally.

### Schema enforcement

Section props schemas must declare explicit Zod contracts using the reusable fragments:

```ts
const VendorIconConfigSchema = z.object({
  vendor: z.string(),
  collection: z.string(),
  name: z.string(),
  size: z.number().optional(),
});

const StandardListItemSchema = z.object({
  text: z.string(),
  icon: VendorIconConfigSchema.optional(),
});
```

Passthrough-only schemas are prohibited for sections with owned authored surfaces.

## Image rendering — Image Provider Port (RFC-0152)

`<ResponsiveImage>` (`src/components/responsive-image/responsive-image.astro`) is the **canonical primitive for every authored image**. It takes a resolved descriptor (Astro `ImageMetadata` is assignable — i.e. the output of `resolveImage`) plus presentation props, and asks the active **Image Provider** (`@warpgogol/share`) to build `src` + `srcset`. It owns no optimization logic, so the backend swaps by provider/config without touching any component — which is what makes the same primitive serve in-repo assets today and headless-CMS/DAM URLs later.

```astro
---
import ResponsiveImage from "@warpgogol/ui/components/responsive-image.astro";
import { resolveImage } from "@warpgogol/share";
const image = resolveImage(images, imageName, { lang });
---
{image && (
  <ResponsiveImage image={image} alt={alt} class="…" loading="lazy" quality="max" />
)}
```

- **Default provider:** `cloudflareRuntimeProvider`. **Safe by default** it serves the raw origin asset (always 200, no resize, no `srcset`). Set `PUBLIC_CF_IMAGE_TRANSFORM=on` (only after enabling Cloudflare Image Transformations on the zone) to emit `/cdn-cgi/image/onerror=redirect,width=…,quality=…,format=webp/<origin>` URLs with a responsive, no-upscale `srcset`. ⚠️ `/cdn-cgi/image` URLs **404** on a zone without Transformations enabled — there is no `onerror` fallback for the feature-off case, so never force them on unconditionally.
- **RFC-0204 build-portable provider:** for apps on zones WITHOUT Cloudflare Image Transformations, set `PUBLIC_IMAGE_PROVIDER=build-portable` in `.env` + `.env.production`. Width variants are pre-generated by `image.variants.generate` (in `build.prepare`) using `sharp` into `public/_img/<name>/<width>.webp`; the manifest `src/image-variants.generated.json` is loaded at build time by `packages/ui/src/image-provider-init.ts` (imported as a side effect from `content-assets.ts`) and installs `createBuildPortableProvider(manifest)` as the active provider. Result: every `<ResponsiveImage>` (and `<LivePhoto>`) emits a real, responsive `srcset` without needing Cloudflare Image Transformations. Both generated artifacts are gitignored — run `image.variants.generate` in every build.
- **Adapter wiring (RFC-0152, amends RFC-0149):** apps set `imageService: "cloudflare"` in the generated `astro.config.mjs`. `"custom"` + build-time sharp is forbidden under `@astrojs/cloudflare` — it reads originals from `dist/_astro` while the adapter emits them to `dist/client/_astro`, producing the `generating optimized images` ENOENT.
- **RFC-0210 unified media contract:** there is ONE media primitive — `<Media>` (`components/media/media.astro`) — and ONE playback contract (HLS-first → MP4 → optional WebM; native-only for decorative loops). Three profiles: `feature` (content video, controls, lazy Plyr + hls.js, captions), `background` (muted loop bg), `ambient` (living photo, RFC-0202, delegated to `<LivePhoto>`). Never drop a raw `<video>` in a section, add a second resolver, or a parallel runtime. Media is addressed by a token resolved **by directory language** — NOT a `-<lang>` filename suffix. **Feature/background SOURCE masters live in the non-bundled `src/content/<domain>/<lang>/media/<name>.{mp4,webm}` folder** (NOT `assets/`): the eager `contentAssetVideos` glob only matches `assets/**`, so `media/` masters are never emitted to `_astro` (a multi-hundred-MB master would exceed Cloudflare's 25 MiB per-asset limit). `<Media>` resolves their derived URLs purely through the manifest (`getVideoEntryByToken`). Ambient living-photo clips stay in `assets/` (small, served via the glob). `assets/` masters still work via the `video.dist.prune` build.post backstop, but `media/` is canonical. Delivery formats (HLS/MP4/WebM/poster) are derived at build time by `video.variants.generate` (ffmpeg, content-addressed `.cache/video`) into `public/_video/` and described by `src/video-manifest.generated.json` (loaded by `video-manifest.ts`); all three are gitignored. Player JS is lazy/click-to-load via the `videoPlayers` orchestrator option, gated on `[data-video-player]` — ambient/background ship zero player JS. Feature video with prerecorded speech needs captions (WCAG 1.2.2).

**Agent rules:**

- Render authored images **only** through `<ResponsiveImage>`. Do not introduce raw `<img>` (except genuinely non-resizable sources — SVG logos, `data:` URLs like the donation QR) or Astro `<Image>`/`astro:assets`.
- Do not hand-write `srcset` or `/cdn-cgi/image` URLs, and do not build a custom resizer. Add/replace an `ImageProvider` in `@warpgogol/share` and select it via `setDefaultImageProvider` instead (RFC-0152).
- Do NOT initialize the build-portable provider manually in app code — `packages/ui/src/image-provider-init.ts` handles it as a side effect of `content-assets.ts`. Do NOT run `sharp` outside `image.variants.generate`.
- Pass `quality` as a preset (`low|mid|high|max`) or a number; the provider resolves it (Cloudflare requires a numeric value).
- Deployment / "why are images 404 / how to enable resize" lives in `docs/engineering/image-optimization-and-cloudflare-transformations.md`.

### Lead/content image → image sitemap (RFC-0172)

The page's **single lead/content illustration** must be marked so the post-build image-sitemap harvester (`dist.sitemap.images.generate`) can collect its render-resolved URL:

- Pass `data-content-image` to the `<ResponsiveImage>` that renders the lead image. The hero does this for its `leadImage` (NOT for the decorative `backgroundImage`, and NOT for the legacy `portraitImage`/`hero-1` fallback).
- **Exactly one** `data-content-image` element per page. A new lead-bearing archetype (e.g. `article-detail`) sets the **same** attribute — never invent a parallel mechanism.
- Never mark RFC-0150 preview screenshots (`/preview/*.png`) or decorative backgrounds. Authored absolute content images (`output.image`) flow through the `x-content-image` head meta emitted by `<SocialMeta>`; do not double-mark.
- The build is the only authority on the final hashed URL — never reconstruct `/_astro` or `/cdn-cgi/image` URLs anywhere.

## Public import contract

- `@warpgogol/ui` — Package entrypoint (re-exports `VendorIconConfig`, `StandardListItem`)
- `@warpgogol/ui/icons` — **Barrel export of all icons (RFC-0016, recommended)**
- `@warpgogol/ui/icons/lordicon/doodle-outline` — Per-set exports (legacy)
- `@warpgogol/ui/icons/lordicon/doodle-color` — Per-set exports (legacy)
- `@warpgogol/ui/icons/lordicon/doodle-black` — Per-set exports (legacy)
- `@warpgogol/ui/icons/lordicon/system-regular` — Per-set exports (legacy)
- `@warpgogol/ui/icons/lord-icon-base` — Base component
- `@warpgogol/ui/icons/lord-icon-types` — Type definitions

## Agent rules

- Do not create or restore icon source folders inside `apps/*`.
- Do not hand-edit generated files under `src/icons/gen/**`.
- Treat `src/assets/icons/lordicon/**` as the canonical editable source of LordIcon data.
- Keep examples and docs in English.
- If exports or folder layout change, update `package.json`, `README.md`, and any affected AGENTS/Compass docs in the same change.
- When authoring list-based sections, always use `StandardListItem[]` and never `string[]` or section-level icon fallbacks (RFC-0100).
- When programmatically triggering LordIcon animations, use `readyPromise` + `playerInstance.playFromStart()`, NOT a non-existent `.play()` method. The `lord-icon` custom element exposes `ready: boolean`, `readyPromise: Promise<void>`, and `playerInstance` (with `playFromStart()` and `playing`). The old `typeof el.play === "function"` pattern silently fails — `play()` does not exist on the element.
- Render authored images only through `<ResponsiveImage>` (RFC-0152) — never raw `<img>` (except SVG/`data:`) or Astro `<Image>`. See "Image rendering — Image Provider Port".

## Growth layer rules (RFC-0027 / DNA-27..30)

**FORBIDDEN in all files under `packages/ui/src/`:**

- Direct calls to vendor analytics SDKs (`window.gtag(...)`, `window._paq.push(...)`, etc.) or importing from vendor packages directly.

**REQUIRED for event emission:**

- All user interaction events must use `emit()` from `@warpgogol/growth/emit`.
- Emit only event names from the closed `EventName` catalog (`packages/ontology/growth/events/`).
- Never include `locale` in the payload — it is injected automatically by `emit()`.

```typescript
import { emit } from "@warpgogol/growth/emit";
emit("cta-click", { label: "hero-donate", href: "/de/spenden-kontakt" });
```

## Component client scripts (RFC-0011 + RFC-0031)

Components that need client-side behavior colocate a `<name>.client.ts` next to the `.astro` file and load it via a native Astro `<script>` block.

**Preferred pattern (RFC-0031):**

```astro
<!-- src/components/<name>/<name>.astro -->
<script>
  import "./<name>.client";
</script>
```

```ts
// src/components/<name>/<name>.client.ts
function initFeature() { /* ... */ }
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFeature);
} else {
  initFeature();
}
```

**Permitted fallback (RFC-0009 Q-02):**

For zero-import vanilla-JS only, a `<script is:inline src="/scripts/components/<name>.js" defer>` inside the owning component is allowed. Use the `@client-script: required` directive on the component. Prefer `.client.ts` for all new work.

Rules:

- Component scripts MUST NOT be loaded from `layout.astro` (AP-18, RFC-0011 SP-01).
- Do not write bare `<script is:inline>` blocks with behavioural logic longer than 5 lines.

## Passport moon components (RFC-0028 / DNA-31..34)

The five PASSPORT-RESERVED moons are implemented here as Mirror Quintet components (`.astro` + `.css` + `.manifest.yaml`):

| Directory | Moon | Role |
| --- | --- | --- |
| `src/components/passport-header/` | Methone | Cosmic Passport header + badge |
| `src/components/passport-provenance/` | Bianca | Build provenance (commit, timestamp, builder, VC) |
| `src/components/passport-score-grid/` | Klarissa | Nebula Score pillar breakdown |
| `src/components/passport-star-map/` | Adrastea | Embedded `cosmic-star-map.svg` |
| `src/components/pulsar/` | Despina | Build freshness indicator |

**Agent rules for passport moons:**

- All five moons read `cosmic-passport.json` at SSG build time via `@warpgogol/passport/data`. Do not duplicate passport loading logic — always use `loadPassportData()`.
- `PassportHeader` (Methone) emits `passport-view`; `PassportStarMap` (Adrastea) emits `star-map-navigate`. Growth events are fired via `window.__warpgogol_emit__` in inline `<script>` blocks — not via direct `import { emit }` (the emit module is not available in inline client scripts).
- Never write a `<style>` block inside passport `.astro` files — all styles belong in the colocated `.css` file.
- Never inject `Date.now()` or random values into any path that feeds the `cosmic-star-map.svg` generation — the SVG must remain byte-stable.
- The `showVC` prop on Bianca is `false` by default; enable only for internal/dev builds.

## Legal translation notice (RFC-0174)

- `src/legal/translation-notice.astro` is platform legal chrome rendered by the shared layout for non-binding renders of legal documents. It is NOT a cosmic section/component (it lives outside `sections/`/`components/`, so it has no manifest by design).
- The mandatory language notice is **non-removable** while a locale is `unofficial`. NEVER delete the notice render in `layout-component.astro`, weaken `legal.translation.validate`, or strip the `translation` block from a legal page to quiet a check — fix the content/policy instead. The German (binding) version is the only legally binding text.

## Chat widget + inbound route (RFC-0175 / RFC-0176)

- `sections/chat-widget/` renders a **first-party** launcher only. The vendor (UChat) script is NEVER in server output — it is injected at runtime by `@warpgogol/chat/client` (`bindChatLauncher`) ONLY on the visitor's click (click-to-load). The section reads its binding from `system.md integrations.chat` via `getCollection("system")` and injects a PUBLIC `ChatWidgetConfig` blob; it carries the RFC-0177 legal notice + Privacy Policy link. Do not add a vendor `<script>`/iframe to the `.astro` and do not weaken `consent.activation.validate`.
- The integration surface is built from **section-owned** API routes, each declared in its section manifest's `api[]` block (so `api.routes.generate` emits the route + projects its secrets into the env schema):
  - `chat-widget/chat-widget-section.api.ts` → `/api/integration-inbound` (RFC-0176): authenticates (`INTEGRATION_INBOUND_SECRET`), validates the `IntegrationEvent`, and **publishes it to QStash** (`buildQstashPublish`, RFC-0181) for EU-resident delivery.
  - `chat-widget/chat-widget-section.delivery.api.ts` → `/api/integration-route` (RFC-0181): the QStash callback — verify signature (`@upstash/qstash` `Receiver`) · Redis dedup (`restRedisLedger`) · `deliverEvent()` · email via the Cloudflare Email Routing `send_email` binding.
  - `chat-widget/chat-widget-section.stripe-webhook.api.ts` → `/api/stripe-webhook` (RFC-0191): verify Stripe signature + map to an `IntegrationEvent` via `@warpgogol/integration-adapter-stripe`.
  - `send-message/send-message-section.api.ts` → `/api/send-message` (the in-process form source; also declares `/api/integration-route` so a form-only site still gets the callback).
- These are on-demand routes (`prerender = false`). `Astro.locals.runtime.env` throws in Astro v6 — read the `send_email` binding via `import { env } from "cloudflare:workers"`; all string secrets come from `astro:env/server`. **Do not** add Cloudflare Queue/KV bindings — `cloudflare.residency.validate` forbids them (delivery is Upstash, EU). Full reference: `docs/engineering/integration-hub-and-chat-widget.md` + `docs/specs/integration-delivery.md`.

## Internal shared modules

These are internal seams — not exported through `package.json` exports — that centralize patterns previously duplicated across section/component files:

- `src/generated-manifest-loader.ts` — shared loader for build-time generated JSON manifests (RFC-0204/RFC-0210/RFC-0234). Centralizes `import.meta.glob` + comment-strip + `JSON.parse` + warn. Used by `image-provider-init.ts`, `video-manifest.ts`, `live-video-manifest.ts`.
- `src/section-api-utils.ts` — shared `json()` response helper and `INTEGRATION_CALLBACK_PATH` constant for section-owned API routes. Used by `send-message-section.api.ts`, `integration-inbound.api.ts`, `stripe-webhook.api.ts`.
- `src/sections/markdown/prose-image-resolver.ts` — regex-based HTML image attribute manipulation and material-credit injection for rendered prose HTML.
- `src/sections/markdown/prose-pipeline.ts` — prose rendering decision tree (reference substitution → micromark, image-bearing → micromark + image resolution, plain → Astro render(), inline-number animation wrapping).

When adding a new generated manifest consumer, import `loadGeneratedManifest` from `generated-manifest-loader.ts` instead of duplicating the glob+parse pattern. When adding a new section API route, import `json` and `INTEGRATION_CALLBACK_PATH` from `section-api-utils.ts`.

## Section numbering (manifest-driven)

Section numbering is controlled by the `numbered` field in each section's manifest YAML:

- `numbered: false` in a manifest opts the section out of automatic numbering.
- `blocks-renderer.astro` discovers unnumbered sections dynamically at build time by scanning all `*.manifest.yaml` files — no hardcoded sets.
- To add a new unnumbered section, add `numbered: false` to its manifest. No renderer edit needed.
- **Auto-injected utility sections** (breadcrumbs, navigation, toc) MUST have `numbered: false`. These sections are inserted by the page pipeline (`injectBreadcrumbsBlock` in `packages/share/src/astro/page-handler/semantic.ts`), not authored in page content, so a missing `numbered: false` silently consumes a section number and pushes the first real content section to `02` without any visible breadcrumb number to explain the gap.

## Anchor link contract

- **Section `id` MUST be the bare `sectionId`** — never prefix with `sectionNumber` (e.g. `id="price-comparison"`, NOT `id="01-price-comparison"`). The `aria-labelledby` attribute already uses the `${sectionNumber}-${id}` pattern for ARIA uniqueness; the `id` attribute must NOT duplicate this prefix. Anchor links (`#price-comparison`) reference the bare `anchorId` and will fail to resolve if the `id` is prefixed.
- **`.section-shell` MUST have `scroll-margin-top: var(--ds-size-header-height, 80px)`** so that native scroll-to-anchor and CSS scroll-to-anchor respect the fixed header height. This is a CSS-level fix that works even without JavaScript.
- **`section-cta.astro` MUST handle `kind: "anchor"` explicitly** — it produces `href="#${target.anchor}"`. The CTA schema (`@warpgogol/share/schemas/section-cta`) expects the field name `anchor` (NOT `anchorId`) for `kind: anchor` targets. Content authors must use `anchor: send-message`, not `anchorId: send-message`.

## Consumer guidance

- App `tsconfig.json` files should map `@warpgogol/ui` to `../../packages/ui/src/index.ts` and `@warpgogol/ui/*` to `../../packages/ui/src/*`.

## Dynamic pricing in UI components

- **Price marker syntax (`{price:offering-id:chargeRef}`).** Parsed by `parsePriceMarkers` in `packages/ui/src/utils/price-marker.ts`. Resolves offering prices from `derived-prices.generated.json` and renders `CurrencyAwarePriceDisplay` with multi-currency variants. Used in `hero-decision-card` `decisionCard.items[].value` and other component text fields that support inline price display. This is a presentation-layer shorthand, not a content reference — do not migrate to `=(...)` formula syntax. See RFC-0743, ADR-0033.
- **Price markers `{price:offering-id:chargeRef}` are distinct from content references `{collection.file.field}`.** Price markers are resolved at render time by UI components (via `parsePriceMarkers`); content references are resolved at build time by the shared page handler. Do not confuse the two syntaxes. See RFC-0765 for the full content syntax reference.
- **When adding price marker parsing to a component, use the shared `parsePriceMarkers` utility** from `packages/ui/src/utils/price-marker.ts`. Do not duplicate the regex, `derivedPrices` lookup, or `buildPriceVariants` call inline — the utility centralizes the logic and prevents drift across components.
- **Components that render text fields from authored content (headings, subheadings, list item text, card descriptions, badges, stats values) MUST pass `lang` through to `parsePriceMarkers`** so that `CurrencyAwarePriceDisplay` renders the correct currency variant for the page language.
- **Inline CSS is required for price display inside text fields.** Add `display: inline` rules for `.currency-aware-price-display` and its children within the component's colocated CSS to prevent line breaks inside formatted prices.
