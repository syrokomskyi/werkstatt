import { test, expect } from "vitest";
import { buildPage, type PageEntry } from "../page.ts";
import { EMPTY_RUNTIME_CONTEXT } from "../runtime-context.ts";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0262: verify buildPage's validateProps hook is called per resolved
  block (with the block id) and that a thrown violation propagates —
  buildPage never swallows a validateProps error (fail-fast contract).
</purpose>
<non-goals>
  <item>Do not test real propsSchema resolution here — see dev-props-validator's own schema-shape checks, exercised indirectly via props-contract.test.ts's validateExampleAgainstSchema (identical logic).</item>
</non-goals>
</MODULE_CONTRACT>
*/

function fixtureEntry(): PageEntry {
  return {
    kind: "page",
    cosmicStar: "TestStar",
    title: "Test",
    description: "Test page",
    lang: "en",
    blocks: [
      {
        id: "fixture-block",
        type: "FixturePlanet",
        props: { extra: "not-in-schema" },
      },
    ],
  };
}

test("buildPage: validateProps is called with planetName, props, and blockId", async () => {
  const entry = fixtureEntry();
  const ctx = EMPTY_RUNTIME_CONTEXT("en");
  const calls: Array<{
    planetName: string;
    props: Record<string, unknown>;
    blockId: string | null;
  }> = [];

  const page = await buildPage(entry, ctx, {
    resolveImportPath: () => "@warpgogol/ui/sections/fixture-section.astro",
    validateProps: async (planetName, props, blockId) => {
      calls.push({ planetName, props, blockId });
    },
  });

  expect(page.blocks.length).toBe(1);
  expect(calls.length).toBe(1);
  expect(calls[0]?.planetName).toBe("FixturePlanet");
  expect(calls[0]?.blockId).toBe("fixture-block");
  expect(calls[0]?.props).toEqual({ extra: "not-in-schema" });
});

test("buildPage: a validateProps throw (PAGE-PROPS-01) propagates and includes the block id", async () => {
  const entry = fixtureEntry();
  const ctx = EMPTY_RUNTIME_CONTEXT("en");

  try {
    await buildPage(entry, ctx, {
      resolveImportPath: () => "@warpgogol/ui/sections/fixture-section.astro",
      validateProps: async (_planetName, props, blockId) => {
        if ("extra" in props) {
          throw new Error(
            `[PAGE-PROPS-01] block "${blockId}" (FixturePlanet): unknown property "extra"`,
          );
        }
      },
    });
    expect.fail("should have thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/PAGE-PROPS-01/);
    expect((error as Error).message).toMatch(/fixture-block/);
  }
});

test("buildPage: without validateProps, no hook is invoked (opt-in, zero behavior change)", async () => {
  const entry = fixtureEntry();
  const ctx = EMPTY_RUNTIME_CONTEXT("en");
  const page = await buildPage(entry, ctx, {
    resolveImportPath: () => "@warpgogol/ui/sections/fixture-section.astro",
  });
  expect(page.blocks.length).toBe(1);
});
