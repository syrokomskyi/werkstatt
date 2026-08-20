/*
<MODULE_CONTRACT>
<purpose>
agent.ard-catalog.generate writes the ARD (Agentic Resource Discovery) ai-catalog.json
projection of the Agent Surface Manifest to public/.well-known/ai-catalog.json.
agent.ard-catalog.validate enforces well-formedness and manifest↔catalog bijection (ARD-01..03).
</purpose>
<non-goals>
  <item>Do not touch the manifest itself — agent.manifest.generate owns it.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial ARD ai-catalog.json generator + validator for isitagentready.com ARD check.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { buildArdCatalog, type ArdCatalog } from "@warpgogol/werkstatt-shared/share/agent";
import { loadInternalManifest, readAgentBlock } from "./agent-shared.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const ARD_CATALOG_FILE = "public/.well-known/ai-catalog.json";

// ---------------------------------------------------------------------------
// agent.ard-catalog.generate
// ---------------------------------------------------------------------------

export async function runAgentArdCatalogGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const catalogPath = join(paths.appDirectory, ARD_CATALOG_FILE);

  if (!enabled) {
    if (await context.io.exists(catalogPath)) await context.io.rm(catalogPath);
    return {
      data: { command: "agent.ard-catalog.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.ard-catalog.generate: skipped — agent.enabled is false",
    };
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return {
      exitCode: 1,
      summary:
        "agent.ard-catalog.generate: no Agent Surface Manifest found. Run agent.manifest.generate first.",
    };
  }

  const siteName = systemManifest.identity?.systemStar ?? context.site?.name ?? "site";
  const catalog = buildArdCatalog(manifest, siteName);
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  await context.io.mkdir(join(paths.appDirectory, "public", ".well-known"));
  await context.io.writeFile(catalogPath, json);

  return {
    data: {
      command: "agent.ard-catalog.generate",
      status: "pass",
      site: context.site?.name,
      entryCount: catalog.entries.length,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `agent.ard-catalog.generate: dry-run — ${catalog.entries.length} entry(s)`
      : `agent.ard-catalog.generate: ${catalog.entries.length} entry(s) → ai-catalog.json`,
  };
}

// ---------------------------------------------------------------------------
// agent.ard-catalog.validate
// ---------------------------------------------------------------------------

export async function runAgentArdCatalogValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const catalogPath = join(paths.appDirectory, ARD_CATALOG_FILE);
  const diagnostics: Diagnostic[] = [];

  const exists = await context.io.exists(catalogPath);
  if (!enabled) {
    if (exists) {
      diagnostics.push({
        ruleId: "ARD-03",
        severity: "error",
        file: ARD_CATALOG_FILE,
        message: "agent.enabled is false but ai-catalog.json still exists on disk.",
        fixHint: "Rerun agent.ard-catalog.generate to remove the stale artifact.",
      });
    }
    return diagnosticsResult("agent.ard-catalog.validate", diagnostics);
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return diagnosticsResult("agent.ard-catalog.validate", diagnostics);
  }

  if (!exists) {
    diagnostics.push({
      ruleId: "ARD-01",
      severity: "error",
      file: ARD_CATALOG_FILE,
      message: "ai-catalog.json does not exist.",
      fixHint: "Run agent.ard-catalog.generate.",
    });
    return diagnosticsResult("agent.ard-catalog.validate", diagnostics);
  }

  let doc: ArdCatalog;
  try {
    doc = JSON.parse(await context.io.readFile(catalogPath)) as ArdCatalog;
  } catch {
    diagnostics.push({
      ruleId: "ARD-01",
      severity: "error",
      file: ARD_CATALOG_FILE,
      message: "ai-catalog.json is not valid JSON.",
      fixHint: "Rerun agent.ard-catalog.generate.",
    });
    return diagnosticsResult("agent.ard-catalog.validate", diagnostics);
  }

  const siteName = systemManifest.identity?.systemStar ?? context.site?.name ?? "site";
  const expected = buildArdCatalog(manifest, siteName);
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(doc);

  if (expectedJson !== actualJson) {
    diagnostics.push({
      ruleId: "ARD-02",
      severity: "error",
      file: ARD_CATALOG_FILE,
      message: "ai-catalog.json entries diverge from the current manifest.",
      fixHint: "Rerun agent.ard-catalog.generate.",
    });
  }

  return diagnosticsResult("agent.ard-catalog.validate", diagnostics);
}
