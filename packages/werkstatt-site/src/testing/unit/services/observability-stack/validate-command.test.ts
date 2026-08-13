import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("observability-stack validation command", () => {
  it("observability.stack.validate command file exists in the workspace", () => {
    const commandTablePath = resolve(
      __dirname,
      "../../../../checks/command-tables/30-check-warpgogol.ts",
    );
    expect(existsSync(commandTablePath)).toBe(true);
  });
});
