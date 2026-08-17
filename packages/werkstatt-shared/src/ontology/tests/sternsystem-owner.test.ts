import { test, expect, describe } from "vitest";
import { systemConfigSchema } from "@warpgogol/werkstatt/schemas";

const validBaseEntry = {
  schemaVersion: "system-config/v1",
  id: "test-site",
  cosmicStar: "Vega",
  mirrors: [{ path: "https://github.com/org/test-site", storageType: "non-bare" }],
  pinnedPlatform: "1.0.0",
  status: "active" as const,
  registeredAt: "2026-07-27T00:00:00Z",
  notes: "",
};

describe("systemConfigSchema owner field (RFC-0561)", () => {
  test("accepts entry without owner (backwards compatible)", () => {
    const result = systemConfigSchema.parse(validBaseEntry);
    expect(result.owner).toBeUndefined();
  });

  test("accepts entry with valid did:web owner", () => {
    const result = systemConfigSchema.parse({
      ...validBaseEntry,
      owner: "did:web:warpgogol.com#operator-v1",
    });
    expect(result.owner).toBe("did:web:warpgogol.com#operator-v1");
  });

  test("rejects entry with non-did:web owner", () => {
    expect(() =>
      systemConfigSchema.parse({
        ...validBaseEntry,
        owner: "not-a-did",
      }),
    ).toThrow();
  });

  test("rejects entry with empty string owner", () => {
    expect(() =>
      systemConfigSchema.parse({
        ...validBaseEntry,
        owner: "",
      }),
    ).toThrow();
  });

  test("rejects entry with did:web but no key-version fragment", () => {
    expect(() =>
      systemConfigSchema.parse({
        ...validBaseEntry,
        owner: "did:web:warpgogol.com",
      }),
    ).toThrow();
  });

  test("accepts entry with did:web owner with subdomain", () => {
    const result = systemConfigSchema.parse({
      ...validBaseEntry,
      owner: "did:web:sub.example.com#key-1",
    });
    expect(result.owner).toBe("did:web:sub.example.com#key-1");
  });
});
