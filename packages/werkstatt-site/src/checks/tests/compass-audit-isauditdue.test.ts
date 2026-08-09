import { describe, it, expect } from "vitest";
import { isAuditDue } from "../compass-audit.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Property-based tests for isAuditDue — the pure threshold gate that
    determines whether a file is audit-overdue in compass.audit.validate.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 6 unit tests covering null, threshold boundary, and edge cases.</item>
</CHANGE_SUMMARY>
*/

describe("isAuditDue", () => {
  it("returns true when audited is null (never audited)", () => {
    expect(isAuditDue(1, null, 30)).toBe(true);
    expect(isAuditDue(100, null, 30)).toBe(true);
  });

  it("returns true when current - audited >= threshold", () => {
    expect(isAuditDue(31, 1, 30)).toBe(true);
    expect(isAuditDue(30, 0, 30)).toBe(true);
    expect(isAuditDue(60, 30, 30)).toBe(true);
  });

  it("returns false when current - audited < threshold", () => {
    expect(isAuditDue(30, 1, 30)).toBe(false);
    expect(isAuditDue(29, 0, 30)).toBe(false);
    expect(isAuditDue(1, 1, 30)).toBe(false);
  });

  it("handles edge case: audited equals current", () => {
    expect(isAuditDue(5, 5, 30)).toBe(false);
    expect(isAuditDue(5, 5, 0)).toBe(true);
  });

  it("handles threshold of 0 (always due)", () => {
    expect(isAuditDue(1, 1, 0)).toBe(true);
    expect(isAuditDue(0, 0, 0)).toBe(true);
  });

  it("handles threshold of 1 (due on any revision difference)", () => {
    expect(isAuditDue(2, 1, 1)).toBe(true);
    expect(isAuditDue(1, 1, 1)).toBe(false);
  });
});
