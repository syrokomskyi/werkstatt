/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/security.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted AI policy, security.txt, and headers commands from public-surface.ts into public-surface/security.ts.</item>
  <item>RFC-0315: hardened headers.security.validate with HDR-01..04 rules (CSP wildcard, required directives, Markdown content-type, .well-known/agent freshness, hashed assets) and headers.runtime.probe with HDR-01..06 runtime checks.</item>
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
import { runAiGenerate } from "../ai.ts";
import {
  asString,
  buildSecurityTxt,
  diagnostics,
  hasOpenCommercial,
  hasOpenUsage,
  loadPublicContext,
  normalizeUrl,
  readTextIfExists,
  TODAY,
  wildcardRobotsGroupDisallowsAll,
  workspaceRel,
  writeGeneratedTextFile,
} from "./shared.ts";
import { diagnosticsResult, passResult } from "../result-helpers.ts";

export async function runAiPolicyGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return runAiGenerate(input, context);
}

export async function runAiPolicyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const aiPath = join(app.publicDirectory, "ai.txt");
  const robotsPath = join(app.publicDirectory, "robots.txt");
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  const ai = await readTextIfExists(context, aiPath);
  const robots = await readTextIfExists(context, robotsPath);
  const aiRel = workspaceRel(context, aiPath);

  if (!ai) {
    messages.push({
      severity: "error",
      file: aiRel,
      message: "Missing ai.txt for the studio-wide open AI crawler policy.",
      fixHint: "Run ai.generate or ai.policy.generate.",
    });
  } else {
    for (const expected of ["policy: allow", "training: allow"]) {
      if (!ai.includes(expected)) {
        messages.push({
          severity: "error",
          file: aiRel,
          message: `ai.txt must declare "${expected}" for the accepted studio default.`,
          fixHint: "Regenerate ai.txt or declare an explicit compatible ai: block in system.md.",
        });
      }
    }
    if (!hasOpenUsage(ai)) {
      messages.push({
        severity: "error",
        file: aiRel,
        message:
          "ai.txt must declare open AI usage (allow/yes or indexing/snippet/summarization/translation usage).",
        fixHint: "Regenerate ai.txt or declare an explicit compatible ai: block in system.md.",
      });
    }
    if (!hasOpenCommercial(ai)) {
      messages.push({
        severity: "error",
        file: aiRel,
        message:
          "ai.txt must declare commercial AI usage as allow or yes for the accepted studio default.",
        fixHint: "Regenerate ai.txt or declare an explicit compatible ai: block in system.md.",
      });
    }
  }

  if (robots && wildcardRobotsGroupDisallowsAll(robots)) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, robotsPath),
      message: "robots.txt disallows all crawlers while ai.txt declares open AI policy.",
      fixHint: "Align robots.txt with the accepted open-for-training policy.",
    });
  }

  return diagnostics("ai.policy.validate", messages);
}

export async function runSecurityTxtGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const securityPath = join(app.publicDirectory, ".well-known", "security.txt");
  const status = await writeGeneratedTextFile(context, securityPath, buildSecurityTxt(app));
  return {
    data: { status, file: securityPath },
    exitCode: 0,
    summary: `security.txt.generate: ${status}`,
  };
}

export async function runSecurityTxtValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const securityPath = join(app.publicDirectory, ".well-known", "security.txt");
  const body = await readTextIfExists(context, securityPath);
  const rel = workspaceRel(context, securityPath);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  if (!body) {
    messages.push({
      severity: "error",
      file: rel,
      message: "Missing .well-known/security.txt.",
      fixHint: "Run security.txt.generate.",
    });
    return diagnostics("security.txt.validate", messages);
  }

  for (const field of ["Contact:", "Expires:", "Preferred-Languages:"]) {
    if (!body.includes(field)) {
      messages.push({
        severity: "error",
        file: rel,
        message: `security.txt is missing ${field}`,
        fixHint: "Regenerate security.txt.",
      });
    }
  }

  if (app.siteUrl) {
    const canonical = body.match(/^Canonical:\s*(.+)$/im)?.[1]?.trim();
    const expectedCanonical = `${app.siteUrl}/.well-known/security.txt`;
    if (canonical !== expectedCanonical) {
      messages.push({
        severity: "error",
        file: rel,
        message: `security.txt Canonical must be ${expectedCanonical}.`,
        fixHint: "Regenerate security.txt after correcting identity.domain.",
      });
    }
  }

  const expires = body.match(/^Expires:\s*(.+)$/im)?.[1]?.trim();
  if (expires) {
    const date = new Date(expires);
    const now = new Date(`${TODAY}T00:00:00.000Z`);
    const days = (date.getTime() - now.getTime()) / 86_400_000;
    if (!Number.isFinite(date.getTime()) || days < 30 || days > 370) {
      messages.push({
        severity: "error",
        file: rel,
        message: "security.txt Expires must be a valid date 30-370 days after today.",
        fixHint: "Regenerate security.txt or update the generator expiry constant.",
      });
    }
  }

  return diagnostics("security.txt.validate", messages);
}

export async function runHeadersSecurityGenerate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return passResult(
    "headers.security.generate",
    "headers.security.generate: baseline headers are emitted by public.infrastructure.generate",
  );
}

function extractHeadersSection(body: string, pattern: string): string | undefined {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}\\s*\\n((?:\\s+[^\\n]*\\n?)*)`, "m");
  const match = body.match(regex);
  return match?.[1];
}

export async function runHeadersSecurityValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const headersPath = join(app.publicDirectory, "_headers");
  const body = await readTextIfExists(context, headersPath);
  const rel = workspaceRel(context, headersPath);
  const msgs: Diagnostic[] = [];

  if (!body) {
    msgs.push({
      ruleId: "HDR-01",
      severity: "error",
      file: rel,
      message: "Missing public/_headers.",
      fixHint: "Run public.infrastructure.generate.",
    });
    return diagnosticsResult("headers.security.validate", msgs);
  }

  // HDR-01: required baseline headers
  const requiredHeaders = [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Content-Security-Policy",
  ];
  for (const header of requiredHeaders) {
    const pattern = new RegExp(`^\\s*${header}:`, "im");
    if (!pattern.test(body)) {
      msgs.push({
        ruleId: "HDR-01",
        severity: "error",
        file: rel,
        message: `_headers must actively set ${header}.`,
        fixHint: "Regenerate public/_headers from the public infrastructure template.",
      });
    }
  }

  // HDR-02: CSP wildcard + required directives
  const cspMatch = body.match(/Content-Security-Policy:\s*(.+)$/im);
  if (cspMatch) {
    const csp = cspMatch[1];
    const wildcardPattern = /\s\*\s|;\s*\*\s|:\s*\*(?:;|\s|$)/;
    if (wildcardPattern.test(csp)) {
      msgs.push({
        ruleId: "HDR-02",
        severity: "error",
        file: rel,
        message: "CSP contains a wildcard source `*` — use explicit origins.",
        fixHint: "Replace wildcard sources with explicit domains in the CSP baseline.",
      });
    }
    const requiredDirectives = [
      "default-src",
      "base-uri",
      "object-src",
      "frame-ancestors",
      "img-src",
      "font-src",
      "style-src",
      "script-src",
      "connect-src",
      "form-action",
      "upgrade-insecure-requests",
    ];
    for (const directive of requiredDirectives) {
      if (!csp.includes(directive)) {
        msgs.push({
          ruleId: "HDR-02",
          severity: "error",
          file: rel,
          message: `CSP is missing required directive: ${directive}.`,
          fixHint: "Add the missing directive to the CSP baseline in the _headers template.",
        });
      }
    }
  }

  // HDR-03: Markdown twin content type
  const mdSection = extractHeadersSection(body, "/*.md");
  if (!mdSection || !/Content-Type:\s*text\/markdown;\s*charset=utf-8/i.test(mdSection)) {
    msgs.push({
      ruleId: "HDR-03",
      severity: "error",
      file: rel,
      message: "Markdown twin pattern /*.md must set Content-Type: text/markdown; charset=utf-8.",
      fixHint: "Add the /*.md section with text/markdown content type to _headers.",
    });
  }

  // HDR-04: .well-known and /api/agent/v1/* freshness
  const wellKnownSection = extractHeadersSection(body, "/.well-known/*");
  if (!wellKnownSection || !/Cache-Control:\s*public,\s*max-age=300/i.test(wellKnownSection)) {
    msgs.push({
      ruleId: "HDR-04",
      severity: "error",
      file: rel,
      message: ".well-known/* must have short freshness (Cache-Control: public, max-age=300).",
      fixHint: "Add the /.well-known/* section with short cache to _headers.",
    });
  }
  const agentSection = extractHeadersSection(body, "/api/agent/v1/*");
  if (!agentSection || !/Cache-Control:\s*public,\s*max-age=300/i.test(agentSection)) {
    msgs.push({
      ruleId: "HDR-04",
      severity: "error",
      file: rel,
      message: "/api/agent/v1/* must have short freshness (Cache-Control: public, max-age=300).",
      fixHint: "Add the /api/agent/v1/* section with short cache to _headers.",
    });
  }

  // Hashed assets must have long immutable caching
  const astroSection = extractHeadersSection(body, "/_astro/*");
  if (
    !astroSection ||
    !/Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i.test(astroSection)
  ) {
    msgs.push({
      ruleId: "HDR-04",
      severity: "error",
      file: rel,
      message:
        "Hashed assets (/_astro/*) must have Cache-Control: public, max-age=31536000, immutable.",
      fixHint: "Add the /_astro/* section with immutable caching to _headers.",
    });
  }

  return diagnosticsResult("headers.security.validate", msgs);
}

export async function runHeadersRuntimeProbe(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const baseUrl = asString(input.flags["base-url"]) ?? app.siteUrl;
  if (!baseUrl) {
    return passResult("headers.runtime.probe", "headers.runtime.probe: skipped (no --base-url)");
  }
  const base = normalizeUrl(baseUrl);
  const msgs: Diagnostic[] = [];

  // Probe root URL
  const rootResponse = await fetch(base, { method: "GET" });
  const requiredHeaders = [
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "content-security-policy",
  ];
  for (const header of requiredHeaders) {
    if (!rootResponse.headers.has(header)) {
      msgs.push({
        ruleId: "HDR-01",
        severity: "error",
        message: `Runtime response is missing ${header}.`,
        fixHint: "Confirm the deploy adapter applies public/_headers to the deployed site.",
      });
    }
  }

  // HDR-05: HSTS on production HTTPS
  if (base.startsWith("https://")) {
    const hsts = rootResponse.headers.get("strict-transport-security");
    if (!hsts) {
      msgs.push({
        ruleId: "HDR-05",
        severity: "error",
        message: "HSTS missing on production HTTPS origin.",
        fixHint: "Ensure Strict-Transport-Security is applied to all HTTPS responses.",
      });
    }
  }

  // HDR-02: CSP wildcard check at runtime
  const csp = rootResponse.headers.get("content-security-policy");
  if (csp) {
    const wildcardPattern = /\s\*\s|;\s*\*\s|:\s*\*(?:;|\s|$)/;
    if (wildcardPattern.test(csp)) {
      msgs.push({
        ruleId: "HDR-02",
        severity: "error",
        message: "Runtime CSP contains a wildcard source `*`.",
        fixHint: "Replace wildcard sources with explicit domains in the CSP baseline.",
      });
    }
  }

  // HDR-03: Markdown twin content type at runtime
  try {
    const mdResponse = await fetch(`${base}/index.md`, { method: "GET" });
    const ct = mdResponse.headers.get("content-type");
    if (ct && !ct.includes("text/markdown")) {
      msgs.push({
        ruleId: "HDR-03",
        severity: "error",
        message: `Markdown twin /index.md served with Content-Type "${ct}" instead of text/markdown.`,
        fixHint: "Ensure the /*.md _headers rule is applied by the deploy adapter.",
      });
    }
  } catch {
    // Markdown twin may not exist — skip
  }

  // HDR-04: .well-known freshness at runtime
  try {
    const wkResponse = await fetch(`${base}/.well-known/security.txt`, { method: "GET" });
    const cc = wkResponse.headers.get("cache-control");
    if (cc && !cc.includes("max-age=300")) {
      msgs.push({
        ruleId: "HDR-04",
        severity: "warning",
        message: `.well-known/security.txt Cache-Control is "${cc}" — expected max-age=300.`,
        fixHint: "Ensure the /.well-known/* _headers rule is applied by the deploy adapter.",
      });
    }
  } catch {
    // .well-known may not exist — skip
  }

  // HDR-06: runtime differs from generated policy
  const headersPath = join(app.publicDirectory, "_headers");
  const generated = await readTextIfExists(context, headersPath);
  if (generated) {
    const genCsp = generated.match(/Content-Security-Policy:\s*(.+)$/im)?.[1]?.trim();
    if (genCsp && csp && genCsp !== csp) {
      msgs.push({
        ruleId: "HDR-06",
        severity: "warning",
        message: "Runtime CSP differs from generated _headers CSP.",
        fixHint: "Confirm the deploy adapter applies the latest public/_headers.",
      });
    }
  }

  return diagnosticsResult("headers.runtime.probe", msgs);
}
