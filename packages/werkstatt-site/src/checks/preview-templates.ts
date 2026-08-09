/*
<MODULE_CONTRACT>
<purpose>Template-driven OG preview PNG generation using sharp SVG rasterization.
Generates 1200x630 social preview images with brand-aware design tokens.</purpose>
<non-goals>
  <item>Do not embed per-app rendering logic; templates are generic and token-driven.</item>
  <item>Do not write files; return Buffer for the caller to write.</item>
  <item>Do not load fonts from the network or OS-specific paths.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0155: backfill MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>RFC-0603: deterministic PNG encoding — disable adaptiveFiltering, remove redundant resize, set palette: false.</item>
</CHANGE_SUMMARY>
*/

import sharp from "sharp";
import { normalizeText, type NormalizeConfig } from "@warpgogol/werkstatt-site/share/text-normalize";

export interface PreviewTemplateInput {
  pageTitle: string;
  pageDescription?: string;
  siteName: string;
  siteTagline?: string;
  lang: string;
  /** Background surface color */
  brandSurface?: string;
  /** Primary text color */
  brandInk?: string;
  /** Accent / CTA color */
  brandAccent?: string;
  /**
   * RFC-0235: egress text normalization config. Applied to every rendered text
   * string before rasterization — a dist sweep cannot reach pixels, so OG cards
   * are normalized at the source string here.
   */
  normalize?: NormalizeConfig;
}

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/* Fallback palette when no biome is declared */
const DEFAULT_SURFACE = "#F4F2EE";
const DEFAULT_INK = "#1B1D22";
const DEFAULT_ACCENT = "#E39A24";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if ((current + " " + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.length ? lines : [text];
}

function buildBrandCardSvg(input: PreviewTemplateInput): string {
  const surface = input.brandSurface || DEFAULT_SURFACE;
  const ink = input.brandInk || DEFAULT_INK;
  const accent = input.brandAccent || DEFAULT_ACCENT;

  // RFC-0235: normalize every text string before rasterization (pixels are
  // unreachable by the post-build dist sweep). No-op when no config is supplied.
  const norm = (s: string): string => (input.normalize ? normalizeText(s, input.normalize) : s);

  // Compute a slightly muted surface for the gradient end
  const mutedSurface = surface;

  const titleLines = wrapText(norm(input.pageTitle), 32).slice(0, 3);
  const descLines = input.pageDescription
    ? wrapText(norm(input.pageDescription), 70).slice(0, 2)
    : [];

  const titleYStart = 200;
  const titleLineHeight = 64;
  const titleEls = titleLines
    .map((line, i) => {
      const y = titleYStart + i * titleLineHeight;
      return `<text x="80" y="${y}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="52" font-weight="700" fill="${ink}">${escapeXml(line)}</text>`;
    })
    .join("");

  const descYStart = titleYStart + titleLines.length * titleLineHeight + 30;
  const descEls = descLines
    .map((line, i) => {
      const y = descYStart + i * 38;
      return `<text x="80" y="${y}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="26" font-weight="400" fill="${ink}" opacity="0.75">${escapeXml(line)}</text>`;
    })
    .join("");

  const siteLabel = norm(input.siteName || "");
  // The literal " — " separator is itself an AI signal source; normalize the
  // assembled string so a hyphen replaces it when the `dashes` signal is on.
  const tagline = input.siteTagline ? norm(` — ${input.siteTagline}`) : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${surface}"/>
      <stop offset="100%" stop-color="${mutedSurface}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="8" height="100%" fill="${accent}"/>
  ${titleEls}
  ${descEls}
  <rect x="80" y="${OG_HEIGHT - 110}" width="60" height="4" fill="${accent}" rx="2"/>
  <text x="80" y="${OG_HEIGHT - 64}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="600" fill="${ink}">${escapeXml(siteLabel)}</text>
  <text x="80" y="${OG_HEIGHT - 36}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="16" font-weight="400" fill="${ink}" opacity="0.6">${escapeXml(tagline)}</text>
</svg>`;
}

/**
 * Generate a PNG buffer from the brand-card template.
 */
export async function generateBrandCardPng(input: PreviewTemplateInput): Promise<Buffer> {
  const svg = buildBrandCardSvg(input);
  // RFC-0603: deterministic PNG encoding — no adaptiveFiltering, no palette
  // quantization, no redundant resize pass. The SVG is already at 1200x630
  // native viewBox, so resize is a no-op that introduces a second processing pass.
  const png = await sharp(Buffer.from(svg, "utf-8"), {
    density: 144, // higher density for crisper text
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })
    .toBuffer();
  return png;
}
