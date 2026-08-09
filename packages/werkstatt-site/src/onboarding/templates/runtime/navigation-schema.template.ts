/*
<MODULE_CONTRACT>
<purpose>Zod schema for navigation content collection (RFC-0044).</purpose>
<non-goals>
  <item>Do not handle runtime resolution or feature graph integration.</item>
  <item>Do not contain business logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implement RFC-0044: Navigation content schema.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const navigationTargetSchema = z.object({
  id: z.string(),
  label: z.string(),
  semanticTarget: z.union([
    z.object({
      kind: z.literal("internal"),
      pageId: z.string(),
      anchor: z.string().optional(),
    }),
    z.object({
      kind: z.literal("external"),
      href: z.url(),
    }),
  ]),
  routeSlug: z.string().optional(),
  group: z.enum(["navigation", "legal", "contact"]).optional(),
});

export const navigationSchema = z.object({
  targets: z.array(navigationTargetSchema),
});

export type NavigationTarget = z.infer<typeof navigationTargetSchema>;
