/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/03-page-runtime.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runPageBlockValidate } from "../page-block.ts";
import { runPageBlocksMirrorValidate } from "../page-blocks-mirror.ts";
import { runSharedContextValidate } from "../shared-context.ts";
import { runVisibilityExprValidate } from "../visibility-expr.ts";
import { runPagePipelineContract } from "../pipeline/pipeline-contract.ts";
import { runRuntimeContextShape } from "../runtime-context-shape.ts";
import { runPageShellValidate } from "../page-shell.ts";
import { runContentFilenameValidate } from "../content-filename.ts";
import { runImageFormatValidate } from "../image-format.ts";

export const PAGE_RUNTIME_COMMANDS: CheckCommandEntry[] = [
  /* Wave 0 (RFC-0026): Block-declarative pages + runtime context */
  {
    name: "page.block.validate",
    description:
      "Validate block-declarative page content: PageEntrySchema parse, planet-pin cross-ref with system.yaml, propsSchema strict validation, no markdown body (DNA-24, RFC-0026). B-07: body.kind matches archetype bodyKind (RFC-0719).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/pages/**/*.md",
      "packages/ui/src/sections/**/*.manifest.yaml",
    ],
    execute: runPageBlockValidate,
  },
  /* RFC-0205: localized twin block-by-block prop parity */
  {
    name: "page.blocks.mirror.validate",
    description:
      "Compare each localized page with its default-language twin block-by-block. " +
      "Fails when a localized block is missing a prop or nested label key present in the default twin (RFC-0205).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/pages/**/*.md"],
    execute: runPageBlocksMirrorValidate,
  },
  {
    name: "shared.context.validate",
    description:
      "Validate RFC-0099 page-driven shared context fallback: required fallback pages, block-id resolvability, and ambiguity by priority level.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    execute: runSharedContextValidate,
  },
  {
    name: "visibility.expr.validate",
    description:
      "Validate every VisibilityExpr found in page content and feature-graph YAML parses against VisibilityExprSchema (DNA-26, RFC-0026).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/*.md", "<app>/src/content/**/*.yaml"],
    execute: runVisibilityExprValidate,
  },
  {
    name: "page.pipeline.contract",
    description:
      "Verify buildPage(entry, ctx) from @warpgogol/werkstatt-site/share returns a valid ResolvedPage shape and that visibility filtering works correctly (DNA-25, RFC-0026).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/share/src/page/**/*.ts"],
    execute: runPagePipelineContract,
  },
  {
    name: "runtime.context.shape",
    description:
      "Verify RuntimeContext has exactly locale/segment/flags fields and that no workspace code constructs a non-MVP context (DNA-26, RFC-0026).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/share/src/**/*.ts", "packages/ui/src/**/*.ts"],
    execute: runRuntimeContextShape,
  },
  /* RFC-0036: Shell-level block validation */
  {
    name: "page.shell.validate",
    description:
      "Validate shell-level block configuration in system.md. Checks cosmicMoon exists in MoonCatalog, props conform to manifest propsSchema, and pin matches manifest version (RFC-0036).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "packages/ui/src/components/**/*.manifest.yaml"],
    execute: runPageShellValidate,
  },
  /* RFC-0090: content.filename.validate */
  {
    name: "content.filename.validate",
    description:
      "Validate page content filenames match the {pageId}.md convention (RFC-0090). Scans content/pages/{lang}/*.md, reads frontmatter pageId, computes pageIdToContentFileSlug(pageId), and asserts the filename matches. Includes a `git mv` suggestion in the diagnostic. Skips kind:redirect files; reports missing pageId as a violation.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/pages/**/*.md"],
    execute: runContentFilenameValidate,
  },
  /* RFC-0043: image.format.validate */
  {
    name: "image.format.validate",
    description:
      "Validate image file formats across apps. Enforces webp-only in src/content/**/assets/**, and webp/ico/svg/png in public/. Uses magic byte detection via file-type library (RFC-0043).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/**/assets/**", "<app>/public/**"],
    execute: runImageFormatValidate,
  },
];
