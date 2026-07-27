/*
<MODULE_CONTRACT>
<purpose>RFC-0242: bodenstation.voice.validate — enforce Bodenstation voice rules (no LocalBusiness, no aggregateRating, no impersonation).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0242: add Bodenstation voice validation for LocalBusiness, aggregateRating, and impersonation signals.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";

const FORBIDDEN_PATTERNS = [
  { pattern: /LocalBusiness/i, rule: "localbusiness-on-bodenstation" },
  { pattern: /aggregateRating/i, rule: "rating-on-bodenstation" },
  { pattern: /"@type"\s*:\s*"LocalBusiness"/i, rule: "localbusiness-on-bodenstation" },
  // RFC-0242: impersonation — the page presents itself as the tradesperson's own service
  // ("we are your electrician") instead of an engineer's demand map. Closed pattern set (de/uk).
  { pattern: /wir\s+sind\s+ihr\s+\w*(elektriker|friseur|handwerker)/i, rule: "impersonation" },
  { pattern: /unser\s+\w*(elektriker|friseur|handwerker)[\s-]*team/i, rule: "impersonation" },
  { pattern: /als\s+(ihr|euer)\s+\w*(elektriker|friseur|handwerker)/i, rule: "impersonation" },
  { pattern: /ми\s*[—-]?\s*ваш\s+(електрик|перукар|майстер)/i, rule: "impersonation" },
  { pattern: /наша\s+команда\s+(електриків|перукарів)/i, rule: "impersonation" },
];

async function* walkContentFiles(dir: string): AsyncGenerator<string> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkContentFiles(path);
    } else if (e.name.endsWith(".md") || e.name.endsWith(".yaml") || e.name.endsWith(".yml")) {
      yield path;
    }
  }
}

export async function runBodenstationVoiceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "bodenstation.voice.validate must run inside an app context." };
  }

  // Detect Bodenstation mode from business company profile
  let isBodenstation = false;
  for (const lang of ["de", "uk"]) {
    try {
      const raw = await readFile(
        join(app.directory, "src", "content", "business", lang, "company.md"),
        "utf8",
      );
      const modeMatch = raw.match(/mode:\s*(\w+)/);
      if (modeMatch && modeMatch[1] === "bodenstation") {
        isBodenstation = true;
        break;
      }
    } catch {
      // no-op
    }
  }

  if (!isBodenstation) {
    return passResult("bodenstation.voice.validate", "skipped (not Bodenstation mode)");
  }

  const violations: string[] = [];
  const contentDir = join(app.directory, "src", "content");

  for await (const file of walkContentFiles(contentDir)) {
    const text = await readFile(file, "utf8");
    for (const { pattern, rule } of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        const rel = file.replace(app.directory, "").replace(/^\\/, "");
        const what =
          rule === "impersonation"
            ? "impersonates the tradesperson's own service instead of an engineer's demand map"
            : "contains forbidden markup";
        violations.push(`${rule}: "${rel}" ${what} in Bodenstation mode`);
      }
    }
  }

  if (violations.length > 0) {
    return failResult("bodenstation.voice.validate", violations);
  }
  return passResult("bodenstation.voice.validate", "ok (no forbidden voice signals)");
}
