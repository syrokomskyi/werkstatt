import { test, expect } from "vitest";
import { createDevPropsValidator } from "../dev-props-validator.ts";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0262: end-to-end test of createDevPropsValidator against the real
  packages/werkstatt-site/src/domain/ui/sections/hero manifest (this test runs from within the
  actual monorepo checkout, so workspace-root discovery resolves for real).
</purpose>
</MODULE_CONTRACT>
*/

test("createDevPropsValidator: passes valid Europa (hero-section) props", async () => {
  const validate = createDevPropsValidator();
  await validate("Europa", { header: { heading: "Hello" } }, "hero-block"); // cosmic-literals-ignore: fixture cosmicName exercising the real hero-section manifest
});

test("createDevPropsValidator: throws PAGE-PROPS-01 on an undeclared prop key", async () => {
  const validate = createDevPropsValidator();
  try {
    await validate(
      "Europa", // cosmic-literals-ignore: fixture cosmicName exercising the real hero-section manifest
      { header: { heading: "Hello" }, totallyUnknownField: true },
      "hero-block",
    ); // cosmic-literals-ignore: fixture cosmicName exercising the real hero-section manifest
    expect.fail("should have thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/PAGE-PROPS-01/);
    expect((error as Error).message).toMatch(/hero-block/);
  }
});

test("createDevPropsValidator: an unknown planetName resolves no schema and does not throw", async () => {
  const validate = createDevPropsValidator();
  await validate("NotARealPlanet", { anything: true }, null);
});
