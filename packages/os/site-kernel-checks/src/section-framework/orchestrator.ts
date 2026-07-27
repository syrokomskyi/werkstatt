/*
<MODULE_CONTRACT>
<purpose>layout.orchestrator.lint (LAY-01..03) — per-app: layout-orchestrator.ts opt-ins
match the features actually composed by the app's pages.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of section-framework.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  ok,
  fail,
  resolveAppSlug,
  extractFrontmatter,
  collectPageFiles,
  getBlocks,
  type BlockLike,
  type CheckResult,
  type Violation,
} from "./shared.ts";

export type OrchestratorFlag = "counters" | "inlineNumbers" | "reveal" | "parallax" | "stagger";

/**
 * RFC-0106: resolve the effective orchestrator flags from site config. The
 * generated layout-orchestrator.ts forwards `orchestrator.<flag> ?? false` from
 * `window.__SITE_CONFIG`, which is hydrated from `site/<lang>/labels.md`
 * frontmatter (`orchestrator: { counters, inlineNumbers, reveal, parallax,
 * stagger }`). The config is site-wide, so a flag counts as enabled when any
 * locale's labels.md sets it true.
 */
async function resolveOrchestratorFlagsFromSiteConfig(
  appDir: string,
): Promise<Record<OrchestratorFlag, boolean>> {
  const flags: Record<OrchestratorFlag, boolean> = {
    counters: false,
    inlineNumbers: false,
    reveal: false,
    parallax: false,
    stagger: false,
  };
  const siteDir = join(appDir, "src", "content", "site");
  let langDirs: string[];
  try {
    langDirs = await readdir(siteDir);
  } catch {
    return flags;
  }
  for (const lang of langDirs) {
    const labelsPath = join(siteDir, lang, "labels.md");
    const raw = await readFile(labelsPath, "utf8").catch(() => null);
    if (raw === null) continue;
    const fm = extractFrontmatter(raw);
    const orchestrator = fm?.orchestrator as Record<string, unknown> | undefined;
    if (!orchestrator) continue;
    for (const flag of Object.keys(flags) as OrchestratorFlag[]) {
      if (orchestrator[flag] === true) flags[flag] = true;
    }
  }
  return flags;
}

export async function runLayoutOrchestratorLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "layout.orchestrator.lint";
  const violations: Violation[] = [];
  const appSlug = resolveAppSlug(context);
  if (!appSlug) {
    return fail(cmd, [
      { file: "(no app)", rule: "LAY-00", message: "command requires --site <id>." },
    ]);
  }
  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", appSlug);
  const orchestratorPath = join(appDir, "src", "scripts", "layout-orchestrator.ts");
  const orchRel = relative(context.workspaceRoot, orchestratorPath).replace(/\\/g, "/");
  const orchRaw = await readFile(orchestratorPath, "utf8").catch(() => null);
  if (orchRaw === null) {
    return fail(cmd, [
      {
        file: orchRel,
        rule: "LAY-03",
        message: "layout-orchestrator.ts is missing.",
        fix: "Run scripts.orchestrator.generate.",
      },
    ]);
  }
  const invocation = orchRaw.match(/runStandardLayoutOrchestration\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!invocation) {
    return fail(cmd, [
      {
        file: orchRel,
        rule: "LAY-03",
        message: "layout-orchestrator.ts does not invoke runStandardLayoutOrchestration({ ... }).",
        fix: "Restore the canonical orchestrator invocation (scripts.orchestrator.generate).",
      },
    ]);
  }
  const argBody = invocation[1];
  // RFC-0106: orchestrator flags are configured at runtime via site config
  // (site/<lang>/labels.md `orchestrator:`) and the generated invocation forwards
  // them dynamically (`counters: orchestrator.counters ?? false`). In that shape
  // the literal argBody never contains `flag: true`, so the effective flags must
  // be resolved from the site config. Older static invocations (literal
  // `flag: true`) keep working via the regex fallback below.
  const usesDynamicConfig = /orchestrator\s*\.\s*\w+/.test(argBody);
  const declaredFlags: Record<OrchestratorFlag, boolean> = usesDynamicConfig
    ? await resolveOrchestratorFlagsFromSiteConfig(appDir)
    : {
        counters: /\bcounters\s*:\s*true\b/.test(argBody),
        inlineNumbers: /\binlineNumbers\s*:\s*true\b/.test(argBody),
        reveal: /\breveal\s*:\s*true\b/.test(argBody),
        parallax: /\bparallax\s*:\s*true\b/.test(argBody),
        stagger: /\bstagger\s*:\s*true\b/.test(argBody),
      };

  // Walk all pages + system.md to compute required flags
  const required: Record<OrchestratorFlag, boolean> = {
    counters: false,
    inlineNumbers: false,
    reveal: false,
    parallax: false,
    stagger: false,
  };

  function inspectBlock(block: BlockLike): void {
    const props = (block.props ?? {}) as Record<string, unknown>;
    const motion = props.motion as Record<string, unknown> | undefined;
    if (motion && motion.off !== true) {
      if (motion.reveal !== undefined) required.reveal = true;
      if (motion.parallax !== undefined) required.parallax = true;
      if (motion.stagger !== undefined) required.stagger = true;
    }
    const body = props.body as Record<string, unknown> | undefined;
    if (body?.kind === "stats" && body.animated === true) required.counters = true;
    if (Array.isArray(props.stats) && props.animated === true) required.counters = true;
    if (body?.kind === "rich" && body.animateNumbers === true) required.inlineNumbers = true;
  }

  const pageFiles = await collectPageFiles(join(appDir, "src", "content", "pages"));
  for (const file of pageFiles) {
    const raw = await readFile(file, "utf8");
    const fm = extractFrontmatter(raw);
    for (const block of getBlocks(fm)) inspectBlock(block);
  }

  // system.md shell.background image with parallax
  const systemPath = join(appDir, "src", "content", "system.md");
  const systemRaw = await readFile(systemPath, "utf8").catch(() => "");
  const systemFm = extractFrontmatter(systemRaw);
  const pages = (systemFm?.pages ?? []) as Array<Record<string, unknown>>;
  for (const page of pages ?? []) {
    const shell = page.shell as Record<string, unknown> | undefined;
    const bg = shell?.background as Record<string, unknown> | undefined;
    const props = bg?.props as Record<string, unknown> | undefined;
    const layers = props?.layers as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(layers)) continue;
    for (const layer of layers) {
      if (layer.kind === "image" && layer.parallax) {
        required.parallax = true;
      }
    }
  }

  // LAY-01 / LAY-02 cross-check
  (Object.keys(required) as OrchestratorFlag[]).forEach((flag) => {
    if (required[flag] && !declaredFlags[flag]) {
      violations.push({
        file: orchRel,
        rule: "LAY-01",
        message: `Pages require \`${flag}: true\` in runStandardLayoutOrchestration({...}) but the flag is absent.`,
        fix: `Add \`${flag}: true\` to the orchestrator invocation (or re-run scripts.orchestrator.generate).`,
      });
    } else if (!required[flag] && declaredFlags[flag]) {
      violations.push({
        file: orchRel,
        rule: "LAY-02",
        message: `Orchestrator enables \`${flag}: true\` but no page in this app uses the feature.`,
        fix: `Drop \`${flag}: true\` from the orchestrator invocation.`,
      });
    }
  });

  return violations.length ? fail(cmd, violations) : ok(cmd);
}
