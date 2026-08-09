/*
<MODULE_CONTRACT>
<purpose>Auto-generate language detection middleware from content-declared i18n config (RFC-0038 Wave 4).</purpose>
<non-goals>
  <item>Do not implement detection logic — generate code that implements it.</item>
  <item>Do not modify system.md (read-only).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0038 Wave 4: Initial implementation of i18n.detect.implement command.</item>
</CHANGE_SUMMARY>
*/

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { generateLanguageDetectionMiddleware } from "@warpgogol/werkstatt-site/content";

const MIDDLEWARE_FILENAME = "language-detect.ts";
const CLIENT_SCRIPT_FILENAME = "language-persist.ts";

export async function runI18nDetectImplement(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  // Get app name from context (if --site was passed)
  const siteName = context.site?.name;
  const dryRun = context.dryRun;

  if (!siteName) {
    context.logger.error("Usage: i18n.detect.implement --site <name> [--dry-run]");
    return {
      exitCode: 1,
      summary: "Missing required --site flag",
    };
  }

  // Resolve app directory
  const workspaceRoot = context.workspaceRoot;
  const appDirectory = context.site?.directory ?? path.join(workspaceRoot, "apps", siteName);

  // Check if app exists
  try {
    await fs.access(appDirectory);
  } catch {
    context.logger.error(`Directory does not exist: ${appDirectory}`);
    return {
      exitCode: 1,
      summary: `App not found: ${siteName}`,
    };
  }

  // Generate middleware code
  let generated;
  try {
    generated = await generateLanguageDetectionMiddleware({
      appDirectory,
      generateClientScript: true,
    });
  } catch (error) {
    context.logger.error(error instanceof Error ? error.message : String(error));
    return {
      exitCode: 1,
      summary: "Failed to generate middleware",
    };
  }

  const middlewarePath = path.join(appDirectory, "src", "middleware", MIDDLEWARE_FILENAME);
  const clientScriptPath = path.join(appDirectory, "src", "scripts", CLIENT_SCRIPT_FILENAME);

  // Ensure directories exist
  const middlewareDir = path.dirname(middlewarePath);
  const scriptsDir = path.dirname(clientScriptPath);

  if (!dryRun) {
    try {
      await fs.mkdir(middlewareDir, { recursive: true });
      await fs.mkdir(scriptsDir, { recursive: true });
    } catch (error) {
      context.logger.error(error instanceof Error ? error.message : String(error));
      return {
        exitCode: 1,
        summary: "Failed to create directories",
      };
    }
  }

  // Write files (or show what would be written in dry-run)
  const writtenFiles: string[] = [];

  if (dryRun) {
    context.logger.info(`[DRY RUN] Would write: ${middlewarePath}`);
    context.logger.info(`[DRY RUN] Would write: ${clientScriptPath}`);
    context.logger.info(`Supported languages: ${generated.supportedLanguages.join(", ")}`);
    context.logger.info(`Default language: ${generated.defaultLanguage}`);
    return {
      exitCode: 0,
      summary: `[DRY RUN] Would generate files for ${siteName}`,
    };
  }

  // Write middleware file
  try {
    await fs.writeFile(middlewarePath, generated.middlewareCode, "utf-8");
    writtenFiles.push(middlewarePath);
  } catch (error) {
    context.logger.error(
      `Failed to write ${middlewarePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      exitCode: 1,
      summary: "Failed to write middleware file",
    };
  }

  // Write client script file
  if (generated.clientScriptCode) {
    try {
      await fs.writeFile(clientScriptPath, generated.clientScriptCode, "utf-8");
      writtenFiles.push(clientScriptPath);
    } catch (error) {
      context.logger.error(
        `Failed to write ${clientScriptPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        exitCode: 1,
        summary: "Failed to write client script file",
      };
    }
  }

  context.logger.info(`Written: ${middlewarePath}`);
  if (generated.clientScriptCode) {
    context.logger.info(`Written: ${clientScriptPath}`);
  }
  context.logger.info(`Supported languages: ${generated.supportedLanguages.join(", ")}`);
  context.logger.info(`Default language: ${generated.defaultLanguage}`);
  context.logger.info("\nNext steps:");
  context.logger.info(
    "1. Import middleware in src/middleware/index.ts: export { onRequest } from './language-detect.js';",
  );
  context.logger.info(
    "2. Import client script in your layout: import '../scripts/language-persist';",
  );

  return {
    exitCode: 0,
    summary: `Generated language detection for ${siteName}`,
  };
}
