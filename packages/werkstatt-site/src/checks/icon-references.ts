/*
<MODULE_CONTRACT>
<purpose>
  Build-time validator for VendorIconConfig references in site content.
  Scans content markdown frontmatter and standalone YAML files for
  { vendor, collection, name } objects and checks each against the
  available generated icon components in packages/werkstatt-site/src/domain/ui/icons/gen/.
  Emits ICON-REF-01 (error) for missing icons, ICON-REF-02 (warning) for
  empty or missing icons/gen/ directory, ICON-REF-03 (error) for malformed configs.
</purpose>
<non-goals>
  <item>Do not scan .astro component source — all loadVendorIcon calls use variable references, not literal configs.</item>
  <item>Do not validate favicon or public-surface icons — that is public.icons.validate.</item>
  <item>Do not generate icon components — that is icons.generate.</item>
  <item>Do not modify any files — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0893: Initial implementation of icon.references.validate command.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { resolveIconFileName } from "../domain/ui/icons/icon-resolver.ts";
import { passResult, failResult } from "./result-helpers.ts";
import {
  collectMarkdownFilesSafe,
  getContentDisciplinePaths,
  readMarkdownDocument,
} from "./content-discipline.ts";

interface ExtractedIconRef {
  vendor: string;
  collection: string;
  name: string;
  file: string;
  line: number;
}

const PACKAGE_ICONS_GEN_DIR = "packages/werkstatt-site/src/domain/ui/icons/gen";

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function collectAstroFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await collectAstroFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith(".astro")) {
        results.push(fullPath);
      }
    }
    return results;
  } catch {
    return [];
  }
}

function buildAvailableIconIndex(astroFiles: string[], genDir: string): Set<string> {
  const index = new Set<string>();
  for (const filePath of astroFiles) {
    const rel = relative(genDir, filePath).replace(/\\/g, "/");
    index.add(rel);
  }
  return index;
}

function iconExists(index: Set<string>, vendor: string, collection: string, name: string): boolean {
  const fileName = resolveIconFileName(name);
  const expected = `${vendor}/${collection}/${fileName}`;
  return index.has(expected);
}

function isVendorIconConfigLike(
  obj: unknown,
): obj is { vendor: string; collection: string; name: string } {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  return "vendor" in o && "collection" in o && "name" in o;
}

function isPartialIconConfig(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  const hasVendor = "vendor" in o;
  const hasCollection = "collection" in o;
  const hasName = "name" in o;
  return (hasVendor || hasCollection || hasName) && !(hasVendor && hasCollection && hasName);
}

function extractIconRefs(
  data: unknown,
  file: string,
  source: string,
  refs: ExtractedIconRef[],
  seen: WeakSet<object>,
): void {
  if (data === null || data === undefined) return;
  if (typeof data !== "object") return;
  if (Array.isArray(data)) {
    for (const item of data) {
      extractIconRefs(item, file, source, refs, seen);
    }
    return;
  }
  if (seen.has(data as object)) return;
  seen.add(data as object);

  if (isVendorIconConfigLike(data)) {
    const obj = data as { vendor: string; collection: string; name: string };
    const line = findLineForIconRef(source, obj);
    refs.push({
      vendor: obj.vendor,
      collection: obj.collection,
      name: obj.name,
      file,
      line,
    });
  } else if (isPartialIconConfig(data)) {
    const obj = data as Record<string, unknown>;
    const line = findLineForIconRef(source, obj);
    refs.push({
      vendor: String(obj.vendor ?? ""),
      collection: String(obj.collection ?? ""),
      name: String(obj.name ?? ""),
      file,
      line,
    });
  }

  for (const child of Object.values(data as Record<string, unknown>)) {
    extractIconRefs(child, file, source, refs, seen);
  }
}

function findLineForIconRef(source: string, obj: Record<string, unknown>): number {
  const lines = source.split(/\r?\n/);
  const vendorStr = typeof obj.vendor === "string" ? obj.vendor : "";
  for (let i = 0; i < lines.length; i++) {
    if (vendorStr && lines[i].includes(`vendor:`) && lines[i].includes(vendorStr)) {
      return i + 1;
    }
  }
  return 1;
}

async function collectYamlFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await collectYamlFiles(fullPath)));
      } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        results.push(fullPath);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function runIconReferencesValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = getContentDisciplinePaths(context);
  const genDir = join(context.workspaceRoot, PACKAGE_ICONS_GEN_DIR);
  const violations: string[] = [];
  const warnings: string[] = [];

  const genExists = await directoryExists(genDir);
  let astroFiles: string[] = [];
  if (genExists) {
    astroFiles = await collectAstroFiles(genDir);
  }

  const availableIcons = buildAvailableIconIndex(astroFiles, genDir);

  if (!genExists || astroFiles.length === 0) {
    warnings.push(
      `ICON-REF-02: Generated icon directory ${genExists ? "is empty" : "does not exist"} (${PACKAGE_ICONS_GEN_DIR}). Run icons.generate first.`,
    );
    for (const w of warnings) context.logger.warn(w);
    return passResult(
      "icon.references.validate",
      `Skipped — no generated icons to validate against (${astroFiles.length} icon file(s) found)`,
    );
  }

  const contentDirs = [
    paths.pagesDirectory,
    paths.proseDirectory,
    paths.businessDirectory,
    paths.navigationDirectory,
    paths.siteDirectory,
  ];

  const mdFiles = (await Promise.all(contentDirs.map((d) => collectMarkdownFilesSafe(d)))).flat();
  const yamlFiles = (await Promise.all(contentDirs.map((d) => collectYamlFiles(d)))).flat();

  const allRefs: ExtractedIconRef[] = [];
  const seen = new WeakSet<object>();

  for (const filePath of mdFiles) {
    const doc = await readMarkdownDocument(context.workspaceRoot, filePath);
    extractIconRefs(doc.frontmatter, doc.relativeFile, doc.source, allRefs, seen);
  }

  for (const filePath of yamlFiles) {
    try {
      const source = await readFile(filePath, "utf8");
      const data = parseYaml(source);
      const relFile = relative(context.workspaceRoot, filePath).replace(/\\/g, "/");
      extractIconRefs(data, relFile, source, allRefs, new WeakSet<object>());
    } catch {
      // skip unparseable YAML
    }
  }

  let checkedCount = 0;

  for (const ref of allRefs) {
    const hasAllFields = ref.vendor && ref.collection && ref.name;
    if (!hasAllFields) {
      violations.push(
        `ICON-REF-03: ${ref.file}:${ref.line} — Malformed VendorIconConfig (missing vendor, collection, or name field).`,
      );
      continue;
    }

    checkedCount++;

    if (!iconExists(availableIcons, ref.vendor, ref.collection, ref.name)) {
      violations.push(
        `ICON-REF-01: ${ref.file}:${ref.line} — Icon '${ref.name}' (${ref.vendor}/${ref.collection}) does not exist in generated icon components.`,
      );
    }
  }

  for (const w of warnings) context.logger.warn(w);

  return violations.length > 0
    ? failResult("icon.references.validate", violations)
    : passResult(
        "icon.references.validate",
        `Validated ${checkedCount} icon reference(s) against ${availableIcons.size} available icon(s)`,
      );
}
