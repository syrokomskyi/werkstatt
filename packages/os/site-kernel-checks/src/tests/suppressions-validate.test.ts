import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runSuppressionsValidate } from "../suppressions-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
      debug: () => {},
    },
  } as unknown as KernelRuntimeContext;
}

const dummyInput: KernelCommandInput = {
  flags: {},
  argv: [],
};

describe("runSuppressionsValidate", () => {
  it("warns when config file not found", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.exitCode).toBe(0);
      expect(result.data?.diagnostics).toHaveLength(1);
      expect(result.data?.diagnostics[0].ruleId).toBe("SUPPRESS-VAL-01");
      expect(result.data?.diagnostics[0].severity).toBe("warning");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("passes on valid config", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: seo-runtime.canonical-mismatch\n    category: channel-mismatch\n    channelNot: main\n    reason: "Dev channel mismatch"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
      expect(result.data?.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("errors on schema violation", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    reason: "missing category"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-02")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("errors on conflicting rules", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    reason: "first"\n  - ruleId: test-rule\n    category: test\n    reason: "duplicate"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-03")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("warns on broad messagePattern", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    messagePattern: "error"\n    reason: "broad pattern"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-04")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("warns on unknown ruleId when evidence exists", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: non-existent-rule\n    category: test\n    reason: "unknown rule"\n`,
      );
      mkdirSync(join(tmpDir, "missions", "m000001", "evidence", "axiom"), {
        recursive: true,
      });
      writeFileSync(
        join(tmpDir, "missions", "m000001", "evidence", "axiom", "study-run.json"),
        JSON.stringify({
          findings: [{ ruleId: "known-rule-1" }, { ruleId: "known-rule-2" }],
        }),
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-05")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not warn on unknown ruleId when no evidence exists", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: non-existent-rule\n    category: test\n    reason: "unknown rule"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-05")).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("warns SUPPRESS-VAL-06 when messagePattern used without titlePattern", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    messagePattern: "some specific pattern here"\n    reason: "deprecated field"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-06")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("warns SUPPRESS-VAL-06 when descriptionPattern used without titlePattern", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    descriptionPattern: "some specific pattern here"\n    reason: "deprecated field"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-06")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not warn SUPPRESS-VAL-06 when messagePattern used with titlePattern", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    messagePattern: "some specific pattern here"\n    titlePattern: "specific title pattern"\n    reason: "has fallback"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-06")).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not warn SUPPRESS-VAL-06 when neither messagePattern nor descriptionPattern used", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    titlePattern: "specific title pattern"\n    reason: "titlePattern only"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-06")).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("warns SUPPRESS-VAL-04 on broad titlePattern (single word)", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-val-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, "systems/axiom-suppressions.yaml"),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    titlePattern: "error"\n    reason: "broad titlePattern"\n`,
      );
      const result = await runSuppressionsValidate(dummyInput, makeContext(tmpDir));
      expect(result.data?.diagnostics.some((d) => d.ruleId === "SUPPRESS-VAL-04")).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});
