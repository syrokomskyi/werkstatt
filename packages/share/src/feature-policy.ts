/*
<MODULE_CONTRACT>
<purpose>Runtime resolver for RFC-0183 Feature Policy embedded in RFC-0047 content domains.</purpose>
<non-goals>
  <item>Do not import from astro:content or other framework-specific modules.</item>
  <item>Do not modify content files.</item>
  <item>Do not handle remote feature flag services.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0183: Initial runtime resolver for Feature Policy without Feature Graph dependency.</item>
  <item>Removed false async from resolveFeaturePolicy; resolveFeaturePolicySync is now a thin alias.</item>
</CHANGE_SUMMARY>
*/

import type {
  FeaturePolicy,
  FeaturePolicyBehaviorValue,
  FeaturePolicyTargetKind,
  FeaturePolicyTargetRef,
  FeaturePolicyVisibility,
  ResolvedFeaturePolicy,
} from "./schemas/features.ts";

// Re-export types for consumers
export type {
  FeaturePolicy,
  FeaturePolicyBehaviorValue,
  FeaturePolicyTargetKind,
  FeaturePolicyTargetRef,
  FeaturePolicyVisibility,
  ResolvedFeaturePolicy,
} from "./schemas/features.ts";

export interface FeaturePolicyResolverOptions {
  /**
   * Default language code for policy resolution when localized policy absent.
   */
  defaultLanguage?: string;
  /**
   * Whether to cache resolved policy. Default true.
   */
  cache?: boolean;
  /**
   * Platform default visibility when no policy found anywhere.
   * RFC-0183 default is "enabled".
   */
  platformDefaultVisibility?: FeaturePolicyVisibility;
}

/**
 * Narrow interface for content nodes that may carry policy.
 * Resolver works with any object matching this shape, allowing
 * framework-neutral resolution from Astro content, plain objects, etc.
 */
export interface PolicyCarryingNode {
  id?: string;
  policy?: FeaturePolicy;
  blocks?: PolicyCarryingNode[];
  items?: PolicyCarryingNode[];
  components?: PolicyCarryingNode[];
  [key: string]: unknown;
}

/**
 * Content context passed to resolver.
 * Contains already-loaded content from RFC-0047 domains.
 */
export interface FeaturePolicyContentContext {
  /** Site-level policy defaults from system.md */
  systemPolicy?: FeaturePolicy;
  /** Site-level defaults from site/{lang}/config or similar */
  siteDefaults?: FeaturePolicy;
  /** Current page content node */
  page?: PolicyCarryingNode;
  /** Current language */
  lang?: string;
  /** Default language for fallback */
  defaultLanguage?: string;
}

// Resolution is pure given (context, target, lang, platformDefault). The cache is
// therefore scoped to the content CONTEXT — a WeakMap keyed by context identity — so two
// different contexts never share resolved policy for the same target+lang.
// Bug history (RFC-0183): a module-global array keyed by target+lang ALONE silently
// returned one context's result for another, clobbering page-level policy. Do not
// reintroduce a context-agnostic global cache.
const MAX_CACHE_SIZE = 100;
let contextCaches = new WeakMap<FeaturePolicyContentContext, Map<string, ResolvedFeaturePolicy>>();

function getCacheKey(
  target: FeaturePolicyTargetRef,
  lang: string,
  platformDefault: FeaturePolicyVisibility,
): string {
  const parts = [target.kind, lang, `d:${platformDefault}`];
  if (target.pageId) parts.push(`p:${target.pageId}`);
  if (target.blockId) parts.push(`b:${target.blockId}`);
  if (target.componentId) parts.push(`c:${target.componentId}`);
  if (target.itemId) parts.push(`i:${target.itemId}`);
  return parts.join("|");
}

function getCached(
  context: FeaturePolicyContentContext,
  key: string,
): ResolvedFeaturePolicy | undefined {
  return contextCaches.get(context)?.get(key);
}

function setCached(
  context: FeaturePolicyContentContext,
  key: string,
  result: ResolvedFeaturePolicy,
): void {
  let cache = contextCaches.get(context);
  if (!cache) {
    cache = new Map();
    contextCaches.set(context, cache);
  }
  // Evict oldest (Map preserves insertion order) when at capacity.
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
}

/** Drops all cached resolutions. Per-context caches are also GC'd with their context. */
export function clearFeaturePolicyCache(): void {
  contextCaches = new WeakMap();
}

/**
 * Search for policy in a node tree by id path.
 * Handles nested structures: page → blocks → components → items.
 */
function findPolicyInNode(
  node: PolicyCarryingNode,
  target: FeaturePolicyTargetRef,
): FeaturePolicy | null {
  // Direct match on current node
  if (
    (target.blockId && node.id === target.blockId) ||
    (target.componentId && node.id === target.componentId) ||
    (target.itemId && node.id === target.itemId)
  ) {
    return node.policy ?? null;
  }

  // Search in blocks
  if (target.blockId && node.blocks) {
    for (const block of node.blocks) {
      if (block.id === target.blockId) {
        // If looking for nested component/item within this block
        if (target.componentId && block.components) {
          const comp = block.components.find((c) => c.id === target.componentId);
          if (comp) {
            if (target.itemId && comp.items) {
              const item = comp.items.find((i) => i.id === target.itemId);
              if (item?.policy) return item.policy;
            }
            return comp.policy ?? null;
          }
        }
        return block.policy ?? null;
      }
      // Deep search if not matched by id
      const deep = findPolicyInNode(block, target);
      if (deep) return deep;
    }
  }

  // Search in items (for shared components)
  if (target.itemId && node.items) {
    const item = node.items.find((i) => i.id === target.itemId);
    if (item?.policy) return item.policy;
  }

  // Search in components
  if (target.componentId && node.components) {
    const comp = node.components.find((c) => c.id === target.componentId);
    if (comp) {
      if (target.itemId && comp.items) {
        const item = comp.items.find((i) => i.id === target.itemId);
        if (item?.policy) return item.policy;
      }
      return comp.policy ?? null;
    }
  }

  // Recursive search in any nested structure
  const nestedArrays = [node.blocks, node.components, node.items].filter(Boolean);
  for (const arr of nestedArrays) {
    for (const child of arr ?? []) {
      const found = findPolicyInNode(child, target);
      if (found) return found;
    }
  }

  return null;
}

/**
 * RFC-0183 resolution order:
 * 1. Explicit policy on content node
 * 2. Page-level policy (via page content context)
 * 3. System-level policy for matching ids
 * 4. Site-level defaults
 * 5. Platform default: visibility=enabled, empty behavior
 */
function resolvePolicyInternal(
  target: FeaturePolicyTargetRef,
  context: FeaturePolicyContentContext,
  platformDefault: FeaturePolicyVisibility,
): ResolvedFeaturePolicy {
  const lang = target.lang ?? context.lang;
  const defaultLang = context.defaultLanguage;
  if (!lang || !defaultLang) {
    throw new Error("[feature-policy] lang and defaultLanguage are required.");
  }

  // 1. Try explicit node policy via page context
  let foundPolicy: FeaturePolicy | null = null;
  let inheritedFrom: FeaturePolicyTargetRef | undefined;

  if (context.page) {
    foundPolicy = findPolicyInNode(context.page, target);
    if (foundPolicy) {
      inheritedFrom = { ...target, lang };
    }
  }

  // 2. Try system-level policy if id-based lookup exists there
  // (System policy stored as flat record keyed by "page:home/block:hero")
  if (!foundPolicy && context.systemPolicy) {
    const systemKey = buildSystemKey(target);
    if (systemKey && (context.systemPolicy as Record<string, FeaturePolicy>)[systemKey]) {
      foundPolicy = (context.systemPolicy as Record<string, FeaturePolicy>)[systemKey];
      inheritedFrom = { kind: "page" as const, lang: defaultLang }; // system is lang-agnostic
    }
  }

  // 3. Site-level defaults
  if (!foundPolicy && context.siteDefaults) {
    foundPolicy = context.siteDefaults;
    inheritedFrom = { kind: "page" as const, lang: defaultLang };
  }

  // 4. Build resolved result with defaults
  const resolved: ResolvedFeaturePolicy = {
    target,
    visibility: foundPolicy?.visibility ?? platformDefault,
    behavior: foundPolicy?.behavior ?? {},
    sourcePath: buildSourcePath(foundPolicy, inheritedFrom),
    inheritedFrom,
  };

  return resolved;
}

function buildSystemKey(target: FeaturePolicyTargetRef): string | null {
  const parts: string[] = [];
  if (target.pageId) parts.push(`page:${target.pageId}`);
  if (target.blockId) parts.push(`block:${target.blockId}`);
  if (target.componentId) parts.push(`component:${target.componentId}`);
  if (target.itemId) parts.push(`item:${target.itemId}`);
  return parts.length > 0 ? parts.join("/") : null;
}

function buildSourcePath(policy: FeaturePolicy | null, inherited?: FeaturePolicyTargetRef): string {
  if (!policy) return "platform-default";
  if (inherited) {
    const parts: string[] = [inherited.kind];
    if (inherited.pageId) parts.push(inherited.pageId);
    if (inherited.blockId) parts.push(inherited.blockId);
    if (inherited.componentId) parts.push(inherited.componentId);
    if (inherited.itemId) parts.push(inherited.itemId);
    return parts.join("/");
  }
  return "node-explicit";
}

/**
 * Resolve feature policy for a target.
 * Resolution is synchronous given loaded content context.
 * Kept as the canonical name; resolveFeaturePolicySync is an alias.
 */
export function resolveFeaturePolicy(
  target: FeaturePolicyTargetRef,
  context: FeaturePolicyContentContext,
  options: FeaturePolicyResolverOptions = {},
): ResolvedFeaturePolicy {
  const { cache = true, platformDefaultVisibility = "enabled" } = options;
  const lang = target.lang ?? context.lang;
  if (!lang) {
    throw new Error("[feature-policy] lang is required.");
  }

  if (cache) {
    const key = getCacheKey(target, lang, platformDefaultVisibility);
    const cached = getCached(context, key);
    if (cached) return cached;

    const result = resolvePolicyInternal(target, context, platformDefaultVisibility);
    setCached(context, key, result);
    return result;
  }

  return resolvePolicyInternal(target, context, platformDefaultVisibility);
}

/**
 * Alias for resolveFeaturePolicy (kept for call sites that explicitly want the
 * synchronous signature). Resolution was always synchronous.
 */
export function resolveFeaturePolicySync(
  target: FeaturePolicyTargetRef,
  context: FeaturePolicyContentContext,
  options: FeaturePolicyResolverOptions = {},
): ResolvedFeaturePolicy {
  return resolveFeaturePolicy(target, context, options);
}

/**
 * Factory for creating a configured resolver bound to specific content context.
 */
export function createFeaturePolicyResolver(
  context: FeaturePolicyContentContext,
  options: FeaturePolicyResolverOptions = {},
) {
  return {
    resolve: (target: FeaturePolicyTargetRef) => resolveFeaturePolicy(target, context, options),
    resolveSync: (target: FeaturePolicyTargetRef) =>
      resolveFeaturePolicySync(target, context, options),
    isEnabled: (target: FeaturePolicyTargetRef) =>
      isPolicyEnabled(resolveFeaturePolicySync(target, context, options)),
    getBehavior: (
      target: FeaturePolicyTargetRef,
      key: string,
      defaultValue?: FeaturePolicyBehaviorValue,
    ) => getPolicyBehavior(resolveFeaturePolicySync(target, context, options), key, defaultValue),
  };
}

/**
 * Predicate: is the resolved policy effectively enabled?
 * Treats "enabled" as true, "disabled"/"hidden" as false, "draft" depends on environment.
 */
export function isPolicyEnabled(policy: ResolvedFeaturePolicy, isDraftAllowed = false): boolean {
  if (policy.visibility === "enabled") return true;
  if (policy.visibility === "disabled" || policy.visibility === "hidden") return false;
  if (policy.visibility === "draft") return isDraftAllowed;
  return true; // unknown defaults to enabled per RFC-0183
}

/**
 * Extract behavior value with optional default.
 */
export function getPolicyBehavior(
  policy: ResolvedFeaturePolicy,
  key: string,
  defaultValue?: FeaturePolicyBehaviorValue,
): FeaturePolicyBehaviorValue {
  const value = policy.behavior[key];
  if (value === undefined) return defaultValue ?? null;
  return value as FeaturePolicyBehaviorValue;
}
