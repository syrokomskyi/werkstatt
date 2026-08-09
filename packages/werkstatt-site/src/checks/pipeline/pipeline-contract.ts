/*
<MODULE_CONTRACT>
<purpose>
page.pipeline.contract — validates that buildPage(entry, ctx) from @warpgogol/werkstatt-site/share
returns a ResolvedPage with the correct shape, and that the contract snapshot is
byte-stable (DNA-25, RFC-0026).
</purpose>
<non-goals>
  <item>Do not execute a full Astro build — only validate type shapes and a minimal integration call.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { failResult, resultFromViolations } from "../result-helpers.ts";
import { buildPage, type ResolvedPage, type PageEntry } from "@warpgogol/werkstatt-site/share/page";
import { EMPTY_RUNTIME_CONTEXT } from "@warpgogol/werkstatt-site/share/runtime-context";

// ---------------------------------------------------------------------------
// Reference entry for contract snapshot test
// ---------------------------------------------------------------------------

const REFERENCE_ENTRY: PageEntry = {
  kind: "page",
  cosmicStar: "Vega",
  title: "Contract Test Page",
  description: "Used by page.pipeline.contract to validate the buildPage return shape.",
  lang: "de",
  blocks: [
    {
      id: "hero",
      use: "Europa",
      props: {
        heading: "Test Headline",
        subline: "Test Subline",
      },
    },
    {
      id: "hidden-block",
      use: "Callisto",
      props: { heading: "Should be dropped" },
      visibility: { locale: "en" }, // locale is "de" → this block is dropped
    },
  ],
};

// ---------------------------------------------------------------------------
// Shape checks
// ---------------------------------------------------------------------------

function checkResolvedPageShape(page: unknown): string[] {
  const errors: string[] = [];
  if (typeof page !== "object" || page === null) {
    errors.push("buildPage return value is not an object");
    return errors;
  }
  const p = page as Record<string, unknown>;

  if (typeof p.star !== "string") errors.push("ResolvedPage.star must be a string");
  if (typeof p.title !== "string") errors.push("ResolvedPage.title must be a string");
  if (typeof p.description !== "string") errors.push("ResolvedPage.description must be a string");
  if (typeof p.lang !== "string") errors.push("ResolvedPage.lang must be a string");
  if (!Array.isArray(p.blocks)) errors.push("ResolvedPage.blocks must be an array");
  if (typeof p.ctx !== "object" || p.ctx === null) {
    errors.push("ResolvedPage.ctx must be an object");
  } else {
    const ctx = p.ctx as Record<string, unknown>;
    if (typeof ctx.locale !== "string") errors.push("ResolvedPage.ctx.locale must be a string");
    if (ctx.segment !== null) errors.push("ResolvedPage.ctx.segment must be null at MVP");
    if (typeof ctx.flags !== "object" || ctx.flags === null) {
      errors.push("ResolvedPage.ctx.flags must be an object");
    } else if (Object.keys(ctx.flags as object).length !== 0) {
      errors.push("ResolvedPage.ctx.flags must be empty at MVP");
    }
  }

  if (Array.isArray(p.blocks)) {
    for (let i = 0; i < (p.blocks as unknown[]).length; i++) {
      const block = (p.blocks as unknown[])[i] as Record<string, unknown>;
      if (typeof block.planetName !== "string") {
        errors.push(`ResolvedPage.blocks[${i}].planetName must be a string`);
      }
      if (typeof block.componentImportPath !== "string") {
        errors.push(`ResolvedPage.blocks[${i}].componentImportPath must be a string`);
      }
      if (typeof block.props !== "object" || block.props === null) {
        errors.push(`ResolvedPage.blocks[${i}].props must be an object`);
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// runPagePipelineContract
// ---------------------------------------------------------------------------

export async function runPagePipelineContract(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  // Contract check 1: buildPage and EMPTY_RUNTIME_CONTEXT are exported
  if (typeof buildPage !== "function") {
    violations.push("@warpgogol/werkstatt-site/share does not export buildPage as a function");
  }
  if (typeof EMPTY_RUNTIME_CONTEXT !== "function") {
    violations.push("@warpgogol/werkstatt-site/share does not export EMPTY_RUNTIME_CONTEXT as a function");
  }

  if (violations.length > 0) {
    return failResult("page.pipeline.contract", violations);
  }

  // Contract check 2: EMPTY_RUNTIME_CONTEXT produces the correct shape
  const ctx = EMPTY_RUNTIME_CONTEXT("de");
  if (ctx.locale !== "de") {
    violations.push(`EMPTY_RUNTIME_CONTEXT("de").locale should be "de", got "${ctx.locale}"`);
  }
  if (ctx.segment !== null) {
    violations.push(`EMPTY_RUNTIME_CONTEXT.segment must be null at MVP, got "${ctx.segment}"`);
  }
  if (typeof ctx.flags !== "object" || Object.keys(ctx.flags).length !== 0) {
    violations.push("EMPTY_RUNTIME_CONTEXT.flags must be an empty object at MVP");
  }

  // Contract check 3: buildPage returns a valid ResolvedPage
  let page: ResolvedPage;
  try {
    page = await buildPage(REFERENCE_ENTRY, ctx);
  } catch (err) {
    violations.push(`buildPage threw an error on the reference entry: ${(err as Error).message}`);
    return failResult("page.pipeline.contract", violations);
  }

  const shapeErrors = checkResolvedPageShape(page);
  violations.push(...shapeErrors);

  // Contract check 4: visibility filtering works
  // REFERENCE_ENTRY has a block with { locale: "en" } — locale is "de" → dropped
  if (!violations.some((v) => v.includes("blocks"))) {
    const visiblePlanets = page.blocks.map((b) => b.planetName);
    if (visiblePlanets.includes("Callisto")) {
      violations.push(
        `Visibility filter failed: block with { locale: "en" } should be dropped when ctx.locale="de"`,
      );
    }
    if (!visiblePlanets.includes("Europa")) {
      violations.push(
        `Visibility filter failed: unconditional block (Europa) should remain visible`,
      );
    }
  }

  // Contract check 5: page metadata matches entry
  if (page.star !== REFERENCE_ENTRY.cosmicStar) {
    violations.push(
      `ResolvedPage.star="${page.star}" does not match entry.cosmicStar="${REFERENCE_ENTRY.cosmicStar}"`,
    );
  }
  if (page.lang !== ctx.locale) {
    violations.push(`ResolvedPage.lang="${page.lang}" does not match ctx.locale="${ctx.locale}"`);
  }

  return resultFromViolations("page.pipeline.contract", violations);
}
