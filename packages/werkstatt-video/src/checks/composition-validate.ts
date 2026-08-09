/*
<MODULE_CONTRACT>
<purpose>video.composition.validate — checks composition time model and entry point (WV-01, WV-08, RFC-0778).</purpose>
<keywords>validator, composition, video, editframe, time-model</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial composition validator — checks entry point exists (WV-08) and time model (WV-01).</item>
</CHANGE_SUMMARY>
*/

import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface CompositionValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface CompositionValidateData {
  command: string;
  status: "pass" | "fail";
  violations: CompositionValidateViolation[];
}

const COMPOSITION_ENTRY = "src/composition.tsx";

export async function validateComposition(
  projectRoot: string,
): Promise<KernelCommandResult<CompositionValidateData>> {
  const violations: CompositionValidateViolation[] = [];
  const compositionPath = join(projectRoot, COMPOSITION_ENTRY);

  // WV-08: Entry point exists
  try {
    await access(compositionPath);
  } catch {
    violations.push({
      ruleId: "WV-08",
      file: COMPOSITION_ENTRY,
      message: `Composition entry point not found: ${COMPOSITION_ENTRY}`,
    });
    return {
      data: { command: "video.composition.validate", status: "fail", violations },
      exitCode: 1,
      summary: `video.composition.validate: fail (${violations.length} violations)`,
    };
  }

  // WV-01: Parse time model from composition source
  const content = await readFile(compositionPath, "utf-8");

  const hasDuration = /\bduration\s*=\s*["'](\d+(?:\.\d+)?)(s|ms)["']/.test(content);
  const durationMatch = content.match(/\bduration\s*=\s*["'](\d+(?:\.\d+)?)(s|ms)["']/);
  let durationValue = 0;
  if (durationMatch) {
    const num = parseFloat(durationMatch[1]!);
    const unit = durationMatch[2];
    durationValue = unit === "ms" ? num / 1000 : num;
  }

  if (!hasDuration || durationValue <= 0) {
    violations.push({
      ruleId: "WV-01",
      file: COMPOSITION_ENTRY,
      message: "Root Timegroup duration must be > 0 (found: no valid duration attribute)",
    });
  }

  const fpsMatch = content.match(/\bfps\s*=\s*["']?(\d+)["']?/);
  const hasFps = fpsMatch !== null;
  const fpsValue = fpsMatch ? parseInt(fpsMatch[1]!, 10) : 30;

  if (hasFps && fpsValue <= 0) {
    violations.push({
      ruleId: "WV-01",
      file: COMPOSITION_ENTRY,
      message: `Root Timegroup fps must be > 0 (found: ${fpsValue})`,
    });
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "video.composition.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `video.composition.validate: ${status} (${violations.length} violations)`,
  };
}

export function createCompositionValidateCommand(): KernelCommandDefinition<CompositionValidateData> {
  return {
    name: "video.composition.validate",
    description: "Validate video composition time model and entry point (WV-01, WV-08)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateComposition(context.workspaceRoot);
    },
  };
}
