import { describe, it, expect } from "vitest";
import { loadRunnerConfig } from "@service/config.ts";

describe("check-runner config", () => {
  it("loads runner config with expected shape", () => {
    const config = loadRunnerConfig();
    expect(config).toBeDefined();
    expect(typeof config.workspaceRoot).toBe("string");
    expect(config.workspaceRoot.length).toBeGreaterThan(0);
    expect(typeof config.queueDir).toBe("string");
    expect(typeof config.pollMs).toBe("number");
  });
});
