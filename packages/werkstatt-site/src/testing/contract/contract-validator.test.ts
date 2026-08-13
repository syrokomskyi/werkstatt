import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContractValidate, runContractList } from "./contract-validator.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    siteExplicit: false,
    dryRun: false,
    outputFormat: "pretty",
    logger: {
      section: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      event: vi.fn(),
      getEvents: vi.fn(() => []),
    },
    io: {} as never,
  };
}

describe("contract.list", () => {
  it("returns all registered contracts", async () => {
    const ctx = makeContext("/tmp");
    const result = await runContractList({ argv: [], flags: {} }, ctx);
    expect(result.exitCode).toBe(0);
    expect(result.data?.contracts.length).toBeGreaterThan(0);
    const ids = result.data?.contracts.map((c) => c.id);
    expect(ids).toContain("send-message");
    expect(ids).toContain("integration-route");
    expect(ids).toContain("health");
  });

  it("includes id, name, direction, version, and description for each contract", async () => {
    const ctx = makeContext("/tmp");
    const result = await runContractList({ argv: [], flags: {} }, ctx);
    const first = result.data?.contracts[0];
    expect(first).toBeDefined();
    expect(typeof first?.id).toBe("string");
    expect(typeof first?.name).toBe("string");
    expect(typeof first?.direction).toBe("string");
    expect(typeof first?.version).toBe("number");
    expect(typeof first?.description).toBe("string");
  });
});

describe("contract.validate", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tmp-contract-validate-"));
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns diagnostics with exitCode 0 when contracts are valid", async () => {
    const ctx = makeContext(tmpDir);
    const result = await runContractValidate({ argv: [], flags: {} }, ctx);
    expect(result.exitCode).toBe(0);
    expect(result.data).toBeDefined();
  });

  it("emits CONTRACT-03 warnings for contracts not imported by site-side code", async () => {
    const ctx = makeContext(tmpDir);
    const result = await runContractValidate({ argv: [], flags: {} }, ctx);
    const diagnostics = result.data?.diagnostics ?? [];
    const contract03 = diagnostics.filter((d) => d.ruleId === "CONTRACT-03");
    // In a temp dir with no site code, most contracts should warn
    expect(contract03.length).toBeGreaterThan(0);
    for (const d of contract03) {
      expect(d.severity).toBe("warning");
    }
  });

  it("emits CONTRACT-04 warnings for contracts not imported by service-side code", async () => {
    const ctx = makeContext(tmpDir);
    const result = await runContractValidate({ argv: [], flags: {} }, ctx);
    const diagnostics = result.data?.diagnostics ?? [];
    const contract04 = diagnostics.filter((d) => d.ruleId === "CONTRACT-04");
    expect(contract04.length).toBeGreaterThan(0);
    for (const d of contract04) {
      expect(d.severity).toBe("warning");
    }
  });

  it("does not emit CONTRACT-03 when site-side code imports the contract", async () => {
    const siteDir = join(tmpDir, "packages", "werkstatt-site", "src", "domain", "ui");
    await mkdir(siteDir, { recursive: true });
    await writeFile(
      join(siteDir, "test-handler.ts"),
      `import { SendMessageRequestSchema } from "@warpgogol/werkstatt-site/testing/contract";\n// send-message\nexport const handler = SendMessageRequestSchema;\n`,
    );

    const ctx = makeContext(tmpDir);
    const result = await runContractValidate({ argv: [], flags: {} }, ctx);
    const diagnostics = result.data?.diagnostics ?? [];
    const contract03ForSendMessage = diagnostics.filter(
      (d) => d.ruleId === "CONTRACT-03" && d.message.includes("send-message"),
    );
    expect(contract03ForSendMessage.length).toBe(0);
  });

  it("does not emit CONTRACT-04 when service-side code imports the contract", async () => {
    const serviceDir = join(tmpDir, "services", "maturity-score", "src");
    await mkdir(serviceDir, { recursive: true });
    await writeFile(
      join(serviceDir, "index.ts"),
      `import { MaturityScoreRequestSchema } from "@warpgogol/werkstatt-site/testing/contract";\n// maturity-score\nexport const handler = MaturityScoreRequestSchema;\n`,
    );

    const ctx = makeContext(tmpDir);
    const result = await runContractValidate({ argv: [], flags: {} }, ctx);
    const diagnostics = result.data?.diagnostics ?? [];
    const contract04ForMaturity = diagnostics.filter(
      (d) => d.ruleId === "CONTRACT-04" && d.message.includes("maturity-score"),
    );
    expect(contract04ForMaturity.length).toBe(0);
  });
});
