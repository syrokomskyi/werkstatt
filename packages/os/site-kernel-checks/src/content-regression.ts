/*
<MODULE_CONTRACT>
<purpose>
RFC-0732: content regression gate for resolved page content drift detection.
Snapshots resolved page content (block text after resolveReferencesDeep
substitution, prose body text, FAQ Q&A pairs) per-route, hashes it, and diffs
against a golden baseline stored in the cache clone. Content drift emits
CREG-01/CREG-02/CREG-03 diagnostics and gates mission.validate.
RFC-0734: content regression review manifest and apply workflow. Generates
a review.yaml with per-change golden/current values for operator review,
and applies accept/reject/fix decisions to update the golden snapshot.
CREG-04 workpiece mismatch, CREG-05 unreviewed drift on mission.close.
</purpose>
<non-goals>
  <item>Do not snapshot route metadata — that is behavior.snapshot.validate (SNAP-01).</item>
  <item>Do not check generated file determinism — that is generated.drift.validate (DRIFT-01).</item>
  <item>Do not judge content correctness — only detect CHANGE from golden baseline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0732: initial implementation.</item>
  <item>RFC-0734: add review.generate, apply handlers, CREG-04/CREG-05 rules, review YAML serialization.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import {
  writeFileIfChanged,
  buildGeneratedHeader,
  type CheckResult,
  type Diagnostic,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { byteHash, stableJsonHash } from "@warpgogol/fingerprint";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSemanticSiteModel, loadSystemManifest } from "@warpgogol/site-kernel-content";
import type { SemanticBlock, SemanticFaqEntry, SemanticPageModel } from "@warpgogol/share/semantic";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// Types (RFC-0732 TypeScript contracts)
// ---------------------------------------------------------------------------

export interface ContentRegressionBlock {
  id: string;
  blockType: string;
  heading: string;
  lead?: string;
  body?: string;
  items?: string[];
  hash: string;
}

export interface ContentRegressionFaqEntry {
  question: string;
  answer: string;
}

export interface ContentRegressionRoute {
  route: string;
  blocks: ContentRegressionBlock[];
  faq?: ContentRegressionFaqEntry[];
  hash: string;
}

export interface ContentRegressionSnapshot {
  schemaVersion: 1;
  systemId: string;
  contentHash: string;
  routes: ContentRegressionRoute[];
}

export interface ContentRegressionBlockDiff {
  blockId: string;
  fields: string[];
}

export interface ContentRegressionRouteDiff {
  route: string;
  changedBlocks: ContentRegressionBlockDiff[];
  faqChanged: boolean;
}

export interface ContentRegressionDiff {
  addedRoutes: string[];
  removedRoutes: string[];
  changedRoutes: ContentRegressionRouteDiff[];
}

// ---------------------------------------------------------------------------
// Types (RFC-0734 review manifest contracts)
// ---------------------------------------------------------------------------

export interface ContentRegressionReviewChange {
  id: string;
  route: string;
  kind: "block-field" | "added-route" | "removed-route" | "faq";
  blockId?: string;
  field?: string;
  golden: string | null;
  current: string | null;
  decision: "pending" | "accept" | "reject" | "fix";
  fixValue: string;
  note: string;
}

export interface ContentRegressionReview {
  schemaVersion: 1;
  systemId: string;
  missionId: string;
  generatedAt: string;
  goldenSnapshotHash: string;
  currentSnapshotHash: string;
  summary: {
    totalChanges: number;
    addedRoutes: number;
    removedRoutes: number;
    changedRoutes: number;
  };
  changes: ContentRegressionReviewChange[];
}

export interface ContentRegressionApplyResult {
  accepted: number;
  rejected: number;
  fixed: number;
  pending: number;
  goldenUpdated: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Cache clone path resolution (mirrors generated-files-validate.ts pattern)
// ---------------------------------------------------------------------------

interface RegistryMirror {
  path?: string;
}

interface RegistrySystem {
  id: string;
  mirrors?: RegistryMirror[];
  currentMission?: string;
}

interface RegistryFile {
  systems?: RegistrySystem[];
}

async function resolveCacheClonePath(
  workspaceRoot: string,
  systemId: string,
): Promise<string | null> {
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  try {
    const raw = await readFile(registryPath, "utf8");
    const registry = yamlParse(raw) as RegistryFile;
    const entry = registry.systems?.find((s) => s.id === systemId);
    if (!entry?.mirrors?.[0]?.path) return null;
    return resolve(workspaceRoot, entry.mirrors[0].path);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------

function blockToSnapshotBlock(block: SemanticBlock): ContentRegressionBlock {
  const snapshotBlock: ContentRegressionBlock = {
    id: block.id,
    blockType: block.blockType ?? "prose",
    heading: block.heading,
    hash: "",
  };
  // SemanticBlock uses `summary` — RFC contract uses `lead`
  if (block.summary !== undefined && block.summary !== "") {
    snapshotBlock.lead = block.summary;
  }
  if (block.body !== undefined && block.body !== "") {
    snapshotBlock.body = block.body;
  }
  // SemanticBlock items are Array<{ title, description? }> — RFC contract uses string[]
  if (block.items && block.items.length > 0) {
    snapshotBlock.items = block.items.map((item) =>
      JSON.stringify({ title: item.title, description: item.description ?? null }),
    );
  }
  snapshotBlock.hash = stableJsonHash({
    id: snapshotBlock.id,
    blockType: snapshotBlock.blockType,
    heading: snapshotBlock.heading,
    lead: snapshotBlock.lead,
    body: snapshotBlock.body,
    items: snapshotBlock.items,
  });
  return snapshotBlock;
}

function faqToSnapshotFaq(entries: SemanticFaqEntry[]): ContentRegressionFaqEntry[] {
  return entries.map((e) => ({ question: e.question, answer: e.answer }));
}

function pageToRoute(page: SemanticPageModel): ContentRegressionRoute {
  const blocks = page.blocks.map(blockToSnapshotBlock);
  const route: ContentRegressionRoute = {
    route: page.url,
    blocks,
    hash: "",
  };
  if (page.faqEntries && page.faqEntries.length > 0) {
    route.faq = faqToSnapshotFaq(page.faqEntries);
  }
  route.hash = stableJsonHash({
    route: route.route,
    blocks: blocks.map((b) => b.hash),
    faq: route.faq,
  });
  return route;
}

async function buildSnapshot(
  contentDir: string,
  systemId: string,
  languages: string[],
  siteUrl: string,
): Promise<ContentRegressionSnapshot> {
  const routes: ContentRegressionRoute[] = [];
  for (const lang of languages) {
    const semanticSite = await loadSemanticSiteModel({ contentDir, lang, siteUrl });
    for (const page of semanticSite.pages) {
      routes.push(pageToRoute(page));
    }
  }
  // Sort routes by path for deterministic ordering
  routes.sort((a, b) => a.route.localeCompare(b.route));
  const contentHash = byteHash(routes.map((r) => r.hash).join("\n"));
  return {
    schemaVersion: 1,
    systemId,
    contentHash,
    routes,
  };
}

// ---------------------------------------------------------------------------
// Snapshot serialization
// ---------------------------------------------------------------------------

function snapshotToYaml(
  snapshot: ContentRegressionSnapshot,
  ownerCommand: string,
  filePath: string,
): string {
  const header = buildGeneratedHeader({ ownerCommand, filePath });
  const body = yamlStringify(snapshot);
  return `${header}\n${body}`;
}

async function readGoldenSnapshot(
  cacheClonePath: string,
  systemId: string,
): Promise<ContentRegressionSnapshot | null> {
  const snapshotPath = join(
    cacheClonePath,
    ".cache",
    "content-regression",
    `${systemId}.snapshot.yaml`,
  );
  try {
    const raw = await readFile(snapshotPath, "utf8");
    const parsed = yamlParse(raw) as ContentRegressionSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.schemaVersion || !parsed.routes) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Diff logic
// ---------------------------------------------------------------------------

export function diffSnapshots(
  current: ContentRegressionSnapshot,
  golden: ContentRegressionSnapshot,
): ContentRegressionDiff {
  const currentRoutes = new Map(current.routes.map((r) => [r.route, r]));
  const goldenRoutes = new Map(golden.routes.map((r) => [r.route, r]));

  const addedRoutes: string[] = [];
  const removedRoutes: string[] = [];
  const changedRoutes: ContentRegressionRouteDiff[] = [];

  for (const [route, currentRoute] of currentRoutes) {
    const goldenRoute = goldenRoutes.get(route);
    if (!goldenRoute) {
      addedRoutes.push(route);
      continue;
    }
    if (currentRoute.hash === goldenRoute.hash) continue;
    // Route content changed — identify which blocks changed
    const changedBlocks: ContentRegressionBlockDiff[] = [];
    const currentBlocks = new Map(currentRoute.blocks.map((b) => [b.id, b]));
    const goldenBlocks = new Map(goldenRoute.blocks.map((b) => [b.id, b]));
    for (const [blockId, currentBlock] of currentBlocks) {
      const goldenBlock = goldenBlocks.get(blockId);
      if (!goldenBlock) {
        changedBlocks.push({ blockId, fields: ["new-block"] });
        continue;
      }
      if (currentBlock.hash === goldenBlock.hash) continue;
      const fields: string[] = [];
      if (currentBlock.heading !== goldenBlock.heading) fields.push("heading");
      if (currentBlock.lead !== goldenBlock.lead) fields.push("lead");
      if (currentBlock.body !== goldenBlock.body) fields.push("body");
      if (JSON.stringify(currentBlock.items) !== JSON.stringify(goldenBlock.items))
        fields.push("items");
      changedBlocks.push({ blockId, fields });
    }
    // Check for removed blocks
    for (const blockId of goldenBlocks.keys()) {
      if (!currentBlocks.has(blockId)) {
        changedBlocks.push({ blockId, fields: ["removed-block"] });
      }
    }
    // Check FAQ
    const faqChanged = JSON.stringify(currentRoute.faq) !== JSON.stringify(goldenRoute.faq);
    changedRoutes.push({ route, changedBlocks, faqChanged });
  }

  for (const route of goldenRoutes.keys()) {
    if (!currentRoutes.has(route)) {
      removedRoutes.push(route);
    }
  }

  addedRoutes.sort();
  removedRoutes.sort();
  return { addedRoutes, removedRoutes, changedRoutes };
}

function diffToDiagnostics(diff: ContentRegressionDiff): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const route of diff.addedRoutes) {
    diagnostics.push({
      ruleId: "CREG-02",
      severity: "error",
      message: `Route '${route}' exists in current snapshot but not in golden.`,
      fixHint:
        "New route detected. Run: pnpm exec site-kernel run content.regression.review.generate --site <systemId>",
    });
  }
  for (const route of diff.removedRoutes) {
    diagnostics.push({
      ruleId: "CREG-02",
      severity: "error",
      message: `Route '${route}' exists in golden snapshot but not in current.`,
      fixHint:
        "Removed route detected. Run: pnpm exec site-kernel run content.regression.review.generate --site <systemId>",
    });
  }
  for (const changed of diff.changedRoutes) {
    diagnostics.push({
      ruleId: "CREG-01",
      severity: "error",
      message: `Resolved content for route '${changed.route}' differs from golden snapshot.`,
      data: {
        changedBlocks: changed.changedBlocks,
        faqChanged: changed.faqChanged,
      },
      fixHint:
        "Review the content diff. Run: pnpm exec site-kernel run content.regression.review.generate --site <systemId>",
    });
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flagBool(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

async function resolveSiteContext(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<{
  contentDir: string;
  systemId: string;
  languages: string[];
  siteUrl: string;
  workpieceDir: string;
} | null> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const contentDir = join(paths.appDirectory, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const systemId = context.site?.name ?? flagString(input, "site") ?? "unknown";
  const languages = manifest.i18n?.supported
    ? Object.keys(manifest.i18n.supported)
    : [defaultLanguageFromManifest(manifest)];
  return { contentDir, systemId, languages, siteUrl, workpieceDir: paths.appDirectory };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function runContentRegressionCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;

  // RFC-0732: skip flag escape hatch
  if (flagBool(input, "skip-content-regression")) {
    return passResult(
      "content.regression.check",
      "content.regression.check: skipped (--skip-content-regression)",
    );
  }

  const siteCtx = await resolveSiteContext(input, context);
  if (!siteCtx) {
    return passResult("content.regression.check");
  }
  const { contentDir, systemId, languages, siteUrl, workpieceDir } = siteCtx;

  // Build current snapshot
  let currentSnapshot: ContentRegressionSnapshot;
  try {
    currentSnapshot = await buildSnapshot(contentDir, systemId, languages, siteUrl);
  } catch (err) {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "CREG-01",
        severity: "error",
        message: `Failed to load semantic site model: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
    return diagnosticsResult("content.regression.check", diagnostics);
  }

  // Write working snapshot (unless dry-run)
  const dryRun = flagBool(input, "dry-run");
  if (!dryRun) {
    const workSnapshotDir = join(workpieceDir, ".cache", "content-regression");
    await mkdir(workSnapshotDir, { recursive: true });
    const workSnapshotPath = join(workSnapshotDir, "current.snapshot.yaml");
    const yaml = snapshotToYaml(
      currentSnapshot,
      "content.regression.check",
      ".cache/content-regression/current.snapshot.yaml",
    );
    await writeFileIfChanged(workSnapshotPath, yaml);
  }

  // Resolve cache clone path for golden snapshot
  const cacheClonePath = await resolveCacheClonePath(workspaceRoot, systemId);
  if (!cacheClonePath) {
    // No cache clone — cold start, emit CREG-03 warning
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "CREG-03",
        severity: "warning",
        message: `No cache clone found for system '${systemId}'. Cannot compare against golden snapshot. First mission will create the baseline on mission.close.`,
      },
    ];
    return diagnosticsResult("content.regression.check", diagnostics);
  }

  // Load golden snapshot
  const goldenSnapshot = await readGoldenSnapshot(cacheClonePath, systemId);
  if (!goldenSnapshot) {
    // No golden snapshot — cold start, emit CREG-03 warning
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "CREG-03",
        severity: "warning",
        message: `No golden snapshot found for system '${systemId}'. First mission will create the baseline on mission.close.`,
      },
    ];
    return diagnosticsResult("content.regression.check", diagnostics);
  }

  // Diff current vs golden
  const diff = diffSnapshots(currentSnapshot, goldenSnapshot);
  const diagnostics = diffToDiagnostics(diff);
  return diagnosticsResult("content.regression.check", diagnostics);
}

export async function runContentRegressionSnapshotUpdate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const confirm = flagBool(input, "confirm");

  const siteCtx = await resolveSiteContext(input, context);
  if (!siteCtx) {
    return passResult("content.regression.snapshot.update");
  }
  const { contentDir, systemId, languages, siteUrl } = siteCtx;

  // Build current snapshot
  let currentSnapshot: ContentRegressionSnapshot;
  try {
    currentSnapshot = await buildSnapshot(contentDir, systemId, languages, siteUrl);
  } catch (err) {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "CREG-01",
        severity: "error",
        message: `Failed to load semantic site model: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
    return diagnosticsResult("content.regression.snapshot.update", diagnostics);
  }

  // Load golden snapshot (if exists) and print diff
  const cacheClonePath = await resolveCacheClonePath(workspaceRoot, systemId);
  if (cacheClonePath) {
    const goldenSnapshot = await readGoldenSnapshot(cacheClonePath, systemId);
    if (goldenSnapshot) {
      const diff = diffSnapshots(currentSnapshot, goldenSnapshot);
      if (diff.addedRoutes.length > 0) {
        context.logger.info(`  Added routes: ${diff.addedRoutes.join(", ")}`);
      }
      if (diff.removedRoutes.length > 0) {
        context.logger.info(`  Removed routes: ${diff.removedRoutes.join(", ")}`);
      }
      for (const changed of diff.changedRoutes) {
        const blockSummary = changed.changedBlocks
          .map((b) => `${b.blockId}(${b.fields.join(",")})`)
          .join(", ");
        context.logger.info(
          `  Changed route: ${changed.route} — blocks: ${blockSummary}${changed.faqChanged ? " +faq" : ""}`,
        );
      }
      if (
        diff.addedRoutes.length === 0 &&
        diff.removedRoutes.length === 0 &&
        diff.changedRoutes.length === 0
      ) {
        context.logger.info("  No content changes detected — snapshot is up to date.");
      }
    } else {
      context.logger.info("  No golden snapshot found — creating initial baseline.");
    }
  } else {
    context.logger.info("  No cache clone found — cannot write golden snapshot.");
    if (!confirm) {
      return passResult(
        "content.regression.snapshot.update",
        "content.regression.snapshot.update: no cache clone (dry run)",
      );
    }
  }

  if (!confirm) {
    return passResult(
      "content.regression.snapshot.update",
      "content.regression.snapshot.update: diff printed (use --confirm to write golden snapshot)",
    );
  }

  // Write golden snapshot to cache clone
  if (!cacheClonePath) {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "CREG-03",
        severity: "error",
        message: `Cannot write golden snapshot — no cache clone found for system '${systemId}'.`,
      },
    ];
    return diagnosticsResult("content.regression.snapshot.update", diagnostics);
  }

  const goldenDir = join(cacheClonePath, ".cache", "content-regression");
  await mkdir(goldenDir, { recursive: true });
  const goldenPath = join(goldenDir, `${systemId}.snapshot.yaml`);
  const yaml = snapshotToYaml(
    currentSnapshot,
    "content.regression.snapshot.update",
    `.cache/content-regression/${systemId}.snapshot.yaml`,
  );
  await writeFileIfChanged(goldenPath, yaml);

  return passResult(
    "content.regression.snapshot.update",
    `content.regression.snapshot.update: golden snapshot written for '${systemId}' (${currentSnapshot.routes.length} routes)`,
  );
}

// ---------------------------------------------------------------------------
// RFC-0734: Mission ID resolution
// ---------------------------------------------------------------------------

async function resolveMissionId(workspaceRoot: string, systemId: string): Promise<string | null> {
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  try {
    const raw = await readFile(registryPath, "utf8");
    const registry = yamlParse(raw) as RegistryFile;
    const entry = registry.systems?.find((s) => s.id === systemId);
    return entry?.currentMission ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// RFC-0734: Review YAML serialization
// ---------------------------------------------------------------------------

function reviewToYaml(
  review: ContentRegressionReview,
  systemId: string,
  missionId: string,
): string {
  const header = `# Content Regression Review — ${systemId}
# Mission: ${missionId}
# Generated: ${review.generatedAt}
#
# Instructions for operator:
#   1. Review each change below (golden = old value, current = new value)
#   2. Set decision: accept | reject | fix
#   3. For "fix": set fixValue to the desired text
#   4. For "accept": no further action — golden will be updated
#   5. For "reject": agent must revert the source content to match golden
#   6. Run: pnpm exec site-kernel run content.regression.apply --site ${systemId} --review <this-file>
#
# Instructions for AI agent (copy to agent after operator fills decisions):
#   - Read this file
#   - For each change with decision: reject → revert source .md to golden value
#   - For each change with decision: fix → set source .md to fixValue
#   - For each change with decision: accept → no action needed
#   - After applying changes, run: content.regression.check --site ${systemId}
`;
  const body = yamlStringify(review);
  return `${header}\n${body}`;
}

function parseReviewYaml(raw: string): ContentRegressionReview {
  const parsed = yamlParse(raw) as ContentRegressionReview;
  if (!parsed || typeof parsed !== "object" || !parsed.schemaVersion || !parsed.changes) {
    throw new Error("Invalid review.yaml: missing schemaVersion or changes");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// RFC-0734: Build review changes from diff
// ---------------------------------------------------------------------------

function getBlockFieldValue(
  block: ContentRegressionBlock | undefined,
  field: string,
): string | null {
  if (!block) return null;
  switch (field) {
    case "heading":
      return block.heading;
    case "lead":
      return block.lead ?? null;
    case "body":
      return block.body ?? null;
    case "items":
      return block.items ? JSON.stringify(block.items) : null;
    default:
      return null;
  }
}

function buildReviewChanges(
  diff: ContentRegressionDiff,
  currentSnapshot: ContentRegressionSnapshot,
  goldenSnapshot: ContentRegressionSnapshot | null,
): ContentRegressionReviewChange[] {
  const changes: ContentRegressionReviewChange[] = [];
  let changeNum = 1;

  const currentRoutes = new Map(currentSnapshot.routes.map((r) => [r.route, r]));
  const goldenRoutes = goldenSnapshot
    ? new Map(goldenSnapshot.routes.map((r) => [r.route, r]))
    : new Map<string, ContentRegressionRoute>();

  // Added routes
  for (const route of diff.addedRoutes) {
    changes.push({
      id: `change-${String(changeNum++).padStart(3, "0")}`,
      route,
      kind: "added-route",
      golden: null,
      current: "route exists in current snapshot but not in golden",
      decision: "pending",
      fixValue: "",
      note: "",
    });
  }

  // Removed routes
  for (const route of diff.removedRoutes) {
    changes.push({
      id: `change-${String(changeNum++).padStart(3, "0")}`,
      route,
      kind: "removed-route",
      golden: "route existed in golden but not in current",
      current: null,
      decision: "pending",
      fixValue: "",
      note: "",
    });
  }

  // Changed routes — block-field changes
  for (const changed of diff.changedRoutes) {
    const currentRoute = currentRoutes.get(changed.route);
    const goldenRoute = goldenRoutes.get(changed.route);

    for (const blockDiff of changed.changedBlocks) {
      if (blockDiff.fields.includes("new-block")) {
        const currentBlock = currentRoute?.blocks.find((b) => b.id === blockDiff.blockId);
        changes.push({
          id: `change-${String(changeNum++).padStart(3, "0")}`,
          route: changed.route,
          kind: "block-field",
          blockId: blockDiff.blockId,
          field: "new-block",
          golden: null,
          current: currentBlock ? JSON.stringify(currentBlock) : null,
          decision: "pending",
          fixValue: "",
          note: "",
        });
        continue;
      }
      if (blockDiff.fields.includes("removed-block")) {
        const goldenBlock = goldenRoute?.blocks.find((b) => b.id === blockDiff.blockId);
        changes.push({
          id: `change-${String(changeNum++).padStart(3, "0")}`,
          route: changed.route,
          kind: "block-field",
          blockId: blockDiff.blockId,
          field: "removed-block",
          golden: goldenBlock ? JSON.stringify(goldenBlock) : null,
          current: null,
          decision: "pending",
          fixValue: "",
          note: "",
        });
        continue;
      }
      for (const field of blockDiff.fields) {
        const currentBlock = currentRoute?.blocks.find((b) => b.id === blockDiff.blockId);
        const goldenBlock = goldenRoute?.blocks.find((b) => b.id === blockDiff.blockId);
        changes.push({
          id: `change-${String(changeNum++).padStart(3, "0")}`,
          route: changed.route,
          kind: "block-field",
          blockId: blockDiff.blockId,
          field,
          golden: getBlockFieldValue(goldenBlock, field),
          current: getBlockFieldValue(currentBlock, field),
          decision: "pending",
          fixValue: "",
          note: "",
        });
      }
    }

    // FAQ changes — per-entry comparison
    if (changed.faqChanged) {
      const currentFaq = currentRoute?.faq ?? [];
      const goldenFaq = goldenRoute?.faq ?? [];
      const maxLen = Math.max(currentFaq.length, goldenFaq.length);
      for (let i = 0; i < maxLen; i++) {
        const c = currentFaq[i];
        const g = goldenFaq[i];
        if (!c && g) {
          changes.push({
            id: `change-${String(changeNum++).padStart(3, "0")}`,
            route: changed.route,
            kind: "faq",
            blockId: `faq-${i}`,
            field: "removed",
            golden: JSON.stringify(g),
            current: null,
            decision: "pending",
            fixValue: "",
            note: "",
          });
        } else if (c && !g) {
          changes.push({
            id: `change-${String(changeNum++).padStart(3, "0")}`,
            route: changed.route,
            kind: "faq",
            blockId: `faq-${i}`,
            field: "added",
            golden: null,
            current: JSON.stringify(c),
            decision: "pending",
            fixValue: "",
            note: "",
          });
        } else if (c && g && (c.question !== g.question || c.answer !== g.answer)) {
          changes.push({
            id: `change-${String(changeNum++).padStart(3, "0")}`,
            route: changed.route,
            kind: "faq",
            blockId: `faq-${i}`,
            field: "changed",
            golden: JSON.stringify(g),
            current: JSON.stringify(c),
            decision: "pending",
            fixValue: "",
            note: "",
          });
        }
      }
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// RFC-0734: content.regression.review.generate command
// ---------------------------------------------------------------------------

export async function runContentRegressionReviewGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;

  const siteCtx = await resolveSiteContext(input, context);
  if (!siteCtx) {
    return passResult("content.regression.review.generate");
  }
  const { contentDir, systemId, languages, siteUrl } = siteCtx;

  // Build current snapshot
  let currentSnapshot: ContentRegressionSnapshot;
  try {
    currentSnapshot = await buildSnapshot(contentDir, systemId, languages, siteUrl);
  } catch (err) {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: "CREG-01",
        severity: "error",
        message: `Failed to load semantic site model: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
    return diagnosticsResult("content.regression.review.generate", diagnostics);
  }

  // Resolve mission ID from registry
  const missionId = await resolveMissionId(workspaceRoot, systemId);
  if (!missionId) {
    return diagnosticsResult("content.regression.review.generate", [
      {
        ruleId: "CREG-03",
        severity: "error",
        message: `No current mission found for system '${systemId}' in systems/registry.yaml.`,
      },
    ]);
  }

  // Load golden snapshot
  const cacheClonePath = await resolveCacheClonePath(workspaceRoot, systemId);
  const goldenSnapshot = cacheClonePath ? await readGoldenSnapshot(cacheClonePath, systemId) : null;

  // Diff current vs golden
  const diff = goldenSnapshot
    ? diffSnapshots(currentSnapshot, goldenSnapshot)
    : {
        addedRoutes: currentSnapshot.routes.map((r) => r.route),
        removedRoutes: [],
        changedRoutes: [],
      };

  // Build review changes
  const changes = buildReviewChanges(diff, currentSnapshot, goldenSnapshot);

  // RFC-0748: --auto-accept pre-sets all non-removed-route changes to accept
  const autoAccept = flagBool(input, "auto-accept");
  if (autoAccept) {
    for (const change of changes) {
      if (change.kind !== "removed-route") {
        change.decision = "accept";
      }
    }
  }

  const review: ContentRegressionReview = {
    schemaVersion: 1,
    systemId,
    missionId,
    generatedAt: new Date().toISOString(),
    goldenSnapshotHash: goldenSnapshot?.contentHash ?? "none",
    currentSnapshotHash: currentSnapshot.contentHash,
    summary: {
      totalChanges: changes.length,
      addedRoutes: diff.addedRoutes.length,
      removedRoutes: diff.removedRoutes.length,
      changedRoutes: diff.changedRoutes.length,
    },
    changes,
  };

  const dryRun = flagBool(input, "dry-run");
  const reviewYaml = reviewToYaml(review, systemId, missionId);

  const autoAcceptLabel = autoAccept ? " (auto-accepted)" : "";

  if (dryRun) {
    context.logger.info(reviewYaml);
    return passResult(
      "content.regression.review.generate",
      `content.regression.review.generate: ${changes.length} change(s) detected${autoAcceptLabel} (dry run)`,
    );
  }

  // Write review.yaml to mission evidence directory
  const reviewDir = join(workspaceRoot, "missions", missionId, "evidence", "content-regression");
  await mkdir(reviewDir, { recursive: true });
  const reviewPath = join(reviewDir, "review.yaml");
  await writeFileIfChanged(reviewPath, reviewYaml);

  const relativePath = `missions/${missionId}/evidence/content-regression/review.yaml`;
  context.logger.info(`  Review manifest: ${relativePath}`);

  return passResult(
    "content.regression.review.generate",
    `content.regression.review.generate: ${changes.length} change(s) detected${autoAcceptLabel}. Review manifest: ${relativePath}`,
  );
}

// ---------------------------------------------------------------------------
// RFC-0734: content.regression.apply command
// ---------------------------------------------------------------------------

export async function runContentRegressionApply(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const force = flagBool(input, "force");
  const reviewPath = flagString(input, "review");

  if (!reviewPath) {
    return diagnosticsResult("content.regression.apply", [
      {
        ruleId: "CREG-04",
        severity: "error",
        message: "Missing required --review <path> flag.",
      },
    ]);
  }

  const siteCtx = await resolveSiteContext(input, context);
  if (!siteCtx) {
    return passResult("content.regression.apply");
  }
  const { contentDir, systemId, languages, siteUrl } = siteCtx;

  // Load review.yaml
  let review: ContentRegressionReview;
  try {
    const raw = await readFile(reviewPath, "utf8");
    review = parseReviewYaml(raw);
  } catch (err) {
    return diagnosticsResult("content.regression.apply", [
      {
        ruleId: "CREG-04",
        severity: "error",
        message: `Failed to read review.yaml: ${err instanceof Error ? err.message : String(err)}`,
      },
    ]);
  }

  // Check for pending decisions
  const pendingCount = review.changes.filter((c) => c.decision === "pending").length;
  if (pendingCount > 0 && !force) {
    return diagnosticsResult("content.regression.apply", [
      {
        ruleId: "CREG-04",
        severity: "error",
        message: `${pendingCount} change(s) have decision: pending. All decisions must be accept, reject, or fix (use --force to override).`,
      },
    ]);
  }

  // Build current snapshot
  let currentSnapshot: ContentRegressionSnapshot;
  try {
    currentSnapshot = await buildSnapshot(contentDir, systemId, languages, siteUrl);
  } catch (err) {
    return diagnosticsResult("content.regression.apply", [
      {
        ruleId: "CREG-01",
        severity: "error",
        message: `Failed to load semantic site model: ${err instanceof Error ? err.message : String(err)}`,
      },
    ]);
  }

  // Verify currentSnapshotHash matches
  if (review.currentSnapshotHash !== currentSnapshot.contentHash) {
    return diagnosticsResult("content.regression.apply", [
      {
        ruleId: "CREG-04",
        severity: "error",
        message:
          "Workpiece content has changed since review.yaml was generated. Re-run content.regression.review.generate.",
      },
    ]);
  }

  // Load golden snapshot
  const cacheClonePath = await resolveCacheClonePath(workspaceRoot, systemId);
  if (!cacheClonePath) {
    return diagnosticsResult("content.regression.apply", [
      {
        ruleId: "CREG-03",
        severity: "error",
        message: `No cache clone found for system '${systemId}'.`,
      },
    ]);
  }

  const goldenSnapshot = await readGoldenSnapshot(cacheClonePath, systemId);

  // Process decisions
  const result: ContentRegressionApplyResult = {
    accepted: 0,
    rejected: 0,
    fixed: 0,
    pending: pendingCount,
    goldenUpdated: false,
    errors: [],
  };

  const currentRoutes = new Map(currentSnapshot.routes.map((r) => [r.route, r]));
  const goldenRoutes = goldenSnapshot
    ? new Map(goldenSnapshot.routes.map((r) => [r.route, r]))
    : new Map<string, ContentRegressionRoute>();

  for (const change of review.changes) {
    if (change.decision === "pending") continue;

    if (change.decision === "accept") {
      result.accepted++;
      continue;
    }

    if (change.decision === "reject") {
      // Verify current content matches golden (was reverted)
      const currentRoute = currentRoutes.get(change.route);
      const goldenRoute = goldenRoutes.get(change.route);

      if (
        change.kind === "block-field" &&
        change.field &&
        change.field !== "new-block" &&
        change.field !== "removed-block"
      ) {
        const currentBlock = currentRoute?.blocks.find((b) => b.id === change.blockId);
        const goldenBlock = goldenRoute?.blocks.find((b) => b.id === change.blockId);
        const currentVal = getBlockFieldValue(currentBlock, change.field);
        if (currentVal !== change.golden) {
          result.errors.push(
            `CREG-04: Rejected change '${change.id}' not reverted in source — block '${change.blockId}' field '${change.field}' still differs from golden value`,
          );
        }
      }
      result.rejected++;
      continue;
    }

    if (change.decision === "fix") {
      // Verify current content matches fixValue
      const currentRoute = currentRoutes.get(change.route);

      if (
        change.kind === "block-field" &&
        change.field &&
        change.field !== "new-block" &&
        change.field !== "removed-block"
      ) {
        const currentBlock = currentRoute?.blocks.find((b) => b.id === change.blockId);
        const currentVal = getBlockFieldValue(currentBlock, change.field);
        if (currentVal !== change.fixValue) {
          result.errors.push(
            `CREG-04: Fix value for change '${change.id}' not yet applied to source — block '${change.blockId}' field '${change.field}' does not match fixValue`,
          );
        }
      }
      result.fixed++;
      continue;
    }
  }

  // If errors, block
  if (result.errors.length > 0) {
    return diagnosticsResult(
      "content.regression.apply",
      result.errors.map((msg) => ({ ruleId: "CREG-04", severity: "error" as const, message: msg })),
    );
  }

  // Build updated golden snapshot: for accepted changes, use current values; for rejected, keep golden
  const updatedRoutes: ContentRegressionRoute[] = [];
  for (const currentRoute of currentSnapshot.routes) {
    const goldenRoute = goldenRoutes.get(currentRoute.route);
    if (!goldenRoute) {
      // New route — include if accepted
      const hasAccept = review.changes.some(
        (c) =>
          c.route === currentRoute.route && c.kind === "added-route" && c.decision === "accept",
      );
      if (hasAccept || !goldenSnapshot) {
        updatedRoutes.push(currentRoute);
      } else {
        // Skip — not accepted
      }
      continue;
    }

    // Check if this route has any accepted changes
    const routeChanges = review.changes.filter((c) => c.route === currentRoute.route);
    const hasAccepted = routeChanges.some((c) => c.decision === "accept" || c.decision === "fix");

    if (hasAccepted || currentRoute.hash === goldenRoute.hash) {
      updatedRoutes.push(currentRoute);
    } else {
      // Keep golden route (rejected changes keep golden values)
      updatedRoutes.push(goldenRoute);
    }
  }

  // Include golden routes that were removed (if not accepted)
  for (const [route, goldenRoute] of goldenRoutes) {
    if (!currentRoutes.has(route)) {
      const hasAccept = review.changes.some(
        (c) => c.route === route && c.kind === "removed-route" && c.decision === "accept",
      );
      if (!hasAccept) {
        updatedRoutes.push(goldenRoute);
      }
    }
  }

  updatedRoutes.sort((a, b) => a.route.localeCompare(b.route));
  const updatedGolden: ContentRegressionSnapshot = {
    schemaVersion: 1,
    systemId,
    contentHash: byteHash(updatedRoutes.map((r) => r.hash).join("\n")),
    routes: updatedRoutes,
  };

  // Write updated golden snapshot
  const goldenDir = join(cacheClonePath, ".cache", "content-regression");
  await mkdir(goldenDir, { recursive: true });
  const goldenPath = join(goldenDir, `${systemId}.snapshot.yaml`);
  const yaml = snapshotToYaml(
    updatedGolden,
    "content.regression.apply",
    `.cache/content-regression/${systemId}.snapshot.yaml`,
  );
  await writeFileIfChanged(goldenPath, yaml);
  result.goldenUpdated = true;

  // Write apply-result.json
  const missionId = review.missionId;
  const resultDir = join(workspaceRoot, "missions", missionId, "evidence", "content-regression");
  await mkdir(resultDir, { recursive: true });
  const resultPath = join(resultDir, "apply-result.json");
  await writeFileIfChanged(resultPath, JSON.stringify(result, null, 2) + "\n");

  return passResult(
    "content.regression.apply",
    `content.regression.apply: ${review.changes.length} change(s) processed (${result.accepted} accepted, ${result.rejected} rejected, ${result.fixed} fixed). Golden snapshot updated.`,
  );
}
