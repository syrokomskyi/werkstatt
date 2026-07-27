/*
<MODULE_CONTRACT>
<purpose>
RFC-0215: content.derived.validate + content.derived.stamp. A derived claim
(provenance: derived) carries derivedFrom (a source subject) + sourceHash (a
normalized hash of the source value at derivation time). validate recomputes the
source hash and flags drift as `outdated`; stamp (re)writes the hash + asOf after a
derivative is updated. Part of the Content Knowledge Lifecycle (RFC-0211).
</purpose>
<non-goals>
  <item>Do not translate or regenerate; only detect staleness and persist the stamp.</item>
  <item>Do not touch live RFC-0045 references (only copies carry stamps).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0215: initial derived staleness validator + stamp.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, parseDocument } from "yaml";
import { recordClaimsSchema } from "@warpgogol/share/schemas";
import { resolveFieldPath } from "@warpgogol/share/content/resolve-field-path";
import {
  parseClaimSubject,
  formatClaimSubject,
  type ClaimSubject,
} from "@warpgogol/share/knowledge/claim";
import { hashSourceValue, derivedState } from "@warpgogol/share/knowledge/derivation";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult, passResult, failResult } from "./result-helpers.ts";
import { getContentDisciplinePaths, readMarkdownDocument } from "./content-discipline.ts";
import { collectClaimSidecars, keyLine, recordPathForSidecar, toPosix } from "./content-claims.ts";

interface CriticalRule {
  match: string;
  criticality: "advisory" | "important" | "blocking";
}

function matchesGlob(glob: string, value: string): boolean {
  const re = new RegExp(
    "^" + glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return re.test(value);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve a source subject to its record file path within the app. */
function sourceRecordPath(appDir: string, subject: ClaimSubject): string {
  const segments = ["src", "content", subject.collection];
  if (subject.lang) segments.push(subject.lang);
  segments.push(`${subject.file}.md`);
  return join(appDir, ...segments);
}

/** Read the current source value (string) a derivative is derived from, or undefined. */
async function readSourceValue(
  context: KernelRuntimeContext,
  appDir: string,
  subject: ClaimSubject,
): Promise<string | undefined> {
  try {
    const doc = await readMarkdownDocument(
      context.workspaceRoot,
      sourceRecordPath(appDir, subject),
    );
    const resolved = resolveFieldPath(doc.frontmatter, subject.fieldPath);
    if (resolved.missingField !== null) return undefined;
    return typeof resolved.value === "string" ? resolved.value : String(resolved.value ?? "");
  } catch {
    return undefined;
  }
}

// ─── content.derived.validate ───────────────────────────────────────────────

export async function runContentDerivedValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.derived.validate";
  const appDir = context.site?.directory;
  if (!appDir) return passResult(command, "skipped (no app context)");

  const paths = getContentDisciplinePaths(context);

  let criticalRules: CriticalRule[] = [];
  try {
    const { manifest } = await loadSystemManifest(paths.contentDirectory);
    criticalRules = manifest.knowledge?.derivation?.critical ?? [];
  } catch {
    /* defaults */
  }

  const diagnostics: Diagnostic[] = [];
  const sidecars = await collectClaimSidecars(paths.businessDirectory);

  for (const sidecarPath of sidecars) {
    const relFile = toPosix(context.workspaceRoot, sidecarPath);
    const raw = await readFile(sidecarPath, "utf-8");
    const parsed = recordClaimsSchema.safeParse(parseYaml(raw));
    if (!parsed.success) continue;

    for (const [fieldPath, ann] of Object.entries(parsed.data)) {
      if (ann.provenance !== "derived") continue;
      const line = keyLine(raw, fieldPath);

      if (!ann.derivedFrom) {
        diagnostics.push({
          ruleId: "CKL-DERIV-02",
          severity: "error",
          file: relFile,
          line,
          message: `Derived claim "${fieldPath}" has no derivedFrom`,
          fixHint: "Set derivedFrom to the source subject (collection/[lang/]file#field).",
        });
        continue;
      }

      let source: ClaimSubject;
      try {
        source = parseClaimSubject(ann.derivedFrom);
      } catch {
        diagnostics.push({
          ruleId: "CKL-DERIV-02",
          severity: "error",
          file: relFile,
          line,
          message: `Derived claim "${fieldPath}" has a malformed derivedFrom "${ann.derivedFrom}"`,
          fixHint: "Use a canonical subject string: collection/[lang/]file#field.",
        });
        continue;
      }

      const sourceValue = await readSourceValue(context, appDir, source);
      const { state } = derivedState(ann.sourceHash, sourceValue);
      const subjectLabel = `${source.collection}/${source.lang ? source.lang + "/" : ""}${source.file}#${source.fieldPath.join(".")}`;

      if (state === "source-missing") {
        diagnostics.push({
          ruleId: "CKL-DERIV-02",
          severity: "error",
          file: relFile,
          line,
          message: `Derived claim "${fieldPath}" points at a missing source ${formatClaimSubject(source)}`,
          fixHint: "Fix derivedFrom, or restore the source field.",
        });
      } else if (state === "outdated") {
        const blocking = criticalRules.some(
          (r) => matchesGlob(r.match, ann.derivedFrom!) && r.criticality === "blocking",
        );
        diagnostics.push({
          ruleId: "CKL-DERIV-01",
          severity: blocking ? "error" : "warning",
          file: relFile,
          line,
          message: `Derived claim "${fieldPath}" is outdated: source ${subjectLabel} changed since it was stamped`,
          fixHint: `Update the derivative, then: content.derived.stamp --subject ${derivativeSubject(relFile, fieldPath)}`,
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}

/** Canonical subject string for a derivative given its sidecar rel path + field. */
function derivativeSubject(sidecarRelFile: string, fieldPath: string): string {
  const stem = sidecarRelFile
    .replace(/^apps\/[^/]+\/src\/content\//, "")
    .replace(/\.claims\.yaml$/, "");
  return `${stem}#${fieldPath}`;
}

// ─── content.derived.stamp ──────────────────────────────────────────────────

export async function runContentDerivedStamp(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.derived.stamp";
  const appDir = context.site?.directory;
  if (!appDir)
    return failResult(command, ["content.derived.stamp must run inside an app context."]);

  const subjectArg =
    (input.flags["subject"] as string | undefined) ?? (input.args[0] as string | undefined);
  if (!subjectArg) {
    return failResult(command, [
      'content.derived.stamp requires --subject "collection/[lang/]file#field"',
    ]);
  }

  let derivative: ClaimSubject;
  try {
    derivative = parseClaimSubject(subjectArg);
  } catch (e) {
    return failResult(command, [
      `Invalid --subject: ${e instanceof Error ? e.message : String(e)}`,
    ]);
  }

  // Locate the derivative's sidecar.
  const sidecarPath = sourceRecordPath(appDir, derivative).replace(/\.md$/, ".claims.yaml");
  let raw: string;
  try {
    raw = await readFile(sidecarPath, "utf-8");
  } catch {
    return failResult(command, [
      `No claim sidecar at ${toPosix(context.workspaceRoot, sidecarPath)}`,
    ]);
  }

  const fieldKey = derivative.fieldPath.join(".");
  const parsed = recordClaimsSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    return failResult(command, [
      `Sidecar ${toPosix(context.workspaceRoot, sidecarPath)} fails the claim schema; fix it first.`,
    ]);
  }
  const ann = parsed.data[fieldKey];
  if (!ann || ann.provenance !== "derived" || !ann.derivedFrom) {
    return failResult(command, [
      `Field "${fieldKey}" is not a derived claim with a derivedFrom in that sidecar.`,
    ]);
  }

  const source = parseClaimSubject(ann.derivedFrom);
  const sourceValue = await readSourceValue(context, appDir, source);
  if (sourceValue === undefined) {
    return failResult(command, [
      `Source ${formatClaimSubject(source)} does not resolve; refusing to stamp.`,
    ]);
  }

  const newHash = hashSourceValue(sourceValue);
  const doc = parseDocument(raw);
  doc.setIn([fieldKey, "sourceHash"], newHash);
  doc.setIn([fieldKey, "asOf"], todayIso());
  await writeFile(sidecarPath, doc.toString(), "utf-8");

  context.logger.success(
    `Stamped ${subjectArg}: sourceHash=${newHash.slice(0, 18)}… asOf=${todayIso()}`,
  );
  return passResult(command, `content.derived.stamp: stamped ${subjectArg}`);
}
