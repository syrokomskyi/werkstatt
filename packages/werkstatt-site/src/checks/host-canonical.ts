/*
<MODULE_CONTRACT>
<purpose>
  RFC-0908: Post-build validator that checks host canonicalization (www↔apex
  redirect) is configured in wrangler config or Worker source code. Rules:
  HOST-CANON-01 (missing www→apex redirect), HOST-CANON-02 (missing apex→www
  redirect), HOST-CANON-03 (ambiguous canonical host, warning).
</purpose>
<non-goals>
  <item>Do not generate or modify wrangler config or Worker source — validation only.</item>
  <item>Do not check _redirects for host canonicalization — Cloudflare Pages _redirects supports only path-based patterns, not host-based.</item>
  <item>Do not validate trailing-slash normalization — that is owned by trailing.slash.config.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0908: initial implementation — host.canonical.config.validate with HOST-CANON-01..03 rules.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { resolveDeploymentAdapter } from "./public-surface/managed-public.ts";

const COMMAND = "host.canonical.config.validate";

interface HostCanonicalResult {
  canonicalHost: string;
  redirectConfigured: boolean;
}

function stripJsoncComments(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let inString = false;
      let escaped = false;
      let result = "";
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (escaped) {
          result += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          result += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          result += ch;
          continue;
        }
        if (!inString && ch === "/" && line[i + 1] === "/") {
          break;
        }
        result += ch;
      }
      return result;
    })
    .join("\n");
}

async function readWranglerRoutes(
  context: KernelRuntimeContext,
  appDirectory: string,
): Promise<string[] | null> {
  const jsoncPath = join(appDirectory, "wrangler.jsonc");
  const jsonPath = join(appDirectory, "wrangler.json");
  const tomlPath = join(appDirectory, "wrangler.toml");

  if (await context.io.exists(jsoncPath)) {
    try {
      const raw = await context.io.readFile(jsoncPath);
      const parsed = JSON.parse(stripJsoncComments(raw)) as { routes?: unknown };
      return extractRoutesFromJson(parsed);
    } catch {
      return [];
    }
  }

  if (await context.io.exists(jsonPath)) {
    try {
      const raw = await context.io.readFile(jsonPath);
      const parsed = JSON.parse(raw) as { routes?: unknown };
      return extractRoutesFromJson(parsed);
    } catch {
      return [];
    }
  }

  if (await context.io.exists(tomlPath)) {
    try {
      const raw = await context.io.readFile(tomlPath);
      return extractRoutesFromToml(raw);
    } catch {
      return [];
    }
  }

  return null;
}

function extractRoutesFromJson(parsed: unknown): string[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const obj = parsed as { routes?: unknown };
  if (Array.isArray(obj.routes)) {
    return obj.routes.flatMap((r) => {
      if (typeof r === "string") return [r];
      if (
        typeof r === "object" &&
        r !== null &&
        typeof (r as { pattern?: unknown }).pattern === "string"
      ) {
        return [(r as { pattern: string }).pattern];
      }
      return [];
    });
  }
  return [];
}

function extractRoutesFromToml(raw: string): string[] {
  const routes: string[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const patternMatch = trimmed.match(/^pattern\s*=\s*"([^"]+)"/);
    if (patternMatch) {
      routes.push(patternMatch[1]);
      continue;
    }
  }
  const arrayMatch = raw.match(/routes\s*=\s*\[([^\]]*)\]/s);
  if (arrayMatch) {
    const inner = arrayMatch[1];
    const stringMatches = inner.matchAll(/"([^"]+)"/g);
    for (const m of stringMatches) {
      routes.push(m[1]);
    }
  }
  return routes;
}

function extractHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

function isAmbiguousHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "example.com" ||
    host === "example.org" ||
    host === "0.0.0.0" ||
    host === ""
  );
}

function isApex(host: string): boolean {
  return !host.startsWith("www.");
}

function nonCanonicalHost(canonicalHost: string): string {
  return isApex(canonicalHost) ? `www.${canonicalHost}` : canonicalHost.replace(/^www\./, "");
}

function routeMatchesHost(route: string, host: string): boolean {
  const routeHost = route.split("/")[0]?.split(":")[0];
  return routeHost === host;
}

const HOST_REDIRECT_PATTERNS = [
  /request\.headers\.get\s*\(\s*["']host["']\s*\)/i,
  /\.hostname\s*[=!]==?\s*["']/i,
  /url\.host\s*[=!]==?\s*["']/i,
  /Response\.redirect\s*\(/i,
  /\.headers\.get\s*\(\s*["']host["']\s*\)/i,
];

async function scanWorkerSourceForHostRedirect(
  context: KernelRuntimeContext,
  srcDirectory: string,
): Promise<boolean> {
  const candidates: string[] = [];

  const middlewareFile = join(srcDirectory, "middleware.ts");
  if (await context.io.exists(middlewareFile)) {
    candidates.push(middlewareFile);
  }

  const middlewareDir = join(srcDirectory, "middleware");
  if (await context.io.exists(middlewareDir)) {
    const files = await context.io.glob("**/*.ts", { cwd: middlewareDir });
    for (const rel of files) {
      candidates.push(join(middlewareDir, rel));
    }
  }

  for (const filePath of candidates) {
    try {
      const content = await context.io.readFile(filePath);
      if (HOST_REDIRECT_PATTERNS.some((p) => p.test(content))) {
        return true;
      }
    } catch {
      // skip unreadable files
    }
  }

  return false;
}

export async function runHostCanonicalConfigValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const siteUrl = await readAstroSiteUrl(paths.appDirectory);

  if (!siteUrl) {
    return diagnosticsResult(COMMAND, [
      {
        ruleId: "HOST-CANON-03",
        severity: "warning",
        file: "astro.config.mjs",
        message: "No site URL found in astro.config.mjs — cannot determine canonical host.",
        fixHint:
          "Set the `site` field in astro.config.mjs to the canonical URL (e.g. https://warpgogol.com).",
      },
    ]);
  }

  const canonicalHost = extractHost(siteUrl);
  if (!canonicalHost || isAmbiguousHost(canonicalHost)) {
    return diagnosticsResult(COMMAND, [
      {
        ruleId: "HOST-CANON-03",
        severity: "warning",
        file: "astro.config.mjs",
        message: `Canonical host is ambiguous or non-production: "${canonicalHost ?? "missing"}" — host canonicalization check skipped.`,
        fixHint: "Set the `site` field in astro.config.mjs to the production canonical URL.",
      },
    ]);
  }

  const nonCanonical = nonCanonicalHost(canonicalHost);
  const isApexCanonical = isApex(canonicalHost);
  const missingRedirectRule = isApexCanonical ? "HOST-CANON-01" : "HOST-CANON-02";
  const redirectDescription = isApexCanonical
    ? `${nonCanonical} → ${canonicalHost}`
    : `${nonCanonical} → ${canonicalHost}`;

  const adapter = await resolveDeploymentAdapter(context, context.site?.name ?? "");
  const checkWorkerRoutes = adapter === "cloudflare-workers" || adapter === "cloudflare-pages";

  let redirectConfigured = false;

  if (checkWorkerRoutes) {
    const routes = await readWranglerRoutes(context, paths.appDirectory);
    if (routes && routes.some((r) => routeMatchesHost(r, nonCanonical))) {
      redirectConfigured = true;
    }
  }

  if (!redirectConfigured) {
    const foundInWorker = await scanWorkerSourceForHostRedirect(context, paths.srcDirectory);
    if (foundInWorker) {
      redirectConfigured = true;
    }
  }

  if (redirectConfigured) {
    const result: HostCanonicalResult = {
      canonicalHost,
      redirectConfigured: true,
    };
    return passResult(
      COMMAND,
      `${COMMAND}: OK — canonical host "${canonicalHost}", ${redirectDescription} redirect configured`,
    );
  }

  return diagnosticsResult(COMMAND, [
    {
      ruleId: missingRedirectRule,
      severity: "error",
      file: checkWorkerRoutes ? "wrangler.toml" : "src/middleware.ts",
      message: `Canonical host is ${canonicalHost} but no ${redirectDescription} redirect found in wrangler config or Worker source code.`,
      fixHint: `Configure a ${redirectDescription} redirect in the Worker fetch handler (src/middleware.ts) or add a wrangler route for ${nonCanonical}.`,
    },
  ]);
}
