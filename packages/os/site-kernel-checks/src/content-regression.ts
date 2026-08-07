/*
<MODULE_CONTRACT>
<purpose>
RFC-0732: content regression gate for resolved page content drift detection.
Snapshots resolved page content (block text after resolveReferencesDeep
substitution, prose body text, FAQ Q&A pairs) per-route, hashes it, and diffs
against a golden baseline stored in the cache clone. Content drift emits
CREG-01/CREG-02/CREG-03 diagnostics and gates mission.validate.
</purpose>
<non-goals>
  <item>Do not snapshot route metadata — that is behavior.snapshot.validate (SNAP-01).</item>
  <item>Do not check generated file determinism — that is generated.drift.validate (DRIFT-01).</item>
  <item>Do not judge content correctness — only detect CHANGE from golden baseline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0732: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
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
// Cache clone path resolution (mirrors generated-files-validate.ts pattern)
// ---------------------------------------------------------------------------

interface RegistryMirror {
  path?: string;
}

interface RegistrySystem {
  id: string;
  mirrors?: RegistryMirror[];
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
        "New route detected. Run: pnpm exec site-kernel run content.regression.snapshot.update --site <systemId>",
    });
  }
  for (const route of diff.removedRoutes) {
    diagnostics.push({
      ruleId: "CREG-02",
      severity: "error",
      message: `Route '${route}' exists in golden snapshot but not in current.`,
      fixHint:
        "Removed route detected. Run: pnpm exec site-kernel run content.regression.snapshot.update --site <systemId>",
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
        "Review the content diff. If intended, run: pnpm exec site-kernel run content.regression.snapshot.update --site <systemId>",
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
