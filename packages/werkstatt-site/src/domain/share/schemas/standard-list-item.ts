/*
<MODULE_CONTRACT>
<purpose>
[RFC-0100 + RFC-0103] Canonical StandardListItem schema mirrored in
@warpgogol/werkstatt-site/share so body components can validate items without importing from
@warpgogol/werkstatt-site/ui (which would create a cyclic dependency). The same shape is
re-exported by @warpgogol/werkstatt-site/ui/icons/icon-resolver for backwards compatibility.
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

export const vendorIconConfigSchema = z
  .object({
    vendor: z.string().min(1),
    collection: z.string().min(1),
    name: z.string().min(1),
    size: z.number().int().positive().optional(),
  })
  .strict();

export type VendorIconConfig = z.infer<typeof vendorIconConfigSchema>;

export const standardListItemSchema = z
  .object({
    text: z.string().min(1),
    icon: vendorIconConfigSchema.optional(),
  })
  .strict();

export type StandardListItem = z.infer<typeof standardListItemSchema>;
