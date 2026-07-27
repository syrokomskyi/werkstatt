import { describe, it, expect } from "vitest";
import {
  PBP_SEMANTIC_STATUSES,
  isPbpSemanticStatus,
  type PbpSemanticStatus,
} from "../src/semantic-status.js";

describe("PbpSemanticStatus", () => {
  it("exports the 8-value closed vocabulary", () => {
    expect(PBP_SEMANTIC_STATUSES).toEqual([
      "declared",
      "derived",
      "not-declared",
      "not-applicable",
      "unavailable",
      "invalid",
      "stale",
      "not-comparable",
    ]);
  });

  it("isPbpSemanticStatus narrows correctly", () => {
    expect(isPbpSemanticStatus("declared")).toBe(true);
    expect(isPbpSemanticStatus("not-declared")).toBe(true);
    expect(isPbpSemanticStatus("invalid")).toBe(true);
    expect(isPbpSemanticStatus("not-a-status")).toBe(false);
    expect(isPbpSemanticStatus("")).toBe(false);
  });
});
