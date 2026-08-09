/*
<MODULE_CONTRACT>
<purpose>
RFC-0559: Tests for Studio Gate auth middleware — site-scoping, scope enforcement,
error codes, malformed config, permissive vs enforced modes.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0559: initial auth middleware tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeypair } from "@warpgogol/werkstatt-site/passport/sign";
import { signIdentityCredential } from "@warpgogol/werkstatt-site/passport";
import type {
  SiteOwnershipCredentialSubject,
  ActorDelegationCredentialSubject,
  WerkstattIdentityConfig,
  WerkstattCredential,
  VCProof,
} from "@warpgogol/werkstatt-site/passport";
import { verifyAuthFromMeta, IDENTITY_CONFIG_FILENAME } from "../auth.ts";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "studio-gate-auth-test-"));
}

interface Fixture {
  dir: string;
  keypair: { privateKeyHex: string; publicKeyMultibase: string };
  proof: VCProof;
  siteOwnerSubject: SiteOwnershipCredentialSubject;
  credentialId: string;
}

async function setupPermissive(fixture: Partial<WerkstattIdentityConfig> = {}): Promise<Fixture> {
  const dir = await makeTempDir();
  const keypair = await generateKeypair();
  const siteOwnerSubject: SiteOwnershipCredentialSubject = {
    id: "did:web:warpgogol.com#operator-v1",
    siteId: "warpgogol-com",
    role: "owner",
  };
  const proof = await signIdentityCredential(
    siteOwnerSubject,
    keypair.privateKeyHex,
    "did:web:warpgogol.com#v1",
    "2026-07-27T00:00:00.000Z",
  );
  const credentialId = "cred-owner-001";
  const credential: WerkstattCredential = {
    credentialId,
    type: "SiteOwnershipCredential",
    subject: siteOwnerSubject,
    proof,
    issuedAt: "2026-07-27T00:00:00.000Z",
    issuer: "did:web:warpgogol.com",
  };
  const config: WerkstattIdentityConfig = {
    schemaVersion: "1.0",
    operatorName: "warpgogol",
    operatorKeyPair: {
      publicKeyMultibase: keypair.publicKeyMultibase,
      keyVersion: "v1",
      algId: "Ed25519Signature2020",
    },
    authMode: "permissive",
    domain: "warpgogol.com",
    issuedCredentials: [credential],
    revokedCredentialIds: [],
    ...fixture,
  };
  await writeFile(join(dir, IDENTITY_CONFIG_FILENAME), JSON.stringify(config));
  return { dir, keypair, proof, siteOwnerSubject, credentialId };
}

async function setupEnforced(
  overrides: Partial<WerkstattIdentityConfig> & { extraCredentials?: WerkstattCredential[] } = {},
): Promise<Fixture & { config: WerkstattIdentityConfig }> {
  const dir = await makeTempDir();
  const keypair = await generateKeypair();
  const siteOwnerSubject: SiteOwnershipCredentialSubject = {
    id: "did:web:warpgogol.com#operator-v1",
    siteId: "warpgogol-com",
    role: "owner",
  };
  const proof = await signIdentityCredential(
    siteOwnerSubject,
    keypair.privateKeyHex,
    "did:web:warpgogol.com#v1",
    "2026-07-27T00:00:00.000Z",
  );
  const credentialId = "cred-owner-001";
  const credential: WerkstattCredential = {
    credentialId,
    type: "SiteOwnershipCredential",
    subject: siteOwnerSubject,
    proof,
    issuedAt: "2026-07-27T00:00:00.000Z",
    issuer: "did:web:warpgogol.com",
  };
  const { extraCredentials, ...configOverrides } = overrides;
  const config: WerkstattIdentityConfig = {
    schemaVersion: "1.0",
    operatorName: "warpgogol",
    operatorKeyPair: {
      publicKeyMultibase: keypair.publicKeyMultibase,
      keyVersion: "v1",
      algId: "Ed25519Signature2020",
    },
    authMode: "enforced",
    domain: "warpgogol.com",
    issuedCredentials: [credential, ...(extraCredentials ?? [])],
    revokedCredentialIds: [],
    ...configOverrides,
  };
  await writeFile(join(dir, IDENTITY_CONFIG_FILENAME), JSON.stringify(config));
  return { dir, keypair, proof, siteOwnerSubject, credentialId, config };
}

async function makeDelegationCredential(
  keypair: { privateKeyHex: string },
  subjectOverrides: Partial<ActorDelegationCredentialSubject> = {},
  credentialId = "cred-agent-001",
): Promise<{ credential: WerkstattCredential; subject: ActorDelegationCredentialSubject }> {
  const subject: ActorDelegationCredentialSubject = {
    id: "did:web:warpgogol.com#agent-v1",
    siteId: "warpgogol-com",
    delegatedBy: "did:web:warpgogol.com#operator-v1",
    expiresAt: "2027-01-01T00:00:00.000Z",
    scopes: ["workpiece.read"],
    ...subjectOverrides,
  };
  const delegationProof = await signIdentityCredential(
    subject,
    keypair.privateKeyHex,
    "did:web:warpgogol.com#v1",
    "2026-07-27T00:00:00.000Z",
  );
  return {
    credential: {
      credentialId,
      type: "ActorDelegationCredential",
      subject,
      proof: delegationProof,
      issuedAt: "2026-07-27T00:00:00.000Z",
      issuer: "did:web:warpgogol.com",
    },
    subject,
  };
}

describe("verifyAuthFromMeta — permissive mode", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("warns but allows when no credential is provided", async () => {
    const fx = await setupPermissive();
    dir = fx.dir;
    const result = await verifyAuthFromMeta(undefined, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("no-credential-permissive");
    expect(result.authMode).toBe("permissive");
  });

  it("authenticates when valid credential is provided", async () => {
    const fx = await setupPermissive();
    dir = fx.dir;
    const meta = { identity: fx.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(true);
    expect(result.actorId).toBe(fx.siteOwnerSubject.id);
    expect(result.scopes).toEqual(["*"]);
  });
});

describe("verifyAuthFromMeta — enforced mode", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns authentication-required when no credential is provided", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const result = await verifyAuthFromMeta(undefined, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("authentication-required");
  });

  it("returns authentication-required when credential-not-found", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const meta = { identity: "nonexistent-cred" };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("credential-not-found");
  });

  it("returns credential-revoked for revoked credentials", async () => {
    const fx = await setupEnforced({ revokedCredentialIds: ["cred-owner-001"] });
    dir = fx.dir;
    const meta = { identity: fx.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("credential-revoked");
  });

  it("returns authentication-required for expired delegation credential", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const { credential } = await makeDelegationCredential(fx.keypair, {
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    await writeFile(
      join(dir, IDENTITY_CONFIG_FILENAME),
      JSON.stringify({ ...fx.config, issuedCredentials: [credential] }),
    );
    const meta = { identity: credential.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("credential-expired");
  });

  it("returns authentication-required for invalid signature", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const otherKeypair = await generateKeypair();
    const tamperedSubject: SiteOwnershipCredentialSubject = {
      ...fx.siteOwnerSubject,
      id: "did:web:warpgogol.com#other-operator",
    };
    const badProof = await signIdentityCredential(
      tamperedSubject,
      otherKeypair.privateKeyHex,
      "did:web:warpgogol.com#v1",
      "2026-07-27T00:00:00.000Z",
    );
    const tamperedConfig: WerkstattIdentityConfig = {
      ...fx.config,
      issuedCredentials: [
        {
          credentialId: fx.credentialId,
          type: "SiteOwnershipCredential",
          subject: fx.siteOwnerSubject,
          proof: badProof,
          issuedAt: "2026-07-27T00:00:00.000Z",
          issuer: "did:web:warpgogol.com",
        },
      ],
    };
    await writeFile(join(dir, IDENTITY_CONFIG_FILENAME), JSON.stringify(tamperedConfig));
    const meta = { identity: fx.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("signature-invalid");
  });

  it("returns site-mismatch when credential siteId does not match systemId", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const meta = { identity: fx.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "other-site");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("site-mismatch");
    expect(result.expected).toBe("other-site");
    expect(result.presented).toBe("warpgogol-com");
  });

  it("returns insufficient-scope when delegation credential lacks tool scope", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const { credential } = await makeDelegationCredential(fx.keypair, {
      scopes: ["workpiece.read"],
    });
    await writeFile(
      join(dir, IDENTITY_CONFIG_FILENAME),
      JSON.stringify({ ...fx.config, issuedCredentials: [credential] }),
    );
    const meta = { identity: credential.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.write", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("insufficient-scope");
    expect(result.required).toBe("workpiece.write");
    expect(result.presented).toEqual(["workpiece.read"]);
  });

  it("returns system-id-required when systemId is absent in enforced mode", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const meta = { identity: fx.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", undefined);
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("system-id-required");
  });

  it("authenticates SiteOwnershipCredential with wildcard scope for all tools", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const meta = { identity: fx.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "mission.open", "warpgogol-com");
    expect(result.authenticated).toBe(true);
    expect(result.scopes).toEqual(["*"]);
    expect(result.siteId).toBe("warpgogol-com");
  });

  it("authenticates ActorDelegationCredential with matching scope", async () => {
    const fx = await setupEnforced();
    dir = fx.dir;
    const { credential } = await makeDelegationCredential(fx.keypair, {
      scopes: ["workpiece.read"],
    });
    await writeFile(
      join(dir, IDENTITY_CONFIG_FILENAME),
      JSON.stringify({ ...fx.config, issuedCredentials: [credential] }),
    );
    const meta = { identity: credential.credentialId };
    const result = await verifyAuthFromMeta(meta, fx.dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(true);
    expect(result.scopes).toEqual(["workpiece.read"]);
  });
});

describe("verifyAuthFromMeta — config errors", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns auth-config-missing when werkstatt.identity.json does not exist", async () => {
    dir = await makeTempDir();
    const result = await verifyAuthFromMeta(undefined, dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("auth-config-missing");
  });

  it("returns auth-config-malformed when werkstatt.identity.json is invalid JSON", async () => {
    dir = await makeTempDir();
    await writeFile(join(dir, IDENTITY_CONFIG_FILENAME), "{ not valid json");
    const result = await verifyAuthFromMeta(undefined, dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("auth-config-malformed");
  });

  it("returns auth-config-malformed when werkstatt.identity.json fails schema validation", async () => {
    dir = await makeTempDir();
    await writeFile(join(dir, IDENTITY_CONFIG_FILENAME), JSON.stringify({ foo: "bar" }));
    const result = await verifyAuthFromMeta(undefined, dir, "workpiece.read", "warpgogol-com");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("auth-config-malformed");
  });
});
