import { test, expect, describe } from "vitest";
import {
  PassportSchema,
  PassportPublicKeyFileSchema,
  PassportPublicKeyEntrySchema,
} from "../schema.ts";

const validHash = "sha256:" + "a".repeat(64);

const validPassport = {
  schemaVersion: "1.0",
  appId: "test-app",
  issuedAt: "2026-01-01T00:00:00Z",
  composition: {
    systemHash: validHash,
    constellation: "test-constellation",
    biome: "default",
    stars: [
      {
        route: "/de/home",
        cosmicStar: "Vega",
        planets: [{ cosmicPlanet: "Europa", pin: "v1", semanticId: "hero" }],
      },
    ],
  },
  provenance: {
    commitSha: "abc123",
    commitAt: "2026-01-01T00:00:00Z",
    builtAt: "2026-01-01T00:00:00Z",
    buildDurationMs: 5000,
    builder: "agent",
    keyVersion: "v1",
    verifiableCredential: {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential"],
      issuer: "did:web:example.com",
      issuanceDate: "2026-01-01T00:00:00Z",
      credentialSubject: {
        id: "did:web:example.com",
        systemHash: validHash,
        commitSha: "abc123",
      },
      proof: {
        type: "Ed25519Signature2020",
        created: "2026-01-01T00:00:00Z",
        verificationMethod: "did:web:example.com#key-1",
        proofPurpose: "assertionMethod",
        proofValue: "zDummySignatureValue",
      },
    },
  },
  scores: {
    nebula: 85,
    pillars: {
      performance: { score: 90, weight: 0.25 },
      accessibility: { score: 85, weight: 0.25 },
      contentHealth: { score: 80, weight: 0.25 },
      architecturalCompliance: { score: 85, weight: 0.25 },
    },
  },
  links: {
    starMapSvg: "/star-map.svg",
    publicKey: "/.well-known/cosmic-passport-key.json",
    dnaReport: "/dna-report.json",
  },
};

describe("PassportSchema", () => {
  test("accepts a valid passport", () => {
    expect(PassportSchema.safeParse(validPassport).success).toBe(true);
  });

  test("rejects wrong schemaVersion", () => {
    expect(PassportSchema.safeParse({ ...validPassport, schemaVersion: "2.0" }).success).toBe(
      false,
    );
  });

  test("rejects empty appId", () => {
    expect(PassportSchema.safeParse({ ...validPassport, appId: "" }).success).toBe(false);
  });

  test("rejects invalid systemHash format", () => {
    expect(
      PassportSchema.safeParse({
        ...validPassport,
        composition: { ...validPassport.composition, systemHash: "not-a-hash" },
      }).success,
    ).toBe(false);
  });

  test("rejects nebula score out of range", () => {
    expect(
      PassportSchema.safeParse({
        ...validPassport,
        scores: { ...validPassport.scores, nebula: 150 },
      }).success,
    ).toBe(false);
  });

  test("rejects negative pillar score", () => {
    expect(
      PassportSchema.safeParse({
        ...validPassport,
        scores: {
          ...validPassport.scores,
          pillars: {
            ...validPassport.scores.pillars,
            performance: { score: -10, weight: 0.25 },
          },
        },
      }).success,
    ).toBe(false);
  });

  test("rejects negative buildDurationMs", () => {
    expect(
      PassportSchema.safeParse({
        ...validPassport,
        provenance: { ...validPassport.provenance, buildDurationMs: -1 },
      }).success,
    ).toBe(false);
  });

  test("rejects wrong proof type", () => {
    expect(
      PassportSchema.safeParse({
        ...validPassport,
        provenance: {
          ...validPassport.provenance,
          verifiableCredential: {
            ...validPassport.provenance.verifiableCredential,
            proof: {
              ...validPassport.provenance.verifiableCredential.proof,
              type: "WrongType",
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  test("defaults stars to empty array when omitted", () => {
    const { stars, ...withoutStars } = validPassport.composition;
    const result = PassportSchema.safeParse({
      ...validPassport,
      composition: withoutStars,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.composition.stars).toEqual([]);
    }
  });
});

describe("PassportPublicKeyEntrySchema", () => {
  test("accepts a valid key entry", () => {
    expect(
      PassportPublicKeyEntrySchema.safeParse({
        version: "v1",
        active: true,
        type: "Ed25519VerificationKey2020",
        publicKeyMultibase: "z6MkhaXgBZDvotDkL5m7XJ5n",
        createdAt: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  test("rejects publicKeyMultibase without z prefix", () => {
    expect(
      PassportPublicKeyEntrySchema.safeParse({
        version: "v1",
        active: true,
        type: "Ed25519VerificationKey2020",
        publicKeyMultibase: "6MkhaXgBZDvotDkL5m7XJ5n",
        createdAt: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  test("rejects wrong type", () => {
    expect(
      PassportPublicKeyEntrySchema.safeParse({
        version: "v1",
        active: true,
        type: "WrongType",
        publicKeyMultibase: "z6MkhaXgBZDvotDkL5m7XJ5n",
        createdAt: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
});

describe("PassportPublicKeyFileSchema", () => {
  test("accepts a file with at least one key", () => {
    expect(
      PassportPublicKeyFileSchema.safeParse({
        schemaVersion: "1.0",
        appId: "test-app",
        keys: [
          {
            version: "v1",
            active: true,
            type: "Ed25519VerificationKey2020",
            publicKeyMultibase: "z6MkhaXgBZDvotDkL5m7XJ5n",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      }).success,
    ).toBe(true);
  });

  test("rejects empty keys array", () => {
    expect(
      PassportPublicKeyFileSchema.safeParse({
        schemaVersion: "1.0",
        appId: "test-app",
        keys: [],
      }).success,
    ).toBe(false);
  });
});
