/*
<MODULE_CONTRACT>
<purpose>
RFC-0497: surface.intersection.report — diagnostic report listing depth-5 intersection
records that fail the minimum intersection gate. Always exits 0 (advisory report).
</purpose>
<non-goals>
  <item>Do not fail the build — this is an advisory report only.</item>
  <item>Do not validate general surface artifact integrity — that is surface.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0497: initial — intersection diagnostic report.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parseMarkdownFrontmatter, collectMarkdownFiles } from "@warpgogol/site-kernel-content";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceBlueprints } from "./surface-expand.ts";

interface IntersectionRecord {
  slug: string;
  lang: string;
  data: Record<string, unknown>;
  filePath: string;
}

export async function runSurfaceIntersectionReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.intersection.report must run inside an app context." };
  }

  const intersectionsDir = join(app.directory, "src/content/surface/intersections");
  if (!existsSync(intersectionsDir)) {
    return passResult(
      "surface.intersection.report",
      "skipped (no intersections content directory)",
    );
  }

  const blueprints = await loadSurfaceBlueprints(context.workspaceRoot);
  const websiteLocalBp = blueprints.find((b) => b.id === "website-local");
  if (!websiteLocalBp) {
    return passResult("surface.intersection.report", "skipped (no website-local blueprint found)");
  }

  const records = await loadIntersectionRecords(intersectionsDir);
  if (records.length === 0) {
    return passResult("surface.intersection.report", "skipped (no intersection records found)");
  }

  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    const relFile = record.filePath.replace(app.directory + "/", "");

    // Report publication decision distribution.
    const publicationDecision = record.data["publicationDecision"] ?? "pending";
    diagnostics.push({
      ruleId: "intersection-record-status",
      severity: "info",
      file: relFile,
      message: `intersection "${record.slug}" publicationDecision: ${publicationDecision}`,
      data: {
        slug: record.slug,
        publicationDecision,
        industryId: record.data.industryId,
        cityId: record.data.cityId,
        serviceId: record.data.serviceId,
      },
    });

    // Report field counts for gate visibility.
    const fields = [
      "localServiceQuestions",
      "scenarios",
      "localEvidence",
      "uniqueContentBlocks",
      "uniqueFaq",
      "sources",
    ];
    for (const field of fields) {
      const value = record.data[field];
      const count = Array.isArray(value) ? value.length : value ? 1 : 0;
      if (count === 0) {
        diagnostics.push({
          ruleId: "intersection-field-empty",
          severity: "warning",
          file: relFile,
          message: `intersection "${record.slug}" field "${field}" is empty`,
          fixHint: `Add entries to the "${field}" field to pass the intersection gate.`,
          data: { slug: record.slug, field, count },
        });
      }
    }
  }

  return diagnosticsResult("surface.intersection.report", diagnostics);
}

async function loadIntersectionRecords(intersectionsDir: string): Promise<IntersectionRecord[]> {
  const records: IntersectionRecord[] = [];
  const langDirs = await readdir(intersectionsDir, { withFileTypes: true });
  for (const langDir of langDirs) {
    if (!langDir.isDirectory()) continue;
    const lang = langDir.name;
    const langPath = join(intersectionsDir, lang);
    const files = await collectMarkdownFiles(langPath);
    for (const filePath of files) {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseMarkdownFrontmatter(raw);
      const slug =
        typeof parsed.data?.slug === "string" && parsed.data.slug.trim()
          ? parsed.data.slug.trim()
          : filePath.split("/").pop()!.replace(/\.md$/, "");
      records.push({ slug, lang, data: parsed.data ?? {}, filePath });
    }
  }
  return records;
}
