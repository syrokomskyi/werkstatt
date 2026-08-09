/*
<MODULE_CONTRACT>
<purpose>
  RFC-0528 material.metadata.validate. Confirms that derived image/video variants
  discovered through variant manifests carry expected embedded IPTC/XMP metadata.
  Checks META-01 (missing copyright), META-02 (missing creator when credit has one),
  META-03 (mismatched copyright notice), META-04 (missing license URL when credit has one).
  Files without credits sidecars are checked for organizational fallback copyright (META-01).
  Gracefully skips when exiftool is unavailable.
</purpose>
<non-goals>
  <item>Do not write metadata; material.metadata.write (site-kernel-codegen) owns that.</item>
  <item>Do not validate authored source masters; only derived variants are in scope.</item>
  <item>Do not validate HLS segments or caption files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0226: initial material metadata validator with graceful toolchain-absent skip.</item>
  <item>RFC-0528: manifest-based discovery, META-01..04 diagnostics, fallback copyright verification.</item>
</CHANGE_SUMMARY>
*/

import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { join, extname } from "node:path";
import { parse as yamlParse } from "yaml";
import { readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { materialCreditSchema } from "@warpgogol/share/schemas/material-credit";
import type { MaterialCredit } from "@warpgogol/share/schemas/material-credit";
import type { VideoManifest, LiveVideoManifest } from "@warpgogol/share/schemas/media";
import type { ImageVariantManifest } from "@warpgogol/share/image-provider";
import { diagnosticsResult } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/share/fs";

const exec = promisify(execCallback);

const SKIP_EXTENSIONS = new Set([".ts", ".m3u8", ".vtt", ".webm"]);

interface ManifestFile {
  path: string;
  token: string;
  kind: "image" | "video";
}

async function toolchainAvailable(binary: string): Promise<boolean> {
  try {
    await exec(`${binary} -ver`);
    return true;
  } catch {
    return false;
  }
}

async function collectCreditsYaml(contentRoot: string): Promise<string[]> {
  return collectFiles(contentRoot, { extensions: [".credits.yaml"], ignore: () => false });
}

async function readYamlManifest<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return yamlParse(raw.replace(/^#[^\n]*\n/, "")) as T;
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

async function readExifMetadata(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await exec(`exiftool -json -Copyright -Creator -WebStatement "${filePath}"`);
    const parsed = yamlParse(stdout) as Array<Record<string, unknown>>;
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}

export async function runMaterialMetadataValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "material.metadata.validate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");

  const hasExiftool = await toolchainAvailable("exiftool");

  if (!hasExiftool) {
    return diagnosticsResult(command, [
      {
        ruleId: "material.metadata.toolchain-missing",
        severity: "info",
        message: "Embedded metadata validation skipped because exiftool is not available.",
        fixHint: "Install exiftool when embedded material metadata validation is required.",
      },
    ]);
  }

  // Load and resolve credits
  const creditFiles = await collectCreditsYaml(contentRoot);
  const creditsByTarget = new Map<string, MaterialCredit>();
  for (const file of creditFiles) {
    try {
      const raw = yamlParse(await readFile(file, "utf-8"));
      const credit = materialCreditSchema.parse(raw);
      if (credit.target.kind === "image" || credit.target.kind === "video") {
        creditsByTarget.set(`${credit.target.kind}:${credit.target.id}`, credit);
      }
    } catch {
      continue;
    }
  }

  // Collect manifest files
  const manifestFiles = await collectManifestFiles(appRoot);
  if (manifestFiles.length === 0) {
    return diagnosticsResult(command, []);
  }

  const diagnostics: Diagnostic[] = [];

  for (const file of manifestFiles) {
    const credit = creditsByTarget.get(`${file.kind}:${file.token}`);
    const exif = await readExifMetadata(file.path);
    if (!exif) continue;

    const hasCopyright = typeof exif.Copyright === "string" && exif.Copyright.length > 0;

    // META-01: copyright field present (required for all files)
    if (!hasCopyright) {
      diagnostics.push({
        ruleId: "META-01",
        severity: "error",
        file: file.path,
        message: "Missing copyright metadata in embedded IPTC/XMP fields.",
        fixHint: "Run material.metadata.write to embed organizational copyright fallback.",
      });
      continue;
    }

    if (credit) {
      // META-02: creator present when credit has a creator party
      const hasCreator = typeof exif.Creator === "string" && exif.Creator.length > 0;
      const creditHasCreator = credit.parties.some(
        (p) => p.role === "creator" || p.role === "coCreator",
      );
      if (creditHasCreator && !hasCreator) {
        diagnostics.push({
          ruleId: "META-02",
          severity: "error",
          file: file.path,
          message: "Credit record has a creator party but no Creator field is embedded.",
          fixHint: "Run material.metadata.write to embed creator metadata from credit sidecar.",
        });
      }

      // META-03: copyright notice matches credit.license.copyrightNotice
      if (credit.license.copyrightNotice && hasCopyright) {
        const embedded = exif.Copyright as string;
        if (embedded !== credit.license.copyrightNotice) {
          diagnostics.push({
            ruleId: "META-03",
            severity: "error",
            file: file.path,
            message: `Embedded copyright "${embedded}" does not match credit notice "${credit.license.copyrightNotice}".`,
            fixHint: "Run material.metadata.write to sync embedded metadata with credit sidecar.",
          });
        }
      }

      // META-04: WebStatement present when credit has license.url
      const hasWebStatement = typeof exif.WebStatement === "string" && exif.WebStatement.length > 0;
      if (credit.license.url && !hasWebStatement) {
        diagnostics.push({
          ruleId: "META-04",
          severity: "error",
          file: file.path,
          message: "Credit record has a license URL but no WebStatement field is embedded.",
          fixHint: "Run material.metadata.write to embed license URL as WebStatement.",
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
