import { test, expect } from "vitest";
import fc from "fast-check";
import { PassportSchema } from "../schema.ts";

const validHash = "sha256:" + "a".repeat(64);

const arbValidPassport = fc.record({
  schemaVersion: fc.constant("1.0"),
  appId: fc.string({ minLength: 1, maxLength: 20 }),
  issuedAt: fc.string({ minLength: 1, maxLength: 30 }),
  composition: fc.record({
    systemHash: fc.constant(validHash),
    constellation: fc.string({ minLength: 1, maxLength: 20 }),
    biome: fc.string({ minLength: 1, maxLength: 20 }),
    stars: fc.constant([]),
  }),
  provenance: fc.record({
    commitSha: fc.string({ minLength: 1, maxLength: 40 }),
    commitAt: fc.string({ minLength: 1, maxLength: 30 }),
    builtAt: fc.string({ minLength: 1, maxLength: 30 }),
    buildDurationMs: fc.integer({ min: 0, max: 999999 }),
    builder: fc.string({ minLength: 1, maxLength: 20 }),
    keyVersion: fc.string({ minLength: 1, maxLength: 10 }),
    verifiableCredential: fc.record({
      "@context": fc.constant(["https://www.w3.org/2018/credentials/v1"]),
      type: fc.constant(["VerifiableCredential"]),
      issuer: fc.string({ minLength: 1, maxLength: 50 }),
      issuanceDate: fc.string({ minLength: 1, maxLength: 30 }),
      credentialSubject: fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        systemHash: fc.constant(validHash),
        commitSha: fc.string({ minLength: 1, maxLength: 40 }),
      }),
      proof: fc.record({
        type: fc.constant("Ed25519Signature2020"),
        created: fc.string({ minLength: 1, maxLength: 30 }),
        verificationMethod: fc.string({ minLength: 1, maxLength: 50 }),
        proofPurpose: fc.constant("assertionMethod"),
        proofValue: fc.string({ minLength: 1, maxLength: 100 }),
      }),
    }),
  }),
  scores: fc.record({
    nebula: fc.integer({ min: 0, max: 100 }),
    pillars: fc.record({
      performance: fc.record({
        score: fc.float({ min: 0, max: 100, noNaN: true }),
        weight: fc.float({ min: 0, max: 1, noNaN: true }),
      }),
      accessibility: fc.record({
        score: fc.float({ min: 0, max: 100, noNaN: true }),
        weight: fc.float({ min: 0, max: 1, noNaN: true }),
      }),
      contentHealth: fc.record({
        score: fc.float({ min: 0, max: 100, noNaN: true }),
        weight: fc.float({ min: 0, max: 1, noNaN: true }),
      }),
      architecturalCompliance: fc.record({
        score: fc.float({ min: 0, max: 100, noNaN: true }),
        weight: fc.float({ min: 0, max: 1, noNaN: true }),
      }),
    }),
  }),
  links: fc.record({
    starMapSvg: fc.string({ minLength: 1, maxLength: 50 }),
    publicKey: fc.string({ minLength: 1, maxLength: 50 }),
    dnaReport: fc.string({ minLength: 1, maxLength: 50 }),
  }),
});

test("PBT: valid passport always passes schema validation", () => {
  fc.assert(
    fc.property(arbValidPassport, (passport) => {
      expect(PassportSchema.safeParse(passport).success).toBe(true);
    }),
  );
});

test("PBT: nebula score outside [0,100] always fails", () => {
  fc.assert(
    fc.property(
      arbValidPassport,
      fc.integer({ min: -500, max: 500 }).filter((n) => n < 0 || n > 100),
      (passport, badNebula) => {
        const result = PassportSchema.safeParse({
          ...passport,
          scores: { ...passport.scores, nebula: badNebula },
        });
        expect(result.success).toBe(false);
      },
    ),
  );
});
