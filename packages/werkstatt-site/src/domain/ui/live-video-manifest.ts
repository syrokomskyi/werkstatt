/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0234] Loads the app's GENERATED living-photo manifest
  (src/live-video-manifest.generated.json) at build time and exposes a synchronous lookup for
  <SectionImage>/<LivePhoto>. The manifest is produced by live.variants.generate (build.prepare)
  and carries, per living-photo token, the derived cross-device delivery URLs (desktop WebM, an
  iOS-playable MP4 for opaque clips) plus the `alpha` flag. Mirrors the RFC-0210 video-manifest
  loading pattern. When the manifest is absent (dev before build.prepare), the lookup returns null
  and the render layer falls back to authored sibling resolution.
</purpose>
<non-goals>
  <item>Do not transcode or resolve source files — that is the kernel command.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0234: created to load the generated living-photo manifest into the UI build.</item>
</CHANGE_SUMMARY>
*/

import type { LiveVideoManifest, LiveVideoManifestEntry } from "@warpgogol/werkstatt-site/share/schemas/media";
import { loadGeneratedManifest } from "./generated-manifest-loader.ts";

const manifest = loadGeneratedManifest<LiveVideoManifest>(
  "/src/live-video-manifest.generated.yaml",
);

/**
 * [RFC-0234] Look up a generated living-photo entry by `<lang>/<token>`, with default-language
 * fallback. Returns null when no manifest entry exists (the render layer then falls back to authored
 * sibling resolution).
 */
export function getLiveVideoByToken(
  token: string | undefined,
  lang: string,
  defaultLang: string,
): LiveVideoManifestEntry | null {
  if (!token || !manifest) return null;
  const clean = token.replace(/\.(webm|mp4)$/i, "");
  return (
    manifest.byToken[`${lang}/${clean}`] ??
    (lang !== defaultLang ? (manifest.byToken[`${defaultLang}/${clean}`] ?? null) : null)
  );
}
