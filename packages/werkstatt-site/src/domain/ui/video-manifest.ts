/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0210] Loads the app's GENERATED video manifest (src/video-manifest.generated.json) at
  build time and exposes synchronous lookups for <Media>. The manifest is produced by
  video.variants.generate (build.prepare) and carries, per source video, the derived delivery
  URLs (HLS master / progressive MP4 / WebM / poster / caption tracks). Mirrors the RFC-0204
  image-variant manifest loading pattern: a root-absolute import.meta.glob resolved by Vite at
  the app build call site, parsed once. When the manifest is absent (dev before build.prepare),
  lookups return null and <Media feature> degrades to a poster-only render.
</purpose>
<non-goals>
  <item>Do not transcode or resolve source files — that is the kernel command + resolveMedia.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0210: created to load the generated video manifest into the UI build.</item>
</CHANGE_SUMMARY>
*/

import type { VideoManifest, VideoManifestEntry } from "@warpgogol/werkstatt-site/share/schemas/media";
import { loadGeneratedManifest } from "./generated-manifest-loader.ts";

const manifest = loadGeneratedManifest<VideoManifest>("/src/video-manifest.generated.yaml");

/** Look up a generated manifest entry by its content-relative origin key (from resolveMedia). */
export function getVideoEntryByOrigin(originKey: string | undefined): VideoManifestEntry | null {
  if (!originKey || !manifest) return null;
  return manifest.byOrigin[originKey] ?? null;
}

/**
 * [RFC-0210] Look up a generated manifest entry by `<lang>/<token>` with default-language
 * fallback. This is glob-independent — feature/background source videos live in a non-bundled
 * `media/` folder (so Vite never emits the multi-hundred-MB master to `_astro`), and `<Media>`
 * resolves their derived URLs purely through this manifest.
 */
export function getVideoEntryByToken(
  token: string | undefined,
  lang: string,
  defaultLang: string,
): VideoManifestEntry | null {
  if (!token || !manifest) return null;
  const origin =
    manifest.byToken[`${lang}/${token}`] ??
    (lang !== defaultLang ? manifest.byToken[`${defaultLang}/${token}`] : undefined);
  return origin ? (manifest.byOrigin[origin] ?? null) : null;
}
