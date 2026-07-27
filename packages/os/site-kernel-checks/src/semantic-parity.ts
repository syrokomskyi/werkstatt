/*
<MODULE_CONTRACT>
<purpose>RFC-0146: semantic.parity — a regression guard that rebuilds the llms projections in memory from the consolidated semantic model and asserts they match the generated public/llms.txt + llms-full.txt byte-for-byte. Catches drift between the model/builder and the committed AI output (e.g. a refactor that changes output, or files not regenerated after a content change). RFC-0375: marker stripping removed — llms.generate no longer emits markers.</purpose>
<non-goals>
  <item>Do not write files — comparison only (llms.generate writes).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0146: initial implementation.</item>
  <item>RFC-0375: remove stripMarker — llms.generate no longer emits markers.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadSemanticSiteModel, loadSystemManifest } from "@gogol/site-kernel-content";
import { buildLlmsIndex, buildLlmsFull } from "@gogol/share/semantic";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { passResult, failResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";

export async function runSemanticParity(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com";
  const contentDir = join(paths.appDirectory, "src", "content");
  const { manifest } = await loadSystemManifest(contentDir);
  const lang = defaultLanguageFromManifest(manifest);

  const semanticSite = await loadSemanticSiteModel({ contentDir, lang, siteUrl });
  const expectedIndex = buildLlmsIndex(semanticSite);
  const expectedFull = buildLlmsFull(semanticSite);

  const violations: string[] = [];
  const cases: Array<{ file: string; expected: string }> = [
    { file: "llms.txt", expected: expectedIndex },
    { file: "llms-full.txt", expected: expectedFull },
  ];

  for (const { file, expected } of cases) {
    let actual: string;
    try {
      actual = await readFile(join(paths.publicDirectory, file), "utf-8");
    } catch {
      violations.push(`${file} not found — run llms.generate first.`);
      continue;
    }
    if (actual !== expected) {
      // Report the first differing line to make drift actionable.
      const a = actual.split("\n");
      const e = expected.split("\n");
      const i = a.findIndex((line, idx) => line !== e[idx]);
      violations.push(
        `${file}: drifts from the semantic model at line ${i + 1}. ` +
          `Expected ${JSON.stringify(e[i]?.slice(0, 60))}, found ${JSON.stringify(a[i]?.slice(0, 60))}. ` +
          `Run llms.generate to regenerate.`,
      );
    }
  }

  if (violations.length > 0) {
    return failResult("semantic.parity", violations);
  }
  return passResult(
    "semantic.parity",
    `semantic.parity: OK — llms.txt + llms-full.txt match the semantic model (${semanticSite.pages.length} pages)`,
  );
}
