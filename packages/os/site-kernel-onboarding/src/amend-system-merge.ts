/*
<MODULE_CONTRACT>
<purpose>RFC-0135 amend-001 fix P1/P2: amend.system.merge — the additive, idempotent
system.md mutator for the amend chain. Unlike system-md.compile (greenfield: reads a full
site-plan and OVERWRITES system.md), this loads the app's CURRENT system.md, applies the
new-route / expand-locale / new-locale deltas declared in a2-compose/site-plan-delta.md,
re-validates the whole manifest, and single-owner-writes — preserving the existing pages,
identity, and markdown body.</purpose>
<non-goals>
  <item>Do not author page/prose content — that is a3-author.</item>
  <item>Do not read the greenfield 03-compose/site-plan.md (the P2 footgun).</item>
  <item>Do not overwrite or reorder existing pages — merge is purely additive.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>amend-001 fix: add additive system.md merge so new routes can actually be registered.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { systemManifestSchema } from "@gogol/ontology";
import {
  loadSystemManifest,
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from "@gogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { readAmendInputManifest, readFlag } from "./amend.ts";

interface Finding {
  ruleId: string;
  severity: "info" | "warn" | "error";
  file?: string;
  message: string;
}

/** A new page declaration in site-plan-delta.md (intent: new-route). */
interface AddPageDelta {
  pageId: string;
  routes?: Record<string, string>;
  locales?: string[];
  cosmicStar: string;
  constellation?: string;
  planets?: Array<{ cosmicPlanet: string; pin: string }>;
}

/** A locale-expansion declaration (intent: expand-locale). */
interface ExpandLocaleDelta {
  pageId: string;
  locale: string;
  route: string;
}

interface SitePlanDelta {
  addPages?: AddPageDelta[];
  expandLocales?: ExpandLocaleDelta[];
  newLocales?: Record<string, unknown>;
}

interface AmendSystemMergeData {
  command: "amend.system.merge";
  site?: string;
  batch?: string;
  status: "pass" | "fail";
  applied?: { addedPages: string[]; expandedLocales: string[]; addedLocales: string[] };
  findings: Finding[];
}

function fail(
  findings: Finding[],
  site: string | undefined,
  batch: string | undefined,
): KernelCommandResult<AmendSystemMergeData> {
  return {
    data: { command: "amend.system.merge", site, batch, status: "fail", findings },
    exitCode: 1,
    summary: `amend.system.merge: ${findings.filter((f) => f.severity === "error").length} violation(s)`,
  };
}

/**
 * Apply a site-plan delta additively to a raw system-manifest object.
 * Returns the mutated object plus a record of what changed. Idempotent: re-applying
 * the same delta is a no-op (already-present pages/locales are skipped, not errored).
 */
export function applySitePlanDelta(
  system: Record<string, unknown>,
  delta: SitePlanDelta,
): {
  system: Record<string, unknown>;
  addedPages: string[];
  expandedLocales: string[];
  addedLocales: string[];
  findings: Finding[];
} {
  const findings: Finding[] = [];
  const addedPages: string[] = [];
  const expandedLocales: string[] = [];
  const addedLocales: string[] = [];

  const pages = Array.isArray(system.pages) ? (system.pages as Array<Record<string, unknown>>) : [];
  system.pages = pages;
  const pageById = new Map(pages.map((p) => [String(p.pageId), p]));

  // 1. New supported locales (P4 bootstrap of i18n.supported only; nav/labels are a2 authoring).
  for (const [lang, meta] of Object.entries(delta.newLocales ?? {})) {
    const i18n = (system.i18n ?? {}) as Record<string, unknown>;
    const supported = (i18n.supported ?? {}) as Record<string, unknown>;
    if (supported[lang]) continue; // idempotent
    supported[lang] = meta;
    i18n.supported = supported;
    system.i18n = i18n;
    addedLocales.push(lang);
  }

  // 2. New routes (intent: new-route) — append, never replace.
  for (const page of delta.addPages ?? []) {
    if (pageById.has(page.pageId)) {
      findings.push({
        ruleId: "amend.system.page-exists",
        severity: "info",
        message: `Page '${page.pageId}' already present; new-route add skipped (idempotent).`,
      });
      continue;
    }
    const entry: Record<string, unknown> = {
      pageId: page.pageId,
      cosmicStar: page.cosmicStar,
    };
    if (page.routes) entry.routes = page.routes;
    if (page.locales) entry.locales = page.locales;
    if (page.constellation) entry.constellation = page.constellation;
    entry.planets = page.planets ?? [];
    pages.push(entry);
    pageById.set(page.pageId, entry);
    addedPages.push(page.pageId);
  }

  // 3. Locale expansion (intent: expand-locale) — add a route + locale to an existing page.
  for (const exp of delta.expandLocales ?? []) {
    const page = pageById.get(exp.pageId);
    if (!page) {
      findings.push({
        ruleId: "amend.system.expand-target-missing",
        severity: "error",
        message: `expand-locale targets pageId '${exp.pageId}' which is not in system.md pages[].`,
      });
      continue;
    }
    const routes = (page.routes ?? {}) as Record<string, string>;
    const locales = Array.isArray(page.locales) ? (page.locales as string[]) : undefined;
    const already = routes[exp.locale] !== undefined && (!locales || locales.includes(exp.locale));
    if (already) {
      findings.push({
        ruleId: "amend.system.locale-exists",
        severity: "info",
        message: `Page '${exp.pageId}' already serves locale '${exp.locale}'; expand-locale skipped (idempotent).`,
      });
      continue;
    }
    routes[exp.locale] = exp.route;
    page.routes = routes;
    if (locales && !locales.includes(exp.locale)) {
      locales.push(exp.locale);
      page.locales = locales;
    }
    expandedLocales.push(`${exp.pageId}:${exp.locale}`);
  }

  return { system, addedPages, expandedLocales, addedLocales, findings };
}

export async function runAmendSystemMerge(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AmendSystemMergeData>> {
  const findings: Finding[] = [];
  const appName = context.site?.name;
  const batch = readFlag(input, "batch");

  if (!batch || !/^amend-\d{3,}$/.test(batch)) {
    findings.push({
      ruleId: "amend.system.invalid-batch",
      severity: "error",
      message: "--batch must be provided and match amend-<NNN>.",
    });
    return fail(findings, appName, batch);
  }
  if (!context.site) {
    findings.push({
      ruleId: "amend.system.no-app",
      severity: "error",
      message: "amend.system.merge requires --site <client.id> (the already-onboarded app).",
    });
    return fail(findings, appName, batch);
  }

  // Freshness: the delta must be derived from the current batch manifest hash (RFC-0076).
  const manifest = await readAmendInputManifest(context.workspaceRoot, batch);
  if (!manifest) {
    findings.push({
      ruleId: "amend.system.no-manifest",
      severity: "error",
      file: `onboarding/.output/${batch}/a0-intake/input-manifest.json`,
      message: "Batch manifest missing; run amend.input.validate first.",
    });
    return fail(findings, appName, batch);
  }

  const deltaPath = join(
    context.workspaceRoot,
    "onboarding",
    ".output",
    batch,
    "a2-compose",
    "site-plan-delta.md",
  );
  let deltaRaw: string;
  try {
    deltaRaw = await readFile(deltaPath, "utf8");
  } catch {
    findings.push({
      ruleId: "amend.system.no-delta",
      severity: "error",
      file: `onboarding/.output/${batch}/a2-compose/site-plan-delta.md`,
      message: "site-plan-delta.md not found; author it before merging.",
    });
    return fail(findings, appName, batch);
  }
  const deltaParsed = parseMarkdownFrontmatter(deltaRaw);
  const deltaData = deltaParsed.data as Record<string, unknown>;
  if (deltaData.derivedFromInputHash !== manifest.inputHash) {
    findings.push({
      ruleId: "amend.system.stale-delta",
      severity: "error",
      file: `onboarding/.output/${batch}/a2-compose/site-plan-delta.md`,
      message: `site-plan-delta.md derivedFromInputHash (${String(deltaData.derivedFromInputHash)}) != batch manifest hash (${manifest.inputHash}).`,
    });
    return fail(findings, appName, batch);
  }

  // Load the CURRENT system.md (raw frontmatter, to preserve body + avoid re-emitting defaults).
  const contentDir = join(context.site.directory, "src", "content");
  const systemPath = join(contentDir, "system.md");
  let systemRaw: string;
  try {
    systemRaw = await readFile(systemPath, "utf8");
  } catch {
    findings.push({
      ruleId: "amend.system.no-system-md",
      severity: "error",
      file: relative(context.workspaceRoot, systemPath).replace(/\\/g, "/"),
      message: "system.md not found; amend requires an already-onboarded app.",
    });
    return fail(findings, appName, batch);
  }
  const systemParsed = parseMarkdownFrontmatter(systemRaw);

  const delta: SitePlanDelta = {
    addPages: (deltaData.addPages as AddPageDelta[] | undefined) ?? undefined,
    expandLocales: (deltaData.expandLocales as ExpandLocaleDelta[] | undefined) ?? undefined,
    newLocales: (deltaData.newLocales as Record<string, unknown> | undefined) ?? undefined,
  };

  const {
    system,
    addedPages,
    expandedLocales,
    addedLocales,
    findings: applyFindings,
  } = applySitePlanDelta(systemParsed.data, delta);
  findings.push(...applyFindings);
  if (findings.some((f) => f.severity === "error")) return fail(findings, appName, batch);

  // Re-validate the WHOLE manifest as a gate (does not mutate what we write).
  const validation = systemManifestSchema.safeParse(system);
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      findings.push({
        ruleId: "amend.system.invalid-result",
        severity: "error",
        file: relative(context.workspaceRoot, systemPath).replace(/\\/g, "/"),
        message: `${issue.path.join(".") || "system"}: ${issue.message}`,
      });
    }
    return fail(findings, appName, batch);
  }

  // Sanity-check the loader can still read what we are about to persist.
  const nextSource = stringifyMarkdownFrontmatter(systemParsed.content, system);
  if (!context.dryRun) {
    await writeFile(systemPath, nextSource, "utf8");
    try {
      await loadSystemManifest(contentDir);
    } catch (error) {
      findings.push({
        ruleId: "amend.system.post-write-load-failed",
        severity: "error",
        file: relative(context.workspaceRoot, systemPath).replace(/\\/g, "/"),
        message: `system.md failed to reload after merge: ${error instanceof Error ? error.message : String(error)}`,
      });
      return fail(findings, appName, batch);
    }
  }

  const applied = { addedPages, expandedLocales, addedLocales };
  return {
    data: {
      command: "amend.system.merge",
      site: appName,
      batch,
      status: "pass",
      applied,
      findings,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `[dry-run] amend.system.merge: +${addedPages.length} page(s), +${expandedLocales.length} locale-route(s), +${addedLocales.length} locale(s)`
      : `amend.system.merge: OK (+${addedPages.length} page(s), +${expandedLocales.length} locale-route(s), +${addedLocales.length} locale(s))`,
  };
}
