/*
<MODULE_CONTRACT>
<purpose>
  RFC-0528 material.metadata.write. Build-time, idempotent step that writes IPTC/XMP
  metadata into derived image/video delivery variants discovered through variant manifests.
  Metadata sources: MaterialCredit sidecars (resolved through content reference index) and
  SemanticSiteProfile fallback (organizational copyright for files without sidecars).
  Authored source masters under src/content are never touched.
  Gracefully reports a skip when exiftool is unavailable.
</purpose>
<non-goals>
  <item>Do not touch authored source masters under src/content.</item>
  <item>Do not invent provenance data; all fields come from the authored credit record or SemanticSiteProfile.</item>
  <item>Do not embed metadata into HLS segments (.ts, .m3u8) or caption files (.vtt).</item>
  <item>Do not require a C2PA signing identity; unsigned manifests are acceptable.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0226: initial material metadata writer with graceful toolchain-absent skip.</item>
  <item>RFC-0528: manifest-based file discovery, SemanticSiteProfile fallback, content reference
        resolution, full 7-tag exiftool mapping, batching for identical metadata.</item>
</CHANGE_SUMMARY>
*/

import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { join, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { materialCreditSchema } from "@warpgogol/werkstatt-site/share/schemas/material-credit";
import type { MaterialCredit } from "@warpgogol/werkstatt-site/share/schemas/material-credit";
import type { VideoManifest, LiveVideoManifest } from "@warpgogol/werkstatt-site/share/schemas/media";
import type { ImageVariantManifest } from "@warpgogol/werkstatt-site/share/image-provider";
import type { SemanticSiteModel } from "@warpgogol/werkstatt-site/share/semantic";
import {
  loadContentRefIndex,
  resolveReferencesDeep,
  EMPTY_CONTENT_REF_INDEX,
} from "@warpgogol/werkstatt-site/share/content-reference";
import { loadSystemManifest, loadSemanticSiteModel } from "@warpgogol/werkstatt-site/content";

const exec = promisify(execCallback);

const ENCODER_SETTINGS_VERSION = "Warpgogol/1.0";

const SKIP_EXTENSIONS = new Set([".ts", ".m3u8", ".vtt", ".webm"]);

interface ManifestFile {
  path: string;
  token: string;
  kind: "image" | "video";
}

interface MetadataTags {
  title?: string;
  copyright?: string;
  creator?: string;
  artist?: string;
  comment?: string;
  webStatement?: string;
  encoder: string;
}

async function toolchainAvailable(binary: string): Promise<boolean> {
  try {
    await exec(`${binary} -ver`);
    return true;
  } catch {
    return false;
  }
}

async function collectCreditsYaml(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".credits.yaml"], ignore: () => false });
}

async function readYamlManifest<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return parseYaml(raw.replace(/^#[^\n]*\n/, "")) as T;
  } catch {
    return null;
  }
}

function urlToFsPath(appRoot: string, url: string): string {
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return join(appRoot, "public", cleanUrl);
}

function shouldSkipFile(path: string): boolean {
  return SKIP_EXTENSIONS.has(extname(path).toLowerCase());
}

function extractTokenFromPath(url: string): string {
  const segments = url.split("/").filter(Boolean);
  const filename = segments.pop() ?? "";
  return filename.replace(/\.[a-z0-9]+$/i, "") || segments.pop() || "unknown";
}

async function collectManifestFiles(appRoot: string): Promise<ManifestFile[]> {
  const files: ManifestFile[] = [];

  const videoManifest = await readYamlManifest<VideoManifest>(
    join(appRoot, "src", "video-manifest.generated.yaml"),
  );
  if (videoManifest?.byOrigin) {
    for (const entry of Object.values(videoManifest.byOrigin)) {
      const sources = [entry.sources.mp4, entry.sources.webm, entry.sources.av1, entry.poster];
      for (const url of sources) {
        if (!url || shouldSkipFile(url)) continue;
        files.push({
          path: urlToFsPath(appRoot, url),
          token: extractTokenFromPath(url),
          kind: "video",
        });
      }
    }
  }

  const liveManifest = await readYamlManifest<LiveVideoManifest>(
    join(appRoot, "src", "live-video-manifest.generated.yaml"),
  );
  if (liveManifest?.byToken) {
    for (const entry of Object.values(liveManifest.byToken)) {
      const sources = [entry.webm, entry.mp4];
      for (const url of sources) {
        if (!url || shouldSkipFile(url)) continue;
        files.push({
          path: urlToFsPath(appRoot, url),
          token: extractTokenFromPath(url),
          kind: "video",
        });
      }
    }
  }

  const imageManifest = await readYamlManifest<ImageVariantManifest>(
    join(appRoot, "src", "image-variants.generated.yaml"),
  );
  if (imageManifest?.byOrigin) {
    for (const entry of Object.values(imageManifest.byOrigin)) {
      for (const variant of entry.variants) {
        if (!variant.url || shouldSkipFile(variant.url)) continue;
        files.push({
          path: urlToFsPath(appRoot, variant.url),
          token: extractTokenFromPath(variant.url),
          kind: "image",
        });
      }
    }
  }

  return files;
}

function buildCreditTags(credit: MaterialCredit): MetadataTags {
  const creators = credit.parties.filter((p) => p.role === "creator" || p.role === "coCreator");
  const rightsHolders = credit.parties.filter((p) => p.role === "rightsHolder");
  const firstRights = rightsHolders[0];
  const firstCreator = creators[0];

  return {
    title: credit.title,
    copyright: credit.license.copyrightNotice,
    creator: creators.length > 0 ? creators.map((p) => p.name).join(", ") : undefined,
    artist: firstCreator?.name ?? firstRights?.name,
    comment: credit.license.acquireLicensePage,
    webStatement: credit.license.url,
    encoder: ENCODER_SETTINGS_VERSION,
  };
}

function buildFallbackTags(
  org: SemanticSiteModel["organization"],
  token: string,
  lang: string,
): MetadataTags {
  const year = new Date().getFullYear();
  const legalName = org.legalName ?? org.name;
  return {
    title: `${org.name} — ${token} (${lang})`,
    copyright: `© ${year} ${legalName}`,
    creator: org.representative,
    artist: org.representative,
    comment: org.url,
    webStatement: org.url,
    encoder: ENCODER_SETTINGS_VERSION,
  };
}

function buildExiftoolArgs(tags: MetadataTags): string[] {
  const args: string[] = [];
  if (tags.title) args.push(`-Title="${tags.title}"`);
  if (tags.copyright) args.push(`-Copyright="${tags.copyright}"`);
  if (tags.creator) args.push(`-Creator="${tags.creator}"`);
  if (tags.artist) args.push(`-Artist="${tags.artist}"`);
  if (tags.comment) args.push(`-Comment="${tags.comment}"`);
  if (tags.webStatement) args.push(`-WebStatement="${tags.webStatement}"`);
  args.push(`-Encoder="${tags.encoder}"`);
  return args;
}

async function writeMetadataBatch(tags: MetadataTags, filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return;
  const args = buildExiftoolArgs(tags);
  if (args.length === 0) return;
  const fileArgs = filePaths.map((p) => `"${p}"`).join(" ");
  await exec(`exiftool ${args.join(" ")} -overwrite_original ${fileArgs}`);
}

async function writeMetadataSingle(tags: MetadataTags, filePath: string): Promise<void> {
  const args = buildExiftoolArgs(tags);
  if (args.length === 0) return;
  await exec(`exiftool ${args.join(" ")} -overwrite_original "${filePath}"`);
}

function tagsKey(tags: MetadataTags): string {
  return JSON.stringify(tags);
}

export async function runMaterialMetadataWrite(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "material.metadata.write";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");
  const srcDir = join(appRoot, "src");

  const hasExiftool = await toolchainAvailable("exiftool");

  if (!hasExiftool) {
    return {
      data: {
        command,
        status: "pass",
        note: "[metadata-toolchain-missing] exiftool not found; embedded metadata writing skipped (RFC-0528).",
      },
      exitCode: 0,
      summary: `${command}: skip — exiftool unavailable`,
    };
  }

  // 1. Load system manifest for lang/defaultLang/siteUrl
  let lang = "de";
  let defaultLang = "de";
  let siteUrl = "";
  try {
    const { manifest } = await loadSystemManifest(contentRoot);
    defaultLang = manifest.i18n?.default ?? "de";
    lang = defaultLang;
    siteUrl = manifest.identity.domain ?? "";
    if (siteUrl && !/^https?:\/\//.test(siteUrl)) siteUrl = `https://${siteUrl}`;
  } catch {
    // graceful — defaults are acceptable
  }

  // 2. Load content reference index (RFC-0527)
  const indexPath = join(srcDir, "content-ref-index.generated.yaml");
  const index = loadContentRefIndex(indexPath) ?? EMPTY_CONTENT_REF_INDEX;

  // 3. Load and resolve all .credits.yaml sidecars
  const creditFiles = await collectCreditsYaml(contentRoot);
  const creditsByTarget = new Map<string, MaterialCredit>();
  for (const file of creditFiles) {
    try {
      const raw = parseYaml(await readFile(file, "utf-8"));
      const resolved = await resolveReferencesDeep(index, raw, lang, defaultLang);
      const credit = materialCreditSchema.parse(resolved);
      if (credit.target.kind === "image" || credit.target.kind === "video") {
        creditsByTarget.set(`${credit.target.kind}:${credit.target.id}`, credit);
      }
    } catch {
      continue;
    }
  }

  // 4. Load SemanticSiteProfile for fallback metadata
  let fallbackOrg: SemanticSiteModel["organization"] | null = null;
  try {
    const model = await loadSemanticSiteModel({ contentDir: contentRoot, lang, siteUrl });
    fallbackOrg = model.organization;
  } catch {
    // graceful — files without credits get no fallback metadata
  }

  // 5. Collect manifest files
  const manifestFiles = await collectManifestFiles(appRoot);

  if (manifestFiles.length === 0) {
    return {
      data: {
        command,
        status: "pass",
        written: 0,
        skipped: 0,
        note: "No derived media files found in manifests.",
      },
      exitCode: 0,
      summary: `${command}: OK — 0 file(s) processed (empty manifests)`,
    };
  }

  // 6. Process files — batch identical metadata, individual for credit-specific
  let written = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Group files by whether they have a credit or use fallback
  const creditFilesList: { file: ManifestFile; tags: MetadataTags }[] = [];
  const fallbackGroups = new Map<string, string[]>();

  for (const file of manifestFiles) {
    const credit = creditsByTarget.get(`${file.kind}:${file.token}`);
    if (credit) {
      creditFilesList.push({ file, tags: buildCreditTags(credit) });
    } else if (fallbackOrg) {
      const tags = buildFallbackTags(fallbackOrg, file.token, lang);
      const key = tagsKey(tags);
      const group = fallbackGroups.get(key) ?? [];
      group.push(file.path);
      fallbackGroups.set(key, group);
    } else {
      skipped++;
    }
  }

  // Write fallback metadata in batches (identical tags → single exiftool call)
  for (const [tagKey, filePaths] of fallbackGroups) {
    try {
      await writeMetadataBatch(JSON.parse(tagKey) as MetadataTags, filePaths);
      written += filePaths.length;
    } catch (err) {
      errors.push(`[metadata-write-failed] batch: ${String(err)}`);
    }
  }

  // Write credit-specific metadata (per file, concurrency limit 4)
  const CONCURRENCY = 4;
  for (let i = 0; i < creditFilesList.length; i += CONCURRENCY) {
    const batch = creditFilesList.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ file, tags }) => {
        try {
          await writeMetadataSingle(tags, file.path);
          written++;
        } catch (err) {
          errors.push(`[metadata-write-failed] ${file.path}: ${String(err)}`);
        }
      }),
    );
  }

  if (errors.length > 0) {
    return {
      data: { command, status: "fail", errors },
      exitCode: 1,
      summary: `${command}: FAIL — ${errors.length} write error(s)`,
    };
  }

  return {
    data: { command, status: "pass", written, skipped },
    exitCode: 0,
    summary: `${command}: OK — ${written} file(s) written, ${skipped} skipped (no credit or fallback)`,
  };
}
