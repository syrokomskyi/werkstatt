/*
<MODULE_CONTRACT>
<purpose>
Canonical composable UI effects contract for shared sections and components.
Owns effect targets, discriminated effect kinds, assignment arrays, and
schema validation for the RFC-0134 glass-first effects model.
</purpose>
<non-goals>
  <item>Do not render effects — rendering belongs to @warpgogol/ui.</item>
  <item>Do not implement future effect kinds beyond glass in the initial wave.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Introduces RFC-0134 composable effects contracts with glass as the first supported effect kind.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

const NAMED_EFFECT_TARGETS = [
  "section",
  "body",
  "panel",
  "item",
  "card",
  "row",
  "column",
  "media",
  "cta",
  "heading", // RFC-0151 — typographic effects on the section heading
  "subheading", // typographic effects on the section subheading/tagline
] as const;

export const namedEffectTargetSchema = z.enum(NAMED_EFFECT_TARGETS);
const slotEffectTargetSchema = z.string().regex(/^slot:[a-z0-9-]+$/);
export const effectTargetSchema = z.union([namedEffectTargetSchema, slotEffectTargetSchema]);
export type EffectTarget = z.infer<typeof effectTargetSchema>;

export const glassEffectSchema = z
  .object({
    kind: z.literal("glass"),
    enabled: z.boolean(),
    blur: z.number().min(0).max(64).optional(),
    saturate: z.number().min(0).max(400).optional(),
    tint: z.string().min(1).optional(),
    tintOpacity: z.number().min(0).max(1).optional(),
    border: z.enum(["hairline", "none"]).optional(),
  })
  .strict();
export type GlassEffect = z.infer<typeof glassEffectSchema>;

/**
 * RFC-0151 — shared color alias for typographic effects. Either a biome token
 * alias resolved by the renderer, or a raw passthrough value (e.g. "#0af").
 */
export const effectColorSchema = z.union([
  z.enum(["text", "primary", "accent", "shadow", "surface", "inverse"]),
  z.string().min(1),
]);
export type EffectColor = z.infer<typeof effectColorSchema>;

export const shadowEffectSchema = z
  .object({
    kind: z.literal("shadow"),
    enabled: z.boolean(),
    offsetX: z.number().min(-64).max(64).optional(),
    offsetY: z.number().min(-64).max(64).optional(),
    blur: z.number().min(0).max(64).optional(),
    color: effectColorSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();
export type ShadowEffect = z.infer<typeof shadowEffectSchema>;

export const glowEffectSchema = z
  .object({
    kind: z.literal("glow"),
    enabled: z.boolean(),
    blur: z.number().min(0).max(96).optional(),
    color: effectColorSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();
export type GlowEffect = z.infer<typeof glowEffectSchema>;

export const bulgeEffectSchema = z
  .object({
    kind: z.literal("bulge"),
    enabled: z.boolean(),
    depth: z.number().min(0).max(16).optional(),
    highlight: z.number().min(0).max(1).optional(),
    shade: z.number().min(0).max(1).optional(),
    shadowColor: effectColorSchema.optional(),
    highlightColor: effectColorSchema.optional(),
  })
  .strict();
export type BulgeEffect = z.infer<typeof bulgeEffectSchema>;

export const tiltEffectSchema = z
  .object({
    kind: z.literal("tilt"),
    enabled: z.boolean(),
    rotate: z.number().min(-15).max(15).optional(),
    skewX: z.number().min(-15).max(15).optional(),
  })
  .strict();
export type TiltEffect = z.infer<typeof tiltEffectSchema>;

export const effectSchema = z.discriminatedUnion("kind", [
  glassEffectSchema,
  shadowEffectSchema,
  glowEffectSchema,
  bulgeEffectSchema,
  tiltEffectSchema,
]);
export type Effect = z.infer<typeof effectSchema>;

export type EffectKind = Effect["kind"];
export type EffectRenderStrategy = "surface" | "text";

/**
 * RFC-0151 — per-kind metadata. Single source of truth shared by the stack
 * validator (maxPerStack) and the @warpgogol/ui renderer (strategy).
 */
export const EFFECT_KIND_META = {
  glass: { strategy: "surface", maxPerStack: 1 },
  shadow: { strategy: "text", maxPerStack: 1 },
  glow: { strategy: "text", maxPerStack: 1 },
  bulge: { strategy: "text", maxPerStack: 1 },
  tilt: { strategy: "text", maxPerStack: 1 },
} as const satisfies Record<EffectKind, { strategy: EffectRenderStrategy; maxPerStack: number }>;

/**
 * RFC-0151 — which effect kinds each target accepts. Targets absent from this
 * map default to glass-only (the RFC-0134 surface behavior). The `heading`
 * target accepts only the typographic (text-strategy) kinds.
 */
export const TARGET_ALLOWED_KINDS: Record<string, readonly EffectKind[]> = {
  heading: ["shadow", "glow", "bulge", "tilt"],
  subheading: ["shadow", "glow", "bulge", "tilt"],
};

const DEFAULT_ALLOWED_KINDS: readonly EffectKind[] = ["glass"];

/** RFC-0151 — kinds accepted by a target, falling back to the glass-only default. */
export function allowedKindsForTarget(target: EffectTarget): readonly EffectKind[] {
  return TARGET_ALLOWED_KINDS[target] ?? DEFAULT_ALLOWED_KINDS;
}

export const effectStackSchema = z
  .array(effectSchema)
  .min(1)
  .superRefine((stack, ctx) => {
    const counts = new Map<EffectKind, number>();
    for (const effect of stack) {
      counts.set(effect.kind, (counts.get(effect.kind) ?? 0) + 1);
    }
    for (const [kind, count] of counts) {
      const max = EFFECT_KIND_META[kind].maxPerStack;
      if (count > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Only ${max} ${kind} effect(s) allowed per effect stack.`,
        });
      }
    }
  });

export const effectAssignmentSchema = z
  .object({
    target: effectTargetSchema,
    stack: effectStackSchema,
  })
  .strict()
  .superRefine((assignment, ctx) => {
    // RFC-0151 — target × kind admissibility. A heading accepts only the
    // typographic kinds; surface targets accept only glass. This is the
    // contract guard the RFC describes, enforced wherever content is validated.
    const allowed = allowedKindsForTarget(assignment.target);
    for (const effect of assignment.stack) {
      if (!allowed.includes(effect.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stack"],
          message: `Target '${assignment.target}' supports kinds [${allowed.join(", ")}], not '${effect.kind}'.`,
        });
      }
    }
  });
export type EffectAssignment = z.infer<typeof effectAssignmentSchema>;

export const effectsSchema = z.array(effectAssignmentSchema).min(1);
export type Effects = z.infer<typeof effectsSchema>;

export function resolveEffectsForTarget(
  assignments: readonly EffectAssignment[] | undefined,
  target: EffectTarget,
): Effect[] {
  return assignments?.find((assignment) => assignment.target === target)?.stack ?? [];
}

export function hasEnabledGlassEffect(effects: readonly Effect[] | undefined): effects is Effect[] {
  return Boolean(effects?.some((effect) => effect.kind === "glass" && effect.enabled));
}

export function resolveGlassEffect(
  effects: readonly Effect[] | undefined,
): GlassEffect | undefined {
  return effects?.find(
    (effect): effect is GlassEffect => effect.kind === "glass" && effect.enabled,
  );
}
