/*
<MODULE_CONTRACT>
<purpose>site.background.contract.validate (SITE-01..03) — per-app: site-background shell
archetype usage is unique per page and layer shape is well-formed.</purpose>
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
import { siteBackgroundLayerSchema } from "@gogol/share/schemas/site-background";
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

export async function runSiteBackgroundContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "site.background.contract.validate";
  const violations: Violation[] = [];
  const appSlug = resolveAppSlug(context);
  if (!appSlug) {
    return fail(cmd, [
      { file: "(no app)", rule: "SITE-00", message: "command requires --site <id>." },
    ]);
  }
  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", appSlug);

  function validateLayers(layers: unknown, file: string, where: string): void {
    if (!Array.isArray(layers) || layers.length === 0) {
      violations.push({
        file,
        rule: "SITE-02",
        message: `${where}: site-background props.layers must be a non-empty array.`,
        fix: "Declare at least one layer (color | gradient | image).",
      });
      return;
    }
    layers.forEach((layer, idx) => {
      const parsed = siteBackgroundLayerSchema.safeParse(layer);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        violations.push({
          file,
          rule: "SITE-02",
          message: `${where} layer[${idx}]: ${first.path.join(".")} — ${first.message}`,
          fix: "Conform layer to siteBackgroundLayerSchema (kind: color | gradient | image).",
        });
      }
    });
  }

  // system.md shell.background
  const systemPath = join(appDir, "src", "content", "system.md");
  const systemRaw = await readFile(systemPath, "utf8").catch(() => "");
  const systemFm = extractFrontmatter(systemRaw);
  if (systemFm) {
    const systemRel = relative(context.workspaceRoot, systemPath).replace(/\\/g, "/");
    const pages = (systemFm.pages ?? []) as Array<Record<string, unknown>>;
    for (const page of pages ?? []) {
      const pageId = typeof page.pageId === "string" ? page.pageId : "(unknown)";
      const shell = page.shell as Record<string, unknown> | undefined;
      const bg = shell?.background as Record<string, unknown> | undefined;
      if (bg && bg.enabled !== false) {
        const props = bg.props as Record<string, unknown> | undefined;
        if (props && "layers" in props) {
          validateLayers(props.layers, systemRel, `pages[pageId=${pageId}].shell.background.props`);
        }
      }
    }
  }

  // Per-page checks
  const pageFiles = await collectPageFiles(join(appDir, "src", "content", "pages"));
  for (const file of pageFiles) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const raw = await readFile(file, "utf8");
    const fm = extractFrontmatter(raw);
    const blocks = getBlocks(fm);
    let shellBgInBlocks = 0;
    blocks.forEach((block, i) => {
      const t = blockType(block);
      if (t === "site-background") {
        shellBgInBlocks += 1;
        violations.push({
          file: rel,
          rule: "SITE-03",
          message: `blocks[${i}] declares type="site-background"; shell archetypes belong in system.md shell.background, not in blocks[].`,
          fix: "Move the site-background config to system.md pages[].shell.background.",
        });
      }
    });
    if (shellBgInBlocks > 1) {
      violations.push({
        file: rel,
        rule: "SITE-01",
        message: `${shellBgInBlocks} site-background blocks declared; at most one per page.`,
        fix: "Keep a single site-background declaration (preferably in system.md shell).",
      });
    }
  }
  return violations.length ? fail(cmd, violations) : ok(cmd);
}
