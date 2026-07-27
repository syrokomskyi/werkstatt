/*
<MODULE_CONTRACT>
<purpose>
Implements need.markers.validate — scans built HTML in apps/<id>/dist/
for residual NEED_THIS_<FIELD> placeholders emitted by the RFC-0042
`need()` helper. Any occurrence means a required section prop was
missing in authored content; shipping it produces visible "NEED_THIS_X"
text on the rendered page (RFC-0095).
</purpose>
<non-goals>
  <item>Do not modify HTML — this is a read-only post-build check.</item>
  <item>Do not validate raw author content — that lives in propsSchema checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0095: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { collectFiles } from "@gogol/share/fs";

const MARKER_RE = /NEED_THIS_[A-Z][A-Z0-9_]*/g;

interface MarkerViolation {
  file: string;
  marker: string;
  count: number;
}

async function collectDistHtmlFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    extensions: [".html"],
    ignore: (name) => name === "node_modules" || name === ".turbo" || name === "_astro",
  });
}

export async function runNeedMarkersValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const distDir = join(paths.appDirectory, "dist");
  try {
    statSync(distDir);
  } catch {
    return {
      exitCode: 0,
      data: {
        diagnostics: [`No dist/ at ${distDir} — run pnpm --filter <app> build first.`],
      },
    };
  }

  const files = await collectDistHtmlFiles(distDir);

  const violations: MarkerViolation[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const matches = src.match(MARKER_RE);
    if (!matches) continue;
    const tally = new Map<string, number>();
    for (const m of matches) tally.set(m, (tally.get(m) ?? 0) + 1);
    for (const [marker, count] of tally) {
      violations.push({ file, marker, count });
    }
  }

  if (violations.length > 0) {
    const diagnostics = violations.slice(0, 50).map((v) => {
      const rel = relative(paths.appDirectory, v.file).replace(/\\/g, "/");
      const field = v.marker.replace(/^NEED_THIS_/, "").toLowerCase();
      return (
        `[ERROR] ${rel} — "${v.marker}" appears ${v.count}× in rendered HTML. ` +
        `A section called need("${field}", value) and value was empty. Populate ` +
        `the section's "${field}" prop in the page's frontmatter (RFC-0095).`
      );
    });
    if (violations.length > 50) {
      diagnostics.push(`… and ${violations.length - 50} more violation(s).`);
    }
    return {
      exitCode: 1,
      data: { violations: diagnostics, total: violations.length },
    };
  }

  return {
    exitCode: 0,
    data: { diagnostics: [`No NEED_THIS_ placeholders in ${files.length} built HTML file(s).`] },
  };
}
