/*
<MODULE_CONTRACT>
  <purpose>RFC-0591: property-based tests for calculateTargetBitrate two-pass bitrate calculation.</purpose>
  <keywords>RFC-0591, PBT, fast-check, calculateTargetBitrate, two-pass, bitrate</keywords>
  <responsibilities>
    <item>Verify formula correctness: videoBitrate = floor(maxSizeMb * 1024 * 1024 * 8 / durationSec) - 128000.</item>
    <item>Verify monotonicity in maxSizeMb: increasing maxSizeMb never decreases videoBitrate.</item>
    <item>Verify inverse proportionality to durationSec: increasing durationSec never increases videoBitrate.</item>
    <item>Verify null return on zero/negative maxSizeMb or durationSec.</item>
    <item>Verify audioBitrate is constant 128000 for all non-null results.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="pbt-calculate-target-bitrate">Property-based tests for calculateTargetBitrate (RFC-0591).</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0591: initial PBT for calculateTargetBitrate two-pass bitrate calculation.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import fc from "fast-check";
import { calculateTargetBitrate } from "../video/video-variants.ts";

const AUDIO_BITRATE_BPS = 128_000;

const positiveInput = fc.record({
  maxSizeMb: fc.float({ min: Math.fround(0.1), max: 100, noNaN: true }),
  durationSec: fc.float({ min: Math.fround(0.1), max: 600, noNaN: true }),
});

test("PBT: formula correctness — videoBitrate = floor(maxSizeMb * 1024 * 1024 * 8 / durationSec) - 128000", () => {
  fc.assert(
    fc.property(positiveInput, ({ maxSizeMb, durationSec }) => {
      const result = calculateTargetBitrate(durationSec, maxSizeMb);
      if (!result) return;
      const expectedTotal = Math.floor((maxSizeMb * 1024 * 1024 * 8) / durationSec);
      const expectedVideo = expectedTotal - AUDIO_BITRATE_BPS;
      if (expectedVideo <= 0) {
        expect(result).toBeNull();
        return;
      }
      expect(result.videoBitrate).toBe(expectedVideo);
    }),
  );
});

test("PBT: monotonicity in maxSizeMb — increasing maxSizeMb never decreases videoBitrate", () => {
  fc.assert(
    fc.property(
      fc.record({
        durationSec: fc.float({ min: 1, max: 600, noNaN: true }),
        small: fc.float({ min: 1, max: 50, noNaN: true }),
        delta: fc.float({ min: Math.fround(0.1), max: 50, noNaN: true }),
      }),
      ({ durationSec, small, delta }) => {
        const a = calculateTargetBitrate(durationSec, small);
        const b = calculateTargetBitrate(durationSec, small + delta);
        if (a && b) {
          expect(b.videoBitrate).toBeGreaterThanOrEqual(a.videoBitrate);
        }
      },
    ),
  );
});

test("PBT: inverse proportionality to durationSec — increasing durationSec never increases videoBitrate", () => {
  fc.assert(
    fc.property(
      fc.record({
        maxSizeMb: fc.float({ min: 1, max: 100, noNaN: true }),
        small: fc.float({ min: 1, max: 300, noNaN: true }),
        delta: fc.float({ min: Math.fround(0.1), max: 300, noNaN: true }),
      }),
      ({ maxSizeMb, small, delta }) => {
        const a = calculateTargetBitrate(small, maxSizeMb);
        const b = calculateTargetBitrate(small + delta, maxSizeMb);
        if (a && b) {
          expect(b.videoBitrate).toBeLessThanOrEqual(a.videoBitrate);
        }
      },
    ),
  );
});

test("PBT: null on zero or negative maxSizeMb", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(0), fc.float({ min: -100, max: Math.fround(-0.1), noNaN: true })),
      fc.float({ min: Math.fround(0.1), max: 600, noNaN: true }),
      (maxSizeMb, durationSec) => {
        expect(calculateTargetBitrate(durationSec, maxSizeMb)).toBeNull();
      },
    ),
  );
});

test("PBT: null on zero, negative, or undefined durationSec", () => {
  fc.assert(
    fc.property(
      fc.float({ min: Math.fround(0.1), max: 100, noNaN: true }),
      fc.oneof(fc.constant(0), fc.float({ min: -100, max: Math.fround(-0.1), noNaN: true })),
      (maxSizeMb, durationSec) => {
        expect(calculateTargetBitrate(durationSec, maxSizeMb)).toBeNull();
      },
    ),
  );
  expect(calculateTargetBitrate(undefined, 24)).toBeNull();
});

test("PBT: audioBitrate is constant 128000 for all non-null results", () => {
  fc.assert(
    fc.property(positiveInput, ({ maxSizeMb, durationSec }) => {
      const result = calculateTargetBitrate(durationSec, maxSizeMb);
      if (result) {
        expect(result.audioBitrate).toBe(AUDIO_BITRATE_BPS);
      }
    }),
  );
});
