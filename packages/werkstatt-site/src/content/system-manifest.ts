/* 
<MODULE_CONTRACT> 
<purpose>Facilitates loading and parsing of the canonical system.md manifest per RFC-0047.</purpose> 
 
 
<non-goals> 
  <item>Do not validate system manifest content (handled by validators).</item>
  <item>Do not handle system manifest generation or modification.</item>
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Initial implementation for RFC-0047 system.md loading with fallback to system.yaml.</item>
</CHANGE_SUMMARY> 
*/

import { readFile, access } from "node:fs/promises";
import { readFileSync, accessSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdownFrontmatter } from "./markdown-frontmatter.ts";

export interface SystemManifest {
  app: string;
  version: string;
  identity: {
    systemStar: string;
    biome: string;
    tagline: string;
    domain?: string;
    /** RFC-0087: Per-app default CTA pageId for shared header and final-cta. */
    ctaTarget?: string;
    /** RFC-0096: Operator details consumed by legal.scaffold to fill Impressum / Datenschutz stubs. */
    legal?: {
      responsibleName?: string;
      address?: string;
      email?: string;
    };
  };
  i18n?: {
    default: string;
    supported: Record<string, unknown>;
  };
  constellations: string[];
  clientEditable: string[];
  sharedContext?: {
    requiredPageIds: string[];
  };
  pages: Array<{
    pageId: string;
    routes?: Record<string, string>;
    route?: string;
    /** RFC-0097: explicit locale opt-in; the page exists only in these locales. */
    locales?: string[];
    cosmicStar: string;
    planets: Array<{
      cosmicPlanet: string;
      pin: string;
    }>;
  }>;
  growth: {
    vendor: {
      adapter: string;
      options: Record<string, unknown>;
    };
    funnels: unknown[];
    experiments: unknown[];
  };
  release: {
    passport: {
      enabled: boolean;
      indexable: boolean;
      keyVersion: string;
      heartbeatUrl: string;
    };
  };
  /**
   * RFC-0211 Content Knowledge Lifecycle policy. Mirrors the `knowledge` block in
   * the ontology systemManifestSchema; declared here so the CKL kernel commands
   * (content.freshness.validate RFC-0213, content.plan.build RFC-0216) read it
   * with real types instead of structural casts.
   */
  knowledge?: {
    freshness?: {
      soonWindowDays?: number;
      critical?: Array<{ match: string; criticality: "advisory" | "important" | "blocking" }>;
    };
    derivation?: {
      critical?: Array<{ match: string; criticality: "advisory" | "important" | "blocking" }>;
    };
    plan?: {
      leadTimeDays?: number;
      defaultOwner?: string;
      criticalityMap?: Array<{ match: string; criticality: "advisory" | "important" | "blocking" }>;
    };
  };
  /** RFC-0487: Business model declaration. Closed enum — currently only "b2b-only". */
  businessModel?: "b2b-only";
  /** RFC-0487/RFC-0509: Retired page routes — 410 Gone tombstones or 301 redirects. */
  retiredRoutes?: Array<{ slug: string; status: 410 } | { slug: string; status: 301; to: string }>;
}

export interface SystemManifestLoadResult {
  manifest: SystemManifest;
  source: "system.md";
  filePath: string;
}

/**
 * Loads and parses the canonical system.md manifest from src/content/system.md.
 *
 * @param contentDirectory The src/content directory path
 * @returns Parsed system manifest with source information
 */
export async function loadSystemManifest(
  contentDirectory: string,
): Promise<SystemManifestLoadResult> {
  const systemMdPath = join(contentDirectory, "system.md");
  await access(systemMdPath);
  const content = await readFile(systemMdPath, "utf8");
  const parsed = parseMarkdownFrontmatter(content);

  return {
    manifest: parsed.data as unknown as SystemManifest,
    source: "system.md",
    filePath: systemMdPath,
  };
}

/**
 * Synchronous version of loadSystemManifest for contexts where async is not available.
 *
 * @param contentDirectory The src/content directory path
 * @returns Parsed system manifest with source information
 */
export function loadSystemManifestSync(contentDirectory: string): SystemManifestLoadResult {
  const systemMdPath = join(contentDirectory, "system.md");
  accessSync(systemMdPath);
  const content = readFileSync(systemMdPath, "utf8");
  const parsed = parseMarkdownFrontmatter(content);

  return {
    manifest: parsed.data as unknown as SystemManifest,
    source: "system.md",
    filePath: systemMdPath,
  };
}

/**
 * Checks if the canonical system.md manifest exists.
 *
 * @param contentDirectory The src/content directory path
 * @returns true if src/content/system.md exists
 */
export async function isUsingSystemMd(contentDirectory: string): Promise<boolean> {
  const systemMdPath = join(contentDirectory, "system.md");
  try {
    await access(systemMdPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous version of isUsingSystemMd.
 *
 * @param contentDirectory The src/content directory path
 * @returns true if src/content/system.md exists
 */
export function isUsingSystemMdSync(contentDirectory: string): boolean {
  const systemMdPath = join(contentDirectory, "system.md");
  try {
    accessSync(systemMdPath);
    return true;
  } catch {
    return false;
  }
}
