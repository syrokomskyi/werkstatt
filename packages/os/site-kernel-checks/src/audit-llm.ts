/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0074 audit.llm.run with committed prompt templates, cache lookup, and provider-backed execution.</purpose>
<non-goals>
  <item>Do not embed family-specific rule logic in TypeScript.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import {
  appendAuditCacheEntry,
  buildAuditLlmRuntimeContext,
  buildAuditCacheKey,
  buildAuditResult,
  hashFileOrDefault,
  hashPromptFile,
  loadAuditAppContext,
  loadAuditEnvMap,
  readAuditCache,
  sanitizeAuditPromptText,
} from "./audit/helpers.ts";
import {
  auditLlmKindSchema,
  auditResultSchema,
  type AuditFinding,
  type AuditLlmKind,
} from "./audit/types.ts";
import { parseVoiceProfileFile } from "@gogol/share/content-discipline";
import { pathExists } from "./content-discipline.ts";

const RULE_FILE_BY_KIND: Partial<Record<AuditLlmKind, string>> = {
  cultural: "cultural-rules.yaml",
  linguistic: "linguistic-rules.yaml",
};

const auditLlmResponseSchema = z.object({
  findings: z.array(
    z.object({
      id: z.string(),
      ruleId: z.string(),
      severity: z.enum(["info", "warn", "error"]),
      file: z.string().nullable(),
      blockId: z.string().nullable(),
      line: z.number().int().positive().nullable(),
      message: z.string(),
      evidence: z.array(
        z.object({
          kind: z.enum(["rule", "rendered", "source", "config", "cache", "runtime"]),
          ruleFile: z.string().nullable(),
          ruleId: z.string().nullable(),
          file: z.string().nullable(),
          url: z.string().nullable(),
          snippet: z.string().nullable(),
        }),
      ),
      suggestion: z.string().nullable(),
    }),
  ),
});

function normalizeFindings(
  findings: z.infer<typeof auditLlmResponseSchema>["findings"],
): AuditFinding[] {
  return findings.map((finding) => ({
    id: finding.id,
    ruleId: finding.ruleId,
    // RFC-0203: normalize the legacy LLM "warn" spelling into canonical "warning".
    severity: finding.severity === "warn" ? "warning" : finding.severity,
    file: finding.file ?? undefined,
    blockId: finding.blockId ?? undefined,
    line: finding.line ?? undefined,
    message: finding.message,
    evidence: finding.evidence.map((evidence) => ({
      kind: evidence.kind,
      ruleFile: evidence.ruleFile ?? undefined,
      ruleId: evidence.ruleId ?? undefined,
      file: evidence.file ?? undefined,
      url: evidence.url ?? undefined,
      snippet: evidence.snippet ?? undefined,
    })),
    suggestion: finding.suggestion ?? undefined,
  }));
}

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  const prefix = `--${name}=`;
  const inline = input.args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : undefined;
}

function promptPathForKind(root: string, kind: AuditLlmKind): string {
  return join(root, "src", "audit-llm", "prompts", `${kind}.md`);
}

function promptVersionFromSource(source: string, kind: AuditLlmKind): string {
  const match = source.match(/promptVersion:\s*([\w.@-]+)/i);
  return match?.[1] ?? `${kind}@1.0.0`;
}

async function loadPromptTemplate(
  packageRoot: string,
  kind: AuditLlmKind,
): Promise<{ path: string; source: string; version: string }> {
  const path = promptPathForKind(packageRoot, kind);
  if (!(await pathExists(path))) {
    throw new Error(`Prompt template is missing for audit kind ${kind}. Expected ${path}.`);
  }
  const source = await readFile(path, "utf8");
  const version = promptVersionFromSource(source, kind);
  return { path, source, version };
}

function buildClient(runtime: ReturnType<typeof buildAuditLlmRuntimeContext>) {
  return runtime.provider === "anthropic"
    ? createAnthropic({ apiKey: runtime.apiKey })(runtime.model)
    : createOpenAI({ apiKey: runtime.apiKey })(runtime.model);
}

export async function runAuditLlm(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const kind = auditLlmKindSchema.parse(readFlag(input, "kind") ?? input.flags["kind"]);
  const audit = await loadAuditAppContext(context);
  const packageRoot = join(context.workspaceRoot, "packages", "os", "site-kernel-checks");
  const archetypeId = readFlag(input, "archetype");

  if (kind === "archetype-lens" && !archetypeId) {
    const result = buildAuditResult({
      command: "audit.llm.run",
      kind,
      app: audit.siteName,
      findings: [
        {
          id: "f-missing-archetype",
          ruleId: "audit-llm.missing-archetype",
          severity: "error",
          message: "audit.llm.run --kind=archetype-lens requires --archetype.",
          evidence: [{ kind: "runtime", snippet: "--kind=archetype-lens --archetype=<id>" }],
        },
      ],
      runtimeMs: Date.now() - started,
    });
    return { data: result, exitCode: 1, summary: `audit.llm.run (${kind}): missing archetype` };
  }

  let prompt: Awaited<ReturnType<typeof loadPromptTemplate>>;
  try {
    prompt = await loadPromptTemplate(packageRoot, kind);
  } catch (error) {
    const result = buildAuditResult({
      command: "audit.llm.run",
      kind,
      app: audit.siteName,
      findings: [
        {
          id: "f-missing-prompt",
          ruleId: "audit-llm.missing-prompt-template",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
          evidence: [{ kind: "runtime", snippet: promptPathForKind(packageRoot, kind) }],
        },
      ],
      runtimeMs: Date.now() - started,
      pending: true,
    });
    return {
      data: result,
      exitCode: 1,
      summary: `audit.llm.run (${kind}): missing prompt template`,
    };
  }

  const atomsHash = await hashFileOrDefault(
    join(audit.onboardingAuthorDirectory, "atoms.yaml"),
    "sha256:no-atoms",
  );
  const envMap = await loadAuditEnvMap(context.workspaceRoot);
  const llmRuntime = buildAuditLlmRuntimeContext(envMap, {
    provider: readFlag(input, "provider"),
    model: readFlag(input, "model"),
  });
  const cachePath = join(audit.onboardingAuditDirectory, "llm-cache.jsonl");
  const promptHash = await hashPromptFile(prompt.path);

  const rulesFile = RULE_FILE_BY_KIND[kind];
  const rulesPath = rulesFile
    ? join(audit.familyDirectory, rulesFile)
    : join(audit.familyDirectory, "family.yaml");
  if (rulesFile && !(await pathExists(rulesPath))) {
    const result = buildAuditResult({
      command: "audit.llm.run",
      kind,
      app: audit.siteName,
      findings: [
        {
          id: "f-missing-rules",
          ruleId: "audit-llm.missing-rule-file",
          severity: "error",
          file: rulesPath,
          message: `Required rule file is missing for ${kind} audit.`,
          evidence: [{ kind: "rule", ruleFile: rulesPath }],
        },
      ],
      runtimeMs: Date.now() - started,
    });
    return { data: result, exitCode: 1, summary: `audit.llm.run (${kind}): missing rule file` };
  }

  const rulesHash = await hashFileOrDefault(rulesPath, "sha256:no-rules");
  const cacheKey = buildAuditCacheKey({
    kind,
    atomsHash,
    biomeId: audit.biomeId,
    familyId: audit.familyId,
    rulesHash,
    promptHash,
    modelVersion: llmRuntime.model,
    promptVersion: prompt.version,
    archetypeId,
  });

  const cacheEntries = await readAuditCache(cachePath);
  const cached = cacheEntries.find((entry) => entry.key === cacheKey);
  if (cached) {
    const result = auditResultSchema.parse({
      ...cached.result,
      cacheStats: { hits: 1, misses: 0 },
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: result.status === "fail" || result.status === "pending" ? 1 : 0,
      summary: `audit.llm.run (${kind}): cache hit`,
    };
  }

  if (!llmRuntime.apiKey) {
    const result = buildAuditResult({
      command: "audit.llm.run",
      kind,
      app: audit.siteName,
      findings: [
        {
          id: "f-provider-missing",
          ruleId: "audit-llm.provider-not-configured",
          severity: "error",
          message:
            "LLM API key is missing. Set LLM_API_KEY or OPENAI_API_KEY in process.env or .env.",
          evidence: [{ kind: "runtime", snippet: "LLM_API_KEY|OPENAI_API_KEY" }],
        },
      ],
      runtimeMs: Date.now() - started,
      pending: true,
    });
    return {
      data: result,
      exitCode: 1,
      summary: `audit.llm.run (${kind}): provider not configured`,
    };
  }

  const voiceProfilePath = join(audit.onboardingAuthorDirectory, "voice-profile.yaml");
  if (kind === "linguistic" && !(await pathExists(voiceProfilePath))) {
    const result = buildAuditResult({
      command: "audit.llm.run",
      kind,
      app: audit.siteName,
      findings: [
        {
          id: "f-missing-voice-profile",
          ruleId: "audit-llm.missing-voice-profile",
          severity: "error",
          file: voiceProfilePath,
          message: "Linguistic audit requires onboarding/.output/04-author/voice-profile.yaml.",
          evidence: [{ kind: "config", file: voiceProfilePath }],
        },
      ],
      runtimeMs: Date.now() - started,
    });
    return { data: result, exitCode: 1, summary: `audit.llm.run (${kind}): missing voice profile` };
  }
  const voiceProfile = (await pathExists(voiceProfilePath))
    ? parseVoiceProfileFile(await readFile(voiceProfilePath, "utf8"))
    : null;
  const familyRules = (await pathExists(rulesPath)) ? await readFile(rulesPath, "utf8") : "";
  const llmsFullPath = join(audit.publicDirectory, "llms-full.txt");
  const llmsFull = (await pathExists(llmsFullPath)) ? await readFile(llmsFullPath, "utf8") : "";
  const inputPayload = {
    app: audit.siteName,
    familyId: audit.familyId,
    biomeId: audit.biomeId,
    archetypeId: archetypeId ?? null,
    rulesFile: rulesPath,
    rules: sanitizeAuditPromptText(familyRules),
    voiceProfileFile: voiceProfilePath,
    voiceProfile,
    renderedMachineReadableContent: sanitizeAuditPromptText(llmsFull),
  };

  let findings: AuditFinding[] | null = null;
  try {
    const model = buildClient(llmRuntime);
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await generateObject({
          model,
          schema: auditLlmResponseSchema,
          system:
            attempt === 0
              ? prompt.source
              : `${prompt.source}\n\nThe previous response was invalid against the required JSON schema. Return only valid JSON matching the schema exactly.`,
          messages: [{ role: "user", content: JSON.stringify(inputPayload) }],
          temperature: llmRuntime.temperature,
          maxOutputTokens: llmRuntime.maxOutputTokens,
        });
        findings = normalizeFindings(response.object.findings);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!findings) {
      throw lastError;
    }
  } catch (error) {
    const result = buildAuditResult({
      command: "audit.llm.run",
      kind,
      app: audit.siteName,
      findings: [
        {
          id: "f-provider-failed",
          ruleId: "audit-llm.provider-failure",
          severity: "error",
          message: (error as Error).message,
          evidence: [{ kind: "runtime", snippet: `${llmRuntime.provider}:${llmRuntime.model}` }],
        },
      ],
      runtimeMs: Date.now() - started,
      pending: true,
    });
    return { data: result, exitCode: 1, summary: `audit.llm.run (${kind}): provider failure` };
  }

  const result = buildAuditResult({
    command: "audit.llm.run",
    kind,
    app: audit.siteName,
    findings: findings ?? [],
    runtimeMs: Date.now() - started,
    cacheStats: { hits: 0, misses: 1 },
  });
  const cacheEntry = {
    key: cacheKey,
    kind,
    biomeId: audit.biomeId,
    familyId: audit.familyId,
    atomsHash,
    rulesHash,
    promptHash,
    modelVersion: llmRuntime.model,
    promptVersion: prompt.version,
    archetypeId,
    result,
    createdAt: new Date().toISOString(),
  };
  await mkdir(audit.onboardingAuditDirectory, { recursive: true });
  await appendAuditCacheEntry(cachePath, cacheEntry);

  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `audit.llm.run (${kind}): ${result.status}`,
  };
}
