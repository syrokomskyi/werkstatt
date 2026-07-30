/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0603: unit tests for preview image generation determinism.
    Verifies that generateBrandCardPng produces byte-identical PNG buffers
    across multiple calls with the same input.
  </purpose>
  <keywords>RFC-0603, preview, determinism, sharp, PNG</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0603: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { generateBrandCardPng, type PreviewTemplateInput } from "../preview-templates.ts";

const sampleInput: PreviewTemplateInput = {
  pageTitle: "Test Page Title",
  pageDescription: "A description for the test page.",
  siteName: "Test Site",
  siteTagline: "Test tagline",
  lang: "de",
  brandSurface: "#F4F2EE",
  brandInk: "#1B1D22",
  brandAccent: "#E39A24",
};

const sampleInput2: PreviewTemplateInput = {
  pageTitle: "Another Page",
  pageDescription: "Different content.",
  siteName: "Test Site",
  siteTagline: "Test tagline",
  lang: "en",
};

describe("RFC-0603: preview image determinism", () => {
  it("produces byte-identical PNG buffers for the same input", async () => {
    const png1 = await generateBrandCardPng(sampleInput);
    const png2 = await generateBrandCardPng(sampleInput);

    expect(Buffer.isBuffer(png1)).toBe(true);
    expect(Buffer.isBuffer(png2)).toBe(true);
    expect(png1.equals(png2)).toBe(true);
  });

  it("produces byte-identical PNG buffers across 5 consecutive calls", async () => {
    const pngs: Buffer[] = [];
    for (let i = 0; i < 5; i++) {
      pngs.push(await generateBrandCardPng(sampleInput));
    }

    for (let i = 1; i < pngs.length; i++) {
      expect(pngs[0].equals(pngs[i])).toBe(true);
    }
  });

  it("produces byte-identical PNG buffers for a different input set", async () => {
    const png1 = await generateBrandCardPng(sampleInput2);
    const png2 = await generateBrandCardPng(sampleInput2);

    expect(png1.equals(png2)).toBe(true);
  });

  it("produces deterministic output when optional fields are undefined", async () => {
    const input: PreviewTemplateInput = {
      pageTitle: "Minimal Page",
      siteName: "Minimal Site",
      lang: "de",
    };

    const png1 = await generateBrandCardPng(input);
    const png2 = await generateBrandCardPng(input);

    expect(png1.equals(png2)).toBe(true);
  });

  it("produces non-empty PNG buffers with valid PNG signature", async () => {
    const png = await generateBrandCardPng(sampleInput);

    expect(png.length).toBeGreaterThan(100);
    // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
});
