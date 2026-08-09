import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { runMethodologiesValidate } from "../methodologies-validate.ts";
import { makeTestContext, testInput, unwrapData } from "./helpers.ts";

const VALID_CONFIG = `---
instruments:
  - id: accessibility-axe
    type: accessibility
    params: {}
  - id: visual-regression
    type: visual-regression
    params: {}

methodologies:
  - id: automated-web-accessibility
    instrument: accessibility-axe
    active: true
    blockOn: [high, critical]
  - id: visual-regression
    instrument: visual-regression
    active: false
    blockOn: [critical]

gate:
  aggregation: all-must-pass
  allowIncomplete: true
  requireEvidence: true
  minCoverage: 1.0
---

# Methodologies
`;

describe("methodologies.validate", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "meth-val-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("passes with valid config", async () => {
    await mkdir(join(tmpDir, "systems"), { recursive: true });
    await writeFile(join(tmpDir, "systems", "methodologies.md"), VALID_CONFIG);

    const result = await runMethodologiesValidate(testInput(), makeTestContext(tmpDir));
    expect(result.exitCode ?? 0).toBe(0);
    const data = unwrapData(result);
    expect(data.diagnostics).toHaveLength(0);
  });

  it("fails with METH-VAL-01 when file not found", async () => {
    const result = await runMethodologiesValidate(testInput(), makeTestContext(tmpDir));
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics[0].ruleId).toBe("METH-VAL-01");
  });

  it("fails with METH-VAL-02 on schema violation", async () => {
    await mkdir(join(tmpDir, "systems"), { recursive: true });
    await writeFile(
      join(tmpDir, "systems", "methodologies.md"),
      `---
instruments: not-an-array
methodologies: []
gate:
  aggregation: all-must-pass
---
`,
    );

    const result = await runMethodologiesValidate(testInput(), makeTestContext(tmpDir));
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics.some((d) => d.ruleId === "METH-VAL-02")).toBe(true);
  });

  it("fails with METH-VAL-03 on unknown methodology id", async () => {
    await mkdir(join(tmpDir, "systems"), { recursive: true });
    await writeFile(
      join(tmpDir, "systems", "methodologies.md"),
      `---
instruments:
  - id: accessibility-axe
    type: accessibility
    params: {}
methodologies:
  - id: not-a-known-methodology
    instrument: accessibility-axe
    active: true
    blockOn: [high]
gate:
  aggregation: all-must-pass
---
`,
    );

    const result = await runMethodologiesValidate(testInput(), makeTestContext(tmpDir));
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics.some((d) => d.ruleId === "METH-VAL-03")).toBe(true);
  });

  it("fails with METH-VAL-04 on unknown instrument reference", async () => {
    await mkdir(join(tmpDir, "systems"), { recursive: true });
    await writeFile(
      join(tmpDir, "systems", "methodologies.md"),
      `---
instruments:
  - id: accessibility-axe
    type: accessibility
    params: {}
methodologies:
  - id: automated-web-accessibility
    instrument: nonexistent-instrument
    active: true
    blockOn: [high]
gate:
  aggregation: all-must-pass
---
`,
    );

    const result = await runMethodologiesValidate(testInput(), makeTestContext(tmpDir));
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics.some((d) => d.ruleId === "METH-VAL-04")).toBe(true);
  });
});
