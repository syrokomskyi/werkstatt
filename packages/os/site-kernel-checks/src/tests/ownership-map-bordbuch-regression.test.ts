/*
<MODULE_CONTRACT>
  <purpose>
    Regression test: verifies that bordbuch projection files written to public/
    by bordbuch.commit are registered in GENERATOR_OWNERSHIP_MAP. Prevents
    OWN-01 failures during mission.validate when bordbuch projections appear
    in the workpiece public/ directory.
  </purpose>
  <keywords>ownership-map, bordbuch, regression, OWN-01, generator-ownership</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial regression test for bordbuch projection ownership map entries.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { GENERATOR_OWNERSHIP_MAP } from "../generator-ownership.ts";

describe("GENERATOR_OWNERSHIP_MAP: bordbuch projection entries", () => {
  const bordbuchPaths = GENERATOR_OWNERSHIP_MAP.filter((e) =>
    e.command === "bordbuch.generate" || e.module?.includes("bordbuch"),
  ).map((e) => e.path);

  it("registers public/.well-known/bordbuch.json (site-relative)", () => {
    const hasEntry = bordbuchPaths.some((p) =>
      p.endsWith("public/.well-known/bordbuch.json"),
    );
    expect(hasEntry, "public/.well-known/bordbuch.json must be in GENERATOR_OWNERSHIP_MAP").toBe(true);
  });

  it("registers public/.well-known/bordbuch/index.html (site-relative)", () => {
    const hasEntry = bordbuchPaths.some((p) =>
      p.endsWith("public/.well-known/bordbuch/index.html"),
    );
    expect(hasEntry, "public/.well-known/bordbuch/index.html must be in GENERATOR_OWNERSHIP_MAP").toBe(true);
  });
});
