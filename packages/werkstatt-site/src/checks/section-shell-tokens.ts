/*
<MODULE_CONTRACT>
<purpose>
[RFC-0122] tokens.colors.section-shell.lint — enforce the design-system token
contract for the eight canonical section-framework component CSS surfaces.
Raw #hex / rgb()/rgba() / hsl()/hsla() values inside these directories are
hard violations; only var(--ds-*) tokens, color-mix(...) compositions, and
the safe CSS keywords (transparent, currentColor, inherit, unset, initial)
are accepted.
</purpose>
<non-goals>
  <item>Do not scan &lt;style&gt; blocks inside .astro files; AST-grade .astro scanning is RFC-0120 territory.</item>
  <item>Do not lint app-local styles under apps/&lt;id&gt;/src/styles/ — that is covered by tokens.colors.lint.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { TOKEN_NAME_SET } from "@warpgogol/tokens";
import {
  collectFilesByExtensions,
  getLineColumn,
  stripBlockCommentsPreserveLength,
  stripUrlsPreserveLength,
} from "./checks/shared.ts";

interface Violation {
  file: string;
  rule: string;
  message: string;
  fix?: string;
  line?: number;
  column?: number;
  token?: string;
}

interface CheckResult {
  command: string;
  status: "ok" | "fail";
  violations: Violation[];
}

const COMMAND = "tokens.colors.section-shell.lint";

// Seven canonical section-framework component directories (RFC-0101..RFC-0105).
const SCOPED_COMPONENT_DIRS: readonly string[] = [
  "section-shell",
  "section-header",
  "section-body",
  "section-cta",
  "section-cta-group",
  "section-image",
  "site-background",
];

const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/gm;
const RGB_FUNC_REGEX = /\brgba?\s*\(/gim;
const HSL_FUNC_REGEX = /\bhsla?\s*\(/gim;

function ok(): KernelCommandResult<CheckResult> {
  return {
    exitCode: 0,
    data: { command: COMMAND, status: "ok", violations: [] },
    summary: `OK - ${COMMAND}`,
  };
}

function fail(violations: Violation[]): KernelCommandResult<CheckResult> {
  return {
    exitCode: 1,
    data: { command: COMMAND, status: "fail", violations },
    summary: `FAIL - ${COMMAND} (${violations.length} violation${violations.length === 1 ? "" : "s"})`,
  };
}

async function collectScopedCssFiles(workspaceRoot: string): Promise<string[]> {
  const componentsRoot = join(workspaceRoot, "packages", "ui", "src", "components");
  const exts = new Set([".css"]);
  const out: string[] = [];
  for (const dir of SCOPED_COMPONENT_DIRS) {
    const target = join(componentsRoot, dir);
    out.push(...(await collectFilesByExtensions(target, exts)));
  }
  return out;
}

function pushMatches(
  text: string,
  regex: RegExp,
  rule: string,
  message: string,
  fix: string,
  rel: string,
  violations: Violation[],
): void {
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const { line, column } = getLineColumn(text, index);
    violations.push({
      file: rel,
      rule,
      message,
      fix,
      line,
      column,
      token: match[0],
    });
  }
}

// ---------------------------------------------------------------------------
// RFC-0124: tokens.section-shell.contract.validate
// Cross-check every --ds-* token referenced under the eight section-framework
// component directories against TOKEN_NAME_SET (the canonical token catalog
// exported by @warpgogol/tokens). Catches drift where a section primitive
// references a token that no biome defines.
// ---------------------------------------------------------------------------

const TOKEN_REF_REGEX = /--ds-[a-zA-Z0-9_-]+/g;
const CONTRACT_COMMAND = "tokens.section-shell.contract.validate";

function ok2(command: string): KernelCommandResult<CheckResult> {
  return {
    exitCode: 0,
    data: { command, status: "ok", violations: [] },
    summary: `OK - ${command}`,
  };
}

function fail2(command: string, violations: Violation[]): KernelCommandResult<CheckResult> {
  return {
    exitCode: 1,
    data: { command, status: "fail", violations },
    summary: `FAIL - ${command} (${violations.length} violation${violations.length === 1 ? "" : "s"})`,
  };
}

export async function runSectionShellTokenContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const violations: Violation[] = [];
  // Scan both .css and .astro files in scope — token references appear in both.
  const componentsRoot = join(context.workspaceRoot, "packages", "ui", "src", "components");
  const exts = new Set([".css", ".astro"]);
  const files: string[] = [];
  for (const dir of SCOPED_COMPONENT_DIRS) {
    files.push(...(await collectFilesByExtensions(join(componentsRoot, dir), exts)));
  }
  // Track each unique (file, token) pair so we don't report the same miss multiple times.
  const reported = new Set<string>();
  for (const file of files) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const content = await readFile(file, "utf8");
    const cleanText = stripUrlsPreserveLength(stripBlockCommentsPreserveLength(content));
    for (const match of cleanText.matchAll(TOKEN_REF_REGEX)) {
      const token = match[0];
      // Skip incomplete trailing `--ds-` from dynamic concatenations like `var(--ds-color-${tone})`.
      if (token === "--ds-" || token.endsWith("-")) continue;
      if (TOKEN_NAME_SET.has(token)) continue;
      const key = `${rel}::${token}`;
      if (reported.has(key)) continue;
      reported.add(key);
      const { line, column } = getLineColumn(cleanText, match.index ?? 0);
      violations.push({
        file: rel,
        rule: "SHELL-TOK-CONTRACT-01",
        message: `Section-framework CSS references ${token} but the token is not in @warpgogol/tokens TOKEN_NAME_SET.`,
        fix: "Add the token to packages/tokens/src/tokens.css (so every biome can override it) or change the reference to an existing --ds-* token.",
        line,
        column,
        token,
      });
    }
  }
  return violations.length === 0 ? ok2(CONTRACT_COMMAND) : fail2(CONTRACT_COMMAND, violations);
}

export async function runSectionShellColorTokenLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const violations: Violation[] = [];
  const files = await collectScopedCssFiles(context.workspaceRoot);

  for (const file of files) {
    const rel = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const content = await readFile(file, "utf8");
    const cleanText = stripUrlsPreserveLength(stripBlockCommentsPreserveLength(content));

    pushMatches(
      cleanText,
      HEX_COLOR_REGEX,
      "SHELL-TOK-01",
      "Raw #hex color is forbidden in section-framework component CSS.",
      "Replace with var(--ds-color-*) from packages/tokens/ or the active biome.",
      rel,
      violations,
    );
    pushMatches(
      cleanText,
      RGB_FUNC_REGEX,
      "SHELL-TOK-02",
      "Raw rgb()/rgba() function is forbidden in section-framework component CSS.",
      "Use var(--ds-color-*) directly, or compose via color-mix(in srgb, var(--ds-color-*), ...).",
      rel,
      violations,
    );
    pushMatches(
      cleanText,
      HSL_FUNC_REGEX,
      "SHELL-TOK-03",
      "Raw hsl()/hsla() function is forbidden in section-framework component CSS.",
      "Use var(--ds-color-*) directly, or compose via color-mix(in srgb, var(--ds-color-*), ...).",
      rel,
      violations,
    );
  }

  return violations.length === 0 ? ok() : fail(violations);
}
