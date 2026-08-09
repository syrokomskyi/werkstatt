/*
<MODULE_CONTRACT>
<purpose>Biome YAML loading, color lightness estimation, dark-surface intent detection, and token resolution helpers for RFC-0201 biome token validation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from biome-tokens.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { TOKEN_NAME_SET } from "@warpgogol/werkstatt-site/tokens";
import { fileExists } from "../lib/file-exists.ts";
import { extractCssDefinitions } from "./css-utils.ts";
import {
  DARK_SURFACE_CONTRAST_TOKENS,
  LIGHT_SURFACE_THRESHOLD,
  type BiomeTokenResolution,
} from "./types.ts";

// Load biome YAML
export async function loadBiomeYaml(
  biomesDir: string,
  biomeId: string,
): Promise<Record<string, unknown> | null> {
  const yamlPath = join(biomesDir, `${biomeId}.yaml`);
  if (!(await fileExists(yamlPath))) return null;
  try {
    const content = await readFile(yamlPath, "utf-8");
    return parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Check if biome is light
export function isLightBiome(biome: Record<string, unknown>): boolean {
  const axes = biome.axes as Record<string, string> | undefined;
  if (axes?.textContrast) {
    const contrast = axes.textContrast.toLowerCase();
    if (contrast === "light-surface" || contrast === "aa" || contrast === "aaa") return true;
    if (contrast === "dark-surface") return false;
  }
  const palette = biome.palette as Record<string, string> | undefined;
  const surface = palette?.surface;
  if (surface) {
    const lightness = estimateColorLightness(surface);
    if (lightness !== null) return lightness > LIGHT_SURFACE_THRESHOLD;
  }
  return true;
}

// Estimate color lightness
export function estimateColorLightness(color: string): number | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    let r: number, g: number, b: number;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    } else {
      return null;
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return null;
}

// Check if token has dark surface intent
export function hasDarkSurfaceIntent(token: string): boolean {
  if (DARK_SURFACE_CONTRAST_TOKENS.has(token)) return true;
  if (token.endsWith("-on-dark")) return true;
  if (token.includes("text-inverse")) return true;
  return false;
}

// Resolve token to source
export async function resolveToken(
  token: string,
  biomeId: string,
  appStylesDir: string,
): Promise<BiomeTokenResolution> {
  const generatedCssPath = join(appStylesDir, "biome.generated.css");
  if (await fileExists(generatedCssPath)) {
    try {
      const cssContent = await readFile(generatedCssPath, "utf-8");
      const definitions = extractCssDefinitions(cssContent);
      if (definitions.has(token)) {
        return { biomeId, token, source: "generated-biome-css", value: definitions.get(token) };
      }
    } catch {
      // Continue
    }
  }
  if (TOKEN_NAME_SET.has(token)) {
    return { biomeId, token, source: "tokens-default" };
  }
  return { biomeId, token, source: "missing" };
}
