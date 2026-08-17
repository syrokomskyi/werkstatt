/*
<MODULE_CONTRACT>
<purpose>
[RFC-0103] Canonical StandardCard schema consumed by <SectionCardGrid>. Unifies
the four ad-hoc card shapes that used to live in `approach`, `audience-cards`,
`donation-use`, `team` (PersonProfile keeps a richer shape because it owns
animation hooks).
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
import { vendorIconConfigSchema } from "./standard-list-item.ts";

export const standardCardSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    /** Bare image name (RFC-0053); resolved by <SectionImage> at render. */
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    icon: vendorIconConfigSchema.optional(),
    /** Optional internal pageId or anchor target — turns the card into a link. */
    href: z.string().optional(),
    badge: z.string().optional(),
    /** Optional number display for the card (e.g., "01", "02") */
    number: z.string().optional(),
  })
  .strict();

export type StandardCard = z.infer<typeof standardCardSchema>;
