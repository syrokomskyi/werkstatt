/*
<MODULE_CONTRACT>
<purpose>
cosmic.literals.lint — RFC-0263: fails when any name from the Star/Planet/Moon
cosmic catalogs appears as a quoted string literal in packages/share/src/**.
The dispatch layer (buildPage and its neighbors) must derive cosmic-name-keyed
behavior from the archetype registry (@warpgogol/werkstatt-site/ontology/archetypes), never from
literals hardcoded in dispatch code — see roleByCosmicName replacing the old
UNNUMBERED_HERO_PLANETS set.
</purpose>
<non-goals>
  <item>Do not scan packages/ontology (the catalogs themselves live there) or any other package.</item>
  <item>Do not flag bare identifiers or type references — only quoted string literals.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0263: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { StarCatalog, PlanetCatalog, MoonCatalog } from "@warpgogol/werkstatt-site/ontology/cosmic";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

const IGNORE_MARKER = "cosmic-literals-ignore";

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  return collectFiles(rootDir, { extensions: [".ts", ".tsx"], ignore: () => false });
}

interface LiteralHit {
  line: number;
  name: string;
  catalog: "StarCatalog" | "PlanetCatalog" | "MoonCatalog";
}

const QUOTED_LITERAL_RE = /(["'`])([A-Za-z][A-Za-z0-9]*)\1/g;

/**
 * Scan file text for quoted string literals matching a cosmic catalog name.
 * Strips `//` line comments and `/* *\/` block comments before matching, and
 * skips any line carrying the `cosmic-literals-ignore` disable marker.
 */
export function scanForCosmicLiterals(
  text: string,
  catalogByName: Map<string, LiteralHit["catalog"]>,
): LiteralHit[] {
  // Strip block comments first (replace with equal-length blank so line
  // numbers stay stable), then process line-by-line for `//` comments.
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " "),
  );

  const hits: LiteralHit[] = [];
  const lines = withoutBlockComments.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    if (rawLine.includes(IGNORE_MARKER)) continue;

    const commentIndex = rawLine.indexOf("//");
    const line = commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine;

    for (const match of line.matchAll(QUOTED_LITERAL_RE)) {
      const name = match[2] ?? "";
      const catalog = catalogByName.get(name);
      if (catalog) hits.push({ line: i + 1, name, catalog });
    }
  }
  return hits;
}

export async function runCosmicLiteralsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const catalogByName = new Map<string, LiteralHit["catalog"]>();
  for (const name of StarCatalog) catalogByName.set(name, "StarCatalog");
  for (const name of PlanetCatalog) catalogByName.set(name, "PlanetCatalog");
  for (const name of MoonCatalog) catalogByName.set(name, "MoonCatalog");

  const scanRoot = join(context.workspaceRoot, "packages", "share", "src");
  const files = await collectSourceFiles(scanRoot);
  const diagnostics: Diagnostic[] = [];

  for (const filePath of files) {
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const relFile = relative(context.workspaceRoot, filePath).replace(/\\/g, "/");
    for (const hit of scanForCosmicLiterals(text, catalogByName)) {
      diagnostics.push({
        ruleId: "COSMIC-LIT-01",
        severity: "error",
        file: relFile,
        line: hit.line,
        message: `Cosmic-catalog name "${hit.name}" (${hit.catalog}) appears as a string literal — dispatch code must derive cosmic-name-keyed behavior from the archetype registry.`,
        fixHint:
          `Replace the literal with a lookup against @warpgogol/werkstatt-site/ontology/archetypes (e.g. roleByCosmicName["${hit.name}"]), ` +
          `or add a trailing "// ${IGNORE_MARKER}: <reason>" comment if the literal is unavoidable.`,
        data: { name: hit.name, catalog: hit.catalog },
      });
    }
  }

  return diagnosticsResult("cosmic.literals.lint", diagnostics);
}
