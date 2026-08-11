/*
<MODULE_CONTRACT>
<purpose>
  Detect section .astro components that use image props (backgroundImage, imageName,
  portraitImage, image, leadImage.src) as raw URLs (e.g. src={props.backgroundImage})
  instead of resolving them through resolveImage + contentAssetImages. This catches
  a common scaffold-generated mistake where composite sections bypass the content
  asset resolution contract (RFC-0042/RFC-0053/RFC-0248).
</purpose>
<non-goals>
  <item>Do not check content markdown files — asset.reference.validate and content.asset.contract.validate own that.</item>
  <item>Do not resolve images at build time — this is a static text scan of .astro source.</item>
  <item>Do not check shell-level components or non-section .astro files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — prevents recurrence of the mountain-journey backgroundImage bug (m000049).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const IMAGE_PROP_NAMES = [
  "backgroundImage",
  "imageName",
  "portraitImage",
  "image",
  "brandImage",
  "photo",
  "qr",
  "qrCode",
];

const RULE_ID = "section.image-props.validate";
const MESSAGE =
  'Image prop used as raw URL — resolve through resolveImage(contentAssetImages, props.xxx, { lang }) instead.';
const FIX_HINT =
  'import { resolveImage } from "@warpgogol/werkstatt-site/share"; import { contentAssetImages } from "../../content-assets.ts"; then use the resolved image src.';

export async function runSectionImagePropsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];

  const sectionsDir = join(
    context.workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "sections",
  );

  const astroFiles = await collectFiles(sectionsDir, { extensions: [".astro"] });

  for (const file of astroFiles) {
    const raw = await readFile(file, "utf-8").catch(() => "");
    if (!raw) continue;

    const relPath = relative(context.workspaceRoot, file).replace(/\\/g, "/");
    const lines = raw.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const propName of IMAGE_PROP_NAMES) {
        const directUsagePattern = `props.${propName}`;
        if (!line.includes(directUsagePattern)) continue;

        if (isResolveImageCall(line, propName)) continue;
        if (isComment(line)) continue;
        if (isAssignmentToResolver(line, propName)) continue;

        if (isSrcAttributeUsage(line, propName)) {
          diagnostics.push({
            ruleId: RULE_ID,
            severity: "error",
            file: relPath,
            line: i + 1,
            message: MESSAGE,
            fixHint: FIX_HINT,
            data: { prop: propName },
          });
        }
      }
    }
  }

  return diagnosticsResult(RULE_ID, diagnostics);
}

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

function isResolveImageCall(line: string, propName: string): boolean {
  return line.includes("resolveImage") && line.includes(`props.${propName}`);
}

function isAssignmentToResolver(line: string, propName: string): boolean {
  const pattern = new RegExp(`=\\s*resolveImage.*props\\.${propName}`);
  return pattern.test(line);
}

function isSrcAttributeUsage(line: string, propName: string): boolean {
  const trimmed = line.trim();
  return (
    (trimmed.includes("src=") || trimmed.includes("src={")) &&
    trimmed.includes(`props.${propName}`) &&
    !trimmed.includes("resolveImage")
  );
}
