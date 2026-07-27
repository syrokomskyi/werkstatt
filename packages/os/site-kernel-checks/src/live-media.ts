/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0202] live.media.validate. Author-time, disk-only guard for the living-photos contract:
    - missing-video: an image authored as live (`live.enabled !== false`) must have a sibling
      `<token>.webm` next to its poster image.
    - orphan-video: every `*.webm` under src/content asset folders must have a sibling static poster
      image (`<name>.{webp,jpg,jpeg,png}`).
  No-op pass when an app has no live photos and no clips.
</purpose>
<non-goals>
  <item>Do not read content via the Astro runtime — disk only, like people.validate.</item>
  <item>Do not resolve clips to hashed URLs — that is the render layer (resolveVideo).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0202: initial implementation (missing-video + orphan-video).</item>
  <item>RFC-0210: exclude src/content/ * /media/ directories from orphan-video scan — source video posters are generated into public/_video.</item>
  <item>RFC-0234: accept a single source clip in either container (webm OR mp4) and add the [dual-source] rule (fail when both formats are authored for one clip).</item>
</CHANGE_SUMMARY>
*/

import { join, basename, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { fileExists } from "./lib/file-exists.ts";
import { passResult, resultFromViolations } from "./result-helpers.ts";
import { readDefaultLanguageCode } from "./lib/i18n.ts";
import { collectFiles } from "@warpgogol/share/fs";

const POSTER_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png"];
/** Frontmatter keys that may hold the image token paired with a sibling `live` config. */
const TOKEN_KEYS = ["imageName", "photo", "image"];

interface LivePhotoRef {
  file: string;
  token: string;
  lang: string;
}

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

/** Recursively collect every .md file under a directory. */
async function collectMarkdown(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".md"], ignore: (name) => name === "AGENTS.md" });
}

/** Recursively collect every living-photo clip (.webm or .mp4) under a directory. */
async function collectClips(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    extensions: [".webm", ".mp4"],
    // RFC-0210 source videos — poster generated into public/_video
    ignore: (name) => name === "media",
  });
}

/** Is this node a live config that opts in (enabled !== false)? */
function isLiveEnabled(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const enabled = (node as { enabled?: unknown }).enabled;
  return enabled !== false;
}

/**
 * Walk a parsed frontmatter object; whenever a node carries a `live` config (enabled),
 * pair it with the image token from a sibling TOKEN_KEYS field and record a LivePhotoRef.
 */
function collectLiveRefs(node: unknown, file: string, lang: string, out: LivePhotoRef[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectLiveRefs(item, file, lang, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("live" in obj && isLiveEnabled(obj.live)) {
      for (const key of TOKEN_KEYS) {
        const token = obj[key];
        if (typeof token === "string" && token.trim() !== "") {
          out.push({ file, token, lang });
          break;
        }
      }
    }
    for (const value of Object.values(obj)) collectLiveRefs(value, file, lang, out);
  }
}

/** Infer content language from a path (.../src/content/<domain>/<lang>/...). */
function langFromPath(appRoot: string, file: string, fallback: string): string {
  const rel = file.slice(appRoot.length).replace(/\\/g, "/");
  return rel.match(/\/src\/content\/[^/]+\/([^/]+)\//)?.[1] ?? fallback;
}

/**
 * Mirror resolveVideo: does a single source clip `<token>.webm` OR `<token>.mp4` exist next to its
 * poster (pages or business assets)? RFC-0234: either container is a valid authored source.
 */
async function clipResolves(
  appRoot: string,
  token: string,
  lang: string,
  defaultLang: string,
): Promise<boolean> {
  const exts = [".webm", ".mp4"];
  if (token.startsWith("/src/content/")) {
    const base = token.replace(/\.(webp|jpg|jpeg|png|webm|mp4)$/i, "");
    for (const ext of exts) {
      if (await fileExists(join(appRoot, `${base}${ext}`))) return true;
    }
    return false;
  }
  const clean = token.replace(/\.(webp|jpg|jpeg|png|webm|mp4)$/i, "");
  const assetPath = clean.includes("/") ? clean : `assets/${clean}`;
  const langs = lang === defaultLang ? [lang] : [lang, defaultLang];
  for (const domain of ["pages", "business"]) {
    for (const lng of langs) {
      for (const ext of exts) {
        if (await fileExists(join(appRoot, "src", "content", domain, lng, `${assetPath}${ext}`))) {
          return true;
        }
      }
    }
  }
  return false;
}

export async function runLiveMediaValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "live.media.validate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");

  const defaultLang = await readDefaultLanguageCode(contentRoot);

  const violations: string[] = [];

  // Rule 1: every live photo has a sibling clip.
  const liveRefs: LivePhotoRef[] = [];
  for (const domain of ["pages", "business", "prose", "site"]) {
    for (const file of await collectMarkdown(join(contentRoot, domain))) {
      const fm = parseFrontmatter(await readFile(file, "utf-8").catch(() => ""));
      if (!fm) continue;
      const lang = langFromPath(appRoot, file, defaultLang);
      const rel = file.slice(appRoot.length + 1).replace(/\\/g, "/");
      collectLiveRefs(fm, rel, lang, liveRefs);
    }
  }
  for (const ref of liveRefs) {
    if (!(await clipResolves(appRoot, ref.token, ref.lang, defaultLang))) {
      violations.push(
        `[missing-video] ${ref.file}: live photo "${ref.token}" has no sibling clip "${ref.token}.webm" or "${ref.token}.mp4" (lang: ${ref.lang})`,
      );
    }
  }

  // Rules 2 + 3: scan authored clips for a sibling poster and a single source format.
  const clips = await collectClips(contentRoot);
  // RFC-0234: exactly one source format per clip — fail when both `<stem>.webm` and `<stem>.mp4`
  // are authored. Generated deliverables live in public/_video/live, never next to the source, so
  // this never trips on a derived file.
  const seenDual = new Set<string>();
  for (const clip of clips) {
    const stem = basename(clip).replace(/\.(webm|mp4)$/i, "");
    const dir = dirname(clip);
    const dualKey = join(dir, stem);

    if (!seenDual.has(dualKey)) {
      const hasWebm = await fileExists(join(dir, `${stem}.webm`));
      const hasMp4 = await fileExists(join(dir, `${stem}.mp4`));
      if (hasWebm && hasMp4) {
        seenDual.add(dualKey);
        const relDir = dir.slice(appRoot.length + 1).replace(/\\/g, "/");
        violations.push(
          `[dual-source] ${relDir}/${stem}: a clip must ship exactly ONE source format, but both ` +
            `"${stem}.webm" and "${stem}.mp4" exist. Keep one; the build derives the other (RFC-0234).`,
        );
      }
    }

    // Rule 2: every clip has a sibling static poster image.
    let hasPoster = false;
    for (const ext of POSTER_EXTENSIONS) {
      if (await fileExists(join(dir, `${stem}${ext}`))) {
        hasPoster = true;
        break;
      }
    }
    if (!hasPoster) {
      const rel = clip.slice(appRoot.length + 1).replace(/\\/g, "/");
      violations.push(
        `[orphan-video] ${rel}: clip has no sibling static poster image ("${stem}.{webp,jpg,jpeg,png}")`,
      );
    }
  }

  if (violations.length === 0) {
    return passResult(
      command,
      `${command}: OK — ${liveRefs.length} live photo(s) paired with clips and posters`,
    );
  }
  return resultFromViolations(command, violations);
}
