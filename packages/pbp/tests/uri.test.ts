import { describe, it, expect } from "vitest";
import { validatePbpUri } from "../src/uri.js";

describe("validatePbpUri", () => {
  it("accepts valid HTTPS URIs", () => {
    expect(validatePbpUri("https://webgogol.com/id/offering/digital-foundation")).toEqual({
      ok: true,
    });
    expect(validatePbpUri("https://example.com/id/business/example")).toEqual({ ok: true });
  });

  it("rejects non-absolute URIs", () => {
    expect(validatePbpUri("not-a-uri").ok).toBe(false);
    expect(validatePbpUri("foo/bar").ok).toBe(false);
  });

  it("rejects non-HTTPS by default", () => {
    expect(validatePbpUri("http://example.com/id/business/example").ok).toBe(false);
    expect(validatePbpUri("ftp://example.com/id/business/example").ok).toBe(false);
  });

  it("accepts other schemes when allowedSchemes is provided", () => {
    expect(validatePbpUri("urn:pbp:business:example", { allowedSchemes: ["urn"] })).toEqual({
      ok: true,
    });
  });

  it("rejects locale markers in path", () => {
    expect(validatePbpUri("https://example.com/de/id/business/example").ok).toBe(false);
    expect(validatePbpUri("https://example.com/id/business/de/example").ok).toBe(false);
  });

  it("rejects array indices in path", () => {
    expect(validatePbpUri("https://example.com/id/business/0").ok).toBe(false);
    expect(validatePbpUri("https://example.com/id/0/example").ok).toBe(false);
  });

  it("rejects local file paths", () => {
    expect(validatePbpUri("./src/content/business/example.md").ok).toBe(false);
    expect(validatePbpUri("/home/user/project/src/content/example.md").ok).toBe(false);
  });
});
