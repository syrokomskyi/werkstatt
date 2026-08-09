/*
<MODULE_CONTRACT>
<purpose>Shared RFC-0074 helper surface for audit commands, report rendering, cache handling, and family/app context loading.</purpose>
<non-goals>
  <item>Do not implement specific validator policies.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0074: Add shared audit helpers.</item>
  <item>RFC-0328: Derive isLegal from semanticType and read sitemap category from output.sitemap.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import { parse as yamlParse } from "yaml";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { localizeUrl } from "@warpgogol/werkstatt-site/share/url-policy";
import { defaultLanguageFromManifest } from "../lib/i18n.ts";
import type { KernelRuntimeContext } from "@warpgogol/site-kernel";
import {
  auditLlmCacheEntrySchema,
  auditResultSchema,
  type AuditFinding,
  type AuditLlmCacheEntry,
  type AuditLlmKind,
  type AuditResult,
  type AuditSeverity,
} from "./types.ts";
import { getContentDisciplinePaths, pathExists } from "../content-discipline.ts";

interface FamilyYaml {
  recipe?: {
    auditThresholds?: Record<string, string>;
    agentReadinessBaseline?: {
      maxBytesToCta?: number;
      requireStructuredData?: string[];
    };
  };
  auditThresholds?: Record<string, string>;
  agentReadinessBaseline?: {
    maxBytesToCta?: number;
    requireStructuredData?: string[];
  };
}

export interface AuditAppContext {
  siteName: string;
  appDirectory: string;
  contentDirectory: string;
  publicDirectory: string;
  distDirectory: string;
  onboardingAuditDirectory: string;
  onboardingAuthorDirectory: string;
  onboardingComposeDirectory: string;
  onboardingScaffoldDirectory: string;
  biomeId: string;
  familyId: string;
  auditThresholds: Record<string, string>;
  agentReadinessBaseline: {
    maxBytesToCta: number;
    requireStructuredData: string[];
  };
  systemManifest: Record<string, unknown>;
  familyYamlPath: string;
  familyDirectory: string;
}

export interface AuditLlmRuntimeContext {
  provider: "openai" | "anthropic";
  model: string;
  apiKey: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface AuditPageInfo {
  pageId: string;
  semanticType: string;
  sitemapCategory: string;
  isLegal: boolean;
  isUtility: boolean;
  expectsTransactionalCta: boolean;
  requiresJsonLd: boolean;
  /** Page-scoped JSON-LD type requirements declared in system.md pages[].structuredData. */
  structuredData: string[];
}

export function summarizeAuditFindings(findings: AuditFinding[]): Record<AuditSeverity, number> {
  return {
    error: findings.filter((finding) => finding.severity === "error").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
}

export function buildAuditResult(params: {
  command: string;
  app: string;
  findings: AuditFinding[];
  runtimeMs: number;
  kind?: string;
  cacheStats?: { hits: number; misses: number };
  pending?: boolean;
}): AuditResult {
  const summary = summarizeAuditFindings(params.findings);
  const status = params.pending
    ? "pending"
    : summary.error > 0
      ? "fail"
      : summary.warning > 0
        ? "warn"
        : "ok";
  return auditResultSchema.parse({
    command: params.command,
    kind: params.kind,
    app: params.app,
    status,
    findings: params.findings,
    summary,
    cacheStats: params.cacheStats,
    runtimeMs: params.runtimeMs,
  });
}

export async function loadAuditAppContext(context: KernelRuntimeContext): Promise<AuditAppContext> {
  if (!context.site) {
    throw new Error("Audit commands require an app-scoped runtime context.");
  }
  const paths = getContentDisciplinePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const systemManifest = manifest as unknown as Record<string, unknown>;
  const identity = (systemManifest.identity ?? {}) as Record<string, unknown>;
  const biomeId = String(identity.biome ?? "");
  if (!biomeId) {
    throw new Error("system.md identity.biome is required for RFC-0074 audit commands.");
  }

  const biomePath = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "biomes",
    `${biomeId}.yaml`,
  );
  const biomeYaml = yamlParse(await readFile(biomePath, "utf8")) as { family?: string };
  const familyId = String(biomeYaml.family ?? "");
  if (!familyId) {
    throw new Error(`Biome ${biomeId} does not declare a family.`);
  }

  const familyDirectory = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "site-families",
    familyId,
  );
  const familyYamlPath = join(familyDirectory, "family.yaml");
  const familyYaml = yamlParse(await readFile(familyYamlPath, "utf8")) as FamilyYaml;
  const thresholdSource = familyYaml.recipe?.auditThresholds ?? familyYaml.auditThresholds ?? {};
  const readinessSource =
    familyYaml.recipe?.agentReadinessBaseline ?? familyYaml.agentReadinessBaseline ?? {};

  return {
    siteName: context.site.name,
    appDirectory: context.site.directory,
    contentDirectory: paths.contentDirectory,
    publicDirectory: join(context.site.directory, "public"),
    distDirectory: join(context.site.directory, "dist"),
    onboardingAuditDirectory: join(context.workspaceRoot, "onboarding", ".output", "05-audit"),
    onboardingAuthorDirectory: paths.onboardingAuthorDirectory,
    onboardingComposeDirectory: join(context.workspaceRoot, "onboarding", ".output", "03-compose"),
    onboardingScaffoldDirectory: join(
      context.workspaceRoot,
      "onboarding",
      ".output",
      "02-scaffold",
    ),
    biomeId,
    familyId,
    auditThresholds: thresholdSource,
    agentReadinessBaseline: {
      maxBytesToCta: readinessSource.maxBytesToCta ?? 4096,
      requireStructuredData: readinessSource.requireStructuredData ?? [],
    },
    systemManifest,
    familyYamlPath,
    familyDirectory,
  };
}

export async function loadAuditEnvMap(workspaceRoot: string): Promise<Record<string, string>> {
  const envMap: Record<string, string> = {
    ...(process.env as Record<string, string | undefined>),
  } as Record<string, string>;
  try {
    const envContent = await readFile(resolve(workspaceRoot, ".env"), "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        envMap[match[1]!] = match[2] || "";
      }
    }
  } catch {
    // .env is optional
  }
  return envMap;
}

export function buildAuditLlmRuntimeContext(
  envMap: Record<string, string>,
  options?: { provider?: string; model?: string },
): AuditLlmRuntimeContext {
  const rawProvider = options?.provider ?? envMap["LLM_PROVIDER"] ?? "openai";
  return {
    provider: rawProvider === "anthropic" ? "anthropic" : "openai",
    model: options?.model ?? envMap["LLM_MODEL"] ?? "gpt-4o",
    apiKey: envMap["LLM_API_KEY"] ?? envMap["OPENAI_API_KEY"] ?? "",
    temperature: 0,
    maxOutputTokens: 2000,
  };
}

export function buildAuditCacheKey(params: {
  kind: AuditLlmKind;
  atomsHash: string;
  biomeId: string;
  familyId: string;
  rulesHash: string;
  promptHash: string;
  modelVersion: string;
  promptVersion: string;
  archetypeId?: string;
}): string {
  return byteHash(
    [
      params.kind,
      params.atomsHash,
      params.biomeId,
      params.familyId,
      params.rulesHash,
      params.promptHash,
      params.modelVersion,
      params.promptVersion,
      params.archetypeId ?? "",
    ].join("::"),
  );
}

export async function readAuditCache(cachePath: string): Promise<AuditLlmCacheEntry[]> {
  if (!(await pathExists(cachePath))) {
    return [];
  }
  const lines = (await readFile(cachePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => auditLlmCacheEntrySchema.parse(yamlParse(line)));
}

export async function appendAuditCacheEntry(
  cachePath: string,
  entry: AuditLlmCacheEntry,
): Promise<void> {
  const cacheDir = dirname(cachePath);
  await mkdir(cacheDir, { recursive: true }).catch(() => undefined);
  const existing = await readAuditCache(cachePath);
  const deduped = [...existing.filter((item) => item.key !== entry.key), entry];
  const content = deduped.map((item) => JSON.stringify(item)).join("\n") + "\n";
  const tmpPath = `${cachePath}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, cachePath);
}

export async function hashFileOrDefault(filePath: string, fallback = "missing"): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    return byteHash(content);
  } catch {
    return fallback;
  }
}

export async function hashPromptFile(promptPath: string): Promise<string> {
  try {
    return byteHash(await readFile(promptPath, "utf8")).slice(("sha" + "256:").length);
  } catch {
    return "no-prompt";
  }
}

export function sanitizeAuditPromptText(text: string): string {
  return text
    .replace(/---.*?---/gs, "")
    .replace(/\[SYSTEM\]|\[ASSISTANT\]|\[USER\]/gi, "")
    .replace(/ignore (previous|all) instructions?/gi, "")
    .replace(/<\|im_start\|>|<\|im_end\|>/g, "")
    .replace(/system:\s*/gi, "")
    .replace(/assistant:\s*/gi, "")
    .trim()
    .slice(0, 12000);
}

export function normalizeAuditPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.endsWith("/index.html")) {
    return normalized.slice(0, -"/index.html".length) || "/";
  }
  if (normalized.endsWith(".html")) {
    return normalized.slice(0, -".html".length);
  }
  return normalized;
}

export function getAuditPageInfo(
  systemManifest: Record<string, unknown>,
  routePath: string,
): AuditPageInfo | null {
  const pages = Array.isArray(systemManifest.pages)
    ? (systemManifest.pages as Array<Record<string, unknown>>)
    : [];
  const cleanRoute = normalizeAuditPath(routePath).replace(/^\/+(dist\/)?/, "/");
  // RFC-0160: the default language is served unprefixed.
  const defaultLanguage = defaultLanguageFromManifest(systemManifest);
  for (const page of pages) {
    const routes = (page.routes ?? {}) as Record<string, unknown>;
    for (const [lang, slug] of Object.entries(routes)) {
      const localized = localizeUrl(lang, String(slug), { defaultLanguage });
      const expected = normalizeAuditPath(`${localized.replace(/\/$/, "")}/index.html`);
      if (expected === cleanRoute) {
        const semanticType = String(page.semanticType ?? "content");
        const pageOutput = (page.output ?? {}) as Record<string, unknown>;
        const sitemapCategory = String(
          typeof pageOutput.sitemap === "object" && pageOutput.sitemap !== null
            ? ((pageOutput.sitemap as Record<string, unknown>).category ?? "content")
            : "content",
        );
        const pageId = String(page.pageId ?? "");
        const structuredData = Array.isArray(page.structuredData)
          ? (page.structuredData as unknown[]).map((t) => String(t))
          : [];
        const isLegal = semanticType === "legal";
        const isUtility =
          pageId.startsWith("cosmic") || semanticType === "openSource" || pageId === "faq";
        return {
          pageId,
          semanticType,
          sitemapCategory,
          isLegal,
          isUtility,
          expectsTransactionalCta:
            semanticType === "home" ||
            semanticType === "donationContact" ||
            pageId === "home" ||
            pageId === "donateContact",
          requiresJsonLd: !pageId.startsWith("cosmic"),
          structuredData,
        };
      }
    }
  }
  return null;
}

export function renderAuditReportMarkdown(results: AuditResult[]): string {
  const lines: string[] = ["# Audit Report", ""];
  for (const result of results) {
    lines.push(`## ${result.command}${result.kind ? ` (${result.kind})` : ""}`);
    lines.push(`- Status: **${result.status}**`);
    lines.push(
      `- Summary: error=${result.summary.error}, warning=${result.summary.warning}, info=${result.summary.info}`,
    );
    if (result.cacheStats) {
      lines.push(`- Cache: hits=${result.cacheStats.hits}, misses=${result.cacheStats.misses}`);
    }
    lines.push("");
    if (result.findings.length === 0) {
      lines.push("No findings.", "");
      continue;
    }
    for (const finding of result.findings) {
      lines.push(
        `- [${finding.severity}] ${finding.ruleId}: ${finding.message}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
