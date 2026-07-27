/*
<MODULE_CONTRACT>
<purpose>section.motion.contract.validate (MOT-01..03) — per-app: section motion stays
within the biome motionStance envelope.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of section-framework.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import {
  ok,
  fail,
  resolveAppSlug,
  extractFrontmatter,
  collectPageFiles,
  getBlocks,
  blockType,
  type CheckResult,
  type Violation,
} from "./shared.ts";

export async function runSectionMotionContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "section.motion.contract.validate";
  const violations: Violation[] = [];
  const appSlug = resolveAppSlug(context);
  if (!appSlug) {
    return fail(cmd, [
      {
        file: "(no app)",
        rule: "MOT-00",
        message: "section.motion.contract.validate requires --site <id>.",
      },
    ]);
  }
  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", appSlug);
  const systemRaw = await readFile(join(appDir, "src", "content", "system.md"), "utf8").catch(
    () => "",
  );
  const systemFm = extractFrontmatter(systemRaw);
  const identity = (systemFm?.identity ?? {}) as Record<string, unknown>;
  const biomeId = typeof identity.biome === "string" ? identity.biome : null;
  if (!biomeId) {
    return fail(cmd, [
      {
        file: `apps/${appSlug}/src/content/system.md`,
        rule: "MOT-00",
        message: "system.md identity.biome is missing; cannot resolve motionStance envelope.",
        fix: "Run system.manifest.validate first.",
      },
    ]);
  }
  const biomePath = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "biomes",
    `${biomeId}.yaml`,
  );
  const biomeRaw = await readFile(biomePath, "utf8").catch(() => "");
  let biomeYaml: Record<string, unknown> | null = null;
  try {
    biomeYaml = parseYaml(biomeRaw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  const axes = (biomeYaml?.axes ?? {}) as Record<string, unknown>;
  const motionStance =
    typeof axes.motionStance === "string"
      ? (axes.motionStance as "static" | "restrained" | "expressive")
      : "restrained";

  const pageFiles = await collectPageFiles(join(appDir, "src", "content", "pages"));
  for (const file of pageFiles) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const raw = await readFile(file, "utf8");
    const fm = extractFrontmatter(raw);
    const blocks = getBlocks(fm);
    blocks.forEach((block, i) => {
      const props = (block.props ?? {}) as Record<string, unknown>;
      const motion = props.motion as Record<string, unknown> | undefined;
      const where = `${rel} blocks[${i}] (${blockType(block) || "?"})`;
      if (motion && motion.off === true) return; // explicit opt-out
      if (motion?.parallax !== undefined && motionStance !== "expressive") {
        violations.push({
          file: rel,
          rule: "MOT-01",
          message: `${where}: motion.parallax requires biome motionStance="expressive" (current: "${motionStance}").`,
          fix: "Remove motion.parallax or upgrade the biome motionStance.",
        });
      }
      if (motion?.reveal !== undefined && motionStance === "static") {
        violations.push({
          file: rel,
          rule: "MOT-02",
          message: `${where}: motion.reveal is forbidden under biome motionStance="static".`,
          fix: "Remove motion.reveal or set motion: { off: true }.",
        });
      }
      if (motion?.stagger !== undefined && motionStance === "static") {
        violations.push({
          file: rel,
          rule: "MOT-02",
          message: `${where}: motion.stagger is forbidden under biome motionStance="static".`,
          fix: "Remove motion.stagger or set motion: { off: true }.",
        });
      }
      // MOT-03: reject `animated` at section root only when the section also
      // declares `body.kind: stats` — that is the canonical home for the field.
      // Composite sections (hero, hero-decision-card, …) may legitimately
      // declare their own root-level `animated` in their manifest propsSchema;
      // strict additionalProperties in page.block.validate catches misuse there.
      const body = props.body as Record<string, unknown> | undefined;
      if (typeof props.animated === "boolean" && body?.kind === "stats") {
        violations.push({
          file: rel,
          rule: "MOT-03",
          message: `${where}: flat \`animated: boolean\` at section root is forbidden when body.kind is "stats"; the field lives inside body.`,
          fix: "Move animated into props.body.",
        });
      }
    });
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
