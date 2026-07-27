import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Shared helpers for RFC-0074 audit validators: onboarding artifact parsing, file collection, and permissive Zod schema.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseOnboardingArtifactPayload } from "@gogol/share/onboarding-yaml";
import { collectFiles } from "@gogol/share/fs";
import { normalizeAuditPath } from "../helpers.ts";
export { normalizeAuditPath };
import type { AuditFinding } from "../types.ts";

/**
 * Permissive Zod schema used to pass the RFC-0082 helper's signature for audit
 * validators that perform their own ad-hoc shape checks on the returned payload.
 * The helper still strips RFC-0076 metadata keys from single-doc files and
 * selects the payload document on two-doc files.
 */
const anyPayloadSchema = z.unknown();

export function parseYaml(source: string): any {
  return parseOnboardingArtifactPayload(source, anyPayloadSchema);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function finding(params: Omit<AuditFinding, "id"> & { id?: string }): AuditFinding {
  return {
    id: params.id ?? `f-${Math.random().toString(16).slice(2, 8)}`,
    ...params,
  };
}

export const MATOMO_REGISTRY_PATH = join(
  "packages",
  "ontology",
  "analytics",
  "matomo-fleet.registry.yaml",
);

export async function loadMatomoFleetRegistry(
  workspaceRoot: string,
): Promise<Record<string, any>[]> {
  try {
    const raw = await readFile(join(workspaceRoot, MATOMO_REGISTRY_PATH), "utf8");
    const parsed = parseYaml(raw) as Record<string, any>;
    return Array.isArray(parsed?.sites) ? parsed.sites : [];
  } catch {
    return [];
  }
}

export function isProductionMatomo(growth: Record<string, any>): boolean {
  return growth.vendor?.adapter === "matomo";
}

export function escapeXml(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isHtmlRedirectPage(html: string): boolean {
  return (
    /<meta[^>]+http-equiv=["']refresh["']/i.test(html) ||
    /window\.location\.(replace|href)/i.test(html)
  );
}

export function extractCanonicalPath(html: string): string | null {
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!canonicalMatch?.[1]) {
    return null;
  }
  try {
    const url = new URL(canonicalMatch[1], "https://example.invalid");
    return normalizeAuditPath(url.pathname);
  } catch {
    return normalizeAuditPath(canonicalMatch[1]);
  }
}

export function getRoutePathForHtml(distDir: string, filePath: string, html: string): string {
  const canonical = extractCanonicalPath(html);
  if (canonical) {
    return canonical;
  }
  const relativePath = normalizeAuditPath(filePath.replace(distDir, ""));
  return relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
}

export function hasMeaningfulPrimaryCta(html: string): boolean {
  return /<a[^>]+class=["'][^"']*(btn|cta|site-header__cta)[^"']*["'][^>]*>/i.test(html);
}

export function hasVisibleMainHeading(html: string): boolean {
  return /<h1[\s>]/i.test(html) || /<main[^>]*aria-label=/i.test(html);
}

export async function collectRenderedHtml(
  distDir: string,
): Promise<Array<{ file: string; html: string }>> {
  const files = await collectFiles(distDir, { extensions: [".html"], ignore: () => false });
  return Promise.all(files.map(async (file) => ({ file, html: await readFile(file, "utf8") })));
}

/** RFC-0162: extract a single `<meta property|name=KEY content=...>` value from rendered HTML. */
export function extractMetaContent(
  html: string,
  key: string,
  attr: "property" | "name",
): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, "i");
  return html.match(re)?.[1] ?? null;
}

/** RFC-0162: normalize a URL or href to a comparable pathname (trailing slash stripped). */
export function toComparablePathname(value: string): string {
  try {
    return new URL(value, "https://example.invalid").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return value;
  }
}

/** RFC-0163: extract the JSON-LD @graph (or single node) from rendered HTML. */
export function extractJsonLdGraph(html: string): Array<Record<string, unknown>> {
  const m = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return [];
  try {
    const doc = yamlParse(m[1]) as Record<string, unknown>;
    const graph = doc["@graph"];
    return Array.isArray(graph) ? (graph as Array<Record<string, unknown>>) : [doc];
  } catch {
    return [];
  }
}

/** RFC-0227: extract ALL JSON-LD nodes from ALL <script> blocks on a page. */
export function extractAllJsonLdNodes(html: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const doc = yamlParse(match[1]) as Record<string, unknown>;
      const graph = doc["@graph"];
      if (Array.isArray(graph)) {
        nodes.push(...(graph as Array<Record<string, unknown>>));
      } else {
        nodes.push(doc);
      }
    } catch {
      // skip malformed blocks
    }
  }
  return nodes;
}

export function jsonLdNodeHasType(node: Record<string, unknown>, type: string): boolean {
  const t = node["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}
