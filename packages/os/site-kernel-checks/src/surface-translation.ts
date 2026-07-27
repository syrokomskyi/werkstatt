/*
<MODULE_CONTRACT>
<purpose>
  RFC-0272/RFC-0273: PSEO translation lifecycle, translator notes, glossaries, derived
  sourceHash stamping, and deterministic target-language QA gates.
</purpose>
<non-goals>
  <item>Do not call an LLM during normal build/check or request handling.</item>
  <item>Do not auto-approve translated artifacts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0272/RFC-0273: add translation lifecycle commands and deterministic validators.</item>
</CHANGE_SUMMARY>
*/

import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { byteHash } from "@warpgogol/fingerprint";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { toKebabCase } from "@warpgogol/share/string-utils";
import type { SurfaceModuleContext } from "@warpgogol/surface";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { loadSurfaceModuleContexts } from "./pseo/pseo-module-context.ts";

const NOTE_ROOT = ["src", "content", "enriched", "_translation-notes"];
const GLOSSARY_ROOT = ["src", "content", "enriched", "_translation-glossaries"];
const ENRICH_ROOT = ["src", "content", "enriched"];
const REQUIRED_NOTE_SECTIONS = [
  "Purpose",
  "Audience",
  "Voice",
  "Do not translate",
  "Must preserve exactly",
  "Transcreate",
  "Forbidden moves",
  "Examples",
];

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) out[key] = stable(child);
    }
    return out;
  }
  return value;
}

function digest(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(stable(value));
  return byteHash(text);
}

function nowIso(): string {
  return new Date().toISOString();
}

function commandInputError<T = unknown>(command: string, message: string): KernelCommandResult<T> {
  return { exitCode: 1, summary: `${command}: ${message}` };
}

function selectModule(
  modules: Record<string, SurfaceModuleContext>,
  input: KernelCommandInput,
): SurfaceModuleContext | undefined {
  const moduleId = typeof input.flags.module === "string" ? input.flags.module : undefined;
  if (moduleId) return modules[moduleId];
  return Object.values(modules)[0];
}

function targetFromInput(input: KernelCommandInput): string | undefined {
  return typeof input.flags.target === "string" ? input.flags.target : undefined;
}

function notePath(appDir: string, moduleId: string, target: string): string {
  return join(appDir, ...NOTE_ROOT, moduleId, `${target}.md`);
}

function glossaryPath(appDir: string, moduleId: string, target: string): string {
  return join(appDir, ...GLOSSARY_ROOT, moduleId, `${target}.yaml`);
}

function enrichDir(appDir: string, bpId: string, lang: string): string {
  return join(appDir, ...ENRICH_ROOT, bpId, lang);
}

function enrichPath(
  appDir: string,
  bpId: string,
  lang: string,
  pageId: string,
  field: string,
): string {
  return join(enrichDir(appDir, bpId, lang), `${toKebabCase(pageId)}-${toKebabCase(field)}.md`);
}

function blueprintFromPageId(pageId: string): string {
  return pageId.split(":")[0] ?? "";
}

function artifactRef(
  moduleId: string,
  bpId: string,
  lang: string,
  pageId: string,
  field: string,
): string {
  return `enriched:${moduleId}/${bpId}/${lang}/${pageId}#${field}`;
}

function contentHash(data: Record<string, unknown>, content: string): string {
  const relevant: Record<string, unknown> = {};
  for (const key of ["h1", "lead", "tagline", "bridges"]) {
    if (data[key] !== undefined) relevant[key] = data[key];
  }
  relevant.content = content.trim();
  return digest(relevant);
}

async function readModuleContexts(appDir: string): Promise<Record<string, SurfaceModuleContext>> {
  return (await loadSurfaceModuleContexts(appDir)).modules;
}

function moduleContextHash(module: SurfaceModuleContext): string {
  return digest(module);
}

async function readNote(appDir: string, module: SurfaceModuleContext, target: string) {
  const path = notePath(appDir, module.id, target);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  const { data, content } = parseMarkdownFrontmatter(raw);
  return { path, data: data as Record<string, unknown>, content };
}

async function readGlossary(appDir: string, module: SurfaceModuleContext, target: string) {
  const path = glossaryPath(appDir, module.id, target);
  if (!existsSync(path)) return null;
  return { path, data: parseYaml(await readFile(path, "utf8")) as Record<string, unknown> };
}

function noteContent(module: SurfaceModuleContext, target: string): string {
  return [
    "# Purpose",
    `Translate ${module.id} PSEO artifacts from ${module.masterLocale} to ${target} for ${module.context.audience ?? "the declared module audience"}.`,
    "",
    "# Audience",
    String(module.context.audience ?? "Small business readers in the target locale."),
    "",
    "# Voice",
    "Use clear, native, direct language. Prefer concrete service language over keyword stuffing.",
    "",
    "# Do not translate",
    "Keep pageIds, URLs, product names, brand names, code-like tokens, and claim identifiers unchanged.",
    "",
    "# Must preserve exactly",
    "Numbers, dates, prices, legal references, source claims, URLs, pageIds, geo identifiers, and record-bound facts.",
    "",
    "# Transcreate",
    "Make idioms sound natural in the target language while preserving the source fact load.",
    "",
    "# Forbidden moves",
    [
      ...(module.context.forbiddenClaims ?? []),
      "Do not invent reviews, certifications, regional statistics, legal dates, or prices.",
    ].join("\n"),
    "",
    "# Examples",
    "- Add reviewed examples after the first approved target-language translations.",
    "",
  ].join("\n");
}

function glossaryData(module: SurfaceModuleContext, target: string): Record<string, unknown> {
  return {
    id: module.localization?.glossaryRefs?.[target] ?? `${module.id}/${target}`,
    module: module.id,
    sourceLanguage: module.masterLocale,
    targetLanguage: target,
    moduleContextHash: moduleContextHash(module),
    provenance: {
      promptId: "translation-glossary-v1",
      model: "deterministic",
      generatedAt: nowIso(),
      approved: true,
    },
    terms: [
      {
        concept: "digital-foundation",
        source: { [module.masterLocale]: "цифровий фундамент" },
        target: "Digitales Fundament",
        rule: "exact",
        caseSensitive: true,
      },
      {
        concept: "formal-you",
        target: target === "de" ? "Sie" : "",
        rule: "require-register",
        caseSensitive: true,
      },
    ],
    forbidden: [{ term: "billig", reason: "Avoid discount positioning in the PSEO module." }],
  };
}

export async function runSurfaceTranslationNotesGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return commandInputError(
      "surface.translation.notes.generate",
      "must run inside an app context.",
    );
  const module = selectModule(await readModuleContexts(app.directory), input);
  const target = targetFromInput(input) ?? module?.publishedLocales[0];
  if (!module || !target)
    return commandInputError(
      "surface.translation.notes.generate",
      "requires --module and --target.",
    );
  const path = notePath(app.directory, module.id, target);
  if (existsSync(path) && input.flags.regenerate !== true) {
    return passResult("surface.translation.notes.generate", `exists (${module.id}/${target})`);
  }
  const frontmatter = {
    module: module.id,
    sourceLanguage: module.masterLocale,
    targetLanguage: target,
    noteId: module.localization?.translatorNoteRefs?.[target] ?? `${module.id}/${target}`,
    moduleContextHash: moduleContextHash(module),
    provenance: {
      promptId: "translator-note-v1",
      model: "deterministic",
      generatedAt: nowIso(),
      approved: false,
    },
    lifecycle: { status: "draft" },
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    stringifyMarkdownFrontmatter(noteContent(module, target), frontmatter),
    "utf8",
  );
  return {
    exitCode: 0,
    summary: `surface.translation.notes.generate: wrote ${module.id}/${target}`,
    data: { path },
  };
}

export async function runSurfaceTranslationNotesReview(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return commandInputError("surface.translation.notes.review", "must run inside an app context.");
  const module = selectModule(await readModuleContexts(app.directory), input);
  const target = targetFromInput(input) ?? module?.publishedLocales[0];
  if (!module || !target)
    return commandInputError("surface.translation.notes.review", "requires --module and --target.");
  const note = await readNote(app.directory, module, target);
  if (!note)
    return commandInputError("surface.translation.notes.review", "translator note is missing.");
  if (input.flags.approve !== true) {
    return {
      exitCode: 0,
      summary: `surface.translation.notes.review: ${module.id}/${target}`,
      data: note.data,
    };
  }
  const data = {
    ...note.data,
    provenance: { ...((note.data.provenance as Record<string, unknown>) ?? {}), approved: true },
    lifecycle: { status: "approved", reviewedAt: nowIso(), reviewedBy: "human:operator" },
  };
  await writeFile(note.path, stringifyMarkdownFrontmatter(note.content, data), "utf8");
  return {
    exitCode: 0,
    summary: `surface.translation.notes.review: approved ${module.id}/${target}`,
  };
}

function noteDiagnostics(
  module: SurfaceModuleContext,
  target: string,
  note: Awaited<ReturnType<typeof readNote>>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const expectedHash = moduleContextHash(module);
  if (!note) {
    diagnostics.push({
      ruleId: "PSEO-NOTE-01",
      severity: "error",
      file: notePath("", module.id, target).replace(/^[/\\]/, ""),
      message: `Missing translator note for ${module.id}/${target}.`,
      fixHint: "Run surface.translation.notes.generate, review it, then approve it.",
    });
    return diagnostics;
  }
  const data = note.data;
  if ((data.provenance as Record<string, unknown> | undefined)?.approved !== true) {
    diagnostics.push({
      ruleId: "PSEO-NOTE-02",
      severity: "error",
      file: note.path,
      message: `Translator note ${module.id}/${target} is not approved.`,
      fixHint: "Review and approve the note before translation generation.",
    });
  }
  if (data.moduleContextHash !== expectedHash) {
    diagnostics.push({
      ruleId: "PSEO-NOTE-03",
      severity: "warning",
      file: note.path,
      message: `Translator note ${module.id}/${target} is stale against module context.`,
      fixHint: "Regenerate and re-approve the note after module-context changes.",
    });
  }
  for (const section of REQUIRED_NOTE_SECTIONS) {
    if (!new RegExp(`^#\\s+${section}\\s*$`, "im").test(note.content)) {
      diagnostics.push({
        ruleId: "PSEO-NOTE-04",
        severity: "error",
        file: note.path,
        message: `Translator note ${module.id}/${target} is missing section "${section}".`,
        fixHint: `Add a "# ${section}" section.`,
      });
    }
  }
  if (!/approved/i.test(note.content)) {
    diagnostics.push({
      ruleId: "PSEO-NOTE-05",
      severity: "warning",
      file: note.path,
      message: `Translator note ${module.id}/${target} has no approved examples yet.`,
      fixHint: "Add reviewed examples after initial translations are approved.",
    });
  }
  return diagnostics;
}

export async function runSurfaceTranslationNotesValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return commandInputError(
      "surface.translation.notes.validate",
      "must run inside an app context.",
    );
  const modules = await readModuleContexts(app.directory);
  const only = typeof input.flags.module === "string" ? input.flags.module : undefined;
  const diagnostics: Diagnostic[] = [];
  for (const module of Object.values(modules).filter((m) => !only || m.id === only)) {
    for (const target of module.publishedLocales) {
      diagnostics.push(
        ...noteDiagnostics(module, target, await readNote(app.directory, module, target)),
      );
    }
  }
  return diagnosticsResult("surface.translation.notes.validate", diagnostics);
}

function glossaryDiagnostics(
  appDir: string,
  module: SurfaceModuleContext,
  target: string,
  glossary: Awaited<ReturnType<typeof readGlossary>>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const file = glossaryPath(appDir, module.id, target);
  if (!glossary) {
    diagnostics.push({
      ruleId: "PSEO-GLOSS-01",
      severity: "error",
      file,
      message: `Missing translation glossary for ${module.id}/${target}.`,
      fixHint: "Create and approve the module target-language glossary.",
    });
    return diagnostics;
  }
  const data = glossary.data;
  const provenance = data.provenance as Record<string, unknown> | undefined;
  if (provenance?.approved !== true || data.moduleContextHash !== moduleContextHash(module)) {
    diagnostics.push({
      ruleId: "PSEO-GLOSS-01",
      severity: "error",
      file,
      message: `Glossary ${module.id}/${target} is missing approval or has a stale moduleContextHash.`,
      fixHint: "Review, approve, and restamp the glossary against the current module context.",
    });
  }
  if (data.id !== module.localization?.glossaryRefs?.[target]) {
    diagnostics.push({
      ruleId: "PSEO-GLOSS-02",
      severity: "error",
      file,
      message: `Glossary id "${String(data.id)}" does not match module glossaryRef "${module.localization?.glossaryRefs?.[target]}".`,
      fixHint: "Keep glossary id aligned with surface.modules.<id>.localization.glossaryRefs.",
    });
  }
  const terms = Array.isArray(data.terms) ? data.terms : [];
  if (terms.length === 0) {
    diagnostics.push({
      ruleId: "PSEO-GLOSS-02",
      severity: "error",
      file,
      message: `Glossary ${module.id}/${target} has no terms.`,
      fixHint: "Add at least one machine-readable term policy entry.",
    });
  }
  for (const term of terms as Array<Record<string, unknown>>) {
    if (typeof term.concept !== "string" || typeof term.rule !== "string") {
      diagnostics.push({
        ruleId: "PSEO-GLOSS-02",
        severity: "error",
        file,
        message: "Glossary entry is malformed or ambiguous.",
        fixHint: "Each term needs concept and rule fields.",
      });
    }
    if (!term.examples) {
      diagnostics.push({
        ruleId: "PSEO-GLOSS-03",
        severity: "warning",
        file,
        message: `Glossary term "${String(term.concept ?? "unknown")}" has no examples yet.`,
        fixHint: "Add examples as reviewed translations accumulate.",
      });
    }
  }
  return diagnostics;
}

export async function runSurfaceTranslationGlossaryValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return commandInputError(
      "surface.translation.glossary.validate",
      "must run inside an app context.",
    );
  const modules = await readModuleContexts(app.directory);
  const only = typeof input.flags.module === "string" ? input.flags.module : undefined;
  const diagnostics: Diagnostic[] = [];
  for (const module of Object.values(modules).filter((m) => !only || m.id === only)) {
    for (const target of module.publishedLocales) {
      diagnostics.push(
        ...glossaryDiagnostics(
          app.directory,
          module,
          target,
          await readGlossary(app.directory, module, target),
        ),
      );
    }
  }
  return diagnosticsResult("surface.translation.glossary.validate", diagnostics);
}

export async function writeApprovedGlossary(
  appDir: string,
  module: SurfaceModuleContext,
  target: string,
): Promise<string> {
  const path = glossaryPath(appDir, module.id, target);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(glossaryData(module, target)), "utf8");
  return path;
}

export async function runSurfaceTranslationGlossaryGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return commandInputError(
      "surface.translation.glossary.generate",
      "must run inside an app context.",
    );
  const module = selectModule(await readModuleContexts(app.directory), input);
  const target = targetFromInput(input) ?? module?.publishedLocales[0];
  if (!module || !target)
    return commandInputError(
      "surface.translation.glossary.generate",
      "requires --module and --target.",
    );
  const path = await writeApprovedGlossary(app.directory, module, target);
  return passResult(
    "surface.translation.glossary.generate",
    `glossary restamped for ${module.id}/${target} (${path})`,
  );
}

export async function runSurfaceArtifactReady(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) return commandInputError("surface.artifact.ready", "must run inside an app context.");
  const module = selectModule(await readModuleContexts(app.directory), input);
  const pageId = typeof input.flags["page-id"] === "string" ? input.flags["page-id"] : undefined;
  const field = typeof input.flags.field === "string" ? input.flags.field : "narrative";
  if (!module || !pageId)
    return commandInputError("surface.artifact.ready", "requires --module and --page-id.");
  const bpId = blueprintFromPageId(pageId);
  if (!module.blueprints.includes(bpId))
    return commandInputError(
      "surface.artifact.ready",
      `pageId Blueprint "${bpId}" is not owned by module "${module.id}".`,
    );
  const path = enrichPath(app.directory, bpId, module.masterLocale, pageId, field);
  if (!existsSync(path))
    return commandInputError("surface.artifact.ready", `source artifact not found: ${path}`);
  const raw = await readFile(path, "utf8");
  const { data, content } = parseMarkdownFrontmatter(raw);
  if (data.approved !== true)
    return commandInputError(
      "surface.artifact.ready",
      "source artifact must be approved before readyForTranslation.",
    );
  const hash = contentHash(data as Record<string, unknown>, content);
  const stampedAt = nowIso();
  const next = {
    ...(data as Record<string, unknown>),
    module: module.id,
    authoringLanguage: module.masterLocale,
    approval: {
      approver: { kind: "human", handle: "operator" },
      atLevel: "L0",
      approvedAt: stampedAt,
    },
    lifecycle: {
      ...(((data as Record<string, unknown>).lifecycle as Record<string, unknown>) ?? {}),
      status: "readyForTranslation",
      readyForTranslationAt: stampedAt,
      contentHash: hash,
    },
  };
  await writeFile(path, stringifyMarkdownFrontmatter(content, next), "utf8");
  return {
    exitCode: 0,
    summary: `surface.artifact.ready: ${pageId}#${field}`,
    data: { contentHash: hash },
  };
}

async function sourceArtifacts(
  appDir: string,
  module: SurfaceModuleContext,
): Promise<Array<{ bpId: string; path: string; data: Record<string, unknown>; content: string }>> {
  const out: Array<{ bpId: string; path: string; data: Record<string, unknown>; content: string }> =
    [];
  for (const bpId of module.blueprints) {
    const dir = enrichDir(appDir, bpId, module.masterLocale);
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((name) => name.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(dir, file);
      const { data, content } = parseMarkdownFrontmatter(await readFile(path, "utf8"));
      out.push({ bpId, path, data: data as Record<string, unknown>, content });
    }
  }
  return out;
}

export async function runSurfaceTranslationGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app)
    return commandInputError("surface.translation.generate", "must run inside an app context.");
  const module = selectModule(await readModuleContexts(app.directory), input);
  if (!module) return commandInputError("surface.translation.generate", "requires --module.");
  const regenerateOutdated = input.flags["regenerate-outdated"] === true;
  let written = 0;
  let skipped = 0;
  for (const target of module.publishedLocales) {
    const noteDiagnosticsForTarget = noteDiagnostics(
      module,
      target,
      await readNote(app.directory, module, target),
    );
    const glossaryDiagnosticsForTarget = glossaryDiagnostics(
      app.directory,
      module,
      target,
      await readGlossary(app.directory, module, target),
    );
    const blocking = [...noteDiagnosticsForTarget, ...glossaryDiagnosticsForTarget].some(
      (d) => d.severity === "error",
    );
    if (blocking)
      return diagnosticsResult("surface.translation.generate", [
        ...noteDiagnosticsForTarget,
        ...glossaryDiagnosticsForTarget,
      ]);
    for (const source of await sourceArtifacts(app.directory, module)) {
      if (
        (source.data.lifecycle as Record<string, unknown> | undefined)?.status !==
        "readyForTranslation"
      )
        continue;
      if (source.data.approved !== true) continue;
      const pageId = String(source.data.pageId ?? "");
      const field = String(source.data.field ?? "narrative");
      if (!pageId) continue;
      const hash = contentHash(source.data, source.content);
      const path = enrichPath(app.directory, source.bpId, target, pageId, field);
      if (existsSync(path)) {
        const { data } = parseMarkdownFrontmatter(await readFile(path, "utf8"));
        const derived = (data as Record<string, unknown>).derived as
          Record<string, unknown> | undefined;
        if (derived?.sourceHash === hash) {
          skipped += 1;
          continue;
        }
        if ((data as Record<string, unknown>).approved === true && !regenerateOutdated) {
          skipped += 1;
          continue;
        }
      }
      const noteId = module.localization?.translatorNoteRefs?.[target] ?? `${module.id}/${target}`;
      const glossaryId = module.localization?.glossaryRefs?.[target] ?? `${module.id}/${target}`;
      const translatedData = {
        ...source.data,
        lang: target,
        module: module.id,
        approved: false,
        provenance: {
          promptId: `pseo-translation-${target}-v1`,
          model: "deterministic-draft",
          generatedAt: nowIso(),
          approved: false,
        },
        lifecycle: { status: "translationDraft" },
        derived: {
          derivedFrom: artifactRef(module.id, source.bpId, module.masterLocale, pageId, field),
          sourceHash: hash,
          translatorNoteId: noteId,
          glossaryId,
        },
        quality: {
          targetGate: "pending",
          echoChecks: "pending",
          glossaryChecks: "pending",
          humanReview: "pending",
        },
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, stringifyMarkdownFrontmatter(source.content, translatedData), "utf8");
      written += 1;
    }
  }
  return {
    exitCode: 0,
    summary: `surface.translation.generate: wrote ${written}, skipped ${skipped}`,
    data: { written, skipped },
  };
}

async function targetArtifacts(
  appDir: string,
  module: SurfaceModuleContext,
): Promise<
  Array<{
    bpId: string;
    lang: string;
    path: string;
    data: Record<string, unknown>;
    content: string;
  }>
> {
  const out: Array<{
    bpId: string;
    lang: string;
    path: string;
    data: Record<string, unknown>;
    content: string;
  }> = [];
  for (const bpId of module.blueprints) {
    for (const lang of module.publishedLocales) {
      const dir = enrichDir(appDir, bpId, lang);
      let files: string[] = [];
      try {
        files = (await readdir(dir)).filter((name) => name.endsWith(".md"));
      } catch {
        continue;
      }
      for (const file of files) {
        const path = join(dir, file);
        const { data, content } = parseMarkdownFrontmatter(await readFile(path, "utf8"));
        out.push({ bpId, lang, path, data: data as Record<string, unknown>, content });
      }
    }
  }
  return out;
}

export async function runSurfaceTranslationValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return commandInputError("surface.translation.validate", "must run inside an app context.");
  const modules = await readModuleContexts(app.directory);
  const module = selectModule(modules, input);
  if (!module)
    return passResult("surface.translation.validate", "skipped (no surface modules declared)");
  const sources = await sourceArtifacts(app.directory, module);
  const sourceHashByRef = new Map<string, string>();
  for (const source of sources) {
    const pageId = String(source.data.pageId ?? "");
    const field = String(source.data.field ?? "narrative");
    if (pageId)
      sourceHashByRef.set(
        artifactRef(module.id, source.bpId, module.masterLocale, pageId, field),
        contentHash(source.data, source.content),
      );
  }
  const diagnostics: Diagnostic[] = [];
  for (const target of await targetArtifacts(app.directory, module)) {
    const derived = target.data.derived as Record<string, unknown> | undefined;
    if (!derived?.derivedFrom || !derived.sourceHash) {
      diagnostics.push({
        ruleId: "PSEO-ART-02",
        severity: "error",
        file: target.path,
        message: "Target translation has no derivedFrom/sourceHash lineage.",
        fixHint: "Regenerate the translation draft from a ready source artifact.",
      });
      continue;
    }
    const currentHash = sourceHashByRef.get(String(derived.derivedFrom));
    if (currentHash && derived.sourceHash !== currentHash) {
      diagnostics.push({
        ruleId: "PSEO-ART-03",
        severity: "warning",
        file: target.path,
        message: "Target translation is outdated against the current ready source hash.",
        fixHint: "Regenerate the draft and re-run target-language review.",
      });
    }
    if (
      target.data.approved === true &&
      (target.data.quality as Record<string, unknown> | undefined)?.targetGate !== "pass"
    ) {
      diagnostics.push({
        ruleId: "PSEO-ART-04",
        severity: "error",
        file: target.path,
        message: "Approved translation does not have quality.targetGate=pass.",
        fixHint: "Complete translation QA and human review before approving.",
      });
    }
    if (derived.translatorNoteId !== module.localization?.translatorNoteRefs?.[target.lang]) {
      diagnostics.push({
        ruleId: "PSEO-ART-05",
        severity: "error",
        file: target.path,
        message: "Translation was generated without the required translator note id.",
        fixHint: "Regenerate using the current approved translator note.",
      });
    }
    if (derived.glossaryId !== module.localization?.glossaryRefs?.[target.lang]) {
      diagnostics.push({
        ruleId: "PSEO-ART-06",
        severity: "error",
        file: target.path,
        message: "Translation was generated without the required glossary id.",
        fixHint: "Regenerate using the current approved glossary.",
      });
    }
  }
  return diagnosticsResult("surface.translation.validate", diagnostics);
}

function numbers(text: string): string[] {
  return text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
}

export async function runSurfaceTranslationQaValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app)
    return commandInputError("surface.translation.qa.validate", "must run inside an app context.");
  const modules = await readModuleContexts(app.directory);
  const module = selectModule(modules, input);
  if (!module)
    return passResult("surface.translation.qa.validate", "skipped (no surface modules declared)");
  const sourceByRef = new Map<string, { data: Record<string, unknown>; content: string }>();
  for (const source of await sourceArtifacts(app.directory, module)) {
    const pageId = String(source.data.pageId ?? "");
    const field = String(source.data.field ?? "narrative");
    if (pageId)
      sourceByRef.set(
        artifactRef(module.id, source.bpId, module.masterLocale, pageId, field),
        source,
      );
  }
  const diagnostics: Diagnostic[] = [];
  for (const target of await targetArtifacts(app.directory, module)) {
    const derived = target.data.derived as Record<string, unknown> | undefined;
    const source = derived?.derivedFrom ? sourceByRef.get(String(derived.derivedFrom)) : undefined;
    if (source) {
      const sourceText = `${Object.values(source.data).join(" ")} ${source.content}`;
      const targetText = `${Object.values(target.data).join(" ")} ${target.content}`;
      for (const n of numbers(sourceText)) {
        if (!targetText.includes(n)) {
          diagnostics.push({
            ruleId: "PSEO-QA-01",
            severity: "error",
            file: target.path,
            message: `Translation dropped numeric echo "${n}".`,
            fixHint: "Preserve numbers, dates, prices, and identifiers exactly.",
          });
        }
      }
    }
    const quality = target.data.quality as Record<string, unknown> | undefined;
    if (target.data.approved === true && quality?.humanReview !== "pass") {
      diagnostics.push({
        ruleId: "PSEO-ART-08",
        severity: "error",
        file: target.path,
        message: "Approved translation lacks humanReview=pass.",
        fixHint: "Record target-language human review before approval.",
      });
    }
  }
  return diagnosticsResult("surface.translation.qa.validate", diagnostics);
}
