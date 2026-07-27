/*
<MODULE_CONTRACT>
<purpose>
content-types.validate — confirms that every manifest.yaml in packages/ui/src/{components,sections}/
that has a contentSchemaKey field also has a matching .types.ts sibling in the same directory
(DNA-10, RFC-0034).
</purpose>
<non-goals>
  <item>Do not validate propsSchema (JSON Schema) — that is page.block.validate.</item>
  <item>Do not scan apps/ — only packages/ui/src/.</item>
  <item>Do not introduce Zod validation — plain TypeScript only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0034: Initial creation — content-types.validate command implementation.</item>
  <item>RFC-0262: also accept the generated &lt;name&gt;.types.generated.ts mirror.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { resultFromViolations } from "./result-helpers.ts";
import { fileExists } from "./lib/file-exists.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case contentSchemaKey to its expected PascalCase type name.
 * Examples:
 *   brand-label-component  → BrandLabelComponentContent
 *   hero-section           → HeroSectionContent
 *   layout                 → LayoutContent
 */
function toExpectedTypeName(contentSchemaKey: string): string {
  const pascal = contentSchemaKey
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  // If already ends with "Component" or "Section", append "Content"
  if (pascal.endsWith("Component") || pascal.endsWith("Section")) {
    return `${pascal}Content`;
  }
  // Otherwise (e.g. "Layout") just append "Content"
  return `${pascal}Content`;
}

async function collectManifests(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectManifests(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".manifest.yaml")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

export async function runContentTypesValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const workspaceRoot = context.workspaceRoot;

  const uiSrcDir = join(workspaceRoot, "packages", "ui", "src");
  const scanDirs = [join(uiSrcDir, "components"), join(uiSrcDir, "sections")];

  for (const scanDir of scanDirs) {
    const manifests = await collectManifests(scanDir);

    for (const manifestPath of manifests) {
      let rawContent: string;
      try {
        rawContent = await readFile(manifestPath, "utf8");
      } catch {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = parseYaml(rawContent);
      } catch (err) {
        violations.push(`CT-00: ${manifestPath}: YAML parse error — ${(err as Error).message}`);
        continue;
      }

      const doc = parsed as Record<string, unknown>;
      const contentSchemaKey = doc["contentSchemaKey"];

      // Only manifests with contentSchemaKey are required to have .types.ts
      if (typeof contentSchemaKey !== "string" || !contentSchemaKey) continue;

      const manifestDir = dirname(manifestPath);

      // Find the .types.ts file in the same directory
      let typesFile: string | undefined;
      let dirEntries;
      try {
        dirEntries = await readdir(manifestDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of dirEntries) {
        // RFC-0262: the generated mirror (<name>.types.generated.ts) satisfies
        // this contract too — it is the canonical form going forward.
        if (
          entry.isFile() &&
          (entry.name.endsWith(".types.ts") || entry.name.endsWith(".types.generated.ts"))
        ) {
          typesFile = join(manifestDir, entry.name);
          break;
        }
      }

      const relManifest = manifestPath
        .replace(workspaceRoot, "")
        .replace(/\\/g, "/")
        .replace(/^\//, "");

      if (!typesFile) {
        violations.push(
          `CT-01: ${relManifest}: has contentSchemaKey "${contentSchemaKey}" but no .types.ts sibling exists. ` +
            `Add a <name>.types.ts file per RFC-0034.`,
        );
        continue;
      }

      // Check that .types.ts exports the expected type name
      const expectedTypeName = toExpectedTypeName(contentSchemaKey);
      let typesContent: string;
      try {
        typesContent = await readFile(typesFile, "utf8");
      } catch {
        continue;
      }

      // Check for interface or type export matching the expected name
      const exportPattern = new RegExp(`export\\s+(interface|type)\\s+${expectedTypeName}\\b`);
      if (!exportPattern.test(typesContent)) {
        const relTypes = typesFile
          .replace(workspaceRoot, "")
          .replace(/\\/g, "/")
          .replace(/^\//, "");
        violations.push(
          `CT-02: ${relTypes}: expected export of \`${expectedTypeName}\` ` +
            `(derived from contentSchemaKey "${contentSchemaKey}") but it was not found. ` +
            `Ensure the file exports \`export interface ${expectedTypeName} { ... }\`.`,
        );
      }
    }
  }

  return resultFromViolations("content-types.validate", violations);
}
