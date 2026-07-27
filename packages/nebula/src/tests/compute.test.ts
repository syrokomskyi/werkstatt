import { test, expect, describe } from "vitest";
import {
  computeNebulaScore,
  createStubNebulaInputs,
  derivePerformanceScore,
  deriveAccessibilityScore,
  deriveContentHealthScore,
  deriveArchitecturalComplianceScore,
  toPassportScores,
} from "../compute.ts";
import { NEBULA_WEIGHTS, NEBULA_WEIGHTS_VERSION } from "../weights.ts";
import type { NebulaInputs } from "../types.ts";

describe("derivePerformanceScore", () => {
  test("returns clamped Lighthouse performance score", () => {
    expect(derivePerformanceScore({ performanceScore: 85, accessibilityScore: 90 })).toBe(85);
  });

  test("clamps above 100", () => {
    expect(derivePerformanceScore({ performanceScore: 150, accessibilityScore: 0 })).toBe(100);
  });

  test("clamps below 0", () => {
    expect(derivePerformanceScore({ performanceScore: -10, accessibilityScore: 0 })).toBe(0);
  });
});

describe("deriveAccessibilityScore", () => {
  test("returns base score when no violations", () => {
    expect(
      deriveAccessibilityScore(
        { performanceScore: 0, accessibilityScore: 95 },
        { totalViolations: 0 },
      ),
    ).toBe(95);
  });

  test("deducts 2 points per normal violation", () => {
    expect(
      deriveAccessibilityScore(
        { performanceScore: 0, accessibilityScore: 100 },
        { totalViolations: 5 },
      ),
    ).toBe(90);
  });

  test("deducts 5 points per critical violation", () => {
    expect(
      deriveAccessibilityScore(
        { performanceScore: 0, accessibilityScore: 100 },
        { totalViolations: 3, criticalViolations: 3 },
      ),
    ).toBe(85);
  });

  test("floors at 0", () => {
    expect(
      deriveAccessibilityScore(
        { performanceScore: 0, accessibilityScore: 10 },
        { totalViolations: 100 },
      ),
    ).toBe(0);
  });
});

describe("deriveContentHealthScore", () => {
  test("returns 100 when no checks authored", () => {
    expect(deriveContentHealthScore({ totalChecks: 0, passingChecks: 0 })).toBe(100);
  });

  test("returns ratio scaled to 100", () => {
    expect(deriveContentHealthScore({ totalChecks: 10, passingChecks: 8 })).toBe(80);
  });

  test("returns 100 when all pass", () => {
    expect(deriveContentHealthScore({ totalChecks: 10, passingChecks: 10 })).toBe(100);
  });

  test("returns 0 when none pass", () => {
    expect(deriveContentHealthScore({ totalChecks: 10, passingChecks: 0 })).toBe(0);
  });
});

describe("deriveArchitecturalComplianceScore", () => {
  test("returns 100 when no commands registered", () => {
    expect(deriveArchitecturalComplianceScore({ totalCommands: 0, passingCommands: 0 })).toBe(100);
  });

  test("returns ratio scaled to 100", () => {
    expect(deriveArchitecturalComplianceScore({ totalCommands: 20, passingCommands: 15 })).toBe(75);
  });
});

describe("computeNebulaScore", () => {
  test("stub inputs produce score 100", () => {
    const inputs = createStubNebulaInputs();
    const score = computeNebulaScore(inputs);
    expect(score.nebula).toBe(100);
  });

  test("all-zero inputs produce score 0", () => {
    const inputs: NebulaInputs = {
      lighthouse: { performanceScore: 0, accessibilityScore: 0 },
      axe: { totalViolations: 50 },
      contentChecks: { totalChecks: 10, passingChecks: 0 },
      dnaChecks: { totalCommands: 10, passingCommands: 0 },
    };
    const score = computeNebulaScore(inputs);
    expect(score.nebula).toBe(0);
  });

  test("weights version is current", () => {
    const score = computeNebulaScore(createStubNebulaInputs());
    expect(score.weightsVersion).toBe(NEBULA_WEIGHTS_VERSION);
  });

  test("pillar contributions sum to composite", () => {
    const inputs: NebulaInputs = {
      lighthouse: { performanceScore: 90, accessibilityScore: 80 },
      axe: { totalViolations: 2 },
      contentChecks: { totalChecks: 10, passingChecks: 9 },
      dnaChecks: { totalCommands: 20, passingCommands: 18 },
    };
    const score = computeNebulaScore(inputs);
    const sum = Object.values(score.pillars).reduce((a, p) => a + p.contribution, 0);
    expect(Math.round(sum)).toBe(score.nebula);
  });

  test("computedAt is ISO string", () => {
    const score = computeNebulaScore(createStubNebulaInputs());
    expect(() => new Date(score.computedAt).toISOString()).not.toThrow();
  });

  test("deterministic for identical inputs (except computedAt)", () => {
    const inputs = createStubNebulaInputs();
    const a = computeNebulaScore(inputs);
    const b = computeNebulaScore(inputs);
    expect(a.nebula).toBe(b.nebula);
    expect(a.pillars).toEqual(b.pillars);
    expect(a.weightsVersion).toBe(b.weightsVersion);
  });
});

describe("toPassportScores", () => {
  test("projects NebulaScore to passport shape", () => {
    const score = computeNebulaScore(createStubNebulaInputs());
    const projected = toPassportScores(score);
    expect(projected.nebula).toBe(score.nebula);
    expect(projected.pillars.performance.score).toBe(score.pillars.performance.score);
    expect(projected.pillars.performance.weight).toBe(score.pillars.performance.weight);
  });

  test("does not include contribution field", () => {
    const score = computeNebulaScore(createStubNebulaInputs());
    const projected = toPassportScores(score);
    expect("contribution" in projected.pillars.performance).toBe(false);
  });

  test("does not include weightsVersion or computedAt", () => {
    const score = computeNebulaScore(createStubNebulaInputs());
    const projected = toPassportScores(score);
    expect("weightsVersion" in projected).toBe(false);
    expect("computedAt" in projected).toBe(false);
  });

  test("all four pillars present", () => {
    const score = computeNebulaScore(createStubNebulaInputs());
    const projected = toPassportScores(score);
    expect(Object.keys(projected.pillars).sort()).toEqual([
      "accessibility",
      "architecturalCompliance",
      "contentHealth",
      "performance",
    ]);
  });
});

describe("NEBULA_WEIGHTS invariant", () => {
  test("weights sum to 1.0", () => {
    const sum = Object.values(NEBULA_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9);
  });
});
