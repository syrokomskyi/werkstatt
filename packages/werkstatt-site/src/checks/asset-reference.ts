/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141][RFC-0248] asset.reference.validate — verify every content asset token resolves
  through the active filesystem Content Source Provider using the same candidate-generation
  contract as runtime image resolution.

  Syntax violations (paths, leading slashes, file extensions) are fail-hard RFC-0053 contract
  errors. Valid-but-unresolved tokens remain warning-mode debt.
</purpose>
<non-goals>
  <item>Do not call astro:content or import.meta.glob — pure node-side fs resolution.</item>
  <item>Do not fail the build in warning mode.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0248: delegate candidate generation and token syntax checks to @warpgogol/werkstatt-site/content-source.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import {
  describeContentAssetResolution,
  type ContentAssetDomain,
  type ContentAssetResolutionContract,
} from "@warpgogol/werkstatt-site/content-source";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { readDefaultLanguageCode } from "./lib/i18n.ts";
import { diagnosticsResult } from "./result-helpers.ts";

/** Frontmatter keys whose string values are treated as content asset tokens. */
const IMAGE_KEYS = new Set([
  "imageName",
  "backgroundImage",
  "portraitImage",
  "image",
  "brandImage",
  "photo",
  "qr",
  "qrCode",
]);

export interface AssetReferenceFinding {
  file: string;
  token: string;
  lang: string;
  line?: number;
  contract: ContentAssetResolutionContract;
}

/** Recursively collect all .md files under a directory (excludes AGENTS.md). */
async function collectMarkdown(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".md"], ignore: (name) => name === "AGENTS.md" });
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = raw.slice(3, end);
  try {
    const parsed = parseYaml(block);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Walk a parsed object and collect every string value held under an IMAGE_KEYS key. */
function collectTokens(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTokens(item, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (IMAGE_KEYS.has(key) && typeof value === "string" && value.trim() !== "") {
        out.add(value);
      }
      collectTokens(value, out);
    }
  }
}

/** Infer the content language from a content file path (.../<domain>/<lang>/...). */
function langFromPath(appRoot: string, file: string, fallback: string): string {
  const rel = file.slice(appRoot.length).replace(/\\/g, "/");
  const match = rel.match(/\/src\/content\/[^/]+\/([^/]+)\//);
  return match?.[1] ?? fallback;
}

function domainFromPath(appRoot: string, file: string): ContentAssetDomain {
  const rel = file.slice(appRoot.length).replace(/\\/g, "/");
  const match = rel.match(/\/src\/content\/([^/]+)\//);
  const domain = match?.[1];
  return domain === "business" || domain === "site" || domain === "surface" ? domain : "pages";
}

function lineForToken(raw: string, token: string): number | undefined {
  const lines = raw.split(/\r?\n/);
  const quoted = [`"${token}"`, `'${token}'`];
  const index = lines.findIndex((line) => quoted.some((value) => line.includes(value)));
  return index >= 0 ? index + 1 : undefined;
}

function toDiskPath(appRoot: string, relativePath: string): string {
  return join(appRoot, relativePath.replace(/^\/+/, ""));
}

function describeForValidation(
  appRoot: string,
  file: string,
  token: string,
  lang: string,
  defaultLang: string,
): ContentAssetResolutionContract {
  return describeContentAssetResolution(
    {
      raw: token,
      domain: domainFromPath(appRoot, file),
      lang,
      sourceFile: file.slice(appRoot.length + 1).replace(/\\/g, "/"),
    },
    {
      defaultLanguage: defaultLang,
      assetExists: (relativePath) => existsSync(toDiskPath(appRoot, relativePath)),
    },
  );
}

export async function collectAssetReferenceFindings(
  ctx: KernelRuntimeContext,
): Promise<AssetReferenceFinding[]> {
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");

  const defaultLang = await readDefaultLanguageCode(contentRoot);
  const findings: AssetReferenceFinding[] = [];

  // 1) system.md shell layer image tokens (resolved against the default language).
  try {
    const systemFile = join(contentRoot, "system.md");
    const systemRaw = await readFile(systemFile, "utf-8");
    const systemFm = parseFrontmatter(systemRaw);
    const sysTokens = new Set<string>();
    collectTokens(systemFm, sysTokens);
    for (const token of sysTokens) {
      const contract = describeForValidation(appRoot, systemFile, token, defaultLang, defaultLang);
      findings.push({
        file: "src/content/system.md",
        token,
        lang: defaultLang,
        line: lineForToken(systemRaw, token),
        contract,
      });
    }
  } catch {
    // No system.md — nothing to check here.
  }

  // 2) Content markdown image tokens (resolved against the file's language).
  for (const domain of ["pages", "prose", "business", "people", "site", "surface"]) {
    const files = await collectMarkdown(join(contentRoot, domain));
    for (const file of files) {
      const raw = await readFile(file, "utf-8").catch(() => "");
      const fm = parseFrontmatter(raw);
      if (!fm) continue;
      const lang = langFromPath(appRoot, file, defaultLang);
      const fileTokens = new Set<string>();
      collectTokens(fm, fileTokens);
      for (const token of fileTokens) {
        const contract = describeForValidation(appRoot, file, token, lang, defaultLang);
        findings.push({
          file: file.slice(appRoot.length + 1).replace(/\\/g, "/"),
          token,
          lang,
          line: lineForToken(raw, token),
          contract,
        });
      }
    }
  }
  return findings;
}

export function assetReferenceDiagnostics(findings: AssetReferenceFinding[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const finding of findings) {
    for (const syntax of finding.contract.syntaxDiagnostics) {
      diagnostics.push({
        ruleId: "asset.reference.validate",
        severity: "error",
        file: finding.file,
        line: finding.line,
        message: syntax.message,
        fixHint: syntax.fixHint,
        data: { token: finding.token, lang: finding.lang, reason: syntax.reason },
      });
    }
    if (!finding.contract.resolved) {
      diagnostics.push({
        ruleId: "asset.reference.validate",
        severity: "warning",
        file: finding.file,
        line: finding.line,
        message: `Asset token "${finding.token}" did not resolve through the fs provider (lang: ${finding.lang}).`,
        fixHint:
          "Add the referenced asset to the content-local assets folder, or update the authored token to a resolvable bare filename.",
        data: { token: finding.token, lang: finding.lang, mode: "warning" },
      });
    }
  }
  return diagnostics;
}

export async function runAssetReferenceValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "asset.reference.validate" as const;
  const diagnostics = assetReferenceDiagnostics(await collectAssetReferenceFindings(ctx));
  return diagnosticsResult(command, diagnostics);
}
