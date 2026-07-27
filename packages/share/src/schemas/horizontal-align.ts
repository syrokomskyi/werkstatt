/*
<MODULE_CONTRACT>
<purpose>
[RFC-0101][RFC-0102][RFC-0103][RFC-0104] Canonical horizontal alignment enum
shared by SectionHeader, SectionBody, SectionCtaGroup and any future section
primitive that needs left | center | right.
</purpose>
<non-goals>
  <item>Do not add vertical alignment or alignment for shell-level layouts.</item>
  <item>Do not couple alignment to section content shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const horizontalAlignSchema = z.enum(["left", "center", "right"]);

export type HorizontalAlign = z.infer<typeof horizontalAlignSchema>;
