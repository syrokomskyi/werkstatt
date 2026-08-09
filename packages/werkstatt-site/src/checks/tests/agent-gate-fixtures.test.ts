import { describe, expect, it } from "vitest";
import { parseVitestSummary } from "../agent/agent-gate-fixtures.ts";

describe("agent.gate.fixtures.run", () => {
  it("parses vitest pass counts from the fixture runner output", () => {
    const summary = parseVitestSummary(
      "\n Test Files  2 passed (2)\n      Tests  27 passed (27)\n",
      0,
    );

    expect(summary).toEqual({ passed: 27, failed: 0 });
  });

  it("treats an unparseable non-zero vitest run as one failed fixture", () => {
    expect(parseVitestSummary("unexpected runner crash", 1)).toEqual({ passed: 0, failed: 1 });
  });
});
