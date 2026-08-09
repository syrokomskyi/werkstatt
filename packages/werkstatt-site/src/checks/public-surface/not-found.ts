/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/not-found.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted not-found commands from public-surface.ts into public-surface/not-found.ts.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import { diagnostics, loadPublicContext, readTextIfExists, workspaceRel } from "./shared.ts";
import { passResult } from "../result-helpers.ts";

export async function runNotFoundGenerate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return passResult(
    "not-found.generate",
    "not-found.generate: generated 404 route is emitted by routes.generate",
  );
}

export async function runNotFoundValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const routePath = join(app.appDirectory, "src", "pages", "404.astro");
  const componentPath = join(
    context.workspaceRoot,
    "packages",
    "ui",
    "src",
    "components",
    "not-found",
    "not-found-component.astro",
  );
  const cssPath = join(
    context.workspaceRoot,
    "packages",
    "ui",
    "src",
    "components",
    "not-found",
    "not-found-component.css",
  );
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  const route = await readTextIfExists(context, routePath);
  if (!route) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, routePath),
      message: "Missing generated src/pages/404.astro.",
      fixHint: "Run routes.generate.",
    });
  } else {
    if (!hasGeneratedMarker(route)) {
      messages.push({
        severity: "error",
        file: workspaceRel(context, routePath),
        message: "src/pages/404.astro must carry the generated marker.",
        fixHint:
          "Regenerate via routes.generate unless the owner intentionally converts it to project-specific ownership.",
      });
    }
    if (!route.includes("@warpgogol/ui/components/not-found/not-found-component.astro")) {
      messages.push({
        severity: "error",
        file: workspaceRel(context, routePath),
        message: "src/pages/404.astro must import the shared @warpgogol/ui not-found component.",
        fixHint: "Regenerate via routes.generate.",
      });
    }
    if (!route.includes("Astro.response.status = 404")) {
      messages.push({
        severity: "error",
        file: workspaceRel(context, routePath),
        message: "src/pages/404.astro must set Astro.response.status = 404.",
        fixHint: "Regenerate via routes.generate.",
      });
    }
    if (/<style[\s>]/i.test(route)) {
      messages.push({
        severity: "error",
        file: workspaceRel(context, routePath),
        message: "Generated 404 route must not contain app-local style blocks.",
        fixHint: "Keep 404 styling inside @warpgogol/ui.",
      });
    }
  }
  if (!(await context.io.exists(componentPath)) || !(await context.io.exists(cssPath))) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, componentPath),
      message: "Shared not-found component and CSS must exist in @warpgogol/ui.",
      fixHint: "Add packages/ui/src/components/not-found/not-found-component.astro and .css.",
    });
  }
  return diagnostics("not-found.validate", messages);
}
