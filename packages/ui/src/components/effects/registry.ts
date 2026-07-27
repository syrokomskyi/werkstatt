/*
<MODULE_CONTRACT>
<purpose>
RFC-0151 effect-kind registry. Single source of truth that turns a resolved
effect stack into the CSS classes and custom properties that render it. Both
EffectHost (surface strategy) and SectionHeader (text strategy) consume this —
no per-component or per-kind branching lives in the components themselves.
</purpose>
<non-goals>
  <item>Do not resolve target assignments — callers pass the already-resolved stack.</item>
  <item>Do not own DOM structure — components decide whether to wrap or apply in place.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0151: introduces the effect-kind registry and shared presentation composer.</item>
</CHANGE_SUMMARY>
*/

import {
  EFFECT_KIND_META,
  type Effect,
  type EffectColor,
  type EffectKind,
  type EffectRenderStrategy,
} from "@gogol/share/schemas/effects";

/** RFC-0151 — resolve a color alias to a biome token var(); pass raw values through. */
export function resolveEffectColor(color: EffectColor | undefined, fallback: string): string {
  switch (color) {
    case undefined:
      return fallback;
    case "text":
      return "var(--ds-color-text)";
    case "primary":
      return "var(--ds-color-primary)";
    case "accent":
      return "var(--ds-color-accent)";
    case "shadow":
      return "var(--ds-color-shadow)";
    case "surface":
      return "var(--ds-color-surface)";
    case "inverse":
      return "var(--ds-color-text-inverse)";
    default:
      return color;
  }
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function mix(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${pct(opacity)}, transparent)`;
}

interface EffectContribution {
  classes?: string[];
  vars?: Record<string, string>;
  /** Layers merged into one combined --effect-text-shadow chain (text strategy). */
  shadowLayers?: string[];
}

type EffectRenderer = (effect: Effect) => EffectContribution;

const RENDERERS: Record<EffectKind, EffectRenderer> = {
  glass: (effect) => {
    if (effect.kind !== "glass") return {};
    const blur = effect.blur ?? 16;
    const saturate = effect.saturate ?? 180;
    const tintOpacity = effect.tintOpacity ?? 0.6;
    const tint = resolveEffectColor(effect.tint, "var(--ds-color-surface)");
    const classes = ["effect-host--glass"];
    if (effect.border === "none") classes.push("effect-host--glass-border-none");
    return {
      classes,
      vars: {
        "--effect-glass-blur": `${blur}px`,
        "--effect-glass-saturate": `${saturate}%`,
        "--effect-glass-tint": tint,
        "--effect-glass-tint-opacity": `${tintOpacity}`,
      },
    };
  },

  shadow: (effect) => {
    if (effect.kind !== "shadow") return {};
    const x = effect.offsetX ?? 0;
    const y = effect.offsetY ?? 2;
    const blur = effect.blur ?? 6;
    const color = resolveEffectColor(effect.color, "var(--ds-color-shadow)");
    const opacity = effect.opacity ?? 0.35;
    return { shadowLayers: [`${x}px ${y}px ${blur}px ${mix(color, opacity)}`] };
  },

  glow: (effect) => {
    if (effect.kind !== "glow") return {};
    const blur = effect.blur ?? 18;
    const color = resolveEffectColor(effect.color, "var(--ds-color-accent)");
    const opacity = effect.opacity ?? 0.5;
    return { shadowLayers: [`0 0 ${blur}px ${mix(color, opacity)}`] };
  },

  bulge: (effect) => {
    if (effect.kind !== "bulge") return {};
    const depth = effect.depth ?? 1;
    const shade = effect.shade ?? 0.4;
    const highlight = effect.highlight ?? 0.5;
    const shadowColor = resolveEffectColor(effect.shadowColor, "black");
    const highlightColor = resolveEffectColor(effect.highlightColor, "white");
    return {
      shadowLayers: [
        `0 ${depth}px 0 ${mix(shadowColor, shade)}`,
        `0 ${-depth}px 0 ${mix(highlightColor, highlight)}`,
      ],
    };
  },

  tilt: (effect) => {
    if (effect.kind !== "tilt") return {};
    const rotate = effect.rotate ?? 0;
    const skewX = effect.skewX ?? 0;
    return {
      classes: ["effect-text--tilt"],
      vars: {
        "--effect-tilt-rotate": `${rotate}deg`,
        "--effect-tilt-skew": `${skewX}deg`,
      },
    };
  },
};

export interface EffectPresentation {
  classes: string[];
  vars: Record<string, string>;
}

/**
 * RFC-0151 — compose an ordered effect stack into one presentation for the
 * given render strategy. Enabled effects whose registered strategy matches are
 * applied in author order; later effects win on var collisions; classes
 * accumulate; shadow-family layers merge into one truthful text-shadow chain.
 */
export function composeEffectPresentation(
  stack: readonly Effect[] | undefined,
  strategy: EffectRenderStrategy,
): EffectPresentation {
  const classes: string[] = [];
  const vars: Record<string, string> = {};
  const shadowLayers: string[] = [];

  for (const effect of stack ?? []) {
    if (!effect.enabled) continue;
    if (EFFECT_KIND_META[effect.kind].strategy !== strategy) continue;
    const contribution = RENDERERS[effect.kind](effect);
    if (contribution.classes) classes.push(...contribution.classes);
    if (contribution.vars) Object.assign(vars, contribution.vars);
    if (contribution.shadowLayers) shadowLayers.push(...contribution.shadowLayers);
  }

  if (shadowLayers.length > 0) {
    classes.push("effect-text--shadow-stack");
    vars["--effect-text-shadow"] = shadowLayers.join(", ");
  }

  return { classes, vars };
}

/** RFC-0151 — serialize composed CSS vars into an inline style string. */
export function effectVarsToStyle(vars: Record<string, string>): string | undefined {
  const entries = Object.entries(vars);
  if (entries.length === 0) return undefined;
  return entries.map(([key, value]) => `${key}: ${value};`).join(" ");
}
