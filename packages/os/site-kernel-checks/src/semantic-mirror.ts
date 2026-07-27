/* <MODULE_CONTRACT>
<purpose>Ensures integrity between Astro routes and their corresponding semantic builders, enforcing compliance with defined semantic rules.</purpose>
<non-goals>
  <item>Do not modify the file structure of the application.</item>
  <item>Do not handle runtime errors unrelated to validation logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY> */

import { readFile, readdir } from "node:fs/promises";
import { join, relative, extname } from "node:path";

export interface SemanticMirrorViolation {
  rule: "missing-semantic-builder" | "orphaned-semantic-builder" | "hand-written-type-alias";
  file: string;
  message: string;
}

export interface SemanticMirrorResult {
  command: "semantic.mirror.validate";
  site: string;
  status: "pass" | "fail";
  violations: SemanticMirrorViolation[];
}

/**
 * Validates semantic layer mirror integrity according to RFC-0012 rules.
 *
 * Rules:
 * SM-01: Every .astro file in src/pages/[lang]/ must have corresponding .ts file in src/semantic/pages/
 * SM-02: Every .ts file in src/semantic/pages/ must correspond to .astro file in src/pages/[lang]/
 * SM-03: No hand-written type aliases that duplicate Zod schema types
 */
export async function runSemanticMirrorValidation(
  appPath: string,
  siteName: string,
): Promise<SemanticMirrorResult> {
  const violations: SemanticMirrorViolation[] = [];

  // SM-01 & SM-02: Validate route ↔ builder correspondence
  const routeViolations = await validateRouteBuilderMirror(appPath);
  violations.push(...routeViolations);

  // SM-03: Detect hand-written type aliases
  const typeViolations = await detectHandWrittenTypeAliases(appPath);
  violations.push(...typeViolations);

  return {
    command: "semantic.mirror.validate",
    site: siteName,
    status: violations.length === 0 ? "pass" : "fail",
    violations,
  };
}

/**
 * Validates SM-01 and SM-02: correspondence between Astro routes and semantic builders.
 */
async function validateRouteBuilderMirror(appPath: string): Promise<SemanticMirrorViolation[]> {
  const violations: SemanticMirrorViolation[] = [];

  const pagesDir = join(appPath, "src", "pages", "[lang]");
  const semanticDir = join(appPath, "src", "semantic", "pages");

  try {
    // Get all .astro files in pages directory (excluding machine-readable endpoints)
    const astroFiles = await getAstroRouteFiles(pagesDir);

    // Get all semantic builder files (excluding index.ts and _shared.ts)
    const semanticFiles = await getSemanticBuilderFiles(semanticDir, semanticDir);

    // SM-01: Check for missing semantic builders
    for (const astroFile of astroFiles) {
      const expectedBuilder = routeToSemanticBuilder(astroFile);
      if (!semanticFiles.includes(expectedBuilder)) {
        violations.push({
          rule: "missing-semantic-builder",
          file: relative(appPath, join(pagesDir, astroFile)),
          message: `Missing semantic builder: src/semantic/pages/${expectedBuilder}`,
        });
      }
    }

    // SM-02: Check for orphaned semantic builders
    for (const semanticFile of semanticFiles) {
      const expectedRoute = semanticToRoute(semanticFile);
      if (!astroFiles.includes(expectedRoute)) {
        violations.push({
          rule: "orphaned-semantic-builder",
          file: relative(appPath, join(semanticDir, semanticFile)),
          message: `Orphaned semantic builder: no corresponding route at src/pages/[lang]/${expectedRoute}`,
        });
      }
    }
  } catch (error) {
    // If directories don't exist, that's a separate issue
    console.warn(`Could not validate route-builder mirror: ${error}`);
  }

  return violations;
}

/**
 * Validates SM-03: detects hand-written type aliases that duplicate Zod schema types.
 */
async function detectHandWrittenTypeAliases(appPath: string): Promise<SemanticMirrorViolation[]> {
  const violations: SemanticMirrorViolation[] = [];
  const semanticDir = join(appPath, "src", "semantic");

  try {
    const tsFiles = await getAllTypeScriptFiles(semanticDir);

    for (const tsFile of tsFiles) {
      const content = await readFile(join(semanticDir, tsFile), "utf-8");

      // Look for type aliases that end with "Content" or "SectionContent"
      // but are not imported from @schemas
      const typeAliasMatches = content.matchAll(
        /type\s+(\w*(?:Content|SectionContent))\s*=\s*{[^}]+}/g,
      );

      for (const match of typeAliasMatches) {
        const typeName = match[1];

        // Check if this type is imported from @schemas
        const hasSchemaImport =
          content.includes(`from "@schemas/`) ||
          content.includes(`import.*${typeName}.*from "@schemas/`);

        if (!hasSchemaImport) {
          violations.push({
            rule: "hand-written-type-alias",
            file: relative(appPath, join(semanticDir, tsFile)),
            message: `Hand-written type alias "${typeName}" should be imported from @schemas/`,
          });
        }
      }
    }
  } catch (error) {
    console.warn(`Could not detect hand-written type aliases: ${error}`);
  }

  return violations;
}

/**
 * Gets all .astro route files, excluding machine-readable endpoints.
 */
async function getAstroRouteFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    const astroFiles: string[] = [];

    for (const file of files) {
      if (file.isFile() && extname(file.name) === ".astro") {
        // Exclude machine-readable endpoints
        if (!file.name.endsWith(".txt") && !file.name.endsWith(".json")) {
          astroFiles.push(file.name);
        }
      } else if (file.isDirectory()) {
        // Recursively check subdirectories
        const subFiles = await getAstroRouteFiles(join(dir, file.name));
        astroFiles.push(...subFiles.map((f) => `${file.name}/${f}`));
      }
    }

    return astroFiles;
  } catch {
    return [];
  }
}

/**
 * Gets all semantic builder .ts files recursively, excluding index.ts and _shared.ts.
 */
async function getSemanticBuilderFiles(dir: string, rootDir: string): Promise<string[]> {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    const tsFiles: string[] = [];

    for (const file of files) {
      const fullPath = join(dir, file.name);

      if (file.isFile() && file.name.endsWith(".ts") && file.name !== "_shared.ts") {
        // Only filter out index.ts at root level, allow index.ts in subdirectories
        if (file.name !== "index.ts" || dir === rootDir) {
          // Skip index.ts at root level, but include all other .ts files
          if (file.name !== "index.ts") {
            tsFiles.push(file.name);
          }
        } else {
          // Include index.ts files in subdirectories
          tsFiles.push(file.name);
        }
      } else if (file.isDirectory()) {
        const subFiles = await getSemanticBuilderFiles(fullPath, rootDir);
        tsFiles.push(...subFiles.map((f) => `${file.name}/${f}`));
      }
    }

    return tsFiles;
  } catch {
    return [];
  }
}

/**
 * Gets all TypeScript files recursively.
 */
async function getAllTypeScriptFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    const tsFiles: string[] = [];

    for (const file of files) {
      const fullPath = join(dir, file.name);

      if (file.isFile() && file.name.endsWith(".ts")) {
        tsFiles.push(file.name);
      } else if (file.isDirectory()) {
        const subFiles = await getAllTypeScriptFiles(fullPath);
        tsFiles.push(...subFiles.map((f) => `${file.name}/${f}`));
      }
    }

    return tsFiles;
  } catch {
    return [];
  }
}

/**
 * Converts .astro route filename to expected semantic builder filename.
 */
function routeToSemanticBuilder(routeFile: string): string {
  if (routeFile === "index.astro") {
    return "index-page.ts";
  }
  return routeFile.replace(".astro", ".ts");
}

/**
 * Converts semantic builder filename to expected .astro route filename.
 */
function semanticToRoute(semanticFile: string): string {
  if (semanticFile === "index-page.ts") {
    return "index.astro";
  }
  return semanticFile.replace(".ts", ".astro");
}
