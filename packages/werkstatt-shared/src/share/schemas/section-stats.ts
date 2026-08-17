/*
<MODULE_CONTRACT>
<purpose>
[RFC-0103] Canonical StatItem schema consumed by <SectionStats>.
GSAP scroll-triggered counter animation (RFC-0040) hooks into the optional
numericValue / prefix / suffix / decimals / duration fields.
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

export const statItemSchema = z
  .object({
    /** Static display fallback — always required so SSR renders something before JS runs. */
    value: z.string().min(1),
    label: z.string().min(1),
    /** Numeric target for the GSAP counter; absent means the value renders statically. */
    numericValue: z.number().optional(),
    /** Symbol rendered before the number (e.g. "€"). */
    prefix: z.string().optional(),
    /** Unit rendered after the number (e.g. "+", "%", "K"). */
    suffix: z.string().optional(),
    /** Decimal places for Intl.NumberFormat. Default 0. */
    decimals: z.number().int().nonnegative().optional(),
    /** GSAP tween duration in seconds. Default 1.8. */
    duration: z.number().positive().optional(),
  })
  .strict();

export type StatItem = z.infer<typeof statItemSchema>;
