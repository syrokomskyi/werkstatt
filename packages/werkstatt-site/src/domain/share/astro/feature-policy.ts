/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/astro/feature-policy.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not import from apps/*.</item>
  <item>Do not modify content files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0183: Astro wrapper around framework-neutral Feature Policy resolver.</item>
</CHANGE_SUMMARY>
*/

import { getCollection } from "@warpgogol/werkstatt-site/content-source/astro";
import type {
  FeaturePolicyContentContext,
  FeaturePolicyTargetRef,
  FeaturePolicyResolverOptions,
} from "../feature-policy.ts";
import { createFeaturePolicyResolver } from "../feature-policy.ts";

/**
 * Load Feature Policy content context from RFC-0047 content domains.
 * Reads system.md and site defaults via Content Source Provider.
 */
export async function loadFeaturePolicyContext(
  lang: string,
  defaultLang: string,
): Promise<FeaturePolicyContentContext> {
  // Load system.md — single entry in "system" collection
  let systemPolicy: Record<string, unknown> | undefined;
  try {
    const systemEntries = await getCollection("system");
    const systemEntry = systemEntries.find((e: { id: string }) => e.id === "system");
    systemPolicy = (systemEntry?.data as Record<string, unknown> | undefined)?.policy as
      Record<string, unknown> | undefined;
  } catch {
    // system collection may not exist in all contexts
  }

  // Load site defaults
  let siteDefaults: Record<string, unknown> | undefined;
  try {
    const siteEntries = await getCollection("site");
    const siteEntry = siteEntries.find(
      (e: { id: string }) => e.id === `${lang}/config` || e.id === `${defaultLang}/config`,
    );
    siteDefaults = (siteEntry?.data as Record<string, unknown> | undefined)?.policy as
      Record<string, unknown> | undefined;
  } catch {
    // site collection may not exist in all contexts
  }

  return {
    systemPolicy,
    siteDefaults,
    page: undefined, // page policy is injected by page-level callers
    lang,
    defaultLanguage: defaultLang,
  };
}

/**
 * Create a Feature Policy resolver for Astro component contexts.
 * Caches per language to avoid repeated collection lookups.
 */
export async function getFeaturePolicyResolver(
  lang: string,
  defaultLang: string,
  options: FeaturePolicyResolverOptions = {},
) {
  const context = await loadFeaturePolicyContext(lang, defaultLang);
  return createFeaturePolicyResolver(context, options);
}

/**
 * Convenience: check if a shared component is enabled.
 * Replaces getSharedComponentVisibility(graph, componentId).
 */
export async function isSharedComponentEnabled(
  componentId: string,
  lang: string,
  defaultLang: string,
): Promise<boolean> {
  const resolver = await getFeaturePolicyResolver(lang, defaultLang);
  const target: FeaturePolicyTargetRef = {
    kind: "component",
    componentId,
    lang,
  };
  return resolver.isEnabled(target);
}

/**
 * Convenience: check if a shared component item is enabled.
 * Replaces isSharedComponentItemVisible(graph, componentId, itemId).
 */
export async function isSharedComponentItemEnabled(
  componentId: string,
  itemId: string,
  lang: string,
  defaultLang: string,
): Promise<boolean> {
  const resolver = await getFeaturePolicyResolver(lang, defaultLang);
  const target: FeaturePolicyTargetRef = {
    kind: "item",
    componentId,
    itemId,
    lang,
  };
  return resolver.isEnabled(target);
}

/**
 * Create resolver with page-level policy context.
 * Use this in page route components where page data is already loaded.
 */
export async function getPageFeaturePolicyResolver(
  pageData: Record<string, unknown>,
  lang: string,
  defaultLang: string,
  options: FeaturePolicyResolverOptions = {},
) {
  const context = await loadFeaturePolicyContext(lang, defaultLang);
  context.page = pageData as Record<string, unknown>;
  return createFeaturePolicyResolver(context, options);
}
