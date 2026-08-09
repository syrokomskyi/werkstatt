/*
<MODULE_CONTRACT>
<purpose>
RFC-0250 workspace validator for shared UI fallback defaults. It prevents
sections/components from embedding app-specific asset tokens or pageIds as
implicit fallbacks without a static diagnostic path.
</purpose>
<non-goals>
  <item>Do not parse app content; semantic target validation owns app route checks.</item>
  <item>Do not ban all string defaults, only app-specific asset/pageId fallback tokens.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0250: add static diagnostics for implicit shared section fallback tokens.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { diagnosticsResult } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

const APP_SPECIFIC_DEFAULTS = [
  {
    value: "hero-1",
    ruleId: "SECTION-DEFAULT-01",
    kind: "asset",
    message: 'Shared UI source uses app-specific asset fallback "hero-1".',
    fixHint:
      "Omit the optional image when no token is authored, or declare a portable fallback registry entry.",
  },
  {
    value: "donateContact",
    ruleId: "SECTION-DEFAULT-02",
    kind: "pageId",
    message: 'Shared UI source uses app-specific pageId fallback "donateContact".',
    fixHint:
      "Omit the optional CTA when no target is authored, or provide a validated app/site-level target.",
  },
] as const;

async function collectSourceFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    extensions: [".astro", ".ts", ".tsx"],
    ignore: (name) => name === "gen",
  });
}

function lineOf(source: string, needle: string): number | undefined {
  const index = source.split(/\r?\n/).findIndex((line) => line.includes(needle));
  return index >= 0 ? index + 1 : undefined;
}

export async function runSectionDefaultsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "section.defaults.validate";
  const roots = [
    join(context.workspaceRoot, "packages", "ui", "src", "sections"),
    join(context.workspaceRoot, "packages", "ui", "src", "components"),
  ];
  const diagnostics: Diagnostic[] = [];

  for (const root of roots) {
    for (const file of await collectSourceFiles(root)) {
      const source = await readFile(file, "utf-8").catch(() => "");
      for (const fallback of APP_SPECIFIC_DEFAULTS) {
        const literal = `"${fallback.value}"`;
        if (!source.includes(literal)) continue;
        diagnostics.push({
          ruleId: fallback.ruleId,
          severity: "error",
          file: relative(context.workspaceRoot, file).replace(/\\/g, "/"),
          line: lineOf(source, literal),
          message: fallback.message,
          fixHint: fallback.fixHint,
          data: { value: fallback.value, kind: fallback.kind },
        });
      }
      if (/legacy\s+fallback|fallback\s+to\s+the\s+legacy/i.test(source)) {
        diagnostics.push({
          ruleId: "SECTION-DEFAULT-04",
          severity: "error",
          file: relative(context.workspaceRoot, file).replace(/\\/g, "/"),
          line: lineOf(source, "legacy"),
          message:
            "Shared UI source describes a legacy fallback without a validated migration path.",
          fixHint:
            "Remove the implicit legacy fallback or document it through a portable fallback registry.",
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
