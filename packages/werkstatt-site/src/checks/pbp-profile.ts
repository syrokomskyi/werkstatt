/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pbp-profile.ts as an authored site-kernel-checks module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate PBP content semantics — only structure and schema.</item>
  <item>Do not auto-fix missing content — report only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0024: Initial implementation of pbp.profile.validate command.</item>
  <item>Renamed from business-profile.ts to pbp-profile.ts; command renamed business.profile.validate → pbp.profile.validate.</item>
</CHANGE_SUMMARY>
*/

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";

interface PbpViolation {
  type: "missing" | "schema" | "localization";
  file?: string;
  message: string;
}

const REQUIRED_SCHEMAS = [
  { path: "business.md", label: "business" },
  { path: "web", label: "web", isDir: true },
  { path: "contact", label: "contact", isDir: true },
  { path: "places", label: "location", isDir: true },
];

export async function runPbpProfileValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: PbpViolation[] = [];
  const workspaceRoot = context.workspaceRoot;

  const siteName = context.site?.name;

  if (!siteName) {
    context.logger.error("Usage: pbp.profile.validate --site <name>");
    return { exitCode: 1, summary: "Missing required --site flag" };
  }

  const appPath = context.site?.directory ?? path.join(workspaceRoot, "apps", siteName);
  const pbpDir = path.join(appPath, "src", "content", "business-profile");

  try {
    await fs.access(pbpDir);
  } catch {
    violations.push({
      type: "missing",
      message: `PBP content directory not found: src/content/business-profile/`,
    });
    return {
      exitCode: 1,
      summary: `PBP profile validation failed for ${siteName}: ${violations.length} violation(s)`,
    };
  }

  const langDirs: string[] = [];
  try {
    const entries = await fs.readdir(pbpDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^[a-z]{2}$/.test(entry.name)) {
        langDirs.push(entry.name);
      }
    }
  } catch {
    // Empty or error
  }

  if (langDirs.length === 0) {
    violations.push({
      type: "missing",
      message:
        "No language directories found in src/content/business-profile/ (expected: de/, en/, etc.)",
    });
  }

  const defaultLang = langDirs[0];
  if (defaultLang) {
    const defaultLangDir = path.join(pbpDir, defaultLang);
    for (const schema of REQUIRED_SCHEMAS) {
      const schemaPath = path.join(defaultLangDir, schema.path);
      try {
        await fs.access(schemaPath);
      } catch {
        violations.push({
          type: "missing",
          file: `src/content/business-profile/${defaultLang}/${schema.path}`,
          message: `Required PBP schema missing: ${schema.path}`,
        });
      }
    }

    for (const lang of langDirs.slice(1)) {
      const langDir = path.join(pbpDir, lang);
      for (const schema of REQUIRED_SCHEMAS) {
        const schemaPath = path.join(langDir, schema.path);
        const defaultSchemaPath = path.join(defaultLangDir, schema.path);

        try {
          await fs.access(schemaPath);
          try {
            await fs.access(defaultSchemaPath);
          } catch {
            violations.push({
              type: "localization",
              file: `src/content/business-profile/${lang}/${schema.path}`,
              message: `Localization ${lang}/${schema.path} exists but default anchor ${defaultLang}/${schema.path} is missing`,
            });
          }
        } catch {
          // Overlay doesn't exist - that's fine, it's optional
        }
      }
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      const prefix = v.type.toUpperCase();
      context.logger.error(`${prefix}: ${v.message}${v.file ? ` (${v.file})` : ""}`);
    }
    return {
      exitCode: 1,
      summary: `PBP profile validation failed for ${siteName}: ${violations.length} violation(s)`,
    };
  }

  return {
    exitCode: 0,
    summary: `PBP profile validated successfully for ${siteName} (${langDirs.length} languages, ${REQUIRED_SCHEMAS.length} schemas)`,
  };
}
