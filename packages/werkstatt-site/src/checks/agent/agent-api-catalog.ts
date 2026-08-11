/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: agent.api-catalog.generate writes the RFC 9727 linkset+json projection
of the Agent Surface Manifest to public/.well-known/api-catalog.
agent.api-catalog.validate enforces well-formedness and manifest↔linkset
bijection (AGC-01..03).
</purpose>
<non-goals>
  <item>Do not touch the manifest itself — agent.manifest.generate owns it.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial API Catalog generator + validator.</item>
  <item>RFC-0783: use shared helpers from agent-shared.ts.</item>
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
import { buildApiCatalog, type ApiCatalog } from "@warpgogol/werkstatt-site/share/agent";
import { loadInternalManifest, readAgentBlock } from "./agent-shared.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const API_CATALOG_FILE = "public/.well-known/api-catalog";

// ---------------------------------------------------------------------------
// agent.api-catalog.generate
// ---------------------------------------------------------------------------

export async function runAgentApiCatalogGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const catalogPath = join(paths.appDirectory, API_CATALOG_FILE);

  if (!enabled) {
    if (await context.io.exists(catalogPath)) await context.io.rm(catalogPath);
    return {
      data: { command: "agent.api-catalog.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.api-catalog.generate: skipped — agent.enabled is false",
    };
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return {
      exitCode: 1,
      summary:
        "agent.api-catalog.generate: no Agent Surface Manifest found. Run agent.manifest.generate first.",
    };
  }

  const catalog = buildApiCatalog(manifest);
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  await context.io.mkdir(join(paths.appDirectory, "public", ".well-known"));
  await context.io.writeFile(catalogPath, json);

  const linkCount = Object.values(catalog.linkset[0]).reduce(
    (sum, val) => sum + (Array.isArray(val) ? val.length : 0),
    0,
  );

  return {
    data: {
      command: "agent.api-catalog.generate",
      status: "pass",
      site: context.site?.name,
      linkCount,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `agent.api-catalog.generate: dry-run — ${linkCount} link(s)`
      : `agent.api-catalog.generate: ${linkCount} link(s) → api-catalog`,
  };
}

// ---------------------------------------------------------------------------
// agent.api-catalog.validate
// ---------------------------------------------------------------------------

export async function runAgentApiCatalogValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const catalogPath = join(paths.appDirectory, API_CATALOG_FILE);
  const diagnostics: Diagnostic[] = [];

  const exists = await context.io.exists(catalogPath);
  if (!enabled) {
    if (exists) {
      diagnostics.push({
        ruleId: "AGC-03",
        severity: "error",
        file: API_CATALOG_FILE,
        message: "agent.enabled is false but api-catalog still exists on disk.",
        fixHint: "Rerun agent.api-catalog.generate to remove the stale artifact.",
      });
    }
    return diagnosticsResult("agent.api-catalog.validate", diagnostics);
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return diagnosticsResult("agent.api-catalog.validate", diagnostics);
  }

  if (!exists) {
    diagnostics.push({
      ruleId: "AGC-01",
      severity: "error",
      file: API_CATALOG_FILE,
      message: "api-catalog does not exist.",
      fixHint: "Run agent.api-catalog.generate.",
    });
    return diagnosticsResult("agent.api-catalog.validate", diagnostics);
  }

  let doc: ApiCatalog;
  try {
    doc = JSON.parse(await context.io.readFile(catalogPath)) as ApiCatalog;
  } catch {
    diagnostics.push({
      ruleId: "AGC-01",
      severity: "error",
      file: API_CATALOG_FILE,
      message: "api-catalog is not valid JSON.",
      fixHint: "Rerun agent.api-catalog.generate.",
    });
    return diagnosticsResult("agent.api-catalog.validate", diagnostics);
  }

  const expected = buildApiCatalog(manifest);
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(doc);

  if (expectedJson !== actualJson) {
    diagnostics.push({
      ruleId: "AGC-02",
      severity: "error",
      file: API_CATALOG_FILE,
      message: "api-catalog linkset entries diverge from the current manifest.",
      fixHint: "Rerun agent.api-catalog.generate.",
    });
  }

  return diagnosticsResult("agent.api-catalog.validate", diagnostics);
}
