import { describe, it, expect } from "vitest";
import { dhtEntryBytes, signDhtEntry, verifyDhtEntry, type DHTEntryData } from "./dht-sign.ts";
import { generateKeypair } from "./sign.ts";
import type { DHTSiteEntry } from "@warpgogol/werkstatt-site/ontology/operations";

describe("dht-sign", () => {
  it("dhtEntryBytes produces deterministic canonical bytes", () => {
    const entry: DHTEntryData = {
      siteId: "test-site",
      owner: "did:web:example.com#v1",
      workshopEndpoint: "10.0.0.1:7947",
      mirrors: ["10.0.0.2:7947"],
      registeredAt: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    };

    const bytes1 = dhtEntryBytes(entry);
    const bytes2 = dhtEntryBytes(entry);

    expect(bytes1).toEqual(bytes2);
    expect(bytes1.length).toBeGreaterThan(0);
  });

  it("dhtEntryBytes excludes signature field", () => {
    const entryData: DHTEntryData = {
      siteId: "test-site",
      owner: "did:web:example.com#v1",
      workshopEndpoint: "10.0.0.1:7947",
      mirrors: [],
      registeredAt: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    };

    const bytes = dhtEntryBytes(entryData);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).not.toContain("signature");
  });

  it("signDhtEntry and verifyDhtEntry round-trip", async () => {
    const keypair = await generateKeypair();
    const entryData: DHTEntryData = {
      siteId: "test-site",
      owner: "did:web:example.com#v1",
      workshopEndpoint: "10.0.0.1:7947",
      mirrors: ["10.0.0.2:7947"],
      registeredAt: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    };

    const signature = await signDhtEntry(entryData, keypair.privateKeyHex);
    expect(signature).toBeTruthy();
    expect(signature.length).toBeGreaterThan(0);

    const fullEntry: DHTSiteEntry = { ...entryData, signature };
    const isValid = await verifyDhtEntry(fullEntry, keypair.publicKeyMultibase);
    expect(isValid).toBe(true);
  });

  it("verifyDhtEntry rejects tampered entries", async () => {
    const keypair = await generateKeypair();
    const entryData: DHTEntryData = {
      siteId: "test-site",
      owner: "did:web:example.com#v1",
      workshopEndpoint: "10.0.0.1:7947",
      mirrors: [],
      registeredAt: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    };

    const signature = await signDhtEntry(entryData, keypair.privateKeyHex);
    const tamperedEntry: DHTSiteEntry = {
      ...entryData,
      workshopEndpoint: "10.0.0.99:7947",
      signature,
    };

    const isValid = await verifyDhtEntry(tamperedEntry, keypair.publicKeyMultibase);
    expect(isValid).toBe(false);
  });

  it("verifyDhtEntry rejects wrong public key", async () => {
    const keypair1 = await generateKeypair();
    const keypair2 = await generateKeypair();
    const entryData: DHTEntryData = {
      siteId: "test-site",
      owner: "did:web:example.com#v1",
      workshopEndpoint: "10.0.0.1:7947",
      mirrors: [],
      registeredAt: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    };

    const signature = await signDhtEntry(entryData, keypair1.privateKeyHex);
    const fullEntry: DHTSiteEntry = { ...entryData, signature };

    const isValid = await verifyDhtEntry(fullEntry, keypair2.publicKeyMultibase);
    expect(isValid).toBe(false);
  });
});
