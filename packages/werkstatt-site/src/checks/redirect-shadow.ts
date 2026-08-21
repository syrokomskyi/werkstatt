/*
<MODULE_CONTRACT>
<purpose>Redirect shadow validation — cross-reference _redirects against dist/client/ and Worker routes (RFC-0905).</purpose>
<non-goals>
  <item>Do not validate _redirects syntax — that is owned by redirect.map.validate (REDIR-01..06).</item>
  <item>Do not generate or modify Worker routes or _redirects.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0905: initial implementation of redirect.shadow.validate with RSHAD-01..03 rules.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import {
  type AppPublicContext,
  appRel,
  loadPublicContext,
  readTextIfExists,
} from "./public-surface/shared.ts";
import { diagnosticsResult } from "./result-helpers.ts";
import { parseRedirectRules } from "@warpgogol/werkstatt-shared/share/redirects";
import {
  checkStaticFileShadow,
  normalizeUrlPath,
  resolveDeploymentAdapter,
  sitemapPaths,
} from "./public-surface/managed-public.ts";

interface ShadowMessage {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  fixHint?: string;
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

function routePatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function readWranglerRoutes(
  context: KernelRuntimeContext,
  appDirectory: string,
): Promise<string[] | null> {
  const jsoncPath = join(appDirectory, "wrangler.jsonc");
  const jsonPath = join(appDirectory, "wrangler.json");
  let raw: string | null = null;
  let isJsonc = false;
  if (await context.io.exists(jsoncPath)) {
    raw = await context.io.readFile(jsoncPath);
    isJsonc = true;
  } else if (await context.io.exists(jsonPath)) {
    raw = await context.io.readFile(jsonPath);
  } else {
    return null;
  }
  try {
    const cleaned = isJsonc ? stripJsoncComments(raw) : raw;
    const parsed = JSON.parse(cleaned) as { routes?: string[] };
    return Array.isArray(parsed.routes) ? parsed.routes : [];
  } catch {
    return [];
  }
}

export async function runRedirectShadowValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const redirectsPath = join(app.publicDirectory, "_redirects");
  const body = await readTextIfExists(context, redirectsPath);
  const messages: ShadowMessage[] = [];

  if (!body) {
    return diagnosticsResult("redirect.shadow.validate", [
      {
        ruleId: "RSHAD-00",
        severity: "info",
        message:
          "redirect.shadow.validate skipped — _redirects file not found (REDIR-01 in redirect.map.validate handles this).",
      },
    ]);
  }

  const rules = parseRedirectRules(body);
  const distClientDir = join(app.appDirectory, "dist", "client");
  const distClientExists = await context.io.exists(distClientDir);
  if (!distClientExists) {
    return diagnosticsResult("redirect.shadow.validate", [
      {
        ruleId: "RSHAD-00",
        severity: "info",
        message: "redirect.shadow.validate skipped — dist/client/ not found (not built yet).",
      },
    ]);
  }

  const adapter = await resolveDeploymentAdapter(context, app.appId);
  const checkWorkerRoutes = adapter === "cloudflare-workers" || adapter === "cloudflare-pages";
  let workerRoutes: string[] | null = null;
  if (checkWorkerRoutes) {
    workerRoutes = await readWranglerRoutes(context, app.appDirectory);
    if (workerRoutes === null) {
      messages.push({
        ruleId: "RSHAD-00",
        severity: "info",
        message:
          "redirect.shadow.validate: wrangler.jsonc/wrangler.json not found — skipping Worker route check (RSHAD-02). Static file check (RSHAD-01) still runs.",
      });
      workerRoutes = [];
    }
  }

  const livePaths = await sitemapPaths(context, app);
  const routeRegexes = (workerRoutes ?? []).map(routePatternToRegex);

  for (const rule of rules) {
    const fromPattern = rule.from.includes("*") || rule.from.includes(":");

    if (!fromPattern) {
      if (await checkStaticFileShadow(context, distClientDir, rule.from)) {
        messages.push({
          ruleId: "RSHAD-01",
          severity: "error",
          file: appRel(app.appDirectory, redirectsPath),
          message: `Static file shadows redirect source: ${rule.from} — redirect will never fire`,
          fixHint:
            "Remove the static file from dist/client/ or remove the redirect from _redirects",
        });
      }

      if (checkWorkerRoutes && routeRegexes.length > 0) {
        const normalizedFrom = normalizeUrlPath(rule.from);
        const noSlash = normalizedFrom === "/" ? "/" : normalizedFrom.replace(/\/$/, "");
        for (const regex of routeRegexes) {
          if (regex.test(normalizedFrom) || regex.test(noSlash)) {
            messages.push({
              ruleId: "RSHAD-02",
              severity: "error",
              file: appRel(app.appDirectory, redirectsPath),
              message: `Worker route matches redirect source: ${rule.from} — Worker may intercept before _redirects`,
              fixHint:
                "Add a Worker route exception for redirect sources or process _redirects in the Worker fetch handler",
            });
            break;
          }
        }
      }
    }

    if (rule.status === 410 || !rule.to || /^https?:\/\//i.test(rule.to)) continue;
    if (rule.to.includes(":") || rule.to.includes("*")) continue;

    const target = normalizeUrlPath(rule.to);
    if (!livePaths.has(target)) {
      if (await checkStaticFileShadow(context, distClientDir, rule.to)) {
        messages.push({
          ruleId: "RSHAD-03",
          severity: "warning",
          file: appRel(app.appDirectory, redirectsPath),
          message: `Redirect target is not in sitemap but a static file exists at target path: ${rule.to}`,
          fixHint:
            "Remove the stale static file from dist/client/ or point the redirect to a live canonical route",
        });
      }
    }
  }

  return diagnosticsResult(
    "redirect.shadow.validate",
    messages.map((m) => ({
      ruleId: m.ruleId,
      severity: m.severity,
      message: m.message,
      file: m.file,
      fixHint: m.fixHint,
    })),
  );
}
