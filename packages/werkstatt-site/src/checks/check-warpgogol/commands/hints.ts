/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-check-warpgogol/src/commands/hints.ts as an authored site-kernel-check-warpgogol authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { containsSecretLikeText } from "@warpgogol/werkstatt-site/check-core";
import { parseWarpgogolCheckHints } from "@warpgogol/werkstatt-site/share/check-hints";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../result.ts";
import { buildHintsFromManifest } from "./helpers.ts";

export async function runWarpgogolCheckHintsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const hints = buildHintsFromManifest(manifest, context.site?.name ?? "site");
  const outputPath = join(paths.appDirectory, "public", ".well-known", "warpgogol-check.json");
  await context.io.mkdir(join(paths.appDirectory, "public", ".well-known"));
  await context.io.writeFile(outputPath, `${JSON.stringify(hints, null, 2)}\n`);
  return {
    exitCode: 0,
    summary: "warpgogol.check-hints.generate: pass",
    data: {
      path: "public/.well-known/warpgogol-check.json",
      startPathCount: hints.preferredStartPaths.length,
    },
  };
}

export async function runWarpgogolCheckHintsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const file = join(paths.appDirectory, "public", ".well-known", "warpgogol-check.json");
  try {
    const hints = parseWarpgogolCheckHints(JSON.parse(await context.io.readFile(file)));
    const diagnostics: Diagnostic[] = [];
    if (containsSecretLikeText(JSON.stringify(hints))) {
      diagnostics.push({
        ruleId: "CW-HINT-02",
        severity: "error",
        file: "public/.well-known/warpgogol-check.json",
        message: "Check hints contain a secret-like token.",
        fixHint: "Remove private data from the public hints artifact.",
      });
    }
    return diagnosticsResult("warpgogol.check-hints.validate", diagnostics);
  } catch (error) {
    return diagnosticsResult("warpgogol.check-hints.validate", [
      {
        ruleId: "CW-HINT-01",
        severity: "error",
        file: "public/.well-known/warpgogol-check.json",
        message: "warpgogol-check.json is missing or malformed.",
        fixHint: "Run warpgogol.check-hints.generate for this app.",
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    ]);
  }
}
