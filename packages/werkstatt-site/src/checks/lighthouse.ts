/* <MODULE_CONTRACT>
<purpose>Enforces performance standards and budget constraints for Astro applications through structured validation and analysis.</purpose>
<non-goals>
  <item>Do not modify source files or configurations directly; focus on reporting findings.</item>
  <item>Do not perform checks unrelated to Astro projects or their specific performance metrics.</item>
  <item>Do not parse raw content; concentrate on structured analysis and validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhance Compass scaffolding to improve navigability and maintainability of performance validation and budget checks.</item>
  <item>Distinguish lazy hls.light/Plyr feature-video chunks from route bundles under LH-10.</item>
  <item>RFC-0833: add LH-13 forced reflow detection to lighthouse.validate.</item>
  <item>RFC-0833: add LH-11 render-blocking CSS and LH-12 unreferenced JS detection to lighthouse.budget.check.</item>
</CHANGE_SUMMARY> */

import { join, relative, dirname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { getLineColumn } from "@warpgogol/werkstatt-site/share/text-position";
import {
  runPerformanceVitalsInstrument,
  type PerformanceVitalsState,
  toDeterministicContext,
} from "@syrokomskyi/axiom-study";
interface Finding {
  filePath: string;
  line: number;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

const ROUTE_BUNDLE_BUDGET_KB = 300;
const LAZY_FEATURE_VIDEO_BUDGET_KB = 360;

function budgetForClientBundle(normalizedPath: string): number {
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  if (/^(hls\.light|plyr)\.[a-zA-Z0-9_-]+\.js$/.test(fileName)) {
    return LAZY_FEATURE_VIDEO_BUDGET_KB;
  }
  return ROUTE_BUNDLE_BUDGET_KB;
}

async function collectFilesByExtension(dirPath: string, extensions: string[]): Promise<string[]> {
  return collectFiles(dirPath, {
    extensions,
    ignore: (name) =>
      name === "node_modules" || name === "dist" || name === ".astro" || name.startsWith("."),
  });
}

const RENDER_BLOCKING_THRESHOLD_KB = 4;

const DOM_WRITE_REGEX =
  /(?:appendChild|insertBefore|removeChild|innerHTML\s*=|textContent\s*=|style\.\w+\s*=|classList\.(?:add|remove|toggle))/;

const LAYOUT_READ_REGEX =
  /\.(getBoundingClientRect|getClientRects|offsetWidth|offsetHeight|offsetTop|offsetLeft|clientWidth|clientHeight|clientTop|clientLeft|scrollTop|scrollLeft|scrollWidth|scrollHeight)\b/;

export function detectForcedReflow(
  content: string,
): { line: number; readProp: string; writeStmt: string }[] {
  const lines = content.split(/\r?\n/);
  const results: { line: number; readProp: string; writeStmt: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const writeMatch = line.match(DOM_WRITE_REGEX);
    if (!writeMatch) continue;

    const windowEnd = Math.min(i + 10, lines.length);
    for (let j = i + 1; j < windowEnd; j++) {
      const checkLine = lines[j];
      if (/requestAnimationFrame/.test(checkLine)) break;
      const readMatch = checkLine.match(LAYOUT_READ_REGEX);
      if (readMatch) {
        results.push({
          line: i + 1,
          readProp: readMatch[1],
          writeStmt: writeMatch[0],
        });
        break;
      }
    }
  }
  return results;
}

export async function detectRenderBlockingCss(
  htmlContent: string,
  distClientDir: string,
  inlineStylesheets: string | undefined,
): Promise<{ line: number; href: string; sizeKb: number; severity: "error" | "warning" }[]> {
  const results: { line: number; href: string; sizeKb: number; severity: "error" | "warning" }[] =
    [];
  const strippedContent = htmlContent.replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");
  const linkRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi;

  for (const match of strippedContent.matchAll(linkRegex)) {
    const tag = match[0];
    const matchIndex = match.index ?? 0;

    if (/media=["']print["']/i.test(tag)) continue;
    if (/rel=["']preload["']/i.test(tag)) continue;

    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];

    const cssPath = join(distClientDir, href.replace(/^\//, ""));
    const { line } = getLineColumn(htmlContent, matchIndex);

    let sizeKb = 0;
    try {
      const stats = await stat(cssPath);
      sizeKb = stats.size / 1024;
    } catch {
      results.push({ line, href, sizeKb: 0, severity: "warning" });
      continue;
    }

    if (
      (inlineStylesheets === "auto" || inlineStylesheets === "always") &&
      sizeKb <= RENDER_BLOCKING_THRESHOLD_KB
    ) {
      continue;
    }

    results.push({
      line,
      href,
      sizeKb,
      severity: sizeKb > RENDER_BLOCKING_THRESHOLD_KB ? "error" : "warning",
    });
  }
  return results;
}

export async function buildJsReferenceGraph(
  htmlFiles: string[],
  distClientDir: string,
): Promise<{ unreferenced: string[] }> {
  const referenced = new Set<string>();
  const queue: string[] = [];
  const scriptSrcRegex = /<script\s+[^>]*src=["']([^"']+\.js)["'][^>]*>/gi;

  for (const htmlFile of htmlFiles) {
    const content = await readFile(htmlFile, "utf8");
    for (const match of content.matchAll(scriptSrcRegex)) {
      const src = match[1];
      const jsPath = join(distClientDir, src.replace(/^\//, "")).replace(/\\/g, "/");
      if (!referenced.has(jsPath)) {
        referenced.add(jsPath);
        queue.push(jsPath);
      }
    }
  }

  while (queue.length > 0) {
    const jsFile = queue.shift()!;
    try {
      const content = await readFile(jsFile, "utf8");
      const importRegex =
        /(?:import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']|from\s*["']([^"']+)["'])/g;
      for (const match of content.matchAll(importRegex)) {
        const importPath = match[1] ?? match[2] ?? match[3];
        if (!importPath) continue;
        if (!importPath.startsWith(".") && !importPath.startsWith("/")) continue;
        const resolved = join(dirname(jsFile), importPath).replace(/\\/g, "/");
        if (!referenced.has(resolved)) {
          referenced.add(resolved);
          queue.push(resolved);
        }
      }
    } catch {
      continue;
    }
  }

  const astroDir = join(distClientDir, "_astro");
  let allJsFiles: string[] = [];
  try {
    allJsFiles = await collectFilesByExtension(astroDir, [".js"]);
  } catch {
    // _astro directory doesn't exist
  }

  const unreferenced: string[] = [];
  for (const jsFile of allJsFiles) {
    const normalized = jsFile.replace(/\\/g, "/");
    if (!referenced.has(normalized)) {
      unreferenced.push(jsFile);
    }
  }

  return { unreferenced };
}

async function findAstroConfig(
  appDirectory: string,
): Promise<{ output?: string; inlineStylesheets?: string } | null> {
  const configPaths = [
    join(appDirectory, "astro.config.mjs"),
    join(appDirectory, "astro.config.ts"),
    join(appDirectory, "astro.config.js"),
  ];

  for (const configPath of configPaths) {
    try {
      const content = await readFile(configPath, "utf8");
      const outputMatch = content.match(/output\s*:\s*['"]([^'"]+)['"]/);
      const inlineMatch = content.match(/inlineStylesheets\s*:\s*['"]([^'"]+)['"]/);
      return { output: outputMatch?.[1], inlineStylesheets: inlineMatch?.[1] };
    } catch {
      continue;
    }
  }
  return null;
}
export async function runLighthouseValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ findings: number }>> {
  const paths = requireAstroSitePaths(context);
  const findings: Finding[] = [];

  // LH-01: Check static output configuration
  const astroConfig = await findAstroConfig(paths.appDirectory);
  if (astroConfig?.output && astroConfig.output !== "static") {
    findings.push({
      filePath: "astro.config.*",
      line: 1,
      rule: "LH-01",
      message: `output: '${astroConfig.output}' found — prefer 'static' for marketing pages`,
      severity: "warning",
    });
  }

  // Collect Astro files for LH-02, LH-03, LH-04 checks
  const astroFiles = await collectFilesByExtension(paths.srcDirectory, [".astro"]);

  for (const filePath of astroFiles) {
    const content = await readFile(filePath, "utf8");
    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    // LH-04: Check for script src without defer/async
    const scriptSrcRegex = /<script\s+[^>]*src="[^"]+"[^>]*>/gi;
    for (const match of content.matchAll(scriptSrcRegex)) {
      const matchText = match[0];
      // Skip if already has defer or async
      if (/\b(defer|async)\b/.test(matchText)) continue;
      // Skip inline scripts (no src)
      if (!matchText.includes("src=")) continue;

      const { line } = getLineColumn(content, match.index ?? 0);
      findings.push({
        filePath: relativePath,
        line,
        rule: "LH-04",
        message: `<script src> without defer/async — add defer for non-blocking load`,
        severity: "error",
      });
    }

    // LH-03: Check for synchronous imports of heavy libraries
    const heavyLibs = ["three", "@react-three", "babylonjs", "phaser", "playcanvas"];
    const importRegex = new RegExp(
      `^import\\s+(?:[^'"]*\\s+from\\s+)?['"](${heavyLibs.join("|")})`,
      "gim",
    );
    for (const match of content.matchAll(importRegex)) {
      const { line } = getLineColumn(content, match.index ?? 0);
      findings.push({
        filePath: relativePath,
        line,
        rule: "LH-03",
        message: `Synchronous import of heavy library '${match[1]}' — use dynamic import() instead`,
        severity: "error",
      });
    }
  }

  // RFC-0833 LH-13: Check .astro inline scripts for forced reflow patterns
  for (const filePath of astroFiles) {
    const content = await readFile(filePath, "utf8");
    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    const inlineScriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    for (const scriptMatch of content.matchAll(inlineScriptRegex)) {
      const scriptContent = scriptMatch[1];
      const reflowFindings = detectForcedReflow(scriptContent);
      for (const rf of reflowFindings) {
        const { line: scriptLine } = getLineColumn(content, scriptMatch.index ?? 0);
        findings.push({
          filePath: relativePath,
          line: scriptLine + rf.line - 1,
          rule: "LH-13",
          message: `Forced reflow: ${rf.writeStmt} followed by ${rf.readProp}() without requestAnimationFrame separator`,
          severity: "warning",
        });
      }
    }
  }

  // Collect script files for LH-02, LH-05, LH-06, LH-07, LH-08 checks
  const scriptsDir = join(paths.srcDirectory, "scripts");
  const scriptFiles = await collectFilesByExtension(scriptsDir, [".ts", ".js"]);

  for (const filePath of scriptFiles) {
    const content = await readFile(filePath, "utf8");
    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");

    // LH-02: Check for dynamic imports without DOM guards
    const dynamicImportRegex = /await\s+import\s*\(/g;
    for (const match of content.matchAll(dynamicImportRegex)) {
      // Check if there's a guard before this import in the file
      const beforeImport = content.slice(0, match.index);
      const hasGuard =
        /has\s*\([^)]*\)|querySelector\s*\(|getElementById\s*\(|matches\s*\(/.test(
          beforeImport.slice(-200),
        ) ||
        /if\s*\([^)]*(?:has|querySelector|getElementById|matches)/.test(beforeImport.slice(-500));

      if (!hasGuard) {
        const { line } = getLineColumn(content, match.index ?? 0);
        findings.push({
          filePath: relativePath,
          line,
          rule: "LH-02",
          message: `Dynamic import without DOM guard — add has() or querySelector check first`,
          severity: "warning",
        });
      }
    }

    // LH-05: Check for long setTimeout without requestIdleCallback
    const setTimeoutRegex = /setTimeout\s*\([^,]+,\s*(\d{3,})\s*\)/g;
    for (const match of content.matchAll(setTimeoutRegex)) {
      const delay = parseInt(match[1], 10);
      if (delay >= 100) {
        // Check if requestIdleCallback is used anywhere in the file
        if (!/requestIdleCallback/.test(content)) {
          const { line } = getLineColumn(content, match.index ?? 0);
          findings.push({
            filePath: relativePath,
            line,
            rule: "LH-05",
            message: `setTimeout(${delay}ms) without requestIdleCallback — use idle scheduler for non-critical work`,
            severity: "warning",
          });
        }
      }
    }

    // LH-06: Check for user action deferring (look for event listeners)
    const heavyInitPatterns = [
      /new\s+Lenis\s*\(/,
      /new\s+GSAP\s*\(/,
      /gsap\.[a-z]+\s*\(/,
      /ScrollTrigger\./,
    ];
    for (const pattern of heavyInitPatterns) {
      if (pattern.test(content)) {
        // Check for user action defer patterns
        const hasUserDefer =
          /addEventListener\s*\(\s*["'](pointerdown|keydown|touchstart|scroll)["']/.test(content) &&
          /\{\s*once:\s*true\s*\}/.test(content);

        if (!hasUserDefer) {
          const match = content.match(pattern);
          if (match?.index !== undefined) {
            const { line } = getLineColumn(content, match.index);
            findings.push({
              filePath: relativePath,
              line,
              rule: "LH-06",
              message: `Heavy animation init without user-action defer — wrap in pointerdown/keydown/touchstart listener with { once: true }`,
              severity: "warning",
            });
          }
        }
        break; // Only report once per file
      }
    }

    // LH-07: Check for reduced motion guards in animation code
    const animationKeywords = ["animation", "scroll", "motion", "Lenis", "GSAP", "gsap"];
    const hasAnimation = animationKeywords.some((kw) => content.includes(kw));
    if (hasAnimation) {
      const hasReducedMotionCheck = /prefersReducedMotion|prefers-reduced-motion/.test(content);
      if (!hasReducedMotionCheck) {
        findings.push({
          filePath: relativePath,
          line: 1,
          rule: "LH-07",
          message: `Animation/scroll code without reduced-motion guard — add prefersReducedMotion check`,
          severity: "warning",
        });
      }
    }

    // LH-08: Check for device capability checks
    const heavyFeaturePatterns = [/Lenis/, /GSAP/, /gsap/, /Three/, /WebGL/];
    for (const pattern of heavyFeaturePatterns) {
      if (pattern.test(content)) {
        const hasCapabilityCheck = /deviceMemory|hardwareConcurrency|connection\?\.saveData/.test(
          content,
        );
        if (!hasCapabilityCheck) {
          const match = content.match(pattern);
          if (match?.index !== undefined) {
            const { line } = getLineColumn(content, match.index);
            findings.push({
              filePath: relativePath,
              line,
              rule: "LH-08",
              message: `Heavy feature '${match[0]}' without device capability check — add deviceMemory/hardwareConcurrency/saveData guards`,
              severity: "warning",
            });
          }
        }
        break;
      }
    }

    // LH-09: Check for DOM diffing before writes (good patterns)
    // This is informational — we look for the pattern but don't flag absence
    const directDomWrite = /textContent\s*=\s*[^=]|innerHTML\s*=\s*[^=]/;
    const hasDomDiffing = /===?\s*[^=]+\s*\?\s*.*:|textContent\s*!==|innerHTML\s*!==/.test(content);

    if (directDomWrite.test(content) && !hasDomDiffing) {
      const match = content.match(directDomWrite);
      if (match?.index !== undefined) {
        const { line } = getLineColumn(content, match.index);
        findings.push({
          filePath: relativePath,
          line,
          rule: "LH-09",
          message: `Direct DOM write without diffing — compare values before writing to prevent hydration flicker`,
          severity: "warning",
        });
      }
    }

    // RFC-0833 LH-13: Check for forced reflow patterns (read-after-write without rAF)
    const reflowFindings = detectForcedReflow(content);
    for (const rf of reflowFindings) {
      findings.push({
        filePath: relativePath,
        line: rf.line,
        rule: "LH-13",
        message: `Forced reflow: ${rf.writeStmt} followed by ${rf.readProp}() without requestAnimationFrame separator`,
        severity: "warning",
      });
    }
  }

  // Output findings
  let errorCount = 0;
  let warningCount = 0;

  for (const finding of findings) {
    const message = `[${finding.rule}] ${finding.filePath}:${finding.line} — ${finding.message}`;
    if (finding.severity === "error") {
      context.logger.error(message);
      errorCount++;
    } else {
      context.logger.warn(message);
      warningCount++;
    }
  }

  const totalFindings = findings.length;
  const hasErrors = errorCount > 0;

  return {
    data: { findings: totalFindings },
    exitCode: hasErrors ? 1 : 0,
    summary:
      totalFindings === 0
        ? "[lighthouse.validate] OK — no performance violations detected"
        : `[lighthouse.validate] ${errorCount} error(s), ${warningCount} warning(s)`,
  };
}
async function readBudgetIgnorePatterns(appDirectory: string): Promise<string[]> {
  const ignoreFile = join(appDirectory, ".lighthouse-budget-ignore");
  try {
    const content = await readFile(ignoreFile, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

export async function runLighthouseBudgetCheck(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{ totalSize: number; violations: number; instrumentRunId?: string }>
> {
  const paths = requireAstroSitePaths(context);
  const distDir = join(paths.appDirectory, "dist");

  let totalSize = 0;
  let violations = 0;
  const findings: Finding[] = [];

  const ignorePatterns = await readBudgetIgnorePatterns(paths.appDirectory);

  // Collect JS files in dist
  const jsFiles = await collectFilesByExtension(distDir, [".js", ".mjs"]);

  for (const filePath of jsFiles) {
    try {
      const stats = await stat(filePath);
      const sizeKb = stats.size / 1024;
      totalSize += stats.size;

      // LH-10: 300KB uncompressed budget per route/client entry bundle.
      // RFC-0210 lazy feature-video vendor chunks (hls.light/Plyr) are not route
      // bundles; they remain capped separately so a full hls.js import still fails.
      // Astro typically outputs client bundles to dist/client/_astro/
      // Exclude: dist/server/ (SSR chunks, not sent to browser)
      // Exclude: *.worker.* files (web workers, not main-thread JS)
      const normalizedPath = filePath.replace(/\\/g, "/");
      const isClientBundle =
        normalizedPath.includes("/_astro/") && !normalizedPath.includes("/dist/server/");
      const isWorker = /\.worker\.[^/]+$/.test(normalizedPath);
      const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      const isIgnored = ignorePatterns.some((pattern) => relativePath.includes(pattern));
      const budgetKb = budgetForClientBundle(normalizedPath);
      if (sizeKb > budgetKb && isClientBundle && !isWorker && !isIgnored) {
        findings.push({
          filePath: relativePath,
          line: 1,
          rule: "LH-10",
          message: `${sizeKb.toFixed(1)}KB exceeds ${budgetKb}KB bundle budget`,
          severity: "error",
        });
        violations++;
      }
    } catch {
      continue;
    }
  }

  // RFC-0833 LH-11: Render-blocking CSS detection
  const astroConfig = await findAstroConfig(paths.appDirectory);
  const distClientDir = join(distDir, "client");
  const htmlFiles = await collectFilesByExtension(distDir, [".html"]);
  for (const htmlFile of htmlFiles) {
    const htmlContent = await readFile(htmlFile, "utf8");
    const relativePath = relative(paths.appDirectory, htmlFile).replace(/\\/g, "/");
    const cssFindings = await detectRenderBlockingCss(
      htmlContent,
      distClientDir,
      astroConfig?.inlineStylesheets,
    );
    for (const cf of cssFindings) {
      findings.push({
        filePath: relativePath,
        line: cf.line,
        rule: "LH-11",
        message: `Render-blocking CSS: ${cf.href} (${cf.sizeKb.toFixed(1)}KB) — use inlineStylesheets: 'auto' or preload pattern`,
        severity: cf.severity,
      });
      if (cf.severity === "error") violations++;
    }
  }

  // RFC-0833 LH-12: Unreferenced JS bundle detection
  const { unreferenced } = await buildJsReferenceGraph(htmlFiles, distClientDir);
  for (const unreferencedFile of unreferenced) {
    const relativePath = relative(paths.appDirectory, unreferencedFile).replace(/\\/g, "/");
    const isIgnored = ignorePatterns.some((pattern) => relativePath.includes(pattern));
    if (isIgnored) continue;
    findings.push({
      filePath: relativePath,
      line: 1,
      rule: "LH-12",
      message: `Unreferenced JS bundle — not imported by any HTML page or referenced JS file`,
      severity: "error",
    });
    violations++;
  }

  // Output findings
  for (const finding of findings) {
    const message = `[${finding.rule}] ${finding.filePath} — ${finding.message}`;
    if (finding.severity === "error") {
      context.logger.error(message);
    } else {
      context.logger.warn(message);
    }
  }

  const totalSizeKb = totalSize / 1024;

  // RFC-0016: call axiom-study performance-vitals instrument
  let instrumentRunId: string | undefined;
  try {
    const instrumentCtx = toDeterministicContext({
      origin: "build-time",
      recordedAt: new Date().toISOString(),
      auditId: "lighthouse.budget.check",
      environment: {},
    });
    const states: PerformanceVitalsState[] = [
      {
        url: "https://build.local/",
        locale: "de",
        profileId: context.site?.name ?? "site",
        logicalPath: "dist/",
        lcp: 0,
        cls: 0,
        inp: 0,
        fcp: 0,
        tbt: 0,
        resourceCount: jsFiles.length,
        transferSize: totalSize,
        renderBlockingResources: findings.map((f) => ({
          url: f.filePath,
          type: "script",
        })),
      },
    ];
    const instrumentResult = runPerformanceVitalsInstrument({ context: instrumentCtx, states });
    instrumentRunId = instrumentResult.instrumentRun.instrumentRunId;
  } catch {
    // Instrument failure must not break the gate
  }

  return {
    data: { totalSize, violations, instrumentRunId },
    exitCode: violations > 0 ? 1 : 0,
    summary:
      violations === 0
        ? `[lighthouse.budget.check] OK — total JS: ${totalSizeKb.toFixed(1)}KB`
        : `[lighthouse.budget.check] ${violations} violation(s) detected`,
  };
}
