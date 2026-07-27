/*
<MODULE_CONTRACT>
<purpose>
Zod schema for Biome definition files (packages/ontology/biomes/*.yaml).
A Biome is a full visual-DNA contract: family linkage, provenance, closed design
axes, palette, typography, spacing, motion, geometry, and authoring constraints.
Applied via html[data-biome="<id>"] in the cascade layer stack.
</purpose>
<non-goals>
  <item>Do not parse YAML here; the caller is responsible for parsing.</item>
  <item>Do not define CSS; the codegen command (biome-css.ts) produces CSS from
        parsed Biome objects.</item>
  <item>Do not reference business or app logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>RFC-0071: Replace narrow token overrides with the extended biome visual-DNA contract.</item>
  <item>RFC-0371: Add optional <code>fonts</code> field for biome-driven Fontsource CSS imports.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

const semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i, "version must be valid semver");
const kebabId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case (lowercase letters, digits, hyphens)");
const cssValue = z.string().min(1);
const sourceArtifact = z
  .string()
  .regex(/^\d{2}-[a-z0-9][a-z0-9.-]*(?:\.[a-z0-9]+)?(?:\.[a-z0-9]+)?$/i);

export const biomeProvenanceSchema = z
  .object({
    client: kebabId,
    selectedConcept: z.string().regex(/^concept-\d+$/),
    selectedDirection: z.number().int().positive(),
    sourceFiles: z.array(sourceArtifact).min(1),
  })
  .strict();

export const biomeAxesSchema = z
  .object({
    warmth: z.enum(["cool", "neutral", "warm"]),
    contrast: z.enum(["low", "medium", "high"]),
    density: z.enum(["dense", "comfortable", "airy"]),
    typographySharpness: z.enum(["soft", "balanced", "sharp"]),
    diagramPresence: z.enum(["absent", "minimal", "supportive", "central"]),
    photoStance: z.enum(["none", "founder-only", "documentary", "editorial"]),
    motionStance: z.enum(["static", "restrained", "expressive"]),
    textContrast: z.enum(["aa", "aaa"]),
    cornerRadius: cssValue,
    borderWeight: cssValue,
  })
  .strict();

export const biomePaletteSchema = z
  .object({
    brand: cssValue,
    brandHover: cssValue,
    brandContrast: cssValue,
    accent: cssValue,
    surface: cssValue,
    surfaceMuted: cssValue,
    ink: cssValue,
    inkSoft: cssValue,
    inkMuted: cssValue,
    divider: cssValue,
    success: cssValue,
    warning: cssValue,
    danger: cssValue,
    info: cssValue,
  })
  .strict();

export const biomeComponentsSchema = z
  .object({
    heroOverlay: cssValue.optional(),
    heroText: cssValue.optional(),
    surfaceGlass: cssValue.optional(),
    sectionAltBase: cssValue.optional(),
    sectionAltText: cssValue.optional(),
    sectionAltTextSoft: cssValue.optional(),
    sectionAltLink: cssValue.optional(),
    sectionAltLinkVisited: cssValue.optional(),
    sectionAltLinkHover: cssValue.optional(),
    sectionAltAccent: cssValue.optional(),
    statsBg: cssValue.optional(),
    footerBg: cssValue.optional(),
    footerText: cssValue.optional(),
    footerTextMuted: cssValue.optional(),
    cardBg: cssValue.optional(),
    cardBorder: cssValue.optional(),
    cta: cssValue.optional(),
    ctaHover: cssValue.optional(),
    ctaText: cssValue.optional(),
    surfaceAlt: cssValue.optional(),
    textSoftOnDark: cssValue.optional(),
    textInverse84: cssValue.optional(),
  })
  .strict()
  .optional();

export const biomeTypographySchema = z
  .object({
    headingFamily: cssValue,
    bodyFamily: cssValue,
    monoFamily: cssValue,
    scaleRatio: z.number().positive(),
    baseSize: cssValue,
    lineHeightBody: z.number().positive(),
    lineHeightHeading: z.number().positive(),
    measureBody: cssValue,
    measureHeading: cssValue,
    numericFeatures: cssValue,
  })
  .strict();

export const biomeSpacingSchema = z
  .object({
    base: cssValue,
    sectionPaddingY: cssValue,
    containerMaxWidth: cssValue,
    containerNarrow: cssValue.optional(),
    gutter: cssValue,
  })
  .strict();

export const biomeMotionSchema = z
  .object({
    durationFast: cssValue,
    durationMedium: cssValue,
    durationSlow: cssValue,
    easing: cssValue,
    reduceMotionRespect: z.boolean(),
  })
  .strict();

export const biomeGeometrySchema = z
  .object({
    diagramLineWeight: cssValue.optional(),
    diagramAccentColor: cssValue.optional(),
    decorativeAllowed: z.boolean(),
  })
  .strict();

// RFC-0098: shadows are visual-DNA — a "soft warm material" biome reads
// different elevation cues than a "trustworthy nonprofit" biome. Keys map
// 1:1 to the historical --ds-shadow-* studio defaults; biome wins when set.
export const biomeShadowsSchema = z
  .object({
    sm: cssValue.optional(),
    md: cssValue.optional(),
    lg: cssValue.optional(),
    xl: cssValue.optional(),
    glass: cssValue.optional(),
    glow: cssValue.optional(),
    header: cssValue.optional(),
    appeal: cssValue.optional(),
  })
  .strict()
  .optional();

// RFC-0098: gradients carry brand DNA (the previous studio defaults baked
// nicaragua-projekt brand RGB into --ds-gradient-primary / accent which is
// app-specific). Biome-scoped gradients keep the brand color where the brand
// is declared.
export const biomeGradientsSchema = z
  .object({
    accent: cssValue.optional(),
    primary: cssValue.optional(),
    vignetteDark: cssValue.optional(),
  })
  .strict()
  .optional();

export const biomeConstraintsSchema = z
  .object({
    forbidStockPhotoTags: z.array(z.string().min(1)).default([]),
    forbidPhrases: z.array(z.string().min(1)).default([]),
    enforceTabularNumeralsIn: z.array(z.string().min(1)).default([]),
  })
  .strict();

// RFC-0114: site-background layer schema mirrored from
// @warpgogol/share/schemas/site-background. Defined locally to avoid a
// cross-package import dependency (ontology must not depend on share).
const biomeSiteBackgroundLayerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("color"),
      color: cssValue.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("image"),
      imageName: z.string().min(1),
      fit: z.enum(["cover", "tile", "stretch-width", "stretch-height"]).optional(),
      quality: z.enum(["low", "mid", "high", "max"]).optional(),
      loading: z.enum(["eager", "lazy"]).optional(),
      tint: z
        .object({
          color: cssValue.optional(),
          opacity: z.number().min(0).max(1).optional(),
        })
        .strict()
        .optional(),
      parallax: z
        .object({
          speed: z.number().min(0).max(2).optional(),
          respectReducedMotion: z.boolean().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("gradient"),
      direction: z.enum(["vertical", "horizontal", "radial"]),
      stops: z
        .array(
          z
            .object({
              at: z.number().min(0).max(1),
              color: cssValue,
              opacity: z.number().min(0).max(1).optional(),
            })
            .strict(),
        )
        .min(2),
    })
    .strict(),
]);

export const biomeSiteBackgroundSchema = z
  .object({
    layers: z.array(biomeSiteBackgroundLayerSchema).min(1),
  })
  .strict();

// RFC-0371: biome-driven Fontsource CSS imports. Each entry declares a
// @fontsource/* package and the weights (and optional italic weights) the
// biome needs. fonts.imports.generate reads this to emit @import statements.
export const biomeFontEntrySchema = z
  .object({
    family: z.string().min(1),
    package: z.string().regex(/^@fontsource\//, "package must start with @fontsource/"),
    weights: z.array(z.number().int().positive()).min(1),
    italicWeights: z.array(z.number().int().positive()).optional(),
  })
  .strict();

export const biomeFontsSchema = z.array(biomeFontEntrySchema).optional();

export const biomeSchema = z
  .object({
    id: kebabId,
    version: semver,
    displayName: z.string().min(1),
    family: kebabId,
    provenance: biomeProvenanceSchema.optional(),
    axes: biomeAxesSchema,
    palette: biomePaletteSchema,
    components: biomeComponentsSchema,
    typography: biomeTypographySchema,
    spacing: biomeSpacingSchema,
    motion: biomeMotionSchema,
    geometry: biomeGeometrySchema,
    // RFC-0098: optional visual-DNA blocks promoted from studio tokens.
    shadows: biomeShadowsSchema,
    gradients: biomeGradientsSchema,
    // RFC-0114: optional site-background defaults. When absent, the deriver
    // (biome.site-background.derive) produces a sensible default from axes;
    // when present, it is used verbatim and onboarding.scaffold seeds the
    // new app's system.md shell.background from this block.
    siteBackground: biomeSiteBackgroundSchema.optional(),
    // RFC-0371: optional Fontsource CSS import declarations. When absent,
    // the biome relies on system font fallbacks only.
    fonts: biomeFontsSchema,
    constraints: biomeConstraintsSchema,
  })
  .strict();

export type BiomeProvenance = z.infer<typeof biomeProvenanceSchema>;
export type BiomeAxes = z.infer<typeof biomeAxesSchema>;
export type BiomePalette = z.infer<typeof biomePaletteSchema>;
export type BiomeComponents = z.infer<typeof biomeComponentsSchema>;
export type BiomeTypography = z.infer<typeof biomeTypographySchema>;
export type BiomeSpacing = z.infer<typeof biomeSpacingSchema>;
export type BiomeMotion = z.infer<typeof biomeMotionSchema>;
export type BiomeGeometry = z.infer<typeof biomeGeometrySchema>;
export type BiomeShadows = z.infer<typeof biomeShadowsSchema>;
export type BiomeGradients = z.infer<typeof biomeGradientsSchema>;
export type BiomeConstraints = z.infer<typeof biomeConstraintsSchema>;
export type BiomeSiteBackground = z.infer<typeof biomeSiteBackgroundSchema>;
export type BiomeFontEntry = z.infer<typeof biomeFontEntrySchema>;
export type BiomeFontsConfig = z.infer<typeof biomeFontsSchema>;
export type Biome = z.infer<typeof biomeSchema>;
