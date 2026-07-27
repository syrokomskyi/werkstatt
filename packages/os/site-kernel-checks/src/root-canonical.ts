/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0159] root.canonical.validate — guards the root entry contract.
  The app root page (`src/pages/index.astro`) MUST serve the default-language
  home content (fully rendered HTML + JSON-LD), NOT a content-less redirect
  stub. It embeds the soft language redirect rather than a hard
  `<meta http-equiv="refresh">`.

  [RFC-0160] The default language is served UNPREFIXED, so `/` is the canonical
  home (self-canonical). The root page therefore no longer emits a canonicalUrl
  override pointing at `/<defaultLang>/` — the layout's default `Astro.url`
  (`/`) is already correct.
</purpose>
<non-goals>
  <item>Do not run a browser or fetch the live site — this is a static check.</item>
  <item>Do not validate sitemap/hreflang symmetry — owned by sitemap.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0159: initial implementation.</item>
  <item>RFC-0261: migrate to diagnosticsResult with registered RC-00..03 ruleIds and a file:line locator.</item>
</CHANGE_SUMMARY>
*/

import path, { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { diagnosticsResult } from "./result-helpers.ts";

const COMMAND = "root.canonical.validate";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export async function runRootCanonicalValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const indexPath = join(paths.srcDirectory, "pages", "index.astro");
  const relFile = toPosixPath(relative(context.workspaceRoot, indexPath));

  let source: string;
  try {
    source = await readFile(indexPath, "utf-8");
  } catch {
    return diagnosticsResult(COMMAND, [
      {
        ruleId: "RC-00",
        severity: "error",
        file: relFile,
        message: "Root entry page not found.",
        fixHint: "Run routes.generate to create src/pages/index.astro.",
      },
    ]);
  }

  const diagnostics: Diagnostic[] = [];

  // RC-01: no hard meta-refresh stub (the regression RFC-0159 fixes).
  if (/http-equiv\s*=\s*["']refresh["']/i.test(source)) {
    diagnostics.push({
      ruleId: "RC-01",
      severity: "error",
      file: relFile,
      message: 'Root page emits a <meta http-equiv="refresh"> stub.',
      fixHint:
        "Render the default-language home directly via resolvePageRoute() so AI crawlers receive content (RFC-0159).",
    });
  }

  // RC-02: must resolve the home page content via the shared page handler.
  if (!source.includes("resolvePageRoute")) {
    diagnostics.push({
      ruleId: "RC-02",
      severity: "error",
      file: relFile,
      message: "Root page does not call resolvePageRoute().",
      fixHint:
        "Render the default-language home content via resolvePageRoute(), not a redirect-only component (RFC-0159).",
    });
  }

  // RC-03 (RFC-0159) removed by RFC-0160: with the default language served
  // unprefixed, `/` is self-canonical. The root page MUST NOT pin a
  // canonicalUrl override to `/<defaultLang>/`.
  if (/canonicalUrl\s*=/.test(source)) {
    diagnostics.push({
      ruleId: "RC-03",
      severity: "error",
      file: relFile,
      message: "Root page passes a canonicalUrl override.",
      fixHint:
        'Remove the canonicalUrl override; under RFC-0160 "/" is self-canonical via the layout\'s default Astro.url.',
    });
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
