/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/humans.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted humans commands from public-surface.ts into public-surface/humans.ts.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  buildHumansTxt,
  diagnostics,
  loadPublicContext,
  readTextIfExists,
  workspaceRel,
  writeGeneratedTextFile,
} from "./shared.ts";

export async function runHumansGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const humansPath = join(app.publicDirectory, "humans.txt");
  const status = await writeGeneratedTextFile(context, humansPath, buildHumansTxt(app));
  return {
    data: { status, file: humansPath },
    exitCode: 0,
    summary: `humans.generate: ${status}`,
  };
}

export async function runHumansValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const humansPath = join(app.publicDirectory, "humans.txt");
  const rel = workspaceRel(context, humansPath);
  const body = await readTextIfExists(context, humansPath);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  if (!body) {
    messages.push({
      severity: "error",
      file: rel,
      message: "Missing humans.txt.",
      fixHint: "Run humans.generate.",
    });
  } else {
    for (const marker of [
      "/* TEAM */",
      "/* AUTHORS AND CREDITS */",
      "/* SITE */",
      "/* TECHNOLOGY */",
    ]) {
      if (!body.includes(marker)) {
        messages.push({
          severity: "error",
          file: rel,
          message: `humans.txt is missing section ${marker}.`,
          fixHint: "Regenerate humans.txt from the public artifact generator.",
        });
      }
    }
  }
  const layoutPath = join(
    context.workspaceRoot,
    "packages",
    "ui",
    "src",
    "components",
    "layout",
    "layout-component.astro",
  );
  const layout = await readTextIfExists(context, layoutPath);
  if (!layout?.includes('rel="author"') || !layout.includes('href="/humans.txt"')) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, layoutPath),
      message: 'Shared layout must link humans.txt from <head> with rel="author".',
      fixHint:
        'Add <link type="text/plain" rel="author" href="/humans.txt"> to the shared layout head.',
    });
  }
  return diagnostics("humans.validate", messages);
}
