/*
<MODULE_CONTRACT>
<purpose>Text and semantic page type schemas for the system manifest: defines page type enums and text-related configuration.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from schemas/system.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * The `text.normalize` block in system.yaml (RFC-0235). Controls the egress
 * adapter that strips AI-authorship typographic signals from public output
 * (rendered HTML, llms.txt, Markdown twins, feed.xml, sitemap*.xml, JSON-LD,
 * OG preview text). It is an adapter, not a source rewrite — authored content
 * is never modified.
 *
 * Default-all-on: an absent block, an absent `enabled`, or an absent signal key
 * all resolve to ON. A site owner disables any single signal here.
 * CLIENT-WRITABLE.
 */
export const systemTextNormalizeSignalsSchema = z
  .object({
    /** Special dashes (figure/en/em/horizontal-bar/non-breaking-hyphen/minus) → '-'. */
    dashes: z.boolean().optional(),
    /** Curly + guillemet quotes (U+00AB/U+00BB, U+2018–U+201F) → straight " / '. */
    quotes: z.boolean().optional(),
    /** Special spaces (nbsp, en/em/thin/hair, narrow-nbsp, ideographic…) → regular space. */
    spaces: z.boolean().optional(),
    /** Zero-width / invisible characters (ZWSP, ZWNJ, word-joiner, BOM, soft-hyphen…) → removed. */
    zeroWidth: z.boolean().optional(),
    /** Typographic HTML entities (&nbsp; &mdash; &hellip; …) → decoded then char-normalized. */
    htmlEntities: z.boolean().optional(),
    /** Single-character ellipsis U+2026 … → three dots '...'. */
    ellipsis: z.boolean().optional(),
  })
  .strict();

export const systemTextNormalizeSchema = z
  .object({
    /** Master switch. Absent ⇒ true. */
    enabled: z.boolean().optional(),
    /** Per-signal toggles. Each absent key ⇒ true (everything on by default). */
    signals: systemTextNormalizeSignalsSchema.optional(),
  })
  .strict();

export const systemTextSchema = z
  .object({
    normalize: systemTextNormalizeSchema.optional(),
  })
  .strict();

export type SystemText = z.infer<typeof systemTextSchema>;
