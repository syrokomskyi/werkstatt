/*
<MODULE_CONTRACT>
<purpose>
RFC-0213: content.freshness.validate + content.freshness.report. Evaluates each
CKL claim's temporal window (asOf / validUntil / reviewEvery) against today,
emits RFC-0203 Diagnostics, and writes the per-app authored Freshness Ledger
(src/freshness.generated.yaml). Part of the Content Knowledge Lifecycle (RFC-0211).
</purpose>
<non-goals>
  <item>Do not fetch external sources (RFC-0214) or create tasks (RFC-0216).</item>
  <item>Do not mutate sidecars or records.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0213: initial freshness validator + ledger + report.</item>
  <item>RFC-0323: comparative-commercial review-due claims are blocking.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { recordClaimsSchema } from "@warpgogol/werkstatt-site/share/schemas";
import { resolveFieldPath } from "@warpgogol/werkstatt-site/share/content/resolve-field-path";
import {
  evaluateFreshness,
  emptyFreshnessSummary,
  type AuthoredFreshnessLedger,
  type FreshnessCriticality,
  type FreshnessLedgerEntry,
  type FreshnessState,
} from "@warpgogol/werkstatt-site/share/knowledge/freshness";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { getContentDisciplinePaths, readMarkdownDocument } from "./content-discipline.ts";
import { collectClaimSidecars, keyLine, recordPathForSidecar, toPosix } from "./content-claims.ts";

const LEDGER_FILE = "src/freshness.generated.yaml";
const NEED_THIS = /NEED_THIS_[A-Z0-9_]+/;

interface CriticalRule {
  match: string;
  criticality: FreshnessCriticality;
}

/** Glob match: `*` → `.*`, anchored. Used to map a subject to a criticality. */
function matchesGlob(glob: string, value: string): boolean {
  const re = new RegExp(
    "^" + glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return re.test(value);
}

function criticalityFor(subject: string, rules: CriticalRule[]): FreshnessCriticality {
  for (const rule of rules) {
    if (matchesGlob(rule.match, subject)) return rule.criticality;
  }
  return "advisory";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FreshnessComputation {
  ledger: AuthoredFreshnessLedger;
  /** Per-entry context the validator needs to emit precise diagnostics. */
  diagnostics: Diagnostic[];
}

async function computeFreshness(context: KernelRuntimeContext): Promise<FreshnessComputation> {
  const paths = getContentDisciplinePaths(context);
  const siteName = context.site?.name ?? "unknown";

  // RFC-0213: read the freshness policy from system.md.
  let soonWindowDays = 30;
  let criticalRules: CriticalRule[] = [];
  try {
    const { manifest } = await loadSystemManifest(paths.contentDirectory);
    const policy = manifest.knowledge?.freshness;
    if (policy?.soonWindowDays) soonWindowDays = policy.soonWindowDays;
    if (policy?.critical) criticalRules = policy.critical;
  } catch {
    // No manifest / policy — defaults apply.
  }

  const today = todayIso();
  const entries: FreshnessLedgerEntry[] = [];
  const diagnostics: Diagnostic[] = [];
  const sidecars = await collectClaimSidecars(paths.businessDirectory);

  for (const sidecarPath of sidecars) {
    const relFile = toPosix(context.workspaceRoot, sidecarPath);
    const raw = await readFile(sidecarPath, "utf-8");
    const parsed = recordClaimsSchema.safeParse(parseYaml(raw));
    if (!parsed.success) continue; // content.claim.validate owns schema diagnostics.

    const recordPath = recordPathForSidecar(sidecarPath);
    let frontmatter: Record<string, unknown> = {};
    try {
      frontmatter = (await readMarkdownDocument(context.workspaceRoot, recordPath)).frontmatter;
    } catch {
      continue; // content.claim.validate owns the missing-record diagnostic.
    }

    for (const [fieldPath, ann] of Object.entries(parsed.data)) {
      const subject = `${relFile
        .replace(/^(?:apps\/[^/]+|missions\/[^/]+\/workpiece)\/src\/content\//, "")
        .replace(/\.claims\.yaml$/, "")}#${fieldPath}`;
      const criticality =
        ann.claimClass === "comparative-commercial"
          ? "blocking"
          : criticalityFor(subject, criticalRules);
      const line = keyLine(raw, fieldPath);

      // Unsourced: the record value is still a NEED_THIS marker.
      const resolved = resolveFieldPath(frontmatter, fieldPath.split("."));
      const valueStr = typeof resolved.value === "string" ? resolved.value : "";
      let state: FreshnessState;
      let reviewDueAt: string | undefined;
      if (NEED_THIS.test(valueStr)) {
        state = "unsourced";
      } else {
        const evaln = evaluateFreshness(
          { asOf: ann.asOf, validUntil: ann.validUntil, reviewEvery: ann.reviewEvery },
          today,
          soonWindowDays,
        );
        state = evaln.state;
        reviewDueAt = evaln.reviewDueAt;
      }

      entries.push({
        subject,
        state,
        asOf: ann.asOf,
        validUntil: ann.validUntil,
        reviewDueAt,
        criticality,
      });

      // Map state → diagnostic.
      if (state === "review-due") {
        const blocking = criticality === "blocking";
        diagnostics.push({
          ruleId: "CKL-FRESH-01",
          severity: blocking ? "error" : "info",
          file: relFile,
          line,
          message: `Claim ${subject} is due for review (cadence lapsed; due ${reviewDueAt ?? "?"})${blocking ? " [blocking]" : ""}`,
          fixHint:
            ann.claimClass === "comparative-commercial"
              ? "Record verify-noop, verify-update, or withdraw in the claim ledger after real source review."
              : "Re-verify the value and advance asOf (RFC-0218 edit transaction).",
        });
      } else if (state === "expiring-soon") {
        diagnostics.push({
          ruleId: "CKL-FRESH-02",
          severity: "warning",
          file: relFile,
          line,
          message: `Claim ${subject} expires soon (validUntil ${ann.validUntil})`,
          fixHint: "Re-verify and extend validUntil with a new asOf, before it expires.",
        });
      } else if (state === "expired") {
        const blocking = criticality === "blocking";
        diagnostics.push({
          ruleId: blocking ? "CKL-FRESH-04" : "CKL-FRESH-03",
          severity: blocking ? "error" : "warning",
          file: relFile,
          line,
          message: `Claim ${subject} is expired (validUntil ${ann.validUntil})${blocking ? " [blocking]" : ""}`,
          fixHint: "Re-verify the value and set a new asOf + validUntil.",
        });
      } else if (state === "unsourced") {
        diagnostics.push({
          ruleId: "CKL-FRESH-05",
          severity: "info",
          file: relFile,
          line,
          message: `Claim ${subject} is unsourced (record value is a NEED_THIS marker)`,
          fixHint: "Source the value (RFC-0136) before it can carry a validity window.",
        });
      }
    }
  }

  entries.sort((a, b) => a.subject.localeCompare(b.subject));
  const summary = emptyFreshnessSummary();
  for (const e of entries) summary[e.state] += 1;

  const ledger: AuthoredFreshnessLedger = {
    site: siteName,
    entries,
    summary,
  };
  return { ledger, diagnostics };
}

export async function runContentFreshnessValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.freshness.validate";
  const { ledger, diagnostics } = await computeFreshness(context);

  if (context.site?.directory) {
    const out = join(context.site.directory, LEDGER_FILE);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${yamlStringify(ledger)}`, "utf-8");
  }

  return diagnosticsResult(command, diagnostics);
}

export async function runContentFreshnessReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.freshness.report";
  const { ledger } = await computeFreshness(context);

  if (context.outputFormat === "pretty") {
    context.logger.section("content.freshness.report");
    const s = ledger.summary;
    context.logger.info(
      `fresh ${s.fresh} · review-due ${s["review-due"]} · expiring-soon ${s["expiring-soon"]} · expired ${s.expired} · unsourced ${s.unsourced}`,
    );
    for (const e of ledger.entries.filter((x) => x.state !== "fresh")) {
      context.logger.info(
        `  ${e.state}: ${e.subject}${e.validUntil ? ` (validUntil ${e.validUntil})` : ""}`,
      );
    }
  }

  return passResult(
    command,
    `content.freshness.report: ${ledger.entries.length} claim(s) evaluated`,
  );
}
