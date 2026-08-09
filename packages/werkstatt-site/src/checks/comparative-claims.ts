/*
<MODULE_CONTRACT>
<purpose>Validate comparative commercial CKL claims and their deploy-blocking review policy.</purpose>
<non-goals>
  <item>Do not scrape competitor pages or make legal advertising judgments.</item>
  <item>Do not maintain site-specific competitor-name regexes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0323: add comparative.claim.validate.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { recordClaimsSchema } from "@warpgogol/werkstatt-site/share/schemas";
import { addDuration } from "@warpgogol/werkstatt-site/share/knowledge/freshness";
import { parseNdjson, type ClaimEvent } from "@warpgogol/werkstatt-site/share/knowledge/ledger";
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
import { loadSourceDescriptors } from "./content-source-binding.ts";

const COMMAND = "comparative.claim.validate";
const LEDGER_FILE = "src/content/ledger/claims.ndjson";
const MAX_REVIEW_DAYS = 92;
const BROAD_ABSOLUTE =
  /\b(?:always|never|all|none|no export|no support|keine laufende betreuung|kein export|immer|alle|nie)\b/i;

function diagnostic(
  ruleId: "CMP-01" | "CMP-02" | "CMP-03" | "CMP-04" | "CMP-05" | "CMP-06",
  severity: Diagnostic["severity"],
  message: string,
  file: string,
  line: number,
  fixHint?: string,
): Diagnostic {
  return { ruleId, severity, file, line, message, ...(fixHint ? { fixHint } : {}) };
}

function subjectFor(sidecarRelFile: string, fieldPath: string): string {
  const stem = sidecarRelFile
    .replace(/^apps\/[^/]+\/src\/content\//, "")
    .replace(/\.claims\.yaml$/, "");
  return `${stem}#${fieldPath}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number | null {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

async function readLedger(appDir: string): Promise<ClaimEvent[]> {
  const file = join(appDir, LEDGER_FILE);
  if (!(await pathExists(file))) return [];
  try {
    return parseNdjson(await readFile(file, "utf-8"));
  } catch {
    return [];
  }
}

function hasCurrentVerification(
  events: readonly ClaimEvent[],
  subject: string,
  dueAt: string,
): boolean {
  return events.some(
    (event) =>
      event.subject === subject &&
      event.asOf >= dueAt &&
      (event.event === "verify-noop" ||
        event.event === "verify-update" ||
        event.event === "retire"),
  );
}

export async function runComparativeClaimValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const appDir = context.site?.directory;
  if (!appDir) {
    return diagnosticsResult(COMMAND, [
      diagnostic("CMP-01", "error", `${COMMAND} must run inside an app context.`, "", 1),
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  const paths = getContentDisciplinePaths(context);
  const descriptors = await loadSourceDescriptors(context.workspaceRoot);
  const ledger = await readLedger(appDir);
  const today = todayIso();

  for (const sidecarPath of await collectClaimSidecars(paths.businessDirectory)) {
    const relFile = toPosix(context.workspaceRoot, sidecarPath);
    const raw = await readFile(sidecarPath, "utf-8");
    const parsedYaml = parseYaml(raw) ?? {};
    const parsed = recordClaimsSchema.safeParse(parsedYaml);
    if (!parsed.success) {
      const mentionsComparative = raw.includes("comparative-commercial");
      if (mentionsComparative) {
        diagnostics.push(
          diagnostic(
            "CMP-01",
            "error",
            "comparative claim sidecar does not match the claim schema.",
            relFile,
            1,
            "Run content.claim.validate for the precise schema path.",
          ),
        );
      }
      continue;
    }

    for (const [fieldPath, claim] of Object.entries(parsed.data)) {
      if (claim.claimClass !== "comparative-commercial") continue;
      const line = keyLine(raw, fieldPath);
      const subject = subjectFor(relFile, fieldPath);

      if (!claim.sourceRef || !descriptors.byId.has(claim.sourceRef)) {
        diagnostics.push(
          diagnostic(
            "CMP-02",
            "error",
            `comparative claim sourceRef "${claim.sourceRef ?? "(missing)"}" does not resolve.`,
            relFile,
            line,
            "Add or fix integrations/truth-sources/<source>.yaml.",
          ),
        );
      }

      if (
        !claim.publicDisclosure?.showStandDate ||
        !/\bStand\b/i.test(claim.publicDisclosure.label)
      ) {
        diagnostics.push(
          diagnostic(
            "CMP-03",
            "error",
            "comparative claim publicDisclosure must show a Stand date.",
            relFile,
            line,
          ),
        );
      }

      if (claim.reviewEvery) {
        const dueAt = addDuration(claim.asOf, claim.reviewEvery);
        const reviewDays = dueAt ? daysBetween(claim.asOf, dueAt) : null;
        if (reviewDays === null || reviewDays > MAX_REVIEW_DAYS) {
          diagnostics.push(
            diagnostic(
              "CMP-01",
              "error",
              "comparative claim reviewEvery must be no longer than P3M.",
              relFile,
              line,
            ),
          );
        }
        if (dueAt && dueAt <= today && !hasCurrentVerification(ledger, subject, dueAt)) {
          diagnostics.push(
            diagnostic(
              "CMP-05",
              "error",
              `comparative claim review is due (${dueAt}) without a current verification ledger event.`,
              relFile,
              line,
              "Append verify-noop, verify-update, or retire after real source review.",
            ),
          );
        }
      }

      if (
        claim.claimKind === "third-party-price" &&
        (!claim.value?.currency || !claim.value.unit)
      ) {
        diagnostics.push(
          diagnostic(
            "CMP-01",
            "error",
            "third-party-price comparative claims require value.currency and value.unit.",
            relFile,
            line,
          ),
        );
      }

      if (claim.statement && BROAD_ABSOLUTE.test(claim.statement)) {
        diagnostics.push(
          diagnostic(
            "CMP-06",
            "warning",
            "comparative claim uses broad absolute wording; keep it source-scoped.",
            relFile,
            line,
          ),
        );
      }
    }
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
