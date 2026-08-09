/*
<MODULE_CONTRACT>
<purpose>RFC-0241: hdri.firewall.validate — forbid HDRI ownership/branding signals on warpgogol-com and require every HDRI-derived fact to carry external provenance + a validity window.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0241: add HDRI firewall validation for ownership and branding signals.</item>
  <item>RFC-0241: add the unprovenanced-hdri-fact rule — any CKL claim sourced from external:hdri must carry provenance: external and a validity window (asOf).</item>
  <item>RFC-0261: migrate to diagnosticsResult with registered HDRI-01/02 ruleIds and a workspace-relative file locator.</item>
</CHANGE_SUMMARY>
*/

import path, { join, relative } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

/** The canonical HDRI external source descriptor id (RFC-0241, integrations/truth-sources/external-hdri.yaml). */
const HDRI_SOURCE_ID = "external:hdri";

/** A minimal claim annotation shape, tolerant of the full recordClaims schema (RFC-0212). */
interface MinimalClaimAnnotation {
  provenance?: string;
  sourceRef?: string;
  validity?: { asOf?: string };
}

/** Forbidden HDRI branding/ownership patterns. Citation with DOI is allowed; branding is not. */
const OWNERSHIP_PATTERNS = [
  /our\s+hdri/i,
  /my\s+index/i,
  /hdri\s+project\s+of\s+warpgogol/i,
  /warpgogol\s+hdri/i,
  /handwerk\s+digital\s+readiness\s+index\s+by\s+warpgogol/i,
];

async function* walkContentFiles(dir: string): AsyncGenerator<string> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkContentFiles(path);
    } else if (e.name.endsWith(".md") || e.name.endsWith(".yaml") || e.name.endsWith(".yml")) {
      yield path;
    }
  }
}

export async function runHdriFirewallValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "hdri.firewall.validate must run inside an app context." };
  }

  const diagnostics: Diagnostic[] = [];
  const contentDir = join(app.directory, "src", "content");

  for await (const file of walkContentFiles(contentDir)) {
    const text = await readFile(file, "utf8");
    const relFile = toPosixPath(relative(context.workspaceRoot, file));
    for (const pattern of OWNERSHIP_PATTERNS) {
      if (pattern.test(text)) {
        diagnostics.push({
          ruleId: "HDRI-01",
          severity: "error",
          file: relFile,
          message: `Contains an HDRI branding/ownership pattern ("${pattern.source}").`,
          fixHint:
            "HDRI must be cited as an external source, never presented as a studio-owned project (RFC-0241).",
        });
      }
    }

    // HDRI-02: any CKL claim sourced from external:hdri must carry
    // provenance: external and a validity window (asOf) — never asserted/generated.
    if (!file.endsWith(".claims.yaml")) continue;
    let parsed: unknown;
    try {
      parsed = parseYaml(text);
    } catch {
      continue; // malformed sidecars are surfaced by content.claim.validate, not this check.
    }
    if (!parsed || typeof parsed !== "object") continue;
    for (const [fieldPath, annotation] of Object.entries(
      parsed as Record<string, MinimalClaimAnnotation>,
    )) {
      if (annotation?.sourceRef !== HDRI_SOURCE_ID) continue;
      if (annotation.provenance !== "external" || !annotation.validity?.asOf) {
        diagnostics.push({
          ruleId: "HDRI-02",
          severity: "error",
          file: relFile,
          message: `Field "${fieldPath}" references "${HDRI_SOURCE_ID}" but lacks provenance: external + a validity window (asOf).`,
          fixHint: "Add provenance: external and validity.asOf to the claim annotation (RFC-0241).",
        });
      }
    }
  }

  return diagnosticsResult("hdri.firewall.validate", diagnostics);
}
