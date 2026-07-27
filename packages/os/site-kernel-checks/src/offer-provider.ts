/*
<MODULE_CONTRACT>
<purpose>RFC-0239: offer.provider.validate — ensure every offer page provider equals the site's own business profile.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0239: add offer provider validation so offer pages stay bound to the site's own business profile.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { readFile } from "node:fs/promises";

export async function runOfferProviderValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "offer.provider.validate must run inside an app context." };
  }

  const offersDir = join(app.directory, "src", "content", "surface", "offers");
  const violations: string[] = [];

  for (const lang of ["de", "uk"]) {
    const dir = join(offersDir, lang);
    let files: string[];
    try {
      files = await collectMarkdownFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const { data } = parseMarkdownFrontmatter(raw);
      if (typeof data.provider === "string" && data.provider.trim()) {
        violations.push(
          `foreign-provider: "${data.provider}" in ${file} — offer pages must not declare an external provider (must be the site's own business profile)`,
        );
      }
    }
  }

  if (violations.length > 0) {
    return failResult("offer.provider.validate", violations);
  }
  return passResult("offer.provider.validate", "ok (no foreign providers found)");
}
