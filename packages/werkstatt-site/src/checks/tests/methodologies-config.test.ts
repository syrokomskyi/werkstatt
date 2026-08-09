import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  parseMethodologiesConfig,
  tryLoadMethodologiesConfig,
  methodologiesConfigSchema,
  METHODOLOGIES_CONFIG_PATH,
} from "../methodologies-config.ts";

const VALID_CONFIG = `---
instruments:
  - id: accessibility-axe
    type: accessibility
    params:
      axeVersion: "4.12.1"
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

describe("methodologies-config", () => {
  describe("parseMethodologiesConfig", () => {
    it("parses a valid config", () => {
      const config = parseMethodologiesConfig(VALID_CONFIG);
      expect(config.instruments).toHaveLength(2);
      expect(config.instruments[0].id).toBe("accessibility-axe");
      expect(config.instruments[0].type).toBe("accessibility");
      expect(config.methodologies).toHaveLength(2);
      expect(config.methodologies[0].id).toBe("automated-web-accessibility");
      expect(config.methodologies[0].active).toBe(true);
      expect(config.methodologies[0].blockOn).toEqual(["high", "critical"]);
      expect(config.methodologies[1].active).toBe(false);
      expect(config.gate.aggregation).toBe("all-must-pass");
      expect(config.gate.minCoverage).toBe(1.0);
    });

    it("throws on invalid YAML frontmatter", () => {
      expect(() => parseMethodologiesConfig("no frontmatter here")).toThrow();
    });

    it("throws on missing instruments", () => {
      const bad = `---
methodologies: []
gate:
  aggregation: all-must-pass
---
`;
      expect(() => parseMethodologiesConfig(bad)).toThrow();
    });

    it("throws on invalid gate aggregation", () => {
      const bad = `---
instruments:
  - id: accessibility-axe
    type: accessibility
methodologies:
  - id: automated-web-accessibility
    instrument: accessibility-axe
    active: true
    blockOn: [high]
gate:
  aggregation: any-may-pass
---
`;
      expect(() => parseMethodologiesConfig(bad)).toThrow();
    });

    it("throws on minCoverage > 1", () => {
      const bad = `---
instruments:
  - id: accessibility-axe
    type: accessibility
methodologies:
  - id: automated-web-accessibility
    instrument: accessibility-axe
    active: true
    blockOn: [high]
gate:
  aggregation: all-must-pass
  minCoverage: 1.5
---
`;
      expect(() => parseMethodologiesConfig(bad)).toThrow();
    });
  });

  describe("tryLoadMethodologiesConfig", () => {
    let tmpDir: string;

    it("returns ok=false when file does not exist", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "methodologies-test-"));
      try {
        const result = tryLoadMethodologiesConfig(tmpDir);
        expect(result.ok).toBe(false);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("returns ok=true with config when file exists", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "methodologies-test-"));
      try {
        await mkdir(join(tmpDir, "systems"), { recursive: true });
        await writeFile(join(tmpDir, METHODOLOGIES_CONFIG_PATH), VALID_CONFIG);
        const result = tryLoadMethodologiesConfig(tmpDir);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.config.methodologies).toHaveLength(2);
        }
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("methodologiesConfigSchema", () => {
    it("accepts empty params object", () => {
      const config = methodologiesConfigSchema.parse({
        instruments: [{ id: "test", type: "accessibility", params: {} }],
        methodologies: [{ id: "test", instrument: "test", active: true, blockOn: ["high"] }],
        gate: { aggregation: "all-must-pass" },
      });
      expect(config.instruments[0].params).toEqual({});
    });

    it("defaults gate fields", () => {
      const config = methodologiesConfigSchema.parse({
        instruments: [{ id: "test", type: "accessibility", params: {} }],
        methodologies: [{ id: "test", instrument: "test", active: true, blockOn: ["high"] }],
        gate: { aggregation: "all-must-pass" },
      });
      expect(config.gate.allowIncomplete).toBe(true);
      expect(config.gate.requireEvidence).toBe(true);
      expect(config.gate.minCoverage).toBe(1.0);
    });
  });
});
