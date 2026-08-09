/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: agent.mcp-card.generate writes the SEP-1649 MCP Server Card projection
of the Agent Surface Manifest to public/.well-known/mcp/server-card.json.
agent.mcp-card.validate enforces well-formedness and manifest↔card bijection
(AGM-01..03).
</purpose>
<non-goals>
  <item>Do not touch the manifest itself — agent.manifest.generate owns it.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial MCP Server Card generator + validator.</item>
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
import { buildMcpServerCard, type McpServerCard } from "@warpgogol/werkstatt-site/share/agent";
import { loadInternalManifest, readAgentBlock } from "./agent-shared.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const MCP_CARD_FILE = "public/.well-known/mcp/server-card.json";

// ---------------------------------------------------------------------------
// agent.mcp-card.generate
// ---------------------------------------------------------------------------

export async function runAgentMcpCardGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const cardPath = join(paths.appDirectory, MCP_CARD_FILE);

  if (!enabled) {
    if (await context.io.exists(cardPath)) await context.io.rm(cardPath);
    return {
      data: { command: "agent.mcp-card.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.mcp-card.generate: skipped — agent.enabled is false",
    };
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return {
      exitCode: 1,
      summary:
        "agent.mcp-card.generate: no Agent Surface Manifest found. Run agent.manifest.generate first.",
    };
  }

  const card = buildMcpServerCard(manifest);
  if (!card) {
    if (await context.io.exists(cardPath)) await context.io.rm(cardPath);
    return {
      data: { command: "agent.mcp-card.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.mcp-card.generate: skipped — manifest.interfaces.mcp is null",
    };
  }

  const json = `${JSON.stringify(card, null, 2)}\n`;
  await context.io.mkdir(join(paths.appDirectory, "public", ".well-known", "mcp"));
  await context.io.writeFile(cardPath, json);

  return {
    data: {
      command: "agent.mcp-card.generate",
      status: "pass",
      site: context.site?.name,
      transport: card.transport.type,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `agent.mcp-card.generate: dry-run — ${card.transport.type}`
      : `agent.mcp-card.generate: ${card.transport.type} → server-card.json`,
  };
}

// ---------------------------------------------------------------------------
// agent.mcp-card.validate
// ---------------------------------------------------------------------------

export async function runAgentMcpCardValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const cardPath = join(paths.appDirectory, MCP_CARD_FILE);
  const diagnostics: Diagnostic[] = [];

  const exists = await context.io.exists(cardPath);
  if (!enabled) {
    if (exists) {
      diagnostics.push({
        ruleId: "AGM-03",
        severity: "error",
        file: MCP_CARD_FILE,
        message: "agent.enabled is false but server-card.json still exists on disk.",
        fixHint: "Rerun agent.mcp-card.generate to remove the stale artifact.",
      });
    }
    return diagnosticsResult("agent.mcp-card.validate", diagnostics);
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return diagnosticsResult("agent.mcp-card.validate", diagnostics);
  }

  const expectedCard = buildMcpServerCard(manifest);

  if (!expectedCard) {
    if (exists) {
      diagnostics.push({
        ruleId: "AGM-03",
        severity: "error",
        file: MCP_CARD_FILE,
        message: "manifest.interfaces.mcp is null but server-card.json still exists on disk.",
        fixHint: "Rerun agent.mcp-card.generate to remove the stale artifact.",
      });
    }
    return diagnosticsResult("agent.mcp-card.validate", diagnostics);
  }

  if (!exists) {
    diagnostics.push({
      ruleId: "AGM-01",
      severity: "error",
      file: MCP_CARD_FILE,
      message: "server-card.json does not exist.",
      fixHint: "Run agent.mcp-card.generate.",
    });
    return diagnosticsResult("agent.mcp-card.validate", diagnostics);
  }

  let doc: McpServerCard;
  try {
    doc = JSON.parse(await context.io.readFile(cardPath)) as McpServerCard;
  } catch {
    diagnostics.push({
      ruleId: "AGM-01",
      severity: "error",
      file: MCP_CARD_FILE,
      message: "server-card.json is not valid JSON.",
      fixHint: "Rerun agent.mcp-card.generate.",
    });
    return diagnosticsResult("agent.mcp-card.validate", diagnostics);
  }

  const expectedJson = JSON.stringify(expectedCard);
  const actualJson = JSON.stringify(doc);

  if (expectedJson !== actualJson) {
    if (
      doc.transport?.url !== expectedCard.transport.url ||
      doc.protocolVersion !== expectedCard.protocolVersion
    ) {
      diagnostics.push({
        ruleId: "AGM-02",
        severity: "error",
        file: MCP_CARD_FILE,
        message: "transport.url or protocolVersion diverges from manifest.interfaces.mcp.",
        fixHint: "Rerun agent.mcp-card.generate.",
      });
    } else {
      diagnostics.push({
        ruleId: "AGM-02",
        severity: "error",
        file: MCP_CARD_FILE,
        message: "server-card.json content diverges from the expected projection.",
        fixHint: "Rerun agent.mcp-card.generate.",
      });
    }
  }

  return diagnosticsResult("agent.mcp-card.validate", diagnostics);
}
