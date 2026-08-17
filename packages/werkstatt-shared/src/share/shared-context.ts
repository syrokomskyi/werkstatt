/*
<MODULE_CONTRACT>
<purpose>
Implements RFC-0099 page-driven shared component context resolution.
Provides app-agnostic helpers that merge block props from other pages using
priority order derived from system.md.
</purpose>
<non-goals>
  <item>Do not read files or Astro collections directly.</item>
  <item>Do not validate propsSchema correctness.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0099: Added shared page-driven context fallback helpers.</item>
</CHANGE_SUMMARY>
*/

import { deepMergeEntryData } from "./content/merge.ts";

export interface SharedContextBlockLike {
  id?: string;
  type?: string;
  use?: string;
  props?: Record<string, unknown>;
}

export interface SharedContextPageLike {
  pageId: string;
  blocks: SharedContextBlockLike[];
}

export interface SharedContextCandidate {
  pageId: string;
  block: SharedContextBlockLike;
}

export interface SharedContextCandidatesByLevel {
  home: SharedContextCandidate[];
  required: SharedContextCandidate[];
  other: SharedContextCandidate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBlockSelector(block: SharedContextBlockLike): string | null {
  return block.type ?? block.use ?? null;
}

function matchesSharedBlock(
  source: SharedContextBlockLike,
  target: SharedContextBlockLike,
): boolean {
  if (!source.id || !target.id || source.id !== target.id) {
    return false;
  }

  const sourceSelector = getBlockSelector(source);
  const targetSelector = getBlockSelector(target);

  if (sourceSelector && targetSelector) {
    return sourceSelector === targetSelector;
  }

  return true;
}

export function buildSharedContextPageOrder(options: {
  currentPageId: string;
  allPageIds: string[];
  requiredPageIds?: string[];
  homePageId?: string;
}): string[] {
  const { currentPageId, allPageIds, requiredPageIds = [], homePageId = "home" } = options;

  const remaining = allPageIds.filter((pageId) => pageId !== currentPageId);
  const ordered: string[] = [];

  if (remaining.includes(homePageId)) {
    ordered.push(homePageId);
  }

  for (const pageId of requiredPageIds) {
    if (pageId !== currentPageId && pageId !== homePageId && remaining.includes(pageId)) {
      ordered.push(pageId);
    }
  }

  for (const pageId of remaining) {
    if (!ordered.includes(pageId)) {
      ordered.push(pageId);
    }
  }

  return ordered;
}

export function collectSharedContextCandidatesByLevel(options: {
  currentPageId: string;
  block: SharedContextBlockLike;
  pages: Map<string, SharedContextPageLike>;
  requiredPageIds?: string[];
  homePageId?: string;
}): SharedContextCandidatesByLevel {
  const { currentPageId, block, pages, requiredPageIds = [], homePageId = "home" } = options;

  const result: SharedContextCandidatesByLevel = {
    home: [],
    required: [],
    other: [],
  };

  if (!block.id) {
    return result;
  }

  const allPageIds = [...pages.keys()];
  const ordered = buildSharedContextPageOrder({
    currentPageId,
    allPageIds,
    requiredPageIds,
    homePageId,
  });

  for (const pageId of ordered) {
    const page = pages.get(pageId);
    if (!page) continue;

    const candidateBlock = page.blocks.find((sourceBlock) =>
      matchesSharedBlock(sourceBlock, block),
    );
    if (!candidateBlock) continue;

    const candidate = { pageId, block: candidateBlock };

    if (pageId === homePageId) {
      result.home.push(candidate);
    } else if (requiredPageIds.includes(pageId)) {
      result.required.push(candidate);
    } else {
      result.other.push(candidate);
    }
  }

  return result;
}

export function resolveSharedContextProps(options: {
  currentPageId: string;
  block: SharedContextBlockLike;
  pages: Map<string, SharedContextPageLike>;
  requiredPageIds?: string[];
  homePageId?: string;
}): Record<string, unknown> {
  const { currentPageId, block, pages, requiredPageIds = [], homePageId = "home" } = options;

  const explicitProps = isRecord(block.props) ? block.props : {};
  if (!block.id) {
    return explicitProps;
  }

  const candidates = collectSharedContextCandidatesByLevel({
    currentPageId,
    block,
    pages,
    requiredPageIds,
    homePageId,
  });

  const source = candidates.home[0] ?? candidates.required[0] ?? candidates.other[0];
  if (!source || !isRecord(source.block.props)) {
    return explicitProps;
  }

  return deepMergeEntryData(source.block.props, explicitProps);
}
