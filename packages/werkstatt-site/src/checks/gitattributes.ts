/*
<MODULE_CONTRACT>
<purpose>
  RFC-0336: derives a machine-managed `linguist-generated=true` block for root
  `.gitattributes` from the two existing generated-artifact registries —
  `docs/command-manifest.generated.yaml` (`writes` globs, RFC-0266) and
  `GENERATOR_OWNERSHIP_MAP` (RFC-0087) — so generated output is marked for
  GitHub diff-collapse without anyone hand-maintaining a path list.
</purpose>
<non-goals>
  <item>Do not shell out to git — pattern/ignore matching is a pure, offline, in-process scan
  so this command stays read-only-safe and works without git on PATH.</item>
  <item>Do not add -diff or binary attributes — only linguist-generated=true (founder decision).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0336: initial implementation.</item>
  <item>RFC-0811: import shared pattern-matching utilities from ownership-pattern-match.ts.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import {
  buildGeneratedHeader,
  buildCommandManifest,
  hasGeneratedMarker,
  writeFileAtomic,
  type CheckResult,
  type Diagnostic,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
import {
  segmentToRegexSource,
  ownPatternToExactRegex,
  normalizeOwnershipPath,
} from "./ownership-pattern-match.ts";
import { isGeneratedMarkerTextCandidate } from "@warpgogol/werkstatt/kernel";

const BEGIN_SENTINEL =
  "# BEGIN generated-artifacts (managed by gitattributes.generate — RFC-0336; do not edit by hand)";
const END_SENTINEL = "# END generated-artifacts";
const GITATTRIBUTES_RELATIVE = ".gitattributes";
const GITIGNORE_RELATIVE = ".gitignore";

// Bounded, cheap scan roots for GITATTR-03 — the directories generated
// artifacts actually live in (mirrors GENERATOR_OWNERSHIP_MAP + writes globs).
// A full workspace walk is unnecessary and slow; this stays a fast advisory check.
const APP_SCAN_GLOBS = [
  "AGENTS.md",
  "src/content/AGENTS.md",
  "src/styles/AGENTS.md",
  "public/**/*.md",
  "public/**/*.txt",
  "public/**/*.xml",
  "public/**/*.json",
  "src/**/*.generated.ts",
  "src/**/*.generated.yaml",
  "src/**/*.generated.css",
  "src/styles/*.css",
  "src/pages/**/*.astro",
  "src/pages/**/*.ts",
  "src/middleware.ts",
  "src/middleware/*.ts",
  "src/content.config.ts",
  "src/env.d.ts",
  "tools/**/*.ts",
];

// ---------------------------------------------------------------------------
// Pattern derivation
// ---------------------------------------------------------------------------

/** Builds a "matches this entry or anything nested under it" regex for a raw .gitignore line. */
function gitignoreLineToRegex(rawLine: string): RegExp | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) return null;
  let body = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  const anchored = body.replace(/^\//, "").includes("/");
  body = body.replace(/^\//, "");
  const finalPattern = anchored ? body : `**/${body}`;
  const segments = finalPattern.split("/").filter((s) => s.length > 0);
  const pieces: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    pieces.push(
      seg === "**" ? (i === segments.length - 1 ? ".*" : "(?:[^/]+/)*") : segmentToRegexSource(seg),
    );
  }
  let source = "^";
  for (let i = 0; i < pieces.length; i++) {
    source += pieces[i];
    const isRecursiveNonLast = segments[i] === "**" && i !== segments.length - 1;
    if (i < pieces.length - 1 && !isRecursiveNonLast) source += "/";
  }
  return new RegExp(`${source}(?:/.*)?$`);
}

function normalizeWritesPattern(raw: string): string {
  let pattern = raw.replace(/\\/g, "/");
  if (pattern === "<app>") {
    pattern = "apps/*";
  } else if (pattern.startsWith("<app>/")) {
    pattern = `apps/*/${pattern.slice("<app>/".length)}`;
  }
  return pattern;
}

/**
 * Expands a normalized pattern (which may contain `{placeholder}` tokens) into
 * one or two candidate glob variants: a direct single-segment substitution,
 * plus — when a placeholder shares a segment with literal text (e.g.
 * `{route}.md`, which can stand for a multi-segment slug) — a recursive
 * variant so nested files are not silently excluded.
 */
function expandPlaceholderVariants(pattern: string): string[] {
  const segments = pattern.split("/");
  const wholeSegmentPlaceholder = (seg: string): boolean => /^\{[a-zA-Z0-9_]+\}$/.test(seg);
  const embeddedPlaceholder = (seg: string): boolean =>
    /\{[a-zA-Z0-9_]+\}/.test(seg) && !wholeSegmentPlaceholder(seg);

  const direct = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "*")))
    .join("/");

  const embeddedIndex = segments.findIndex(embeddedPlaceholder);
  if (embeddedIndex === -1) return [direct];

  const recursiveSegments = segments.map((seg, i) => {
    if (i === embeddedIndex) return `**/${seg.replace(/\{[a-zA-Z0-9_]+\}/g, "*")}`;
    return wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "*");
  });
  const recursive = recursiveSegments.join("/");
  return direct === recursive ? [direct] : [direct, recursive];
}

/** Collapses adjacent "**\/**" segments — redundant, but noisy to read. */
function collapseAdjacentDoubleStars(pattern: string): string {
  return pattern
    .split("/")
    .filter((seg, i, all) => seg !== "**" || all[i - 1] !== "**")
    .join("/");
}

/** Drops a narrower `.../*.<ext>` pattern when a broader `.../**\/*.<ext>` sibling is also present. */
function collapseRedundant(patterns: Set<string>): string[] {
  const normalized = new Set([...patterns].map(collapseAdjacentDoubleStars));
  const toRemove = new Set<string>();
  for (const p of normalized) {
    const m = p.match(/^(.*)\/\*(\.[a-zA-Z0-9]+)$/);
    if (m) {
      const [, prefix, ext] = m;
      if (normalized.has(`${prefix}/**/*${ext}`)) toRemove.add(p);
    }
  }
  return [...normalized].filter((p) => !toRemove.has(p)).sort();
}

export interface ManagedPatternsResult {
  patterns: string[];
  omittedIgnored: string[];
}

/** Derives the final, sorted, ignore-filtered `.gitattributes` pattern set. */
export async function buildManagedPatterns(
  context: Pick<KernelRuntimeContext, "workspaceRoot" | "io">,
): Promise<ManagedPatternsResult> {
  const manifest = await buildCommandManifest(context.workspaceRoot);
  const candidates = new Set<string>();

  // RFC-0336: exclude *.clean/*.prune commands — their `writes` describe a
  // deletion/pruning scope (e.g. "may remove anything stale under public/"),
  // not "this exact output is generated content". Including them would mark
  // whole mixed authored+generated trees (e.g. apps/*/public/**) as generated.
  const isPruneCommand = (name: string): boolean => /\.(clean|prune)$/.test(name);

  for (const command of manifest.commands) {
    if (isPruneCommand(command.name)) continue;
    for (const rawWrite of command.writes) {
      for (const variant of expandPlaceholderVariants(normalizeWritesPattern(rawWrite))) {
        candidates.add(variant);
      }
    }
  }
  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    for (const variant of expandPlaceholderVariants(normalizeOwnershipPath(entry.path))) {
      candidates.add(variant);
    }
  }

  let gitignoreLines: string[] = [];
  try {
    const raw = await context.io.readFile(join(context.workspaceRoot, GITIGNORE_RELATIVE));
    gitignoreLines = raw.split(/\r?\n/);
  } catch {
    gitignoreLines = [];
  }
  const ignoreRegexes = gitignoreLines
    .map(gitignoreLineToRegex)
    .filter((re): re is RegExp => re !== null);

  // A pattern is inert in .gitattributes when EVERY path it could match is
  // already gitignored. We approximate "every path" with the pattern's own
  // literal skeleton (placeholders/wildcards replaced by a fixed probe
  // segment) — sufficient because our patterns and .gitignore entries here
  // share the same directory shape by construction.
  // .gitattributes itself is a hand-authored file gitattributes.generate only
  // rewrites one managed section of — never mark the whole file generated.
  candidates.delete(GITATTRIBUTES_RELATIVE);

  const omittedIgnored: string[] = [];
  const kept = new Set<string>();
  for (const pattern of candidates) {
    const probe = pattern
      .split("/")
      .map((seg) => (seg === "**" ? "sample-dir" : seg.replace(/\*/g, "sample")))
      .join("/");
    const ignored = ignoreRegexes.some((re) => re.test(probe));
    if (ignored) {
      omittedIgnored.push(pattern);
    } else {
      kept.add(pattern);
    }
  }

  return { patterns: collapseRedundant(kept), omittedIgnored: omittedIgnored.sort() };
}

/** Renders the full sentinel-delimited managed block (including the marker line). */
export function buildManagedBlock(patterns: string[]): string {
  const width = patterns.reduce((max, p) => Math.max(max, p.length), 0);
  const lines = patterns.map((p) => `${p.padEnd(width + 1)}linguist-generated=true`);
  return [
    BEGIN_SENTINEL,
    buildGeneratedHeader({
      ownerCommand: "gitattributes.generate",
      filePath: ".gitattributes",
    }).trimEnd(),
    ...lines,
    END_SENTINEL,
  ].join("\n");
}

function splitManagedBlock(content: string): {
  before: string;
  block: string | null;
  after: string;
} {
  const beginIdx = content.indexOf(BEGIN_SENTINEL);
  const endIdx = content.indexOf(END_SENTINEL);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    return { before: content, block: null, after: "" };
  }
  const before = content.slice(0, beginIdx).replace(/\n*$/, "");
  const block = content.slice(beginIdx, endIdx + END_SENTINEL.length);
  const after = content.slice(endIdx + END_SENTINEL.length).replace(/^\n*/, "");
  return { before, block, after };
}

function gitattributesPath(workspaceRoot: string): string {
  return join(workspaceRoot, GITATTRIBUTES_RELATIVE);
}

// ---------------------------------------------------------------------------
// gitattributes.generate
// ---------------------------------------------------------------------------

export async function runGitattributesGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{ command: "gitattributes.generate"; patternCount: number; written: boolean }>
> {
  const { patterns } = await buildManagedPatterns(context);
  const block = buildManagedBlock(patterns);

  const path = gitattributesPath(context.workspaceRoot);
  let existing = "";
  try {
    existing = await context.io.readFile(path);
  } catch {
    existing = "";
  }
  const { before, after } = splitManagedBlock(existing);
  const next = `${before ? `${before}\n\n` : ""}${block}${after ? `\n\n${after}` : "\n"}`;

  const written = next !== existing;
  if (written && !context.dryRun) {
    await writeFileAtomic(path, next);
  }

  return {
    data: {
      command: "gitattributes.generate",
      patternCount: patterns.length,
      written,
    },
    exitCode: 0,
    summary: written
      ? `gitattributes.generate: wrote ${patterns.length} pattern(s)`
      : `gitattributes.generate: unchanged (${patterns.length} pattern(s))`,
  };
}

// ---------------------------------------------------------------------------
// gitattributes.validate
// ---------------------------------------------------------------------------

export async function runGitattributesValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { patterns } = await buildManagedPatterns(context);
  const expectedBlock = buildManagedBlock(patterns);

  const path = gitattributesPath(context.workspaceRoot);
  let existing = "";
  try {
    existing = await context.io.readFile(path);
  } catch {
    diagnostics.push({
      ruleId: "GITATTR-01",
      severity: "error",
      file: GITATTRIBUTES_RELATIVE,
      message: ".gitattributes is missing.",
      fixHint: "Run: pnpm exec werkstatt run gitattributes.generate",
    });
    return diagnosticsResult("gitattributes.validate", diagnostics);
  }

  const { block: actualBlock } = splitManagedBlock(existing);
  if (actualBlock === null) {
    diagnostics.push({
      ruleId: "GITATTR-01",
      severity: "error",
      file: GITATTRIBUTES_RELATIVE,
      message: "Managed generated-artifacts block is missing.",
      fixHint: "Run: pnpm exec werkstatt run gitattributes.generate",
    });
  } else if (actualBlock !== expectedBlock) {
    const actualLines = new Set(actualBlock.split("\n"));
    const expectedLines = new Set(expectedBlock.split("\n"));
    const sameContentDifferentOrder =
      actualLines.size === expectedLines.size &&
      [...actualLines].every((l) => expectedLines.has(l));
    diagnostics.push({
      ruleId: sameContentDifferentOrder ? "GITATTR-02" : "GITATTR-01",
      severity: sameContentDifferentOrder ? "warning" : "error",
      file: GITATTRIBUTES_RELATIVE,
      message: sameContentDifferentOrder
        ? "Managed generated-artifacts block has the right patterns but is unsorted/non-normalized."
        : "Managed generated-artifacts block is stale vs the live command manifest + ownership map.",
      fixHint: "Run: pnpm exec werkstatt run gitattributes.generate",
    });
  }

  // GITATTR-03: bounded advisory scan for tracked marker-carrying files this
  // pattern set does not cover.
  const patternRegexes = patterns.map(ownPatternToExactRegex);
  const isCovered = (relPath: string): boolean => patternRegexes.some((re) => re.test(relPath));

  const appNames = (await listAppDirectories(context)).sort();
  for (const siteName of appNames) {
    for (const globPattern of APP_SCAN_GLOBS) {
      let matches: string[];
      try {
        // node:fs/promises glob only matches when `cwd` uses forward slashes
        // (backslash-separated Windows paths silently match nothing).
        matches = await context.io.glob(globPattern, {
          cwd: join(context.workspaceRoot, "apps", siteName).replace(/\\/g, "/"),
        });
      } catch {
        continue;
      }
      for (const match of matches) {
        const relPath = `apps/${siteName}/${match.replace(/\\/g, "/")}`;
        if (!isGeneratedMarkerTextCandidate(relPath)) continue;
        if (isCovered(relPath)) continue;
        let content: string;
        try {
          content = await context.io.readFile(join(context.workspaceRoot, relPath));
        } catch {
          continue;
        }
        if (hasGeneratedMarker(content)) {
          diagnostics.push({
            ruleId: "GITATTR-03",
            severity: "warning",
            file: relPath,
            message:
              "File carries GENERATED_MARKER but no managed .gitattributes pattern covers it.",
            fixHint:
              "Register its writer's `writes` glob (RFC-0266) or a GENERATOR_OWNERSHIP_MAP entry (RFC-0087), then rerun gitattributes.generate.",
          });
        }
      }
    }
  }

  return diagnosticsResult("gitattributes.validate", diagnostics);
}

async function listAppDirectories(context: KernelRuntimeContext): Promise<string[]> {
  try {
    const entries = await context.io.readdir(join(context.workspaceRoot, "apps"));
    return entries.filter((e) => e.isDirectory).map((e) => e.name);
  } catch {
    return [];
  }
}
