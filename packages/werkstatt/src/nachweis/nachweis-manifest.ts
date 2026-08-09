/*
<MODULE_CONTRACT>
<purpose>RFC-0707: nachweis.manifest.generate command handler — generates public/nachweise/manifest.json from published records.</purpose>
<keywords>nachweis, manifest, generate, public, published, deterministic</keywords>
<responsibilities>
  <item>Reads PBP EvidenceSource entities and filters by publication.visibility: public.</item>
  <item>Builds NachweisManifest with generatedAt: null (RFC-0602) and expiresAt: null.</item>
  <item>Writes to {cachePath}/public/nachweise/manifest.json using writeFileIfChanged.</item>
  <item>Writes empty manifest (records: []) when no published records exist.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not publish records — that is nachweis.publish.</item>
  <item>Does not validate gate conditions — that is nachweis.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis.manifest.generate command handler.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolvePbpEntityDir,
  resolveDefaultLang,
  type NachweisManifest,
  type NachweisManifestEntry,
} from "./nachweis-io.ts";

const NACHWEIS_EVIDENCE_KINDS = new Set([
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
]);

const MANIFEST_SCHEMA_VERSION = "1.0.0";
const MANIFEST_OUTPUT_DIR = path.join("public", "nachweise");
const MANIFEST_OUTPUT_FILE = "manifest.json";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export async function runNachweisManifestGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisManifest>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  if (!systemId) throw new Error("[nachweis.manifest.generate] --system is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.manifest.generate",
      systemId,
    ) as unknown as KernelCommandResult<NachweisManifest>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = await resolveDefaultLang(cachePath);

  const evidenceDir = resolvePbpEntityDir(cachePath, lang, "evidence-source");
  const records: NachweisManifestEntry[] = [];

  if (existsSync(evidenceDir)) {
    const entries = await fs.readdir(evidenceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md") && !entry.name.endsWith(".yaml")) continue;
      const filePath = path.join(evidenceDir, entry.name);
      const raw = await fs.readFile(filePath, "utf8");
      let data: Record<string, unknown>;
      if (entry.name.endsWith(".md")) {
        const parsed = parseMarkdownFrontmatter(raw);
        data = parsed.data;
      } else {
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }
      }

      const kind = data.kind as string | undefined;
      if (!kind || !NACHWEIS_EVIDENCE_KINDS.has(kind)) continue;

      const publication = data.publication as Record<string, unknown> | undefined;
      if (publication?.visibility !== "public") continue;

      const slug = (data.slug as string | undefined) ?? entry.name.replace(/\.(md|yaml)$/, "");
      const items = data.items as Record<string, { sha256?: string }> | undefined;
      const firstSha = items ? Object.values(items)[0]?.sha256 : undefined;

      records.push({
        recordId: (data.recordId as string | undefined) ?? `nr_${slug}`,
        slug,
        recordType: kind,
        titleDe: (data.titleDe as string | undefined) ?? "",
        titleUk: (data.titleUk as string | undefined) ?? "",
        ...(data.titleEn ? { titleEn: data.titleEn as string } : {}),
        qualityStatus: (data.qualityStatus as string | undefined) ?? "unverified",
        sourceSha256: firstSha ?? "",
        publishedAt: (publication.publishedAt as string | null) ?? null,
      });
    }
  }

  records.sort((a, b) => a.slug.localeCompare(b.slug));

  const manifest: NachweisManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: null,
    expiresAt: null,
    records,
  };

  const outputDir = path.join(cachePath, MANIFEST_OUTPUT_DIR);
  if (!existsSync(outputDir)) {
    await fs.mkdir(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, MANIFEST_OUTPUT_FILE);
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  await writeFileIfChanged(outputPath, manifestJson);

  logger.info(
    `[nachweis.manifest.generate] wrote ${records.length} record(s) to ${MANIFEST_OUTPUT_DIR}/${MANIFEST_OUTPUT_FILE}`,
  );

  return {
    data: manifest,
    exitCode: 0,
    summary: `[nachweis.manifest.generate] ${systemId}: ${records.length} public record(s)`,
  };
}
