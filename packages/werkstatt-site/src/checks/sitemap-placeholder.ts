/*
<MODULE_CONTRACT>
<purpose>
RFC-0907: sitemap placeholder validator. Scans dist/client/sitemap*.xml for
unresolved bracket placeholders (e.g. [slug], [version], [id]) in URLs.
These URLs are always invalid — no real page exists at a URL with brackets.
</purpose>
<non-goals>
  <item>Does not check sitemap coverage — see sitemap.coverage.validate.</item>
  <item>Does not generate or modify sitemap files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0907: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/werkstatt-shared/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";
import { extractSitemapUrls } from "./canonical-url.ts";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";

interface SitemapPlaceholderResult {
  checkedUrls: number;
  placeholderUrls: number;
}

const PLACEHOLDER_PATTERN = /\[[a-zA-Z0-9_-]+\]/;

export async function runSitemapPlaceholderValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distClient = join(paths.appDirectory, "dist", "client");

  const sitemapFiles = await collectFiles(distClient, {
    extensions: [".xml"],
  }).then((files) => files.filter((f) => /sitemap.*\.xml$/.test(f)));

  if (sitemapFiles.length === 0) {
    return {
      data: {
        command: "sitemap.placeholder.validate",
        status: "pass",
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 1 },
      },
      exitCode: 0,
      summary:
        "sitemap.placeholder.validate: skipped (no sitemap files in dist/client; post-build only)",
    };
  }

  const diagnostics: Diagnostic[] = [];
  let checkedUrls = 0;
  let placeholderUrls = 0;

  for (const sitemapFile of sitemapFiles) {
    const xml = await readFile(sitemapFile, "utf-8");
    const urls = extractSitemapUrls(xml);
    checkedUrls += urls.length;

    if (urls.length === 0) continue;

    for (const url of urls) {
      if (PLACEHOLDER_PATTERN.test(url)) {
        placeholderUrls++;
        diagnostics.push({
          ruleId: "SITEMAP-PH-01",
          severity: "error",
          file: sitemapFile,
          message: `Sitemap URL contains unresolved placeholder: ${url}`,
          fixHint:
            "Ensure the sitemap generator expands route templates into resolved slugs before emitting URLs",
        });
      }
    }
  }

  if (checkedUrls === 0) {
    return {
      data: {
        command: "sitemap.placeholder.validate",
        status: "pass",
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 1 },
      },
      exitCode: 0,
      summary: "sitemap.placeholder.validate: skipped (no URLs found in sitemap files)",
    };
  }

  const result: SitemapPlaceholderResult = { checkedUrls, placeholderUrls };
  const base = diagnosticsResult("sitemap.placeholder.validate", diagnostics);
  return {
    ...base,
    data: { ...base.data, ...result },
  };
}
