/*
<MODULE_CONTRACT>
<purpose>section.shell.contract.validate (SHELL-01..04) — every shared section must root
through &lt;SectionShell&gt;.</purpose>
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
  isUtilitySection,
  ok,
  fail,
  walkAstroSections,
  type CheckResult,
  type Violation,
} from "./shared.ts";

export async function runSectionShellContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.shell.contract.validate";
  const violations: Violation[] = [];
  const files = await walkAstroSections(context.workspaceRoot);
  for (const file of files) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    // RFC-0126: skip utility sections (breadcrumbs, navigation) — they are
    // route-orchestration helpers, not shell-bearing visual sections.
    if (isUtilitySection(rel)) continue;
    let handle: AstroParseHandle;
    try {
      handle = await getAstro(context, file);
    } catch (err) {
      violations.push({
        file: rel,
        rule: "PARSE-01",
        message: `Astro parse failed: ${(err as Error).message}`,
      });
      continue;
    }
    const shellNodes = handle.findByName("SectionShell");
    const rawSections = handle.findByName("section");
    if (shellNodes.length === 0) {
      violations.push({
        file: rel,
        rule: "SHELL-01",
        message: "Section root must be <SectionShell>; <SectionShell> not found in file.",
        fix: "Wrap the section in <SectionShell slug=...> + <SectionHeader> + body component.",
      });
    }
    if (rawSections.length > 0) {
      violations.push({
        file: rel,
        rule: "SHELL-01",
        message: "Raw <section> element is forbidden; use <SectionShell> as the root.",
        fix: "Replace <section ...> with <SectionShell slug=...>.",
      });
    }
    if (shellNodes.length > 0) {
      const importOk = handle
        .imports()
        .some(
          (i) =>
            i.specifier === "SectionShell" &&
            i.source === "@warpgogol/werkstatt-site/ui/components/section-shell.astro",
        );
      if (!importOk) {
        violations.push({
          file: rel,
          rule: "SHELL-02",
          message:
            "<SectionShell> used without matching import from @warpgogol/werkstatt-site/ui/components/section-shell.astro.",
          fix: 'import SectionShell from "@warpgogol/werkstatt-site/ui/components/section-shell.astro";',
        });
      }
    }
    // SHELL-03: only check the frontmatter (where TS code lives), not the
    // template body — that avoids false positives from prose / comments.
    const fm = handle.source.match(/^---\s*([\s\S]*?)\s*---/);
    const fmText = fm ? fm[1] : "";
    if (/\b(VisualModifiers|visualModifierSchema)\b/.test(fmText)) {
      violations.push({
        file: rel,
        rule: "SHELL-03",
        message: "Reference to the deleted VisualModifiers / visualModifierSchema is forbidden.",
        fix: "Replace with the structured RFC-0101 contract (background / glass / density / tone).",
      });
    }
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
