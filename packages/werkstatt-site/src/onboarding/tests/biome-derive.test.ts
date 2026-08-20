import { describe, it, expect } from "vitest";
import type { BiomeAxes } from "@warpgogol/werkstatt-shared/ontology";
import { deriveBiomeFields, deriveSiteBackground } from "../biome-derive.ts";

function makeAxes(overrides: Partial<BiomeAxes> = {}): BiomeAxes {
  return {
    warmth: "neutral",
    contrast: "medium",
    density: "comfortable",
    typographySharpness: "balanced",
    diagramPresence: "minimal",
    photoStance: "none",
    motionStance: "static",
    textContrast: "aa",
    cornerRadius: "8px",
    borderWeight: "1px",
    ...overrides,
  };
}

describe("deriveBiomeFields", () => {
  it("returns all required top-level keys", () => {
    const fields = deriveBiomeFields(makeAxes());
    expect(fields).toHaveProperty("palette");
    expect(fields).toHaveProperty("typography");
    expect(fields).toHaveProperty("spacing");
    expect(fields).toHaveProperty("motion");
    expect(fields).toHaveProperty("geometry");
    expect(fields).toHaveProperty("siteBackground");
  });

  it("derives palette brand from warmth=cool", () => {
    const { palette } = deriveBiomeFields(makeAxes({ warmth: "cool" }));
    expect(palette.brand).toBe("#2F5E8A");
  });

  it("derives palette brand from warmth=warm", () => {
    const { palette } = deriveBiomeFields(makeAxes({ warmth: "warm" }));
    expect(palette.brand).toBe("#7A4A2A");
  });

  it("derives ink from contrast=high", () => {
    const { palette } = deriveBiomeFields(makeAxes({ contrast: "high" }));
    expect(palette.ink).toBe("#111111");
  });

  it("derives ink from contrast=low", () => {
    const { palette } = deriveBiomeFields(makeAxes({ contrast: "low" }));
    expect(palette.ink).toBe("#2B2B2B");
  });

  it("sets typography scaleRatio based on typographySharpness", () => {
    const sharp = deriveBiomeFields(makeAxes({ typographySharpness: "sharp" }));
    const soft = deriveBiomeFields(makeAxes({ typographySharpness: "soft" }));
    expect(sharp.typography.scaleRatio).toBe(1.18);
    expect(soft.typography.scaleRatio).toBe(1.22);
  });

  it("sets spacing base from density", () => {
    const dense = deriveBiomeFields(makeAxes({ density: "dense" }));
    const airy = deriveBiomeFields(makeAxes({ density: "airy" }));
    expect(dense.spacing.base).toBe("6px");
    expect(airy.spacing.base).toBe("10px");
  });

  it("sets motion durations from motionStance=static", () => {
    const { motion } = deriveBiomeFields(makeAxes({ motionStance: "static" }));
    expect(motion.durationFast).toBe("0ms");
    expect(motion.durationMedium).toBe("0ms");
    expect(motion.durationSlow).toBe("0ms");
  });

  it("sets motion durations from motionStance=expressive", () => {
    const { motion } = deriveBiomeFields(makeAxes({ motionStance: "expressive" }));
    expect(motion.durationFast).toBe("160ms");
    expect(motion.easing).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });

  it("sets geometry diagramLineWeight from diagramPresence", () => {
    const absent = deriveBiomeFields(makeAxes({ diagramPresence: "absent" }));
    const central = deriveBiomeFields(makeAxes({ diagramPresence: "central" }));
    expect(absent.geometry.diagramLineWeight).toBeUndefined();
    expect(central.geometry.diagramLineWeight).toBe("1.25px");
  });

  it("sets decorativeAllowed true only for photoStance=editorial", () => {
    const editorial = deriveBiomeFields(makeAxes({ photoStance: "editorial" }));
    const documentary = deriveBiomeFields(makeAxes({ photoStance: "documentary" }));
    expect(editorial.geometry.decorativeAllowed).toBe(true);
    expect(documentary.geometry.decorativeAllowed).toBe(false);
  });
});

describe("deriveSiteBackground", () => {
  it("returns single color layer for static + none", () => {
    const bg = deriveSiteBackground(makeAxes({ motionStance: "static", photoStance: "none" }));
    expect(bg.layers).toHaveLength(1);
    expect(bg.layers[0].kind).toBe("color");
  });

  it("returns single color layer for founder-only", () => {
    const bg = deriveSiteBackground(makeAxes({ photoStance: "founder-only" }));
    expect(bg.layers).toHaveLength(1);
    expect(bg.layers[0].kind).toBe("color");
  });

  it("returns color + vignette for documentary + non-static", () => {
    const bg = deriveSiteBackground(
      makeAxes({ photoStance: "documentary", motionStance: "restrained" }),
    );
    expect(bg.layers).toHaveLength(2);
    expect(bg.layers[0].kind).toBe("color");
    expect(bg.layers[1].kind).toBe("gradient");
  });

  it("returns single color for documentary + static (no vignette)", () => {
    const bg = deriveSiteBackground(
      makeAxes({ photoStance: "documentary", motionStance: "static" }),
    );
    expect(bg.layers).toHaveLength(1);
  });

  it("returns color + accent gradient for editorial + expressive", () => {
    const bg = deriveSiteBackground(
      makeAxes({ photoStance: "editorial", motionStance: "expressive" }),
    );
    expect(bg.layers).toHaveLength(2);
    expect(bg.layers[1].kind).toBe("gradient");
  });

  it("returns single color for editorial + non-expressive", () => {
    const bg = deriveSiteBackground(
      makeAxes({ photoStance: "editorial", motionStance: "restrained" }),
    );
    expect(bg.layers).toHaveLength(1);
  });
});
