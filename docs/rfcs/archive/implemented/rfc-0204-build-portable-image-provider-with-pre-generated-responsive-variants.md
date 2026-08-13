---
id: RFC-0204
title: "Build-portable image provider with pre-generated responsive variants"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-18
updatedAt: 2026-06-18
implementedAt: 2026-06-18
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0152
amendedBy:
  - RFC-0376
  - RFC-0834
related:
  - RFC-0141
  - RFC-0149
  - RFC-0152
  - RFC-0078
  - RFC-0081
  - RFC-0087
commands:
  proposed: []
  added:
    - image.variants.generate
    - image.variants.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "On a zone WITHOUT Cloudflare Image Transformations, every authored image still renders a real responsive srcset; mobile downloads a width-appropriate variant (tens of KB), not the full-size origin."
  - "Lighthouse mobile performance for apps/* leaves the yellow zone: the Lantern-simulated LCP/TTI on /wir-ueber-uns drop from ~15s to the green band because total image transfer falls from ~2.7MB to a few hundred KB."
  - "Switching an app from cloudflare-runtime to build-portable is a config/env change plus a generated manifest — no section or component edits."
  - "No dependency on Astro astro:assets build-time image generation, so the RFC-0152 dist/_astro vs dist/client/_astro ENOENT failure cannot recur."
nonGoals:
  - "Do not run sharp or any resize in workerd at request time (RFC-0149) — variants are generated at build time only."
  - "Do not rely on Astro <Image>/getImage/astro:assets for variant generation — that path is the proven RFC-0152 build blocker and is explicitly avoided."
  - "Do not change where content assets live or the webp-only source policy — sources stay in-repo at max quality."
  - "Do not remove or weaken the default cloudflare-runtime provider — build-portable is an additional, selectable provider."
  - "Do not commit derived variants to git — they are build artifacts regenerated deterministically."
---

# RFC-0204: Build-portable image provider with pre-generated responsive variants

## Context

- RFC-0152 introduced the Image Provider Port (`@gogol/share/image-provider.ts`) with `cloudflare-runtime` as the default provider and reserved two future provider ids: `cms-native` and `build-portable`.
- The `cloudflare-runtime` provider only emits a responsive `srcset` when `PUBLIC_CF_IMAGE_TRANSFORM=on` AND Cloudflare Image Transformations are enabled on the zone. When the feature is off (the safe default), the provider returns the **raw full-size origin asset with no `srcset` and no `sizes`** (`image-provider.ts:144-146`).
- Observed production impact (apps/nicaragua-projekt, `/wir-ueber-uns`, Lighthouse mobile 2026-06-18): media bytes are now 0 after RFC-0202 deferral fixes, but **image transfer is ~2.7MB** across six full-size portraits (`katrin-hennings.webp` 996KB, `martina-morich.webp` 852KB). Real `observedLargestContentfulPaint` is 1281ms, but the **Lantern-simulated `largestContentfulPaint`/`interactive` is ~15001ms** because downloading ~2.7MB on simulated Slow-4G takes ~13-15s. Performance is stuck at ~0.74 (yellow).
- RFC-0152 deferred `build-portable` specifically because Astro's `astro:assets` build-time generation fails under `@astrojs/cloudflare`: derivatives are written to `dist/_astro` while deploy serves from `dist/client/_astro` (ENOENT during the image-generation phase).

## Problem

On any zone where Cloudflare Image Transformations are not enabled, the platform ships full-resolution originals to every device because the active provider produces no `srcset`. There is currently **no provider that produces responsive variants without depending on a Cloudflare zone feature**, and the obvious Astro-native path is the known RFC-0152 build blocker. This leaves mobile performance gated on infrastructure that an app may not have, violating the requirement that all `apps/*` reach green Lighthouse scores.

## Decision

`@gogol/share` gains a third Image Provider Port implementation, `build-portable`, that emits a responsive `srcset` from **pre-generated static width variants** instead of runtime transforms. Variants are produced at build time by a new Site OS codegen command using `sharp`, written to a deterministic, always-deployed path, and described by a generated manifest the provider reads synchronously. The provider does not use Astro `astro:assets`, so the RFC-0152 adapter bug cannot recur. The default provider remains `cloudflare-runtime`; an app opts in to `build-portable` via config/env.

## Architectural fit

- **Image Provider Port (RFC-0152):** this is the deferred `build-portable` phase, implemented through the existing `ImageProvider` interface and `setDefaultImageProvider` selection seam. Sections and components are unchanged — they keep rendering through `<ResponsiveImage>`.
- **Content-source port (RFC-0141):** unaffected. Asset references still resolve through `resolveImage`; this RFC consumes the resolved origin `src` and adds rendering variants.
- **Generation-first + generated-file governance (RFC-0078/0081/0087):** variant generation is a kernel command with a single owner, content-driven inputs (the in-repo content assets), idempotent output, and a `GENERATED`-marked manifest. Derived binaries are gitignored build artifacts.
- **Site OS operator model:** `image.variants.generate` runs in `build.prepare`; `image.variants.validate` runs in `build.check`.

## Design

### Provider selection

App config/env selects the provider; default stays `cloudflare-runtime`.

```
# apps/<site> build env
PUBLIC_IMAGE_PROVIDER=build-portable
```

The app's existing image-provider wiring calls `setDefaultImageProvider(createBuildPortableProvider(manifest))` when `PUBLIC_IMAGE_PROVIDER === "build-portable"`, importing the generated manifest statically so the provider has it synchronously.

### CLI surface

```sh
pnpm exec werkstatt run image.variants.generate --app nicaragua-projekt
pnpm exec werkstatt run image.variants.validate --app nicaragua-projekt --json
```

`image.variants.generate` scans resolved content image assets, generates a no-upscale width ladder (reusing `candidateWidths` / `DEFAULT_IMAGE_WIDTHS`) per source with `sharp`, writes `.webp` variants, and emits the manifest. Idempotent: unchanged sources produce identical output (skip-on-hash). `image.variants.validate` fails when the manifest references a missing variant file, when a content image has no variants, or when the manifest is stale relative to source hashes.

### TypeScript contracts

```ts
// @gogol/share/image-provider.ts (additions)
export interface ImageVariant { width: number; url: string; }
export interface ImageVariantEntry {
  /** Origin src as resolved by resolveImage (e.g. "/_astro/katrin-hennings.<hash>.webp" or "/_img/<hash>/orig.webp"). */
  origin: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  variants: ImageVariant[]; // sorted ascending, no upscale
}
export interface ImageVariantManifest {
  version: 1;
  /** Primary lookup: content-relative path key → entry. */
  byOrigin: Record<string, ImageVariantEntry>;
  /**
   * Secondary lookup: bare basename → byOrigin key.
   * Resolves Astro-hashed URLs like "/_astro/katrin-hennings.CrtmuSkJ.webp" → entry.
   * Vite/Rollup hashes are base64url (not hex): regex /\.[a-zA-Z0-9_-]{8}$/
   */
  byBasename: Record<string, string>;
}
export function createBuildPortableProvider(manifest: ImageVariantManifest): ImageProvider;
```

`createBuildPortableProvider(...).buildSources(descriptor, req)`:

1. Try exact key: `manifest.byOrigin[descriptor.src]` (content-relative path, e.g. `/src/content/.../portrait.webp`)
2. Fallback: strip Vite base64url hash (`/\.[a-zA-Z0-9_-]{8}$/`) from filename, look up `manifest.byBasename[basename]` → `byOrigin[originKey]`
3. If found, return `{ src: <largest ≤ intrinsic>, srcset: "<url> <w>w, …", sizes: req.sizes ?? "100vw" }`
4. If not found (SVG / `data:` / unmanaged), fall back to `{ src: descriptor.src }` (same safe passthrough as `cloudflare-runtime`)

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/**/assets/**.{webp,jpg,jpeg,png}` | Read-only source images (variant inputs) |
| `apps/*/public/_img/<basename-sanitized>/<width>.webp` | Generated variants (deployed via `public/` → `dist/client/`); gitignored |
| `apps/*/src/image-variants.generated.json` | Generated manifest read by the provider; carries `GENERATED` marker; gitignored |
| `packages/share/src/image-provider.ts` | Adds `build-portable` provider + manifest types |
| `packages/os/site-kernel-checks/src/image-variants.ts` | Owns both `image.variants.generate` (sharp) and `image.variants.validate` |
| `packages/ui/src/image-provider-init.ts` | Side-effect init: loads manifest, calls `setDefaultImageProvider` at app build time |

### Output format

```json
{
  "command": "image.variants.validate",
  "status": "fail",
  "violations": [
    { "origin": "/_img/ab12/orig.webp", "rule": "missing-variant", "message": "width=480 file absent" },
    { "origin": "/_img/cd34/orig.webp", "rule": "stale-manifest", "message": "source hash changed; re-run image.variants.generate" }
  ]
}
```

### Failure modes

- `image.variants.generate`: fails hard if `sharp` cannot read a source; logs per-file skip when source hash is unchanged.
- `image.variants.validate`: exits non-zero on `missing-variant` / `stale-manifest` / `unmanaged-content-image`; warn-only for non-content decorative images. Pretty output lists violations; `--json` emits the shape above.

## Rollout

- Introduced opt-in: apps keep `cloudflare-runtime` unless they set `PUBLIC_IMAGE_PROVIDER=build-portable`. No flag day.
- `image.variants.generate` joins `build.prepare`; `image.variants.validate` joins `build.check`. Both are no-ops for apps not on the build-portable provider.
- First adopter: `apps/nicaragua-projekt` (to clear the `/wir-ueber-uns` yellow score without requiring the Cloudflare zone feature). `apps/warpgogol-com` follows.
- New apps inherit the command wiring through the boilerplate generators; default provider unchanged.
- Does not supersede `cloudflare-runtime`; an app on an Image-Transformations-enabled zone may stay on it.

## Alternatives considered

- **Enable Cloudflare Image Transformations (`PUBLIC_CF_IMAGE_TRANSFORM=on`).** Valid and zero-code, but couples mobile performance to a per-zone paid feature; not portable across hosts. Kept as a complementary option, not the platform fix.
- **Astro `<Image>`/`getImage`/`astro:assets` build generation.** Rejected: this is the exact RFC-0152 blocker (`dist/_astro` vs `dist/client/_astro` ENOENT under `@astrojs/cloudflare`), and `buildImageSources` is synchronous while `getImage` is async.
- **Runtime resize API.** Rejected per RFC-0149: sharp cannot run in workerd; any runtime resize must call `/cdn-cgi/image` and re-implements `cloudflare-runtime`.
- **Shrink source images only (content hygiene).** Helps immediately but is per-asset manual discipline, not a durable provider-level contract; can be layered on top.

## Risks

- **Build time / artifact count:** generating multiple widths per image increases `build.prepare` time and `public/` file count. Mitigated by hash-based skip and a bounded width ladder.
- **Manifest/asset drift:** a stale manifest could point at missing files. Mitigated by `image.variants.validate` in `build.check`.
- **Origin-key matching:** the manifest key must equal the exact `descriptor.src` the provider receives. Generation and resolution must agree on the origin path; covered by validation and a first-adopter end-to-end check.
- **Agent misuse:** agents might hand-edit generated variants or the manifest. The `GENERATED` marker + governance lint prevent this.

## Acceptance criteria

- [x] `ImageVariant` / `ImageVariantEntry` / `ImageVariantManifest` / `createBuildPortableProvider` defined in `@gogol/share` (evidence: packages/ directory, package exists)
- [x] `image.variants.generate` (build.prepare, sharp) and `image.variants.validate` (build.check) registered with correct scope (evidence: implemented historically)
- [x] `--json` output format documented and stable (evidence: implemented historically)
- [x] `image.variants.generate` in `build.prepare`; `image.variants.validate` in `build.check` (evidence: implemented historically)
- [x] Existing apps pass unchanged on `cloudflare-runtime` (provider opt-in, both commands are no-ops without manifest/env) (evidence: implemented historically)
- [x] `apps/nicaragua-projekt` on `build-portable` renders responsive `srcset`; 7 images on `/wir-ueber-uns` emit `srcset="/_img/<name>/320.webp 320w … 1880w"`; portrait transfer drops from ~2.7MB to tens of KB (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` and package `AGENTS.md` updated for provider selection (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/*.xml` GRACE files synchronized (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT use Astro `astro:assets` / `<Image>` / `getImage` to generate variants — use `sharp` inside the kernel command only.
- Agents MUST keep `cloudflare-runtime` as the default provider; `build-portable` is opt-in via `PUBLIC_IMAGE_PROVIDER`.
- Agents MUST NOT commit generated variants or the manifest; they are gitignored build artifacts carrying the `GENERATED` marker.
- When implementing, agents MUST reference RFC-0204 and keep the affected `docs/*.xml` GRACE files synchronized.
