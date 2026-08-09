/*
<MODULE_CONTRACT>
<purpose>Managed public surface commands: clean, orphans, redirect map, and deploy parity (RFC-0318).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted managed-public commands from public-surface.ts into public-surface/managed-public.ts.</item>
  <item>RFC-0589: REDIR-03 rejects 410 for cloudflare-workers adapter sites. Valid statuses expanded to [200, 301, 302, 303, 307, 308]. Adapter resolved from systems/registry.yaml.</item>
</CHANGE_SUMMARY>
*/

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import {
  type AppPublicContext,
  appRel,
  asString,
  diagnostics,
  extractSitemapUrls,
  loadPublicContext,
  normalizePublicRelPath,
  normalizeUrl,
  readTextIfExists,
  sameSitePath,
} from "./shared.ts";
import { passResult } from "../result-helpers.ts";
import { parseRedirectRules } from "@warpgogol/werkstatt-site/share/redirects";

function normalizeUrlPath(pathname: string): string {
  const clean = pathname.trim().replace(/^\/+|\/+$/g, "");
  return clean ? `/${clean}/` : "/";
}

const VALID_REDIRECT_STATUSES = [200, 301, 302, 303, 307, 308];

export async function resolveDeploymentAdapter(
  context: KernelRuntimeContext,
  appId: string,
): Promise<string | null> {
  const registryPath = join(context.workspaceRoot, "systems", "registry.yaml");
  try {
    const raw = await context.io.readFile(registryPath);
    const parsed = yamlParse(raw) as {
      systems?: Array<{ id: string; deployment?: { adapter?: string } }>;
    };
    const system = parsed.systems?.find((s) => s.id === appId);
    return system?.deployment?.adapter ?? null;
  } catch {
    return null;
  }
}

function routePathVariants(pathname: string): string[] {
  const normalized = normalizeUrlPath(pathname);
  const noSlash = normalized === "/" ? "/" : normalized.replace(/\/$/, "");
  return normalized === noSlash ? [normalized] : [normalized, noSlash];
}

async function sitemapPaths(
  context: KernelRuntimeContext,
  app: AppPublicContext,
): Promise<Set<string>> {
  const paths = new Set<string>();
  const sitemapFiles = await context.io.glob("sitemap*.xml", { cwd: app.publicDirectory });
  for (const relPath of sitemapFiles) {
    const xml = await context.io.readFile(join(app.publicDirectory, relPath));
    for (const loc of extractSitemapUrls(xml)) {
      const path = sameSitePath(app, loc);
      if (!path) continue;
      for (const variant of routePathVariants(path)) paths.add(variant);
    }
  }
  return paths;
}

function isLanguageRootTwin(relPath: string, app: AppPublicContext): boolean {
  return app.languages.some((lang) => relPath === `${lang}/index.md`);
}

async function removeEmptyDirs(root: string, removed: string[]): Promise<void> {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirs(join(root, entry.name), removed);
    }
  }
  entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) {
    await fs.rmdir(root);
    removed.push(root);
  }
}

async function findEmptyDirs(root: string, out: string[]): Promise<boolean> {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return false;
  }
  let hasContent = false;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childHasContent = await findEmptyDirs(join(root, entry.name), out);
      hasContent = hasContent || childHasContent;
    } else {
      hasContent = true;
    }
  }
  if (!hasContent && root !== root.replace(/[\\/]public$/, "")) out.push(root);
  return hasContent;
}

async function staleMarkdownTwinFiles(
  context: KernelRuntimeContext,
  app: AppPublicContext,
): Promise<string[]> {
  const files = (await context.io.glob("**/*.md", { cwd: app.publicDirectory })).map(
    normalizePublicRelPath,
  );
  const stale: string[] = [];
  for (const relPath of files) {
    if (!relPath.endsWith("/index.md")) continue;
    if (relPath === "index.md" || isLanguageRootTwin(relPath, app)) continue;
    const absolutePath = join(app.publicDirectory, relPath);
    const body = await readTextIfExists(context, absolutePath);
    if (body && hasGeneratedMarker(body)) stale.push(absolutePath);
  }
  return stale;
}

export async function runPublicManagedClean(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const dryRun = context.dryRun || Boolean(input.flags["dry-run"]);
  const stale = await staleMarkdownTwinFiles(context, app);
  const removed: string[] = [];
  for (const file of stale) {
    removed.push(appRel(app.appDirectory, file));
    if (!dryRun) await context.io.rm(file);
  }
  if (!dryRun) {
    const emptyDirs: string[] = [];
    for (const child of ["website", "uk/sait", "leistungen", "uk/posluhy"]) {
      await removeEmptyDirs(join(app.publicDirectory, child), emptyDirs);
    }
    removed.push(...emptyDirs.map((dir) => appRel(app.appDirectory, dir)));
  }
  return {
    data: { command: "public.managed.clean", status: "ok", removed, dryRun },
    exitCode: 0,
    summary: `public.managed.clean: ${removed.length} stale artifact(s)${dryRun ? " (dry-run)" : ""}`,
  };
}

export async function runPublicOrphansValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  const stale = await staleMarkdownTwinFiles(context, app);
  for (const file of stale) {
    messages.push({
      severity: "error",
      file: appRel(app.appDirectory, file),
      message: "PUBORPH-01 stale old-scheme Markdown twin exists under /route/index.md.",
      fixHint: "Run public.managed.clean and regenerate page.markdown.generate/surface.generate.",
    });
  }

  const emptyDirs: string[] = [];
  for (const child of ["website", "uk/sait", "leistungen", "uk/posluhy"]) {
    await findEmptyDirs(join(app.publicDirectory, child), emptyDirs);
  }
  for (const dir of emptyDirs) {
    messages.push({
      severity: "error",
      file: appRel(app.appDirectory, dir),
      message: "PUBORPH-03 empty generated public directory remains after generation.",
      fixHint: "Run public.managed.clean.",
    });
  }

  return diagnostics("public.orphans.validate", messages);
}

export async function runRedirectMapValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const redirectsPath = join(app.publicDirectory, "_redirects");
  const body = await readTextIfExists(context, redirectsPath);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  if (!body) {
    messages.push({
      severity: "error",
      file: appRel(app.appDirectory, redirectsPath),
      message: "REDIR-01 missing generated _redirects file.",
      fixHint: "Run public.infrastructure.generate.",
    });
    return diagnostics("redirect.map.validate", messages);
  }
  if (!hasGeneratedMarker(body)) {
    messages.push({
      severity: "error",
      file: appRel(app.appDirectory, redirectsPath),
      message: "REDIR-02 _redirects must carry the generated marker.",
      fixHint: "Regenerate public infrastructure or intentionally remove generator ownership.",
    });
  }

  const livePaths = await sitemapPaths(context, app);
  const rules = parseRedirectRules(body);
  const adapter = await resolveDeploymentAdapter(context, app.appId);
  const rejects410 = adapter === "cloudflare-workers" || adapter === "null" || adapter === null;
  const fromTargets = new Map(rules.map((rule) => [normalizeUrlPath(rule.from), rule]));
  for (const rule of rules) {
    if (rule.status === 410 && rejects410) {
      messages.push({
        severity: "error",
        file: appRel(app.appDirectory, redirectsPath),
        message: `REDIR-03 status code 410 is not supported by ${adapter ?? "unknown"} adapter _redirects. Use middleware for 410 tombstones (RFC-0589).`,
        fixHint:
          "Use 301 or 308 for redirects. 410 tombstones are handled by middleware (RFC-0589).",
      });
    } else if (!VALID_REDIRECT_STATUSES.includes(rule.status)) {
      messages.push({
        severity: "error",
        file: appRel(app.appDirectory, redirectsPath),
        message: `REDIR-03 unsupported redirect status in "${rule.line}".`,
        fixHint: "Use 200, 301, 302, 303, 307, or 308 for _redirects entries.",
      });
    }
    const fromPattern = rule.from.includes("*") || rule.from.includes(":");
    const normalizedFrom = fromPattern ? rule.from : normalizeUrlPath(rule.from);
    if (!fromPattern && livePaths.has(normalizedFrom)) {
      messages.push({
        severity: "error",
        file: appRel(app.appDirectory, redirectsPath),
        message: `REDIR-04 redirect source is still a live canonical route: ${rule.from}`,
        fixHint: "Remove the redirect or retire the live route explicitly.",
      });
    }
    if (rule.status === 410 || !rule.to || /^https?:\/\//i.test(rule.to)) continue;
    if (rule.to.includes(":") || rule.to.includes("*")) continue;
    const target = normalizeUrlPath(rule.to);
    if (!livePaths.has(target)) {
      messages.push({
        severity: "error",
        file: appRel(app.appDirectory, redirectsPath),
        message: `REDIR-05 redirect target is not in the generated sitemap: ${rule.to}`,
        fixHint: "Point to a live canonical route.",
      });
    }
    if (fromTargets.has(target)) {
      messages.push({
        severity: "error",
        file: appRel(app.appDirectory, redirectsPath),
        message: `REDIR-06 redirect chain detected: ${rule.from} -> ${rule.to}`,
        fixHint: "Redirect directly to the final canonical target.",
      });
    }
  }

  return diagnostics("redirect.map.validate", messages);
}

export async function runDeploySurfaceParityValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const baseUrl = asString(input.flags["base-url"]);
  if (!baseUrl) {
    return passResult(
      "deploy.surface.parity.validate",
      "deploy.surface.parity.validate: skipped (no --base-url)",
    );
  }
  const normalized = normalizeUrl(baseUrl);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  try {
    const live = await fetch(`${normalized}/sitemap.xml`);
    if (!live.ok) throw new Error(`HTTP ${live.status}`);
    const liveUrls = new Set(
      extractSitemapUrls(await live.text()).map((url) => new URL(url).pathname),
    );
    const localUrls = new Set(
      [...(await sitemapPaths(context, app))].map((path) => path.replace(/\/$/, "") || "/"),
    );
    for (const path of localUrls) {
      if (!liveUrls.has(path.replace(/\/$/, "") || "/")) {
        messages.push({
          severity: "error",
          message: `PARITY-01 local sitemap URL is absent from deployed sitemap: ${path}`,
          fixHint: "Deploy current build before reindexing or IndexNow submission.",
        });
        break;
      }
    }
  } catch (error) {
    messages.push({
      severity: "error",
      message: `PARITY-00 failed to fetch deployed sitemap: ${(error as Error).message}`,
      fixHint: "Check --base-url and network access.",
    });
  }
  return diagnostics("deploy.surface.parity.validate", messages);
}
