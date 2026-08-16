/*
<MODULE_CONTRACT>
<purpose>
  RFC-0220 material.credits.validate/report. Disk-only app-scoped governance for
  Material Credits sidecars: explicit feature/background media must have valid
  provenance records before deployment, and apps with credits must expose a credits
  route in system.md.
</purpose>
<non-goals>
  <item>Do not inspect rendered HTML; validation is based on authored content references.</item>
  <item>Do not mutate generated credits pages; site-kernel-codegen owns generation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0220: initial material credits validator/report.</item>
  <item>RFC-0223: invalid-license-acquire and invalid-ai-date rules.</item>
  <item>RFC-0228: decorative-intent defaults; prose authorship discovery (warn-only first pass).</item>
  <item>RFC-0231: accept sidecar `display`; warn on attribution-policy language skew.</item>
  <item>RFC-0220 (living-photo coverage): discover RFC-0202 living photos (`live` + `photo`, and ambient media `source.fromImage`) as editorial video materials that require a credit.</item>
  <item>RFC-0488: status lifecycle, usage basis, AI copyright, organization-as-author, missing-preview validation rules.</item>
</CHANGE_SUMMARY>
*/

import { join, relative, basename, dirname } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  materialCreditSchema,
  materialTargetKey,
  type MaterialTargetDomain,
  type MaterialTarget,
} from "@warpgogol/werkstatt-site/share/schemas/material-credit";
import type { MaterialCredit } from "@warpgogol/werkstatt-site/share/schemas/material-credit";
import { diagnosticsResult, passResult, resultFromViolations } from "./result-helpers.ts";
import { readDefaultLanguageCode } from "./lib/i18n.ts";
import {
  renderMaterialCreditProse,
  selectLocalizedCreditRecords,
  loadMaterialCreditLabels,
  discoverUsageLocations,
} from "@warpgogol/werkstatt-site/codegen";

interface MaterialRef {
  file: string;
  target: MaterialTarget;
  locator: string;
  /** RFC-0228: editorial = credit required; decorative = credit excluded from required gate. */
  intent: "editorial" | "decorative";
}

interface CreditRecord {
  file: string;
  lang?: string;
  credit: MaterialCredit;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  try {
    const parsed = parseYaml(raw.slice(3, end));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function collectFilesNamed(
  dir: string,
  predicate: (name: string) => boolean,
): Promise<string[]> {
  const all = await collectFilesShared(dir, { ignore: () => false });
  return all.filter((full) => predicate(basename(full)));
}

function langFromPath(appRoot: string, file: string, fallback: string): string {
  const rel = file.slice(appRoot.length).replace(/\\/g, "/");
  const segment = rel.match(/\/src\/content\/[^/]+\/([^/]+)\//)?.[1];
  // RFC-0220: 'assets' and 'media' are language-agnostic folder names, not lang codes.
  if (segment === "assets" || segment === "media") return fallback;
  return segment ?? fallback;
}

const IMAGE_TOKEN_KEYS = new Set([
  "backgroundImage",
  "image",
  "imageName",
  "photo",
  "portraitImage",
  "src",
]);

/** RFC-0228: ambient/background keys default to decorative — no credit required. */
const DECORATIVE_TOKEN_KEYS = new Set(["backgroundImage"]);

function tokenWithoutExtension(value: string): string {
  return value.replace(/\.(webp|jpe?g|png)$/i, "");
}

function tokenFromMarkdownImage(value: string): string {
  const file = value.split(/[?#]/)[0]?.split("/").pop() ?? value;
  return tokenWithoutExtension(file.replace(/\.[a-zA-Z0-9_-]{8,}(?=\.(webp|jpe?g|png)$)/i, ""));
}

function domainFromFile(file: string): MaterialTargetDomain | undefined {
  const domain = file.match(/^src\/content\/([^/]+)\//)?.[1];
  if (
    domain === "pages" ||
    domain === "prose" ||
    domain === "business" ||
    domain === "people" ||
    domain === "site" ||
    domain === "surface"
  ) {
    return domain;
  }
  return undefined;
}

function imageCreditDomainFromFile(file: string): MaterialTargetDomain | undefined {
  const domain = domainFromFile(file);
  // RFC-0207/RFC-0220: Programmatic Surface records author `image:` tokens in
  // src/content/surface/**, but those tokens resolve as page assets and render
  // through the generated page hero. Their material credit target is therefore
  // the published page image, not a separate surface-domain asset.
  return domain === "surface" ? "pages" : domain;
}

function collectMaterialRefs(node: unknown, file: string, lang: string, out: MaterialRef[]): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectMaterialRefs(item, file, lang, out));
    return;
  }
  if (!node || typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  if ("media" in obj && obj.media && typeof obj.media === "object") {
    const media = obj.media as {
      source?: { name?: string; fromImage?: string };
      profile?: string;
    };
    const token = media.source?.name;
    if (typeof token === "string" && token.trim() !== "") {
      out.push({
        file,
        target: { kind: "video", id: token, domain: "pages", lang },
        locator: "media",
        intent: "editorial",
      });
    }
    // RFC-0202 / RFC-0220: an ambient living photo is an animated <image>.webm clip.
    // It is a distinct (often AI-generated) video material and requires its own credit.
    const ambientToken = media.source?.fromImage;
    if (
      media.profile === "ambient" &&
      typeof ambientToken === "string" &&
      ambientToken.trim() !== ""
    ) {
      out.push({
        file,
        target: { kind: "video", id: tokenWithoutExtension(ambientToken), domain: "pages", lang },
        locator: "media.live",
        intent: "editorial",
      });
    }
  }
  const domain = imageCreditDomainFromFile(file);
  // RFC-0202 / RFC-0220: a record opting into a living photo (`live` + `photo` token,
  // e.g. a Person profile) publishes an animated `<photo>.webm` clip alongside the still.
  // The clip is a separate video material that requires its own credit sidecar.
  if (
    obj.live &&
    typeof obj.live === "object" &&
    typeof obj.photo === "string" &&
    obj.photo.trim() !== ""
  ) {
    out.push({
      file,
      target: { kind: "video", id: tokenWithoutExtension(obj.photo), domain, lang },
      locator: "live",
      intent: "editorial",
    });
  }
  for (const [key, value] of Object.entries(obj)) {
    if (
      IMAGE_TOKEN_KEYS.has(key) &&
      typeof value === "string" &&
      value.trim() !== "" &&
      !value.startsWith("/") &&
      !value.includes("{")
    ) {
      out.push({
        file,
        target: { kind: "image", id: tokenWithoutExtension(value), domain, lang },
        locator: key,
        // RFC-0228: background/ambient image tokens default to decorative.
        intent: DECORATIVE_TOKEN_KEYS.has(key) ? "decorative" : "editorial",
      });
    }
    collectMaterialRefs(value, file, lang, out);
  }
}

function collectMarkdownImageRefs(
  raw: string,
  file: string,
  lang: string,
  out: MaterialRef[],
): void {
  const bodyStart = raw.startsWith("---") ? raw.indexOf("\n---", 3) : -1;
  const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;
  const markdownImage = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of body.matchAll(markdownImage)) {
    const src = match[1];
    if (!src || src.startsWith("http://") || src.startsWith("https://")) continue;
    out.push({
      file,
      target: { kind: "image", id: tokenFromMarkdownImage(src), domain: "prose", lang },
      locator: "markdown-image",
      intent: "editorial",
    });
  }
}

function hasCreditsPage(system: Record<string, unknown>): boolean {
  const pages = system["pages"];
  return (
    Array.isArray(pages) &&
    pages.some((page) => {
      if (!page || typeof page !== "object") return false;
      return (page as Record<string, unknown>)["pageId"] === "credits";
    })
  );
}

async function defaultLang(contentRoot: string): Promise<string> {
  return readDefaultLanguageCode(contentRoot);
}

/**
 * RFC-0231: the site `attribution` policy block should carry the same values across
 * a site's languages. Differing blocks are a likely authoring slip (warn, not fail).
 */
async function attributionLangSkew(appRoot: string, contentRoot: string): Promise<Diagnostic[]> {
  const siteDir = join(contentRoot, "site");
  const files = await collectFilesNamed(siteDir, (name) => name === "labels.md");
  const byLang = new Map<string, string>();
  for (const file of files) {
    const fm = parseFrontmatter(await readFile(file, "utf-8").catch(() => ""));
    const lang = langFromPath(appRoot, file, "");
    if (fm && fm["attribution"] !== undefined) {
      byLang.set(lang, JSON.stringify(fm["attribution"]));
    }
  }
  const distinct = new Set(byLang.values());
  if (byLang.size > 1 && distinct.size > 1) {
    return [
      {
        ruleId: "MATERIAL.CREDITS.ATTRIBUTION-POLICY-LANG-SKEW",
        severity: "warning",
        file: "src/content/site",
        message: `Site attribution policy differs across languages (${[...byLang.keys()].join(", ")}).`,
        fixHint: "Keep the site attribution policy block aligned across localized site labels.",
      },
    ];
  }
  return [];
}

async function loadCredits(
  appRoot: string,
  contentRoot: string,
): Promise<{ records: CreditRecord[]; violations: string[] }> {
  const records: CreditRecord[] = [];
  const violations: string[] = [];
  const files = await collectFilesNamed(contentRoot, (name) => name.endsWith(".credits.yaml"));
  for (const file of files) {
    const rel = relative(appRoot, file).replace(/\\/g, "/");
    try {
      const parsed = parseYaml(await readFile(file, "utf-8"));
      const credit = materialCreditSchema.parse(parsed);
      records.push({ file: rel, lang: langFromPath(appRoot, file, ""), credit });
    } catch (err) {
      violations.push(`[invalid-credit] ${rel}: ${String(err)}`);
    }
  }
  return { records, violations };
}

function creditMatches(record: CreditRecord, ref: MaterialRef, defaultLanguage: string): boolean {
  const recordLang = record.credit.target.lang ?? record.lang;
  const refLang = ref.target.lang;
  const candidates =
    refLang === defaultLanguage ? [refLang, undefined] : [refLang, defaultLanguage, undefined];
  return candidates.some((lang) => {
    const expected = materialTargetKey({ ...ref.target, lang: undefined }, lang);
    const actual = materialTargetKey(
      { ...record.credit.target, lang: undefined },
      recordLang || undefined,
    );
    return expected === actual;
  });
}

async function buildMaterialCreditsState(ctx: KernelRuntimeContext) {
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentRoot = join(appRoot, "src", "content");
  const defaultLanguage = await defaultLang(contentRoot);
  const refs: MaterialRef[] = [];

  for (const domain of ["pages", "business", "people", "site", "surface"]) {
    for (const file of await collectFilesNamed(
      join(contentRoot, domain),
      (name) => name.endsWith(".md") && name !== "AGENTS.md",
    )) {
      const raw = await readFile(file, "utf-8").catch(() => "");
      const fm = parseFrontmatter(raw);
      if (!fm) continue;
      const rel = relative(appRoot, file).replace(/\\/g, "/");
      const lang = langFromPath(appRoot, file, defaultLanguage);
      collectMaterialRefs(fm, rel, lang, refs);
    }
  }

  // RFC-0228: discover prose domain files as creditable materials (authorship gate).
  const proseRefs: MaterialRef[] = [];
  const proseDir = join(contentRoot, "prose");
  for (const file of await collectFilesNamed(
    proseDir,
    (name) => name.endsWith(".md") && name !== "AGENTS.md",
  )) {
    const raw = await readFile(file, "utf-8").catch(() => "");
    // Skip generated files and empty files.
    if (!raw || raw.includes("// GENERATED") || raw.includes("GENERATED.")) continue;
    const slug = file
      .replace(/\\/g, "/")
      .replace(/^.*\/prose\/[^/]+\//, "")
      .replace(/\.md$/, "");
    const rel = relative(appRoot, file).replace(/\\/g, "/");
    const lang = langFromPath(appRoot, file, defaultLanguage);
    collectMarkdownImageRefs(raw, rel, lang, refs);
    proseRefs.push({
      file: rel,
      target: { kind: "prose", id: slug, domain: "prose", lang },
      locator: "prose-file",
      intent: "editorial",
    });
  }

  const { records, violations } = await loadCredits(appRoot, contentRoot);
  let system: Record<string, unknown> | null = null;
  try {
    system = parseFrontmatter(await readFile(join(contentRoot, "system.md"), "utf-8"));
  } catch {
    system = null;
  }

  return { appRoot, contentRoot, defaultLanguage, refs, proseRefs, records, violations, system };
}

export async function runMaterialCreditsValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "material.credits.validate";
  const state = await buildMaterialCreditsState(ctx);
  const violations = [...state.violations];

  if (
    (state.refs.length > 0 || state.records.length > 0) &&
    (!state.system || !hasCreditsPage(state.system))
  ) {
    violations.push("[missing-credits-page] src/content/system.md must declare pageId: credits");
  }

  const seen = new Map<string, string>();
  for (const record of state.records) {
    const lang = record.credit.target.lang ?? record.lang;
    const key = materialTargetKey(record.credit.target, lang);
    const existing = seen.get(key);
    if (existing) {
      violations.push(`[duplicate-target] ${record.file} duplicates ${existing} for ${key}`);
    }
    seen.set(key, record.file);
    if (record.credit.license.copyrightNotice?.startsWith("NEED_THIS_")) {
      violations.push(
        `[needs-rights-notice] ${record.file}: license.copyrightNotice is unresolved`,
      );
    }
    // RFC-0223: an acquire page is meaningless without the license it points at.
    if (record.credit.license.acquireLicensePage && !record.credit.license.url) {
      violations.push(
        `[invalid-license-acquire] ${record.file}: license.acquireLicensePage requires license.url`,
      );
    }
    // RFC-0223: AI/source generation dates must be ISO dates.
    for (const party of record.credit.parties) {
      if (party.generatedAt && !isIsoDate(party.generatedAt)) {
        violations.push(
          `[invalid-ai-date] ${record.file}: party "${party.name}" generatedAt "${party.generatedAt}" is not an ISO date`,
        );
      }
    }

    // RFC-0488: status lifecycle validation (fail rules).
    if (record.credit.status === "blocked") {
      violations.push(
        `[blocked-status] ${record.file}: credit record is blocked — remove or unblock before deployment`,
      );
    }
    if (record.credit.status === "expired") {
      violations.push(
        `[expired-status] ${record.file}: credit record is expired — remove or renew before deployment`,
      );
    }

    // RFC-0488: missing usage basis for third-party/screenshot/commissioned records.
    const requiresUsageBasis = [
      "third-party",
      "licensed-third-party",
      "screenshot",
      "commissioned",
    ];
    if (requiresUsageBasis.includes(record.credit.sourceType) && !record.credit.usageBasis) {
      violations.push(
        `[missing-usage-basis] ${record.file}: sourceType "${record.credit.sourceType}" requires usageBasis`,
      );
    }

    // RFC-0488: unverified usage basis blocks deployment.
    if (record.credit.usageBasis?.type === "unverified") {
      violations.push(
        `[unverified-usage-basis] ${record.file}: usageBasis.type is "unverified" — rights review required`,
      );
    }

    // RFC-0488: organization as author for human-made records.
    if (record.credit.sourceType === "human-made") {
      const orgAuthor = record.credit.parties.some(
        (p) => (p.role === "creator" || p.role === "coCreator") && p.kind === "Organization",
      );
      if (orgAuthor) {
        violations.push(
          `[organization-as-author] ${record.file}: human-made record has Organization as creator/coCreator — use Person or change sourceType`,
        );
      }
    }

    // RFC-0488: AI copyright overstatement.
    if (
      record.credit.aiUsage &&
      record.credit.aiUsage.copyrightClaimed &&
      !record.credit.aiUsage.humanContribution
    ) {
      violations.push(
        `[ai-copyright-overstatement] ${record.file}: aiUsage.copyrightClaimed is true but humanContribution is missing`,
      );
    }

    // RFC-0488: missing preview for active records.
    if (record.credit.status === "active" || !record.credit.status) {
      const id = record.credit.target.id;
      const creditFileDir = dirname(join(state.appRoot, record.file));
      const extensions =
        record.credit.target.kind === "video"
          ? ["webm", "mp4", "webp", "jpg", "jpeg", "png"]
          : ["webp", "jpg", "jpeg", "png", "gif"];
      let found = false;
      for (const ext of extensions) {
        try {
          await readFile(join(creditFileDir, `${id}.${ext}`));
          found = true;
          break;
        } catch {
          // continue checking
        }
      }
      if (!found) {
        violations.push(
          `[missing-preview] ${record.file}: active record "${record.credit.id}" has no resolvable preview asset for target ${id}`,
        );
      }
    }
  }

  // RFC-0228: only require credits for editorial refs; skip decorative ones.
  for (const ref of state.refs) {
    if (ref.intent === "decorative") continue;
    if (!state.records.some((record) => creditMatches(record, ref, state.defaultLanguage))) {
      violations.push(
        `[missing-credit] ${ref.file}: ${ref.target.kind} "${ref.target.id}" (${ref.locator}) has no material credit sidecar`,
      );
    }
  }

  // RFC-0228: prose authorship check (warn-only first pass; fail-hard once all prose has credits).
  const proseWarnings: Diagnostic[] = [];
  for (const ref of state.proseRefs) {
    if (!state.records.some((record) => creditMatches(record, ref, state.defaultLanguage))) {
      proseWarnings.push({
        ruleId: "MATERIAL.CREDITS.MISSING-PROSE-CREDIT",
        severity: "warning",
        file: ref.file,
        message: `Prose "${ref.target.id}" has no authorship credit sidecar.`,
        fixHint:
          "Add a sibling material credit sidecar for the prose record, or document why this prose is generated/owned elsewhere before suppressing the warning.",
        data: { target: ref.target, locator: ref.locator },
      });
    }
  }

  if (violations.length > 0) return resultFromViolations(command, violations);
  // RFC-0231: non-fatal attribution policy lint.
  const attributionWarnings = await attributionLangSkew(state.appRoot, state.contentRoot);

  // RFC-0488: warn-only status diagnostics.
  const statusWarnings: Diagnostic[] = [];
  for (const record of state.records) {
    if (record.credit.status === "orphaned") {
      statusWarnings.push({
        ruleId: "MATERIAL.CREDITS.ORPHANED-STATUS",
        severity: "warning",
        file: record.file,
        message: `Credit record "${record.credit.id}" is orphaned.`,
        fixHint: "Review whether this credit is still needed or should be removed.",
        data: { id: record.credit.id },
      });
    }
    if (record.credit.status === "needs-review") {
      statusWarnings.push({
        ruleId: "MATERIAL.CREDITS.NEEDS-REVIEW-STATUS",
        severity: "warning",
        file: record.file,
        message: `Credit record "${record.credit.id}" needs review.`,
        fixHint: "Review the credit record and update status to active once verified.",
        data: { id: record.credit.id },
      });
    }
  }

  return diagnosticsResult(command, [...proseWarnings, ...attributionWarnings, ...statusWarnings]);
}

export async function runMaterialCreditsDriftValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "material.credits.drift.validate";
  const state = await buildMaterialCreditsState(ctx);
  const _paths = requireAstroSitePaths(ctx);
  const violations: string[] = [];

  const proseDir = join(state.contentRoot, "prose");
  let proseLangs: string[];
  try {
    const entries = await readdir(proseDir, { withFileTypes: true });
    proseLangs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    proseLangs = [];
  }

  for (const lang of proseLangs) {
    const prosePath = join(proseDir, lang, "credits.md");
    let existing: string | null = null;
    try {
      existing = await readFile(prosePath, "utf-8");
    } catch {
      continue;
    }
    const labels = await loadMaterialCreditLabels(state.contentRoot, lang, state.defaultLanguage);
    if (!labels) {
      violations.push(
        `[credits-drift] ${prosePath}: cannot load materialCredits labels for ${lang}`,
      );
      continue;
    }
    const localizedRecords = selectLocalizedCreditRecords(
      state.records as import("@warpgogol/werkstatt-site/share/material-credits").MaterialCreditRecord[],
      lang,
      state.defaultLanguage,
    );
    const usageLocations = await discoverUsageLocations(state.contentRoot, lang, localizedRecords);
    const expected = renderMaterialCreditProse(localizedRecords, lang, labels, usageLocations);
    // Normalize line endings for comparison.
    const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
    if (normalize(existing) !== normalize(expected)) {
      violations.push(
        `[credits-drift] src/content/prose/${lang}/credits.md — file differs from generator output.\n` +
          `  Do NOT edit this file directly.\n` +
          `  Edit the source: business/{lang}/assets/*.credits.yaml\n` +
          `  Then regenerate: pnpm exec werkstatt run material.credits.generate --site <app>`,
      );
    }
  }

  if (violations.length > 0) return resultFromViolations(command, violations);
  return passResult(
    command,
    `${command}: OK — ${state.records.length} credit record(s) checked across ${proseLangs.length} language(s)`,
  );
}

export async function runMaterialCreditsReport(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const state = await buildMaterialCreditsState(ctx);
  // RFC-0228: group by intent for reporting.
  const editorialRefs = state.refs.filter((r) => r.intent === "editorial");
  const decorativeRefs = state.refs.filter((r) => r.intent === "decorative");
  const proseWithCredit = state.proseRefs.filter((r) =>
    state.records.some((rec) => creditMatches(rec, r, state.defaultLanguage)),
  );
  const proseMissingCredit = state.proseRefs.filter(
    (r) => !state.records.some((rec) => creditMatches(rec, r, state.defaultLanguage)),
  );
  return {
    data: {
      command: "material.credits.report",
      status: "pass",
      materials: state.refs,
      credits: state.records.map((record) => ({ file: record.file, credit: record.credit })),
      parseViolations: state.violations,
      // RFC-0228: intent groupings.
      byIntent: {
        editorial: { count: editorialRefs.length, refs: editorialRefs },
        decorative: { count: decorativeRefs.length, refs: decorativeRefs },
        prose: {
          total: state.proseRefs.length,
          withCredit: proseWithCredit.length,
          missingCredit: proseMissingCredit.length,
          missing: proseMissingCredit,
        },
      },
    },
    exitCode: 0,
    summary: `material.credits.report: ${editorialRefs.length} editorial, ${decorativeRefs.length} decorative, ${state.proseRefs.length} prose ref(s), ${state.records.length} credit record(s)`,
  };
}
