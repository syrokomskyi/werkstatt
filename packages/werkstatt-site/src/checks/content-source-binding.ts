/*
<MODULE_CONTRACT>
<purpose>
RFC-0214: source.binding.validate. Validates the workspace source-descriptor
registry (integrations/truth-sources/*.yaml), checks that every claim sourceRef
resolves to a descriptor, and surfaces Truth Monitor divergences from the outbox.
Named source.binding.validate (not content.source.validate — that name is taken by
the RFC-0171 content-source adapter). Part of the Content Knowledge Lifecycle.
</purpose>
<non-goals>
  <item>Do not fetch sources — the monitor (source.monitor.run) does that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0214: initial source binding validator.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import { recordClaimsSchema } from "@warpgogol/share/schemas";
import {
  sourceDescriptorSchema,
  type SourceDescriptor,
  type DivergenceRecord,
} from "@warpgogol/share/knowledge/source";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { getContentDisciplinePaths, pathExists } from "./content-discipline.ts";
import { collectClaimSidecars, keyLine, toPosix } from "./content-claims.ts";

export const TRUTH_SOURCES_DIR = "integrations/truth-sources";
export const TRUTH_MONITOR_DIR = "integrations/truth-monitor";
export const MONITOR_REGISTRY_FILE = `${TRUTH_MONITOR_DIR}/monitor-sources.json`;
export const OUTBOX_FILE = `${TRUTH_MONITOR_DIR}/outbox.json`;

export interface LoadedDescriptors {
  byId: Map<string, SourceDescriptor>;
  /** Schema violations, keyed for CKL-SRC-01 diagnostics. */
  errors: Array<{ file: string; message: string }>;
}

/** Read + validate every descriptor under integrations/truth-sources/. */
export async function loadSourceDescriptors(workspaceRoot: string): Promise<LoadedDescriptors> {
  const dir = join(workspaceRoot, TRUTH_SOURCES_DIR);
  const byId = new Map<string, SourceDescriptor>();
  const errors: Array<{ file: string; message: string }> = [];
  if (!(await pathExists(dir))) return { byId, errors };

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const rel = `${TRUTH_SOURCES_DIR}/${entry.name}`;
    let parsed: unknown;
    try {
      parsed = yamlParse(await readFile(join(dir, entry.name), "utf-8"));
    } catch (e) {
      errors.push({
        file: rel,
        message: `not valid YAML: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    const result = sourceDescriptorSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          file: rel,
          message: `${issue.path.join(".") || "(root)"} — ${issue.message}`,
        });
      }
      continue;
    }
    byId.set(result.data.id, result.data);
  }
  return { byId, errors };
}

export async function readOutbox(workspaceRoot: string): Promise<DivergenceRecord[]> {
  const file = join(workspaceRoot, OUTBOX_FILE);
  if (!(await pathExists(file))) return [];
  try {
    const data = yamlParse(await readFile(file, "utf-8"));
    return Array.isArray(data) ? (data as DivergenceRecord[]) : [];
  } catch {
    return [];
  }
}

/** Canonical subject string for a claim given its sidecar rel path + field. */
function subjectFor(sidecarRelFile: string, fieldPath: string): string {
  const stem = sidecarRelFile
    .replace(/^apps\/[^/]+\/src\/content\//, "")
    .replace(/\.claims\.yaml$/, "");
  return `${stem}#${fieldPath}`;
}

export async function runSourceBindingValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "source.binding.validate";
  const diagnostics: Diagnostic[] = [];

  // CKL-SRC-01: descriptor registry shape.
  const { byId, errors } = await loadSourceDescriptors(context.workspaceRoot);
  for (const err of errors) {
    diagnostics.push({
      ruleId: "CKL-SRC-01",
      severity: "error",
      file: err.file,
      line: 1,
      message: `Source descriptor invalid: ${err.message}`,
      fixHint: "Make the descriptor match the source descriptor schema (RFC-0214).",
    });
  }

  // Index this app's claims by subject for CKL-SRC-02/03/04.
  const paths = getContentDisciplinePaths(context);
  const app = context.site?.name ?? "unknown";
  const subjectIndex = new Map<
    string,
    { file: string; raw: string; field: string; sourceRef?: string }
  >();
  const sidecars = await collectClaimSidecars(paths.businessDirectory);
  for (const sidecarPath of sidecars) {
    const relFile = toPosix(context.workspaceRoot, sidecarPath);
    const raw = await readFile(sidecarPath, "utf-8");
    const parsed = recordClaimsSchema.safeParse(yamlParse(raw));
    if (!parsed.success) continue;
    for (const [fieldPath, ann] of Object.entries(parsed.data)) {
      const subject = subjectFor(relFile, fieldPath);
      subjectIndex.set(subject, { file: relFile, raw, field: fieldPath, sourceRef: ann.sourceRef });

      // CKL-SRC-02: sourceRef must resolve to a descriptor.
      if (ann.sourceRef && !byId.has(ann.sourceRef)) {
        diagnostics.push({
          ruleId: "CKL-SRC-02",
          severity: "error",
          file: relFile,
          line: keyLine(raw, fieldPath),
          message: `Claim "${fieldPath}" sourceRef "${ann.sourceRef}" does not resolve to any descriptor`,
          fixHint: `Add ${TRUTH_SOURCES_DIR}/<id>.yaml, or fix the sourceRef.`,
        });
      }
    }
  }

  // RFC-0502: also scan article claim sidecars at surface/articles/{lang}/
  const appDir = paths.appDirectory;
  const articlesBaseDir = join(appDir, "src", "content", "surface", "articles");
  let articleLangDirs: string[];
  try {
    articleLangDirs = await readdir(articlesBaseDir);
  } catch {
    articleLangDirs = [];
  }
  for (const langDir of articleLangDirs) {
    const langPath = join(articlesBaseDir, langDir);
    let langEntries: import("node:fs").Dirent[];
    try {
      langEntries = await readdir(langPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of langEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".claims.yaml")) continue;
      const sidecarPath = join(langPath, entry.name);
      const relFile = toPosix(context.workspaceRoot, sidecarPath);
      const raw = await readFile(sidecarPath, "utf-8");
      const parsed = recordClaimsSchema.safeParse(yamlParse(raw));
      if (!parsed.success) continue;
      for (const [fieldPath, ann] of Object.entries(parsed.data)) {
        const subject = subjectFor(relFile, fieldPath);
        subjectIndex.set(subject, {
          file: relFile,
          raw,
          field: fieldPath,
          sourceRef: ann.sourceRef,
        });

        // CKL-SRC-02: sourceRef must resolve to a descriptor.
        if (ann.sourceRef && !byId.has(ann.sourceRef)) {
          diagnostics.push({
            ruleId: "CKL-SRC-02",
            severity: "error",
            file: relFile,
            line: keyLine(raw, fieldPath),
            message: `Article claim "${fieldPath}" sourceRef "${ann.sourceRef}" does not resolve to any descriptor`,
            fixHint: `Add ${TRUTH_SOURCES_DIR}/<id>.yaml, or fix the sourceRef.`,
          });
        }
      }
    }
  }

  // CKL-SRC-03/04: surface monitor outbox findings for this app's bound claims.
  for (const div of await readOutbox(context.workspaceRoot)) {
    if (div.app !== app) continue;
    const target = subjectIndex.get(div.subject);
    const file = target?.file ?? OUTBOX_FILE;
    const line = target ? keyLine(target.raw, target.field) : 1;
    if (div.unreachable) {
      diagnostics.push({
        ruleId: "CKL-SRC-04",
        severity: "info",
        file,
        line,
        message: `Source ${div.sourceId} was unreachable at last check (${div.observedAt})`,
        fixHint: "Transient; the monitor retries next cadence. Check the endpoint if persistent.",
      });
    } else if (!div.withinTolerance) {
      diagnostics.push({
        ruleId: "CKL-SRC-03",
        severity: "warning",
        file,
        line,
        message: `Source ${div.sourceId} observed "${div.observedValue}" but site asserts "${div.assertedValue}" (${div.observedAt})`,
        fixHint:
          "Re-verify and update the value (RFC-0218 edit transaction), or record verify-noop.",
      });
    }
  }

  return diagnosticsResult(command, diagnostics);
}
