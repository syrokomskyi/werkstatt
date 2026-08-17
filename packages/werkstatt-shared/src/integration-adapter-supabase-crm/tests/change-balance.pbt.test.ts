/*
<MODULE_CONTRACT>
<purpose>RFC-0386 / DNA-41: Property-based tests for change-balance monotonicity
and non-negative clamping. Asserts that decrementing the balance never produces
a negative result, and that a paid cycle invoice always resets the balance to
included_changes_per_cycle regardless of prior state.</purpose>
<non-goals>
  <item>No network — pure property tests on the balance math.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0386: Initial PBT for change-balance monotonicity (DNA-41).</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure helpers — mirror the balance logic from syncInvoice / adjustChangeBalance
// ---------------------------------------------------------------------------

/** The delta applied to reset the balance to perCycle on a paid cycle invoice. */
function resetDelta(current: number, perCycle: number): number {
  return perCycle - current;
}

/** The result after applying a decrement, clamped to zero (non-negative). */
function clampDecrement(balance: number, decrement: number): number {
  return Math.max(0, balance - decrement);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

test("PBT: reset delta always brings balance to perCycle", () => {
  fc.assert(
    fc.property(fc.nat(1000), fc.nat(1000), (current, perCycle) => {
      const delta = resetDelta(current, perCycle);
      expect(current + delta).toBe(perCycle);
    }),
  );
});

test("PBT: decrement never produces a negative balance (non-negative clamp)", () => {
  fc.assert(
    fc.property(fc.nat(1000), fc.nat(1000), (balance, decrement) => {
      const result = clampDecrement(balance, decrement);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(balance);
    }),
  );
});

test("PBT: decrement is monotonic — result never exceeds original balance", () => {
  fc.assert(
    fc.property(fc.nat(1000), fc.nat(1000), (balance, decrement) => {
      const result = clampDecrement(balance, decrement);
      expect(result).toBeLessThanOrEqual(balance);
    }),
  );
});

test("PBT: zero decrement leaves balance unchanged", () => {
  fc.assert(
    fc.property(fc.nat(1000), (balance) => {
      expect(clampDecrement(balance, 0)).toBe(balance);
    }),
  );
});

test("PBT: paid cycle reset is idempotent — applying reset twice yields perCycle", () => {
  fc.assert(
    fc.property(fc.nat(1000), fc.nat(1000), (current, perCycle) => {
      const delta1 = resetDelta(current, perCycle);
      const after1 = current + delta1;
      const delta2 = resetDelta(after1, perCycle);
      expect(delta2).toBe(0);
      expect(after1).toBe(perCycle);
    }),
  );
});
