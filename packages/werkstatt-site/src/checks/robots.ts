/*
<MODULE_CONTRACT>
<purpose>
  RFC-0052 robots.txt generation and validation commands.
  robots.generate reads the robots: block from system.md, calls buildRobotsTxt, writes public/robots.txt.
  robots.validate checks existence, non-emptiness, and expected directives.
</purpose>
<non-goals>
  <item>Do not read content through Astro runtime or astro:content.</item>
  <item>Do not duplicate formatting logic — delegate to @warpgogol/werkstatt-site/share/semantic buildRobotsTxt.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0052: Initial implementation.</item>
  <item>RFC-0267: robots.generate routed through context.io (WorkspaceIO port) — pilot migration; universal --dry-run works via the executor's recording adapter, replacing the hand-rolled dryRun guard.</item>
</CHANGE_SUMMARY>
*/

import { join, dirname, relative } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { buildRobotsTxt } from "@warpgogol/werkstatt-site/share/semantic";
import type { RobotsPolicy } from "@warpgogol/werkstatt-site/share/semantic";
import { diagnosticsResult } from "./result-helpers.ts";

// RFC-0375: robots.txt is a Category B (registry-only) file.
// No GENERATED_MARKER is emitted in the output.

// ---------------------------------------------------------------------------
// robots.generate
// ---------------------------------------------------------------------------

export async function runRobotsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.appDirectory, "src", "content");

  const { manifest } = await loadSystemManifest(contentDir);

  const robotsRaw = (manifest as unknown as Record<string, unknown>).robots as
    Record<string, unknown> | undefined;

  // RFC-0052: the Sitemap URL should be absolute (per RFC 9309 best practice
  // and to keep robots.txt independent of where the host is serving it).
  // When the system.md robots: block doesn't specify sitemap explicitly,
  // derive https://<identity.domain>/sitemap.xml from the app's canonical
  // domain. Falls back to relative "/sitemap.xml" only when no domain is
  // declared (development only — production deploys must have identity.domain).
  const identityDomain = manifest.identity?.domain?.trim();
  const defaultSitemap = identityDomain ? `https://${identityDomain}/sitemap.xml` : undefined;

  const policy: RobotsPolicy = robotsRaw
    ? {
        defaultPolicy: robotsRaw.defaultPolicy as "allow" | "disallow" | undefined,
        disallowedPaths: robotsRaw.disallowedPaths as string[] | undefined,
        allowedPaths: robotsRaw.allowedPaths as string[] | undefined,
        crawlerBlocklist: robotsRaw.crawlerBlocklist as string[] | undefined,
        crawlerAllowlist: robotsRaw.crawlerAllowlist as string[] | undefined,
        sitemap: (robotsRaw.sitemap as string | undefined) ?? defaultSitemap,
        customRules: robotsRaw.customRules as RobotsPolicy["customRules"],
      }
    : { sitemap: defaultSitemap };

  const robotsTxt = buildRobotsTxt(policy);
  const robotsPath = join(paths.publicDirectory, "robots.txt");

  // RFC-0601: return rendered content in dryRun mode for drift validation.
  if (context.dryRun) {
    const relPath = relative(context.workspaceRoot, robotsPath).replace(/\\/g, "/");
    return {
      data: {
        command: "robots.generate",
        status: "pass",
        site: context.site?.name,
        file: robotsPath,
        byteCount: robotsTxt.length,
        hasDefaultPolicy: !!policy.defaultPolicy,
        allowlistCount: policy.crawlerAllowlist?.length ?? 0,
        blocklistCount: policy.crawlerBlocklist?.length ?? 0,
        customRuleCount: policy.customRules?.length ?? 0,
        sitemapRef: policy.sitemap ?? "/sitemap.xml",
        renderedFiles: { [relPath]: robotsTxt },
      },
      exitCode: 0,
      summary: `robots.generate: dry-run — ${robotsTxt.length} bytes (would write robots.txt)`,
    };
  }

  // RFC-0267: routed through context.io — the executor supplies a recording
  // adapter under --dry-run (this block runs unconditionally; writeFile is
  // either real or recorded, never both) and a real adapter otherwise.
  // RFC-0375: robots.txt is Category B — no marker check, always overwrite.
  const fullOutput = robotsTxt;
  await context.io.mkdir(dirname(robotsPath));
  await context.io.writeFile(robotsPath, fullOutput);

  return {
    data: {
      command: "robots.generate",
      status: "pass",
      site: context.site?.name,
      file: robotsPath,
      byteCount: robotsTxt.length,
      hasDefaultPolicy: !!policy.defaultPolicy,
      allowlistCount: policy.crawlerAllowlist?.length ?? 0,
      blocklistCount: policy.crawlerBlocklist?.length ?? 0,
      customRuleCount: policy.customRules?.length ?? 0,
      sitemapRef: policy.sitemap ?? "/sitemap.xml",
    },
    exitCode: 0,
    summary: context.dryRun
      ? `robots.generate: dry-run — ${robotsTxt.length} bytes (would write robots.txt)`
      : `robots.generate: ${robotsTxt.length} bytes → robots.txt${policy.crawlerBlocklist?.length ? ` (${policy.crawlerBlocklist.length} blocked crawlers)` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// robots.validate
// ---------------------------------------------------------------------------

export async function runRobotsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const robotsPath = join(paths.publicDirectory, "robots.txt");

  const violations: string[] = [];
  const warnings: string[] = [];
  let content: string | undefined;

  try {
    content = await readFile(robotsPath, "utf-8");
  } catch {
    violations.push(`robots.txt not found at ${robotsPath}. Run robots.generate first.`);
  }

  if (content !== undefined) {
    if (content.length === 0) {
      violations.push("robots.txt is empty.");
    }

    if (!/^User-agent:/im.test(content)) {
      violations.push("robots.txt does not contain a User-agent directive.");
    }

    if (!/^Sitemap:/im.test(content)) {
      violations.push("robots.txt does not contain a Sitemap directive.");
    }

    if (!/^(Allow|Disallow):/im.test(content)) {
      violations.push("robots.txt does not contain any Allow or Disallow directive.");
    }

    if (content.length < 20) {
      warnings.push(`robots.txt is only ${content.length} bytes — expected at least 20.`);
    }

    if (content.length > 102400) {
      warnings.push(
        `robots.txt is ${content.length} bytes — exceeds 100 KiB limit, may be malformed.`,
      );
    }

    // Check that referenced sitemap file exists
    const sitemapMatch = content.match(/^Sitemap:\s*(\S+)/im);
    if (sitemapMatch) {
      const sitemapPath = sitemapMatch[1];
      const sitemapFilename = sitemapPath.split("/").pop() || "";
      if (sitemapFilename) {
        const sitemapFile = join(paths.publicDirectory, sitemapFilename);
        try {
          await readFile(sitemapFile, "utf-8");
        } catch {
          warnings.push(
            `Sitemap reference "${sitemapPath}" points to a file that does not exist in public/. Run sitemap.generate first.`,
          );
        }
      }
    }
  }

  const diagnostics: Diagnostic[] = [
    ...violations.map((message) => ({
      ruleId: "robots.validate",
      severity: "error" as const,
      file: "public/robots.txt",
      message,
      fixHint:
        "Run robots.generate and ensure robots.txt contains User-agent, Sitemap, and crawl rules.",
    })),
    ...warnings.map((message) => ({
      ruleId: "robots.validate",
      severity: "warning" as const,
      file: "public/robots.txt",
      message,
      fixHint:
        "Review robots.txt size and sitemap references, then regenerate source-controlled crawl policy if needed.",
    })),
  ];

  return diagnosticsResult("robots.validate", diagnostics);
}
