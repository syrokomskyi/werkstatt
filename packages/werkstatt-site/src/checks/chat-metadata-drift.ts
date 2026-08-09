/*
<MODULE_CONTRACT>
<purpose>Workspace-scoped drift guard for CHAT_ADAPTER_METADATA (@warpgogol/chat) vs the runtime
requiredOptions/vendorOrigins declared on each ChatWidgetAdapter in chat-adapter-* packages.
The metadata catalog is a build-time twin for Node-side validators that cannot import DOM-targeted
adapter packages. This check ensures the twin does not silently drift from the runtime declaration.</purpose>
<non-goals>
  <item>Do not import adapter packages — read source files only (Node-safe).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: drift guard for CHAT_ADAPTER_METADATA vs adapter declarations.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { CHAT_ADAPTER_IDS, getChatAdapterMetadata } from "@warpgogol/chat";
import { diagnosticsResult } from "./result-helpers.ts";

/** Extract a `requiredOptions: [["a", "b"]]` literal from source text. */
export function extractRequiredOptions(source: string): string[][] | null {
  const match = source.match(/requiredOptions\s*:\s*\[([\s\S]*?)\]\s*(?:,|\n)/);
  if (!match) return null;
  const inner = match[1];
  const groups: string[][] = [];
  const groupRe = /\[([^\]]*)\]/g;
  let g: RegExpExecArray | null;
  while ((g = groupRe.exec(inner)) !== null) {
    groups.push(
      g[1]
        .split(",")
        .map((s) => s.trim().replace(/["']/g, ""))
        .filter((s) => s.length > 0),
    );
  }
  return groups;
}

function extractStringArrayItems(inner: string): string[] {
  return inner
    .split(",")
    .map((s) => s.trim().replace(/["']/g, ""))
    .filter((s) => s.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractConstStringArray(source: string, identifier: string): string[] | null {
  const escapedIdentifier = escapeRegExp(identifier);
  const match = source.match(
    new RegExp(
      `(?:export\\s+)?const\\s+${escapedIdentifier}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as\\s+const)?\\s*;`,
    ),
  );
  if (!match) return null;
  return extractStringArrayItems(match[1]);
}

/** Extract a `vendorOrigins: ["a.com"]` literal from source text. */
export function extractVendorOrigins(source: string): string[] | null {
  const match = source.match(/vendorOrigins\s*:\s*\[([\s\S]*?)\]/);
  if (match) return extractStringArrayItems(match[1]);

  const identifierMatch = source.match(/vendorOrigins\s*:\s*([A-Za-z_$][\w$]*)\s*(?:,|\n|})/);
  if (!identifierMatch) return null;
  return extractConstStringArray(source, identifierMatch[1]);
}

function normalizeOptions(opts: string[][] | null): string {
  if (!opts || opts.length === 0) return "";
  return opts
    .map((g) => g.slice().sort().join(","))
    .sort()
    .join("|");
}

function normalizeOrigins(origins: string[] | null): string {
  if (!origins || origins.length === 0) return "";
  return origins.slice().sort().join(",");
}

export async function runChatMetadataDriftValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const diagnostics: Diagnostic[] = [];

  for (const adapterId of CHAT_ADAPTER_IDS) {
    if (adapterId === "null") continue;

    const adapterPath = join(
      context.workspaceRoot,
      "packages",
      `chat-adapter-${adapterId}`,
      "src",
      "widget-adapter.ts",
    );

    let source: string;
    try {
      source = await context.io.readFile(adapterPath);
    } catch {
      // Adapter package may not exist for this id — skip (chat.config.validate covers this).
      continue;
    }

    const catalogMeta = getChatAdapterMetadata(adapterId);

    const sourceRequired = extractRequiredOptions(source);
    const sourceOrigins = extractVendorOrigins(source);

    const catalogRequired = catalogMeta.requiredOptions
      ? catalogMeta.requiredOptions.map((g) => [...g])
      : null;
    const catalogOrigins = catalogMeta.vendorOrigins ? [...catalogMeta.vendorOrigins] : null;

    if (normalizeOptions(sourceRequired) !== normalizeOptions(catalogRequired)) {
      diagnostics.push({
        ruleId: "CHAT-META-01",
        severity: "error",
        message:
          `adapter "${adapterId}" requiredOptions mismatch: ` +
          `adapter source has ${JSON.stringify(sourceRequired)}, ` +
          `CHAT_ADAPTER_METADATA has ${JSON.stringify(catalogRequired)}`,
      });
    }

    if (normalizeOrigins(sourceOrigins) !== normalizeOrigins(catalogOrigins)) {
      diagnostics.push({
        ruleId: "CHAT-META-02",
        severity: "error",
        message:
          `adapter "${adapterId}" vendorOrigins mismatch: ` +
          `adapter source has ${JSON.stringify(sourceOrigins)}, ` +
          `CHAT_ADAPTER_METADATA has ${JSON.stringify(catalogOrigins)}`,
      });
    }
  }

  return diagnosticsResult("chat.metadata.drift.validate", diagnostics);
}
