/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0152] cloudflare.assets.validate — a post-build guard that fails the build when
  rendered HTML references an /_astro/* origin asset that is absent from the deployable
  static directory (dist/client). This is provider-agnostic: it catches the class of bug
  where an image (or any hashed asset) is referenced but never emitted — e.g. the
  dist/_astro vs dist/client/_astro mismatch that motivated RFC-0152 — regardless of which
  image provider built the URL (raw /_astro, or wrapped in /cdn-cgi/image/.../_astro/...).
</purpose>
<non-goals>
  <item>Do not optimize, copy, or mutate any asset — this is a read-only validator.</item>
  <item>Do not validate remote (http/https) or data: origins — only in-repo /_astro/* assets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0152: introduced the post-build /_astro reference-integrity validator.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { fileExists } from "./lib/file-exists.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import {
  runRuntimeFunctionalHealthInstrument,
  type RuntimeHealthState,
  toDeterministicContext,
} from "@syrokomskyi/axiom-study";

/** Matches an `_astro/<file>.<imgext>` origin path anywhere (after any /cdn-cgi/image/ prefix). */
const ASTRO_ASSET_RE = /_astro\/[A-Za-z0-9._-]+\.(?:webp|avif|jpg|jpeg|png|gif|svg)/gi;

async function collectHtmlFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".html"], ignore: () => false });
}

export async function runCloudflareAssetsValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "cloudflare.assets.validate";
  const paths = requireAstroSitePaths(ctx);
  const clientDir = join(paths.appDirectory, "dist", "client");

  const htmlFiles = await collectHtmlFiles(clientDir);
  if (htmlFiles.length === 0) {
    return {
      data: { command, status: "pass", note: "no built HTML found (build first)", checked: 0 },
      exitCode: 0,
      summary: `${command}: no HTML to check`,
    };
  }

  // Map missing-origin → set of referencing HTML files (deduped).
  const missing = new Map<string, Set<string>>();
  const existsCache = new Map<string, boolean>();
  let references = 0;

  for (const file of htmlFiles) {
    const html = await readFile(file, "utf-8");
    const seen = new Set<string>();
    for (const match of html.matchAll(ASTRO_ASSET_RE)) {
      const origin = match[0]; // e.g. "_astro/hero-bg.<hash>.webp"
      if (seen.has(origin)) continue;
      seen.add(origin);
      references++;

      let ok = existsCache.get(origin);
      if (ok === undefined) {
        ok = await fileExists(join(clientDir, origin));
        existsCache.set(origin, ok);
      }
      if (!ok) {
        const rel = relative(paths.appDirectory, file);
        (missing.get(origin) ?? missing.set(origin, new Set()).get(origin)!).add(rel);
      }
    }
  }

  // RFC-0016: call axiom-study runtime-health instrument
  let instrumentRunId: string | undefined;
  try {
    const instrumentCtx = toDeterministicContext({
      origin: "build-time",
      recordedAt: new Date().toISOString(),
      auditId: "cloudflare.assets.validate",
      environment: {},
    });
    const states: RuntimeHealthState[] = [
      {
        url: "https://build.local/",
        locale: "de",
        profileId: ctx.site?.name ?? "site",
        logicalPath: "dist/client/",
        consoleErrors: [],
        hydrationErrors: [],
        brokenLinks: [...missing.keys()].map((origin) => ({
          url: `/${origin}`,
          statusCode: 404,
        })),
        httpStatus: 200,
      },
    ];
    const instrumentResult = runRuntimeFunctionalHealthInstrument({
      context: instrumentCtx,
      states,
    });
    instrumentRunId = instrumentResult.instrumentRun.instrumentRunId;
  } catch {
    // Instrument failure must not break the gate
  }

  if (missing.size > 0) {
    const violations = [...missing.entries()].map(
      ([origin, files]) =>
        `/${origin} referenced but missing under dist/client (in ${[...files].slice(0, 3).join(", ")}${
          files.size > 3 ? `, +${files.size - 3} more` : ""
        })`,
    );
    return {
      data: { command, status: "fail", violations, checkedReferences: references, instrumentRunId },
      exitCode: 1,
      summary: `${command}: ${missing.size} missing /_astro asset(s)`,
    };
  }

  return {
    data: {
      command,
      status: "pass",
      violations: [],
      checkedReferences: references,
      instrumentRunId,
    },
    exitCode: 0,
    summary: `${command}: OK (${references} refs across ${htmlFiles.length} pages)`,
  };
}
