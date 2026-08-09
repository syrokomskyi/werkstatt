/*
<MODULE_CONTRACT>
<purpose>
Enforces webp-only image format validation across apps/* with public folder exceptions.
Validates actual file format via magic bytes, not just file extensions.
</purpose>
<non-goals>
  <item>Do not convert images to webp format.</item>
  <item>Do not validate images in packages directory (apps only).</item>
  <item>Do not check file extensions (only magic bytes).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0043: Implemented image.format.validate command with webp-only validation for assets folder and webp/ico/svg/png for public folder. Uses file-type library for magic byte detection and RIFF header validation for webp integrity.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileTypeFromBuffer } from "file-type";
import { collectFiles } from "@warpgogol/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

interface ImageFormatViolation {
  file: string;
  rule: "invalid-webp" | "corrupted-webp" | "disallowed-format";
  message: string;
  location: "assets" | "public";
}

interface ImageFormatSummary {
  totalFiles: number;
  validFiles: number;
  invalidFiles: number;
}

// Webp magic bytes: "RIFF" followed by 4 bytes file size, then "WEBP"
const WEBP_RIFF_MAGIC = Buffer.from([0x52, 0x49, 0x46, 0x46]); // "RIFF"
const WEBP_MAGIC = Buffer.from([0x57, 0x45, 0x42, 0x50]); // "WEBP"

// Allowed formats in public folder
const PUBLIC_ALLOWED_MIME_TYPES = new Set([
  "image/webp",
  "image/png",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

// Image extensions to scan
const IMAGE_EXTENSIONS = new Set([
  ".webp",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".avif",
  ".bmp",
  ".tiff",
  ".ico",
  ".svg",
]);

async function _isImageFile(fileName: string): Promise<boolean> {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

async function isSvgFile(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    const trimmed = content.trim();
    return trimmed.startsWith("<?xml") || trimmed.includes("<svg");
  } catch {
    return false;
  }
}

async function validateWebpIntegrity(filePath: string): Promise<boolean> {
  try {
    const buffer = await readFile(filePath);

    // Minimum webp size: RIFF(4) + size(4) + WEBP(4) + VP8 chunk(8) = 20 bytes
    if (buffer.length < 20) {
      return false;
    }

    // Check RIFF header
    if (!buffer.subarray(0, 4).equals(WEBP_RIFF_MAGIC)) {
      return false;
    }

    // Check WEBP marker at offset 8
    if (!buffer.subarray(8, 12).equals(WEBP_MAGIC)) {
      return false;
    }

    // Verify file size from RIFF header matches actual file size
    const declaredSize = buffer.readUInt32LE(4);
    // RIFF size is file size - 8 (RIFF header), so add 8 back
    const actualSize = buffer.length;
    if (declaredSize + 8 !== actualSize && declaredSize + 8 > actualSize + 1) {
      // Allow 1 byte tolerance for some edge cases
      return false;
    }

    // Check VP8 chunk signature at offset 12
    const chunkType = buffer.subarray(12, 15).toString("ascii");
    if (!["VP8", "VP8L", "VP8X"].some((type) => chunkType.startsWith(type))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function collectImageFiles(dir: string): Promise<Array<{ path: string; relative: string }>> {
  const files = await collectFiles(dir, {
    extensions: [...IMAGE_EXTENSIONS],
    ignore: () => false,
  });
  return files.map((fullPath) => ({ path: fullPath, relative: relative(dir, fullPath) }));
}

async function validateImageFile(
  filePath: string,
  location: "assets" | "public",
): Promise<ImageFormatViolation | null> {
  // Check if it's SVG first (file-type doesn't detect SVG reliably)
  if (await isSvgFile(filePath)) {
    // SVG is allowed in both locations
    return null;
  }

  // Use file-type to detect actual format from magic bytes
  const buffer = await readFile(filePath);
  const fileTypeResult = await fileTypeFromBuffer(buffer);

  if (!fileTypeResult) {
    // Unknown format - treat as invalid
    return {
      file: filePath,
      rule: location === "assets" ? "invalid-webp" : "disallowed-format",
      message: "Unknown or unsupported file format",
      location,
    };
  }

  const { mime } = fileTypeResult;

  if (location === "assets") {
    // Assets folder: only webp (and svg, already checked above) allowed
    if (mime === "image/webp") {
      // Validate webp integrity
      const isValidWebp = await validateWebpIntegrity(filePath);
      if (!isValidWebp) {
        return {
          file: filePath,
          rule: "corrupted-webp",
          message: "File claims to be webp but fails integrity validation (corrupted RIFF header)",
          location,
        };
      }
      return null; // Valid webp
    }

    return {
      file: filePath,
      rule: "invalid-webp",
      message: `Detected format: ${mime}. Assets folder only allows webp (and svg).`,
      location,
    };
  }

  // Public folder: webp, ico, svg, png allowed
  if (PUBLIC_ALLOWED_MIME_TYPES.has(mime)) {
    if (mime === "image/webp") {
      // Validate webp integrity in public too
      const isValidWebp = await validateWebpIntegrity(filePath);
      if (!isValidWebp) {
        return {
          file: filePath,
          rule: "corrupted-webp",
          message: "File claims to be webp but fails integrity validation (corrupted RIFF header)",
          location,
        };
      }
    }
    return null; // Valid format
  }

  return {
    file: filePath,
    rule: "disallowed-format",
    message: `Detected format: ${mime}. Public folder only allows webp, ico, svg, png.`,
    location,
  };
}

export async function runImageFormatValidate(
  input: KernelCommandInput,
  _ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "image.format.validate";
  const paths = requireAstroSitePaths(_ctx);
  const appRoot = paths.appDirectory;

  const violations: string[] = [];
  let totalFiles = 0;
  let validFiles = 0;
  let invalidFiles = 0;

  // Scan assets directories
  const assetsDirs = [join(appRoot, "src", "content")];

  for (const assetsDir of assetsDirs) {
    let assetEntries;
    try {
      assetEntries = await readdir(assetsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of assetEntries) {
      if (!entry.isDirectory()) continue;

      // Look for assets subdirectory
      const assetsSubdir = join(assetsDir, entry.name, "assets");
      const imageFiles = await collectImageFiles(assetsSubdir);

      for (const { path: filePath } of imageFiles) {
        totalFiles++;
        const violation = await validateImageFile(filePath, "assets");

        if (violation) {
          invalidFiles++;
          violations.push(`${violation.file} [${violation.rule}]: ${violation.message}`);
        } else {
          validFiles++;
        }
      }
    }
  }

  // Scan public directory
  const publicDir = join(appRoot, "public");
  const publicImages = await collectImageFiles(publicDir);

  for (const { path: filePath } of publicImages) {
    totalFiles++;
    const violation = await validateImageFile(filePath, "public");

    if (violation) {
      invalidFiles++;
      violations.push(`${violation.file} [${violation.rule}]: ${violation.message}`);
    } else {
      validFiles++;
    }
  }

  const summary: ImageFormatSummary = {
    totalFiles,
    validFiles,
    invalidFiles,
  };

  // Build result with summary included in data
  if (violations.length > 0) {
    return {
      data: { command, status: "fail", violations, summary },
      exitCode: 1,
      summary: `${command}: ${violations.length} violation(s)`,
    };
  }

  return {
    data: { command, status: "pass", violations: [], summary },
    exitCode: 0,
    summary: `${command}: OK`,
  };
}
