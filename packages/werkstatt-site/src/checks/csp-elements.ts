/*
<MODULE_CONTRACT>
<purpose>
  RFC-0904: Post-build validator that scans rendered HTML in dist/client/ for
  object, embed, iframe, audio, video, and source elements, cross-references
  each against the corresponding CSP directive (object-src, frame-src,
  media-src) parsed from public/_headers, and emits errors when a directive
  blocks an element present in the built output. Rules: CSP-EL-01 (object-src),
  CSP-EL-02 (frame-src), CSP-EL-03 (media-src).
</purpose>
<non-goals>
  <item>Do not replace csp.origins.validate (RFC-0831) — complements it with element-level compatibility.</item>
  <item>Do not generate or modify CSP headers — validation only.</item>
  <item>Do not validate CSP nonce or hash-source correctness — only element-level compatibility.</item>
  <item>Do not check child-src (deprecated) or worker-src (not visible in rendered HTML).</item>
  <item>Do not scan bundled JS files in dist/client for worker-src origins — minified JS scanning is out of scope.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0904: initial implementation — csp.elements.validate with CSP-EL-01..03 rules, element-to-directive mapping, source parent-context resolution, default-src fallback.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "parse5";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectRenderedHtml } from "./audit/validators/helpers.ts";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { parseCsp, originMatchesSource, resolveSiteOrigin } from "./csp-origins.ts";
import { type TreeParentNode, isElementNode, hasChildNodes, getAttr } from "./dom-helpers.ts";

const COMMAND = "csp.elements.validate";

type CspElementRule = "CSP-EL-01" | "CSP-EL-02" | "CSP-EL-03";

const ELEMENT_DIRECTIVE_MAP: Record<string, CspElementRule> = {
  object: "CSP-EL-01",
  embed: "CSP-EL-01",
  applet: "CSP-EL-01",
  iframe: "CSP-EL-02",
  audio: "CSP-EL-03",
  video: "CSP-EL-03",
};

const RULE_DIRECTIVE: Record<CspElementRule, string> = {
  "CSP-EL-01": "object-src",
  "CSP-EL-02": "frame-src",
  "CSP-EL-03": "media-src",
};

function extractOriginFromUrl(url: string): string | null {
  if (url.startsWith("data:") || url.startsWith("blob:")) return null;
  if (url.startsWith("/")) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

interface ElementFinding {
  tagName: string;
  rule: CspElementRule;
  url: string | null;
  line: number;
}

function extractElementFindings(html: string): ElementFinding[] {
  const findings: ElementFinding[] = [];
  let document: TreeParentNode;
  try {
    document = parse(html) as TreeParentNode;
  } catch {
    return findings;
  }

  function walk(node: TreeParentNode, parentTag: string | null): void {
    const children = node.childNodes;
    if (!children) return;

    for (const child of children) {
      if (!isElementNode(child)) continue;

      const line = child.sourceCodeLocation?.startLine ?? 0;
      const tag = child.tagName;

      if (ELEMENT_DIRECTIVE_MAP[tag]) {
        const rule = ELEMENT_DIRECTIVE_MAP[tag];
        const url = getAttr(child, "data") ?? getAttr(child, "src") ?? null;
        findings.push({ tagName: tag, rule, url, line });
      } else if (tag === "source") {
        if (parentTag === "video" || parentTag === "audio") {
          const url = getAttr(child, "src") ?? null;
          findings.push({ tagName: "source", rule: "CSP-EL-03", url, line });
        }
        // <source> inside <picture> maps to img-src (RFC-0904). No CSP-EL rule
        // for img-src — skip it. csp.origins.validate handles img-src for
        // external origins. The test verifies no CSP-EL-03 is emitted.
      }

      if (hasChildNodes(child) && isElementNode(child)) {
        walk(child as TreeParentNode, tag);
      }
    }
  }

  walk(document, null);
  return findings;
}

function checkElementAgainstCsp(
  finding: ElementFinding,
  csp: Map<string, string[]>,
  siteOrigin: string | undefined,
): { directive: string; message: string; fixHint: string } | null {
  const directive = RULE_DIRECTIVE[finding.rule];
  let sources = csp.get(directive);
  let resolvedDirective = directive;

  if (!sources) {
    sources = csp.get("default-src");
    resolvedDirective = "default-src";
  }

  if (!sources) {
    return null;
  }

  if (sources.length === 0 || (sources.length === 1 && sources[0] === "'none'")) {
    if (!finding.url) return null;
    return {
      directive: resolvedDirective,
      message: `CSP ${resolvedDirective} 'none' blocks <${finding.tagName}> element${finding.url ? ` with ${finding.tagName === "object" ? "data" : "src"}="${finding.url}"` : ""}`,
      fixHint: `Change ${resolvedDirective} to 'self' in public/_headers to allow ${finding.tagName} embedding`,
    };
  }

  if (!finding.url) {
    return null;
  }

  const origin = extractOriginFromUrl(finding.url);
  if (!origin) {
    if (
      finding.url.startsWith("/") ||
      finding.url.startsWith("data:") ||
      finding.url.startsWith("blob:")
    ) {
      const covered = originMatchesSource(siteOrigin ?? "", sources, siteOrigin);
      if (!covered) {
        return {
          directive: resolvedDirective,
          message: `CSP ${resolvedDirective} does not allow same-origin resource "${finding.url}" for <${finding.tagName}>`,
          fixHint: `Add 'self' to ${resolvedDirective} in public/_headers`,
        };
      }
    }
    return null;
  }

  const covered = originMatchesSource(origin, sources, siteOrigin);
  if (!covered) {
    return {
      directive: resolvedDirective,
      message: `CSP ${resolvedDirective} does not allow origin '${origin}' for <${finding.tagName}> element with src="${finding.url}"`,
      fixHint: `Add '${origin.replace(/^https?:\/\//, "")}' to ${resolvedDirective} in public/_headers`,
    };
  }

  return null;
}

export async function runCspElementsValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(ctx);
  const headersPath = join(paths.publicDirectory, "_headers");
  const distDir = join(paths.appDirectory, "dist", "client");

  if (!existsSync(headersPath)) {
    return passResult(
      COMMAND,
      `${COMMAND}: no public/_headers — skipped (headers.security.validate handles HDR-01)`,
    );
  }

  if (!existsSync(distDir)) {
    return passResult(COMMAND, `${COMMAND}: no dist/client/ — skipped`);
  }

  const headersContent = await readFile(headersPath, "utf8");
  const cspMatch = headersContent.match(/Content-Security-Policy:\s*(.+)$/im);
  if (!cspMatch) {
    return passResult(
      COMMAND,
      `${COMMAND}: no CSP header in _headers — skipped (headers.security.validate handles HDR-01)`,
    );
  }

  const csp = parseCsp(cspMatch[1]);
  const siteOrigin = await resolveSiteOrigin(paths);

  const htmlFiles = await collectRenderedHtml(distDir);
  if (htmlFiles.length === 0) {
    return passResult(COMMAND, `${COMMAND}: no HTML files in dist/client/ — skipped`);
  }

  const diagnostics: Diagnostic[] = [];
  let checkedElements = 0;

  for (const { file, html } of htmlFiles) {
    const elementFindings = extractElementFindings(html);

    for (const ef of elementFindings) {
      checkedElements++;
      const violation = checkElementAgainstCsp(ef, csp, siteOrigin);
      if (violation) {
        diagnostics.push({
          ruleId: ef.rule,
          severity: "error",
          file,
          line: ef.line,
          message: violation.message,
          fixHint: violation.fixHint,
        });
      }
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      COMMAND,
      `${COMMAND}: OK — ${checkedElements} element(s) checked, 0 violation(s)`,
    );
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
