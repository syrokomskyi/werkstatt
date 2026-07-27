/*
<MODULE_CONTRACT>
<purpose>
schema.drift.validate — scans apps/<app>/src/content/schemas/ for any non-proxy Zod schema
definition and exits non-zero if found, preventing reintroduction of app-local schemas
after the RFC-0033 migration (DNA-10, RFC-0033).
</purpose>
<non-goals>
  <item>Do not validate propsSchema in manifest.yaml — that is page.block.validate.</item>
  <item>Do not flag plain TypeScript interfaces — only Zod schema definitions.</item>
  <item>Do not scan packages/ — only apps/<app>/src/content/schemas/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0033: Initial creation — schema.drift.validate command implementation.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { resultFromViolations } from "./result-helpers.ts";

// Pattern that matches a direct Zod schema definition (not a re-export proxy).
// Matches: z.object(, z.string(, z.enum(, z.array(, z.record(, z.union(, z.literal(
// A file is a proxy if it ONLY contains export * from "..." or export { X } from "..." lines.
const ZOD_DEFINITION_PATTERN =
  /\bz\.(object|string|number|boolean|enum|array|record|union|literal|infer)\s*[(<(]/;

// A file is a proxy if every non-blank, non-comment line is a re-export.
const PROXY_LINE_PATTERN = /^\s*(export\s+[{*]|\/\/|\/\*|\*|$)/;

function isProxyFile(content: string): boolean {
  const lines = content.split("\n");
  return lines.every((line) => PROXY_LINE_PATTERN.test(line));
}

async function collectTsFiles(dir: string): Promise<string[]> {
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
      results.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function scanApp(appDir: string, siteName: string): Promise<string[]> {
  const schemasDir = join(appDir, "src", "content", "schemas");
  const files = await collectTsFiles(schemasDir);
  const violations: string[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    // Skip proxy files (pure re-exports)
    if (isProxyFile(content)) continue;

    // Check for Zod schema definitions
    if (ZOD_DEFINITION_PATTERN.test(content)) {
      const rel = relative(appDir, filePath).replace(/\\/g, "/");
      violations.push(
        `SD-01: ${siteName}/${rel}: non-proxy Zod schema definition found. ` +
          `App-local schemas were retired in RFC-0033. ` +
          `Move shared schemas to @gogol/share or use plain TypeScript interfaces in @gogol/ui.`,
      );
    }
  }

  return violations;
}

export async function runSchemaDriftValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const workspaceRoot = context.workspaceRoot;

  if (context.site?.directory) {
    // Single-app scan
    const siteName = context.site.name ?? "unknown";
    violations.push(...(await scanApp(context.site.directory, siteName)));
  } else {
    // Workspace-wide scan — iterate apps/*/
    const appsDir = join(workspaceRoot, "apps");
    let appEntries;
    try {
      appEntries = await readdir(appsDir, { withFileTypes: true });
    } catch {
      return resultFromViolations("schema.drift.validate", violations);
    }
    for (const entry of appEntries) {
      if (!entry.isDirectory()) continue;
      const appDir = join(appsDir, entry.name);
      violations.push(...(await scanApp(appDir, entry.name)));
    }
  }

  return resultFromViolations("schema.drift.validate", violations);
}
