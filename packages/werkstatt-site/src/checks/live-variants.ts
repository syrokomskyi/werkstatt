/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0234] live.variants.generate — at build time, derive the cross-device delivery set for every
  living-photo / ambient clip from its SINGLE authored source (`<token>.webm` OR `<token>.mp4`,
  never both). The author ships one file; the build forms the rest so the clip plays on any device:
    - WebM (VP9) — desktop/Android source (copied when the source is already WebM, else transcoded);
      alpha is preserved so transparent clips stay transparent where VP9 alpha is honoured.
    - MP4 (H.264, +faststart, muted) — the iOS-playable fallback. H.264 cannot carry alpha, so a
      TRANSPARENT source is flattened over the site background colour (`--ds-color-bg`) — decoded
      with the explicit `-c:v libvpx-vp9` alpha decoder and composited via `overlay` — so the iOS
      clip blends into the page instead of a dirty box. An opaque source is transcoded/copied as-is.
  Outputs go to public/_video/live/<lang>/<token>/… (deployed via public→dist/client; gitignored).
  Encoding is content-addressed: a per-app cache (.cache/video-live/<hash>) keyed by source byte
  fingerprint + ENCODER_SETTINGS_VERSION means an unchanged source is never re-encoded. Emits the
  GENERATED manifest src/live-video-manifest.generated.yaml read by <SectionImage>/<LivePhoto>.
</purpose>
<non-goals>
  <item>Do not process feature/background `media:` sources — that is video.variants.generate.</item>
  <item>Do not generate HLS for ambient clips — they are short, muted decorative loops.</item>
  <item>Do not import Astro internals — pure fs + ffmpeg.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0234: introduced living-photo cross-device variant generation.</item>
  <item>RFC-0234: flatten transparent sources over the site background colour for the iOS MP4 (instead of poster-only), decoding VP9 alpha explicitly.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { fileExists, collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { byteHash } from "@warpgogol/fingerprint";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import type { LiveVideoManifest, LiveVideoManifestEntry } from "@warpgogol/werkstatt-site/share/schemas/media";
import { readDefaultLanguageCode } from "./lib/i18n.ts";

const execFileAsync = promisify(execFile);

const MANIFEST_RELATIVE = "src/live-video-manifest.generated.yaml";
const LIVE_PUBLIC_DIR = join("_video", "live");
const CACHE_RELATIVE = join(".cache", "video-live");
/** Bump to force a clean re-encode of every living-photo source when the ffmpeg recipe changes. */
const ENCODER_SETTINGS_VERSION = "3";
/** Fallback site background when the active biome exposes no `--ds-color-bg`. */
const DEFAULT_BG_COLOR = "0xffffff";

const SOURCE_EXTENSIONS = [".webm", ".mp4"] as const;
/** Frontmatter keys that may hold the image token paired with a sibling `live` config. */
const TOKEN_KEYS = ["imageName", "photo", "image"];

interface LiveRef {
  token: string;
  lang: string;
}

interface ResolvedLiveSource {
  sourceAbs: string;
  origin: string;
  ext: ".webm" | ".mp4";
}

// ─── frontmatter scanning ─────────────────────────────────────────────────────

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  try {
    const parsed = parseYaml(raw.slice(3, end));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function collectMarkdown(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".md"], ignore: (name) => name === "AGENTS.md" });
}

function langFromPath(appRoot: string, file: string, fallback: string): string {
  const rel = file.slice(appRoot.length).replace(/\\/g, "/");
  return rel.match(/\/src\/content\/[^/]+\/([^/]+)\//)?.[1] ?? fallback;
}

function isLiveEnabled(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  return (node as { enabled?: unknown }).enabled !== false;
}

/** Walk frontmatter; pair every enabled `live` config with its sibling image token. */
function collectLiveRefs(node: unknown, lang: string, out: LiveRef[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLiveRefs(item, lang, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("live" in obj && isLiveEnabled(obj.live)) {
      for (const key of TOKEN_KEYS) {
        const token = obj[key];
        if (typeof token === "string" && token.trim() !== "") {
          out.push({ token, lang });
          break;
        }
      }
    }
    for (const value of Object.values(obj)) collectLiveRefs(value, lang, out);
  }
}

/** Resolve a living-photo token to its single authored source clip (webm or mp4). */
async function resolveLiveSource(
  appRoot: string,
  token: string,
  lang: string,
  defaultLang: string,
): Promise<ResolvedLiveSource | null> {
  const clean = token.replace(/\.(webm|mp4)$/i, "");
  const assetPath = clean.includes("/") ? clean : `assets/${clean}`;
  const langs = lang === defaultLang ? [lang] : [lang, defaultLang];
  for (const domain of ["pages", "business", "prose", "site"]) {
    for (const lng of langs) {
      for (const ext of SOURCE_EXTENSIONS) {
        const rel = `src/content/${domain}/${lng}/${assetPath}${ext}`;
        const abs = join(appRoot, rel);
        if (await fileExists(abs)) {
          return { sourceAbs: abs, origin: `/${rel.replace(/\\/g, "/")}`, ext };
        }
      }
    }
  }
  return null;
}

// ─── ffmpeg / ffprobe ─────────────────────────────────────────────────────────

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * WebM VP8/VP9 alpha lives in the Matroska `AlphaMode` track element (ffprobe `alpha_mode` stream
 * tag), NOT the stream pix_fmt — probing pix_fmt would miss it. MP4 sources are always opaque.
 */
async function detectAlpha(source: string, ext: ".webm" | ".mp4"): Promise<boolean> {
  if (ext === ".mp4") return false;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream_tags=alpha_mode",
      "-of",
      "default=nw=1:nk=1",
      source,
    ]);
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}

/** Transcode an opaque source to a muted, iOS-playable progressive H.264 MP4. */
async function encodeMp4(source: string, outDir: string): Promise<void> {
  await ffmpeg([
    "-i",
    source,
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(outDir, "progressive.h264.mp4"),
  ]);
}

/**
 * [RFC-0234] Transcode a TRANSPARENT WebM into an iOS-playable H.264 MP4 by compositing the alpha
 * subject over the site's solid background colour. H.264 cannot carry alpha, so without this the
 * clip would render over a dirty/black box on iOS; flattening over `--ds-color-bg` makes the iOS
 * MP4 blend into the page the same way the transparent WebM does elsewhere. The VP9 alpha layer is
 * only exposed by the explicit `-c:v libvpx-vp9` decoder (the native demuxer drops it).
 */
async function encodeMp4FlattenedOverBg(
  source: string,
  outDir: string,
  bgColor: string,
): Promise<void> {
  await ffmpeg([
    "-c:v",
    "libvpx-vp9",
    "-i",
    source,
    "-filter_complex",
    `color=c=${bgColor}:s=2x2[bg];[bg][0:v]scale2ref[bgs][v];[bgs][v]overlay=shortest=1,format=yuv420p`,
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-preset",
    "veryfast",
    "-movflags",
    "+faststart",
    join(outDir, "progressive.h264.mp4"),
  ]);
}

/**
 * Resolve the active site background colour from the generated biome CSS (`--ds-color-bg`) as an
 * ffmpeg `0xRRGGBB` literal. Falls back to white when the token is absent or non-hex.
 */
async function resolveSiteBackgroundColor(appRoot: string): Promise<string> {
  const cssPath = join(appRoot, "src", "styles", "biome.generated.css");
  try {
    const css = await readFile(cssPath, "utf-8");
    const match = css.match(/--ds-color-bg:\s*#([0-9a-fA-F]{6})\b/);
    if (match) return `0x${match[1].toLowerCase()}`;
  } catch {
    /* no biome CSS — use the default */
  }
  return DEFAULT_BG_COLOR;
}

/** Transcode a source to a muted VP9 WebM (used when the author supplied an MP4 source). */
async function encodeWebm(source: string, outDir: string): Promise<void> {
  await ffmpeg([
    "-i",
    source,
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "34",
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "5",
    join(outDir, "progressive.vp9.webm"),
  ]);
}

async function hashSource(file: string, bgColor: string): Promise<string> {
  const bytes = await readFile(file);
  // Fold the site background colour into the key: changing `--ds-color-bg` must re-flatten the
  // iOS MP4 derived from a transparent source.
  return byteHash(
    Buffer.concat([bytes, Buffer.from(`|live|bg=${bgColor}|v${ENCODER_SETTINGS_VERSION}`)]),
  )
    .slice(("sha" + "256:").length)
    .slice(0, 16);
}

// ─── live.variants.generate ────────────────────────────────────────────────────

export async function runLiveVariantsGenerate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "live.variants.generate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");
  const manifestPath = join(appRoot, MANIFEST_RELATIVE);

  const defaultLang = await readDefaultLanguageCode(contentRoot);

  // Discover living-photo refs across content frontmatter, de-duped by lang/token.
  const refs: LiveRef[] = [];
  const seen = new Set<string>();
  for (const domain of ["pages", "business", "prose", "site"]) {
    for (const file of await collectMarkdown(join(contentRoot, domain))) {
      const fm = parseFrontmatter(await readFile(file, "utf-8").catch(() => ""));
      if (!fm) continue;
      const lang = langFromPath(appRoot, file, defaultLang);
      const found: LiveRef[] = [];
      collectLiveRefs(fm, lang, found);
      for (const r of found) {
        const cleanToken = r.token.replace(/\.(webm|mp4)$/i, "");
        const key = `${r.lang}/${cleanToken}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ token: cleanToken, lang: r.lang });
      }
    }
  }

  const writeManifest = async (manifest: LiveVideoManifest): Promise<void> => {
    await writeFile(manifestPath, yamlStringify(manifest) + "\n", "utf-8");
  };

  if (refs.length === 0) {
    await writeManifest({
      version: 1,
      byToken: {},
    });
    return {
      data: { command, status: "pass", note: "no living photos", generated: 0 },
      exitCode: 0,
      summary: `${command}: OK (0 living photos)`,
    };
  }

  // ffmpeg/ffprobe must be available when there is work to do.
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    return {
      data: {
        command,
        status: "fail",
        violations: [
          `ffmpeg/ffprobe not found in PATH but ${refs.length} living-photo source(s) need ` +
            `deriving. Install ffmpeg or warm the .cache/video-live cache (RFC-0234).`,
        ],
      },
      exitCode: 1,
      summary: `${command}: ffmpeg missing with ${refs.length} source(s)`,
    };
  }

  const cacheRoot = join(appRoot, CACHE_RELATIVE);
  const publicRoot = join(appRoot, "public", LIVE_PUBLIC_DIR);
  const bgColor = await resolveSiteBackgroundColor(appRoot);
  const manifest: LiveVideoManifest = {
    version: 1,
    byToken: {},
  };
  const violations: string[] = [];
  let encoded = 0;
  let cached = 0;

  for (const ref of refs) {
    const resolved = await resolveLiveSource(appRoot, ref.token, ref.lang, defaultLang);
    if (!resolved) {
      // Pairing is enforced by live.media.validate; here we simply skip an unresolved token.
      ctx.logger.warn(
        `${command}: living-photo source for "${ref.token}" (lang ${ref.lang}) not found — skipped`,
      );
      continue;
    }

    const alpha = await detectAlpha(resolved.sourceAbs, resolved.ext);
    const hash = await hashSource(resolved.sourceAbs, alpha ? bgColor : "opaque");
    const cacheDir = join(cacheRoot, hash);
    const publicDir = join(publicRoot, ref.lang, ref.token);
    const urlBase = `/${LIVE_PUBLIC_DIR.replace(/\\/g, "/")}/${ref.lang}/${ref.token}`;

    if (!(await fileExists(join(cacheDir, ".done")))) {
      await mkdir(cacheDir, { recursive: true });
      // WebM (desktop/Android): copy when the source is already WebM, else transcode VP9. Keeps the
      // alpha channel so transparent clips stay transparent on browsers that honour VP9 alpha.
      if (resolved.ext === ".webm") {
        await copyFile(resolved.sourceAbs, join(cacheDir, "progressive.vp9.webm"));
      } else {
        await encodeWebm(resolved.sourceAbs, cacheDir);
      }
      // MP4 (iOS): H.264 cannot carry alpha. A transparent source is FLATTENED over the site
      // background colour so iOS plays the animated clip blended into the page (not a dirty box);
      // an opaque source is transcoded/copied as-is.
      if (alpha) {
        await encodeMp4FlattenedOverBg(resolved.sourceAbs, cacheDir, bgColor);
      } else if (resolved.ext === ".mp4") {
        await copyFile(resolved.sourceAbs, join(cacheDir, "progressive.h264.mp4"));
      } else {
        await encodeMp4(resolved.sourceAbs, cacheDir);
      }
      await writeFile(join(cacheDir, ".done"), hash, "utf-8");
      encoded++;
    } else {
      cached++;
    }

    // Copy cache → public (skip the .done marker).
    await mkdir(publicDir, { recursive: true });
    const hasMp4 = await fileExists(join(cacheDir, "progressive.h264.mp4"));
    for (const name of ["progressive.vp9.webm", "progressive.h264.mp4"]) {
      const src = join(cacheDir, name);
      if (await fileExists(src)) await copyFile(src, join(publicDir, name));
    }

    const entry: LiveVideoManifestEntry = {
      origin: resolved.origin,
      webm: `${urlBase}/progressive.vp9.webm`,
      mp4: hasMp4 ? `${urlBase}/progressive.h264.mp4` : undefined,
      alpha,
      mp4Bg: alpha && hasMp4 ? bgColor : undefined,
    };
    manifest.byToken[`${ref.lang}/${ref.token}`] = entry;
  }

  await writeManifest(manifest);
  if (violations.length > 0) {
    for (const v of violations) ctx.logger.error(`${command}: ${v}`);
    return {
      data: { command, status: "fail", violations },
      exitCode: 1,
      summary: `${command}: ${violations.length} error(s)`,
    };
  }

  ctx.logger.info(
    `${command}: ${refs.length} living photo(s) — ${encoded} encoded, ${cached} from cache`,
  );
  return {
    data: { command, status: "pass", sources: refs.length, encoded, cached },
    exitCode: 0,
    summary: `${command}: OK (${refs.length} living photos, ${encoded} encoded, ${cached} cached)`,
  };
}
