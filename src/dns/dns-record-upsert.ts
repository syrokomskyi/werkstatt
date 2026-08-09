/*
<MODULE_CONTRACT>
<purpose>
RFC-0753: dns.record.upsert command handler — synchronizes DNS records from
a declaration file to Cloudflare. Creates, updates, or skips records idempotently.
Supports --dry-run to preview changes without making API calls.
</purpose>
<non-goals>
  <item>Do not delete records that are absent from the declaration — that is dns.record.delete's responsibility.</item>
  <item>Do not validate schema — that is dns.records.schema.validate's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0753: initial dns.record.upsert command handler.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { readRegistry } from "../sternsystem/registry-io.ts";
import {
  listDnsRecords,
  createDnsRecord,
  updateDnsRecord,
} from "../leitstand/adapters/cloudflare-api.ts";
import {
  flagString,
  flagBoolean,
  loadDnsRecordFile,
  resolveDnsZoneId,
  resolveDnsEnv,
  recordsMatch,
} from "./dns-helpers.ts";
import { normalizeTxtContent } from "./txt-normalize.ts";
import type { DnsRecordDeclaration } from "@warpgogol/werkstatt-site/ontology/schemas";

export interface DnsRecordUpsertResult {
  command: "dns.record.upsert";
  systemId: string;
  zone: string;
  dryRun: boolean;
  results: Array<{
    identity: string;
    action: "created" | "updated" | "skipped";
    recordId: string | null;
  }>;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    total: number;
  };
}

export async function runDnsRecordUpsert(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<DnsRecordUpsertResult>> {
  const { workspaceRoot } = context;
  const systemId = flagString(input, "system");
  if (!systemId) throw new Error("[dns.record.upsert] --system is required");
  const dryRun = flagBoolean(input, "dry-run") ?? false;

  const declaration = await loadDnsRecordFile(workspaceRoot, systemId);
  if (!declaration) {
    throw new Error(
      `[dns.record.upsert] No dns-records.yaml found for system '${systemId}'. ` +
        `Create systems/${systemId}/dns-records.yaml first.`,
    );
  }

  const registry = await readRegistry(workspaceRoot);
  const zoneId = resolveDnsZoneId(registry, declaration.zone);

  const env = await resolveDnsEnv();
  const apiToken = env["CLOUDFLARE_API_TOKEN"];
  if (!apiToken) {
    throw new Error(
      "[dns.record.upsert] CLOUDFLARE_API_TOKEN is not set. " +
        "Set it in the environment or .env file. " +
        "The token must have Zone:DNS:Edit permission.",
    );
  }

  const liveRecords = await listDnsRecords(zoneId, apiToken);

  const results: DnsRecordUpsertResult["results"] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const declared of declaration.records) {
    const identity = `${declared.type}:${declared.name}`;
    const matching = liveRecords.find((r) => r.type === declared.type && r.name === declared.name);

    if (matching && recordsMatch(declared, matching)) {
      skipped++;
      results.push({ identity, action: "skipped", recordId: matching.id });
      continue;
    }

    if (dryRun) {
      if (matching) {
        updated++;
        results.push({ identity, action: "updated", recordId: null });
      } else {
        created++;
        results.push({ identity, action: "created", recordId: null });
      }
      continue;
    }

    const apiRecord = toApiRecord(declared);

    if (matching) {
      await updateDnsRecord(zoneId, apiToken, matching.id, apiRecord);
      updated++;
      results.push({ identity, action: "updated", recordId: matching.id });
    } else {
      const created_record = await createDnsRecord(zoneId, apiToken, apiRecord);
      created++;
      results.push({ identity, action: "created", recordId: created_record.id });
    }
  }

  const total = declaration.records.length;
  return {
    data: {
      command: "dns.record.upsert",
      systemId,
      zone: declaration.zone,
      dryRun,
      results,
      summary: { created, updated, skipped, total },
    },
    summary: `[dns.record.upsert] ${systemId}: ${created} created, ${updated} updated, ${skipped} skipped (${total} total)${dryRun ? " [dry-run]" : ""}`,
    nextSteps: [],
  };
}

function toApiRecord(declared: DnsRecordDeclaration): {
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  priority?: number;
  comment?: string;
} {
  return {
    type: declared.type,
    name: declared.name,
    content: declared.type === "TXT" ? normalizeTxtContent(declared.content) : declared.content,
    proxied: declared.proxied ?? false,
    ...(declared.priority !== undefined ? { priority: declared.priority } : {}),
    ...(declared.comment ? { comment: declared.comment } : {}),
  };
}
