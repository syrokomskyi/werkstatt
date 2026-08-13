/*
<MODULE_CONTRACT>
<purpose>
  RFC-0830: Post-build validator that scans rendered HTML in dist/client/ for
  all <img> elements and validates responsive delivery (srcset presence),
  compression budgets, and LCP image optimization attributes.
  Rules: IMG-DELIVERY-01 (srcset), IMG-DELIVERY-02 (compression budget),
  IMG-DELIVERY-04 (LCP attributes via fetchpriority marker).
</purpose>
<non-goals>
  <item>Do not check served-vs-displayed dimension ratio — requires CSS layout computation unavailable to static HTML parsing (Lighthouse covers this post-deploy).</item>
  <item>Do not generate image variants — image.variants.generate owns generation.</item>
  <item>Do not handle CSS background-image delivery — only <img> elements in HTML.</item>
  <item>Do not validate SVG delivery — SVGs are vector, dimension rules do not apply.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0830: initial implementation — image.delivery.validate with IMG-DELIVERY-01, IMG-DELIVERY-02, IMG-DELIVERY-04 rules and image-delivery.config.yaml escape hatch.</item>
  <item>RFC-0830: review fix — replace any types with DefaultTreeAdapterMap + local ElementNode interface, fix MODULE_CONTRACT bracket convention.</item>
  <item>RFC-0831: extract shared DOM helpers (isElementNode, hasChildNodes, getAttr, ElementNode) into checks/dom-helpers.ts to eliminate duplication with csp-origins.ts.</item>
</CHANGE_SUMMARY>
*/

import { join, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "parse5";
import picomatch from "picomatch";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectRenderedHtml } from "./audit/validators/helpers.ts";
import {
  type ElementNode,
  type TreeParentNode,
  isElementNode,
  hasChildNodes,
  getAttr,
} from "./dom-helpers.ts";

const COMMAND = "image.delivery.validate";

interface ImageDeliveryFinding {
  rule: "IMG-DELIVERY-01" | "IMG-DELIVERY-02" | "IMG-DELIVERY-04" | "IMG-DELIVERY-CONFIG-01";
  file: string;
  line: number;
  src: string;
  severity: "error" | "warning";
  message: string;
  fixHint: string;
  data?: {
    servedWidth?: number;
    servedHeight?: number;
    fileSizeBytes?: number;
    budgetBytes?: number;
  };
}

interface ImageDeliveryResult {
  command: typeof COMMAND;
  status: "pass" | "fail";
  findings: ImageDeliveryFinding[];
  checkedImages: number;
}

interface ConfigOverride {
  srcPattern: string;
  rules: string[];
  reason: string;
}

interface DeliveryConfig {
  overrides: ConfigOverride[];
}

function isSvgSrc(src: string): boolean {
  return src.toLowerCase().endsWith(".svg") || src.startsWith("data:image/svg");
}

function countWidthDescriptors(srcset: string): number {
  return srcset.split(",").filter((s) => s.trim().endsWith("w")).length;
}

function computeBudget(servedWidth: number, servedHeight: number): number {
  return Math.max(20_000, Math.min(400_000, servedWidth * servedHeight * 0.4));
}

async function loadDeliveryConfig(
  configPath: string,
): Promise<{ config: DeliveryConfig | null; warnings: ImageDeliveryFinding[] }> {
  if (!existsSync(configPath)) {
    return { config: null, warnings: [] };
  }

  const warnings: ImageDeliveryFinding[] = [];
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = yamlParse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || !("overrides" in parsed)) {
      warnings.push({
        rule: "IMG-DELIVERY-CONFIG-01",
        file: configPath,
        line: 0,
        src: "",
        severity: "warning",
        message: "image-delivery.config.yaml is malformed: missing `overrides` key",
        fixHint:
          "Ensure the file has an `overrides[]` array with srcPattern, rules, and reason fields",
      });
      return { config: null, warnings };
    }

    const overrides = (parsed as Record<string, unknown>).overrides;
    if (!Array.isArray(overrides)) {
      warnings.push({
        rule: "IMG-DELIVERY-CONFIG-01",
        file: configPath,
        line: 0,
        src: "",
        severity: "warning",
        message: "image-delivery.config.yaml is malformed: `overrides` is not an array",
        fixHint: "Ensure `overrides` is a YAML list",
      });
      return { config: null, warnings };
    }

    const validOverrides: ConfigOverride[] = [];
    for (const entry of overrides) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).srcPattern === "string" &&
        Array.isArray((entry as Record<string, unknown>).rules) &&
        typeof (entry as Record<string, unknown>).reason === "string"
      ) {
        validOverrides.push(entry as ConfigOverride);
      } else {
        warnings.push({
          rule: "IMG-DELIVERY-CONFIG-01",
          file: configPath,
          line: 0,
          src: "",
          severity: "warning",
          message:
            "image-delivery.config.yaml has an invalid override entry (missing srcPattern, rules, or reason)",
          fixHint:
            "Each override must have srcPattern (string), rules (array), and reason (string)",
        });
      }
    }

    return { config: { overrides: validOverrides }, warnings };
  } catch {
    warnings.push({
      rule: "IMG-DELIVERY-CONFIG-01",
      file: configPath,
      line: 0,
      src: "",
      severity: "warning",
      message: "image-delivery.config.yaml could not be parsed",
      fixHint: "Fix YAML syntax errors in the config file",
    });
    return { config: null, warnings };
  }
}

function isRuleSkipped(config: DeliveryConfig | null, src: string, rule: string): boolean {
  if (!config) return false;
  return config.overrides.some((override) => {
    if (!override.rules.includes(rule)) return false;
    try {
      return picomatch(override.srcPattern, { dot: true })(src);
    } catch {
      return false;
    }
  });
}

function collectImgElements(document: TreeParentNode): Array<{ el: ElementNode; line: number }> {
  const results: Array<{ el: ElementNode; line: number }> = [];

  function walk(node: TreeParentNode): void {
    const children = node.childNodes;
    if (!children) return;

    for (const child of children) {
      if (isElementNode(child) && child.tagName === "img") {
        const loc = child.sourceCodeLocation;
        results.push({ el: child, line: loc?.startLine ?? 0 });
      }
      if (hasChildNodes(child)) {
        walk(child);
      }
    }
  }

  walk(document);
  return results;
}

async function resolveSrcToFile(src: string, distDir: string): Promise<string | null> {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return null;
  }
  const resolved = src.startsWith("/") ? join(distDir, src.slice(1)) : resolve(distDir, src);
  if (!existsSync(resolved)) return null;
  return resolved;
}

export async function runImageDeliveryValidate(
  input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(ctx);
  const distDir = join(paths.appDirectory, "dist", "client");
  const configPath = join(paths.srcDirectory, "image-delivery.config.yaml");

  if (!existsSync(distDir)) {
    return {
      data: {
        command: COMMAND,
        status: "pass",
        findings: [],
        checkedImages: 0,
      } satisfies ImageDeliveryResult,
      exitCode: 0,
      summary: `${COMMAND}: no dist/client/ — skipped`,
    };
  }

  const { config, warnings: configWarnings } = await loadDeliveryConfig(configPath);
  const findings: ImageDeliveryFinding[] = [...configWarnings];

  const htmlFiles = await collectRenderedHtml(distDir);
  let checkedImages = 0;

  for (const { file, html } of htmlFiles) {
    let document: TreeParentNode;
    try {
      document = parse(html) as TreeParentNode;
    } catch {
      continue;
    }

    const imgs = collectImgElements(document);
    let hasFetchpriorityHigh = false;

    for (const { el, line } of imgs) {
      const src = getAttr(el, "src") ?? "";
      const srcset = getAttr(el, "srcset") ?? "";
      const loading = getAttr(el, "loading") ?? "";
      const decoding = getAttr(el, "decoding") ?? "";
      const fetchpriority = getAttr(el, "fetchpriority") ?? "";
      const widthAttr = getAttr(el, "width");

      checkedImages++;

      if (fetchpriority === "high") {
        hasFetchpriorityHigh = true;
      }

      // IMG-DELIVERY-01: Responsive srcset required
      if (!isRuleSkipped(config, src, "IMG-DELIVERY-01")) {
        const widthNum = widthAttr ? parseInt(widthAttr, 10) : NaN;
        const isSmallIcon = !isNaN(widthNum) && widthNum <= 64;
        const isLazy = loading === "lazy" && decoding === "async";
        const isSvg = isSvgSrc(src);

        if (!isSvg && !isSmallIcon && !isLazy) {
          const widthCount = countWidthDescriptors(srcset);
          if (widthCount < 2) {
            findings.push({
              rule: "IMG-DELIVERY-01",
              file,
              line,
              src,
              severity: "error",
              message: `<img> without srcset with ≥2 width variants — serve responsive width variants`,
              fixHint:
                "Ensure ResponsiveImage is used with build-portable provider to produce srcset variants",
            });
          }
        }
      }

      // IMG-DELIVERY-02: Compression budget
      if (!isRuleSkipped(config, src, "IMG-DELIVERY-02") && !isSvgSrc(src)) {
        const imgFile = await resolveSrcToFile(src, distDir);
        if (imgFile) {
          try {
            const sharp = (await import("sharp")).default;
            const metadata = await sharp(imgFile).metadata();
            const fileStat = await stat(imgFile);
            const servedWidth = metadata.width ?? 0;
            const servedHeight = metadata.height ?? 0;
            const fileSizeBytes = fileStat.size;
            const budgetBytes = computeBudget(servedWidth, servedHeight);

            if (fileSizeBytes > budgetBytes * 2) {
              findings.push({
                rule: "IMG-DELIVERY-02",
                file,
                line,
                src,
                severity: "error",
                message: `Image file size ${fileSizeBytes} bytes exceeds 2× compression budget ${Math.round(budgetBytes)} bytes`,
                fixHint: "Re-export the image with higher compression or smaller dimensions",
                data: {
                  servedWidth,
                  servedHeight,
                  fileSizeBytes,
                  budgetBytes: Math.round(budgetBytes),
                },
              });
            } else if (fileSizeBytes > budgetBytes * 1.5) {
              findings.push({
                rule: "IMG-DELIVERY-02",
                file,
                line,
                src,
                severity: "warning",
                message: `Image file size ${fileSizeBytes} bytes exceeds 1.5× compression budget ${Math.round(budgetBytes)} bytes`,
                fixHint: "Consider re-exporting the image with higher compression",
                data: {
                  servedWidth,
                  servedHeight,
                  fileSizeBytes,
                  budgetBytes: Math.round(budgetBytes),
                },
              });
            }
          } catch {
            findings.push({
              rule: "IMG-DELIVERY-02",
              file,
              line,
              src,
              severity: "warning",
              message: `Could not read image metadata for compression budget check`,
              fixHint: "Ensure the image file is a valid WebP/PNG/JPEG",
            });
          }
        }
      }

      // IMG-DELIVERY-04: LCP image optimization (per-image attribute check)
      if (fetchpriority === "high" && !isRuleSkipped(config, src, "IMG-DELIVERY-04")) {
        if (loading !== "eager" || decoding !== "async") {
          findings.push({
            rule: "IMG-DELIVERY-04",
            file,
            line,
            src,
            severity: "error",
            message: `LCP image (fetchpriority="high") must have loading="eager" and decoding="async"`,
            fixHint: 'Add loading="eager" and decoding="async" to the LCP image',
          });
        }
      }
    }

    // IMG-DELIVERY-04: At least one fetchpriority="high" image per page.
    // Skip 404.html — it is a non-content error page with no meaningful LCP image.
    const basename = file.split("/").pop() ?? "";
    if (!hasFetchpriorityHigh && imgs.length > 0 && basename !== "404.html") {
      findings.push({
        rule: "IMG-DELIVERY-04",
        file,
        line: 0,
        src: "",
        severity: "error",
        message: `No <img> with fetchpriority="high" found on page — at least one LCP marker is required`,
        fixHint: 'Add fetchpriority="high" to the largest above-the-fold image on the page',
      });
    }
  }

  const hasErrors = findings.some((f) => f.severity === "error");
  const result: ImageDeliveryResult = {
    command: COMMAND,
    status: hasErrors ? "fail" : "pass",
    findings,
    checkedImages,
  };

  return {
    data: result,
    exitCode: hasErrors ? 1 : 0,
    summary: `${COMMAND}: ${findings.length} finding(s), ${checkedImages} image(s) checked`,
  };
}
