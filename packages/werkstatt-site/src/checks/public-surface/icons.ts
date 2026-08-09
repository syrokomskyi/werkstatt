/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/icons.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted icon commands from public-surface.ts into public-surface/icons.ts.</item>
  <item>RFC-0631: add resolveIconSvg helper for site-authored favicon SVG source with buildIconSvg fallback; add ICON-SRC-01/02/03 validation diagnostics; add sharp conversion failure fallback.</item>
  <item>RFC-0632: add wrapMaskableSvg helper for auto-wrapping maskable icons with Android 80% safe-zone; remove favicon-maskable.svg support; replace ICON-SRC-03 with ICON-SRC-04 warning.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import sharp from "sharp";
import { diagnosticsResult } from "../result-helpers.ts";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";
import {
  type AppPublicContext,
  appRel,
  asRecord,
  asString,
  loadPublicContext,
  readTextIfExists,
  workspaceRel,
} from "./shared.ts";

const SVG_ROOT_RE = /<svg\b[^>]*>/i;
const SVG_VIEWBOX_RE = /\bviewBox\s*=\s*["']([^"']*)["']/i;
const SVG_INNER_RE = /<svg\b[^>]*>([\s\S]*)<\/svg\s*>/i;
const RECT_RE = /<rect\b[^>]*>(?:\s*<\/rect\s*>)?/gi;
const ATTR_WIDTH_RE = /\bwidth\s*=\s*["'](512|100%)["']/i;
const ATTR_HEIGHT_RE = /\bheight\s*=\s*["'](512|100%)["']/i;
const ATTR_FILL_RE = /\bfill\s*=\s*["']([^"']*)["']/i;

type IconDiagnosticMessage = {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  fixHint?: string;
};

function hashColor(seed: string, offset: number): string {
  let hash = offset;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return hslToHex(hue, 58, offset % 2 === 0 ? 42 : 88);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((value) =>
      Math.round(255 * value)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function iconInitial(app: AppPublicContext): string {
  const label =
    asString(app.manifest.identity?.brandName) ??
    asString(app.manifest.identity?.name) ??
    app.domain ??
    app.appId;
  return (label.match(/[A-Za-z0-9]/)?.[0] ?? app.appId[0] ?? "W").toUpperCase();
}

function siteDisplayName(app: AppPublicContext): string {
  return (
    asString(app.manifest.identity?.brandName) ??
    asString(app.manifest.identity?.name) ??
    asString(app.manifest.identity?.domain) ??
    app.appId
  );
}

export function buildIconSvg(app: AppPublicContext, maskable = false): string {
  const biome = asString(asRecord(app.manifest.identity)?.biome) ?? app.appId;
  const bg = app.biomePalette?.surface ?? hashColor(`${biome}:${app.appId}`, 17);
  const fg = app.biomePalette?.brand ?? hashColor(`${app.appId}:${biome}`, 42);
  const inset = maskable ? 6 : 6;
  const overlaySize = 512 - inset * 2;
  const overlayRx = Math.round(overlaySize * 0.052);
  const fontSize = maskable ? 200 : 236;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`,
    `  <rect width="512" height="512" fill="${bg}"/>`,
    `  <rect x="${inset}" y="${inset}" width="${overlaySize}" height="${overlaySize}" rx="${overlayRx}" fill="${fg}" opacity="0.14"/>`,
    `  <text x="256" y="278" fill="${fg}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle">${iconInitial(app)}</text>`,
    `</svg>`,
    "",
  ].join("\n");
}

async function pngFromSvg(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function icoFromSvg(svg: string): Promise<Buffer> {
  const png = await pngFromSvg(svg, 32);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6);
  header.writeUInt8(32, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

function buildWebManifest(app: AppPublicContext): string {
  const biome = asString(asRecord(app.manifest.identity)?.biome) ?? app.appId;
  const themeColor = app.biomePalette?.surface ?? hashColor(`${biome}:${app.appId}`, 17);
  const backgroundColor = app.biomePalette?.brand ?? hashColor(`${app.appId}:${biome}`, 42);
  const name = siteDisplayName(app);
  return `${JSON.stringify(
    {
      name,
      short_name: name.slice(0, 24),
      start_url: "/",
      display: "standalone",
      background_color: backgroundColor,
      theme_color: themeColor,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icon-maskable-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

export function wrapMaskableSvg(svg: string): string {
  const innerMatch = SVG_INNER_RE.exec(svg);
  if (!innerMatch) return svg;
  const innerContent = innerMatch[1];

  const rootTagMatch = SVG_ROOT_RE.exec(svg);
  if (!rootTagMatch) return svg;
  const rootTag = rootTagMatch[0];

  let bgColor = "#ffffff";
  let contentWithoutBg = innerContent;

  const rects = [...innerContent.matchAll(RECT_RE)];
  for (const rectMatch of rects) {
    const rect = rectMatch[0];
    if (ATTR_WIDTH_RE.test(rect) && ATTR_HEIGHT_RE.test(rect)) {
      const fillMatch = ATTR_FILL_RE.exec(rect);
      if (fillMatch) bgColor = fillMatch[1];
      contentWithoutBg = innerContent.replace(rect, "");
      break;
    }
  }

  if (contentWithoutBg.trim().length === 0) return svg;

  return `${rootTag}\n  <rect width="512" height="512" fill="${bgColor}"/>\n  <g transform="translate(51.2, 51.2) scale(0.8)">\n${contentWithoutBg}\n  </g>\n</svg>`;
}

export async function resolveIconSvg(
  app: AppPublicContext,
  context: KernelRuntimeContext,
  maskable: boolean,
): Promise<string> {
  const regularSource = await readTextIfExists(context, join(app.contentDirectory, "favicon.svg"));
  if (maskable) {
    if (regularSource) return wrapMaskableSvg(regularSource);
    return buildIconSvg(app, true);
  }
  return regularSource ?? buildIconSvg(app, false);
}

async function buildIconWrites(
  app: AppPublicContext,
  svg: string,
  maskableSvg: string,
): Promise<Array<[string, string | Uint8Array]>> {
  return [
    [join(app.publicDirectory, "favicon.svg"), svg],
    [join(app.publicDirectory, "favicon.ico"), await icoFromSvg(svg)],
    [join(app.publicDirectory, "apple-touch-icon.png"), await pngFromSvg(svg, 180)],
    [join(app.publicDirectory, "icon-192.png"), await pngFromSvg(svg, 192)],
    [join(app.publicDirectory, "icon-512.png"), await pngFromSvg(svg, 512)],
    [join(app.publicDirectory, "icon-maskable-192.png"), await pngFromSvg(maskableSvg, 192)],
    [join(app.publicDirectory, "icon-maskable-512.png"), await pngFromSvg(maskableSvg, 512)],
    [join(app.publicDirectory, "manifest.webmanifest"), buildWebManifest(app)],
  ];
}

export async function runPublicIconsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const svg = await resolveIconSvg(app, context, false);
  const maskableSvg = await resolveIconSvg(app, context, true);
  let writes: Array<[string, string | Uint8Array]>;
  try {
    writes = await buildIconWrites(app, svg, maskableSvg);
  } catch (error) {
    context.logger.warn(
      `public.icons.generate: sharp conversion failed for source SVG, falling back to buildIconSvg: ${(error as Error).message}`,
    );
    const fallbackSvg = buildIconSvg(app);
    const fallbackMaskableSvg = buildIconSvg(app, true);
    writes = await buildIconWrites(app, fallbackSvg, fallbackMaskableSvg);
  }
  for (const [filePath, content] of writes) {
    await context.io.writeFile(filePath, content);
  }

  const legacyRoute = join(app.appDirectory, "src", "pages", "favicon.ico.ts");
  const legacyRouteContent = await readTextIfExists(context, legacyRoute);
  if (legacyRouteContent && hasGeneratedMarker(legacyRouteContent)) {
    await context.io.rm(legacyRoute);
  }

  return {
    data: { files: writes.map(([filePath]) => appRel(app.appDirectory, filePath)) },
    exitCode: 0,
    summary: `public.icons.generate: wrote ${writes.length} icon artifact(s)`,
  };
}

export async function runPublicIconsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const messages: Array<IconDiagnosticMessage> = [];
  const required = [
    "favicon.svg",
    "favicon.ico",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "icon-maskable-192.png",
    "icon-maskable-512.png",
    "manifest.webmanifest",
  ];
  for (const name of required) {
    const filePath = join(app.publicDirectory, name);
    if (!(await context.io.exists(filePath))) {
      messages.push({
        ruleId: "public.icons.validate",
        severity: "error",
        file: workspaceRel(context, filePath),
        message: `Missing generated icon artifact ${name}.`,
        fixHint: "Run public.icons.generate.",
      });
    }
  }

  for (const [name, size] of [
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-192.png", 192],
    ["icon-maskable-512.png", 512],
  ] as const) {
    const filePath = join(app.publicDirectory, name);
    if (await context.io.exists(filePath)) {
      const meta = await sharp(Buffer.from(await context.io.readFileBytes(filePath))).metadata();
      if (meta.width !== size || meta.height !== size) {
        messages.push({
          ruleId: "public.icons.validate",
          severity: "error",
          file: workspaceRel(context, filePath),
          message: `${name} must be ${size}x${size}px, got ${meta.width}x${meta.height}.`,
          fixHint: "Regenerate with public.icons.generate.",
        });
      }
    }
  }

  const manifestPath = join(app.publicDirectory, "manifest.webmanifest");
  const manifestRaw = await readTextIfExists(context, manifestPath);
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw) as {
        icons?: Array<{ src?: string; purpose?: string }>;
      };
      const iconMap = new Map((manifest.icons ?? []).map((icon) => [icon.src, icon]));
      for (const src of [
        "/icon-192.png",
        "/icon-512.png",
        "/icon-maskable-192.png",
        "/icon-maskable-512.png",
      ]) {
        if (!iconMap.has(src)) {
          messages.push({
            ruleId: "public.icons.validate",
            severity: "error",
            file: workspaceRel(context, manifestPath),
            message: `manifest.webmanifest is missing icon entry ${src}.`,
            fixHint: "Regenerate with public.icons.generate.",
          });
        }
      }
      for (const src of ["/icon-maskable-192.png", "/icon-maskable-512.png"]) {
        if (iconMap.get(src)?.purpose !== "maskable") {
          messages.push({
            ruleId: "public.icons.validate",
            severity: "error",
            file: workspaceRel(context, manifestPath),
            message: `${src} must have purpose: "maskable" in manifest.webmanifest.`,
            fixHint: "Regenerate with public.icons.generate.",
          });
        }
      }
    } catch (error) {
      messages.push({
        ruleId: "public.icons.validate",
        severity: "error",
        file: workspaceRel(context, manifestPath),
        message: `manifest.webmanifest is invalid JSON: ${(error as Error).message}`,
        fixHint: "Regenerate with public.icons.generate.",
      });
    }
  }

  const layoutPath = join(
    context.workspaceRoot,
    "packages",
    "ui",
    "src",
    "components",
    "layout",
    "layout-component.astro",
  );
  const layout = await readTextIfExists(context, layoutPath);
  for (const needle of [
    'href="/favicon.ico"',
    'href="/favicon.svg"',
    'href="/apple-touch-icon.png"',
    'href="/manifest.webmanifest"',
    'name="theme-color"',
  ]) {
    if (!layout?.includes(needle)) {
      messages.push({
        ruleId: "public.icons.validate",
        severity: "error",
        file: workspaceRel(context, layoutPath),
        message: `Shared head is missing icon declaration ${needle}.`,
        fixHint: "Add the icon/webmanifest declaration to packages/ui layout-component.astro.",
      });
    }
  }

  await validateSourceSvg(
    context,
    join(app.contentDirectory, "favicon.svg"),
    "ICON-SRC-01",
    "ICON-SRC-02",
    messages,
  );

  const sourceSvgExists = await context.io.exists(join(app.contentDirectory, "favicon.svg"));
  if (sourceSvgExists) {
    messages.push({
      ruleId: "ICON-SRC-04",
      severity: "warning",
      file: workspaceRel(context, join(app.contentDirectory, "favicon.svg")),
      message:
        "Maskable icons are auto-wrapped with 80% safe-zone from favicon.svg. Visually verify maskable PNGs on Android.",
      fixHint:
        "Check public/icon-maskable-512.png — adjust favicon.svg if edge elements are clipped.",
    });
  }

  return diagnosticsResult(
    "public.icons.validate",
    messages.map(
      (item) =>
        ({
          ruleId: item.ruleId,
          severity: item.severity,
          message: item.message,
          file: item.file,
          fixHint: item.fixHint,
        }) satisfies Diagnostic,
    ),
  );
}

async function validateSourceSvg(
  context: KernelRuntimeContext,
  filePath: string,
  viewBoxRuleId: string,
  xmlRuleId: string,
  messages: Array<IconDiagnosticMessage>,
): Promise<void> {
  const content = await readTextIfExists(context, filePath);
  if (!content) return;
  const rootMatch = SVG_ROOT_RE.exec(content);
  if (!rootMatch) {
    messages.push({
      ruleId: xmlRuleId,
      severity: "error",
      file: workspaceRel(context, filePath),
      message: `Source SVG does not contain a root <svg> element.`,
      fixHint: `Fix the root element in src/content/${filePath.split("/").pop()} to be <svg>.`,
    });
    return;
  }
  const rootTag = rootMatch[0];
  const viewBoxMatch = SVG_VIEWBOX_RE.exec(rootTag);
  const viewBox = viewBoxMatch?.[1];
  if (viewBox !== "0 0 512 512") {
    messages.push({
      ruleId: viewBoxRuleId,
      severity: "error",
      file: workspaceRel(context, filePath),
      message: `Source SVG viewBox is "${viewBox ?? "(missing)"}", expected "0 0 512 512".`,
      fixHint: `Set viewBox="0 0 512 512" on the root <svg> element in src/content/${filePath.split("/").pop()}.`,
    });
  }
}
