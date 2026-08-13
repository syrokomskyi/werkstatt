/*
<MODULE_CONTRACT>
<purpose>
  RFC-0831: Post-build validator that cross-references CSP source lists
  (parsed from public/_headers) against actual external origins found in
  rendered HTML in dist/client/. Rules: CSP-ORIGIN-01 (script-src),
  CSP-ORIGIN-02 (style-src), CSP-ORIGIN-03 (img-src), CSP-ORIGIN-04 (connect-src).
</purpose>
<non-goals>
  <item>Do not replace headers.security.validate (HDR-01..04) — complements it with origin cross-referencing.</item>
  <item>Do not generate or modify CSP headers — validation only.</item>
  <item>Do not validate CSP nonce or hash-source correctness — only origin coverage.</item>
  <item>Do not check inline script CSP (unsafe-inline is a separate concern).</item>
  <item>Do not scan bundled JS files in dist/client/_astro/*.js for connect-src origins — minified JS scanning is fragile and out of scope.</item>
  <item>Do not check iframe src against frame-src — Astro sites don't use iframes for first-party content.</item>
  <item>Do not check link rel=preconnect or link rel=dns-prefetch — these are hints, not resource loads.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0831: initial implementation — csp.origins.validate with CSP-ORIGIN-01..04 rules, CSP parser, origin extraction from rendered HTML.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { collectRenderedHtml } from "./audit/validators/helpers.ts";

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeParentNode = DefaultTreeAdapterMap["parentNode"];

interface ElementNode {
  nodeName: string;
  tagName: string;
  attrs: Array<{ name: string; value: string }>;
  childNodes: TreeNode[];
  sourceCodeLocation?: { startLine?: number };
}

const COMMAND = "csp.origins.validate";

type CspOriginRule = "CSP-ORIGIN-01" | "CSP-ORIGIN-02" | "CSP-ORIGIN-03" | "CSP-ORIGIN-04";

interface CspOriginFinding {
  rule: CspOriginRule;
  file: string;
  line: number;
  origin: string;
  directive: string;
  severity: "error" | "warning";
  message: string;
  fixHint: string;
}

interface CspOriginResult {
  command: typeof COMMAND;
  status: "pass" | "fail";
  findings: CspOriginFinding[];
  cspDirectives: Record<string, string[]>;
  checkedOrigins: number;
}

type OriginKind = "script" | "style" | "image" | "connect";

interface ExtractedOrigin {
  origin: string;
  kind: OriginKind;
  file: string;
  line: number;
}

function isElementNode(node: unknown): node is ElementNode {
  return node !== null && typeof node === "object" && "tagName" in node;
}

function hasChildNodes(node: TreeNode): node is TreeParentNode {
  return node !== null && typeof node === "object" && "childNodes" in node;
}

function getAttr(el: ElementNode, name: string): string | undefined {
  return el.attrs?.find((a: { name: string; value: string }) => a.name === name)?.value;
}

// ─── CSP parsing ───────────────────────────────────────────────────────────

export function parseCsp(cspHeader: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of cspHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      directives.set(trimmed, []);
      continue;
    }
    const name = trimmed.slice(0, spaceIdx).trim();
    const sources = trimmed
      .slice(spaceIdx + 1)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    directives.set(name, sources);
  }
  return directives;
}

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

export function originMatchesSource(
  origin: string,
  sources: string[] | undefined,
  siteOrigin: string | undefined,
): boolean {
  if (!sources || sources.length === 0) return false;

  for (const source of sources) {
    if (source === "'none'") continue;
    if (source === "'self'" && siteOrigin) {
      if (origin === siteOrigin) return true;
      continue;
    }
    if (source.startsWith("'") && source.endsWith("'")) continue;

    if (source.startsWith("*.")) {
      const baseDomain = source.slice(2);
      try {
        const parsedOrigin = new URL(origin);
        const host = parsedOrigin.hostname;
        if (host === baseDomain || host.endsWith(`.${baseDomain}`)) return true;
      } catch {
        continue;
      }
      continue;
    }

    if (source === "*") return true;

    try {
      const parsedSource = new URL(source);
      const sourceOrigin = `${parsedSource.protocol}//${parsedSource.host}`;
      if (origin === sourceOrigin) return true;
    } catch {
      continue;
    }
  }

  return false;
}

function isOriginCoveredByCsp(
  origin: string,
  kind: OriginKind,
  csp: Map<string, string[]>,
  siteOrigin: string | undefined,
): boolean {
  const directiveMap: Record<OriginKind, string> = {
    script: "script-src",
    style: "style-src",
    image: "img-src",
    connect: "connect-src",
  };
  const primaryDirective = directiveMap[kind];
  const fallbackDirective = "default-src";

  if (originMatchesSource(origin, csp.get(primaryDirective), siteOrigin)) return true;
  if (originMatchesSource(origin, csp.get(fallbackDirective), siteOrigin)) return true;
  return false;
}

// ─── Origin extraction from HTML ────────────────────────────────────────────

function extractSrcsetOrigins(srcset: string): string[] {
  const origins: string[] = [];
  for (const candidate of srcset.split(",")) {
    const url = candidate.trim().split(/\s+/)[0];
    if (url) {
      const origin = extractOriginFromUrl(url);
      if (origin) origins.push(origin);
    }
  }
  return origins;
}

function extractConnectOriginsFromScript(text: string): string[] {
  const origins: string[] = [];
  const fetchPattern = /fetch\s*\(\s*["']([^"']+)["']/g;
  const urlPattern = /new\s+URL\s*\(\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = fetchPattern.exec(text)) !== null) {
    const origin = extractOriginFromUrl(match[1]);
    if (origin) origins.push(origin);
  }
  while ((match = urlPattern.exec(text)) !== null) {
    const origin = extractOriginFromUrl(match[1]);
    if (origin) origins.push(origin);
  }
  return origins;
}

function getTextContent(node: TreeParentNode): string {
  if (!node.childNodes) return "";
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeName === "#text") {
      text += (child as { value?: string }).value ?? "";
    } else if (hasChildNodes(child)) {
      text += getTextContent(child);
    }
  }
  return text;
}

export function extractOriginsFromHtml(html: string, filePath: string): ExtractedOrigin[] {
  const origins: ExtractedOrigin[] = [];
  let document: TreeParentNode;
  try {
    document = parse(html) as TreeParentNode;
  } catch {
    return origins;
  }

  function walk(node: TreeParentNode): void {
    const children = node.childNodes;
    if (!children) return;

    for (const child of children) {
      if (!isElementNode(child)) continue;

      const line = child.sourceCodeLocation?.startLine ?? 0;

      if (child.tagName === "script") {
        const src = getAttr(child, "src");
        if (src) {
          const origin = extractOriginFromUrl(src);
          if (origin) {
            origins.push({ origin, kind: "script", file: filePath, line });
          }
        } else {
          const scriptText = getTextContent(child as TreeParentNode);
          for (const origin of extractConnectOriginsFromScript(scriptText)) {
            origins.push({ origin, kind: "connect", file: filePath, line });
          }
        }
      } else if (child.tagName === "link") {
        const rel = getAttr(child, "rel") ?? "";
        const href = getAttr(child, "href");
        if (href) {
          const origin = extractOriginFromUrl(href);
          if (origin) {
            if (rel === "stylesheet") {
              origins.push({ origin, kind: "style", file: filePath, line });
            } else if (rel === "preload") {
              const as = getAttr(child, "as") ?? "";
              if (as === "script" || as === "style") {
                origins.push({
                  origin,
                  kind: as === "script" ? "script" : "style",
                  file: filePath,
                  line,
                });
              }
            }
          }
        }
      } else if (child.tagName === "img") {
        const src = getAttr(child, "src");
        if (src) {
          const origin = extractOriginFromUrl(src);
          if (origin) {
            origins.push({ origin, kind: "image", file: filePath, line });
          }
        }
        const srcset = getAttr(child, "srcset");
        if (srcset) {
          for (const origin of extractSrcsetOrigins(srcset)) {
            origins.push({ origin, kind: "image", file: filePath, line });
          }
        }
      } else if (child.tagName === "source") {
        const srcset = getAttr(child, "srcset");
        if (srcset) {
          for (const origin of extractSrcsetOrigins(srcset)) {
            origins.push({ origin, kind: "image", file: filePath, line });
          }
        }
      }

      if (hasChildNodes(child) && isElementNode(child)) {
        walk(child as TreeParentNode);
      }
    }
  }

  walk(document);
  return origins;
}

// ─── Command handler ────────────────────────────────────────────────────────

async function resolveSiteOrigin(
  paths: ReturnType<typeof requireAstroSitePaths>,
): Promise<string | undefined> {
  try {
    const { manifest } = await loadSystemManifest(paths.contentDirectory);
    const manifestRecord = manifest as unknown as Record<string, unknown> & {
      identity?: { domain?: string; url?: string };
    };
    const identity = manifestRecord.identity;
    const domain =
      identity?.domain ?? identity?.url?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return domain ? `https://${domain}` : undefined;
  } catch {
    return undefined;
  }
}

export async function runCspOriginsValidate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(ctx);
  const headersPath = join(paths.publicDirectory, "_headers");
  const distDir = join(paths.appDirectory, "dist", "client");

  if (!existsSync(headersPath)) {
    return {
      data: {
        command: COMMAND,
        status: "pass",
        findings: [],
        cspDirectives: {},
        checkedOrigins: 0,
      } satisfies CspOriginResult,
      exitCode: 0,
      summary: `${COMMAND}: no public/_headers — skipped (headers.security.validate handles HDR-01)`,
    };
  }

  if (!existsSync(distDir)) {
    return {
      data: {
        command: COMMAND,
        status: "pass",
        findings: [],
        cspDirectives: {},
        checkedOrigins: 0,
      } satisfies CspOriginResult,
      exitCode: 0,
      summary: `${COMMAND}: no dist/client/ — skipped`,
    };
  }

  const headersContent = await readFile(headersPath, "utf8");
  const cspMatch = headersContent.match(/Content-Security-Policy:\s*(.+)$/im);
  if (!cspMatch) {
    return {
      data: {
        command: COMMAND,
        status: "pass",
        findings: [],
        cspDirectives: {},
        checkedOrigins: 0,
      } satisfies CspOriginResult,
      exitCode: 0,
      summary: `${COMMAND}: no CSP header in _headers — skipped (headers.security.validate handles HDR-01)`,
    };
  }

  const csp = parseCsp(cspMatch[1]);
  const siteOrigin = await resolveSiteOrigin(paths);

  const cspDirectivesObj: Record<string, string[]> = {};
  for (const [key, value] of csp) {
    cspDirectivesObj[key] = value;
  }

  const htmlFiles = await collectRenderedHtml(distDir);
  if (htmlFiles.length === 0) {
    return {
      data: {
        command: COMMAND,
        status: "pass",
        findings: [],
        cspDirectives: cspDirectivesObj,
        checkedOrigins: 0,
      } satisfies CspOriginResult,
      exitCode: 0,
      summary: `${COMMAND}: no HTML files in dist/client/ — skipped`,
    };
  }

  const ruleConfig: Record<
    OriginKind,
    { rule: CspOriginRule; directive: string; severity: "error" | "warning" }
  > = {
    script: { rule: "CSP-ORIGIN-01", directive: "script-src", severity: "error" },
    style: { rule: "CSP-ORIGIN-02", directive: "style-src", severity: "error" },
    image: { rule: "CSP-ORIGIN-03", directive: "img-src", severity: "warning" },
    connect: { rule: "CSP-ORIGIN-04", directive: "connect-src", severity: "error" },
  };

  const findings: CspOriginFinding[] = [];
  const seenGaps = new Set<string>();
  let checkedOrigins = 0;

  for (const { file, html } of htmlFiles) {
    const extracted = extractOriginsFromHtml(html, file);

    for (const { origin, kind, file: originFile, line } of extracted) {
      checkedOrigins++;
      const covered = isOriginCoveredByCsp(origin, kind, csp, siteOrigin);
      if (!covered) {
        const gapKey = `${origin}|${kind}`;
        if (seenGaps.has(gapKey)) continue;
        seenGaps.add(gapKey);

        const cfg = ruleConfig[kind];
        findings.push({
          rule: cfg.rule,
          file: originFile,
          line,
          origin,
          directive: cfg.directive,
          severity: cfg.severity,
          message: `${kind.charAt(0).toUpperCase() + kind.slice(1)} origin '${origin}' is not in CSP ${cfg.directive}`,
          fixHint: `Add '${origin.replace(/^https?:\/\//, "")}' to ${cfg.directive} in public/_headers`,
        });
      }
    }
  }

  const hasErrors = findings.some((f) => f.severity === "error");
  const result: CspOriginResult = {
    command: COMMAND,
    status: hasErrors ? "fail" : "pass",
    findings,
    cspDirectives: cspDirectivesObj,
    checkedOrigins,
  };

  return {
    data: result,
    exitCode: hasErrors ? 1 : 0,
    summary: `${COMMAND}: ${findings.length} finding(s), ${checkedOrigins} origin(s) checked`,
  };
}
