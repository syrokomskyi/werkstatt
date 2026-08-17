/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0870: Regression test verifying that committed generated manifest paths
    are registered in GENERATOR_OWNERSHIP_MAP with correct markerPolicy and
    conditional flags.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0870: initial regression test for manifest ownership entries.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { GENERATOR_OWNERSHIP_MAP } from "../generator-ownership.ts";

describe("GENERATOR_OWNERSHIP_MAP: RFC-0870 manifest entries", () => {
  const manifestPaths = [
    "src/image-variants.generated.yaml",
    "src/video-manifest.generated.yaml",
    "src/live-video-manifest.generated.yaml",
  ];

  for (const manifestPath of manifestPaths) {
    it(`registers ${manifestPath} as registry-only conditional`, () => {
      const entry = GENERATOR_OWNERSHIP_MAP.find((e) => e.path === manifestPath);
      expect(entry, `${manifestPath} must be in GENERATOR_OWNERSHIP_MAP`).toBeDefined();
      expect(entry?.markerPolicy).toBe("registry-only");
      expect(entry?.conditional).toBe(true);
      expect(entry?.command).toBeTruthy();
      expect(entry?.module).toBeTruthy();
    });
  }

  it("image-variants.generated.yaml is owned by image.variants.generate", () => {
    const entry = GENERATOR_OWNERSHIP_MAP.find(
      (e) => e.path === "src/image-variants.generated.yaml",
    );
    expect(entry?.command).toBe("image.variants.generate");
  });

  it("video-manifest.generated.yaml is owned by video.variants.generate", () => {
    const entry = GENERATOR_OWNERSHIP_MAP.find(
      (e) => e.path === "src/video-manifest.generated.yaml",
    );
    expect(entry?.command).toBe("video.variants.generate");
  });

  it("live-video-manifest.generated.yaml is owned by live.variants.generate", () => {
    const entry = GENERATOR_OWNERSHIP_MAP.find(
      (e) => e.path === "src/live-video-manifest.generated.yaml",
    );
    expect(entry?.command).toBe("live.variants.generate");
  });
});
