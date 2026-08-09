/*
<MODULE_CONTRACT>
  <purpose>RFC-0558: unit tests for identity credential signing and verification.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0558: initial identity-sign tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { generateKeypair } from "./sign.ts";
import {
  identityCredentialBytes,
  signIdentityCredential,
  verifyIdentityCredential,
} from "./identity-sign.ts";
import type { SiteOwnershipCredentialSubject, ActorDelegationCredentialSubject } from "./schema.ts";

describe("identityCredentialBytes", () => {
  it("produces deterministic bytes for SiteOwnershipCredentialSubject", () => {
    const subject: SiteOwnershipCredentialSubject = {
      id: "did:web:warpgogol.com#operator-v1",
      siteId: "warpgogol-com",
      role: "owner",
    };
    const bytes1 = identityCredentialBytes(subject);
    const bytes2 = identityCredentialBytes(subject);
    expect(bytes1).toEqual(bytes2);
  });

  it("produces deterministic bytes for ActorDelegationCredentialSubject", () => {
    const subject: ActorDelegationCredentialSubject = {
      id: "did:web:warpgogol.com#agent-v1",
      siteId: "warpgogol-com",
      delegatedBy: "did:web:warpgogol.com#operator-v1",
      expiresAt: "2027-01-01T00:00:00.000Z",
      scopes: ["*"],
    };
    const bytes1 = identityCredentialBytes(subject);
    const bytes2 = identityCredentialBytes(subject);
    expect(bytes1).toEqual(bytes2);
  });

  it("produces different bytes for different subjects", () => {
    const subject1: SiteOwnershipCredentialSubject = {
      id: "did:web:warpgogol.com#operator-v1",
      siteId: "warpgogol-com",
      role: "owner",
    };
    const subject2: SiteOwnershipCredentialSubject = {
      id: "did:web:warpgogol.com#operator-v2",
      siteId: "warpgogol-com",
      role: "owner",
    };
    expect(identityCredentialBytes(subject1)).not.toEqual(identityCredentialBytes(subject2));
  });
});

describe("signIdentityCredential / verifyIdentityCredential", () => {
  it("round-trips for SiteOwnershipCredentialSubject", async () => {
    const keypair = await generateKeypair();
    const subject: SiteOwnershipCredentialSubject = {
      id: "did:web:warpgogol.com#operator-v1",
      siteId: "warpgogol-com",
      role: "owner",
    };
    const proof = await signIdentityCredential(
      subject,
      keypair.privateKeyHex,
      "did:web:warpgogol.com#v1",
      "2026-07-27T00:00:00.000Z",
    );
    const valid = await verifyIdentityCredential(subject, proof, keypair.publicKeyMultibase);
    expect(valid).toBe(true);
  });

  it("round-trips for ActorDelegationCredentialSubject", async () => {
    const keypair = await generateKeypair();
    const subject: ActorDelegationCredentialSubject = {
      id: "did:web:warpgogol.com#agent-v1",
      siteId: "warpgogol-com",
      delegatedBy: "did:web:warpgogol.com#operator-v1",
      expiresAt: "2027-01-01T00:00:00.000Z",
      scopes: ["mission.open", "workpiece.write"],
    };
    const proof = await signIdentityCredential(
      subject,
      keypair.privateKeyHex,
      "did:web:warpgogol.com#v1",
      "2026-07-27T00:00:00.000Z",
    );
    const valid = await verifyIdentityCredential(subject, proof, keypair.publicKeyMultibase);
    expect(valid).toBe(true);
  });

  it("fails verification for tampered subject", async () => {
    const keypair = await generateKeypair();
    const subject: SiteOwnershipCredentialSubject = {
      id: "did:web:warpgogol.com#operator-v1",
      siteId: "warpgogol-com",
      role: "owner",
    };
    const proof = await signIdentityCredential(
      subject,
      keypair.privateKeyHex,
      "did:web:warpgogol.com#v1",
      "2026-07-27T00:00:00.000Z",
    );
    const tampered: SiteOwnershipCredentialSubject = {
      ...subject,
      siteId: "other-site",
    };
    const valid = await verifyIdentityCredential(tampered, proof, keypair.publicKeyMultibase);
    expect(valid).toBe(false);
  });

  it("fails verification with wrong public key", async () => {
    const keypair1 = await generateKeypair();
    const keypair2 = await generateKeypair();
    const subject: SiteOwnershipCredentialSubject = {
      id: "did:web:warpgogol.com#operator-v1",
      siteId: "warpgogol-com",
      role: "owner",
    };
    const proof = await signIdentityCredential(
      subject,
      keypair1.privateKeyHex,
      "did:web:warpgogol.com#v1",
      "2026-07-27T00:00:00.000Z",
    );
    const valid = await verifyIdentityCredential(subject, proof, keypair2.publicKeyMultibase);
    expect(valid).toBe(false);
  });
});
