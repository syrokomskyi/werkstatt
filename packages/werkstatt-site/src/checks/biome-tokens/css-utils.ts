/*
<MODULE_CONTRACT>
<purpose>CSS parsing utilities for RFC-0201 biome token validation: collect CSS files, extract var(--ds-*) token uses, normalize CSS values, and extract custom property definitions.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from biome-tokens.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { collectFiles } from "@warpgogol/share/fs";
import { normalizeCssValue } from "@warpgogol/share/css-value-normalize";
import type { CssTokenUse } from "./types.ts";

// Collect CSS files recursively
export async function collectCssFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".css"], ignore: () => false });
}

// Extract var(--ds-*) token uses from CSS
export function extractTokenUses(cssContent: string, filePath: string): CssTokenUse[] {
  const uses: CssTokenUse[] = [];
  const lines = cssContent.split("\n");
  let currentSelector = "";

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNum = lineIndex + 1;

    const ruleStartMatch = line.match(/^\s*([^{]+)\{/);
    if (ruleStartMatch) {
      currentSelector = ruleStartMatch[1].trim();
    }

    if (line.includes("}") && !line.includes("{")) {
      if (line.trim() === "}") {
        currentSelector = "";
      }
    }

    const varRegex = /var\((--ds-[a-z0-9-]+)(?:\s*,\s*([^)]+))?\)/gi;
    let match;
    while ((match = varRegex.exec(line)) !== null) {
      const token = match[1];
      const fallback = match[2]?.trim();
      const column = match.index + 1;
      const beforeVar = line.slice(0, match.index);
      const propMatch = beforeVar.match(/([a-z-]+)\s*:\s*$/i);
      const property = propMatch ? propMatch[1] : "unknown";

      uses.push({
        file: filePath,
        selector: currentSelector,
        property,
        token,
        fallback,
        line: lineNum,
        column,
      });
    }
  }
  return uses;
}

// Re-export the shared normalizer so existing imports from this module keep working.
export { normalizeCssValue };

// Extract CSS custom property definitions
export function extractCssDefinitions(cssContent: string): Map<string, string> {
  const definitions = new Map<string, string>();
  const defRegex = /(--ds-[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = defRegex.exec(cssContent)) !== null) {
    definitions.set(match[1], match[2].trim());
  }
  return definitions;
}
