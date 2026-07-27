/*
<MODULE_CONTRACT>
<purpose>
RFC-0217: content.claim.ledger.append / query / project. The append-only
Claim Ledger lives at src/content/ledger/claims.ndjson. append adds an
immutable event line; query answers as-of + lineage questions; project
emits the temporal knowledge graph (src/knowledge.generated.yaml) and
temporal SEO metadata (src/seo/temporal.generated.yaml). Integrity
Diagnostics CKL-LEDG-01/02 surface broken lineage as warnings.
</purpose>
<non-goals>
  <item>Do not rewrite or truncate the ledger file.</item>
  <item>Temporal SEO page-claim mapping is claim-subject-prefix based (Phase 1); RFC-0162/0163 integration is Phase 3.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0217: initial Claim Ledger commands.</item>
</CHANGE_SUMMARY>
*/

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildLineage,
  parseNdjson,
  projectGraph,
  projectTemporalSeo,
  queryAsOf,
  serializeEvent,
  stableEventId,
  type ClaimEvent,
  type ClaimEventKind,
} from "@warpgogol/share/knowledge/ledger";
import type { ClaimProvenanceKind } from "@warpgogol/share/knowledge/claim";
import { hashSourceValue } from "@warpgogol/share/knowledge/derivation";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { writeFileIfChanged } from "@warpgogol/site-kernel";
import { stringify as yamlStringify } from "yaml";
import { diagnosticsResult, failResult, passResult } from "./result-helpers.ts";
import { pathExists } from "./content-discipline.ts";

const LEDGER_FILE = "src/content/ledger/claims.ndjson";
const GRAPH_FILE = "src/knowledge.generated.yaml";
const TEMPORAL_SEO_FILE = "src/seo/temporal.generated.yaml";
/** Values longer than this are stored as a hash, not inline, in the ledger. */
const LARGE_VALUE_CHARS = 200;

async function readLedger(appDir: string): Promise<ClaimEvent[]> {
  const file = join(appDir, LEDGER_FILE);
  if (!(await pathExists(file))) return [];
  const text = await readFile(file, "utf-8");
  try {
    return parseNdjson(text);
  } catch {
    return [];
  }
}

/** Derive a simple page → subjects mapping from subject prefixes (Phase 1). */
function buildPageClaimsMap(events: ClaimEvent[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const subjects = [...new Set(events.map((e) => e.subject))];
  for (const subject of subjects) {
    // Use the file stem as a proxy page route.
    // e.g. "business/de/offer#priceMonthly" → page "de/offer"
    const stem = subject.replace(/^business\//, "").replace(/#.*$/, "");
    const list = map.get(stem) ?? [];
    list.push(subject);
    map.set(stem, list);
  }
  return map;
}

export async function runClaimLedgerAppend(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.claim.ledger.append";
  const siteName = context.site?.name;
  if (!siteName) return failResult(command, ["--site is required"]);

  const subject = input.flags["subject"] as string | undefined;
  const actor = (input.flags["actor"] as string | undefined) ?? "agent:unknown";
  const asOf =
    (input.flags["as-of"] as string | undefined) ?? new Date().toISOString().slice(0, 10);
  const eventKind = ((input.flags["event"] as string | undefined) ?? "genesis") as ClaimEventKind;
  const provenance = ((input.flags["provenance"] as string | undefined) ??
    "asserted") as ClaimProvenanceKind;
  const rawValue = input.flags["value"] as string | undefined;
  const sourceRef = input.flags["source-ref"] as string | undefined;
  const supersedes = input.flags["supersedes"] as string | undefined;

  if (!subject)
    return failResult(command, ["--subject is required (e.g. business/de/offer#priceMonthly)"]);

  // Large prose is stored as a hash, not inline (RFC-0217 ClaimEvent contract).
  const isLargeProse = rawValue !== undefined && rawValue.length > LARGE_VALUE_CHARS;
  const value = isLargeProse ? undefined : rawValue;
  const valueHash = isLargeProse ? hashSourceValue(rawValue!) : undefined;
  // The id's value component is whatever distinguishes this event's payload.
  const identityComponent = value ?? valueHash;

  const id = stableEventId(subject, asOf, eventKind, actor, identityComponent);
  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", siteName);
  const existing = await readLedger(appDir);
  if (existing.some((e) => e.id === id)) {
    context.logger.info(`Event ${id} already in ledger — idempotent skip.`);
    return passResult(command, `already present: ${id}`);
  }

  const event: ClaimEvent = {
    id,
    ts: new Date().toISOString(),
    subject,
    value,
    valueHash,
    provenance,
    sourceRef,
    asOf,
    supersedes,
    actor,
    event: eventKind,
  };
  // Strip undefined keys for compact NDJSON.
  for (const key of Object.keys(event) as (keyof ClaimEvent)[]) {
    if (event[key] === undefined) delete event[key];
  }

  const ledgerPath = join(appDir, LEDGER_FILE);
  await mkdir(dirname(ledgerPath), { recursive: true });
  // Append a single line — never truncate or rewrite.
  await appendFile(ledgerPath, `${serializeEvent(event)}\n`, "utf-8");
  context.logger.success(`Appended event ${id} to ledger (${eventKind} of ${subject})`);
  return passResult(command, `appended ${id}`);
}

export async function runClaimLedgerQuery(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.claim.ledger.query";
  const siteName = context.site?.name;
  if (!siteName) return failResult(command, ["--site is required"]);

  const subject = input.flags["subject"] as string | undefined;
  const asOfFlag = input.flags["as-of"] as string | undefined;
  const lineage = input.flags["lineage"] !== undefined;

  if (!subject) return failResult(command, ["--subject is required"]);

  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", siteName);
  const events = await readLedger(appDir);

  if (lineage) {
    const lin = buildLineage(events, subject);
    if (!lin) {
      context.logger.info(`No ledger entries for subject "${subject}"`);
      return passResult(command, "no entries");
    }
    if (context.outputFormat === "pretty") {
      context.logger.section(`Lineage: ${subject}`);
      for (const evt of lin.history) {
        context.logger.info(
          `  [${evt.asOf}] ${evt.event.padEnd(14)} ${evt.value ?? "(no value)"}  actor:${evt.actor}  id:${evt.id}`,
        );
      }
    }
    return passResult(command, `${lin.history.length} event(s)`);
  }

  const queryDate = asOfFlag ?? new Date().toISOString().slice(0, 10);
  const found = queryAsOf(events, subject, queryDate);
  if (!found) {
    context.logger.info(`No entry for "${subject}" as of ${queryDate}`);
    return passResult(command, "not found");
  }
  if (context.outputFormat === "pretty") {
    context.logger.info(
      `  ${subject} as of ${queryDate}: "${found.value ?? "(none)"}"  asOf:${found.asOf}  ${found.provenance}  actor:${found.actor}`,
    );
  }
  return passResult(command, `value="${found.value ?? ""}"`);
}

export async function runClaimLedgerProject(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "content.claim.ledger.project";
  const siteName = context.site?.name;
  if (!siteName) return failResult(command, ["--site is required"]);

  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", siteName);
  const events = await readLedger(appDir);

  const diagnostics: Diagnostic[] = [];

  // CKL-LEDG-01: subjects with events but no genesis.
  const bySubject = new Map<string, ClaimEvent[]>();
  for (const e of events) {
    const list = bySubject.get(e.subject) ?? [];
    list.push(e);
    bySubject.set(e.subject, list);
  }
  for (const [subj, evts] of bySubject) {
    if (!evts.some((e) => e.event === "genesis")) {
      diagnostics.push({
        ruleId: "CKL-LEDG-01",
        severity: "warning",
        file: LEDGER_FILE,
        line: 1,
        message: `Subject "${subj}" has no genesis event in the ledger`,
        fixHint: `Append a genesis event: content.claim.ledger.append --subject "${subj}" --event genesis`,
      });
    }
  }

  // CKL-LEDG-02: supersedes references a non-existent event id.
  const allIds = new Set(events.map((e) => e.id));
  for (const e of events) {
    if (e.supersedes && !allIds.has(e.supersedes)) {
      diagnostics.push({
        ruleId: "CKL-LEDG-02",
        severity: "warning",
        file: LEDGER_FILE,
        line: 1,
        message: `Event ${e.id} references supersedes="${e.supersedes}" which does not exist in the ledger`,
        fixHint: "Ensure the superseded event id is correct, or remove the supersedes field.",
      });
    }
  }

  // Project the knowledge graph.
  const graph = projectGraph(events, siteName);
  const graphPath = join(appDir, GRAPH_FILE);
  await mkdir(dirname(graphPath), { recursive: true });
  await writeFileIfChanged(graphPath, `${yamlStringify(graph)}`);

  // Project temporal SEO.
  const pageClaimsMap = buildPageClaimsMap(events);
  const temporalSeo = projectTemporalSeo(events, pageClaimsMap);
  const seoObj = {
    generatedAt: null,
    site: siteName,
    pages: temporalSeo,
  };
  const seoPath = join(appDir, TEMPORAL_SEO_FILE);
  await mkdir(dirname(seoPath), { recursive: true });
  await writeFileIfChanged(seoPath, `${yamlStringify(seoObj)}`);

  context.logger.info(
    `content.claim.ledger.project: ${graph.nodes.length} node(s), ${temporalSeo.length} page(s) with temporal SEO`,
  );

  return diagnosticsResult(command, diagnostics);
}
