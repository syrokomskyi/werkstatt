import { describe, it, expect } from "vitest";
import {
  diagnosticsResult,
  passResult,
  failResult,
  resultFromViolations,
} from "../result-helpers.ts";
import { unwrapData } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Pure function tests for the RFC-0203 canonical result builders:
    diagnosticsResult, passResult, failResult, resultFromViolations.
    These are the single source of truth for exit-code propagation —
    drift here breaks every check command.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 16 unit tests covering all 4 exported builders.</item>
</CHANGE_SUMMARY>
*/

describe("diagnosticsResult", () => {
  it("exits 0 when all diagnostics are warnings", () => {
    const result = diagnosticsResult("test.cmd", [
      { ruleId: "W-01", severity: "warning", message: "soft" },
    ]);
    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.status).toBe("warn");
    expect(data.summary.warning).toBe(1);
    expect(data.summary.error).toBe(0);
  });

  it("exits 0 when all diagnostics are info", () => {
    const result = diagnosticsResult("test.cmd", [
      { ruleId: "I-01", severity: "info", message: "fyi" },
    ]);
    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.status).toBe("pass");
    expect(data.summary.info).toBe(1);
  });

  it("exits 1 when any diagnostic is error", () => {
    const result = diagnosticsResult("test.cmd", [
      { ruleId: "E-01", severity: "error", message: "bad" },
      { ruleId: "W-01", severity: "warning", message: "soft" },
    ]);
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.status).toBe("fail");
    expect(data.summary.error).toBe(1);
    expect(data.summary.warning).toBe(1);
  });

  it("returns pass status for empty diagnostics", () => {
    const result = diagnosticsResult("test.cmd", []);
    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.status).toBe("pass");
    expect(data.diagnostics).toEqual([]);
  });

  it("includes command name in summary string", () => {
    const result = diagnosticsResult("my.cmd", []);
    expect(result.summary).toContain("my.cmd");
  });
});

describe("passResult", () => {
  it("exits 0 with pass status and empty diagnostics", () => {
    const result = passResult("test.cmd");
    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.status).toBe("pass");
    expect(data.diagnostics).toEqual([]);
    expect(data.summary).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("uses default summary when none provided", () => {
    const result = passResult("test.cmd");
    expect(result.summary).toBe("test.cmd: OK");
  });

  it("uses custom summary when provided", () => {
    const result = passResult("test.cmd", "custom message");
    expect(result.summary).toBe("custom message");
  });
});

describe("failResult", () => {
  it("exits 1 with fail status", () => {
    const result = failResult("test.cmd", ["violation 1"]);
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.status).toBe("fail");
  });

  it("maps violation strings to error diagnostics with command as ruleId", () => {
    const data = unwrapData(failResult("test.cmd", ["bad thing", "worse thing"]));
    expect(data.diagnostics).toHaveLength(2);
    expect(data.diagnostics[0]).toEqual({
      ruleId: "TEST.CMD",
      severity: "error",
      message: "bad thing",
    });
    expect(data.diagnostics[1]).toEqual({
      ruleId: "TEST.CMD",
      severity: "error",
      message: "worse thing",
    });
  });

  it("counts violations in summary", () => {
    const result = failResult("test.cmd", ["a", "b", "c"]);
    expect(unwrapData(result).summary.error).toBe(3);
    expect(result.summary).toContain("3 violation(s)");
  });
});

describe("resultFromViolations", () => {
  it("returns pass result when violations is empty", () => {
    const result = resultFromViolations("test.cmd", []);
    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).status).toBe("pass");
  });

  it("returns fail result when violations are present", () => {
    const result = resultFromViolations("test.cmd", ["one"]);
    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.status).toBe("fail");
    expect(data.diagnostics).toHaveLength(1);
  });
});
