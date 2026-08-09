/*
<MODULE_CONTRACT>
<purpose>
Shared base Zod fields consumed by all page schemas across apps/*. Extracted to packages/share
so every app re-uses the same componentOverrides contract without copy-pasting.
Depends only on the zod peer dependency; no Astro or app-specific imports.
</purpose>
<non-goals>
  <item>Do not define page-specific or app-specific fields here.</item>
  <item>Do not import from apps/* or astro:content.</item>
  <item>Do not perform runtime data fetching or API interactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial extraction from app content schemas/pages/base into packages/share.</item>
  <item>Switched import from "astro/zod" to "zod" so the package is Astro-agnostic.</item>
</CHANGE_SUMMARY>
*/

// [RFC-0004] Shared base fields for all page schemas.
// Extracted to packages/share to prevent copy-paste across apps.
// Import z from "zod" — not "astro/zod" — so this package stays framework-neutral.

import { z } from "zod";

// componentOverrides: a map of component paths to partial content objects.
// Pages use this to override default component copy from frontmatter,
// keeping .astro route files thin and copy-free.
export const componentOverridesSchema = z
  .record(z.string(), z.record(z.string(), z.unknown()))
  .optional();

export type ComponentOverrides = z.infer<typeof componentOverridesSchema>;
