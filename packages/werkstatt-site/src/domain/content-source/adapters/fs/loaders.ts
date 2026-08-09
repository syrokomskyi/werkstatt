/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] Filesystem adapter Astro Content Layer loaders. Relocates the glob-based
  collection loaders so the filesystem becomes an explicit adapter. Behavior is identical
  to the previous @warpgogol/werkstatt-site/share/astro/loaders.ts and @warpgogol/werkstatt-site/pbp/astro.ts globs.
</purpose>
<non-goals>
  <item>Do not define collection schemas — those stay app-specific.</item>
  <item>Do not change glob patterns or id generation — byte-for-byte relocation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: relocated markdown/data glob loaders into the fs adapter.</item>
</CHANGE_SUMMARY>
*/

import { glob } from "astro/loaders";
import type { Loader } from "astro/loaders";

export type MarkdownCollectionLoaderOptions = {
  generateId?: (entry: string) => string;
};

/** Markdown glob loader (excludes AGENTS.md). Default id = path without the .md extension. */
export function fsMarkdownCollectionLoader(
  basePath: string,
  options?: MarkdownCollectionLoaderOptions,
): Loader {
  return glob({
    pattern: ["**/*.md", "!**/AGENTS.md"],
    base: basePath,
    generateId: ({ entry }) => {
      return options?.generateId?.(entry) ?? entry.replace(/\.md$/, "");
    },
  });
}

export type DataCollectionLoaderOptions = {
  base: string;
  generateId: (entry: string) => string;
};

/** Data glob loader (md + yaml, excludes AGENTS.md) for collections like business. */
export function fsDataCollectionLoader(options: DataCollectionLoaderOptions): Loader {
  return glob({
    pattern: ["**/*.md", "**/*.yaml", "!**/AGENTS.md"],
    base: options.base,
    generateId: ({ entry }) => options.generateId(entry),
  });
}
