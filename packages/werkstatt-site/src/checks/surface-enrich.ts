import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0197] Build-time, frozen, provenanced LLM enrichment for the Programmatic Surface.
  surface.enrich generates a Blueprint's enrichedFields once per live tuple via an INJECTED provider
  (no LLM SDK here), writing each result as a content-source entry with full provenance and an
  `approved: false` gate. Normal builds read only approved entries (loadApprovedEnriched); unapproved
  text never renders. enrich.validate checks provenance shape + approval. Generation is idempotent and
  never on the build.check path. Removing the provider leaves the site buildable from frozen content.
</purpose>
<non-goals>
  <item>Do not call an LLM at build/request time — generation is an explicit, separate step.</item>
  <item>Do not render unapproved text.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0197: initial implementation with a deterministic stub provider.</item>
  <item>RFC-0244: derive neutral slug from relative path for nested demand records; `slug:` frontmatter optional override; legacy basename fallback for flat files.</item>
  <item>RFC-0602: replace volatile generatedAt with null in enrichment provenance.</item>
</CHANGE_SUMMARY>
*/

import { basename, join, relative } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { toKebabCase } from "@warpgogol/werkstatt-site/share/string-utils";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import {
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { parseBlueprint, type Blueprint, type SurfaceNarrative } from "@warpgogol/werkstatt-site/surface";
import { failResult, passResult } from "./result-helpers.ts";
import { loadSurfaceModuleContexts } from "./pseo/pseo-module-context.ts";

/**
 * Injected enrichment provider. The result carries either a plain `value` (kind:"field") or a
 * structured `narrative` (kind:"narrative"). Real deployments use the Claude-backed implementation
 * selected by `selectEnrichProvider` when ANTHROPIC_API_KEY is set; otherwise the deterministic stub.
 */
export type EnrichProvider = (input: {
  promptId: string;
  maxTokens: number;
  kind: "field" | "narrative";
  lang: string;
  vars: Record<string, string>;
}) => Promise<{ value?: string; narrative?: SurfaceNarrative; model: string }>;

/**
 * Default provider: a deterministic, network-free stub so the mechanism is exercisable without a key
 * and the build stays green in CI. It composes plausible prose from the record vars. The real
 * provider (selectEnrichProvider) replaces it when a key is present.
 */
const stubProvider: EnrichProvider = async ({ kind, vars }) => {
  const industry = vars.industry ?? "Betriebe";
  const city = vars.city ?? "der Region";
  if (kind === "narrative") {
    return {
      model: "stub-deterministic",
      narrative: {
        h1: `Website für ${industry} in ${city}`,
        lead:
          `Wir geben ${industry} in ${city} ein digitales Fundament, das Leistungen, Einzugsgebiet und ` +
          `Erreichbarkeit sofort verständlich macht.`,
        tagline: `Lokal sichtbar, schnell erreichbar.`,
        bridges: [
          {
            heading: `${industry} in ${city}: worauf es ankommt`,
            body:
              `In ${city} gewinnt der Betrieb, der seinen lokalen Bezug klar zeigt und schnell ` +
              `reagiert — genau das stellt die Seite in den Vordergrund.`,
          },
        ],
      },
    };
  }
  return {
    model: "stub-deterministic",
    value:
      `In ${city} entscheidet bei ${industry}-Anfragen vor allem die Kombination aus lokaler Nähe und ` +
      `schneller Reaktion. Eine eindeutige Standortzuordnung und Belege aus dem direkten Umfeld erhöhen ` +
      `die Anfragequote spürbar — generische Auftritte ohne lokalen Bezug fallen dagegen zurück.`,
  };
};

/** The latest Claude model id used for real enrichment generation. */
const CLAUDE_MODEL = "claude-opus-4-8";

/**
 * RFC-0207: a real Claude-backed provider. Used only when ANTHROPIC_API_KEY is set; never on the
 * build.check path (surface.enrich is an explicit, offline step). It loads the reviewed prompt
 * template, fills `{axis.field}` vars, and asks for the field value (narrative → strict JSON). Output
 * is always written `approved:false` for human review, so a malformed/low-quality response can never
 * reach a rendered page.
 */
function createClaudeProvider(apiKey: string): EnrichProvider {
  return async ({ promptId, maxTokens, kind, lang, vars }) => {
    const promptPath = join("packages", "werkstatt-site", "src", "domain", "ontology", "blueprints", "prompts", `${promptId}.md`);
    let template = "";
    try {
      template = await readFile(promptPath, "utf8");
    } catch {
      /* prompt file optional — fall through with an empty template */
    }
    const filled = template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => vars[key] ?? "");
    const instruction =
      kind === "narrative"
        ? `${filled}\n\nReturn ONLY minified JSON: {"h1":"…","lead":"…","tagline":"…","bridges":[{"heading":"…","body":"…"}]}. Target language: ${lang}.`
        : `${filled}\n\nReturn ONLY the text. Target language: ${lang}.`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: instruction }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = (json.content ?? [])
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (kind === "narrative") {
      const parsed = yamlParse(text) as SurfaceNarrative;
      return { model: CLAUDE_MODEL, narrative: parsed };
    }
    return { model: CLAUDE_MODEL, value: text };
  };
}

/**
 * Select the enrichment provider: the real Claude provider when ANTHROPIC_API_KEY is present,
 * otherwise the deterministic stub. Keeps the stub the default so CI/build.check stay green and
 * deterministic with no key.
 */
export function selectEnrichProvider(): EnrichProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? createClaudeProvider(key) : stubProvider;
}

const ENRICH_ROOT = ["src", "content", "enriched"];

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
  // Kebab-case filename (no underscores/dots) so content naming.convention.lint passes.
  return join(enrichDir(appDir, bpId, lang), `${toKebabCase(pageId)}-${toKebabCase(field)}.md`);
}

function approvedForRender(data: Record<string, unknown>): boolean {
  if (data.approved !== true) return false;
  const derived = data.derived as Record<string, unknown> | undefined;
  const quality = data.quality as Record<string, unknown> | undefined;
  if (derived && quality?.targetGate !== "pass") return false;
  return true;
}

/** Read an approved enriched value for a page+field. Returns null when absent or unapproved. */
export async function loadApprovedEnriched(
  appDir: string,
  bpId: string,
  lang: string,
  pageId: string,
  field: string,
): Promise<string | null> {
  const path = enrichPath(appDir, bpId, lang, pageId, field);
  if (!existsSync(path)) return null;
  try {
    const { data, content } = parseMarkdownFrontmatter(await readFile(path, "utf8"));
    if (!approvedForRender(data as Record<string, unknown>)) return null;
    return content.trim() || null;
  } catch {
    return null;
  }
}

/**
 * RFC-0207: read an approved structured narrative (kind:"narrative") for a page+field+lang. The
 * h1/lead/tagline/bridges live in the entry's frontmatter (provenance + approval alongside). Returns
 * null when absent, unapproved, or lacking a non-empty h1/lead — so an incomplete entry never renders.
 */
export async function loadApprovedNarrative(
  appDir: string,
  bpId: string,
  lang: string,
  pageId: string,
  field = "narrative",
): Promise<SurfaceNarrative | null> {
  const path = enrichPath(appDir, bpId, lang, pageId, field);
  if (!existsSync(path)) return null;
  try {
    const { data } = parseMarkdownFrontmatter(await readFile(path, "utf8"));
    if (!approvedForRender(data as Record<string, unknown>)) return null;
    const h1 = typeof data.h1 === "string" ? data.h1.trim() : "";
    const lead = typeof data.lead === "string" ? data.lead.trim() : "";
    if (!h1 || !lead) return null;
    const tagline = typeof data.tagline === "string" ? data.tagline.trim() : undefined;
    const bridges = Array.isArray(data.bridges)
      ? (data.bridges as Array<Record<string, unknown>>)
          .map((b) => ({
            heading: typeof b.heading === "string" ? b.heading : "",
            body: typeof b.body === "string" ? b.body : "",
          }))
          .filter((b) => b.heading && b.body)
      : undefined;
    return { h1, lead, ...(tagline ? { tagline } : {}), ...(bridges?.length ? { bridges } : {}) };
  } catch {
    return null;
  }
}

/**
 * Bulk-read all approved narratives for a blueprint+lang in a single directory scan.
 * Returns a map keyed by `${toKebabCase(pageId)}-${toKebabCase(field)}` (without .md).
 */
export async function loadApprovedNarrativesBulk(
  appDir: string,
  bpId: string,
  lang: string,
): Promise<Map<string, SurfaceNarrative>> {
  const dir = enrichDir(appDir, bpId, lang);
  const result = new Map<string, SurfaceNarrative>();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return result;
  }
  for (const file of files) {
    const base = file.replace(/\.md$/, "");
    try {
      const { data } = parseMarkdownFrontmatter(await readFile(join(dir, file), "utf8"));
      if (!approvedForRender(data as Record<string, unknown>)) continue;
      const h1 = typeof data.h1 === "string" ? data.h1.trim() : "";
      const lead = typeof data.lead === "string" ? data.lead.trim() : "";
      if (!h1 || !lead) continue;
      const tagline = typeof data.tagline === "string" ? data.tagline.trim() : undefined;
      const bridges = Array.isArray(data.bridges)
        ? (data.bridges as Array<Record<string, unknown>>)
            .map((b) => ({
              heading: typeof b.heading === "string" ? b.heading : "",
              body: typeof b.body === "string" ? b.body : "",
            }))
            .filter((b) => b.heading && b.body)
        : undefined;
      result.set(base, {
        h1,
        lead,
        ...(tagline ? { tagline } : {}),
        ...(bridges?.length ? { bridges } : {}),
      });
    } catch {
      continue;
    }
  }
  return result;
}

/**
 * Bulk-read all approved enriched string fields for a blueprint+lang in a single directory scan.
 * Returns a map keyed by `${toKebabCase(pageId)}-${toKebabCase(field)}` (without .md) → trimmed content.
 */
export async function loadApprovedEnrichedBulk(
  appDir: string,
  bpId: string,
  lang: string,
): Promise<Map<string, string>> {
  const dir = enrichDir(appDir, bpId, lang);
  const result = new Map<string, string>();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return result;
  }
  for (const file of files) {
    const base = file.replace(/\.md$/, "");
    try {
      const { data, content } = parseMarkdownFrontmatter(await readFile(join(dir, file), "utf8"));
      if (!approvedForRender(data as Record<string, unknown>)) continue;
      result.set(base, content.trim() || "");
    } catch {
      continue;
    }
  }
  return result;
}

// --- dataset reading (local, to avoid a cycle with surface-expand) ---------------------------------

interface DatasetEntry {
  slug: string;
  data: Record<string, unknown>;
}

async function loadDataset(
  appDir: string,
  collection: string,
  lang: string,
): Promise<DatasetEntry[]> {
  const dir = join(appDir, "src", "content", "surface", collection, lang);
  let files: string[];
  try {
    files = await collectMarkdownFiles(dir);
  } catch {
    return [];
  }
  const entries: DatasetEntry[] = [];
  for (const file of files) {
    const { data } = parseMarkdownFrontmatter(await readFile(file, "utf8"));
    const relPath = relative(dir, file).replace(/\\/g, "/");
    const relSlug = relPath.replace(/\//g, "-").replace(/\.md$/, "");
    const hasSubfolder = relPath.includes("/");
    const slug =
      typeof data.slug === "string" && data.slug.trim()
        ? data.slug.trim()
        : hasSubfolder
          ? relSlug
          : basename(file).replace(/\.md$/, "");
    entries.push({ slug, data });
  }
  return entries;
}

async function loadBlueprints(workspaceRoot: string): Promise<Blueprint[]> {
  const dir = join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ontology", "blueprints");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return [];
  }
  const { parse } = await import("yaml");
  const blueprints: Blueprint[] = [];
  for (const file of files) {
    const parsed = parseBlueprint(parse(await readFile(join(dir, file), "utf8")));
    if (parsed.ok && parsed.blueprint) blueprints.push(parsed.blueprint);
  }
  return blueprints;
}

function appHasDataset(appDir: string, collection: string): boolean {
  return existsSync(join(appDir, "src", "content", "surface", collection));
}

/**
 * Generate enriched entries for every entitled Blueprint with enrichedFields. Idempotent: skips
 * entries that already exist unless `--regenerate`. Writes `approved: false` — a human reviews and
 * flips the flag before the content renders.
 */
export async function runSurfaceEnrich(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
  provider: EnrichProvider = selectEnrichProvider(),
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.enrich must run inside an app context." };
  }
  const appDir = app.directory;
  const regenerate = input.flags.regenerate === true;
  const onlyBlueprint =
    typeof input.flags.blueprint === "string" ? input.flags.blueprint : undefined;
  const onlyModule = typeof input.flags.module === "string" ? input.flags.module : undefined;
  const onlyLang = typeof input.flags.lang === "string" ? input.flags.lang : undefined;
  const moduleContexts = await loadSurfaceModuleContexts(appDir).catch(() => ({
    modules: {},
    declaredBlueprints: [],
    supportedLocales: [],
  }));
  const modules = Object.values(moduleContexts.modules);

  const blueprints = (await loadBlueprints(context.workspaceRoot)).filter((bp) => {
    const owner = modules.find((module) => module.blueprints.includes(bp.id));
    return (
      bp.enrichedFields?.length &&
      appHasDataset(appDir, bp.dataset.collection) &&
      (!onlyBlueprint || bp.id === onlyBlueprint) &&
      (!onlyModule || owner?.id === onlyModule)
    );
  });
  if (blueprints.length === 0) {
    return passResult("surface.enrich", "skipped (no enriched fields for this app)");
  }

  let generated = 0;
  let skipped = 0;
  for (const bp of blueprints) {
    const owner = modules.find((module) => module.blueprints.includes(bp.id));
    const langs = [...new Set(bp.levels.flatMap((level) => Object.keys(level.slug)))];
    // The tuple structure (which industries each city offers) is language-neutral and authored on the
    // default-language city records — exactly as the baker reads it. Enumerating per-language
    // would skip languages whose city records carry only display fields, so we enumerate once here.
    const defaultLang = owner?.masterLocale ?? langs[0];
    if (!defaultLang) {
      throw new Error(`[surface.enrich] Blueprint "${bp.id}" declares no slug languages.`);
    }
    const industryAxis = bp.axes.find((a) => a.id === "industry");
    const industryCollection =
      industryAxis && "collection" in industryAxis.universe
        ? industryAxis.universe.collection
        : "industries";
    const tupleCities = await loadDataset(appDir, bp.dataset.collection, defaultLang);

    const generationLangs = onlyLang ? [onlyLang] : [defaultLang];
    for (const lang of generationLangs) {
      const industries = new Map(
        (await loadDataset(appDir, industryCollection, lang)).map((e) => [e.slug, e.data]),
      );
      const citiesBySlug = new Map(
        (await loadDataset(appDir, bp.dataset.collection, lang)).map((e) => [e.slug, e.data]),
      );

      for (const field of bp.enrichedFields ?? []) {
        if (field.scopeDepth !== 2) continue; // pilot: industry × city tuples only
        const kind = field.kind === "narrative" ? "narrative" : "field";
        for (const tupleCity of tupleCities) {
          const offered = Array.isArray(tupleCity.data.industries)
            ? (tupleCity.data.industries as string[])
            : [];
          // Per-language display data (with default-language fallback for the tuple identity).
          const city = {
            slug: tupleCity.slug,
            data: citiesBySlug.get(tupleCity.slug) ?? tupleCity.data,
          };
          for (const industrySlug of offered) {
            const pageId = `${bp.id}:${industrySlug}:${city.slug}`;
            const path = enrichPath(appDir, bp.id, lang, pageId, field.field);
            if (existsSync(path) && !regenerate) {
              skipped += 1;
              continue;
            }
            const industry = (industries.get(industrySlug) ?? {}) as Record<string, unknown>;
            const vars: Record<string, string> = {
              "industry.name": String(industry.name ?? industrySlug),
              "industry.heroIntro": String(industry.heroIntro ?? ""),
              "city.name": String(city.data.name ?? city.slug),
              "city.localNote": String(city.data.localNote ?? ""),
              industry: String(industry.name ?? industrySlug),
              city: String(city.data.name ?? city.slug),
              localNote: String(city.data.localNote ?? ""),
              lang,
            };
            const result = await provider({
              promptId: field.promptId,
              maxTokens: field.maxTokens,
              kind,
              lang,
              vars,
            });
            const provenance = {
              field: field.field,
              pageId,
              promptId: field.promptId,
              model: result.model,
              generatedAt: null,
              approved: false,
            };
            // Narrative-kind entries carry h1/lead/tagline/bridges in frontmatter (empty body);
            // field-kind entries carry the string in the body (the original RFC-0197 shape).
            const frontmatter =
              kind === "narrative" && result.narrative
                ? { ...provenance, ...result.narrative }
                : provenance;
            const body = kind === "narrative" ? "" : (result.value ?? "");
            if (!context.dryRun) {
              await mkdir(enrichDir(appDir, bp.id, lang), { recursive: true });
              await writeFile(path, stringifyMarkdownFrontmatter(body, frontmatter), "utf8");
            }
            generated += 1;
          }
        }
      }
    }
  }

  return {
    exitCode: 0,
    summary: `surface.enrich: ${generated} generated, ${skipped} skipped-existing (pending approval)`,
    data: { generated, skipped },
  };
}

/**
 * RFC-0207: review + batch-approve pending enriched entries. Default lists every `approved:false`
 * entry with a readable preview (the bespoke fields a reviewer is approving). `--approve-all` flips
 * every pending entry to `approved:true`; `--approve <pageId>:<field>` (or a kebab id substring)
 * approves a single entry. The render path consumes only approved entries, so this is the gate
 * between generation and publication.
 */
export async function runSurfaceEnrichReview(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "surface.enrich.review must run inside an app context." };
  }
  const root = join(app.directory, ...ENRICH_ROOT);
  if (!existsSync(root)) {
    return passResult("surface.enrich.review", "skipped (no enriched content)");
  }
  const approveAll = input.flags["approve-all"] === true;
  const approveOne = typeof input.flags.approve === "string" ? input.flags.approve : undefined;

  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const name of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) await walk(full);
      else if (name.name.endsWith(".md")) files.push(full);
    }
  };
  await walk(root);

  const pending: Array<{ file: string; pageId: string; field: string; preview: string }> = [];
  let approvedNow = 0;
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const { data, content } = parseMarkdownFrontmatter(raw);
    if (data.approved === true) continue;
    const pageId = String(data.pageId ?? "");
    const field = String(data.field ?? "");
    const preview =
      typeof data.h1 === "string"
        ? `${data.h1} — ${String(data.lead ?? "").slice(0, 80)}`
        : content.slice(0, 100);
    const id = `${pageId}:${field}`;
    const matchOne =
      approveOne &&
      (id === approveOne ||
        file.includes(approveOne) ||
        toKebabCase(id).includes(toKebabCase(approveOne)));
    if ((approveAll || matchOne) && !context.dryRun) {
      const reapproved = raw.replace(/^approved:\s*false\s*$/m, "approved: true");
      await writeFile(file, reapproved, "utf8");
      approvedNow += 1;
    } else {
      pending.push({ file, pageId, field, preview });
    }
  }

  if (approveAll || approveOne) {
    return {
      exitCode: 0,
      summary: `surface.enrich.review: approved ${approvedNow}, ${pending.length} still pending`,
      data: { approved: approvedNow, pending: pending.length },
    };
  }
  return {
    exitCode: 0,
    summary: `surface.enrich.review: ${pending.length} pending entr(ies) (use --approve-all or --approve <pageId>:<field>)`,
    data: {
      command: "surface.enrich.review",
      pending: pending.map((p) => ({ pageId: p.pageId, field: p.field, preview: p.preview })),
    },
  };
}

/** Validate provenance + approval shape on every enriched entry. */
export async function runEnrichValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "enrich.validate must run inside an app context." };
  }
  const root = join(app.directory, ...ENRICH_ROOT);
  if (!existsSync(root)) {
    return passResult("enrich.validate", "skipped (no enriched content)");
  }

  const violations: string[] = [];
  let checked = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const name of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name.startsWith("_")) {
          continue;
        }
        await walk(full);
      } else if (name.name.endsWith(".md")) {
        checked += 1;
        try {
          const { data } = parseMarkdownFrontmatter(await readFile(full, "utf8"));
          for (const key of ["field", "pageId", "promptId", "model", "generatedAt"]) {
            if (typeof data[key] !== "string") {
              violations.push(`${full}: missing/invalid provenance "${key}"`);
            }
          }
          if (typeof data.approved !== "boolean") {
            violations.push(`${full}: "approved" must be a boolean`);
          }
        } catch {
          violations.push(`${full}: unreadable frontmatter`);
        }
      }
    }
  };
  await walk(root);

  if (violations.length > 0) {
    return failResult("enrich.validate", violations);
  }
  return passResult("enrich.validate", `ok (${checked} enriched entr(ies))`);
}
