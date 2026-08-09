/*
<MODULE_CONTRACT>
<purpose>
RFC-0786: agent.dns-aid.generate writes the DNS-AID TXT record declaration
to systems/<id>/dns-records.yaml in a marked section (# BEGIN dns-aid / # END dns-aid).
agent.dns-aid.validate verifies the declared record matches the agent surface
manifest and checks Cloudflare for presence (AGD-01..04).
</purpose>
<non-goals>
  <item>Do not call the Cloudflare API to create records — that is dns.record.upsert (RFC-0753).</item>
  <item>Do not modify the agent surface manifest — agent.manifest.generate owns that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0786: initial DNS-AID generate + validate command handlers.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { buildDnsAidRecord, type DnsAidRecord } from "@warpgogol/werkstatt-site/share/agent";
import { loadInternalManifest, readAgentBlock } from "./agent-shared.ts";
import { diagnosticsResult } from "../result-helpers.ts";

/** RFC-0786: advisory result — always exit 0, consistent with dns.record.validate. */
function advisoryResult(diagnostics: Diagnostic[]): KernelCommandResult<CheckResult> {
  const result = diagnosticsResult("agent.dns-aid.validate", diagnostics);
  result.exitCode = 0;
  return result;
}

const DNS_RECORDS_FILE = "dns-records.yaml";
const BEGIN_MARKER = "# BEGIN dns-aid";
const END_MARKER = "# END dns-aid";

// ---------------------------------------------------------------------------
// Helper: resolve dns-records.yaml path
// ---------------------------------------------------------------------------

function resolveDnsRecordsPath(context: KernelRuntimeContext): string {
  const systemId = context.site?.name;
  if (!systemId) {
    throw new Error("agent.dns-aid: requires a site-scoped runtime context.");
  }
  return join(context.workspaceRoot, "systems", systemId, DNS_RECORDS_FILE);
}

// ---------------------------------------------------------------------------
// Helper: format DNS-AID record as YAML fragment
// ---------------------------------------------------------------------------

function formatDnsAidYaml(record: DnsAidRecord): string {
  return [
    BEGIN_MARKER,
    `- name: ${record.name}`,
    `  type: ${record.type}`,
    `  content: "${record.content}"`,
    `  ttl: ${record.ttl}`,
    `  proxied: ${record.proxied}`,
    END_MARKER,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Helper: extract DNS-AID section from file text
// ---------------------------------------------------------------------------

function extractDnsAidSection(text: string): string | null {
  const beginIdx = text.indexOf(BEGIN_MARKER);
  if (beginIdx === -1) return null;
  const endIdx = text.indexOf(END_MARKER, beginIdx);
  if (endIdx === -1) return null;
  return text.slice(beginIdx, endIdx + END_MARKER.length);
}

// ---------------------------------------------------------------------------
// Helper: replace or insert DNS-AID section in file text
// ---------------------------------------------------------------------------

function replaceDnsAidSection(text: string, newSection: string): string {
  const beginIdx = text.indexOf(BEGIN_MARKER);
  if (beginIdx === -1) {
    // No existing section — append at end of records array or end of file
    const lines = text.split("\n");
    // Find the last record entry (line starting with "- name:" under records:)
    let lastRecordIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s*- name:/)) {
        lastRecordIdx = i;
      }
    }
    if (lastRecordIdx !== -1) {
      // Find the end of this record block (next non-indented line or EOF)
      let insertIdx = lastRecordIdx + 1;
      while (insertIdx < lines.length && lines[insertIdx].match(/^\s{2}\S/)) {
        insertIdx++;
      }
      lines.splice(insertIdx, 0, newSection);
      return lines.join("\n");
    }
    // No records found — append after records: key or at end
    const recordsIdx = lines.findIndex((l) => l.trimStart().startsWith("records:"));
    if (recordsIdx !== -1) {
      lines.splice(recordsIdx + 1, 0, newSection);
      return lines.join("\n");
    }
    // Fallback: append at end
    return `${text.trimEnd()}\n${newSection}\n`;
  }

  const endIdx = text.indexOf(END_MARKER, beginIdx);
  if (endIdx === -1) {
    // Malformed — replace from begin to EOF
    return `${text.slice(0, beginIdx)}${newSection}\n`;
  }
  const afterEnd = endIdx + END_MARKER.length;
  return `${text.slice(0, beginIdx)}${newSection}${text.slice(afterEnd)}`;
}

// ---------------------------------------------------------------------------
// Helper: remove DNS-AID section from file text
// ---------------------------------------------------------------------------

function removeDnsAidSection(text: string): string {
  const beginIdx = text.indexOf(BEGIN_MARKER);
  if (beginIdx === -1) return text;
  const endIdx = text.indexOf(END_MARKER, beginIdx);
  if (endIdx === -1) return text;
  const afterEnd = endIdx + END_MARKER.length;
  // Remove the section and any trailing newline
  let result = `${text.slice(0, beginIdx)}${text.slice(afterEnd)}`;
  // Clean up double blank lines
  result = result.replace(/\n{3,}/g, "\n\n");
  return result;
}

// ---------------------------------------------------------------------------
// Helper: update updatedAt field in file text
// ---------------------------------------------------------------------------

function updateUpdatedAt(text: string, date: string): string {
  return text.replace(/^updatedAt:\s*.*$/m, `updatedAt: ${date}`);
}

// ---------------------------------------------------------------------------
// Helper: create new dns-records.yaml with DNS-AID section
// ---------------------------------------------------------------------------

function createDnsRecordsFile(record: DnsAidRecord, zone: string, date: string): string {
  return [
    `kind: dns-records`,
    `schemaVersion: 1`,
    `zone: ${zone}`,
    `updatedAt: ${date}`,
    `records:`,
    formatDnsAidYaml(record),
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Helper: writeFileIfChanged via context.io (respects dry-run)
// ---------------------------------------------------------------------------

async function writeFileIfChanged(
  context: KernelRuntimeContext,
  filePath: string,
  content: string,
): Promise<boolean> {
  if (await context.io.exists(filePath)) {
    const existing = await context.io.readFile(filePath);
    if (existing === content) return false;
  }
  await context.io.writeFile(filePath, content);
  return true;
}

// ---------------------------------------------------------------------------
// agent.dns-aid.generate
// ---------------------------------------------------------------------------

export async function runAgentDnsAidGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const dnsRecordsPath = resolveDnsRecordsPath(context);

  if (!enabled) {
    // Skip pattern: remove stale DNS-AID section if it exists
    const exists = await context.io.exists(dnsRecordsPath);
    if (!exists) {
      return {
        data: {
          command: "agent.dns-aid.generate",
          status: "skip",
          site: context.site?.name,
          action: "skipped",
        },
        exitCode: 0,
        summary: "agent.dns-aid.generate: skipped — agent.enabled is false (no stale section)",
      };
    }
    const raw = await context.io.readFile(dnsRecordsPath);
    if (!raw.includes(BEGIN_MARKER)) {
      return {
        data: {
          command: "agent.dns-aid.generate",
          status: "skip",
          site: context.site?.name,
          action: "skipped",
        },
        exitCode: 0,
        summary: "agent.dns-aid.generate: skipped — agent.enabled is false (no stale section)",
      };
    }
    const updated = removeDnsAidSection(raw);
    const today = new Date().toISOString().slice(0, 10);
    const finalContent = updateUpdatedAt(updated, today);
    await writeFileIfChanged(context, dnsRecordsPath, finalContent);
    return {
      data: {
        command: "agent.dns-aid.generate",
        status: "skip",
        site: context.site?.name,
        action: "removed",
      },
      exitCode: 0,
      summary: "agent.dns-aid.generate: removed stale DNS-AID section (agent.enabled is false)",
    };
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    return {
      exitCode: 1,
      summary:
        "agent.dns-aid.generate: no Agent Surface Manifest found. Run agent.manifest.generate first.",
    };
  }

  const record = buildDnsAidRecord(manifest);
  const newSection = formatDnsAidYaml(record);
  const today = new Date().toISOString().slice(0, 10);
  const exists = await context.io.exists(dnsRecordsPath);

  if (!exists) {
    // Create new file
    const zone = new URL(manifest.baseUrl).hostname;
    const content = createDnsRecordsFile(record, zone, today);
    await writeFileIfChanged(context, dnsRecordsPath, content);
    return {
      data: {
        command: "agent.dns-aid.generate",
        status: "pass",
        site: context.site?.name,
        record,
        action: "created",
      },
      exitCode: 0,
      summary: `agent.dns-aid.generate: created ${DNS_RECORDS_FILE} with DNS-AID record`,
    };
  }

  const raw = await context.io.readFile(dnsRecordsPath);
  const existingSection = extractDnsAidSection(raw);

  if (existingSection === newSection) {
    // Byte-identical — no change needed (DNA-58)
    return {
      data: {
        command: "agent.dns-aid.generate",
        status: "pass",
        site: context.site?.name,
        record,
        action: "unchanged",
      },
      exitCode: 0,
      summary: "agent.dns-aid.generate: DNS-AID record unchanged (byte-identical)",
    };
  }

  // Replace or insert the section
  let updated = replaceDnsAidSection(raw, newSection);
  updated = updateUpdatedAt(updated, today);
  await writeFileIfChanged(context, dnsRecordsPath, updated);

  return {
    data: {
      command: "agent.dns-aid.generate",
      status: "pass",
      site: context.site?.name,
      record,
      action: existingSection ? "updated" : "created",
    },
    exitCode: 0,
    summary: `agent.dns-aid.generate: ${existingSection ? "updated" : "created"} DNS-AID record in ${DNS_RECORDS_FILE}`,
  };
}

// ---------------------------------------------------------------------------
// agent.dns-aid.validate
// ---------------------------------------------------------------------------

export async function runAgentDnsAidValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest: systemManifest } = await loadSystemManifest(paths.contentDirectory);
  const enabled = readAgentBlock(systemManifest).enabled !== false;
  const dnsRecordsPath = resolveDnsRecordsPath(context);
  const diagnostics: Diagnostic[] = [];

  const fileExists = await context.io.exists(dnsRecordsPath);

  if (!enabled) {
    // AGD-03: agent.enabled is false but DNS-AID section still exists
    if (fileExists) {
      const raw = await context.io.readFile(dnsRecordsPath);
      if (raw.includes(BEGIN_MARKER)) {
        diagnostics.push({
          ruleId: "AGD-03",
          severity: "error",
          file: `systems/${context.site?.name}/${DNS_RECORDS_FILE}`,
          message: "agent.enabled is false but DNS-AID section still exists in dns-records.yaml.",
          fixHint: "Rerun agent.dns-aid.generate to remove the stale section.",
        });
      }
    }
    return advisoryResult(diagnostics);
  }

  const manifest = await loadInternalManifest(context, paths.appDirectory);
  if (!manifest) {
    // Nothing to cross-check without a manifest — agent.surface.validate reports the root cause.
    return advisoryResult(diagnostics);
  }

  const expectedRecord = buildDnsAidRecord(manifest);

  if (!fileExists) {
    // AGD-01: DNS-AID record missing
    diagnostics.push({
      ruleId: "AGD-01",
      severity: "error",
      file: `systems/${context.site?.name}/${DNS_RECORDS_FILE}`,
      message: "dns-records.yaml does not exist. DNS-AID record is missing.",
      fixHint: "Run agent.dns-aid.generate to create the file with the DNS-AID record.",
    });
    return advisoryResult(diagnostics);
  }

  const raw = await context.io.readFile(dnsRecordsPath);
  const section = extractDnsAidSection(raw);

  if (!section) {
    // AGD-01: no marked section
    diagnostics.push({
      ruleId: "AGD-01",
      severity: "error",
      file: `systems/${context.site?.name}/${DNS_RECORDS_FILE}`,
      message: "DNS-AID record missing from dns-records.yaml (no marked section found).",
      fixHint: "Run agent.dns-aid.generate to add the DNS-AID record.",
    });
    return advisoryResult(diagnostics);
  }

  // Parse the section to verify content
  const expectedYaml = formatDnsAidYaml(expectedRecord);
  if (section.trim() !== expectedYaml.trim()) {
    // AGD-02: content mismatch — check if it's a content URL mismatch specifically
    const sectionLines = section.split("\n");
    const contentLine = sectionLines.find((l) => l.trimStart().startsWith("content:"));
    const expectedContentLine = `- name: ${expectedRecord.name}\n  type: ${expectedRecord.type}\n  content: "${expectedRecord.content}"`;
    const isContentMismatch =
      !contentLine?.includes(expectedRecord.content) ||
      !section.includes(`name: ${expectedRecord.name}`);

    diagnostics.push({
      ruleId: "AGD-02",
      severity: "error",
      file: `systems/${context.site?.name}/${DNS_RECORDS_FILE}`,
      message: isContentMismatch
        ? `DNS-AID record content does not match the agent surface manifest URL. Expected: "${expectedRecord.content}"`
        : "DNS-AID record does not match the expected declaration from the manifest.",
      fixHint: "Run agent.dns-aid.generate to sync the DNS-AID record with the manifest.",
    });
    return advisoryResult(diagnostics);
  }

  // AGD-04: record declared but not found in Cloudflare (advisory warning)
  // Only check if CLOUDFLARE_API_TOKEN is available — skip silently otherwise.
  await checkCloudflarePresence(context, expectedRecord, diagnostics);

  return advisoryResult(diagnostics);
}

// ---------------------------------------------------------------------------
// Helper: check Cloudflare for DNS-AID record presence (AGD-04)
// ---------------------------------------------------------------------------

async function checkCloudflarePresence(
  context: KernelRuntimeContext,
  record: DnsAidRecord,
  diagnostics: Diagnostic[],
): Promise<void> {
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
  if (!apiToken) return;

  const systemId = context.site?.name;
  if (!systemId) return;

  // Read registry to resolve zone ID
  const registryPath = join(context.workspaceRoot, "systems", "registry.yaml");
  let zoneId: string | undefined;
  try {
    const registryRaw = await context.io.readFile(registryPath);
    const registry = yamlParse(registryRaw) as {
      systems?: Array<{
        id: string;
        cloudflareZoneId?: string;
        deployment?: { channels?: { main?: { url: string } } };
      }>;
    };
    const system = registry.systems?.find((s) => s.id === systemId);
    zoneId = system?.cloudflareZoneId;
  } catch {
    return;
  }

  if (!zoneId) return;

  try {
    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(record.name)}&type=TXT`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { result?: unknown[] };
    if (!data.result || data.result.length === 0) {
      diagnostics.push({
        ruleId: "AGD-04",
        severity: "warning",
        file: `systems/${systemId}/${DNS_RECORDS_FILE}`,
        message: `DNS-AID record "${record.name}" is declared but not found in Cloudflare.`,
        fixHint: "Run dns.record.upsert --system <id> to apply the declaration to Cloudflare.",
      });
    }
  } catch {
    // Network error — skip AGD-04 silently
  }
}
