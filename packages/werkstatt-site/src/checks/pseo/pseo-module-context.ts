/*
<MODULE_CONTRACT>
<purpose>
  RFC-0271 command/runtime helper for Programmatic Surface module contexts declared in
  app src/content/system.md. This file is the I/O boundary around the pure @warpgogol/werkstatt-site/surface
  module-context contract.
</purpose>
<non-goals>
  <item>Do not mutate system.md.</item>
  <item>Do not make LLM calls or interpret Blueprint axis policy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0271: add surface.context.validate and shared module-context loading for PSEO commands.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import {
  findDuplicateBlueprintClaims,
  findModuleForBlueprint,
  type SurfaceModuleContext,
} from "@warpgogol/werkstatt-site/surface";
import { loadSurfaceModuleContexts, type LoadedModuleContexts } from "@warpgogol/werkstatt-site/surface/io";
import { diagnosticsResult } from "../result-helpers.ts";

export { loadSurfaceModuleContexts, type LoadedModuleContexts };

export async function moduleForBlueprint(
  appDir: string,
  blueprintId: string,
): Promise<SurfaceModuleContext | undefined> {
  const { modules } = await loadSurfaceModuleContexts(appDir);
  return findModuleForBlueprint(modules, blueprintId);
}

export async function runSurfaceContextValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "surface.context.validate must run inside an app context.",
    };
  }

  const diagnostics: Diagnostic[] = [];
  let loaded: LoadedModuleContexts;
  try {
    loaded = await loadSurfaceModuleContexts(app.directory);
  } catch (error) {
    diagnostics.push({
      ruleId: "PSEO-CTX-01",
      severity: "error",
      file: "src/content/system.md",
      message: `surface.modules is malformed: ${error instanceof Error ? error.message : String(error)}`,
      fixHint: "Declare surface.modules with valid RFC-0271 module context fields.",
    });
    return diagnosticsResult("surface.context.validate", diagnostics);
  }

  const supported = new Set(loaded.supportedLocales);
  const moduleList = Object.values(loaded.modules);
  if (loaded.declaredBlueprints.length > 0 && moduleList.length === 0) {
    diagnostics.push({
      ruleId: "PSEO-CTX-02",
      severity: "error",
      file: "src/content/system.md",
      message: "surface.blueprints is declared but surface.modules is missing.",
      fixHint: "Add a surface.modules.<id> context that owns each adopted Blueprint.",
    });
  }

  const duplicates = findDuplicateBlueprintClaims(loaded.modules);
  for (const duplicate of duplicates) {
    diagnostics.push({
      ruleId: "PSEO-CTX-03",
      severity: "error",
      file: "src/content/system.md",
      message: `Blueprint "${duplicate.blueprint}" is claimed by multiple modules: ${duplicate.modules.join(", ")}.`,
      fixHint: "Ensure each Blueprint has exactly one owning module context.",
    });
  }

  for (const module of moduleList) {
    if (!supported.has(module.masterLocale)) {
      diagnostics.push({
        ruleId: "PSEO-CTX-04",
        severity: "error",
        file: "src/content/system.md",
        message: `Module "${module.id}" masterLocale "${module.masterLocale}" is not a supported locale.`,
        fixHint: `Use one of: ${loaded.supportedLocales.join(", ")}.`,
      });
    }
    for (const locale of module.publishedLocales) {
      if (!supported.has(locale)) {
        diagnostics.push({
          ruleId: "PSEO-CTX-04",
          severity: "error",
          file: "src/content/system.md",
          message: `Module "${module.id}" published locale "${locale}" is not supported by the site.`,
          fixHint: `Use one of: ${loaded.supportedLocales.join(", ")}.`,
        });
      }
      if (!module.localization?.glossaryRefs?.[locale]) {
        diagnostics.push({
          ruleId: "PSEO-CTX-05",
          severity: "warning",
          file: "src/content/system.md",
          message: `Module "${module.id}" published locale "${locale}" has no glossaryRef.`,
          fixHint: "Add surface.modules.<id>.localization.glossaryRefs for every published locale.",
        });
      }
      if (!module.localization?.translatorNoteRefs?.[locale]) {
        diagnostics.push({
          ruleId: "PSEO-CTX-06",
          severity: "warning",
          file: "src/content/system.md",
          message: `Module "${module.id}" published locale "${locale}" has no translatorNoteRef.`,
          fixHint:
            "Add surface.modules.<id>.localization.translatorNoteRefs for every published locale.",
        });
      }
    }
    if (module.generation.normalBuildCallsLlm !== false) {
      diagnostics.push({
        ruleId: "PSEO-CTX-07",
        severity: "error",
        file: "src/content/system.md",
        message: `Module "${module.id}" must set generation.normalBuildCallsLlm to false.`,
        fixHint: "Keep LLM generation in explicit offline commands, never in deterministic builds.",
      });
    }
    if (module.entitlement === "pseo") {
      if (!module.stage) {
        diagnostics.push({
          ruleId: "PSEO-CTX-09",
          severity: "error",
          file: "src/content/system.md",
          message: `Module "${module.id}" is missing a stage declaration (RFC-0277).`,
          fixHint:
            "Add stage: internalCapability | managedVisibility | productModule to surface.modules.<id>.",
        });
      }
      if (!module.urlPolicy) {
        diagnostics.push({
          ruleId: "PSEO-CTX-10",
          severity: "error",
          file: "src/content/system.md",
          message: `Module "${module.id}" is missing a urlPolicy declaration (RFC-0277).`,
          fixHint: "Add urlPolicy: nonDestruction to surface.modules.<id>.",
        });
      }
    }
  }

  for (const blueprint of loaded.declaredBlueprints) {
    const owner = findModuleForBlueprint(loaded.modules, blueprint);
    if (!owner) {
      diagnostics.push({
        ruleId: "PSEO-CTX-08",
        severity: "error",
        file: "src/content/system.md",
        message: `Declared Blueprint "${blueprint}" has no owning module context.`,
        fixHint: "Add the Blueprint id to exactly one surface.modules.<id>.blueprints list.",
      });
    }
  }

  return diagnosticsResult("surface.context.validate", diagnostics);
}
