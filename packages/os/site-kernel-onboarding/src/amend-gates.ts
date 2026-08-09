/*
<MODULE_CONTRACT>
<purpose>RFC-0135 amend gates: cumulative coverage ledger (content.coverage.delta),
strengthen-merge planner with similarity + voice guards (amend.atoms.merge), and the
immutable signed provenance trail (amend.provenance.append / amend.provenance.validate).
Hosted in site-kernel-onboarding because it already depends on content/codegen/passport;
site-kernel-checks cannot host them without a circular dependency (onboarding → checks).</purpose>
<non-goals>
  <item>Do not orchestrate phases — that is RFC-0136.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0135: Add amend coverage delta, atom merge planner, and provenance trail.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { signBytes, verifyBytes } from "@warpgogol/passport/sign";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import type { DiscoveredSiteWorkspace } from "@warpgogol/site-kernel";
import {
  readAmendInputManifest,
  readFlag,
  type AmendInputManifest,
  type AmendProvenanceChange,
  type AmendProvenanceRecord,
} from "./amend.ts";

/** DiscoveredSiteWorkspace exposes only `directory`; derive the roots amend needs. */
function appRootDir(app: DiscoveredSiteWorkspace): string {
  return app.directory;
}
function appContentDir(app: DiscoveredSiteWorkspace): string {
  return join(app.directory, "src", "content");
}

const HARD_SIMILARITY = 0.85; // duplicate — drop
const REVIEW_SIMILARITY = 0.6; // near-duplicate — pause for human merge decision (RFC-0136 П-6)

interface Finding {
  ruleId: string;
  severity: "info" | "warn" | "error";
  file?: string;
  message: string;
}

interface CoverageLedgerEntry {
  atomId: string;
  sourceId: string;
  version: string;
  atomHash: string;
  batch: string;
  pageId: string;
  acceptedAt: string;
  supersededBy?: string;
}

interface CoverageLedger {
  version: 1;
  atoms: CoverageLedgerEntry[];
}

interface BatchAtom {
  id: string;
  sourceId?: string;
  version?: string;
  pageId?: string;
  text?: string;
  intent?: string;
}

function result(
  command: string,
  findings: Finding[],
  extra: Record<string, unknown> = {},
): KernelCommandResult {
  const errors = findings.filter((finding) => finding.severity === "error");
  const status =
    errors.length > 0 ? "fail" : findings.some((f) => f.severity === "warn") ? "warn" : "pass";
  return {
    data: { command, status, findings, ...extra },
    exitCode: errors.length > 0 ? 1 : 0,
    summary:
      errors.length > 0
        ? `${command}: ${errors.length} violation(s)`
        : `${command}: OK${findings.length ? ` (${findings.length} note(s))` : ""}`,
  };
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function _pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readArtifact(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Returns the body YAML of a two-document onboarding artifact (header `---` body), or the whole source. */
function artifactBody(source: string): string {
  const match = source.match(/^---\s*$/m);
  if (!match || match.index === undefined) return source;
  return source.slice(match.index + match[0].length).replace(/^\s*\n/, "");
}

function readBatchAtoms(raw: string): BatchAtom[] {
  const parsed = YAML.parse(artifactBody(raw)) as { atoms?: BatchAtom[] } | null;
  return parsed?.atoms ?? [];
}

export function splitMarkdownParagraphs(source: string): string[] {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "")
    .replace(/^(?:[ \t]*\n)+/, "")
    .split(/\n[ \t]*\n+/)
    .map((chunk) => chunk.replace(/^\n+|\n+$/g, ""))
    .filter((chunk) => chunk.replace(/\s+/g, "").length > 0)
    .filter((chunk) => chunk.replace(/\s+/g, " ").trim().length >= 24);
}

/** Compares newer version > older version using numeric dotted segments. Exported for tests. */
export function isNewerVersion(candidate: string, existing: string): boolean {
  const toParts = (value: string) =>
    value
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number(n) || 0);
  const a = toParts(candidate);
  const b = toParts(existing);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

/** Jaccard token overlap — the same family of signal as section.similarity.report. */
export function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const token of sa) if (sb.has(token)) intersection += 1;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function loadPages(contentDirectory: string): Promise<Set<string>> {
  try {
    const { manifest } = await loadSystemManifest(contentDirectory);
    return new Set((manifest.pages ?? []).map((page) => page.pageId));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// content.coverage.delta
// ---------------------------------------------------------------------------

export async function runContentCoverageDelta(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "content.coverage.delta";
  const app = context.site;
  const batch = readFlag(input, "batch");

  if (!app) {
    return result(command, [
      {
        ruleId: "amend.coverage.no-app",
        severity: "error",
        message: `${command} requires an --site target.`,
      },
    ]);
  }
  if (!batch) {
    return result(command, [
      {
        ruleId: "amend.coverage.no-batch",
        severity: "error",
        message: `${command} requires --batch amend-<NNN>.`,
      },
    ]);
  }

  const atomsPath = join(
    context.workspaceRoot,
    "onboarding",
    ".output",
    batch,
    "a3-author",
    "atoms.yaml",
  );
  const atomsRaw = await readArtifact(atomsPath);
  if (!atomsRaw) {
    return result(command, [
      {
        ruleId: "amend.coverage.missing-atoms",
        severity: "error",
        file: `onboarding/.output/${batch}/a3-author/atoms.yaml`,
        message: "Batch atoms.yaml not found; the a3-author phase must produce it.",
      },
    ]);
  }

  const findings: Finding[] = [];
  const batchAtoms = readBatchAtoms(atomsRaw);
  const manifest = await readAmendInputManifest(context.workspaceRoot, batch);
  const sourceVersions = new Map<string, string>();
  for (const file of manifest?.files ?? []) {
    if (file.sourceId && file.version) sourceVersions.set(file.sourceId, file.version);
  }

  const ledgerPath = join(appRootDir(app), "provenance", "coverage-ledger.yaml");
  const ledgerRaw = await readArtifact(ledgerPath);
  const ledger: CoverageLedger = ledgerRaw
    ? (YAML.parse(ledgerRaw) as CoverageLedger)
    : { version: 1, atoms: [] };
  const before = JSON.stringify(ledger.atoms);

  const acceptedAt = new Date().toISOString();
  for (const atom of batchAtoms) {
    if (!atom.sourceId) {
      findings.push({
        ruleId: "amend.coverage.atom-no-source",
        severity: "error",
        file: `onboarding/.output/${batch}/a3-author/atoms.yaml`,
        message: `Atom '${atom.id}' has no sourceId; cannot record it in the cumulative ledger.`,
      });
      continue;
    }
    const version = atom.version ?? sourceVersions.get(atom.sourceId) ?? "v0";
    const atomHash = sha256(atom.text ?? atom.id);
    const exists = ledger.atoms.some(
      (entry) =>
        entry.sourceId === atom.sourceId &&
        entry.version === version &&
        entry.atomHash === atomHash,
    );
    if (exists) continue; // idempotent: already on board.

    // Supersession (П-7): a higher version for the same sourceId supersedes prior atoms.
    for (const entry of ledger.atoms) {
      if (
        entry.sourceId === atom.sourceId &&
        !entry.supersededBy &&
        isNewerVersion(version, entry.version)
      ) {
        entry.supersededBy = atom.id;
      }
    }
    ledger.atoms.push({
      atomId: atom.id,
      sourceId: atom.sourceId,
      version,
      atomHash,
      batch,
      pageId: atom.pageId ?? "unknown",
      acceptedAt,
    });
  }

  if (findings.some((f) => f.severity === "error")) {
    return result(command, findings, { batch });
  }

  const after = JSON.stringify(ledger.atoms);
  if (after !== before) {
    await mkdir(join(appRootDir(app), "provenance"), { recursive: true });
    const header = "# RFC-0135 cumulative coverage ledger — single owner: content.coverage.delta\n";
    await writeFile(ledgerPath, header + YAML.stringify(ledger), "utf8");
  }

  return result(command, findings, {
    batch,
    atomCount: ledger.atoms.length,
    changed: after !== before,
  });
}

// ---------------------------------------------------------------------------
// amend.atoms.merge
// ---------------------------------------------------------------------------

export async function runAmendAtomsMerge(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "amend.atoms.merge";
  const app = context.site;
  const batch = readFlag(input, "batch");
  const pageId = readFlag(input, "page");

  if (!app) {
    return result(command, [
      {
        ruleId: "amend.merge.no-app",
        severity: "error",
        message: `${command} requires an --site target.`,
      },
    ]);
  }
  if (!batch || !pageId) {
    return result(command, [
      {
        ruleId: "amend.merge.no-args",
        severity: "error",
        message: `${command} requires --batch amend-<NNN> and --page <pageId>.`,
      },
    ]);
  }

  const manifest = await readAmendInputManifest(context.workspaceRoot, batch);
  if (!manifest) {
    return result(command, [
      {
        ruleId: "amend.merge.no-manifest",
        severity: "error",
        file: `onboarding/.output/${batch}/a0-intake/input-manifest.json`,
        message: "Batch manifest not found; run amend.input.validate first.",
      },
    ]);
  }

  const sources = manifest.files.filter(
    (file) => file.pageId === pageId && file.intent === "strengthen",
  );
  if (sources.length === 0) {
    return result(command, [
      {
        ruleId: "amend.merge.no-strengthen-source",
        severity: "error",
        message: `No strengthen source in ${batch} targets pageId '${pageId}'. amend.atoms.merge only runs on strengthen sources.`,
      },
    ]);
  }

  // Guard: pageId must already exist in system.md (strengthen never edits system.md pages[]).
  const pages = await loadPages(appContentDir(app));
  if (!pages.has(pageId)) {
    return result(command, [
      {
        ruleId: "amend.merge.requires-system-change",
        severity: "error",
        message: `pageId '${pageId}' is not in system.md pages[]. A strengthen source must not require a system.md change — reclassify it as new-route.`,
      },
    ]);
  }

  const findings: Finding[] = [];
  const existingText = await readExistingPageText(appContentDir(app), pageId);
  const forbiddenPhrases = await readVoiceForbidden(context.workspaceRoot);
  const accepted: BatchAtom[] = [];
  const dropped: string[] = [];
  let candidateIndex = 0;

  for (const source of sources) {
    const raw = await readArtifact(join(context.workspaceRoot, source.path));
    if (!raw) continue;
    const paragraphs = splitMarkdownParagraphs(raw);

    for (const paragraph of paragraphs) {
      candidateIndex += 1;
      const atomId = `${pageId}.${source.sourceId}.${String(candidateIndex).padStart(3, "0")}`;
      const sim = jaccardSimilarity(paragraph, existingText);
      if (sim >= HARD_SIMILARITY) {
        dropped.push(atomId);
        findings.push({
          ruleId: "amend.merge.duplicate-dropped",
          severity: "info",
          message: `Candidate '${atomId}' dropped: similarity ${sim.toFixed(2)} ≥ ${HARD_SIMILARITY} with existing page content.`,
        });
        continue;
      }
      if (sim >= REVIEW_SIMILARITY) {
        findings.push({
          ruleId: "amend.merge.review-band",
          severity: "warn",
          message: `Candidate '${atomId}' at similarity ${sim.toFixed(2)} is in the review band [${REVIEW_SIMILARITY}, ${HARD_SIMILARITY}); pause for a human merge decision (RFC-0136 П-6).`,
        });
      }
      const forbidden = forbiddenPhrases.find((phrase) => paragraph.toLowerCase().includes(phrase));
      if (forbidden) {
        findings.push({
          ruleId: "amend.merge.voice-violation",
          severity: "error",
          message: `Candidate '${atomId}' contains forbidden phrase '${forbidden}' (voice-profile).`,
        });
        continue;
      }
      accepted.push({
        id: atomId,
        sourceId: source.sourceId,
        version: source.version,
        pageId,
        text: paragraph,
        intent: "strengthen",
      });
    }
  }

  // Emit the batch atoms + merge plan (the a3-author workflow applies the page edit).
  const outDir = join(context.workspaceRoot, "onboarding", ".output", batch, "a3-author");
  await mkdir(outDir, { recursive: true });
  const header = {
    phase: "a3-author",
    derivedFromInputHash: manifest.inputHash,
    generatedAt: new Date().toISOString(),
    generator: command,
  };
  const merged = mergeIntoExistingAtoms(await readArtifact(join(outDir, "atoms.yaml")), accepted);
  await writeFile(
    join(outDir, "atoms.yaml"),
    `${YAML.stringify(header)}---\n${YAML.stringify({ atoms: merged })}`,
    "utf8",
  );
  await writeFile(
    join(outDir, `merge-plan-${pageId}.md`),
    renderMergePlan(header, pageId, accepted, dropped),
    "utf8",
  );

  return result(command, findings, {
    batch,
    pageId,
    accepted: accepted.length,
    dropped: dropped.length,
  });
}

function mergeIntoExistingAtoms(existingRaw: string | null, accepted: BatchAtom[]): BatchAtom[] {
  const existing = existingRaw ? readBatchAtoms(existingRaw) : [];
  const byId = new Map(existing.map((atom) => [atom.id, atom]));
  for (const atom of accepted) byId.set(atom.id, atom); // idempotent upsert by id
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function renderMergePlan(
  header: Record<string, string>,
  pageId: string,
  accepted: BatchAtom[],
  dropped: string[],
): string {
  const lines = [
    "---",
    YAML.stringify(header).trimEnd(),
    "---",
    "",
    `# Merge plan — ${pageId}`,
    "",
    `Accepted ${accepted.length} atom(s); dropped ${dropped.length} duplicate(s).`,
    "",
    "## Accepted atoms (apply additively to the existing page — never replace a block)",
    "",
    ...accepted.map((atom) => `- \`${atom.id}\` — ${atom.text ?? ""}`),
    "",
    "## Dropped (duplicate of existing content)",
    "",
    ...dropped.map((id) => `- \`${id}\``),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function readExistingPageText(contentDirectory: string, pageId: string): Promise<string> {
  const dir = join(contentDirectory, "pages");
  const collected: string[] = [];
  try {
    const langs = await readdir(dir, { withFileTypes: true });
    for (const lang of langs) {
      if (!lang.isDirectory()) continue;
      const files = await readdir(join(dir, lang.name));
      for (const file of files) {
        if (file.toLowerCase().includes(pageId.toLowerCase())) {
          const raw = await readArtifact(join(dir, lang.name, file));
          if (raw) collected.push(raw);
        }
      }
    }
  } catch {
    /* page dir may not exist yet */
  }
  return collected.join("\n");
}

async function readVoiceForbidden(workspaceRoot: string): Promise<string[]> {
  const raw = await readArtifact(
    join(workspaceRoot, "onboarding", ".output", "04-author", "voice-profile.yaml"),
  );
  if (!raw) return [];
  try {
    const parsed = YAML.parse(artifactBody(raw)) as {
      forbidden?: string[];
      forbiddenPhrases?: string[];
    } | null;
    return (parsed?.forbidden ?? parsed?.forbiddenPhrases ?? []).map((p) => p.toLowerCase());
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// amend.provenance.append / amend.provenance.validate
// ---------------------------------------------------------------------------

function canonicalRecordBody(record: Omit<AmendProvenanceRecord, "signature">): string {
  return JSON.stringify(record);
}

function stripSignature(record: AmendProvenanceRecord): Omit<AmendProvenanceRecord, "signature"> {
  const { signature: _signature, ...rest } = record;
  return rest;
}

async function loadCoverageLedger(appRoot: string): Promise<CoverageLedger> {
  const raw = await readArtifact(join(appRoot, "provenance", "coverage-ledger.yaml"));
  if (!raw) return { version: 1, atoms: [] };
  return (YAML.parse(raw) as CoverageLedger) ?? { version: 1, atoms: [] };
}

function privateKeyHex(): string | null {
  return process.env["PASSPORT_SIGNING_KEY"] ?? null;
}

async function publicKeyHex(appRoot: string): Promise<string | null> {
  const raw = await readArtifact(
    join(appRoot, "public", ".well-known", "cosmic-passport-key.json"),
  );
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { publicKeyHex?: string };
    return parsed.publicKeyHex ?? null;
  } catch {
    return null;
  }
}

function buildChanges(
  manifest: AmendInputManifest,
  ledger: CoverageLedger,
): AmendProvenanceChange[] {
  const byPage = new Map<string, AmendProvenanceChange>();
  for (const file of manifest.files) {
    if (!file.pageId || !file.intent) continue;
    const atomIds = ledger.atoms
      .filter((entry) => entry.batch === manifest.batch && entry.pageId === file.pageId)
      .map((entry) => entry.atomId);
    const existing = byPage.get(file.pageId);
    if (existing) {
      existing.atomIds = [...new Set([...existing.atomIds, ...atomIds])];
    } else {
      byPage.set(file.pageId, { intent: file.intent, pageId: file.pageId, atomIds });
    }
  }
  return [...byPage.values()];
}

export async function runAmendProvenanceAppend(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "amend.provenance.append";
  const app = context.site;
  const batch = readFlag(input, "batch");

  if (!app) {
    return result(command, [
      {
        ruleId: "amend.provenance.no-app",
        severity: "error",
        message: `${command} requires an --site target.`,
      },
    ]);
  }
  if (!batch) {
    return result(command, [
      {
        ruleId: "amend.provenance.no-batch",
        severity: "error",
        message: `${command} requires --batch amend-<NNN>.`,
      },
    ]);
  }

  const manifest = await readAmendInputManifest(context.workspaceRoot, batch);
  if (!manifest) {
    return result(command, [
      {
        ruleId: "amend.provenance.no-manifest",
        severity: "error",
        message: `Batch manifest for ${batch} not found; run amend.input.validate first.`,
      },
    ]);
  }

  const findings: Finding[] = [];
  const ledger = await loadCoverageLedger(appRootDir(app));
  const sources = manifest.files
    .filter((file) => file.sourceId && file.version)
    .map((file) => ({
      sourceId: file.sourceId as string,
      version: file.version as string,
      file: file.path,
      sha256: file.sha256,
    }));

  const unsigned: Omit<AmendProvenanceRecord, "signature"> = {
    version: 1,
    batch,
    targetApp: app.name,
    inputHash: manifest.inputHash,
    acceptedAt: new Date().toISOString(),
    sources,
    changes: buildChanges(manifest, ledger),
  };

  const key = privateKeyHex();
  let signature = "";
  if (key) {
    signature = await signBytes(key, new TextEncoder().encode(canonicalRecordBody(unsigned)));
  } else {
    findings.push({
      ruleId: "amend.provenance.unsigned",
      severity: "warn",
      message:
        "PASSPORT_SIGNING_KEY not set; record written without a signature (structural-only audit until signed).",
    });
  }
  const record: AmendProvenanceRecord = { ...unsigned, signature };

  const recordDir = join(appRootDir(app), "provenance", "amend");
  const recordPath = join(recordDir, `${batch}.yaml`);
  const existingRaw = await readArtifact(recordPath);
  if (existingRaw) {
    // Immutable: identical body is a no-op; different body is an error.
    const existing = YAML.parse(existingRaw) as AmendProvenanceRecord;
    if (canonicalRecordBody(stripSignature(existing)) === canonicalRecordBody(unsigned)) {
      return result(command, findings, {
        batch,
        written: false,
        note: "idempotent: record already present",
      });
    }
    return result(command, [
      {
        ruleId: "amend.provenance.immutable",
        severity: "error",
        file: `apps/${app.name}/provenance/amend/${batch}.yaml`,
        message: `A provenance record for ${batch} already exists with different content. Provenance records are immutable; use a new batch id.`,
      },
    ]);
  }

  await mkdir(recordDir, { recursive: true });
  await writeFile(recordPath, `${YAML.stringify(record)}\n`, "utf8");
  await appendProvenanceRollup(recordDir, record);

  return result(command, findings, { batch, written: true });
}

async function appendProvenanceRollup(
  recordDir: string,
  record: AmendProvenanceRecord,
): Promise<void> {
  const ledgerPath = join(recordDir, "ledger.md");
  const marker = "# Amend provenance — newest first\n\n";
  const existing = (await readArtifact(ledgerPath)) ?? marker;
  const body = existing.startsWith(marker) ? existing.slice(marker.length) : existing;
  if (body.includes(record.batch)) return; // idempotent
  const pages = record.changes.map((change) => `${change.pageId} (${change.intent})`).join(", ");
  const line = `- ${record.batch} · ${record.acceptedAt} · ${pages} · ${record.inputHash}\n`;
  await writeFile(ledgerPath, marker + line + body, "utf8");
}

export async function runAmendProvenanceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "amend.provenance.validate";
  const app = context.site;
  if (!app) {
    return result(command, [
      {
        ruleId: "amend.provenance.no-app",
        severity: "error",
        message: `${command} requires an --site target.`,
      },
    ]);
  }

  const recordDir = join(appRootDir(app), "provenance", "amend");
  let recordFiles: string[] = [];
  try {
    recordFiles = (await readdir(recordDir)).filter((file) => /^amend-\d{3,}\.yaml$/.test(file));
  } catch {
    return result(command, [], { records: 0 }); // no amend records yet — nothing to validate.
  }

  const findings: Finding[] = [];
  const pubKey = await publicKeyHex(appRootDir(app));
  const pageIds = await loadPages(appContentDir(app));

  for (const file of recordFiles) {
    const raw = await readArtifact(join(recordDir, file));
    if (!raw) continue;
    let record: AmendProvenanceRecord;
    try {
      record = YAML.parse(raw) as AmendProvenanceRecord;
    } catch (error) {
      findings.push({
        ruleId: "amend.provenance.parse",
        severity: "error",
        file: `apps/${app.name}/provenance/amend/${file}`,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (!/^sha256:[0-9a-f]{64}$/.test(record.inputHash)) {
      findings.push({
        ruleId: "amend.provenance.bad-hash",
        severity: "error",
        file: `apps/${app.name}/provenance/amend/${file}`,
        message: `inputHash '${record.inputHash}' is not a well-formed sha256 digest.`,
      });
    }

    if (record.signature) {
      if (!pubKey) {
        findings.push({
          ruleId: "amend.provenance.no-key",
          severity: "warn",
          message: `No passport public key found; cannot verify signature for ${record.batch} (structural checks only).`,
        });
      } else if (
        !(await verifyBytes(
          pubKey,
          new TextEncoder().encode(canonicalRecordBody(stripSignature(record))),
          record.signature,
        ))
      ) {
        findings.push({
          ruleId: "amend.provenance.invalid-signature",
          severity: "error",
          file: `apps/${app.name}/provenance/amend/${file}`,
          message: `Signature verification failed for ${record.batch}.`,
        });
      }
    } else {
      findings.push({
        ruleId: "amend.provenance.unsigned",
        severity: "warn",
        message: `Provenance record ${record.batch} is unsigned.`,
      });
    }

    for (const change of record.changes) {
      if (pageIds.size > 0 && !pageIds.has(change.pageId)) {
        findings.push({
          ruleId: "amend.provenance.page-missing",
          severity: "error",
          file: `apps/${app.name}/provenance/amend/${file}`,
          message: `Provenance record ${record.batch} references pageId '${change.pageId}' which is no longer in system.md.`,
        });
      }
    }
  }

  return result(command, findings, { records: recordFiles.length });
}
