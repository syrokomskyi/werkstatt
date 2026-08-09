/*
<MODULE_CONTRACT>
<purpose>section.body.contract.validate (BODY-01..02) — archetype bodyKind matches the
body-* fragment composed by the archetype's propsSchema.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of section-framework.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { ok, fail, walkArchetypeYamls, type CheckResult, type Violation } from "./shared.ts";

export async function runSectionBodyContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.body.contract.validate";
  const violations: Violation[] = [];
  const archetypes = await walkArchetypeYamls(context.workspaceRoot);
  for (const file of archetypes) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const raw = await readFile(file, "utf8");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = parseYaml(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!parsed) continue;
    const bodyKind = parsed.bodyKind as string | undefined;
    if (!bodyKind) {
      violations.push({
        file: rel,
        rule: "BODY-01",
        message:
          "Archetype must declare `bodyKind` (list | split-list | stats | cards | paragraphs | comparison | rich | composite).",
        fix: "Add `bodyKind: <kind>` to the archetype YAML.",
      });
      continue;
    }
    const propsSchema = parsed.propsSchema as Record<string, unknown> | undefined;
    const compose = (propsSchema?.compose ?? []) as unknown[];
    // RFC-0119: accept pinned ids — strip `@<version>` before matching.
    const bodyFragments = compose
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.split("@")[0])
      .filter((id) => id.startsWith("body-"));
    if (bodyKind === "composite") {
      if (bodyFragments.length > 0) {
        violations.push({
          file: rel,
          rule: "BODY-02",
          message: "Composite archetype must not compose a body-* fragment.",
          fix: "Remove the body-* entry from propsSchema.compose.",
        });
      }
    } else {
      const expected = `body-${bodyKind}`;
      if (!bodyFragments.includes(expected)) {
        violations.push({
          file: rel,
          rule: "BODY-02",
          message: `Archetype bodyKind: ${bodyKind} requires "${expected}" in propsSchema.compose.`,
          fix: `Add \`${expected}\` to propsSchema.compose.`,
        });
      }
    }
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
