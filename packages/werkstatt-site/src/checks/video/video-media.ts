/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0210] video.media.validate — author-time, disk-only guard for the unified media contract's
  explicit-source (feature/background) configs. Complements the RFC-0202 live.media.validate
  (which still guards ambient living-photo pairing). Rules:
    - missing-source: a `media:` config whose source token resolves to no on-disk video. (fail)
    - missing-alt:    a `feature` media config without alt text (WCAG/RFC-0210). (fail)
    - missing-captions: a `feature` media config with no caption track — WCAG 1.2.2 for any
                        prerecorded speech. (warn now; a follow-up enforces it.)
  No-op pass when an app authors no explicit media.
</purpose>
<non-goals>
  <item>Do not validate ambient living-photo pairing — that is live.media.validate (RFC-0202).</item>
  <item>Do not read content via the Astro runtime — disk only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0210: initial implementation (missing-source, missing-alt, missing-captions).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { fileExists } from "../lib/file-exists.ts";
import { passResult, resultFromViolations } from "../result-helpers.ts";
import { readDefaultLanguageCode } from "../lib/i18n.ts";
import type { VideoManifest } from "@warpgogol/share/schemas/media";
import { collectFiles } from "@warpgogol/share/fs";

const SOURCE_EXTENSIONS = [".mp4", ".webm"];

interface MediaRef {
  file: string;
  token: string;
  profile: string;
  lang: string;
  hasAlt: boolean;
  hasCaptions: boolean;
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  try {
    const parsed = yamlParse(raw.slice(3, end));
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

/** Walk frontmatter collecting every `media:` config that names an explicit source token. */
function collectMediaRefs(node: unknown, file: string, lang: string, out: MediaRef[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectMediaRefs(item, file, lang, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("media" in obj && obj.media && typeof obj.media === "object") {
      const media = obj.media as {
        profile?: string;
        source?: { name?: string };
        alt?: string;
        captions?: unknown[];
      };
      const token = media.source?.name;
      if (typeof token === "string" && token.trim() !== "") {
        out.push({
          file,
          token,
          profile: media.profile ?? "feature",
          lang,
          hasAlt: typeof media.alt === "string" && media.alt.trim() !== "",
          hasCaptions: Array.isArray(media.captions) && media.captions.length > 0,
        });
      }
    }
    for (const value of Object.values(obj)) collectMediaRefs(value, file, lang, out);
  }
}

async function sourceResolves(
  appRoot: string,
  token: string,
  lang: string,
  defaultLang: string,
): Promise<boolean> {
  const clean = token.replace(/\.(mp4|webm)$/i, "");
  // Canonical `media/` (non-bundled) folder, with `assets/` accepted for back-compat.
  const subdirs = clean.includes("/") ? [clean] : [`media/${clean}`, `assets/${clean}`];
  const langs = lang === defaultLang ? [lang] : [lang, defaultLang];
  for (const domain of ["pages", "business"]) {
    for (const lng of langs) {
      for (const sub of subdirs) {
        for (const ext of SOURCE_EXTENSIONS) {
          if (await fileExists(join(appRoot, "src", "content", domain, lng, `${sub}${ext}`))) {
            return true;
          }
        }
      }
    }
  }
  return false;
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

export async function runVideoMediaValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "video.media.validate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");

  const defaultLang = await readDefaultLanguageCode(contentRoot);

  const refs: MediaRef[] = [];
  for (const domain of ["pages", "business"]) {
    for (const file of await collectMarkdown(join(contentRoot, domain))) {
      const fm = parseFrontmatter(await readFile(file, "utf-8").catch(() => ""));
      if (!fm) continue;
      const lang = langFromPath(appRoot, file, defaultLang);
      const rel = file.slice(appRoot.length + 1).replace(/\\/g, "/");
      collectMediaRefs(fm, rel, lang, refs);
    }
  }

  const manifest = await readVideoManifest(appRoot);
  function hasAudioForToken(token: string, lang: string): boolean | undefined {
    if (!manifest) return undefined;
    const clean = token.replace(/\.(mp4|webm)$/i, "");
    const origin = manifest.byToken[`${lang}/${clean}`];
    if (!origin) return undefined;
    return manifest.byOrigin[origin]?.hasAudio;
  }

  const violations: string[] = [];
  for (const ref of refs) {
    if (!(await sourceResolves(appRoot, ref.token, ref.lang, defaultLang))) {
      violations.push(
        `[missing-source] ${ref.file}: media token "${ref.token}" resolves to no source video (lang: ${ref.lang})`,
      );
    }
    if (ref.profile === "feature" && !ref.hasAlt) {
      violations.push(`[missing-alt] ${ref.file}: feature media "${ref.token}" requires alt text`);
    }
    // WCAG 1.2.2 — warn (not fail) when a feature video with audio ships no captions track.
    if (ref.profile === "feature" && !ref.hasCaptions) {
      const audio = hasAudioForToken(ref.token, ref.lang);
      if (audio !== false) {
        ctx.logger.warn(
          `${command}: [missing-captions] ${ref.file}: feature media "${ref.token}" has no captions — add a VTT track for prerecorded speech (WCAG 1.2.2)`,
        );
      }
    }
  }

  if (violations.length === 0) {
    return passResult(command, `${command}: OK — ${refs.length} media config(s) validated`);
  }
  return resultFromViolations(command, violations);
}
