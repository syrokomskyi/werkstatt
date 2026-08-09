/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] The Content Source Provider (CSP) port. Defines the abstract contracts
  for "where content comes from" and "where assets come from" so the filesystem is one
  replaceable adapter rather than a hardcoded assumption. A future CMS adapter implements
  the same interface with no change to sections, components, buildPage, or the route pipeline.
</purpose>
<non-goals>
  <item>Do not implement any adapter here — see ./adapters/**.</item>
  <item>Do not import astro:content — keep this module source-agnostic and pure.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: introduced the Content Source Provider port and asset-reference contracts.</item>
</CHANGE_SUMMARY>
*/

import type { ImageMetadata } from "astro";

/** RFC-0047 semantic content domains served by a provider. `system.md` is engineering-owned and excluded. */
export type ContentDomain = "system" | "pages" | "prose" | "business" | "navigation" | "site";

/** A reference to a single content entry. The fs adapter keeps the current "{lang}/{slug}" id scheme. */
export interface ContentEntryRef {
  domain: ContentDomain;
  /** Stable id, e.g. "de/home". */
  id: string;
}

/** Publication state of a content entry (RFC-0171). */
export type ContentStatus = "draft" | "published";

/** A resolved content entry. `data` is the parsed frontmatter object (provider-agnostic). */
export interface ContentEntry {
  id: string;
  domain: ContentDomain;
  data: Record<string, unknown>;
  /**
   * RFC-0146: raw body text for body-bearing domains (e.g. prose). The fs
   * adapter populates it from the markdown body after frontmatter; a CMS adapter
   * maps its rich-text bridge. Undefined for frontmatter-only domains.
   */
  body?: string;
  /**
   * RFC-0171: publication state. The fs adapter resolves every entry as
   * "published" (undefined is treated as published). A CMS adapter sets "draft"
   * for unpublished entries; production builds MUST resolve only "published"
   * (fail-closed), while preview mode (liveFetch) may resolve drafts.
   */
  status?: ContentStatus;
}

/**
 * An opaque, source-defined asset token. Consumers MUST NOT parse it to infer locality;
 * the provider decides whether it resolves to a local file or a remote URL.
 * For the fs adapter the token is a bare filename ("hero-bg") per RFC-0042 / RFC-0053.
 */
export interface AssetRef {
  token: string;
  /** Active language for localized lookup (fs adapter falls back to the default language). */
  lang?: string;
  /** Optional sub-path under the owning content domain (e.g. "projects/assets"). */
  subPath?: string;
}

/** A resolved asset — either a build-time local image or a remote URL (CMS/CDN). */
export type ResolvedAsset =
  | { kind: "local"; image: ImageMetadata }
  | { kind: "remote"; url: string; width?: number; height?: number; format?: string };

/** Capability flags let consumers branch on what a provider supports without knowing its id. */
export interface ContentSourceCapabilities {
  /** Resolves assets to local, build-time-optimized images (fs: true). */
  localAssets: boolean;
  /** Resolves assets to remote URLs (CMS/CDN: true). */
  remoteAssets: boolean;
  /** Fetches content per-request at runtime (CMS/SSR: true; fs: false — build-time only). */
  liveFetch: boolean;
  /** Provides a rich-text → markdown/HTML bridge (CMS: true; fs: false — already markdown). */
  richText: boolean;
}

/**
 * The Content Source Provider port. Every source implements this single interface.
 * Phase 0 ships only the filesystem adapter; later phases add CMS adapters.
 */
export interface ContentSourceProvider {
  readonly id: string;
  readonly capabilities: ContentSourceCapabilities;
  listEntries(domain: ContentDomain, lang?: string): Promise<ContentEntry[]>;
  getEntry(ref: ContentEntryRef): Promise<ContentEntry | null>;
  resolveAsset(ref: AssetRef): Promise<ResolvedAsset | null>;
}
