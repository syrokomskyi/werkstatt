/*
<MODULE_CONTRACT>
<purpose>
Implements tokens.catalog.sync — a workspace-scoped validator that parses
packages/tokens/src/tokens.css :root block and compares the set of --ds-*
custom property names against the TOKEN_NAMES array in @warpgogol/tokens.
Reports drift in either direction: tokens declared in CSS but missing from
the TS catalog, and tokens listed in the TS catalog but missing from CSS.
</purpose>
<non-goals>
  <item>Do not validate token values — only names.</item>
  <item>Do not validate token usage in apps or packages — other commands handle that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: tokens.catalog.sync validator (Candidate 2 — derive token catalog from tokens.css).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { TOKEN_NAMES } from "@warpgogol/tokens";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

const COMMAND = "tokens.catalog.sync";

/** Extract --ds-* custom property names from CSS content. */
function extractTokenNamesFromCss(css: string): Set<string> {
  const names = new Set<string>();
  // Match custom property definitions: --ds-foo: ...;
  const regex = /(--ds-[a-z0-9-]+)\s*:/gi;
  let match;
  while ((match = regex.exec(css)) !== null) {
    names.add(match[1]);
  }
  return names;
}

interface CatalogSyncData {
  cssTokenCount: number;
  tsTokenCount: number;
  missingInTs: string[];
  missingInCss: string[];
}

export async function runTokensCatalogSync(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CatalogSyncData>> {
  const cssPath = join(context.workspaceRoot, "packages", "tokens", "src", "tokens.css");

  let cssContent: string;
  try {
    cssContent = await context.io.readFile(cssPath);
  } catch (e) {
    context.logger.error(
      `${COMMAND}: cannot read ${cssPath} — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { cssTokenCount: 0, tsTokenCount: 0, missingInTs: [], missingInCss: [] },
    };
  }

  const cssTokens = extractTokenNamesFromCss(cssContent);
  const tsTokens = new Set<string>(TOKEN_NAMES);

  const missingInTs = [...cssTokens].filter((t) => !tsTokens.has(t)).sort();
  const missingInCss = [...tsTokens].filter((t) => !cssTokens.has(t)).sort();

  const totalViolations = missingInTs.length + missingInCss.length;

  if (totalViolations === 0) {
    context.logger.info(
      `${COMMAND}: OK — ${cssTokens.size} CSS tokens, ${tsTokens.size} TS tokens, in sync`,
    );
  } else {
    for (const token of missingInTs) {
      context.logger.error(
        `${COMMAND}: token "${token}" is declared in tokens.css but missing from TOKEN_NAMES in @warpgogol/tokens`,
      );
    }
    for (const token of missingInCss) {
      context.logger.error(
        `${COMMAND}: token "${token}" is listed in TOKEN_NAMES but missing from tokens.css`,
      );
    }
  }

  return {
    data: {
      cssTokenCount: cssTokens.size,
      tsTokenCount: tsTokens.size,
      missingInTs,
      missingInCss,
    },
    exitCode: totalViolations > 0 ? 1 : 0,
    summary:
      totalViolations === 0
        ? `OK — ${cssTokens.size} CSS tokens in sync with ${tsTokens.size} TS tokens`
        : undefined,
  };
}
