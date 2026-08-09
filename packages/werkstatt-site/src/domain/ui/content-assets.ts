/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] The single content-asset glob for @warpgogol/werkstatt-site/ui. This is the only place in
  packages/ui that calls import.meta.glob for visitor-facing content images. Sections and
  components import `contentAssetImages` from here instead of declaring their own glob, so
  the filesystem asset surface is centralized behind the Content Source Provider seam.

  import.meta.glob with a root-absolute pattern is resolved by Vite at the call site against
  the app root, so this module — bundled into each app build — sees that app's content asset
  folders. The recursive superset pattern below covers every prior per-component pattern;
  resolveImage() looks up exact constructed keys, so resolution is byte-for-byte identical to
  the previous per-file globs.
</purpose>
<non-goals>
  <item>Do not implement resolution logic — sections call resolveImage(contentAssetImages, ...) from @warpgogol/werkstatt-site/share.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: centralized the per-component content-asset globs into one shared map.</item>
  <item>RFC-0220: added the shared material credit sidecar glob.</item>
  <item>RFC-0529: no changes needed — content-assets.ts exports globs only, credit YAML resolution happens at consumer call sites.</item>
</CHANGE_SUMMARY>
*/

import type { ImageMetadata } from "astro";
// RFC-0204: install the build-portable image provider when PUBLIC_IMAGE_PROVIDER=build-portable.
import "./image-provider-init.ts";

/**
 * The single content-asset glob for the workspace UI. Eager so resolution is synchronous in
 * component frontmatter. Superset of all prior per-component patterns (recursive asset
 * folders, all five raster extensions).
 */
export const contentAssetImages = import.meta.glob<{ default: ImageMetadata }>(
  "/src/content/**/assets/**/*.{webp,jpg,jpeg,png,gif}",
  { eager: true },
);

/**
 * [RFC-0202] The single content-asset glob for living-photo clips. Eager + `?url` so each
 * `.webm` resolves to a bundled hashed URL string synchronously in component frontmatter,
 * mirroring contentAssetImages. resolveVideo() looks up exact constructed keys.
 */
export const contentAssetVideos = import.meta.glob<string>(
  "/src/content/**/assets/**/*.{webm,mp4}",
  { eager: true, query: "?url", import: "default" },
);

/** RFC-0220: raw YAML sidecars for material credits, resolved by @warpgogol/werkstatt-site/share helpers. */
export const contentAssetCredits = import.meta.glob<string>("/src/content/**/*.credits.yaml", {
  eager: true,
  query: "?raw",
  import: "default",
});
