import { test, expect } from "vitest";
import fc from "fast-check";
import {
  computeNebulaScore,
  derivePerformanceScore,
  deriveAccessibilityScore,
  deriveContentHealthScore,
  deriveArchitecturalComplianceScore,
  createStubNebulaInputs,
  toPassportScores,
} from "../compute.ts";
import type { NebulaInputs } from "../types.ts";

test("PBT: computeNebulaScore is deterministic for identical inputs", () => {
  fc.assert(
    fc.property(
      fc.record({
        performanceScore: fc.float({ min: 0, max: 100, noNaN: true }),
        accessibilityScore: fc.float({ min: 0, max: 100, noNaN: true }),
      }),
      fc.record({
        totalViolations: fc.integer({ min: 0, max: 100 }),
        criticalViolations: fc.integer({ min: 0, max: 50 }),
      }),
      fc.record({
        totalChecks: fc.integer({ min: 0, max: 200 }),
        passingChecks: fc.integer({ min: 0, max: 200 }),
      }),
      fc.record({
        totalCommands: fc.integer({ min: 0, max: 100 }),
        passingCommands: fc.integer({ min: 0, max: 100 }),
      }),
      (lighthouse, axe, contentChecks, dnaChecks) => {
        const inputs: NebulaInputs = { lighthouse, axe, contentChecks, dnaChecks };
        const a = computeNebulaScore(inputs);
        const b = computeNebulaScore(inputs);
        expect(a.nebula).toBe(b.nebula);
        expect(a.weightsVersion).toBe(b.weightsVersion);
      },
    ),
  );
});

test("PBT: nebula score is always in [0, 100]", () => {
  fc.assert(
    fc.property(
      fc.record({
        performanceScore: fc.float({ min: -50, max: 150, noNaN: true }),
        accessibilityScore: fc.float({ min: -50, max: 150, noNaN: true }),
      }),
      fc.record({
        totalViolations: fc.integer({ min: 0, max: 500 }),
        criticalViolations: fc.integer({ min: 0, max: 200 }),
      }),
      fc.record({
        totalChecks: fc.integer({ min: 0, max: 500 }),
        passingChecks: fc.integer({ min: 0, max: 500 }),
      }),
      fc.record({
        totalCommands: fc.integer({ min: 0, max: 200 }),
        passingCommands: fc.integer({ min: 0, max: 200 }),
      }),
      (lighthouse, axe, contentChecks, dnaChecks) => {
        const inputs: NebulaInputs = { lighthouse, axe, contentChecks, dnaChecks };
        const score = computeNebulaScore(inputs);
        expect(score.nebula).toBeGreaterThanOrEqual(0);
        expect(score.nebula).toBeLessThanOrEqual(100);
      },
    ),
  );
});

test("PBT: derivePerformanceScore always returns [0, 100]", () => {
  fc.assert(
    fc.property(
      fc.record({
        performanceScore: fc.float({ min: -1000, max: 1000, noNaN: true }),
        accessibilityScore: fc.float({ min: 0, max: 100, noNaN: true }),
      }),
      (lighthouse) => {
        const score = derivePerformanceScore(lighthouse);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      },
    ),
  );
});

test("PBT: deriveAccessibilityScore always returns [0, 100]", () => {
  fc.assert(
    fc.property(
      fc.record({
        performanceScore: fc.float({ min: 0, max: 100, noNaN: true }),
        accessibilityScore: fc.float({ min: -100, max: 200, noNaN: true }),
      }),
      fc.record({
        totalViolations: fc.integer({ min: 0, max: 1000 }),
        criticalViolations: fc.integer({ min: 0, max: 500 }),
      }),
      (lighthouse, axe) => {
        const score = deriveAccessibilityScore(lighthouse, axe);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      },
    ),
  );
});

test("PBT: deriveContentHealthScore always returns [0, 100]", () => {
  fc.assert(
    fc.property(
      fc.record({
        totalChecks: fc.integer({ min: 0, max: 500 }),
        passingChecks: fc.integer({ min: 0, max: 500 }),
      }),
      (contentChecks) => {
        const score = deriveContentHealthScore(contentChecks);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      },
    ),
  );
});

test("PBT: deriveArchitecturalComplianceScore always returns [0, 100]", () => {
  fc.assert(
    fc.property(
      fc.record({
        totalCommands: fc.integer({ min: 0, max: 200 }),
        passingCommands: fc.integer({ min: 0, max: 200 }),
      }),
      (dnaChecks) => {
        const score = deriveArchitecturalComplianceScore(dnaChecks);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      },
    ),
  );
});

test("PBT: toPassportScores preserves nebula and pillar scores/weights", () => {
  fc.assert(
    fc.property(
      fc.record({
        performanceScore: fc.float({ min: 0, max: 100, noNaN: true }),
        accessibilityScore: fc.float({ min: 0, max: 100, noNaN: true }),
      }),
      fc.record({
        totalViolations: fc.integer({ min: 0, max: 100 }),
        criticalViolations: fc.integer({ min: 0, max: 50 }),
      }),
      fc.record({
        totalChecks: fc.integer({ min: 0, max: 200 }),
        passingChecks: fc.integer({ min: 0, max: 200 }),
      }),
      fc.record({
        totalCommands: fc.integer({ min: 0, max: 100 }),
        passingCommands: fc.integer({ min: 0, max: 100 }),
      }),
      (lighthouse, axe, contentChecks, dnaChecks) => {
        const inputs: NebulaInputs = { lighthouse, axe, contentChecks, dnaChecks };
        const score = computeNebulaScore(inputs);
        const passport = toPassportScores(score);
        expect(passport.nebula).toBe(score.nebula);
        expect(passport.pillars.performance.score).toBe(score.pillars.performance.score);
        expect(passport.pillars.performance.weight).toBe(score.pillars.performance.weight);
      },
    ),
  );
});

test("PBT: stub inputs produce a perfect score of 100", () => {
  const stub = createStubNebulaInputs();
  const score = computeNebulaScore(stub);
  expect(score.nebula).toBe(100);
});
