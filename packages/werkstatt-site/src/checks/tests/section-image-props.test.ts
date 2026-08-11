/*
<MODULE_CONTRACT>
  <purpose>
    Test coverage for section.image-props.validate — proves the validator
    catches image props used as raw URLs in section .astro files and passes
    when resolveImage is used correctly.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — regression test for m000049 mountain-journey bug.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runSectionImagePropsValidate } from "../section-image-props.ts";

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

async function createSectionsDir(root: string): Promise<string> {
  const sectionsDir = join(
    root,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "sections",
  );
  await mkdir(sectionsDir, { recursive: true });
  return sectionsDir;
}

describe("section.image-props.validate", () => {
  it("red: flags backgroundImage used as raw src", async () => {
    const root = await mkdtemp(join(tmpdir(), "sec-img-props-red-"));
    try {
      const sectionsDir = await createSectionsDir(root);
      await mkdir(join(sectionsDir, "test-section"), { recursive: true });
      await writeFile(
        join(sectionsDir, "test-section", "test-section.astro"),
        `---
import { cast } from "@warpgogol/werkstatt-site/share";
const props = cast(pageOverride);
---

<img src={props.backgroundImage} alt="" />`,
        "utf8",
      );

      const result = await runSectionImagePropsValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "section.image-props.validate")).toBe(true);
      expect(diags.some((d) => d.data?.prop === "backgroundImage")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: resolveImage usage is not flagged", async () => {
    const root = await mkdtemp(join(tmpdir(), "sec-img-props-green-"));
    try {
      const sectionsDir = await createSectionsDir(root);
      await mkdir(join(sectionsDir, "hero"), { recursive: true });
      await writeFile(
        join(sectionsDir, "hero", "hero-section.astro"),
        `---
import { resolveImage } from "@warpgogol/werkstatt-site/share";
import { contentAssetImages } from "../../content-assets.ts";
const bgImage = resolveImage(contentAssetImages, props.backgroundImage, { lang });
---

<img src={bgImage.src} alt="" />`,
        "utf8",
      );

      const result = await runSectionImagePropsValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: comment lines mentioning props.backgroundImage are not flagged", async () => {
    const root = await mkdtemp(join(tmpdir(), "sec-img-props-comment-"));
    try {
      const sectionsDir = await createSectionsDir(root);
      await mkdir(join(sectionsDir, "scaffolded"), { recursive: true });
      await writeFile(
        join(sectionsDir, "scaffolded", "scaffolded-section.astro"),
        `---
const props = cast(pageOverride);
---

{/* If this section uses image props (backgroundImage, imageName, etc.),
     resolve them through resolveImage + contentAssetImages:
     const bgImage = resolveImage(contentAssetImages, props.backgroundImage, { lang }); */}`,
        "utf8",
      );

      const result = await runSectionImagePropsValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: empty sections directory passes", async () => {
    const root = await mkdtemp(join(tmpdir(), "sec-img-props-empty-"));
    try {
      await createSectionsDir(root);

      const result = await runSectionImagePropsValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.diagnostics.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
