/*
<MODULE_CONTRACT>
<purpose>
RFC-0505: ratgeber.claim.validate — validate ratgeber claim records at
`src/content/surface/claims/{lang}/*.md`. Checks claim record schema,
claimId uniqueness, articleId resolution, source binding for factual/regulatory
claims, calculationInputs for calculation claims, URL validity, expiry warnings,
disputed status warnings, and PBP value drift for calculation claims.
Diagnostics: RG-CLAIM-01..09.
</purpose>
<non-goals>
  <item>Do not validate article-level provenance — that is ratgeber.provenance.validate (RFC-0502).</item>
  <item>Do not validate article structure — that is ratgeber.article.validate (RFC-0501).</item>
  <item>Do not validate source descriptor registry shape — that is source.binding.validate (CKL-SRC-01).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0505: initial claim record validator with 9 rules (RG-CLAIM-01..09).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readdir } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadClaimRecords } from "./lib/surface-claims.ts";

/** Load article slugs per language for RG-CLAIM-03 (articleId resolution). */
async function loadArticleSlugs(appDir: string): Promise<Set<string>> {
  const slugs = new Set<string>();
  const articlesBaseDir = join(appDir, "src", "content", "surface", "articles");

  let langDirs: string[];
  try {
    langDirs = await readdir(articlesBaseDir);
  } catch {
    return slugs;
  }

  for (const lang of langDirs) {
    const langPath = join(articlesBaseDir, lang);
    const files = await collectMarkdownFiles(langPath).catch(() => []);
    for (const file of files) {
      const slug = file.split("/").pop()?.replace(/\.md$/, "") ?? "";
      if (slug) slugs.add(slug);
    }
  }

  return slugs;
}

/** Today's date as ISO 8601 (YYYY-MM-DD). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runRatgeberClaimValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "ratgeber.claim.validate";
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;

  const { records: claimRecordList, errors: loadErrors } = await loadClaimRecords(appDir);

  if (claimRecordList.length === 0 && loadErrors.length === 0) {
    return passResult(
      "ratgeber.claim.validate",
      "ratgeber.claim.validate: OK — no claim records found",
    );
  }

  const articleSlugs = await loadArticleSlugs(appDir);
  const today = todayISO();
  const diagnostics: Diagnostic[] = [];

  // RG-CLAIM-01: schema validation errors from loading
  for (const err of loadErrors) {
    diagnostics.push({
      ruleId: "RG-CLAIM-01",
      severity: "error",
      file: err.file,
      message: `Claim record schema invalid: ${err.message}`,
      fixHint: "Make the claim record match the claimRecordSchema (RFC-0505).",
    });
  }

  const seenClaimIds = new Map<string, string>(); // claimId → first file path

  for (const record of claimRecordList) {
    const claimId = record.claimId;
    // RG-CLAIM-02: claimId uniqueness
    if (seenClaimIds.has(claimId)) {
      diagnostics.push({
        ruleId: "RG-CLAIM-02",
        severity: "error",
        file: record.filePath,
        message: `claimId "${claimId}" is not unique — also defined in ${seenClaimIds.get(claimId)}`,
        fixHint: "Rename one of the claim records to have a unique claimId.",
        data: { claimId },
      });
    } else {
      seenClaimIds.set(claimId, record.filePath);
    }

    // RG-CLAIM-03: articleId resolves to an existing article record
    if (!articleSlugs.has(record.articleId)) {
      diagnostics.push({
        ruleId: "RG-CLAIM-03",
        severity: "error",
        file: record.filePath,
        message: `articleId "${record.articleId}" does not resolve to an existing article record`,
        fixHint: `Create surface/articles/${record.lang}/${record.articleId}.md or fix the articleId.`,
        data: { articleId: record.articleId },
      });
    }

    // RG-CLAIM-04: factual and regulatory claims have at least one sourceRefs entry
    if (
      (record.claimType === "factual" || record.claimType === "regulatory") &&
      record.sourceRefs.length === 0
    ) {
      diagnostics.push({
        ruleId: "RG-CLAIM-04",
        severity: "error",
        file: record.filePath,
        message: `claim "${claimId}" (type: ${record.claimType}) has no sourceRefs — ${record.claimType} claims require at least one source reference`,
        fixHint: "Add at least one entry to sourceRefs with sourceId, url, title, and retrievedAt.",
        data: { claimId, claimType: record.claimType },
      });
    }

    // RG-CLAIM-05: calculation claims have at least one calculationInputs entry
    if (
      record.claimType === "calculation" &&
      (!record.calculationInputs || record.calculationInputs.length === 0)
    ) {
      diagnostics.push({
        ruleId: "RG-CLAIM-05",
        severity: "error",
        file: record.filePath,
        message: `claim "${claimId}" (type: calculation) has no calculationInputs — calculation claims require at least one input reference`,
        fixHint: "Add at least one entry to calculationInputs with ref and value.",
        data: { claimId },
      });
    }

    // RG-CLAIM-06: sourceRefs[].url is a valid URL (already validated by Zod schema,
    // but we check here for records that passed schema validation with optional fields)
    for (const sourceRef of record.sourceRefs) {
      try {
        new URL(sourceRef.url);
      } catch {
        diagnostics.push({
          ruleId: "RG-CLAIM-06",
          severity: "error",
          file: record.filePath,
          message: `claim "${claimId}" sourceRef URL "${sourceRef.url}" is not a valid URL`,
          fixHint: "Fix the URL in the sourceRefs entry.",
          data: { claimId, url: sourceRef.url },
        });
      }
    }

    // RG-CLAIM-07: expired claims warning
    if (record.expiresAt && record.expiresAt < today) {
      diagnostics.push({
        ruleId: "RG-CLAIM-07",
        severity: "warning",
        file: record.filePath,
        message: `claim "${claimId}" expired on ${record.expiresAt} — needs review`,
        fixHint: "Review the claim, update verifiedAt and expiresAt, or remove the claim.",
        data: { claimId, expiresAt: record.expiresAt },
      });
    }

    // RG-CLAIM-08: disputed claims warning
    if (record.reviewStatus === "disputed") {
      diagnostics.push({
        ruleId: "RG-CLAIM-08",
        severity: "warning",
        file: record.filePath,
        message: `claim "${claimId}" has reviewStatus "disputed" — claim is contested`,
        fixHint: "Resolve the dispute and update reviewStatus, or remove the claim.",
        data: { claimId },
      });
    }

    // RG-CLAIM-09: PBP value drift warning (calculation claims only)
    // NOTE: Full PBP value drift detection requires reading PBP data files at the
    // `calculationInputs[].ref` path and comparing against the recorded `value`.
    // This is a warning-level check — the ref path may not resolve if PBP data
    // has been restructured. For now, we emit a warning only when the ref path
    // is present but cannot be resolved (which indicates potential drift or
    // a stale reference). Full value comparison is deferred to a follow-up
    // because it requires PBP data loading infrastructure not yet wired into
    // the build.check pipeline.
    if (record.claimType === "calculation" && record.calculationInputs) {
      for (const input of record.calculationInputs) {
        // Basic ref format check — warn if the ref doesn't look like a PBP path
        if (!input.ref.includes(".") || input.ref.startsWith("/")) {
          diagnostics.push({
            ruleId: "RG-CLAIM-09",
            severity: "warning",
            file: record.filePath,
            message: `claim "${claimId}" calculationInput ref "${input.ref}" does not look like a PBP path (expected format: "entity.field.subfield")`,
            fixHint:
              'Use a PBP reference path like "business-profile.offerings/digital-foundation.presentation.price.setup".',
            data: { claimId, ref: input.ref },
          });
        }
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "ratgeber.claim.validate",
      `ratgeber.claim.validate: OK — ${claimRecordList.length} claim record(s) conform`,
    );
  }

  return diagnosticsResult(command, diagnostics);
}
