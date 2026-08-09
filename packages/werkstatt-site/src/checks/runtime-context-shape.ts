/*
<MODULE_CONTRACT>
<purpose>
runtime.context.shape — validates that RuntimeContext in @warpgogol/werkstatt-site/share has
exactly three fields (locale, segment, flags) and that no workspace code
constructs a RuntimeContext with non-null segment or non-empty flags at MVP
(DNA-26, RFC-0026).
</purpose>
<non-goals>
  <item>Do not parse all TypeScript files — grep for construction patterns only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { resultFromViolations, failResult } from "./result-helpers.ts";
import { EMPTY_RUNTIME_CONTEXT, type RuntimeContext } from "@warpgogol/werkstatt-site/share/runtime-context";

// ---------------------------------------------------------------------------
// Patterns that indicate a manually constructed RuntimeContext
// (i.e., not using EMPTY_RUNTIME_CONTEXT)
// ---------------------------------------------------------------------------

const FORBIDDEN_PATTERNS = [
  {
    // segment set to a non-null, non-undefined value
    pattern: /segment\s*:\s*(?!null)[^\s,}\n]/,
    rule: "RC-01",
    message:
      "RuntimeContext.segment must be null at MVP. Use EMPTY_RUNTIME_CONTEXT(locale). RFC-0027 activates segment.",
  },
  {
    // flags set to a non-empty object literal
    pattern: /flags\s*:\s*\{[^}]+\}/,
    rule: "RC-02",
    message:
      "RuntimeContext.flags must be {} at MVP. Use EMPTY_RUNTIME_CONTEXT(locale). RFC-0027 activates flags.",
  },
];

// ---------------------------------------------------------------------------
// runRuntimeContextShape
// ---------------------------------------------------------------------------

export async function runRuntimeContextShape(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return failResult("runtime.context.shape", [(err as Error).message]);
  }

  // Shape check 1: EMPTY_RUNTIME_CONTEXT produces the canonical shape
  const ctx: RuntimeContext = EMPTY_RUNTIME_CONTEXT("de");

  const expectedKeys = ["locale", "segment", "flags"] as const;
  const actualKeys = Object.keys(ctx);

  for (const key of expectedKeys) {
    if (!actualKeys.includes(key)) {
      violations.push(`RC-00: RuntimeContext is missing required field "${key}"`);
    }
  }
  for (const key of actualKeys) {
    if (!(expectedKeys as readonly string[]).includes(key)) {
      violations.push(
        `RC-00: RuntimeContext has unexpected field "${key}" — the type is closed (DNA-26, RFC-0026)`,
      );
    }
  }

  if (ctx.segment !== null) {
    violations.push(
      `RC-01: EMPTY_RUNTIME_CONTEXT.segment must be null at MVP, got "${ctx.segment}"`,
    );
  }
  if (typeof ctx.flags !== "object" || ctx.flags === null) {
    violations.push("RC-02: EMPTY_RUNTIME_CONTEXT.flags must be an object");
  } else if (Object.keys(ctx.flags).length !== 0) {
    violations.push("RC-02: EMPTY_RUNTIME_CONTEXT.flags must be empty ({}) at MVP");
  }

  // Shape check 2: scan app TypeScript files for manual RuntimeContext construction
  // that bypasses EMPTY_RUNTIME_CONTEXT
  const srcDir = join(paths.appDirectory, "src");

  const tsFiles: string[] = [];
  try {
    const { readdir } = await import("node:fs/promises");
    const collect = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".astro") {
          await collect(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") ||
            entry.name.endsWith(".astro") ||
            entry.name.endsWith(".tsx"))
        ) {
          tsFiles.push(fullPath);
        }
      }
    };
    await collect(srcDir);
  } catch {
    // src/ doesn't exist — handled by app.layout.validate
  }

  for (const filePath of tsFiles) {
    const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    // Skip files that only use EMPTY_RUNTIME_CONTEXT (they're fine)
    // Look for inline object literals with segment/flags that override the no-op contract
    for (const { pattern, rule, message } of FORBIDDEN_PATTERNS) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          // Only flag if the file also imports or references RuntimeContext
          if (content.includes("RuntimeContext") || content.includes("runtime-context")) {
            violations.push(`${rel}:${i + 1}: ${rule} ${message}`);
          }
        }
      }
    }
  }

  return resultFromViolations("runtime.context.shape", violations);
}
