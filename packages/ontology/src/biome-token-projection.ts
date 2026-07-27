/*
<MODULE_CONTRACT>
<purpose>
Single source of truth for the biome-YAML-field to --ds-* CSS custom property
projection (RFC-0071). Consumed by biome.css.generate (codegen), biome.contract.validate
(contract check), and biome.tokens.validate (drift detection). Replaces three
divergent copies of the same mapping.
</purpose>
<non-goals>
  <item>Do not validate token names against @warpgogol/tokens — that is the checks package's job.</item>
  <item>Do not format CSS for emission — callers handle formatting.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: consolidated BIOME_TO_TOKEN_MAP, BIOME_TO_CSS_VAR, and buildExpectedBiomeCss into one projection.</item>
</CHANGE_SUMMARY>
*/

// ---------------------------------------------------------------------------
// Primary mapping: biome dotted field path to CSS custom property name
// ---------------------------------------------------------------------------

export const BIOME_TO_TOKEN_MAP = {
  // Palette — semantic color slots (RFC-0071)
  "palette.brand": "--ds-color-primary",
  "palette.brandHover": "--ds-color-secondary",
  "palette.brandContrast": "--ds-color-text-inverse",
  "palette.accent": "--ds-color-accent",
  "palette.surface": "--ds-color-bg",
  "palette.surfaceMuted": "--ds-color-surface",
  "palette.ink": "--ds-color-text",
  "palette.inkSoft": "--ds-color-text-muted",
  "palette.inkMuted": "--ds-color-text-quiet",
  "palette.divider": "--ds-color-border",
  "palette.success": "--ds-color-success",
  "palette.warning": "--ds-color-warning-strong",
  "palette.danger": "--ds-color-danger",
  "palette.info": "--ds-color-info",
  // Components
  "components.heroOverlay": "--ds-color-hero-overlay",
  "components.heroText": "--ds-color-hero-text",
  "components.surfaceGlass": "--ds-color-surface-glass",
  "components.sectionAltBase": "--ds-color-section-alt-base",
  "components.sectionAltText": "--ds-color-section-alt-text",
  "components.sectionAltTextSoft": "--ds-color-section-alt-text-soft",
  "components.sectionAltLink": "--ds-color-section-alt-link",
  "components.sectionAltLinkVisited": "--ds-color-section-alt-link-visited",
  "components.sectionAltLinkHover": "--ds-color-section-alt-link-hover",
  "components.sectionAltAccent": "--ds-color-section-alt-accent",
  "components.statsBg": "--ds-color-stats-bg",
  "components.footerBg": "--ds-color-footer-bg",
  "components.footerText": "--ds-color-footer-text",
  "components.footerTextMuted": "--ds-color-footer-text-muted",
  "components.cardBg": "--ds-color-card-bg",
  "components.cardBorder": "--ds-color-card-border",
  "components.cta": "--ds-color-cta",
  "components.ctaHover": "--ds-color-cta-hover",
  "components.ctaText": "--ds-color-cta-text",
  "components.surfaceAlt": "--ds-color-surface-alt",
  "components.textSoftOnDark": "--ds-color-text-soft-on-dark",
  "components.textInverse84": "--ds-color-text-inverse-84",
  "components.surfaceHover": "--ds-color-surface-hover",
  "components.surfaceRaised": "--ds-color-surface-raised",
  "components.accentContrast": "--ds-color-accent-contrast",
  "components.accentHover": "--ds-color-accent-hover",
  "components.bodyBg": "--ds-color-bg",
  // Typography — full family + scale (RFC-0071 expansion)
  "typography.headingFamily": "--ds-font-heading",
  "typography.bodyFamily": "--ds-font-body",
  "typography.monoFamily": "--ds-font-mono",
  "typography.baseSize": "--ds-text-base",
  "typography.lineHeightBody": "--ds-line-height-body",
  "typography.lineHeightHeading": "--ds-line-height-heading",
  "typography.lineHeightRelaxed": "--ds-line-height-relaxed",
  "typography.measureBody": "--ds-size-container-measure-body",
  "typography.measureHeading": "--ds-size-container-measure-heading",
  // Spacing — base + layout (RFC-0071)
  "spacing.base": "--ds-space-4",
  "spacing.sectionPaddingY": "--ds-size-section-padding-y",
  "spacing.containerMaxWidth": "--ds-size-container-max",
  "spacing.containerNarrow": "--ds-size-container-narrow",
  "spacing.gutter": "--ds-size-section-padding-x",
  // Motion — duration set + easing (RFC-0071 expansion)
  "motion.durationFast": "--ds-duration-fast",
  "motion.durationMedium": "--ds-duration-medium",
  "motion.durationSlow": "--ds-duration-slow",
  "motion.easing": "--ds-ease-biome",
  // Axes that surface as live tokens
  "axes.cornerRadius": "--ds-radius-xs",
  "axes.cornerRadiusFull": "--ds-radius-full",
  "axes.borderWeight": "--ds-border-1",
  // Font weights
  "fontWeights.bold": "--ds-font-weight-bold",
  // Geometry — diagram styling (RFC-0071)
  "geometry.diagramLineWeight": "--ds-border-diagram-line",
  "geometry.diagramAccentColor": "--ds-color-accent",
  // RFC-0098: biome-scoped shadows (override studio defaults from tokens.css)
  "shadows.sm": "--ds-shadow-sm",
  "shadows.md": "--ds-shadow-md",
  "shadows.lg": "--ds-shadow-lg",
  "shadows.xl": "--ds-shadow-xl",
  "shadows.glass": "--ds-shadow-glass",
  "shadows.glow": "--ds-shadow-glow",
  "shadows.header": "--ds-shadow-header",
  "shadows.appeal": "--ds-shadow-appeal",
  // RFC-0098: biome-scoped gradients (brand-derived; studio fallback is uncolored)
  "gradients.accent": "--ds-gradient-accent",
  "gradients.primary": "--ds-gradient-primary",
  "gradients.vignetteDark": "--ds-gradient-vignette-dark",
} as const satisfies Record<string, string>;

// ---------------------------------------------------------------------------
// Alias entries: one biome field produces an additional CSS var beyond the primary
// ---------------------------------------------------------------------------

export interface BiomeTokenAlias {
  field: string;
  token: string;
}

export const BIOME_TOKEN_ALIASES: readonly BiomeTokenAlias[] = [
  { field: "palette.ink", token: "--ds-color-text-primary" },
  { field: "palette.inkSoft", token: "--ds-color-text-secondary" },
  { field: "typography.lineHeightBody", token: "--ds-line-height-normal" },
  { field: "spacing.base", token: "--ds-size-1" },
  { field: "axes.cornerRadius", token: "--ds-radius-md" },
];

// ---------------------------------------------------------------------------
// Derived entries: computed from multiple biome fields
// ---------------------------------------------------------------------------

export interface BiomeTokenDerived {
  token: string;
  compute: (biome: Record<string, unknown>) => string | undefined;
}

export const BIOME_TOKEN_DERIVED: readonly BiomeTokenDerived[] = [
  {
    token: "--ds-text-sm",
    compute: (biome) => {
      const t = biome.typography as Record<string, string | number> | undefined;
      if (!t?.baseSize || !t?.scaleRatio) return undefined;
      const base = parseFloat(String(t.baseSize));
      const ratio = parseFloat(String(t.scaleRatio));
      if (isNaN(base) || isNaN(ratio)) return undefined;
      return `${(base / ratio).toFixed(2)}px`;
    },
  },
  {
    token: "--ds-text-lg",
    compute: (biome) => {
      const t = biome.typography as Record<string, string | number> | undefined;
      if (!t?.baseSize || !t?.scaleRatio) return undefined;
      const base = parseFloat(String(t.baseSize));
      const ratio = parseFloat(String(t.scaleRatio));
      if (isNaN(base) || isNaN(ratio)) return undefined;
      return `${(base * ratio).toFixed(2)}px`;
    },
  },
  {
    token: "--ds-text-xl",
    compute: (biome) => {
      const t = biome.typography as Record<string, string | number> | undefined;
      if (!t?.baseSize || !t?.scaleRatio) return undefined;
      const base = parseFloat(String(t.baseSize));
      const ratio = parseFloat(String(t.scaleRatio));
      if (isNaN(base) || isNaN(ratio)) return undefined;
      return `${(base * ratio * ratio).toFixed(2)}px`;
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a value from a nested biome object using a dotted path like "palette.brand". */
export function getBiomeField(biome: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>((obj, key) => {
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
  }, biome);
}

/**
 * Project a parsed biome object into a Map of token name to value.
 *
 * Iterates the primary mapping, then aliases, then derived entries.
 * Only includes tokens whose source field is present in the biome.
 */
export function projectBiomeToTokens(biome: Record<string, unknown>): Map<string, string> {
  const result = new Map<string, string>();

  for (const [field, token] of Object.entries(BIOME_TO_TOKEN_MAP)) {
    const value = getBiomeField(biome, field);
    if (value !== undefined && value !== null) {
      result.set(token, String(value));
    }
  }

  for (const { field, token } of BIOME_TOKEN_ALIASES) {
    const value = getBiomeField(biome, field);
    if (value !== undefined && value !== null) {
      result.set(token, String(value));
    }
  }

  for (const { token, compute } of BIOME_TOKEN_DERIVED) {
    const value = compute(biome);
    if (value !== undefined) {
      result.set(token, value);
    }
  }

  return result;
}

/**
 * All token names produced by the projection (primary + aliases + derived).
 * Used by biome.contract.validate to check that every mapped token exists in
 * the @warpgogol/tokens TOKEN_NAME_SET.
 */
export function getAllProjectedTokenNames(): readonly string[] {
  const names = new Set<string>();
  for (const token of Object.values(BIOME_TO_TOKEN_MAP)) names.add(token);
  for (const { token } of BIOME_TOKEN_ALIASES) names.add(token);
  for (const { token } of BIOME_TOKEN_DERIVED) names.add(token);
  return [...names];
}
