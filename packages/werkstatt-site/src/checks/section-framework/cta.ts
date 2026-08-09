/*
<MODULE_CONTRACT>
<purpose>section.cta.contract.validate (CTA-01) — CTAs render via &lt;SectionCta&gt; /
&lt;SectionCtaGroup&gt;, never a raw anchor with a btn class.</purpose>
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
} from "@warpgogol/werkstatt/kernel";
import type { AstroParseHandle } from "../lib/astro-parse.ts";
import {
  getAstro,
  isSectionCtaAncestor,
  isUtilitySection,
  sectionSlugOf,
  ok,
  fail,
  walkAstroSections,
  type CheckResult,
  type Violation,
} from "./shared.ts";

// RFC-0127: composite sections that own their bespoke CTA layouts (e.g., a CTA
// embedded inside a glass card, a decision matrix, or a trust-card surface).
// The rule "no raw <a class='btn'> inside a section" stays for non-composite
// sections; composites carry the architectural freedom to render CTAs in
// their bespoke shell.
const ALLOWED_RAW_CTA_USERS: ReadonlySet<string> = new Set([
  "hero",
  "hero-decision-card",
  "founder-trust-card",
]);

export async function runSectionCtaContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.cta.contract.validate";
  const violations: Violation[] = [];
  const files = await walkAstroSections(context.workspaceRoot);
  for (const file of files) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    // RFC-0126: skip utility sections (no CTA surface).
    if (isUtilitySection(rel)) continue;
    // RFC-0127: composite sections that own their bespoke CTA layouts.
    const slug = sectionSlugOf(rel);
    if (slug && ALLOWED_RAW_CTA_USERS.has(slug)) continue;
    let handle: AstroParseHandle;
    try {
      handle = await getAstro(context, file);
    } catch {
      continue;
    }
    handle.walk((node, ancestors) => {
      if (node.type !== "element" || node.name !== "a") return;
      const cls = handle.attr(node, "class") ?? "";
      if (!/\bbtn\b/.test(cls)) return;
      if (handle.insideAncestor(ancestors, isSectionCtaAncestor)) return;
      violations.push({
        file: rel,
        rule: "CTA-01",
        message:
          'Raw <a class="btn ..."> inside a section is forbidden; use <SectionCta> or <SectionCtaGroup>.',
        fix: "Render the CTA via <SectionCta /> or <SectionCtaGroup items={...} />.",
      });
    });
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
