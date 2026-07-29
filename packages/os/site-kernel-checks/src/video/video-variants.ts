/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0210] Site OS commands for the unified media playback contract.
  `video.variants.generate` — at build time, derive the missing delivery formats for every source
  video referenced by a `media:` config in content frontmatter, using ffmpeg. Per profile:
    - feature    → HLS ABR ladder (hls/master.m3u8 + per-rendition playlists + TS segments)
                   + progressive MP4 (H.264/AAC, +faststart) + WebM (VP9/Opus) + AV1 (SVT-AV1, RFC-0525)
                   + poster.
    - background → progressive MP4 + WebM (muted, no HLS).
  Outputs go to public/_video/<lang>/<token>/… (deployed via public→dist/client; gitignored).
  Encoding is content-addressed: a per-app cache (.cache/video/<hash>) keyed by
  source byte fingerprint + profile + ladder + ENCODER_SETTINGS_VERSION means an unchanged source
  is NEVER re-encoded — a cold build from a warm cache does zero ffmpeg work. Emits the GENERATED manifest
  src/video-manifest.generated.yaml read synchronously by <Media>.
  `video.variants.validate` — confirm the manifest is present and every referenced derived file
  exists under public/_video/ (build.check guard); no-op pass when no media is authored.
</purpose>
<non-goals>
  <item>Do not transcode at request time / in workerd — build-time only (RFC-0149).</item>
  <item>Do not process living-photo (ambient) clips produced by the video-loop pipeline.</item>
  <item>Do not import Astro internals — pure fs + ffmpeg.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0210: introduced video.variants.generate and video.variants.validate.</item>
  <item>RFC-0525: upgraded encoding parameters (CRF/preset), added AV1 progressive via libsvtav1, added per-rendition HLS audio bitrate, extended ffmpeg check for libsvtav1, added av1 to validator.</item>
  <item>Performance: faster ffmpeg presets (x264 slow→medium, VP9 deadline best→good/cpu-used 2, AV1 preset 2→6). AV1 encoding is now opt-in via media.av1 frontmatter (default false) to skip the slowest encoder for most sources.</item>
  <item>RFC-0591: two-pass bitrate-capped MP4 encoding with maxSizeMb frontmatter field; ENCODER_SETTINGS_VERSION bumped to 5; calculateTargetBitrate pure function; copy loop skips ffmpeg2pass.log* files.</item>
</CHANGE_SUMMARY>
*/

import { join, relative, basename, extname, dirname } from "node:path";
import { readdir, readFile, writeFile, mkdir, stat, copyFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileExists, collectFiles } from "@warpgogol/share/fs";
import { byteHash } from "@warpgogol/fingerprint";
import { promisify } from "node:util";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { GENERATED_MARKER } from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import type {
  VideoManifest,
  VideoManifestEntry,
  MediaProfile,
} from "@warpgogol/share/schemas/media";
import { readDefaultLanguageCode } from "../lib/i18n.ts";

const execFileAsync = promisify(execFile);

const MANIFEST_RELATIVE = "src/video-manifest.generated.yaml";
const VIDEO_PUBLIC_DIR = "_video";
const CACHE_RELATIVE = join(".cache", "video");
/** Bump to force a clean re-encode of every source when the ffmpeg recipe changes. */
const ENCODER_SETTINGS_VERSION = "5";
const AUDIO_BITRATE_BPS = 128_000;
const DEFAULT_MAX_SIZE_MB = 24;
const MIN_VIDEO_BITRATE_BPS = 200_000;

const SOURCE_EXTENSIONS = [".mp4", ".webm"];
const HLS_LADDER_AUTO = [360, 540, 720, 1080] as const;
/** Approximate H.264 video bitrate (kbps) per rendition height for the HLS master BANDWIDTH hint. */
const BANDWIDTH_BY_HEIGHT: Record<number, number> = {
  360: 800_000,
  540: 1_400_000,
  720: 2_800_000,
  1080: 5_000_000,
};

interface MediaRef {
  /** Absolute path of the resolved source video. */
  sourceAbs: string;
  /** Content-relative origin key (manifest byOrigin key), e.g. /src/content/pages/uk/assets/promo.mp4. */
  origin: string;
  profile: MediaProfile;
  ladder: "auto" | number[];
  posterTime: number;
  /** Opt-in AV1 progressive encoding (RFC-0525). Default false — AV1 is the slowest encoder. */
  av1: boolean;
  /** Maximum MP4 file size in MiB (RFC-0591). Default 24 — two-pass bitrate-capped encoding. 0 disables (CRF 17). */
  maxSizeMb: number;
  lang: string;
  token: string;
  captionLangs: string[];
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

interface RawMediaConfig {
  profile?: string;
  source?: { name?: string };
  ladder?: "auto" | number[];
  posterTime?: number;
  av1?: boolean;
  maxSizeMb?: number;
  captions?: { lang?: string }[];
}

/** Walk a parsed frontmatter object collecting every `media:` config that names an explicit source. */
function collectMediaConfigs(node: unknown, out: RawMediaConfig[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectMediaConfigs(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("media" in obj && obj.media && typeof obj.media === "object") {
      const media = obj.media as RawMediaConfig;
      if (media.source?.name) out.push(media);
    }
    for (const value of Object.values(obj)) collectMediaConfigs(value, out);
  }
}

/**
 * Resolve a feature/background source token to its absolute path + content-relative origin key.
 * Canonical location is the non-bundled `media/` folder (so Vite never emits the master to
 * `_astro` — Cloudflare's 25 MiB limit); `assets/` is still accepted for back-compat (those bundle
 * and are removed by the video.dist.prune backstop).
 */
async function resolveSource(
  appRoot: string,
  token: string,
  lang: string,
  defaultLang: string,
): Promise<{ sourceAbs: string; origin: string } | null> {
  const clean = token.replace(/\.(mp4|webm)$/i, "");
  const subdirs = clean.includes("/") ? [clean] : [`media/${clean}`, `assets/${clean}`];
  const langs = lang === defaultLang ? [lang] : [lang, defaultLang];
  for (const domain of ["pages", "business"]) {
    for (const lng of langs) {
      for (const sub of subdirs) {
        for (const ext of SOURCE_EXTENSIONS) {
          const rel = `src/content/${domain}/${lng}/${sub}${ext}`;
          const abs = join(appRoot, rel);
          if (await fileExists(abs))
            return { sourceAbs: abs, origin: `/${rel.replace(/\\/g, "/")}` };
        }
      }
    }
  }
  return null;
}

// ─── ffmpeg / ffprobe ───────────────────────────────────────────────────────

interface ProbeResult {
  width?: number;
  height?: number;
  durationSec?: number;
  hasAudio: boolean;
}

async function ffprobe(file: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height:format=duration",
    "-of",
    "json",
    file,
  ]);
  const json = parseYaml(stdout) as {
    streams?: { codec_type?: string; width?: number; height?: number }[];
    format?: { duration?: string };
  };
  const video = json.streams?.find((s) => s.codec_type === "video");
  const hasAudio = !!json.streams?.some((s) => s.codec_type === "audio");
  return {
    width: video?.width,
    height: video?.height,
    durationSec: json.format?.duration ? Math.round(Number(json.format.duration)) : undefined,
    hasAudio,
  };
}

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

function resolveLadder(ladder: "auto" | number[], sourceHeight: number | undefined): number[] {
  if (Array.isArray(ladder)) {
    const hs = ladder.filter((h) => !sourceHeight || h <= sourceHeight).sort((a, b) => a - b);
    return hs.length > 0 ? hs : sourceHeight ? [sourceHeight] : [720];
  }
  const hs = HLS_LADDER_AUTO.filter((h) => !sourceHeight || h <= sourceHeight);
  return hs.length > 0 ? [...hs] : sourceHeight ? [sourceHeight] : [720];
}

// ─── encoding (into a cache dir) ──────────────────────────────────────────────

/**
 * Calculate the target video bitrate for two-pass encoding (RFC-0591).
 * Returns null when two-pass cannot run (maxSizeMb <= 0 or durationSec <= 0/undefined).
 * Formula: videoBitrate = floor(maxSizeMb * 1024 * 1024 * 8 / durationSec) - AUDIO_BITRATE_BPS
 */
export function calculateTargetBitrate(
  durationSec: number | undefined,
  maxSizeMb: number,
): { videoBitrate: number; audioBitrate: number } | null {
  if (maxSizeMb <= 0 || !durationSec || durationSec <= 0) return null;
  const totalBitrate = Math.floor((maxSizeMb * 1024 * 1024 * 8) / durationSec);
  const videoBitrate = totalBitrate - AUDIO_BITRATE_BPS;
  if (videoBitrate <= 0) return null;
  return { videoBitrate, audioBitrate: AUDIO_BITRATE_BPS };
}

async function encodeMp4(
  source: string,
  outDir: string,
  hasAudio: boolean,
  durationSec: number | undefined,
  maxSizeMb: number,
  logger?: { warn: (msg: string) => void },
): Promise<void> {
  const audio = hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"];
  const target = calculateTargetBitrate(durationSec, maxSizeMb);

  if (!target) {
    // CRF fallback: no size guarantee (maxSizeMb === 0 or durationSec unknown).
    await ffmpeg([
      "-i",
      source,
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "medium",
      "-profile:v",
      "high",
      "-level",
      "4.0",
      "-pix_fmt",
      "yuv420p",
      ...audio,
      "-movflags",
      "+faststart",
      join(outDir, "progressive.h264.mp4"),
    ]);
    return;
  }

  if (target.videoBitrate < MIN_VIDEO_BITRATE_BPS) {
    const kbps = Math.round(target.videoBitrate / 1000);
    logger?.warn(
      `video.variants.generate: calculated video bitrate ${kbps} kbps is below 200 kbps — ` +
        `quality will be noticeably degraded. Consider increasing maxSizeMb or shortening the source.`,
    );
  }

  const videoBitrateStr = `${Math.round(target.videoBitrate / 1000)}k`;
  const passLogPrefix = join(outDir, "ffmpeg2pass.log");

  // Pass 1: analysis only (no output file).
  await ffmpeg([
    "-i",
    source,
    "-c:v",
    "libx264",
    "-b:v",
    videoBitrateStr,
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-pass",
    "1",
    "-passlogfile",
    passLogPrefix,
    "-an",
    "-f",
    "null",
    "/dev/null",
  ]);

  // Pass 2: final encode with audio.
  await ffmpeg([
    "-i",
    source,
    "-c:v",
    "libx264",
    "-b:v",
    videoBitrateStr,
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-level",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-pass",
    "2",
    "-passlogfile",
    passLogPrefix,
    ...audio,
    "-movflags",
    "+faststart",
    join(outDir, "progressive.h264.mp4"),
  ]);

  // Clean up pass-log files (they are also skipped in the copy loop as a safety net).
  for (const suffix of ["-0.log", ".log"])
    await unlink(join(outDir, `ffmpeg2pass${suffix}`)).catch(() => {});
}

async function encodeWebm(source: string, outDir: string, hasAudio: boolean): Promise<void> {
  const audio = hasAudio ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"];
  // -deadline good + -cpu-used 2 for fast VP9 with good quality (perf optimization).
  await ffmpeg([
    "-i",
    source,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "28",
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "2",
    ...audio,
    join(outDir, "progressive.vp9.webm"),
  ]);
}

async function encodePoster(source: string, outDir: string, atSeconds: number): Promise<void> {
  // Grab a representative frame at the configured offset (skips intro/title cards).
  await ffmpeg([
    "-ss",
    String(atSeconds),
    "-i",
    source,
    "-frames:v",
    "1",
    "-q:v",
    "4",
    join(outDir, "poster.webp"),
  ]);
}

/** Per-rendition audio bitrate for HLS (RFC-0525). Lower renditions use lower audio bitrate. */
const AUDIO_BITRATE_BY_HEIGHT: Record<number, string> = {
  360: "64k",
  540: "96k",
  720: "128k",
  1080: "128k",
};

async function encodeHls(
  source: string,
  outDir: string,
  ladder: number[],
  hasAudio: boolean,
  aspect: { width?: number; height?: number },
): Promise<void> {
  const hlsDir = join(outDir, "hls");
  await mkdir(hlsDir, { recursive: true });
  const masterLines: string[] = ["#EXTM3U", "#EXT-X-VERSION:3"];

  // Even-rounded rendition width preserving the source aspect ratio (fallback 16:9).
  const ratio = aspect.width && aspect.height ? aspect.width / aspect.height : 16 / 9;
  const widthFor = (h: number): number => Math.max(2, Math.round((h * ratio) / 2) * 2);

  for (const h of ladder) {
    const name = `${h}p`;
    const audioBitrate = AUDIO_BITRATE_BY_HEIGHT[h] ?? "128k";
    const audio = hasAudio ? ["-c:a", "aac", "-b:a", audioBitrate] : ["-an"];
    await ffmpeg([
      "-i",
      source,
      "-vf",
      `scale=-2:${h}`,
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "medium",
      "-profile:v",
      "high",
      "-level",
      "4.0",
      "-pix_fmt",
      "yuv420p",
      ...audio,
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      join(hlsDir, `${name}_%03d.ts`),
      join(hlsDir, `${name}.m3u8`),
    ]);
    const bandwidth = BANDWIDTH_BY_HEIGHT[h] ?? h * 4000;
    masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${widthFor(h)}x${h}`);
    masterLines.push(`${name}.m3u8`);
  }

  await writeFile(join(hlsDir, "master.m3u8"), masterLines.join("\n") + "\n", "utf-8");
}

async function encodeAv1(source: string, outDir: string, hasAudio: boolean): Promise<void> {
  const audio = hasAudio ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"];
  await ffmpeg([
    "-i",
    source,
    "-c:v",
    "libsvtav1",
    "-preset",
    "6",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p10le",
    "-svtav1-params",
    "tune=vq:enable-overlays=1",
    ...audio,
    join(outDir, "progressive.av1.webm"),
  ]);
}

// ─── file copy (cache → public) ───────────────────────────────────────────────

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

async function hashFileForProfile(
  file: string,
  profile: MediaProfile,
  ladder: number[],
  posterTime: number,
  av1: boolean,
  maxSizeMb: number,
): Promise<string> {
  const bytes = await readFile(file);
  return byteHash(
    Buffer.concat([
      bytes,
      Buffer.from(
        `|${profile}|${ladder.join(",")}|p${posterTime}|av1=${av1}|max=${maxSizeMb}|v${ENCODER_SETTINGS_VERSION}`,
      ),
    ]),
  )
    .slice(("sha" + "256:").length)
    .slice(0, 16);
}

// ─── video.variants.generate ──────────────────────────────────────────────────

export async function runVideoVariantsGenerate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "video.variants.generate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");
  const manifestPath = join(appRoot, MANIFEST_RELATIVE);

  const defaultLang = await readDefaultLanguageCode(contentRoot);

  // Discover media configs across pages + business frontmatter.
  const refs: MediaRef[] = [];
  for (const domain of ["pages", "business"]) {
    for (const file of await collectMarkdown(join(contentRoot, domain))) {
      const fm = parseFrontmatter(await readFile(file, "utf-8").catch(() => ""));
      if (!fm) continue;
      const lang = langFromPath(appRoot, file, defaultLang);
      const configs: RawMediaConfig[] = [];
      collectMediaConfigs(fm, configs);
      for (const cfg of configs) {
        const token = cfg.source!.name!;
        const profile = (cfg.profile as MediaProfile) ?? "feature";
        if (profile === "ambient") continue; // ambient clips come from the RFC-0202 pipeline
        const resolved = await resolveSource(appRoot, token, lang, defaultLang);
        if (!resolved) {
          ctx.logger.warn(
            `${command}: source for media token "${token}" (lang ${lang}) not found — skipped`,
          );
          continue;
        }
        // De-dupe by origin (the same source may be referenced from several pages).
        if (refs.some((r) => r.origin === resolved.origin)) continue;
        refs.push({
          sourceAbs: resolved.sourceAbs,
          origin: resolved.origin,
          profile,
          ladder: cfg.ladder ?? "auto",
          posterTime: typeof cfg.posterTime === "number" ? cfg.posterTime : 1,
          av1: cfg.av1 === true,
          maxSizeMb: typeof cfg.maxSizeMb === "number" ? cfg.maxSizeMb : DEFAULT_MAX_SIZE_MB,
          lang,
          token: token.replace(/\.(mp4|webm)$/i, ""),
          captionLangs: (cfg.captions ?? [])
            .map((c) => c.lang)
            .filter((l): l is string => typeof l === "string"),
        });
      }
    }
  }

  if (refs.length === 0) {
    const empty: VideoManifest = {
      version: 1,
      byOrigin: {},
      byToken: {},
    };
    await writeFile(manifestPath, yamlStringify(empty) + "\n", "utf-8");
    return {
      data: { command, status: "pass", note: "no media configs found", generated: 0 },
      exitCode: 0,
      summary: `${command}: OK (0 media sources)`,
    };
  }

  // ffmpeg must be available when there is work to do.
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
  } catch {
    return {
      data: {
        command,
        status: "fail",
        violations: [
          `ffmpeg/ffprobe not found in PATH but ${refs.length} media source(s) need transcoding. ` +
            `Install ffmpeg or warm the .cache/video cache (RFC-0210).`,
        ],
      },
      exitCode: 1,
      summary: `${command}: ffmpeg missing with ${refs.length} source(s)`,
    };
  }

  // libsvtav1 encoder must be available for AV1 progressive (RFC-0525) — only when at least
  // one source has av1: true in frontmatter. AV1 is opt-in; most builds skip this check.
  const needsAv1 = refs.some((r) => r.av1);
  if (needsAv1) {
    try {
      const { stdout: encodersOut } = await execFileAsync("ffmpeg", ["-hide_banner", "-encoders"]);
      if (!encodersOut.includes("libsvtav1")) {
        return {
          data: {
            command,
            status: "fail",
            violations: [
              `ffmpeg lacks libsvtav1 encoder — install ffmpeg 8.0+ with SVT-AV1 support or warm the .cache/video cache (RFC-0525).`,
            ],
          },
          exitCode: 1,
          summary: `${command}: libsvtav1 missing`,
        };
      }
    } catch {
      return {
        data: {
          command,
          status: "fail",
          violations: [
            `ffmpeg -encoders check failed — cannot verify libsvtav1 availability (RFC-0525).`,
          ],
        },
        exitCode: 1,
        summary: `${command}: ffmpeg -encoders failed`,
      };
    }
  }

  const publicVideoDir = join(appRoot, "public", VIDEO_PUBLIC_DIR);
  const cacheRoot = join(appRoot, CACHE_RELATIVE);
  const manifest: VideoManifest = {
    version: 1,
    byOrigin: {},
    byToken: {},
  };
  let encoded = 0;
  let cached = 0;

  for (const ref of refs) {
    const probe = await ffprobe(ref.sourceAbs);
    const ladder = ref.profile === "feature" ? resolveLadder(ref.ladder, probe.height) : [];
    const hash = await hashFileForProfile(
      ref.sourceAbs,
      ref.profile,
      ladder,
      ref.posterTime,
      ref.av1,
      ref.maxSizeMb,
    );
    const cacheDir = join(cacheRoot, hash);
    const publicDir = join(publicVideoDir, ref.lang, ref.token);
    const publicUrlBase = `/${VIDEO_PUBLIC_DIR}/${ref.lang}/${ref.token}`;

    if (!(await fileExists(join(cacheDir, ".done")))) {
      await mkdir(cacheDir, { recursive: true });
      await encodeMp4(
        ref.sourceAbs,
        cacheDir,
        probe.hasAudio,
        probe.durationSec,
        ref.maxSizeMb,
        ctx.logger,
      );
      await encodeWebm(ref.sourceAbs, cacheDir, probe.hasAudio);
      if (ref.av1) await encodeAv1(ref.sourceAbs, cacheDir, probe.hasAudio);
      await encodePoster(ref.sourceAbs, cacheDir, ref.posterTime);
      if (ref.profile === "feature")
        await encodeHls(ref.sourceAbs, cacheDir, ladder, probe.hasAudio, {
          width: probe.width,
          height: probe.height,
        });
      await writeFile(join(cacheDir, ".done"), hash, "utf-8");
      encoded++;
    } else {
      cached++;
    }

    // Copy cache → public (skip the .done marker).
    await mkdir(publicDir, { recursive: true });
    for (const entry of await readdir(cacheDir, { withFileTypes: true })) {
      if (entry.name === ".done") continue;
      if (entry.name.startsWith("ffmpeg2pass.log")) continue;
      const s = join(cacheDir, entry.name);
      const d = join(publicDir, entry.name);
      if (entry.isDirectory()) await copyDir(s, d);
      else await copyFile(s, d);
    }

    // Copy any authored caption sidecars (<token>.<lang>.vtt) next to the source into public.
    const captions: VideoManifestEntry["captions"] = [];
    const sourceDir = dirname(ref.sourceAbs);
    for (const cl of ref.captionLangs) {
      const vtt = join(sourceDir, `${ref.token}.${cl}.vtt`);
      if (await fileExists(vtt)) {
        await copyFile(vtt, join(publicDir, `${ref.token}.${cl}.vtt`));
        captions.push({
          lang: cl,
          url: `${publicUrlBase}/${ref.token}.${cl}.vtt`,
          default: captions.length === 0,
        });
      }
    }

    const sources: VideoManifestEntry["sources"] = {
      mp4: `${publicUrlBase}/progressive.h264.mp4`,
      webm: `${publicUrlBase}/progressive.vp9.webm`,
    };
    if (ref.profile === "feature") {
      sources.hls = `${publicUrlBase}/hls/master.m3u8`;
    }
    if (ref.av1) {
      sources.av1 = `${publicUrlBase}/progressive.av1.webm`;
    }

    manifest.byOrigin[ref.origin] = {
      origin: ref.origin,
      profile: ref.profile,
      poster: `${publicUrlBase}/poster.webp`,
      intrinsicWidth: probe.width,
      intrinsicHeight: probe.height,
      durationSec: probe.durationSec,
      hasAudio: probe.hasAudio,
      sources,
      captions: captions.length > 0 ? captions : undefined,
    };
    manifest.byToken[`${ref.lang}/${ref.token}`] = ref.origin;
  }

  await writeFile(manifestPath, yamlStringify(manifest) + "\n", "utf-8");
  ctx.logger.info(
    `${command}: ${refs.length} source(s) — ${encoded} encoded, ${cached} from cache`,
  );

  return {
    data: { command, status: "pass", sources: refs.length, encoded, cached },
    exitCode: 0,
    summary: `${command}: OK (${refs.length} sources, ${encoded} encoded, ${cached} cached)`,
  };
}

// ─── video.variants.validate ──────────────────────────────────────────────────

export async function runVideoVariantsValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "video.variants.validate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const manifestPath = join(appRoot, MANIFEST_RELATIVE);

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch {
    return {
      data: { command, status: "pass", note: "no video manifest — no media authored", checked: 0 },
      exitCode: 0,
      summary: `${command}: skipped (no manifest)`,
    };
  }

  let manifest: VideoManifest;
  try {
    manifest = parseYaml(raw) as VideoManifest;
  } catch {
    return {
      data: { command, status: "fail", violations: [`${MANIFEST_RELATIVE} is not valid JSON`] },
      exitCode: 1,
      summary: `${command}: invalid manifest JSON`,
    };
  }

  const violations: string[] = [];
  let checked = 0;

  for (const entry of Object.values(manifest.byOrigin)) {
    const urls = [
      entry.poster,
      entry.sources.hls,
      entry.sources.mp4,
      entry.sources.webm,
      entry.sources.av1,
      ...(entry.captions ?? []).map((c) => c.url),
    ].filter((u): u is string => typeof u === "string");
    for (const url of urls) {
      checked++;
      const diskPath = join(appRoot, "public", url.replace(/^\//, ""));
      if (!(await fileExists(diskPath))) {
        violations.push(
          `[missing-variant] ${url} (origin: ${entry.origin}) — re-run video.variants.generate`,
        );
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations) ctx.logger.error(`${command}: ${v}`);
    return {
      data: { command, status: "fail", violations, checked },
      exitCode: 1,
      summary: `${command}: ${violations.length} missing artifact(s)`,
    };
  }

  return {
    data: { command, status: "pass", violations: [], checked },
    exitCode: 0,
    summary: `${command}: OK (${checked} artifacts across ${Object.keys(manifest.byOrigin).length} sources)`,
  };
}

// ─── video.dist.prune ─────────────────────────────────────────────────────────

/**
 * [RFC-0210] Post-build prune. The eager `contentAssetVideos` glob bundles every source video
 * into dist/client/_astro, but a feature/background SOURCE is only a transcode input — production
 * serves the derived files from public/_video (→ dist/client/_video), and `<Media>` never
 * references the bundled `_astro` source in prod. A multi-hundred-MB master would otherwise blow
 * Cloudflare Workers' 25 MiB per-asset limit. This step deletes the bundled copy of each manifest
 * source from dist/client/_astro (matched by basename), leaving ambient living-photo clips — which
 * are NOT in the video manifest and ARE served from `_astro` — untouched. No-op without a manifest.
 */
export async function runVideoDistPrune(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "video.dist.prune";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const manifestPath = join(appRoot, MANIFEST_RELATIVE);

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch {
    return {
      data: { command, status: "pass", note: "no video manifest — nothing to prune", pruned: 0 },
      exitCode: 0,
      summary: `${command}: skipped (no manifest)`,
    };
  }

  let manifest: VideoManifest;
  try {
    manifest = parseYaml(raw) as VideoManifest;
  } catch {
    return {
      data: { command, status: "pass", note: "unreadable manifest — nothing to prune", pruned: 0 },
      exitCode: 0,
      summary: `${command}: skipped (bad manifest)`,
    };
  }

  // Basenames of every feature/background SOURCE (e.g. "promo" from .../assets/promo.mp4).
  const sourceBasenames = new Set(
    Object.keys(manifest.byOrigin).map((origin) => basename(origin, extname(origin))),
  );
  if (sourceBasenames.size === 0) {
    return {
      data: { command, status: "pass", pruned: 0 },
      exitCode: 0,
      summary: `${command}: OK (no sources)`,
    };
  }

  const astroDir = join(appRoot, "dist", "client", "_astro");
  let entries: string[];
  try {
    entries = await readdir(astroDir);
  } catch {
    return {
      data: {
        command,
        status: "pass",
        note: "no dist/client/_astro — nothing to prune",
        pruned: 0,
      },
      exitCode: 0,
      summary: `${command}: skipped (no dist)`,
    };
  }

  let pruned = 0;
  let freedBytes = 0;
  for (const name of entries) {
    const ext = extname(name).toLowerCase();
    if (ext !== ".mp4" && ext !== ".webm") continue;
    // Vite emits "<basename>.<hash>.<ext>"; recover the leading basename segment.
    const stem = name.replace(/\.[a-zA-Z0-9_-]{8}\.(mp4|webm)$/i, "");
    if (!sourceBasenames.has(stem)) continue;
    const full = join(astroDir, name);
    try {
      const s = await stat(full);
      await unlink(full);
      pruned++;
      freedBytes += s.size;
    } catch {
      /* already gone */
    }
  }

  const freedMb = (freedBytes / (1024 * 1024)).toFixed(1);
  ctx.logger.info(
    `${command}: pruned ${pruned} bundled source video(s) from dist/client/_astro (${freedMb} MB)`,
  );
  return {
    data: { command, status: "pass", pruned, freedBytes },
    exitCode: 0,
    summary: `${command}: OK (${pruned} pruned, ${freedMb} MB freed)`,
  };
}
