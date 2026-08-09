/*
<MODULE_CONTRACT>
<purpose>section.background.contract.validate (BG-01..02) — no flat legacy visual-modifier
props survive at section manifest root; every manifest composes section-visual.</purpose>
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
} from "@warpgogol/werkstatt/kernel";
import {
  isUtilitySection,
  ok,
  fail,
  walkSectionManifests,
  type CheckResult,
  type Violation,
} from "./shared.ts";

const LEGACY_FLAT_VISUAL_KEYS = [
  "transparent",
  "verticalFade",
  "noTopFade",
  "noBottomFade",
  "topVerticalFadeOpacity",
  "bottomVerticalFadeOpacity",
  "texture",
  "opacity",
];

export async function runSectionBackgroundContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.background.contract.validate";
  const violations: Violation[] = [];
  const manifests = await walkSectionManifests(context.workspaceRoot);
  for (const file of manifests) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    // RFC-0126: utility sections (breadcrumbs, navigation) intentionally do
    // not compose the section-visual fragment.
    if (isUtilitySection(rel)) continue;
    const raw = await readFile(file, "utf8");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = parseYaml(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!parsed) continue;
    const compose = parsed.propsSchemaCompose as unknown;
    // RFC-0119: accept pinned ids — strip `@<version>` before matching.
    const composeBaseIds = Array.isArray(compose)
      ? (compose as unknown[])
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.split("@")[0])
      : [];
    const hasVisualFragment = composeBaseIds.includes("section-visual");
    if (!hasVisualFragment) {
      violations.push({
        file: rel,
        rule: "BG-01",
        message:
          "Section manifest must compose the `section-visual` fragment via propsSchemaCompose.",
        fix: "Add `- section-visual` to propsSchemaCompose.",
      });
    }
    const localProps = (parsed.propsSchema as Record<string, unknown> | undefined)?.properties as
      Record<string, unknown> | undefined;
    for (const legacy of LEGACY_FLAT_VISUAL_KEYS) {
      if (localProps && Object.prototype.hasOwnProperty.call(localProps, legacy)) {
        violations.push({
          file: rel,
          rule: "BG-02",
          message: `Flat legacy visual-modifier "${legacy}" is forbidden at the manifest propsSchema root.`,
          fix: "Compose the `section-visual` fragment instead of declaring flat visual props.",
        });
      }
    }
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
