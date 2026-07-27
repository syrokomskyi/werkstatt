/*
<MODULE_CONTRACT>
<purpose>
Implements RFC-0071 biome.tokens.derive.
Derives deterministic palette, typography, spacing, motion, and geometry defaults
from a biome axes block or a full biome YAML, with optional in-place write.
</purpose>
<non-goals>
  <item>Do not choose axes from research materials; workflows do that.</item>
  <item>Do not modify app system manifests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0071: Add deterministic biome token derivation command.</item>
</CHANGE_SUMMARY>
*/

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { readYamlFile } from "@gogol/share/fs";
import {
  biomeAxesSchema,
  biomeSchema,
  type Biome,
  type BiomeAxes,
  type BiomeSiteBackground,
} from "@gogol/ontology";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

interface BiomeDeriveData {
  command: "biome.tokens.derive";
  target?: string;
  wroteFile: boolean;
  biomeId?: string;
}

const TYPOGRAPHY_PAIRS = {
  sharp: {
    headingFamily: "'Inter Display', system-ui, sans-serif",
    bodyFamily: "'IBM Plex Sans', system-ui, sans-serif",
  },
  balanced: {
    headingFamily: "'Inter Display', system-ui, sans-serif",
    bodyFamily: "'Inter', system-ui, sans-serif",
  },
  soft: {
    headingFamily: "'Source Serif 4', Georgia, serif",
    bodyFamily: "'Inter', system-ui, sans-serif",
  },
} as const;

function deriveBaseBrand(axes: BiomeAxes): string {
  if (axes.warmth === "cool") return "#2F5E8A";
  if (axes.warmth === "neutral") return "#5F625C";
  return "#7A4A2A";
}

function deriveAccent(axes: BiomeAxes): string {
  if (axes.warmth === "cool") return "#1E4D6B";
  if (axes.warmth === "neutral") return "#3F4A46";
  return "#1E4D3B";
}

function deriveSurface(axes: BiomeAxes): string {
  if (axes.warmth === "cool") return "#EEF4F8";
  if (axes.warmth === "neutral") return "#F4F3EF";
  return "#F5EDE2";
}

function deriveInk(axes: BiomeAxes): string {
  if (axes.contrast === "high") return "#111111";
  if (axes.contrast === "low") return "#2B2B2B";
  return "#1A1A1A";
}

// Density → spacing & section padding
const DENSITY_SECTION_PADDING_Y = {
  dense: "clamp(32px, 4vw, 64px)",
  comfortable: "clamp(48px, 6vw, 96px)",
  airy: "clamp(64px, 8vw, 128px)",
} as const;
const DENSITY_SPACING_BASE = { dense: "6px", comfortable: "8px", airy: "10px" } as const;
const DENSITY_GUTTER = {
  dense: "clamp(12px, 1.5vw, 24px)",
  comfortable: "clamp(16px, 2vw, 32px)",
  airy: "clamp(20px, 2.5vw, 40px)",
} as const;
const DENSITY_CONTAINER_MAX = {
  dense: "1120px",
  comfortable: "1180px",
  airy: "1240px",
} as const;

// Density → typography baseSize, line-heights, measures
const DENSITY_BASE_SIZE = {
  dense: "16px",
  comfortable: "17px",
  airy: "18px",
} as const;
const DENSITY_LINE_HEIGHT_BODY = { dense: 1.5, comfortable: 1.6, airy: 1.7 } as const;
const DENSITY_LINE_HEIGHT_HEADING = { dense: 1.1, comfortable: 1.15, airy: 1.2 } as const;
const DENSITY_MEASURE_BODY = { dense: "62ch", comfortable: "68ch", airy: "74ch" } as const;
const DENSITY_MEASURE_HEADING = { dense: "24ch", comfortable: "26ch", airy: "28ch" } as const;

// Motion stance → durations + easing
const MOTION_DURATIONS = {
  static: { fast: "0ms", medium: "0ms", slow: "0ms" },
  restrained: { fast: "120ms", medium: "200ms", slow: "360ms" },
  expressive: { fast: "160ms", medium: "260ms", slow: "420ms" },
} as const;
const MOTION_EASING = {
  static: "linear",
  restrained: "cubic-bezier(0.2, 0.0, 0.0, 1.0)",
  expressive: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

// Typography sharpness → scale ratio
const SCALE_RATIO = { sharp: 1.18, balanced: 1.2, soft: 1.22 } as const;

// Diagram presence → line weight
const DIAGRAM_LINE_WEIGHT = {
  absent: undefined,
  minimal: "0.75px",
  supportive: "1px",
  central: "1.25px",
} as const;

// RFC-0114 + RFC-0129 step 1: derive a default siteBackground block from the
// biome axes. The mapping follows RFC-0114 §"Deriver behaviour":
//   decorativeAllowed=false + photoStance ∈ {none, founder-only} + motionStance=static
//     → one solid color layer (--ds-color-bg fallback).
//   decorativeAllowed=false + photoStance=documentary + motionStance=restrained
//     → color + subtle vignetteDark vertical gradient.
//   decorativeAllowed=true  + photoStance=editorial    + motionStance=expressive
//     → color + accent-tinted vertical gradient.
//   Default: single color layer.
export function deriveSiteBackground(axes: BiomeAxes): BiomeSiteBackground {
  const decorativeAllowed = axes.photoStance === "editorial";
  const ink = deriveInk(axes);
  const surface = deriveSurface(axes);
  const accent = deriveAccent(axes);

  // expressive + editorial: color + accent gradient
  if (decorativeAllowed && axes.motionStance === "expressive") {
    return {
      layers: [
        { kind: "color", color: surface },
        {
          kind: "gradient",
          direction: "vertical",
          stops: [
            { at: 0, color: surface, opacity: 0 },
            { at: 1, color: accent, opacity: 0.12 },
          ],
        },
      ],
    };
  }
  // restrained + documentary: color + subtle vignette
  if (axes.photoStance === "documentary" && axes.motionStance !== "static") {
    return {
      layers: [
        { kind: "color", color: surface },
        {
          kind: "gradient",
          direction: "vertical",
          stops: [
            { at: 0, color: surface, opacity: 0 },
            { at: 1, color: ink, opacity: 0.08 },
          ],
        },
      ],
    };
  }
  // Default + static / founder-only / none: single color layer.
  return { layers: [{ kind: "color", color: surface }] };
}

export function deriveBiomeFields(
  axes: BiomeAxes,
): Pick<Biome, "palette" | "typography" | "spacing" | "motion" | "geometry" | "siteBackground"> {
  const typographyPair = TYPOGRAPHY_PAIRS[axes.typographySharpness];

  return {
    palette: {
      brand: deriveBaseBrand(axes),
      brandHover:
        axes.warmth === "warm" ? "#693D20" : axes.warmth === "cool" ? "#274F75" : "#4F514C",
      brandContrast: "#FFFFFF",
      accent: deriveAccent(axes),
      surface: deriveSurface(axes),
      surfaceMuted:
        axes.warmth === "warm" ? "#EAE0D2" : axes.warmth === "cool" ? "#E1ECF3" : "#E9E7E1",
      ink: deriveInk(axes),
      inkSoft:
        axes.contrast === "high" ? "#252220" : axes.contrast === "low" ? "#4A4744" : "#3C3633",
      inkMuted:
        axes.contrast === "high" ? "#5F5854" : axes.contrast === "low" ? "#8A8079" : "#7A7066",
      divider: axes.warmth === "warm" ? "#D6CDBF" : axes.warmth === "cool" ? "#C9D7E3" : "#D4D2CB",
      success: "#2E7D4F",
      warning: "#B07A1A",
      danger: "#A4332B",
      info: "#385E8C",
    },
    typography: {
      headingFamily: typographyPair.headingFamily,
      bodyFamily: typographyPair.bodyFamily,
      monoFamily: "'JetBrains Mono', ui-monospace, monospace",
      scaleRatio: SCALE_RATIO[axes.typographySharpness],
      baseSize: DENSITY_BASE_SIZE[axes.density],
      lineHeightBody: DENSITY_LINE_HEIGHT_BODY[axes.density],
      lineHeightHeading: DENSITY_LINE_HEIGHT_HEADING[axes.density],
      measureBody: DENSITY_MEASURE_BODY[axes.density],
      measureHeading: DENSITY_MEASURE_HEADING[axes.density],
      numericFeatures: "tnum, lnum",
    },
    spacing: {
      base: DENSITY_SPACING_BASE[axes.density],
      sectionPaddingY: DENSITY_SECTION_PADDING_Y[axes.density],
      containerMaxWidth: DENSITY_CONTAINER_MAX[axes.density],
      gutter: DENSITY_GUTTER[axes.density],
    },
    motion: {
      durationFast: MOTION_DURATIONS[axes.motionStance].fast,
      durationMedium: MOTION_DURATIONS[axes.motionStance].medium,
      durationSlow: MOTION_DURATIONS[axes.motionStance].slow,
      easing: MOTION_EASING[axes.motionStance],
      reduceMotionRespect: true,
    },
    geometry: {
      diagramLineWeight: DIAGRAM_LINE_WEIGHT[axes.diagramPresence],
      diagramAccentColor: axes.diagramPresence === "absent" ? undefined : deriveAccent(axes),
      decorativeAllowed: axes.photoStance === "editorial",
    },
    siteBackground: deriveSiteBackground(axes),
  };
}

function deepMergeBiome(base: Biome, derived: ReturnType<typeof deriveBiomeFields>): Biome {
  return {
    ...base,
    palette: { ...derived.palette, ...base.palette },
    typography: { ...derived.typography, ...base.typography },
    spacing: { ...derived.spacing, ...base.spacing },
    motion: { ...derived.motion, ...base.motion },
    geometry: { ...derived.geometry, ...base.geometry },
    // RFC-0114: base wins entirely if it already declares siteBackground.
    siteBackground: base.siteBackground ?? derived.siteBackground,
  };
}

export async function runBiomeTokensDerive(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BiomeDeriveData>> {
  const axesFlag = input.flags.axes as string | undefined;
  const biomeFlag = input.flags.biome as string | undefined;
  const outFlag = input.flags.out as string | undefined;
  const inplace = input.flags.inplace === true;

  const axesPath = axesFlag ? join(context.workspaceRoot, axesFlag) : undefined;
  const biomePath = biomeFlag
    ? join(context.workspaceRoot, biomeFlag)
    : outFlag
      ? join(context.workspaceRoot, outFlag)
      : undefined;

  let biome: Biome | undefined;
  let axes: BiomeAxes | undefined;

  if (biomePath) {
    const parsedBiome = biomeSchema.safeParse(await readYamlFile(biomePath));
    if (parsedBiome.success) {
      biome = parsedBiome.data;
      axes = biome.axes;
    }
  }

  if (!axes && axesPath) {
    const parsedAxesSource = await readYamlFile(axesPath);
    const parsedAxes = biomeAxesSchema.safeParse(
      typeof parsedAxesSource === "object" &&
        parsedAxesSource &&
        "axes" in (parsedAxesSource as Record<string, unknown>)
        ? (parsedAxesSource as Record<string, unknown>).axes
        : parsedAxesSource,
    );
    if (!parsedAxes.success) {
      return {
        data: { command: "biome.tokens.derive", target: axesFlag, wroteFile: false },
        exitCode: 1,
        summary: `biome.tokens.derive: invalid axes input`,
      };
    }
    axes = parsedAxes.data;
  }

  if (!axes) {
    return {
      data: { command: "biome.tokens.derive", wroteFile: false },
      exitCode: 1,
      summary: "biome.tokens.derive: provide --axes <file> or --biome <file>",
    };
  }

  const derived = deriveBiomeFields(axes);
  const finalBiome = biome ? deepMergeBiome(biome, derived) : undefined;
  const target = inplace ? biomePath : outFlag ? join(context.workspaceRoot, outFlag) : undefined;

  if (target) {
    const payload = finalBiome ?? derived;
    await writeFile(target, YAML.stringify(payload), "utf8");
  }

  return {
    data: {
      command: "biome.tokens.derive",
      target: target ? target.replace(`${context.workspaceRoot}\\`, "") : undefined,
      wroteFile: Boolean(target),
      biomeId: finalBiome?.id,
    },
    exitCode: 0,
    summary: `biome.tokens.derive: ${target ? "wrote derived biome data" : "derived values ready"}`,
  };
}

// RFC-0114 + RFC-0117 + RFC-0129 step 2: narrower deriver that only computes
// the siteBackground block. Useful when the biome already has palette and
// typography but missed the new block from RFC-0114.
interface BiomeSiteBackgroundDeriveData {
  command: "biome.site-background.derive";
  target?: string;
  wroteFile: boolean;
  biomeId?: string;
}

export async function runBiomeSiteBackgroundDerive(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BiomeSiteBackgroundDeriveData>> {
  const biomeFlag = input.flags.biome as string | undefined;
  const outFlag = input.flags.out as string | undefined;
  const inplace = input.flags.inplace === true;

  if (!biomeFlag) {
    return {
      data: { command: "biome.site-background.derive", wroteFile: false },
      exitCode: 1,
      summary: "biome.site-background.derive: provide --biome <file>",
    };
  }

  const biomePath = join(context.workspaceRoot, biomeFlag);
  const parsedBiome = biomeSchema.safeParse(await readYamlFile(biomePath));
  if (!parsedBiome.success) {
    return {
      data: { command: "biome.site-background.derive", target: biomeFlag, wroteFile: false },
      exitCode: 1,
      summary: `biome.site-background.derive: invalid biome file ${biomeFlag}`,
    };
  }

  const biome = parsedBiome.data;
  // Honour the same precedence rule as biome.tokens.derive: if the biome
  // already declares siteBackground, leave it untouched (RFC-0114 §"Deriver
  // behaviour" item 1).
  const next = biome.siteBackground
    ? biome
    : { ...biome, siteBackground: deriveSiteBackground(biome.axes) };
  const target = inplace ? biomePath : outFlag ? join(context.workspaceRoot, outFlag) : undefined;

  if (target) {
    await writeFile(target, YAML.stringify(next), "utf8");
  }

  return {
    data: {
      command: "biome.site-background.derive",
      target: target ? target.replace(`${context.workspaceRoot}\\`, "") : undefined,
      wroteFile: Boolean(target),
      biomeId: next.id,
    },
    exitCode: 0,
    summary: `biome.site-background.derive: ${target ? "wrote siteBackground block" : "derived siteBackground ready"}`,
  };
}
