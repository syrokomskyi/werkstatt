/*
<MODULE_CONTRACT>
<purpose>
RFC-0292: fleet agent catalog command layer. fleet.agent.catalog.generate reads
every site's built discovery document (apps/<path>/public/.well-known/agent.json
or mission workpiece equivalent) and folds them into one deterministic catalog
at fleet/agent-catalog.generated.yaml. fleet.agent.catalog.validate checks
coherence: staleness (FAC-01), malformed docs (FAC-02), duplicate baseUrls
(FAC-03), unsigned-surface posture drift (FAC-04), and capability version skew
(FAC-05).
</purpose>
<non-goals>
  <item>Do not fetch agent.json from the network — read from the repo tree only.</item>
  <item>Do not add per-site data beyond the public discovery document.</item>
  <item>Do not make any runtime component depend on the catalog — operator/build-plane only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0292: initial fleet agent catalog generate + validate commands.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  buildGeneratedHeader,
  stripGeneratedMarker,
} from "@warpgogol/site-kernel";
import {
  buildFleetAgentCatalog,
  type FleetAgentCatalog,
  type FleetAgentCatalogSiteInput,
} from "@warpgogol/share/agent";
import { diagnosticsResult } from "./result-helpers.ts";

const CATALOG_FILE = "fleet/agent-catalog.generated.yaml";
const FLEET_SITES_FILE = "fleet/fleet.sites.yaml";
const AGENT_JSON_REL = "public/.well-known/agent.json";

interface FleetSiteRef {
  site: string;
  path: string;
}

interface FleetMembership {
  sites?: FleetSiteRef[];
}

async function loadFleetSites(
  workspaceRoot: string,
): Promise<{ sites: FleetSiteRef[]; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const path = join(workspaceRoot, FLEET_SITES_FILE);
  if (!existsSync(path)) {
    return { sites: [], diagnostics };
  }
  try {
    const parsed = stripGeneratedMarker(await readFile(path, "utf8")).content;
    const membership = parseYaml(parsed) as FleetMembership;
    const sites = (membership.sites ?? []).filter((s) => s.site && s.path);
    return { sites, diagnostics };
  } catch (error) {
    diagnostics.push({
      ruleId: "FAC-02",
      severity: "error",
      file: FLEET_SITES_FILE,
      message: `Fleet sites file is malformed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { sites: [], diagnostics };
  }
}

async function loadAgentJson(
  workspaceRoot: string,
  siteRef: FleetSiteRef,
): Promise<{ doc: Record<string, unknown> | null; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const absPath = join(workspaceRoot, siteRef.path, AGENT_JSON_REL);
  if (!existsSync(absPath)) {
    return { doc: null, diagnostics };
  }
  try {
    const raw = await readFile(absPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { doc: parsed, diagnostics };
  } catch (error) {
    diagnostics.push({
      ruleId: "FAC-02",
      severity: "error",
      file: relative(workspaceRoot, absPath),
      message: `agent.json for site "${siteRef.site}" is malformed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { doc: null, diagnostics };
  }
}

// ---------------------------------------------------------------------------
// fleet.agent.catalog.generate
// ---------------------------------------------------------------------------

export async function runFleetAgentCatalogGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const { workspaceRoot } = context;
  const { sites, diagnostics } = await loadFleetSites(workspaceRoot);

  const inputs: FleetAgentCatalogSiteInput[] = [];
  for (const siteRef of sites) {
    const { doc, diagnostics: loadDiagnostics } = await loadAgentJson(workspaceRoot, siteRef);
    inputs.push({ site: siteRef.site, doc });
    diagnostics.push(...loadDiagnostics);
  }

  const catalog = buildFleetAgentCatalog(inputs);

  const outputPath = join(workspaceRoot, CATALOG_FILE);
  await mkdir(dirname(outputPath), { recursive: true });

  const header = buildGeneratedHeader({
    filePath: CATALOG_FILE,
    ownerCommand: "fleet.agent.catalog.generate",
  });
  const body = yamlStringify(catalog);
  const content = `${header}\n${body}`;

  await writeFile(outputPath, content, "utf8");

  return {
    exitCode: 0,
    summary: `fleet.agent.catalog.generate: ${catalog.sites.length} site(s) → ${CATALOG_FILE}`,
    data: {
      command: "fleet.agent.catalog.generate",
      sites: catalog.sites.length,
      contentHash: catalog.contentHash,
      written: CATALOG_FILE,
      diagnostics,
    },
  };
}

// ---------------------------------------------------------------------------
// fleet.agent.catalog.validate
// ---------------------------------------------------------------------------

export async function runFleetAgentCatalogValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const diagnostics: Diagnostic[] = [];

  const catalogPath = join(workspaceRoot, CATALOG_FILE);
  if (!existsSync(catalogPath)) {
    diagnostics.push({
      ruleId: "FAC-01",
      severity: "error",
      file: CATALOG_FILE,
      message: "Fleet agent catalog not found. Run fleet.agent.catalog.generate first.",
      fixHint: "Run: pnpm exec site-kernel run fleet.agent.catalog.generate",
    });
    return diagnosticsResult("fleet.agent.catalog.validate", diagnostics);
  }

  let catalog: FleetAgentCatalog;
  try {
    const raw = stripGeneratedMarker(await readFile(catalogPath, "utf8")).content;
    catalog = parseYaml(raw) as FleetAgentCatalog;
  } catch (error) {
    diagnostics.push({
      ruleId: "FAC-01",
      severity: "error",
      file: CATALOG_FILE,
      message: `Catalog is malformed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return diagnosticsResult("fleet.agent.catalog.validate", diagnostics);
  }

  // FAC-01: staleness — regenerate and compare bytes.
  const { sites, diagnostics: loadDiagnostics } = await loadFleetSites(workspaceRoot);
  diagnostics.push(...loadDiagnostics);

  const inputs: FleetAgentCatalogSiteInput[] = [];
  for (const siteRef of sites) {
    const { doc, diagnostics: agentDiagnostics } = await loadAgentJson(workspaceRoot, siteRef);
    inputs.push({ site: siteRef.site, doc });
    diagnostics.push(...agentDiagnostics);
  }

  const freshCatalog = buildFleetAgentCatalog(inputs);
  const freshYaml = yamlStringify(freshCatalog);
  const committedYaml = stripGeneratedMarker(await readFile(catalogPath, "utf8")).content;

  if (freshYaml.trim() !== committedYaml.trim()) {
    diagnostics.push({
      ruleId: "FAC-01",
      severity: "error",
      file: CATALOG_FILE,
      message:
        "Catalog is stale: regeneration produces different bytes (edited or apps rebuilt without regenerating).",
      fixHint: "Run: pnpm exec site-kernel run fleet.agent.catalog.generate",
    });
  }

  // FAC-02: malformed discovery documents are already reported during load above.
  // Also check for missing required fields in catalog entries.
  for (const entry of catalog.sites ?? []) {
    if (entry.enabled && (!entry.baseUrl || !entry.surfaceVersion)) {
      diagnostics.push({
        ruleId: "FAC-02",
        severity: "error",
        file: CATALOG_FILE,
        message: `Site "${entry.site}" has enabled: true but is missing required fields (baseUrl or surfaceVersion).`,
      });
    }
  }

  // FAC-03: duplicate baseUrls across enabled sites.
  const baseUrlMap = new Map<string, string[]>();
  for (const entry of catalog.sites ?? []) {
    if (!entry.enabled || !entry.baseUrl) continue;
    const existing = baseUrlMap.get(entry.baseUrl) ?? [];
    existing.push(entry.site);
    baseUrlMap.set(entry.baseUrl, existing);
  }
  for (const [baseUrl, siteList] of baseUrlMap) {
    if (siteList.length > 1) {
      diagnostics.push({
        ruleId: "FAC-03",
        severity: "error",
        file: CATALOG_FILE,
        message: `Duplicate baseUrl "${baseUrl}" across sites: ${siteList.join(", ")}.`,
      });
    }
  }

  // FAC-04: unsigned-surface posture drift (warning).
  const hasSigned = (catalog.sites ?? []).some((e) => e.signed);
  if (hasSigned) {
    for (const entry of catalog.sites ?? []) {
      if (entry.enabled && !entry.signed) {
        diagnostics.push({
          ruleId: "FAC-04",
          severity: "warning",
          file: CATALOG_FILE,
          message: `Site "${entry.site}" surface is unsigned while at least one fleet site is signed — posture drift.`,
        });
      }
    }
  }

  // FAC-05: capability id present on some sites at different capability versions (warning).
  // In v1 the catalog does not carry per-site capability versions (only ids), so
  // we check for the presence of the same action id across enabled sites with
  // different surfaceVersions — a proxy for potential vocabulary skew.
  const actionSites = new Map<string, Array<{ site: string; surfaceVersion: string }>>();
  for (const entry of catalog.sites ?? []) {
    if (!entry.enabled) continue;
    for (const actionId of entry.actions) {
      const list = actionSites.get(actionId) ?? [];
      list.push({ site: entry.site, surfaceVersion: entry.surfaceVersion });
      actionSites.set(actionId, list);
    }
  }
  for (const [actionId, siteList] of actionSites) {
    const versions = new Set(siteList.map((s) => s.surfaceVersion));
    if (versions.size > 1) {
      diagnostics.push({
        ruleId: "FAC-05",
        severity: "warning",
        file: CATALOG_FILE,
        message: `Capability "${actionId}" present on sites with different surfaceVersions: ${[...versions].join(", ")} — schedule alignment.`,
      });
    }
  }

  return {
    ...diagnosticsResult("fleet.agent.catalog.validate", diagnostics),
    summary: `fleet.agent.catalog.validate: ${catalog.sites?.length ?? 0} site(s), ${diagnostics.length} diagnostic(s)`,
  };
}
