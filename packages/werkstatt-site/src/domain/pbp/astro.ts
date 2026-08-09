/*
<MODULE_CONTRACT>
<purpose>Astro content-collection helper for @warpgogol/werkstatt-site/pbp. Exports a ready-to-spread
`pbpCollections` object for use in a site's `src/content/config.ts` (RFC-0466).</purpose>
<non-goals>
  <item>Does not validate PBP entry schemas here — the loaders handle that via pbpSchemaById.</item>
  <item>Does not declare site-specific collections. Sites spread `pbpCollections` into
        their own collection config alongside their own collections.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Astro content collection definitions for PBP.</item>
</CHANGE_SUMMARY>
*/

import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";
import { toDataEntryId } from "@warpgogol/werkstatt-site/share/content";
import { fsDataCollectionLoader } from "@warpgogol/werkstatt-site/content-source";
import { rateSnapshotSchema } from "./schemas/rate-snapshot.js";

/**
 * Pre-configured Astro collection definition for the PBP "business-profile" collection.
 *
 * Usage in a site's src/content/config.ts:
 *
 *   import { pbpCollections } from "@warpgogol/werkstatt-site/pbp/astro";
 *
 *   export const collections = {
 *     ...pbpCollections,
 *     // site-specific collections continue here
 *   };
 *
 * Content must live at src/content/business-profile/<lang>/<entity-type>/<slug>.md (or .yaml).
 * The default language directory must always exist (RFC-0008 fallback anchor).
 */
export const pbpCollections = {
  "business-profile": defineCollection({
    loader: fsDataCollectionLoader({
      base: "src/content/business-profile",
      generateId: (entry) => toDataEntryId(entry),
    }),
    // Permissive schema — per-entry validation is deferred to the loaders
    // which dispatch via pbpSchemaById. This avoids a circular dependency
    // between the collection config (evaluated at startup) and the schema map.
    schema: z.object({}).catchall(z.any()),
  }),
  "rate-snapshot": defineCollection({
    loader: glob({
      pattern: ["rate-snapshots/**/*.md", "rate-snapshots/**/*.yaml", "!**/AGENTS.md"],
      base: "src/content/business-profile",
      generateId: ({ entry }) => toDataEntryId(entry),
    }),
    schema: rateSnapshotSchema,
  }),
};
