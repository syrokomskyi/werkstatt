import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0234] video.ios-fallback.validate — build.check guard that refuses to publish a site whose
  videos lack an iOS-playable delivery format. iOS Safari does not decode VP8/VP9 WebM with alpha
  correctly (it renders the clip opaque) and historically failed plain WebM without a user gesture,
  so every authored clip MUST ship a source iOS can render — otherwise the page silently degrades
  (a "dirty" opaque box, or no animation) only on iPhones, which desktop QA never sees.

  Two rules:
    - [mp4-missing] every `media:` (feature/background) source in the generated video manifest must
      expose an `mp4` rendition whose file exists on disk. `video.variants.generate` emits MP4 for
      every source unconditionally; this catches a regression where that guarantee breaks.
    - [ios-fallback-missing] / [live-variant-missing] every authored living-photo clip
      (`<clip>.webm` or `<clip>.mp4`) must have a generated entry in the living-photo manifest
      (`live.variants.generate`) exposing an iOS-playable MP4 that exists on disk. Transparent
      sources are flattened over the site background colour for that MP4; only a clip with no MP4 at
      all (flatten skipped) is treated as poster-only on iOS.

  Transparency is recorded by `live.variants.generate` (via ffprobe `stream_tags=alpha_mode`) into
  the manifest, so this guard is a pure disk + manifest check.
</purpose>
<non-goals>
  <item>Do not transcode — generation is video.variants.generate / live.variants.generate (RFC-0210/0234).</item>
  <item>Do not read content via the Astro runtime — disk + generated manifests only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0234: initial implementation (mp4-missing + ios-fallback-missing).</item>
</CHANGE_SUMMARY>
*/

import { join, basename } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import type { VideoManifest, LiveVideoManifest } from "@gogol/share/schemas/media";
import { fileExists } from "../lib/file-exists.ts";
import { passResult, resultFromViolations } from "../result-helpers.ts";
import { readDefaultLanguageCode } from "../lib/i18n.ts";
import { collectFiles } from "@gogol/share/fs";

/** Recursively collect every living-photo clip (`.webm`/`.mp4`), skipping RFC-0210 `media/` sources. */
async function collectClips(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    extensions: [".webm", ".mp4"],
    // RFC-0210 feature/background sources → media manifest
    ignore: (name) => name === "media",
  });
}

function langFromPath(appRoot: string, file: string, fallback: string): string {
  const rel = file.slice(appRoot.length).replace(/\\/g, "/");
  return rel.match(/\/src\/content\/[^/]+\/([^/]+)\//)?.[1] ?? fallback;
}

async function readVideoManifest(appRoot: string): Promise<VideoManifest | null> {
  const path = join(appRoot, "src", "video-manifest.generated.yaml");
  try {
    const raw = await readFile(path, "utf-8");
    return yamlParse(raw.replace(/^#[^\n]*\n/, "")) as VideoManifest;
  } catch {
    return null;
  }
}

async function readLiveManifest(appRoot: string): Promise<LiveVideoManifest | null> {
  const path = join(appRoot, "src", "live-video-manifest.generated.yaml");
  try {
    const raw = await readFile(path, "utf-8");
    return yamlParse(raw.replace(/^#[^\n]*\n/, "")) as LiveVideoManifest;
  } catch {
    return null;
  }
}

export async function runVideoIosFallbackValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "video.ios-fallback.validate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");

  const violations: string[] = [];
  let checked = 0;
  let posterOnly = 0;

  // Rule 1 — manifest (feature/background) sources must expose an existing MP4 rendition.
  const manifest = await readVideoManifest(appRoot);
  if (manifest) {
    for (const entry of Object.values(manifest.byOrigin)) {
      checked++;
      const mp4 = entry.sources.mp4;
      if (!mp4) {
        violations.push(
          `[mp4-missing] ${entry.origin}: media source has no MP4 rendition in the video manifest — re-run video.variants.generate`,
        );
        continue;
      }
      const diskPath = join(appRoot, "public", mp4.replace(/^\//, ""));
      if (!(await fileExists(diskPath))) {
        violations.push(
          `[mp4-missing] ${mp4} (origin: ${entry.origin}) — MP4 rendition is missing on disk; re-run video.variants.generate`,
        );
      }
    }
  }

  // Rule 2 — every authored living-photo clip must have a generated live-manifest entry whose iOS
  // delivery is correct: an opaque clip needs an existing MP4; a transparent (alpha) clip is
  // legitimately poster-only on iOS (an H.264 MP4 cannot carry its alpha).
  const liveManifest = await readLiveManifest(appRoot);
  const defaultLang = await readDefaultLanguageCode(contentRoot);

  const liveEntryFor = (token: string, lang: string) => {
    if (!liveManifest) return null;
    return (
      liveManifest.byToken[`${lang}/${token}`] ??
      (lang !== defaultLang ? liveManifest.byToken[`${defaultLang}/${token}`] : undefined) ??
      null
    );
  };

  for (const clip of await collectClips(contentRoot)) {
    checked++;
    const token = basename(clip).replace(/\.(webm|mp4)$/i, "");
    const lang = langFromPath(appRoot, clip, defaultLang);
    const rel = clip.slice(appRoot.length + 1).replace(/\\/g, "/");

    const entry = liveEntryFor(token, lang);
    if (!entry) {
      violations.push(
        `[live-variant-missing] ${rel}: no generated live-video manifest entry for "${lang}/${token}" — ` +
          `run live.variants.generate (build.prepare) so the cross-device set exists.`,
      );
      continue;
    }
    if (entry.alpha && !entry.mp4) {
      // Transparent source with no flattened MP4 (e.g. flatten skipped): poster-only on iOS.
      posterOnly++;
      continue;
    }
    // Opaque clip, or a transparent clip flattened over the site background: an iOS-playable MP4
    // must be present and on disk.
    if (!entry.mp4) {
      violations.push(
        `[ios-fallback-missing] ${rel}: opaque clip has no iOS-playable MP4 in the live manifest — ` +
          `re-run live.variants.generate.`,
      );
      continue;
    }
    const diskPath = join(appRoot, "public", entry.mp4.replace(/^\//, ""));
    if (!(await fileExists(diskPath))) {
      violations.push(
        `[ios-fallback-missing] ${entry.mp4} (clip: ${rel}): iOS MP4 is missing on disk — ` +
          `re-run live.variants.generate.`,
      );
    }
  }

  if (violations.length === 0) {
    return passResult(
      command,
      `${command}: OK — ${checked} clip(s) iOS-playable (${posterOnly} transparent poster-only)`,
    );
  }
  return resultFromViolations(command, violations);
}
