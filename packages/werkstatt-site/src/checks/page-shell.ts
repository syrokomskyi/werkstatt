/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/page-shell.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate content blocks — page.block.validate handles that.</item>
  <item>Do not modify system.md — report only.</item>
  <item>Do not validate BlocksRenderer rendering — runtime concern.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0036: Initial implementation of page.shell.validate command.</item>
</CHANGE_SUMMARY>
*/

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { pageIdToContentFileSlug } from "@warpgogol/werkstatt-site/share/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { readScopeFiles } from "./scope.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShellViolation {
  page: string;
  field: string;
  expected: string;
  actual: string;
  message: string;
}

export interface PageShellResult {
  command: "page.shell.validate";
  status: "pass" | "fail";
  app: string;
  violations: ShellViolation[];
  pagesScanned: number;
  shellBlocksFound: number;
}

interface ManifestInfo {
  cosmicName: string;
  version: string;
  propsSchema?: PropsSchema;
  filePath: string;
}

interface PropsSchema {
  type: string;
  additionalProperties?: boolean;
  properties?: Record<string, PropDef>;
}

interface PropDef {
  type: string;
  enum?: string[];
  default?: unknown;
  description?: string;
}

interface ShellBlockEntry {
  enabled?: boolean;
  cosmicMoon?: string;
  pin?: string;
  props?: Record<string, unknown>;
}

interface PageEntry {
  route?: string;
  cosmicStar?: string;
  shell?: {
    background?: ShellBlockEntry;
    header?: ShellBlockEntry;
    footer?: ShellBlockEntry;
  };
  planets?: unknown[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function collectMoonManifests(uiPackagePath: string): Promise<Map<string, ManifestInfo>> {
  const manifests = new Map<string, ManifestInfo>();
  const componentsDir = path.join(uiPackagePath, "components");

  let componentDirs: string[];
  try {
    componentDirs = await fs.readdir(componentsDir);
  } catch {
    return manifests;
  }

  for (const dir of componentDirs) {
    const dirPath = path.join(componentsDir, dir);
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    // Look for manifest.yaml files
    const manifestPath = path.join(dirPath, `${dir}-component.manifest.yaml`);
    try {
      const content = await fs.readFile(manifestPath, "utf-8");
      const parsed = parseYaml(content) as {
        cosmicName?: string;
        version?: string;
        propsSchema?: PropsSchema;
      };

      if (parsed.cosmicName) {
        manifests.set(parsed.cosmicName, {
          cosmicName: parsed.cosmicName,
          version: parsed.version ?? "0.0.0",
          propsSchema: parsed.propsSchema,
          filePath: manifestPath,
        });
      }
    } catch {
      // Skip unreadable manifests
    }
  }

  return manifests;
}

function validatePropsAgainstSchema(
  props: Record<string, unknown>,
  schema: PropsSchema,
  pageRoute: string,
  fieldPrefix: string,
): ShellViolation[] {
  const violations: ShellViolation[] = [];

  if (!schema.properties) return violations;

  // Check for unknown props
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(props)) {
      if (!(key in schema.properties)) {
        violations.push({
          page: pageRoute,
          field: `${fieldPrefix}.props.${key}`,
          expected: `one of: ${Object.keys(schema.properties).join(", ")}`,
          actual: key,
          message: `Unknown prop "${key}" — not in manifest propsSchema`,
        });
      }
    }
  }

  // Validate each prop value against schema
  for (const [key, def] of Object.entries(schema.properties)) {
    const value = props[key];
    if (value === undefined) continue; // Optional props are fine

    // Type check
    if (def.type === "string" && typeof value !== "string") {
      violations.push({
        page: pageRoute,
        field: `${fieldPrefix}.props.${key}`,
        expected: `string`,
        actual: typeof value,
        message: `Expected string, got ${typeof value}`,
      });
      continue;
    }

    if (def.type === "boolean" && typeof value !== "boolean") {
      violations.push({
        page: pageRoute,
        field: `${fieldPrefix}.props.${key}`,
        expected: `boolean`,
        actual: typeof value,
        message: `Expected boolean, got ${typeof value}`,
      });
      continue;
    }

    // Enum check
    if (def.enum && typeof value === "string" && !def.enum.includes(value)) {
      violations.push({
        page: pageRoute,
        field: `${fieldPrefix}.props.${key}`,
        expected: `enum: ${def.enum.join(", ")}`,
        actual: String(value),
        message: `Invalid value "${value}"`,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function runPageShellValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PageShellResult>> {
  const violations: ShellViolation[] = [];
  const workspaceRoot = context.workspaceRoot;
  const allow = readScopeFiles(input); // RFC-0139: optional --scope-files (null = whole-app)

  // Determine app
  const appSlug = context.site?.name ?? "";

  if (!appSlug || !context.site?.directory) {
    return {
      exitCode: 1,
      data: {
        command: "page.shell.validate",
        status: "fail",
        app: appSlug,
        violations: [],
        pagesScanned: 0,
        shellBlocksFound: 0,
      },
      summary: "No app in scope",
    };
  }

  const appDir = context.site.directory;
  const systemMdPath = path.join(appDir, "src", "content", "system.md");

  // Read system.md
  let systemContent: string;
  try {
    systemContent = await fs.readFile(systemMdPath, "utf-8");
  } catch {
    return {
      exitCode: 1,
      data: {
        command: "page.shell.validate",
        status: "fail",
        app: appSlug,
        violations: [
          {
            page: "*",
            field: "system.md",
            expected: "file exists",
            actual: "missing",
            message: "src/content/system.md not found",
          },
        ],
        pagesScanned: 0,
        shellBlocksFound: 0,
      },
      summary: `system.md not found for ${appSlug}`,
    };
  }

  const frontmatter = extractFrontmatter(systemContent);
  if (!frontmatter) {
    context.logger.error("system.md has no valid frontmatter");
    return {
      exitCode: 1,
      data: {
        command: "page.shell.validate",
        status: "fail",
        app: appSlug,
        violations: [
          {
            page: "*",
            field: "system.md",
            expected: "valid YAML frontmatter",
            actual: "parse error",
            message: "Could not parse system.md frontmatter",
          },
        ],
        pagesScanned: 0,
        shellBlocksFound: 0,
      },
      summary: "system.md parse error",
    };
  }

  const pages = (frontmatter.pages ?? []) as PageEntry[];

  // Collect MoonCatalog manifests from packages/ui
  const uiPackagePath = path.join(
    workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
  );
  const moonManifests = await collectMoonManifests(uiPackagePath);

  let shellBlocksFound = 0;
  const SHELL_SLOTS = ["background", "header", "footer"] as const;

  for (const page of pages) {
    const route = page.route ?? "(unknown)";
    // RFC-0139: page.shell.validate is pageId-keyed; map the --scope-files set to pageIds
    // by slug and skip pages outside the amend delta.
    if (allow) {
      const slug = pageIdToContentFileSlug(String((page as { pageId?: string }).pageId ?? ""));
      const inScope =
        slug.length > 0 &&
        [...allow].some((p) => p.includes("/pages/") && p.endsWith(`/${slug}.md`));
      if (!inScope) continue;
    }
    if (!page.shell) continue;

    for (const slot of SHELL_SLOTS) {
      const block = page.shell[slot];
      if (!block) continue;

      shellBlocksFound++;

      // Skip disabled blocks
      if (block.enabled === false) continue;

      // Validate cosmicMoon exists
      if (!block.cosmicMoon) {
        violations.push({
          page: route,
          field: `shell.${slot}.cosmicMoon`,
          expected: "MoonCatalog entry",
          actual: "(missing)",
          message: `shell.${slot} must specify cosmicMoon`,
        });
        continue;
      }

      const manifest = moonManifests.get(block.cosmicMoon);
      if (!manifest) {
        violations.push({
          page: route,
          field: `shell.${slot}.cosmicMoon`,
          expected: "MoonCatalog entry",
          actual: block.cosmicMoon,
          message: `${block.cosmicMoon} not found in MoonCatalog manifests`,
        });
        continue;
      }

      // Validate pin version
      if (block.pin && manifest.version !== block.pin) {
        // Version mismatch is a warning, not error
        context.logger.warn(
          `${route}: shell.${slot}.pin "${block.pin}" differs from manifest version "${manifest.version}"`,
        );
      }

      // Validate props against propsSchema
      if (block.props && manifest.propsSchema) {
        const propViolations = validatePropsAgainstSchema(
          block.props,
          manifest.propsSchema,
          route,
          `shell.${slot}`,
        );
        violations.push(...propViolations);
      }
    }
  }

  // Log violations
  for (const v of violations) {
    context.logger.error(
      `${v.page}: ${v.field} — ${v.message} (expected: ${v.expected}, got: ${v.actual})`,
    );
  }

  const status = violations.length === 0 ? "pass" : "fail";

  return {
    exitCode: status === "pass" ? 0 : 1,
    data: {
      command: "page.shell.validate",
      status,
      app: appSlug,
      violations,
      pagesScanned: pages.length,
      shellBlocksFound,
    },
    summary:
      violations.length === 0
        ? `Shell validation passed for ${appSlug} (${pages.length} pages, ${shellBlocksFound} shell blocks)`
        : `${violations.length} shell violation(s) in ${appSlug}`,
  };
}
