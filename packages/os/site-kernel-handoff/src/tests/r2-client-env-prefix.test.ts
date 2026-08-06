import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveR2ConfigFromEnv, MissingEnvError } from "../evidence/r2-client.ts";

describe("resolveR2ConfigFromEnv — envPrefix (RFC-0713)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads R2_NACHWEIS_* vars when envPrefix is provided", () => {
    vi.stubEnv("R2_NACHWEIS_ACCOUNT_ID", "nachweis-account");
    vi.stubEnv("R2_NACHWEIS_ACCESS_KEY_ID", "nachweis-key");
    vi.stubEnv("R2_NACHWEIS_SECRET_ACCESS_KEY", "nachweis-secret");
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    const config = resolveR2ConfigFromEnv("nachweis", "R2_NACHWEIS");

    expect(config).toEqual({
      accountId: "nachweis-account",
      accessKeyId: "nachweis-key",
      secretAccessKey: "nachweis-secret",
      bucketName: "nachweis",
    });
  });

  it("throws MissingEnvError with prefixed var name when R2_NACHWEIS_* vars absent", () => {
    delete process.env.R2_NACHWEIS_ACCOUNT_ID;
    delete process.env.R2_NACHWEIS_ACCESS_KEY_ID;
    delete process.env.R2_NACHWEIS_SECRET_ACCESS_KEY;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    try {
      resolveR2ConfigFromEnv("nachweis", "R2_NACHWEIS");
      expect.fail("should have thrown MissingEnvError");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingEnvError);
      expect((err as MissingEnvError).missingVar).toBe("R2_NACHWEIS_ACCOUNT_ID");
      expect((err as MissingEnvError).diagnostic).toBe("MISSING_ENV");
    }
  });

  it("reads unprefixed R2_* vars when envPrefix is omitted (backward compat)", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "evidence-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "evidence-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "evidence-secret");
    delete process.env.R2_NACHWEIS_ACCOUNT_ID;
    delete process.env.R2_NACHWEIS_ACCESS_KEY_ID;
    delete process.env.R2_NACHWEIS_SECRET_ACCESS_KEY;

    const config = resolveR2ConfigFromEnv("axiom-evidence");

    expect(config).toEqual({
      accountId: "evidence-account",
      accessKeyId: "evidence-key",
      secretAccessKey: "evidence-secret",
      bucketName: "axiom-evidence",
    });
  });

  it("throws MissingEnvError with unprefixed var name when R2_* vars absent and no prefix", () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_NACHWEIS_ACCOUNT_ID;
    delete process.env.R2_NACHWEIS_ACCESS_KEY_ID;
    delete process.env.R2_NACHWEIS_SECRET_ACCESS_KEY;

    try {
      resolveR2ConfigFromEnv("axiom-evidence");
      expect.fail("should have thrown MissingEnvError");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingEnvError);
      expect((err as MissingEnvError).missingVar).toBe("R2_ACCOUNT_ID");
      expect((err as MissingEnvError).diagnostic).toBe("MISSING_ENV");
    }
  });
});
