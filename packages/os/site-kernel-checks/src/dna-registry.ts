/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0158 dna.registry.validate — keeps the canonical DNA registry
(docs/architecture-dna.md) and the RFCs that establish invariants in sync, so the
DNA-27..38 drift the 2026-06 audit found cannot recur.</purpose>
<non-goals>
  <item>Do not check DNA references in RFC related[] — rfc.validate V-18 owns that direction.</item>
  <item>Do not read the derived cross-site companion doc — only the canonical registry.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0158: keep architecture-dna.md and the establishing RFCs in sync.</item>
  <item>Track command-table and pipeline sources after the site-kernel-checks registry split.</item>
</CHANGE_SUMMARY>
*/

import { basename, join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { listRegisteredKernelCommands, listRegisteredKernelPipelines } from "@gogol/site-kernel";
import { diagnosticsResult, failResult } from "./result-helpers.ts";
import { collectFiles } from "@gogol/share/fs";

const DNA_REGISTRY = "docs/architecture-dna.md";
const RFC_DIR = "docs/rfcs";

interface DnaEntry {
  n: number;
  title: string;
  body: string;
  establishedBy: string[]; // RFC ids cited in the entry body
  foundational: boolean; // explicitly marked as a pre-RFC foundational invariant
  reclassified: boolean; // reclassified from binding DNA to a feature (RFC-0161)
}

/** Parse `## DNA-N · Title` blocks plus their citations, foundational, and reclassified markers. */
function parseRegistry(src: string): DnaEntry[] {
  const entries: DnaEntry[] = [];
  const re = /^##\s+DNA-(\d+)\s*·?\s*(.*)$/gm;
  const matches = [...src.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : src.length;
    const body = src.slice(start, end);
    const cited = [...body.matchAll(/Established by (RFC-\d{4})/g)].map((x) => x[1]!);
    entries.push({
      n: parseInt(m[1]!, 10),
      title: (m[2] ?? "").trim(),
      body,
      establishedBy: cited,
      foundational: /\bFoundational invariant\b/i.test(body),
      reclassified: /\bReclassified to feature\b/i.test(body),
    });
  }
  return entries;
}

const CMD_TOKEN = /`([a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+)`/g;
const CMD_SUFFIX =
  /\.(validate|lint|generate|audit|build|unique|compose|derive|verify|rotate|shape|contract|run|full|merge)$/;

async function collectCommands(
  workspaceRoot: string,
): Promise<{ registered: Set<string>; pipelined: Set<string> }> {
  const registered = new Set(
    (await listRegisteredKernelCommands(workspaceRoot)).map((command) => command.name),
  );
  const pipelineMap = await listRegisteredKernelPipelines(workspaceRoot);
  const pipelined = new Set(Object.values(pipelineMap).flat());
  return { registered, pipelined };
}

export function collectDnaEnforcerDiagnostics(
  registrySrc: string,
  registered: ReadonlySet<string>,
  pipelined: ReadonlySet<string>,
): { violations: string[]; warnings: Diagnostic[] } {
  const violations: string[] = [];
  const warnings: Diagnostic[] = [];

  for (const e of parseRegistry(registrySrc)) {
    if (e.reclassified) continue;
    for (const line of e.body.split("\n")) {
      const idx = line.indexOf("Enforced by");
      if (idx < 0) continue;
      for (const m of line.slice(idx).matchAll(CMD_TOKEN)) {
        const cmd = m[1]!;
        if (!CMD_SUFFIX.test(cmd)) continue;
        if (!registered.has(cmd)) {
          violations.push(
            `[DNA-REG-05] DNA-${e.n} names enforcer \`${cmd}\`, which is not a registered command`,
          );
        } else if (!pipelined.has(cmd)) {
          warnings.push({
            ruleId: "DNA-REG-05",
            severity: "warning",
            file: DNA_REGISTRY,
            message: `DNA-${e.n} enforcer \`${cmd}\` is registered but not wired into any *_PIPELINE.`,
            fixHint:
              "Wire the command into the relevant pipeline if it is safe to run without entity-specific flags; otherwise leave it as an on-demand enforcer.",
          });
        }
      }
    }
  }

  return { violations, warnings };
}

/**
 * dna.registry.validate — assert the canonical DNA registry is internally
 * complete and traceable, and that no RFC silently establishes an unrecorded DNA.
 *
 * @rfc RFC-0158
 */
export async function runDnaRegistryValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot, logger } = context;

  let registrySrc: string;
  try {
    registrySrc = await readFile(join(workspaceRoot, DNA_REGISTRY), "utf8");
  } catch {
    return failResult("dna.registry.validate", [
      `[ERROR] canonical registry not found at ${DNA_REGISTRY}`,
    ]);
  }

  const entries = parseRegistry(registrySrc);
  const byId = new Set(entries.map((e) => e.n));
  const violations: string[] = [];

  // Collect existing RFC ids.
  const rfcIds = new Set<string>();
  const rfcFiles: string[] = [];
  try {
    for (const f of await collectFiles(join(workspaceRoot, RFC_DIR), { extensions: [".md"] })) {
      const m = basename(f).match(/^rfc-(\d{4})-.*\.md$/i);
      if (m) {
        rfcIds.add(`RFC-${m[1]!}`);
        rfcFiles.push(f);
      }
    }
  } catch {
    return failResult("dna.registry.validate", [`[ERROR] ${RFC_DIR} not readable`]);
  }

  // DNA-REG-01: contiguous ids from 1, no duplicates.
  const seen = new Set<number>();
  for (const e of entries) {
    if (seen.has(e.n)) violations.push(`[DNA-REG-01] duplicate registry entry DNA-${e.n}`);
    seen.add(e.n);
  }
  const max = entries.reduce((a, e) => Math.max(a, e.n), 0);
  for (let n = 1; n <= max; n++) {
    if (!byId.has(n))
      violations.push(
        `[DNA-REG-01] registry gap: DNA-${n} is missing (ids must be contiguous from 1)`,
      );
  }

  const warnings: Diagnostic[] = [];
  // DNA-REG-02 (error): any "Established by" citation must point to an existing RFC.
  // DNA-REG-04 (warning): entry with no provenance — neither an "Established by RFC-XXXX"
  // citation nor an explicit "Foundational invariant (pre-RFC)" marker.
  for (const e of entries) {
    if (e.establishedBy.length === 0) {
      if (!e.foundational) {
        warnings.push({
          ruleId: "DNA-REG-04",
          severity: "warning",
          file: DNA_REGISTRY,
          message: `DNA-${e.n} (${e.title}) has no provenance.`,
          fixHint: 'Add "Established by RFC-XXXX" or mark it a "Foundational invariant (pre-RFC)".',
        });
      }
      continue;
    }
    for (const rfc of e.establishedBy) {
      if (!rfcIds.has(rfc)) {
        violations.push(`[DNA-REG-02] DNA-${e.n} cites ${rfc}, which is not an existing RFC`);
      }
    }
  }

  // DNA-REG-03 (error): an RFC body that says "DNA-N established by this RFC" MUST have a
  // registry entry — this is exactly the drift the 2026-06 audit found (DNA-27..38 established,
  // never recorded). New RFCs MUST use this canonical marker phrase so the guard can see them.
  for (const f of rfcFiles) {
    let body: string;
    try {
      body = await readFile(f, "utf8");
    } catch {
      continue;
    }
    for (const m of body.matchAll(/DNA-(\d+) established by this RFC/g)) {
      const n = parseInt(m[1]!, 10);
      if (!byId.has(n)) {
        violations.push(
          `[DNA-REG-03] ${basename(f).slice(0, 8)} establishes DNA-${n}, but the registry has no ## DNA-${n} entry`,
        );
      }
    }
  }
  // DNA-REG-05: an active invariant's named enforcer ("Enforced by `cmd`") must be a
  // registered command (error), and should be wired into a *_PIPELINE (warning).
  // Reclassified features (RFC-0161) are exempt — a feature need not have a live,
  // pipelined enforcer.
  const { registered, pipelined } = await collectCommands(workspaceRoot);
  const enforcerDiagnostics = collectDnaEnforcerDiagnostics(registrySrc, registered, pipelined);
  violations.push(...enforcerDiagnostics.violations);
  warnings.push(...enforcerDiagnostics.warnings);

  if (violations.length > 0) {
    return failResult("dna.registry.validate", [
      ...violations,
      `        Add the missing ## DNA-N entry to ${DNA_REGISTRY} (with "Established by RFC-XXXX"), or fix the citation (RFC-0158).`,
    ]);
  }
  return diagnosticsResult("dna.registry.validate", warnings);
}
