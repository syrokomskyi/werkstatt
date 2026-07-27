/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/schemas/navigation.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not handle runtime resolution or feature graph integration.</item>
  <item>Do not contain business logic.</item>
  <item>Do not handle backward compatibility (RFC-0046: no backward compatibility needed).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Implement RFC-0046: Move navigation schema to shared package with configurable groups.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * Creates a Zod enum for navigation groups from an array of allowed group names.
 * Apps call this in their content.config.ts or navigation.ts with their specific groups.
 *
 * @param groups - Array of allowed navigation group names for the app
 * @returns Zod enum schema for navigation groups
 */
export function createNavigationGroupEnum(groups: string[]) {
  return z.enum(groups as [string, ...string[]]);
}

// Default groups for backward compatibility with existing apps
export const defaultNavigationGroups = ["navigation", "legal", "contact"] as const;

/**
 * Creates a navigation target schema with configurable group validation.
 *
 * @param groupEnum - Zod enum schema for allowed navigation groups
 * @returns Zod schema for a single navigation target
 */
export const navigationTargetSchema = (groupEnum: z.ZodEnum<any>) =>
  z.object({
    id: z.string(),
    label: z.string(),
    semanticTarget: z.union([
      z.object({
        kind: z.literal("internal"),
        pageId: z.string(),
        // RFC-0048: anchor may be a plain string (language-neutral) or a
        // language-keyed record (e.g. { de: "unser-ansatz", en: "our-approach" })
        anchor: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
      }),
      z.object({
        kind: z.literal("external"),
        href: z.url(),
      }),
    ]),
    routeSlug: z.string().optional(),
    group: groupEnum.optional(),
  });

/**
 * Creates a navigation schema with configurable group validation.
 *
 * @param groupEnum - Zod enum schema for allowed navigation groups
 * @returns Zod schema for the full navigation structure
 */
export const navigationSchema = (groupEnum: z.ZodEnum<any>) =>
  z.object({
    targets: z.array(navigationTargetSchema(groupEnum)),
  });

/**
 * Type helper for navigation target.
 * The group field is loosely typed (string) here; per-app strict validation comes
 * from the runtime Zod schema returned by navigationTargetSchema(groupEnum).
 */
export type NavigationTarget = z.infer<ReturnType<typeof navigationTargetSchema>>;
