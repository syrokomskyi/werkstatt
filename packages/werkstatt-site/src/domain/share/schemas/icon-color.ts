/*
<MODULE_CONTRACT>
<purpose>
[RFC-0103] Canonical IconColor enum consumed by body components (<SectionList>,
<SectionSplitList>, <SectionCardGrid>, ...) for per-row icon tinting.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const iconColorSchema = z.enum([
  "primary",
  "accent",
  "success",
  "warning",
  "error",
  "muted",
]);

export type IconColor = z.infer<typeof iconColorSchema>;
