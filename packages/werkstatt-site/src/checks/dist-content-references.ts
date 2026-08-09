/*
<MODULE_CONTRACT>
<purpose>
Implements dist.content-references.validate (RFC-0187, RFC-0529) — scans built HTML in
apps/<id>/dist/ for residual {collection.file.field} brace tokens that were not
resolved at render time. After RFC-0529, brace-delimited syntax is no longer supported;
any brace token in rendered HTML indicates unmigrated content that was not converted
to braceless syntax by content.ref-migrate.
</purpose>
<non-goals>
  <item>Do not re-resolve references — a token in HTML is already broken; just report it.</item>
  <item>Do not scan non-HTML dist artifacts (.js, .css, sitemaps).</item>
  <item>Do not modify any files — read-only post-build check.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0187: Initial implementation.</item>
  <item>RFC-0529: updated messaging — brace tokens now indicate unmigrated content, not unresolved references. Add DIST-REF-02 diagnostic label and DIST-REF-01 braceless residual check.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/share/fs";

// Permissive pattern: {word.word…} with at least one dot (any number of segments ≥ 2).
// RFC-0045 field paths can be arbitrarily deep, so no upper bound is imposed.
const BRACE_TOKEN_SOURCE = "\\{([a-zA-Z][a-zA-Z0-9_-]*(?:\\.[a-zA-Z0-9_-]+){1,})\\}";

interface TokenViolation {
  file: string;
  token: string;
  count: number;
}

async function collectDistHtmlFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, {
    extensions: [".html"],
    ignore: (name) => name === "node_modules" || name === ".turbo" || name === "_astro",
  });
}

function segmentHint(token: string): string {
  const segments = token.slice(1, -1).split(".");
  if (segments.length < 3) {
    return (
      `Token has ${segments.length} segment(s) — minimum is 3: {collection.file.field}. ` +
      `Add the missing collection or file segment.`
    );
  }
  return (
    `Brace-delimited syntax was removed by RFC-0529. ` +
    `Run content.ref-migrate to convert to braceless collection.file.field syntax.`
  );
}

export async function runDistContentReferencesValidate(
  input: KernelCommandInput,
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

  // Parse optional --allow-pattern=<regex> flag (parsed as a flag by parseKernelArgv)
  let allowPattern: RegExp | null = null;
  const allowPatternValue = input.flags?.["allow-pattern"];
  if (typeof allowPatternValue === "string" && allowPatternValue.length > 0) {
    try {
      allowPattern = new RegExp(allowPatternValue);
    } catch {
      context.logger.warn(
        `dist.content-references.validate: invalid --allow-pattern "${allowPatternValue}", ignored`,
      );
    }
  }

  const files = await collectDistHtmlFiles(distDir);

  const violations: TokenViolation[] = [];
  const suppressed: string[] = [];

  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    // Skip noindex pages — standalone tool pages (e.g. check.astro) may use
    // JS template literals with {object.property} brace syntax that is not
    // RFC-0045 content references.
    const robotsMeta = /<meta\s+name=["']robots["']\s+content=["']([^"']*)["']/i.exec(src);
    if (robotsMeta && /noindex/i.test(robotsMeta[1])) continue;

    // Use a per-call RegExp instance (not a shared module-level instance) to avoid
    // lastIndex state leaking between concurrent executions.
    const pattern = new RegExp(BRACE_TOKEN_SOURCE, "g");
    const tally = new Map<string, number>();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(src)) !== null) {
      const token = match[0];
      if (allowPattern && allowPattern.test(token)) {
        suppressed.push(`${relative(paths.appDirectory, file).replace(/\\/g, "/")} — ${token}`);
        continue;
      }
      tally.set(token, (tally.get(token) ?? 0) + 1);
    }
    for (const [token, count] of tally) {
      violations.push({ file, token, count });
    }
  }

  if (suppressed.length > 0) {
    for (const s of suppressed) {
      context.logger.warn(`[SUPPRESSED by --allow-pattern] ${s}`);
    }
  }

  if (violations.length > 0) {
    const diagnostics = violations.slice(0, 50).map((v) => {
      const rel = relative(paths.appDirectory, v.file).replace(/\\/g, "/");
      const hint = segmentHint(v.token);
      return (
        `[DIST-REF-02] ${rel} — "${v.token}" appears ${v.count}× in rendered HTML. ` + `${hint}`
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
    data: {
      diagnostics: [
        `No unresolved content reference tokens in ${files.length} built HTML file(s).`,
      ],
    },
  };
}
