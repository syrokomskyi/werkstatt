/*
<MODULE_CONTRACT>
<purpose>section.image.contract.validate (IMG-01..02) — authored images render via
&lt;SectionImage&gt;, never a raw astro:assets &lt;Image&gt; nor a flat legacy imageFade key.</purpose>
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
import type { AstroParseHandle } from "../lib/astro-parse.ts";
import {
  getAstro,
  isSectionImageAncestor,
  ok,
  fail,
  walkAstroSections,
  walkSectionManifests,
  type CheckResult,
  type Violation,
} from "./shared.ts";

const LEGACY_IMAGE_FADE_KEYS = [
  "imageFadeBottom",
  "imageFadeTop",
  "imageFadeLeft",
  "imageFadeRight",
];

const ALLOWED_RAW_IMAGE_USERS = new Set([
  // composite sections that own their bespoke image positions
  "hero",
  "hero-decision-card",
  "women",
]);

export async function runSectionImageContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.image.contract.validate";
  const violations: Violation[] = [];
  const files = await walkAstroSections(context.workspaceRoot);
  for (const file of files) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const slug = rel.match(/\/sections\/([^/]+)\//)?.[1];
    if (!slug) continue;
    if (ALLOWED_RAW_IMAGE_USERS.has(slug)) continue;
    let handle: AstroParseHandle;
    try {
      handle = await getAstro(context, file);
    } catch {
      continue;
    }
    // IMG-01: an <Image> component import from astro:assets is allowed
    // only when every <Image> usage sits inside a <SectionImage> ancestor
    // (composite kept-out slugs are already short-circuited above).
    const importsImage = handle
      .imports()
      .some((i) => i.specifier === "Image" && i.source === "astro:assets");
    if (!importsImage) continue;
    handle.walk((node, ancestors) => {
      if (node.type !== "component" || node.name !== "Image") return;
      if (handle.insideAncestor(ancestors, isSectionImageAncestor)) return;
      violations.push({
        file: rel,
        rule: "IMG-01",
        message:
          "Raw <Image> from astro:assets inside a section is forbidden; render images via <SectionImage>.",
        fix: 'import SectionImage from "@warpgogol/werkstatt-site/ui/components/section-image.astro"; <SectionImage imageName=... fade=... />',
      });
    });
  }
  const manifests = await walkSectionManifests(context.workspaceRoot);
  for (const file of manifests) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const raw = await readFile(file, "utf8");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = parseYaml(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const localProps = (parsed?.propsSchema as Record<string, unknown> | undefined)?.properties as
      Record<string, unknown> | undefined;
    if (!localProps) continue;
    for (const legacy of LEGACY_IMAGE_FADE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(localProps, legacy)) {
        violations.push({
          file: rel,
          rule: "IMG-02",
          message: `Flat legacy imageFade key "${legacy}" at section root is forbidden; use <SectionImage fade={...}> or defaultImageFade.`,
          fix: "Move fade configuration into the image or member-level imageFade primitive.",
        });
      }
    }
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
