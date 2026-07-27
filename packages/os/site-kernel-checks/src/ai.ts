/*
<MODULE_CONTRACT>
<purpose>
  RFC-0051 ai.txt generation and validation commands.
  ai.generate reads the ai: block from system.md, calls buildAiTxt, writes public/ai.txt.
  ai.validate checks existence, non-emptiness, and structural markers.
</purpose>
<non-goals>
  <item>Do not read content through Astro runtime or astro:content.</item>
  <item>Do not duplicate formatting logic — delegate to @warpgogol/share/semantic buildAiTxt.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0051: Initial implementation.</item>
  <item>RFC-0267: ai.generate routed through context.io (WorkspaceIO port) — pilot migration.</item>
  <item>RFC-0313: ai.generate now emits the studio default open-for-training policy when system.md omits ai:.</item>
</CHANGE_SUMMARY>
*/

import { join, dirname } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { buildAiTxt } from "@warpgogol/share/semantic";
import type { AiPolicy } from "@warpgogol/share/semantic";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { diagnosticsResult } from "./result-helpers.ts";

// RFC-0375: ai.txt is a Category B (registry-only) file.
// No GENERATED_MARKER is emitted in the output.
const DEFAULT_AI_UPDATED = "2026-07-06";

// ---------------------------------------------------------------------------
// ai.generate
// ---------------------------------------------------------------------------

export async function runAiGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.appDirectory, "src", "content");

  const { manifest } = await loadSystemManifest(contentDir);

  const aiRaw = (manifest as unknown as Record<string, unknown>).ai as
    Record<string, unknown> | undefined;

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";

  const defaultPolicy: AiPolicy = {
    version: "1.0",
    updated: DEFAULT_AI_UPDATED,
    policy: "allow",
    training: "allow",
    usage: ["inference", "indexing", "snippet-generation", "summarization", "translation"],
    commercial: "yes",
    attribution: "optional",
    license: "Site content remains under its published rights and credits.",
    contact: "mailto:hi@warpgogol.com",
  };
  const policy = {
    ...defaultPolicy,
    ...(aiRaw as unknown as AiPolicy | undefined),
  } as AiPolicy;
  const body = buildAiTxt(policy, siteUrl);
  const fullOutput = body;

  const aiPath = join(paths.publicDirectory, "ai.txt");

  // RFC-0267: routed through context.io — see robots.generate for the same pattern.
  // RFC-0375: ai.txt is Category B — no marker check, always overwrite.
  await context.io.mkdir(dirname(aiPath));
  await context.io.writeFile(aiPath, fullOutput);

  return {
    data: {
      command: "ai.generate",
      status: "pass",
      site: context.site?.name,
      file: aiPath,
      byteCount: body.length,
      providers: (policy.providers ?? []).map((p) => p.name),
    },
    exitCode: 0,
    summary: context.dryRun
      ? `ai.generate: dry-run — ${body.length} bytes (would write ai.txt)`
      : `ai.generate: ${body.length} bytes → ai.txt${policy.providers?.length ? ` (${policy.providers.length} provider overrides)` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// ai.validate
// ---------------------------------------------------------------------------

const KNOWN_PROVIDERS = new Set([
  "OpenAI",
  "Anthropic",
  "Google",
  "Meta",
  "Microsoft",
  "Amazon",
  "Cohere",
  "Mistral",
  "Stability AI",
  "Midjourney",
  "Perplexity",
  "xAI",
  "Grok",
  "DeepSeek",
  "Hugging Face",
  "IBM",
  "Apple",
  "Adobe",
  "Runway",
  "ElevenLabs",
  "Synthesia",
  "Notion AI",
  "Grammarly",
  "Jasper",
  "Writer",
]);

export async function runAiValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const aiPath = join(paths.publicDirectory, "ai.txt");

  const violations: string[] = [];
  const warnings: string[] = [];
  let content: string | undefined;

  try {
    content = await readFile(aiPath, "utf-8");
  } catch {
    violations.push(`ai.txt not found at ${aiPath}. Run ai.generate first.`);
  }

  if (content !== undefined) {
    if (content.length === 0) {
      violations.push("ai.txt is empty.");
    }

    if (!content.includes("policy:")) {
      violations.push("ai.txt does not contain a global `policy:` directive.");
    }

    const providerSectionRegex = /^\[(.+)\]/gm;
    let match: RegExpExecArray | null;
    while ((match = providerSectionRegex.exec(content)) !== null) {
      const providerName = match[1];
      if (!KNOWN_PROVIDERS.has(providerName)) {
        warnings.push(`Provider '${providerName}' is not in the known provider allowlist.`);
      }
    }

    if (content.length < 50) {
      warnings.push(`ai.txt is only ${content.length} bytes — expected at least 50.`);
    }
  }

  const diagnostics: Diagnostic[] = [
    ...violations.map((message) => ({
      ruleId: "ai.validate",
      severity: "error" as const,
      file: "public/ai.txt",
      message,
      fixHint: "Run ai.generate and ensure the ai.txt policy contains the required directives.",
    })),
    ...warnings.map((message) => ({
      ruleId: "ai.validate",
      severity: "warning" as const,
      file: "public/ai.txt",
      message,
      fixHint: "Review public/ai.txt and update the source ai policy if the warning is actionable.",
    })),
  ];

  return diagnosticsResult("ai.validate", diagnostics);
}
