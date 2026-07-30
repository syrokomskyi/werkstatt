/*
<MODULE_CONTRACT>
<purpose>
RFC-0287: the Agent Surface knowledge tier. agent.knowledge.generate projects
the business layer (through the same RFC-0148 projectors that feed llms-full.txt
and JSON-LD) into one static JSON envelope per public business domain under
public/api/agent/v1/. agent.knowledge.validate enforces envelope validity,
the privacy boundary (no-leak), generator↔artifact parity, and freshness
advisories (AGK-01..05).
</purpose>
<non-goals>
  <item>Do not invent fact shapes — every domain slices SemanticOrganization /
        projectWeb / FAQ entries, the same models llms.generate and JSON-LD use.</item>
  <item>Do not populate "service" or "trust" in v1 — no stable, general
        cross-app projector exists yet for either (documented scope decision).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0287: initial knowledge tier generator + validator.</item>
  <item>RFC-0602: accept null lastVerified in AGK-08 freshness validation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { isAgentKnowledgeDomain, type AgentKnowledgeEnvelope } from "@warpgogol/share/agent";
import { BUSINESS_DOMAIN_VISIBILITY } from "@warpgogol/share/semantic";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { computeKnowledgeEnvelopes } from "./agent-knowledge-compute.ts";
import { readAstroSiteUrl } from "../lib/astro-site-url.ts";
import { collectTextValues } from "../lib/leak-scan.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const KNOWLEDGE_DIR = "public/api/agent/v1";

// ---------------------------------------------------------------------------
// agent.knowledge.generate
// ---------------------------------------------------------------------------

export async function runAgentKnowledgeGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const agentBlock = (manifest as unknown as Record<string, unknown>).agent as
    { enabled?: boolean; knowledgeDisabled?: string[] } | undefined;
  const enabled = agentBlock?.enabled !== false;
  const disabled = new Set(agentBlock?.knowledgeDisabled ?? []);

  const knowledgeDir = join(paths.appDirectory, KNOWLEDGE_DIR);

  if (!enabled) {
    if (await context.io.exists(knowledgeDir))
      await context.io.rm(knowledgeDir, { recursive: true });
    return {
      data: { command: "agent.knowledge.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.knowledge.generate: skipped — agent.enabled is false",
    };
  }

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const { envelopes } = await computeKnowledgeEnvelopes(paths, siteUrl);

  await context.io.rm(knowledgeDir, { recursive: true }).catch(() => undefined);
  await context.io.mkdir(knowledgeDir);

  const written: string[] = [];
  for (const envelope of envelopes) {
    const domain = envelope.schema.split("/")[1]?.split("@")[0] ?? "";
    if (disabled.has(domain)) continue;
    const filePath = join(knowledgeDir, `${domain}.json`);
    await context.io.writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`);
    written.push(domain);
  }

  return {
    data: {
      command: "agent.knowledge.generate",
      status: "pass",
      site: context.site?.name,
      domains: written,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `agent.knowledge.generate: dry-run — ${written.length} domain(s)`
      : `agent.knowledge.generate: ${written.length} domain(s) → ${KNOWLEDGE_DIR}/`,
  };
}

// ---------------------------------------------------------------------------
// agent.knowledge.validate
// ---------------------------------------------------------------------------

export async function runAgentKnowledgeValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const agentBlock = (manifest as unknown as Record<string, unknown>).agent as
    { enabled?: boolean; knowledgeDisabled?: string[] } | undefined;
  const enabled = agentBlock?.enabled !== false;
  const disabled = new Set(agentBlock?.knowledgeDisabled ?? []);
  const knowledgeDir = join(paths.appDirectory, KNOWLEDGE_DIR);
  const diagnostics: Diagnostic[] = [];

  if (!enabled) {
    if (await context.io.exists(knowledgeDir)) {
      diagnostics.push({
        ruleId: "AGK-03",
        severity: "error",
        file: KNOWLEDGE_DIR,
        message: "agent.enabled is false but knowledge files still exist on disk.",
        fixHint: "Rerun agent.knowledge.generate to remove stale artifacts.",
      });
    }
    return diagnosticsResult("agent.knowledge.validate", diagnostics);
  }

  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const { envelopes: expected } = await computeKnowledgeEnvelopes(paths, siteUrl);
  const expectedDomains = new Map(
    expected
      .filter((e) => {
        const domain = e.schema.split("/")[1]?.split("@")[0] ?? "";
        return !disabled.has(domain);
      })
      .map((e) => [e.schema.split("/")[1]!.split("@")[0]!, e]),
  );

  const dirExists = await context.io.exists(knowledgeDir);
  const onDiskDomains = new Set<string>();
  if (dirExists) {
    const entries = await context.io.readdir(knowledgeDir);
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
      onDiskDomains.add(entry.name.replace(/\.json$/, ""));
    }
  }

  // AGK-03: generator drift — expected vs on-disk domain sets must match.
  for (const domain of expectedDomains.keys()) {
    if (!onDiskDomains.has(domain)) {
      diagnostics.push({
        ruleId: "AGK-03",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `Populated domain "${domain}" has no generated knowledge file.`,
        fixHint: "Rerun agent.knowledge.generate.",
      });
    }
  }
  for (const domain of onDiskDomains) {
    if (!expectedDomains.has(domain) && !isAgentKnowledgeDomain(domain)) {
      diagnostics.push({
        ruleId: "AGK-03",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `"${domain}" is not a known Agent Knowledge domain.`,
        fixHint: "Remove the file or rerun agent.knowledge.generate.",
      });
    } else if (!expectedDomains.has(domain)) {
      diagnostics.push({
        ruleId: "AGK-03",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `Domain "${domain}" file exists but the domain is empty or disabled.`,
        fixHint: "Rerun agent.knowledge.generate, or remove the stale file.",
      });
    }
  }

  // AGK-01 (privacy boundary) + AGK-02 (envelope validity) + AGK-04 (parity).
  // A value counts as a leak only if it comes EXCLUSIVELY from a `none` domain —
  // the same value legitimately authored in a public domain (e.g. a shared
  // contact email) must not false-positive.
  const noneValuesRaw: string[] = [];
  const publicValues = new Set<string>();
  {
    const dir = join(paths.contentDirectory, "business-profile");
    for (const [domain, visibility] of Object.entries(BUSINESS_DOMAIN_VISIBILITY)) {
      if (visibility !== "public" && visibility !== "none") continue;
      const stem = domain === "externalServices" ? "external-services" : domain;
      for (const lang of expected[0]?.languages.supported ?? []) {
        try {
          const parsed = parseMarkdownFrontmatter(
            await readFile(join(dir, lang, `${stem}.md`), "utf-8"),
          );
          const collected: string[] = [];
          collectTextValues(parsed.data, collected);
          if (visibility === "none") noneValuesRaw.push(...collected);
          else for (const v of collected) publicValues.add(v);
        } catch {
          // absent — fine (also covers collection-shaped domains like people/faq,
          // which are never `none` and so never contribute to noneValuesRaw)
        }
      }
    }
  }
  const noneValues = noneValuesRaw.filter((v) => !publicValues.has(v));

  for (const domain of onDiskDomains) {
    if (!expectedDomains.has(domain)) continue;
    const filePath = join(knowledgeDir, `${domain}.json`);
    let onDisk: AgentKnowledgeEnvelope;
    try {
      onDisk = JSON.parse(await context.io.readFile(filePath)) as AgentKnowledgeEnvelope;
    } catch {
      diagnostics.push({
        ruleId: "AGK-02",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: "Knowledge file is not valid JSON.",
        fixHint: "Rerun agent.knowledge.generate.",
      });
      continue;
    }
    if (!onDisk.schema?.startsWith(`gogol.agent.knowledge/${domain}@`)) {
      diagnostics.push({
        ruleId: "AGK-02",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `Envelope schema tag "${onDisk.schema}" does not match domain "${domain}".`,
        fixHint: "Rerun agent.knowledge.generate.",
      });
    }
    if (typeof onDisk.contentHash !== "string" || onDisk.contentHash.length !== 64) {
      diagnostics.push({
        ruleId: "AGK-02",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: "Envelope is missing a valid contentHash.",
        fixHint: "Rerun agent.knowledge.generate.",
      });
    }

    const raw = JSON.stringify(onDisk);
    for (const value of noneValues) {
      if (raw.includes(value)) {
        diagnostics.push({
          ruleId: "AGK-01",
          severity: "error",
          file: `${KNOWLEDGE_DIR}/${domain}.json`,
          message: `Leaks a non-public business value: "${value.slice(0, 60)}".`,
          fixHint:
            "Remove the value from the domain projector input — non-public domains never reach agent outputs.",
        });
      }
    }

    const expectedEnvelope = expectedDomains.get(domain)!;
    if (JSON.stringify(onDisk.data) !== JSON.stringify(expectedEnvelope.data)) {
      diagnostics.push({
        ruleId: "AGK-04",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: "Knowledge file data has drifted from what the projectors currently produce.",
        fixHint: "Rerun agent.knowledge.generate; never hand-edit generated knowledge files.",
      });
    }
    if (!onDisk.freshness && expectedEnvelope.freshness) {
      diagnostics.push({
        ruleId: "AGK-05",
        severity: "warning",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message:
          "Freshness ledger covers this domain but the file was generated before it applied.",
        fixHint: "Rerun agent.knowledge.generate.",
      });
    }

    // RFC-0319: AGK-06 — empty string value found anywhere in public payload.
    const findEmptyStrings = (obj: unknown, path = ""): string[] => {
      const hits: string[] = [];
      if (typeof obj === "string" && obj.trim() === "") {
        hits.push(path || "(root)");
      } else if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          hits.push(...findEmptyStrings(obj[i], `${path}/${i}`));
        }
      } else if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          hits.push(...findEmptyStrings(v, `${path}/${k}`));
        }
      }
      return hits;
    };
    const emptyPaths = findEmptyStrings(onDisk.data);
    for (const p of emptyPaths) {
      diagnostics.push({
        ruleId: "AGK-06",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `Empty string value found at data.${p}.`,
        fixHint: "Omit empty fields — do not serialize empty strings in public knowledge.",
      });
    }

    // RFC-0319: AGK-07 — empty skeleton object/array at a path not explicitly allowed.
    const findEmptyContainers = (obj: unknown, path = ""): string[] => {
      const hits: string[] = [];
      if (Array.isArray(obj)) {
        if (obj.length === 0) hits.push(`${path} (empty array)`);
        for (let i = 0; i < obj.length; i++) {
          hits.push(...findEmptyContainers(obj[i], `${path}/${i}`));
        }
      } else if (obj && typeof obj === "object") {
        const keys = Object.keys(obj);
        if (keys.length === 0) hits.push(`${path} (empty object)`);
        for (const [k, v] of Object.entries(obj)) {
          hits.push(...findEmptyContainers(v, `${path}/${k}`));
        }
      }
      return hits;
    };
    const emptyContainerPaths = findEmptyContainers(onDisk.data);
    for (const p of emptyContainerPaths) {
      diagnostics.push({
        ruleId: "AGK-07",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `Empty skeleton object/array at data.${p}.`,
        fixHint: "Omit empty containers unless the schema explicitly allows them.",
      });
    }

    // RFC-0319: AGK-08 — required freshness missing or not source-backed.
    if (!onDisk.freshness) {
      diagnostics.push({
        ruleId: "AGK-08",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: "Required freshness metadata is missing.",
        fixHint:
          "Provide a source-backed lastVerified date via CKL ledger or authored verification.",
      });
    } else {
      const fv = onDisk.freshness;
      if (fv.lastVerified !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fv.lastVerified)) {
        diagnostics.push({
          ruleId: "AGK-08",
          severity: "error",
          file: `${KNOWLEDGE_DIR}/${domain}.json`,
          message: `freshness.lastVerified is not a valid YYYY-MM-DD date: ${fv.lastVerified}`,
          fixHint: "Use a source-backed verification date, not build date.",
        });
      }
      const validSources = ["ckl-claim-ledger", "authored-verification", "derived-source"];
      if (!validSources.includes(fv.source ?? "")) {
        diagnostics.push({
          ruleId: "AGK-08",
          severity: "error",
          file: `${KNOWLEDGE_DIR}/${domain}.json`,
          message: `freshness.source is not valid: ${fv.source ?? "(missing)"}`,
          fixHint: `source must be one of: ${validSources.join(", ")}`,
        });
      }
    }

    // RFC-0319: AGK-09 — declared URL field points to neither generated static output
    // nor runtime-owned declaration. Check statusUrl in web domain.
    if (domain === "web" && onDisk.data) {
      for (const [, langData] of Object.entries(onDisk.data)) {
        const webData = langData as Record<string, unknown>;
        const statusUrl = webData.statusUrl as string | undefined;
        if (statusUrl) {
          const statusPath = statusUrl.replace(/^https?:\/\/[^/]+/, "");
          const candidates = [
            join(paths.publicDirectory, statusPath),
            join(paths.publicDirectory, statusPath, "index.json"),
            join(paths.appDirectory, "dist", statusPath),
          ];
          const exists = candidates.some((p) => existsSync(p));
          if (!exists) {
            diagnostics.push({
              ruleId: "AGK-09",
              severity: "error",
              file: `${KNOWLEDGE_DIR}/${domain}.json`,
              message: `statusUrl "${statusUrl}" does not resolve to a generated static file or runtime-owned declaration.`,
              fixHint:
                "Point statusUrl to a generated artifact (e.g. cosmic-passport.json) or remove it.",
            });
          }
        }
      }
    }

    // RFC-0319: AGK-10 — payload shape changed without required schema tag bump.
    // The schema tag must end with @1 or @2 etc. — not unversioned.
    if (!/@\d+$/.test(onDisk.schema)) {
      diagnostics.push({
        ruleId: "AGK-10",
        severity: "error",
        file: `${KNOWLEDGE_DIR}/${domain}.json`,
        message: `Schema tag "${onDisk.schema}" does not include a version suffix (@N).`,
        fixHint: "Rerun agent.knowledge.generate to emit a properly versioned schema tag.",
      });
    }
  }

  return diagnosticsResult("agent.knowledge.validate", diagnostics);
}
