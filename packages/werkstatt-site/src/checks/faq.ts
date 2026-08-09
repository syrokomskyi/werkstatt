/*
<MODULE_CONTRACT>
<purpose>
  RFC-0475 faq.validate. Enforces the canonical FAQ entry contract over
  src/content/faq/{lang}/*.md. No-op pass when an app has no FAQ directory.
  Validates required fields (slug, question, answer), optional field types
  (order, tags), governance block structure, and duplicate slugs per language.
  Does NOT enforce cross-language mirroring — follows the people.validate
  precedent (per-language independent validation).
</purpose>
<non-goals>
  <item>Do not validate JSON-LD or semantic model output — that is the render layer's job.</item>
  <item>Do not read content via the Astro runtime — disk only, like people.validate.</item>
  <item>Do not enforce mirroring across languages — FAQ follows the people.validate precedent.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0475: initial implementation — FAQ entry contract validator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { passResult, resultFromViolations } from "./result-helpers.ts";

interface FaqRecord {
  lang: string;
  file: string;
  data: Record<string, unknown>;
}

async function collectFaqRecords(appDir: string): Promise<FaqRecord[]> {
  const faqDir = join(appDir, "src", "content", "faq");
  const records: FaqRecord[] = [];
  let langs: import("node:fs").Dirent[];
  try {
    langs = await readdir(faqDir, { withFileTypes: true });
  } catch {
    return records;
  }
  for (const langEntry of langs) {
    if (!langEntry.isDirectory()) continue;
    const lang = langEntry.name;
    const langDir = join(faqDir, lang);
    let files: import("node:fs").Dirent[];
    try {
      files = await readdir(langDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".md")) continue;
      const raw = await readFile(join(langDir, f.name), "utf-8");
      const data = parseMarkdownFrontmatter(raw).data as Record<string, unknown>;
      records.push({ lang, file: `${lang}/${f.name}`, data });
    }
  }
  return records;
}

export async function runFaqValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const records = await collectFaqRecords(paths.appDirectory);

  if (records.length === 0) {
    return passResult("faq.validate", "faq.validate: OK — no FAQ entries");
  }

  const violations: string[] = [];

  for (const { file, data } of records) {
    if (typeof data["slug"] !== "string" || (data["slug"] as string).trim() === "") {
      violations.push(`[missing-slug] ${file}: FAQ entry has no slug`);
    }
    if (typeof data["question"] !== "string" || (data["question"] as string).trim() === "") {
      violations.push(`[missing-question] ${file}: FAQ entry has no question`);
    }
    if (typeof data["answer"] !== "string" || (data["answer"] as string).trim() === "") {
      violations.push(`[missing-answer] ${file}: FAQ entry has no answer`);
    }

    const order = data["order"];
    if (order !== undefined && typeof order !== "number") {
      violations.push(`[invalid-order] ${file}: order must be a number, got ${typeof order}`);
    }

    const tags = data["tags"];
    if (tags !== undefined) {
      if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
        violations.push(`[invalid-tags] ${file}: tags must be an array of strings`);
      }
    }

    const governance = data["governance"];
    if (governance !== undefined) {
      if (typeof governance !== "object" || governance === null) {
        violations.push(`[invalid-governance] ${file}: governance must be an object`);
      } else {
        const fieldClaims = (governance as Record<string, unknown>)["fieldClaims"];
        if (fieldClaims !== undefined) {
          if (typeof fieldClaims !== "object" || fieldClaims === null) {
            violations.push(`[invalid-governance] ${file}: fieldClaims must be an object`);
          }
        }
      }
    }
  }

  const slugsByLang = new Map<string, Set<string>>();
  for (const { lang, file, data } of records) {
    const slug = data["slug"];
    if (typeof slug !== "string") continue;
    let slugSet = slugsByLang.get(lang);
    if (!slugSet) {
      slugSet = new Set<string>();
      slugsByLang.set(lang, slugSet);
    }
    if (slugSet.has(slug)) {
      violations.push(`[duplicate-slug] ${file}: slug "${slug}" already exists in lang ${lang}`);
    } else {
      slugSet.add(slug);
    }
  }

  if (violations.length === 0) {
    return passResult(
      "faq.validate",
      `faq.validate: OK — ${records.length} FAQ entry/entries conform`,
    );
  }
  return resultFromViolations("faq.validate", violations);
}
