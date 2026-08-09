/*
<MODULE_CONTRACT>
<purpose>Target I/O utilities for check-warpgogol: flag parsing, workspace path resolution, and target file reading.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation as part of check-warpgogol package extraction.</item>
</CHANGE_SUMMARY>
*/

import { isAbsolute, join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { parseCheckTarget, type CheckTarget } from "@warpgogol/check-core";

export function getStringFlag(input: KernelCommandInput, name: string): string | undefined {
  const value = input.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function resolveWorkspacePath(context: KernelRuntimeContext, path: string): string {
  return isAbsolute(path) ? path : join(context.workspaceRoot, path);
}

export async function readTargetFromFlag(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<{ target?: CheckTarget; diagnostics: import("@warpgogol/site-kernel").Diagnostic[] }> {
  const targetFile = getStringFlag(input, "target");
  if (!targetFile) {
    return {
      diagnostics: [
        {
          ruleId: "CW-TARGET-01",
          severity: "error",
          message: "Missing required --target path.",
          fixHint: "Pass --target <path-to-check-target.json>.",
        },
      ],
    };
  }
  const absolutePath = resolveWorkspacePath(context, targetFile);
  try {
    const raw = await context.io.readFile(absolutePath);
    return { target: parseCheckTarget(JSON.parse(raw)), diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        {
          ruleId: "CW-TARGET-01",
          severity: "error",
          message: `Target file "${targetFile}" is missing or malformed.`,
          fixHint: "Create a JSON target that matches CheckTarget from RFC-0293.",
          data: { error: error instanceof Error ? error.message : String(error) },
        },
      ],
    };
  }
}
