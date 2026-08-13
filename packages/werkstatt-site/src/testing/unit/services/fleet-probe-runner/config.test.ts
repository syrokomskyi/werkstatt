import { describe, it, expect } from "vitest";
import { loadConfig } from "@service/config.ts";

describe("fleet-probe-runner config", () => {
  it("loads probe config with expected shape", () => {
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(typeof config.probeIntervalMs).toBe("number");
    expect(typeof config.concurrency).toBe("number");
    expect(typeof config.requestTimeoutMs).toBe("number");
  });
});
