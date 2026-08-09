/*
<MODULE_CONTRACT>
<purpose>RFC-0135 amend-onboarding batch contract: the 00-amend-brief.md schema, the
per-batch input manifest, the app-present precondition validator (amend.input.validate),
and the shared amend types reused by the amend gates in amend-gates.ts.</purpose>
<non-goals>
  <item>Do not author content, merge atoms, or write provenance — those are amend-gates.ts.</item>
  <item>Do not touch the greenfield 00-brief.md bundle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0135: Add amend batch contract, input manifest, and app-present validator.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";

export const AmendSource = z
  .object({
    file: z.string().min(1),
    sourceId: z.string().regex(/^[a-z][a-z0-9-]{1,48}$/),
    version: z.string().regex(/^v\d+(\.\d+)*$/),
    // RFC-0135 (amend-001 fix P3): three intents.
    //  - strengthen:    content-only change to an existing page (existing locale).
    //  - new-route:     add a brand-new pageId + routes to system.md.
    //  - expand-locale: add a NEW language to an existing page (route + locale + new-lang
    //                   page/prose). Requires `locale`. Touches system.md routes/locales,
    //                   so it is NOT content-only — it is the missing third case between
    //                   strengthen (forbids system.md edits) and new-route (page exists).
    intent: z.enum(["strengthen", "new-route", "expand-locale"]),
    pageId: z.string().min(1),
    /** Required for intent: expand-locale — the i18n language key being added (e.g. "uk"). */
    locale: z
      .string()
      .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/)
      .optional(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.intent === "expand-locale" && !source.locale) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locale"],
        message:
          "intent: expand-locale requires a `locale` (the language key being added, e.g. uk).",
      });
    }
  });

export const AmendBrief = z
  .object({
    amend: z.object({
      batch: z.string().regex(/^amend-\d{3,}$/),
      targetApp: z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),
    }),
    sources: z.array(AmendSource).min(1),
  })
  .strict();

export type AmendBrief = z.infer<typeof AmendBrief>;
export type AmendSourceEntry = z.infer<typeof AmendSource>;
export type AmendIntent = AmendSourceEntry["intent"];

export interface AmendInputManifest {
  version: 1;
  generatedAt: string;
  batch: string;
  targetApp: string;
  inputRoot: string;
  inputHash: string;
  files: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    sourceId?: string;
    version?: string;
    intent?: AmendIntent;
    pageId?: string;
  }>;
}

/** RFC-0135 / RFC-0076: every amend output carries this header; derivedFromInputHash is the batch hash. */
export interface AmendPhaseOutputHeader {
  phase: string;
  derivedFromInputHash: string;
  generatedAt: string;
  generator?: string;
}

export interface AmendProvenanceChange {
  intent: AmendIntent;
  pageId: string;
  routesAdded?: Record<string, string>;
  atomIds: string[];
  sectionsAdded?: string[];
}

export interface AmendProvenanceRecord {
  version: 1;
  batch: string;
  targetApp: string;
  inputHash: string;
  acceptedAt: string;
  sources: Array<{ sourceId: string; version: string; file: string; sha256: string }>;
  changes: AmendProvenanceChange[];
  signature: string;
}

interface AmendInputValidationData {
  command: "amend.input.validate";
  site?: string;
  batch?: string;
  status: "pass" | "fail";
  manifestPath?: string;
  inputHash?: string;
  findings: Array<{
    ruleId: string;
    severity: "info" | "warn" | "error";
    file?: string;
    message: string;
  }>;
}

export function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  return undefined;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function sha256(buffer: Buffer | string): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function collectAmendFiles(root: string): Promise<string[]> {
  return collectFilesShared(root, { ignore: () => false });
}

/** Builds the immutable, hashed manifest for one amend batch bundle. */
export async function buildAmendInputManifest(
  workspaceRoot: string,
  batch: string,
  brief: AmendBrief,
): Promise<AmendInputManifest> {
  const batchRoot = join(workspaceRoot, "onboarding", ".input", batch);
  const files = (await collectAmendFiles(batchRoot)).sort((a, b) => a.localeCompare(b));
  const sourceByFile = new Map(brief.sources.map((source) => [source.file, source]));
  const normalizedFiles = await Promise.all(
    files.map(async (filePath) => {
      const raw = await readFile(filePath);
      const info = await stat(filePath);
      const rel = relative(workspaceRoot, filePath).replace(/\\/g, "/");
      const fileName = rel.split("/").pop() ?? rel;
      const source = sourceByFile.get(fileName);
      return {
        path: rel,
        sha256: sha256(raw),
        sizeBytes: info.size,
        sourceId: source?.sourceId,
        version: source?.version,
        intent: source?.intent,
        pageId: source?.pageId,
      };
    }),
  );
  const inputHash = sha256(
    JSON.stringify(
      normalizedFiles.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        sourceId: file.sourceId ?? null,
        version: file.version ?? null,
        intent: file.intent ?? null,
        pageId: file.pageId ?? null,
      })),
    ),
  );
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    batch,
    targetApp: brief.amend.targetApp,
    inputRoot: relative(workspaceRoot, batchRoot).replace(/\\/g, "/"),
    inputHash,
    files: normalizedFiles,
  };
}

/** Reads a batch manifest if present (used by the amend gates for freshness checks). */
export async function readAmendInputManifest(
  workspaceRoot: string,
  batch: string,
): Promise<AmendInputManifest | null> {
  const manifestPath = join(
    workspaceRoot,
    "onboarding",
    ".output",
    batch,
    "a0-intake",
    "input-manifest.json",
  );
  if (!(await pathExists(manifestPath))) return null;
  return JSON.parse(await readFile(manifestPath, "utf8")) as AmendInputManifest;
}

export async function runAmendInputValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AmendInputValidationData>> {
  const findings: AmendInputValidationData["findings"] = [];
  const appName = context.site?.name;
  const batch = readFlag(input, "batch");

  if (!batch || !/^amend-\d{3,}$/.test(batch)) {
    findings.push({
      ruleId: "amend.input.invalid-batch",
      severity: "error",
      message: "--batch must be provided and match amend-<NNN> (e.g. --batch amend-007).",
    });
    return failInput(findings, appName, batch);
  }

  const batchRoot = join(context.workspaceRoot, "onboarding", ".input", batch);
  const briefPath = join(batchRoot, "00-amend-brief.md");
  if (!(await pathExists(briefPath))) {
    findings.push({
      ruleId: "amend.input.missing-brief",
      severity: "error",
      file: `onboarding/.input/${batch}/00-amend-brief.md`,
      message: `Amend batch ${batch} has no 00-amend-brief.md. Amend never reuses the greenfield 00-brief.md bundle.`,
    });
    return failInput(findings, appName, batch);
  }

  let brief: AmendBrief | undefined;
  try {
    const parsed = matter(await readFile(briefPath, "utf8"));
    const result = AmendBrief.safeParse(parsed.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        findings.push({
          ruleId: "amend.input.schema",
          severity: "error",
          file: `onboarding/.input/${batch}/00-amend-brief.md`,
          message: `${issue.path.join(".") || "frontmatter"}: ${issue.message}`,
        });
      }
    } else {
      brief = result.data;
    }
  } catch (error) {
    findings.push({
      ruleId: "amend.input.parse",
      severity: "error",
      file: `onboarding/.input/${batch}/00-amend-brief.md`,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (!brief) return failInput(findings, appName, batch);

  if (brief.amend.batch !== batch) {
    findings.push({
      ruleId: "amend.input.batch-mismatch",
      severity: "error",
      file: `onboarding/.input/${batch}/00-amend-brief.md`,
      message: `amend.batch (${brief.amend.batch}) must equal the batch folder name (${batch}).`,
    });
  }
  if (appName && brief.amend.targetApp !== appName) {
    findings.push({
      ruleId: "amend.input.app-mismatch",
      severity: "error",
      message: `amend.targetApp (${brief.amend.targetApp}) must equal --site (${appName}).`,
    });
  }

  // Inverted precondition (RFC-0135 П-2): the app MUST already exist with a valid system.md.
  const targetApp = appName ?? brief.amend.targetApp;
  const appDir = join(context.workspaceRoot, "apps", targetApp);
  const systemPath = join(appDir, "src", "content", "system.md");
  if (!(await pathExists(systemPath))) {
    findings.push({
      ruleId: "amend.input.app-absent",
      severity: "error",
      message: `apps/${targetApp}/src/content/system.md not found. Amend requires an already-onboarded app (inverse of greenfield 00-prepare).`,
    });
    return failInput(findings, appName, batch);
  }

  let pages: Set<string> = new Set();
  let biome: string | undefined;
  try {
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    biome = manifest.identity?.biome;
    pages = new Set((manifest.pages ?? []).map((page) => page.pageId));
  } catch (error) {
    findings.push({
      ruleId: "amend.input.system-invalid",
      severity: "error",
      file: `apps/${targetApp}/src/content/system.md`,
      message: `Could not load system.md: ${error instanceof Error ? error.message : String(error)}`,
    });
    return failInput(findings, appName, batch);
  }

  if (!biome) {
    findings.push({
      ruleId: "amend.input.biome-unresolved",
      severity: "error",
      file: `apps/${targetApp}/src/content/system.md`,
      message: "system.md identity.biome is missing; amend requires a resolved biome.",
    });
  }

  for (const source of brief.sources) {
    const filePath = join(batchRoot, source.file);
    if (!(await pathExists(filePath))) {
      findings.push({
        ruleId: "amend.input.source-missing",
        severity: "error",
        file: `onboarding/.input/${batch}/${source.file}`,
        message: `Declared source file '${source.file}' (sourceId ${source.sourceId}) is not present in the batch.`,
      });
    }
    if (source.intent === "strengthen" && !pages.has(source.pageId)) {
      findings.push({
        ruleId: "amend.input.strengthen-page-absent",
        severity: "error",
        message: `intent: strengthen names pageId '${source.pageId}' but it is not present in system.md pages[].`,
      });
    }
    if (source.intent === "new-route" && pages.has(source.pageId)) {
      findings.push({
        ruleId: "amend.input.new-route-page-present",
        severity: "error",
        message: `intent: new-route names pageId '${source.pageId}' but it already exists in system.md pages[]. Use strengthen (same locale) or expand-locale (new language) instead.`,
      });
    }
    if (source.intent === "expand-locale" && !pages.has(source.pageId)) {
      findings.push({
        ruleId: "amend.input.expand-locale-page-absent",
        severity: "error",
        message: `intent: expand-locale names pageId '${source.pageId}' but it is not present in system.md pages[]. Use new-route to create it first.`,
      });
    }
  }

  if (findings.some((finding) => finding.severity === "error")) {
    return failInput(findings, appName, batch);
  }

  const manifest = await buildAmendInputManifest(context.workspaceRoot, batch, brief);
  const manifestDir = join(context.workspaceRoot, "onboarding", ".output", batch, "a0-intake");
  const manifestPath = join(manifestDir, "input-manifest.json");
  await mkdir(manifestDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    data: {
      command: "amend.input.validate",
      site: appName,
      batch,
      status: "pass",
      manifestPath: relative(context.workspaceRoot, manifestPath).replace(/\\/g, "/"),
      inputHash: manifest.inputHash,
      findings,
    },
    exitCode: 0,
    summary: `amend.input.validate: OK (${batch}, ${manifest.files.length} file(s))`,
  };
}

function failInput(
  findings: AmendInputValidationData["findings"],
  site: string | undefined,
  batch: string | undefined,
): KernelCommandResult<AmendInputValidationData> {
  return {
    data: { command: "amend.input.validate", site, batch, status: "fail", findings },
    exitCode: 1,
    summary: `amend.input.validate: ${findings.filter((f) => f.severity === "error").length} violation(s)`,
  };
}
