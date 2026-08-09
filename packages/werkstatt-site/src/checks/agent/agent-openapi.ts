import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
RFC-0289: agent.openapi.generate writes the site's OpenAPI 3.1 projection of
the Agent Surface Manifest to public/.well-known/agent.openapi.json.
agent.openapi.validate enforces well-formedness and manifest↔document
bijection (AGO-01..04).
</purpose>
<non-goals>
  <item>Do not touch the manifest itself — agent.manifest.generate owns interfaces.openapi.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0289: initial OpenAPI generator + validator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import {
  formatAgentOpenApi,
  type AgentSurfaceManifest,
  type OpenApiDocument,
  type CapabilitySchemaInput,
} from "@warpgogol/share/agent";
import { loadCapabilityCatalog } from "./agent-capability.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const INTERNAL_MANIFEST_FILE = "src/agent-surface.generated.yaml";
const OPENAPI_FILE = "public/.well-known/agent.openapi.json";

interface AgentSystemBlock {
  enabled?: boolean;
}

function readAgentBlock(manifest: unknown): AgentSystemBlock {
  return ((manifest as Record<string, unknown>).agent as AgentSystemBlock | undefined) ?? {};
}

async function loadInternalManifest(
  context: KernelRuntimeContext,
  appDirectory: string,
): Promise<AgentSurfaceManifest | null> {
  const path = join(appDirectory, INTERNAL_MANIFEST_FILE);
  if (!(await context.io.exists(path))) return null;
  try {
    const {
      generatedMarker: _m,
      doNotEdit: _d,
      ownerCommand: _o,
      editInstead: _e,
      regenerateCommand: _r,
      ...rest
    } = yamlParse(await context.io.readFile(path)) as Record<string, unknown> &
      AgentSurfaceManifest;
    return rest as AgentSurfaceManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// agent.openapi.generate
// ---------------------------------------------------------------------------

export async function runAgentOpenApiGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const openapiPath = join(paths.appDirectory, OPENAPI_FILE);

  if (!enabled) {
    if (await context.io.exists(openapiPath)) await context.io.rm(openapiPath);
    return {
      data: { command: "agent.openapi.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.openapi.generate: skipped — agent.enabled is false",
    };
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return {
      exitCode: 1,
      summary:
        "agent.openapi.generate: no Agent Surface Manifest found. Run agent.manifest.generate first.",
    };
  }

  const { records: catalog } = await loadCapabilityCatalog(context.workspaceRoot);
  const activeIds = new Set(manifest.actions.map((a) => a.id));
  const capabilitySchemas: CapabilitySchemaInput[] = catalog
    .filter((c) => activeIds.has(c.id))
    .map((c) => ({ id: c.id, input: c.input, output: c.output }));

  const doc: OpenApiDocument = formatAgentOpenApi(manifest, capabilitySchemas);
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  await context.io.mkdir(join(paths.appDirectory, "public", ".well-known"));
  await context.io.writeFile(openapiPath, json);

  return {
    data: {
      command: "agent.openapi.generate",
      status: "pass",
      site: context.site?.name,
      pathCount: Object.keys(doc.paths).length,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `agent.openapi.generate: dry-run — ${Object.keys(doc.paths).length} path(s)`
      : `agent.openapi.generate: ${Object.keys(doc.paths).length} path(s) → agent.openapi.json`,
  };
}

// ---------------------------------------------------------------------------
// agent.openapi.validate
// ---------------------------------------------------------------------------

export async function runAgentOpenApiValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const openapiPath = join(paths.appDirectory, OPENAPI_FILE);
  const diagnostics: Diagnostic[] = [];

  const exists = await context.io.exists(openapiPath);
  if (!enabled) {
    if (exists) {
      diagnostics.push({
        ruleId: "AGO-01",
        severity: "error",
        file: OPENAPI_FILE,
        message: "agent.enabled is false but agent.openapi.json still exists on disk.",
        fixHint: "Rerun agent.openapi.generate to remove the stale artifact.",
      });
    }
    return diagnosticsResult("agent.openapi.validate", diagnostics);
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    // Nothing to cross-check without a manifest — agent.surface.validate reports the root cause.
    return diagnosticsResult("agent.openapi.validate", diagnostics);
  }

  if (!exists) {
    if (manifest.interfaces.openapi) {
      diagnostics.push({
        ruleId: "AGO-01",
        severity: "error",
        file: OPENAPI_FILE,
        message: "Manifest references an OpenAPI document that does not exist.",
        fixHint: "Run agent.openapi.generate.",
      });
    }
    return diagnosticsResult("agent.openapi.validate", diagnostics);
  }

  let doc: OpenApiDocument;
  try {
    doc = JSON.parse(await context.io.readFile(openapiPath)) as OpenApiDocument;
  } catch {
    diagnostics.push({
      ruleId: "AGO-01",
      severity: "error",
      file: OPENAPI_FILE,
      message: "agent.openapi.json is not valid JSON.",
      fixHint: "Rerun agent.openapi.generate.",
    });
    return diagnosticsResult("agent.openapi.validate", diagnostics);
  }

  if (doc.openapi !== "3.1.0") {
    diagnostics.push({
      ruleId: "AGO-01",
      severity: "error",
      file: OPENAPI_FILE,
      message: `Unexpected openapi version "${doc.openapi}" (expected "3.1.0").`,
      fixHint: "Rerun agent.openapi.generate.",
    });
  }

  if (
    doc.info?.version !== manifest.surfaceVersion ||
    doc.info?.["x-gogol-content-hash"] !== manifest.contentHash
  ) {
    diagnostics.push({
      ruleId: "AGO-03",
      severity: "error",
      file: OPENAPI_FILE,
      message: "info.version/x-gogol-content-hash disagree with the current manifest.",
      fixHint: "Rerun agent.manifest.generate then agent.openapi.generate.",
    });
  }

  // AGO-02: bijection — every manifest knowledge/action ref has exactly one matching
  // operation, and every path/operation in the document traces back to a manifest ref.
  const expectedPaths = new Set<string>();
  for (const ref of manifest.knowledge) {
    expectedPaths.add(ref.url);
    if (!doc.paths[ref.url]?.get) {
      diagnostics.push({
        ruleId: "AGO-02",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Missing GET operation for knowledge ref "${ref.domain}".`,
        fixHint: "Rerun agent.openapi.generate.",
      });
    }
  }
  for (const ref of manifest.actions) {
    expectedPaths.add(ref.url);
    if (!doc.paths[ref.url]?.post) {
      diagnostics.push({
        ruleId: "AGO-02",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Missing POST operation for action "${ref.id}".`,
        fixHint: "Rerun agent.openapi.generate.",
      });
    }
  }
  for (const path of Object.keys(doc.paths ?? {})) {
    if (!expectedPaths.has(path)) {
      diagnostics.push({
        ruleId: "AGO-02",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Path "${path}" has no corresponding manifest ref.`,
        fixHint: "Rerun agent.manifest.generate then agent.openapi.generate.",
      });
    }
  }

  // AGO-04: action request/response schemas must equal the capability record's input/output.
  const { records: catalog } = await loadCapabilityCatalog(context.workspaceRoot);
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  for (const ref of manifest.actions) {
    const record = catalogById.get(ref.id);
    const op = doc.paths[ref.url]?.post;
    if (!record || !op) continue;
    const requestSchema = op.requestBody?.content["application/json"].schema;
    const responseSchema = op.responses["200"]?.content?.["application/json"].schema;
    if (JSON.stringify(requestSchema) !== JSON.stringify(record.input)) {
      diagnostics.push({
        ruleId: "AGO-04",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Action "${ref.id}" request schema diverges from the capability's input schema.`,
        fixHint: "Rerun agent.openapi.generate; never hand-edit the generated document.",
      });
    }
    if (JSON.stringify(responseSchema) !== JSON.stringify(record.output)) {
      diagnostics.push({
        ruleId: "AGO-04",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Action "${ref.id}" response schema diverges from the capability's output schema.`,
        fixHint: "Rerun agent.openapi.generate; never hand-edit the generated document.",
      });
    }
  }

  return diagnosticsResult("agent.openapi.validate", diagnostics);
}
