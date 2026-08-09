/*
<MODULE_CONTRACT>
<purpose>
RFC-0212: content.claim.validate + content.claim.report. Validates the per-record
claim sidecars (`<record>.claims.yaml`) under src/content/business-profile/** against the
recordClaims schema, verifies every annotated field path resolves in its sibling
record, and reports provenance coverage over load-bearing fields. Part of the
Content Knowledge Lifecycle (RFC-0211).
</purpose>
<non-goals>
  <item>Do not mutate sidecars or records.</item>
  <item>Do not evaluate freshness (RFC-0213), hash derivations (RFC-0215), or resolve sources (RFC-0214).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0212: initial claim sidecar validator + coverage report.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { recordClaimsSchema, type ClaimAnnotation } from "@warpgogol/werkstatt-site/share/schemas";
import { resolveFieldPath } from "@warpgogol/werkstatt-site/share/content/resolve-field-path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import {
  getContentDisciplinePaths,
  pathExists,
  readMarkdownDocument,
} from "./content-discipline.ts";

const CLAIMS_SUFFIX = ".claims.yaml";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Recursively collect every *.claims.yaml file under a directory (absolute paths). */
export async function collectClaimSidecars(directory: string): Promise<string[]> {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(CLAIMS_SUFFIX)) {
      // `parentPath` (node 20+) is the directory the entry was found in.
      const dir = (entry as unknown as { parentPath?: string }).parentPath ?? directory;
      files.push(join(dir, entry.name));
    }
  }
  return files.sort();
}

export const CLAIMS_SUFFIX_PUBLIC = CLAIMS_SUFFIX;

/** Record markdown path for a sidecar path (`<x>.claims.yaml` → `<x>.md`). */
export function recordPathForSidecar(sidecarPath: string): string {
  return sidecarPath.slice(0, -CLAIMS_SUFFIX.length) + ".md";
}

/** 1-based line of a top-level YAML key (`key:` or `"key":`/`'key':`), else 1. */
export function keyLine(source: string, key: string): number {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimStart();
    if (
      trimmed.startsWith(`${key}:`) ||
      trimmed.startsWith(`"${key}":`) ||
      trimmed.startsWith(`'${key}':`)
    ) {
      return i + 1;
    }
  }
  return 1;
}

export function toPosix(workspaceRoot: string, filePath: string): string {
  return relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

// ─── content.claim.validate ─────────────────────────────────────────────────

export async function runContentClaimValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.claim.validate";
  const paths = getContentDisciplinePaths(context);
  const sidecars = await collectClaimSidecars(paths.businessDirectory);
  const diagnostics: Diagnostic[] = [];

  for (const sidecarPath of sidecars) {
    const relFile = toPosix(context.workspaceRoot, sidecarPath);
    const raw = await readFile(sidecarPath, "utf-8");

    // CKL-CLAIM-01: YAML parse.
    let parsed: unknown;
    try {
      parsed = parseYaml(raw) ?? {};
    } catch (error) {
      diagnostics.push({
        ruleId: "CKL-CLAIM-01",
        severity: "error",
        file: relFile,
        line: 1,
        message: `Claim sidecar is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
        fixHint: "Fix the YAML syntax so the sidecar parses.",
      });
      continue;
    }

    // CKL-CLAIM-01: schema shape.
    const result = recordClaimsSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const topKey = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
        diagnostics.push({
          ruleId: "CKL-CLAIM-01",
          severity: "error",
          file: relFile,
          line: topKey ? keyLine(raw, topKey) : 1,
          message: `Claim sidecar field "${issue.path.join(".") || "(root)"}" — ${issue.message}`,
          fixHint: "Make the sidecar match the recordClaims schema (RFC-0212).",
        });
      }
      continue; // shape invalid — skip resolution against the record.
    }

    const claims = result.data;

    // Resolve the sibling record (<name>.md).
    const recordPath = sidecarPath.slice(0, -CLAIMS_SUFFIX.length) + ".md";
    if (!(await pathExists(recordPath))) {
      diagnostics.push({
        ruleId: "CKL-CLAIM-02",
        severity: "error",
        file: relFile,
        line: 1,
        message: `Claim sidecar has no sibling record (${toPosix(context.workspaceRoot, recordPath)} is missing)`,
        fixHint: "Place the sidecar next to its <record>.md, or remove the orphan sidecar.",
      });
      continue;
    }
    const record = await readMarkdownDocument(context.workspaceRoot, recordPath);

    for (const [fieldPath, annotation] of Object.entries(claims) as Array<
      [string, ClaimAnnotation]
    >) {
      // CKL-CLAIM-02: the annotated field path must resolve in the record.
      const resolution = resolveFieldPath(record.frontmatter, fieldPath.split("."));
      if (resolution.missingField !== null) {
        diagnostics.push({
          ruleId: "CKL-CLAIM-02",
          severity: "error",
          file: relFile,
          line: keyLine(raw, fieldPath),
          message: `Field path "${fieldPath}" does not resolve in ${record.relativeFile} (missing "${resolution.missingField}")`,
          fixHint: "Use a field path that exists in the record, or fix the record.",
        });
      }

      // CKL-CLAIM-03: external provenance should bind a source.
      if (annotation.provenance === "external" && !annotation.sourceRef) {
        diagnostics.push({
          ruleId: "CKL-CLAIM-03",
          severity: "warning",
          file: relFile,
          line: keyLine(raw, fieldPath),
          message: `Field "${fieldPath}" is external-provenance but has no sourceRef`,
          fixHint:
            "Bind a source descriptor (RFC-0214) via sourceRef, or use provenance: asserted.",
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}

// ─── content.claim.report ───────────────────────────────────────────────────

const LOAD_BEARING_KEY =
  /(price|cost|rate|year|count|residents|population|amount|fee|valid|expires?|date|status|number|quantity|percent|hours?)/i;
const MONEY_OR_DATE =
  /[€$£]|\bEUR\b|\bUSD\b|\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+[.,]\d{2}\b|\b(?:19|20)\d{2}\b|%/;
const PROSE_KEY =
  /^(id|name|title|slug|tagline|description|mission|body|label|detail|author|alt|brand|bio|order)$/i;

/** Walk plain-object leaves of a record, returning dotted paths to load-bearing leaves. */
function loadBearingPaths(data: unknown, prefix: string[] = []): string[] {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const path = [...prefix, key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out.push(...loadBearingPaths(value, path));
      continue;
    }
    if (PROSE_KEY.test(key)) continue;
    const isLeaf = typeof value === "number" || typeof value === "string";
    if (!isLeaf) continue;
    const loadBearing =
      typeof value === "number" ||
      LOAD_BEARING_KEY.test(key) ||
      (typeof value === "string" && MONEY_OR_DATE.test(value));
    if (loadBearing) out.push(path.join("."));
  }
  return out;
}

interface ClaimReportEntry {
  record: string;
  fieldPath: string;
  annotated: boolean;
  provenance?: string;
}

interface ClaimReportResult extends CheckResult {
  loadBearingTotal: number;
  annotatedTotal: number;
  coverage: number;
  entries: ClaimReportEntry[];
}

export async function runContentClaimReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ClaimReportResult>> {
  const command = "content.claim.report";
  const paths = getContentDisciplinePaths(context);

  const sidecars = await collectClaimSidecars(paths.businessDirectory);
  const claimsByRecord = new Map<string, Set<string>>();
  const provenanceByKey = new Map<string, string>();
  for (const sidecarPath of sidecars) {
    const recordPath = sidecarPath.slice(0, -CLAIMS_SUFFIX.length) + ".md";
    const recordRel = toPosix(context.workspaceRoot, recordPath);
    try {
      const parsed = recordClaimsSchema.safeParse(parseYaml(await readFile(sidecarPath, "utf-8")));
      if (!parsed.success) continue;
      const set = new Set<string>();
      for (const [fieldPath, annotation] of Object.entries(parsed.data)) {
        set.add(fieldPath);
        provenanceByKey.set(`${recordRel}#${fieldPath}`, annotation.provenance);
      }
      claimsByRecord.set(recordRel, set);
    } catch {
      // ignore — validate surfaces broken sidecars; the report is advisory.
    }
  }

  const entries: ClaimReportEntry[] = [];
  const businessDir = paths.businessDirectory;
  if (await pathExists(businessDir)) {
    const all = await readdir(businessDir, { recursive: true, withFileTypes: true });
    for (const entry of all) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const dir = (entry as unknown as { parentPath?: string }).parentPath ?? businessDir;
      const recordPath = join(dir, entry.name);
      const recordRel = toPosix(context.workspaceRoot, recordPath);
      const record = await readMarkdownDocument(context.workspaceRoot, recordPath);
      const annotated = claimsByRecord.get(recordRel) ?? new Set<string>();
      for (const fieldPath of loadBearingPaths(record.frontmatter)) {
        entries.push({
          record: recordRel,
          fieldPath,
          annotated: annotated.has(fieldPath),
          provenance: provenanceByKey.get(`${recordRel}#${fieldPath}`),
        });
      }
    }
  }

  const loadBearingTotal = entries.length;
  const annotatedTotal = entries.filter((e) => e.annotated).length;
  const coverage = loadBearingTotal === 0 ? 1 : annotatedTotal / loadBearingTotal;

  if (context.outputFormat === "pretty") {
    context.logger.section("content.claim.report");
    context.logger.info(
      `Provenance coverage: ${annotatedTotal}/${loadBearingTotal} load-bearing fields (${Math.round(
        coverage * 100,
      )}%)`,
    );
    for (const e of entries.filter((x) => !x.annotated)) {
      context.logger.info(`  unannotated: ${e.record}#${e.fieldPath}`);
    }
  }

  return {
    data: {
      command,
      status: "pass",
      diagnostics: [],
      summary: { error: 0, warning: 0, info: 0 },
      loadBearingTotal,
      annotatedTotal,
      coverage,
      entries,
    },
    exitCode: 0,
    summary: `content.claim.report: ${annotatedTotal}/${loadBearingTotal} load-bearing fields annotated`,
  };
}
