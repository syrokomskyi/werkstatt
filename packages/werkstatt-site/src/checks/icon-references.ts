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
import { resolveIconFileName } from "../domain/ui/icons/resolve-icon-file-name.ts";
import { passResult, diagnosticsResult } from "./result-helpers.ts";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";
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

async function walkFilesWithExtension(dirPath: string, extensions: string[]): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkFilesWithExtension(fullPath, extensions)));
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
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
  return (
    "vendor" in o &&
    "collection" in o &&
    "name" in o &&
    typeof o.vendor === "string" &&
    typeof o.collection === "string" &&
    typeof o.name === "string"
  );
}

function isPartialIconConfig(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;
  const hasVendor = "vendor" in o && typeof o.vendor === "string";
  const hasCollection = "collection" in o && typeof o.collection === "string";
  const hasName = "name" in o && typeof o.name === "string";
  return hasVendor && !(hasVendor && hasCollection && hasName);
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

export async function runIconReferencesValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = getContentDisciplinePaths(context);
  const genDir = join(context.workspaceRoot, PACKAGE_ICONS_GEN_DIR);
  const diagnostics: Diagnostic[] = [];

  const genExists = await directoryExists(genDir);
  let astroFiles: string[] = [];
  if (genExists) {
    astroFiles = await walkFilesWithExtension(genDir, [".astro"]);
  }

  const availableIcons = buildAvailableIconIndex(astroFiles, genDir);

  if (!genExists || astroFiles.length === 0) {
    diagnostics.push({
      ruleId: "ICON-REF-02",
      severity: "warning",
      message: `Generated icon directory ${genExists ? "is empty" : "does not exist"} (${PACKAGE_ICONS_GEN_DIR}). Icon reference validation skipped.`,
      fixHint: `Run \`pnpm exec werkstatt run icons.generate --site <site-id>\` to generate icon components from JSON assets in src/assets/icons/.`,
    });
    return diagnosticsResult("icon.references.validate", diagnostics);
  }

  const contentDirs = [
    paths.pagesDirectory,
    paths.proseDirectory,
    paths.businessDirectory,
    paths.navigationDirectory,
    paths.siteDirectory,
  ];

  const mdFiles = (await Promise.all(contentDirs.map((d) => collectMarkdownFilesSafe(d)))).flat();
  const yamlFiles = (
    await Promise.all(contentDirs.map((d) => walkFilesWithExtension(d, [".yaml", ".yml"])))
  ).flat();

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
  const availableIconNames = [...availableIcons]
    .map((p) =>
      p
        .replace(/\.astro$/, "")
        .replace(/^[a-z]\//, "")
        .replace(/-icon$/, ""),
    )
    .sort();

  for (const ref of allRefs) {
    const hasAllFields = ref.vendor && ref.collection && ref.name;
    if (!hasAllFields) {
      const missing = [
        !ref.vendor && "vendor",
        !ref.collection && "collection",
        !ref.name && "name",
      ]
        .filter(Boolean)
        .join(", ");
      diagnostics.push({
        ruleId: "ICON-REF-03",
        severity: "error",
        file: ref.file,
        line: ref.line,
        message: `Malformed VendorIconConfig — missing field(s): ${missing}.`,
        fixHint: `Add the missing field(s) (vendor, collection, name) to the icon config at ${ref.file}:${ref.line}. A valid icon config looks like: { vendor: lordicon, collection: doodle-outline, name: FlagHover }.`,
      });
      continue;
    }

    checkedCount++;

    if (!iconExists(availableIcons, ref.vendor, ref.collection, ref.name)) {
      const suggestions = availableIconNames
        .filter((n) =>
          n.toLowerCase().includes(
            ref.name
              .toLowerCase()
              .replace(/hover$/i, "")
              .slice(0, 4),
          ),
        )
        .slice(0, 5);
      const hintParts = [
        `Either replace '${ref.name}' with an existing icon from ${ref.vendor}/${ref.collection}/ in packages/werkstatt-site/src/domain/ui/icons/gen/`,
      ];
      if (suggestions.length > 0) {
        hintParts.push(`Possible matches: ${suggestions.join(", ")}`);
      }
      hintParts.push(
        `Or add a new JSON asset to src/assets/icons/${ref.vendor}/${ref.collection}/ and run \`pnpm exec werkstatt run icons.generate --site <site-id>\`.`,
      );
      diagnostics.push({
        ruleId: "ICON-REF-01",
        severity: "error",
        file: ref.file,
        line: ref.line,
        message: `Icon '${ref.name}' (${ref.vendor}/${ref.collection}) does not exist in generated icon components.`,
        fixHint: hintParts.join(" "),
      });
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "icon.references.validate",
      `Validated ${checkedCount} icon reference(s) against ${availableIcons.size} available icon(s)`,
    );
  }

  return diagnosticsResult("icon.references.validate", diagnostics);
}
