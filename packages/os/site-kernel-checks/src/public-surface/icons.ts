/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/public-surface/icons.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted icon commands from public-surface.ts into public-surface/icons.ts.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { hasGeneratedMarker } from "@gogol/site-kernel-codegen";
import sharp from "sharp";
import {
  type AppPublicContext,
  appRel,
  asRecord,
  asString,
  diagnostics,
  loadPublicContext,
  readTextIfExists,
  workspaceRel,
} from "./shared.ts";

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

function buildIconSvg(app: AppPublicContext, maskable = false): string {
  const biome = asString(asRecord(app.manifest.identity)?.biome) ?? app.appId;
  const bg = hashColor(`${biome}:${app.appId}`, 17);
  const fg = hashColor(`${app.appId}:${biome}`, 42);
  const inset = maskable ? 14 : 6;
  const radius = maskable ? 22 : 26;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`,
    `  <rect width="512" height="512" fill="${bg}"/>`,
    `  <rect x="${inset}" y="${inset}" width="${512 - inset * 2}" height="${512 - inset * 2}" rx="${radius}" fill="${fg}" opacity="0.14"/>`,
    `  <text x="256" y="278" fill="${fg}" font-family="Inter, Arial, sans-serif" font-size="236" font-weight="800" text-anchor="middle" dominant-baseline="middle">${iconInitial(app)}</text>`,
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
  const themeColor = hashColor(`${biome}:${app.appId}`, 17);
  const backgroundColor = hashColor(`${app.appId}:${biome}`, 42);
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

export async function runPublicIconsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = await loadPublicContext(context);
  const svg = buildIconSvg(app);
  const maskableSvg = buildIconSvg(app, true);
  const writes: Array<[string, string | Uint8Array]> = [
    [join(app.publicDirectory, "favicon.svg"), svg],
    [join(app.publicDirectory, "favicon.ico"), await icoFromSvg(svg)],
    [join(app.publicDirectory, "apple-touch-icon.png"), await pngFromSvg(svg, 180)],
    [join(app.publicDirectory, "icon-192.png"), await pngFromSvg(svg, 192)],
    [join(app.publicDirectory, "icon-512.png"), await pngFromSvg(svg, 512)],
    [join(app.publicDirectory, "icon-maskable-192.png"), await pngFromSvg(maskableSvg, 192)],
    [join(app.publicDirectory, "icon-maskable-512.png"), await pngFromSvg(maskableSvg, 512)],
    [join(app.publicDirectory, "manifest.webmanifest"), buildWebManifest(app)],
  ];
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
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
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
            severity: "error",
            file: workspaceRel(context, manifestPath),
            message: `${src} must have purpose: "maskable" in manifest.webmanifest.`,
            fixHint: "Regenerate with public.icons.generate.",
          });
        }
      }
    } catch (error) {
      messages.push({
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
        severity: "error",
        file: workspaceRel(context, layoutPath),
        message: `Shared head is missing icon declaration ${needle}.`,
        fixHint: "Add the icon/webmanifest declaration to packages/ui layout-component.astro.",
      });
    }
  }

  return diagnostics("public.icons.validate", messages);
}
