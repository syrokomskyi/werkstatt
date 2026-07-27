/*
<MODULE_CONTRACT>
<purpose>RFC-0139 amend.delta.files: resolve the repo-relative file set an amend batch is
responsible for, so the amend gates can scope the deterministic content validators to the
batch delta (instead of the whole app). Reads the same delta source as audit.delta.run —
the provenance record, falling back to the batch input manifest — then expands each touched
pageId into its page + prose files across the locales it serves, plus the per-locale
business / site / navigation files, plus the app's sharedContext.requiredPageIds (so
shared-context resolution still sees them).</purpose>
<non-goals>
  <item>Do not validate anything; this is a pure resolver consumed by amend-check.</item>
  <item>Do not author or mutate content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0139: initial creation.</item>
</CHANGE_SUMMARY>
*/

import { access, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pageIdToContentFileSlug } from "@warpgogol/share/content";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readFlag } from "./amend.ts";

interface DeltaChange {
  pageId: string;
  intent?: string;
}

interface AmendDeltaFilesData {
  command: "amend.delta.files";
  site?: string;
  batch?: string;
  status: "pass" | "fail";
  files: string[];
  findings: Array<{ ruleId: string; severity: "info" | "warn" | "error"; message: string }>;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Touched pageIds for a batch: provenance record first (authoritative), else the manifest. */
export async function readBatchDelta(
  workspaceRoot: string,
  app: string,
  batch: string,
): Promise<DeltaChange[]> {
  const provPath = join(workspaceRoot, "apps", app, "provenance", "amend", `${batch}.json`);
  try {
    const record = JSON.parse(await readFile(provPath, "utf8")) as {
      changes?: Array<{ pageId?: string; intent?: string }>;
    };
    if (record.changes?.length) {
      return record.changes
        .filter((c): c is DeltaChange => Boolean(c.pageId))
        .map((c) => ({ pageId: c.pageId, intent: c.intent }));
    }
  } catch {
    /* fall through to manifest */
  }
  const manPath = join(
    workspaceRoot,
    "onboarding",
    ".output",
    batch,
    "a0-intake",
    "input-manifest.json",
  );
  try {
    const manifest = JSON.parse(await readFile(manPath, "utf8")) as {
      files?: Array<{ pageId?: string; intent?: string }>;
    };
    const byPage = new Map<string, DeltaChange>();
    for (const file of manifest.files ?? []) {
      if (file.pageId) byPage.set(file.pageId, { pageId: file.pageId, intent: file.intent });
    }
    return [...byPage.values()];
  } catch {
    return [];
  }
}

async function collectMdFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMdFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

export async function runAmendDeltaFiles(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AmendDeltaFilesData>> {
  const findings: AmendDeltaFilesData["findings"] = [];
  const appName = context.site?.name;
  const batch = readFlag(input, "batch");

  if (!batch || !context.site) {
    findings.push({
      ruleId: "amend.delta.files.bad-args",
      severity: "error",
      message: "amend.delta.files requires --site <client.id> and --batch amend-<NNN>.",
    });
    return {
      data: {
        command: "amend.delta.files",
        site: appName,
        batch,
        status: "fail",
        files: [],
        findings,
      },
      exitCode: 1,
      summary: "amend.delta.files: missing --app/--batch",
    };
  }

  const contentDir = join(context.site.directory, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const supported = Object.keys(
    (manifest.i18n?.supported as Record<string, unknown> | undefined) ?? {
      [manifest.i18n?.default ?? "de"]: {},
    },
  );
  const pagesById = new Map((manifest.pages ?? []).map((p) => [p.pageId, p]));
  const requiredPageIds = manifest.sharedContext?.requiredPageIds ?? [];

  const delta = await readBatchDelta(context.workspaceRoot, context.site.name, batch);
  const targetPageIds = new Set<string>([...delta.map((d) => d.pageId), ...requiredPageIds]);

  const files = new Set<string>();
  const touchedLocales = new Set<string>();
  const rel = (abs: string) => relative(context.workspaceRoot, abs).replace(/\\/g, "/");

  for (const pageId of targetPageIds) {
    const page = pagesById.get(pageId);
    const locales = (page?.locales as string[] | undefined) ?? supported;
    const slug = pageIdToContentFileSlug(pageId);
    for (const lang of locales) {
      touchedLocales.add(lang);
      for (const kind of ["pages", "prose"] as const) {
        const abs = join(contentDir, kind, lang, `${slug}.md`);
        if (await pathExists(abs)) files.add(rel(abs));
      }
    }
  }

  // Per-locale business / site / navigation files the batch's locales depend on.
  for (const lang of touchedLocales) {
    for (const dir of ["business", "site", "navigation"] as const) {
      for (const abs of await collectMdFiles(join(contentDir, dir, lang))) files.add(rel(abs));
    }
  }

  const sorted = [...files].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) {
    findings.push({
      ruleId: "amend.delta.files.empty",
      severity: "warn",
      message: `No delta files resolved for ${batch}; run amend.input.validate (and a3-author) first.`,
    });
  }
  return {
    data: {
      command: "amend.delta.files",
      site: appName,
      batch,
      status: "pass",
      files: sorted,
      findings,
    },
    exitCode: 0,
    summary: `amend.delta.files: ${sorted.length} file(s) in the ${batch} delta`,
  };
}
