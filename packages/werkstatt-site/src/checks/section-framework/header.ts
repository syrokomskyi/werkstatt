/*
<MODULE_CONTRACT>
<purpose>section.header.contract.validate (HEAD-01) — section headers flow through
&lt;SectionHeader&gt;, never a raw h1/h2 with a section-* class.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of section-framework.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { AstroParseHandle } from "../lib/astro-parse.ts";
import {
  getAstro,
  isSectionHeaderAncestor,
  ok,
  fail,
  walkAstroSections,
  type CheckResult,
  type Violation,
} from "./shared.ts";

export async function runSectionHeaderContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.header.contract.validate";
  const violations: Violation[] = [];
  const files = await walkAstroSections(context.workspaceRoot);
  for (const file of files) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    let handle: AstroParseHandle;
    try {
      handle = await getAstro(context, file);
    } catch {
      continue;
    }
    handle.walk((node, ancestors) => {
      if (node.type !== "element") return;
      if (node.name !== "h1" && node.name !== "h2") return;
      const cls = handle.attr(node, "class") ?? "";
      if (!/section[-_]/i.test(cls)) return;
      if (handle.insideAncestor(ancestors, isSectionHeaderAncestor)) return;
      violations.push({
        file: rel,
        rule: "HEAD-01",
        message: `Raw <${node.name} class="${cls}"> outside <SectionHeader> is forbidden; use <SectionHeader>.`,
        fix: 'import SectionHeader from "@warpgogol/werkstatt-site/ui/components/section-header.astro"; render via <SectionHeader heading=... />',
      });
    });
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
