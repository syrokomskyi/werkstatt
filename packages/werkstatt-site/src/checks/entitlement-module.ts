import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>RFC-0240: entitlement.module.validate — compiled modules/routes must be a subset of the resolved entitlement set.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0240: add entitlement coverage validation for compiled surface blueprints.</item>
  <item>RFC-0271: resolve required entitlements from surface.modules instead of a hard-coded Blueprint map.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { loadSurfaceModuleContexts } from "./pseo/pseo-module-context.ts";

export async function runEntitlementModuleValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "entitlement.module.validate must run inside an app context." };
  }

  const violations: string[] = [];

  // Read resolved entitlements
  let resolved: { features?: string[] } = {};
  try {
    const raw = await readFile(join(app.directory, "src", "entitlements.generated.yaml"), "utf8");
    resolved = yamlParse(raw) as { features?: string[] };
  } catch {
    // No entitlements file = no features = everything must be zero
  }

  const entitled = new Set(resolved.features ?? []);

  // Read declared blueprints from system.md to infer which modules are compiled
  let declaredBlueprints: string[] = [];
  try {
    const { loadSystemManifest } = await import("@warpgogol/werkstatt-site/content");
    const { manifest } = await loadSystemManifest(join(app.directory, "src", "content"));
    const surface = (manifest as unknown as { surface?: { blueprints?: unknown } }).surface;
    declaredBlueprints = Array.isArray(surface?.blueprints) ? surface.blueprints.map(String) : [];
  } catch {
    // no-op
  }

  const { modules } = await loadSurfaceModuleContexts(app.directory).catch(() => ({
    modules: {},
    declaredBlueprints: [],
    supportedLocales: [],
  }));
  const moduleList = Object.values(modules);

  for (const bp of declaredBlueprints) {
    const owner = moduleList.find((module) => module.blueprints.includes(bp));
    const required = owner?.entitlement;
    if (required && !entitled.has(required)) {
      violations.push(
        `module-not-entitled: Blueprint "${bp}" is owned by module "${owner.id}" and requires entitlement "${required}" but it is not resolved`,
      );
    } else if (!owner) {
      violations.push(
        `module-context-missing: Blueprint "${bp}" has no surface.modules owner; declare one in system.md`,
      );
    }
  }

  if (violations.length > 0) {
    return failResult("entitlement.module.validate", violations);
  }
  return passResult(
    "entitlement.module.validate",
    `ok (${declaredBlueprints.length} blueprint(s) entitled)`,
  );
}
