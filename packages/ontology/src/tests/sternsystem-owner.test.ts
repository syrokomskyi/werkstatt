import { test, expect, describe } from "vitest";
import { fleetRegistryEntrySchema } from "../operations/sternsystem.ts";

const validBaseEntry = {
  id: "test-site",
  cosmicStar: "Vega",
  repo: "https://github.com/org/test-site",
  pinnedPlatform: "1.0.0",
  currentMission: null,
  lastRelease: null,
  status: "registered" as const,
  registeredAt: "2026-07-27T00:00:00Z",
  notes: "",
};

describe("fleetRegistryEntrySchema owner field (RFC-0561)", () => {
  test("accepts entry without owner (backwards compatible)", () => {
    const result = fleetRegistryEntrySchema.parse(validBaseEntry);
    expect(result.owner).toBeUndefined();
  });

  test("accepts entry with valid did:web owner", () => {
    const result = fleetRegistryEntrySchema.parse({
      ...validBaseEntry,
      owner: "did:web:warpgogol.com#operator-v1",
    });
    expect(result.owner).toBe("did:web:warpgogol.com#operator-v1");
  });

  test("rejects entry with non-did:web owner", () => {
    expect(() =>
      fleetRegistryEntrySchema.parse({
        ...validBaseEntry,
        owner: "not-a-did",
      }),
    ).toThrow();
  });

  test("rejects entry with empty string owner", () => {
    expect(() =>
      fleetRegistryEntrySchema.parse({
        ...validBaseEntry,
        owner: "",
      }),
    ).toThrow();
  });

  test("rejects entry with did:web but no key-version fragment", () => {
    expect(() =>
      fleetRegistryEntrySchema.parse({
        ...validBaseEntry,
        owner: "did:web:warpgogol.com",
      }),
    ).toThrow();
  });

  test("accepts entry with did:web owner with subdomain", () => {
    const result = fleetRegistryEntrySchema.parse({
      ...validBaseEntry,
      owner: "did:web:sub.example.com#key-1",
    });
    expect(result.owner).toBe("did:web:sub.example.com#key-1");
  });
});
