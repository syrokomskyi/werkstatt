---
schema: forge/spec-amendment@1
id: AMD-005
title: Immutable policy bundle for historical verification
status: accepted
createdAt: 2026-08-14
reviewers:
  - human:andrii-syrokomskyi
targets:
  - kind: decision
    id: ADR-005
  - kind: section
    document: contracts
    anchor: certification-profile
  - kind: node
    id: CERT-002
discoveredBy: ingest-grilling
---

## Was

The snapshot binds the candidate to a profile hash and records producer/toolchain versions, but it does not require preservation of the exact profile bytes, schemas, rubric, resolved applicability/requirements, producer declarations, or issuer verification material. A future `release.certification.verify` could therefore depend on whatever plugin/profile happens to be installed at verification time and become unable to interpret a historical decision correctly.

## Becomes

Candidate creation materializes one immutable `CertificationPolicyBundleV1` before candidate ID calculation:

```ts
interface CertificationPolicyBundleV1 {
  schema: "werkstatt/certification-policy-bundle@1";
  bundleRootHash: string;
  profile: {
    canonicalProfileDigest: string;
    sourceFileDigest: string;
    resolvedRequirementsDigest: string;
    applicabilityRegistryDigest: string;
  };
  schemas: Array<{
    schemaId: string;
    canonicalSchemaDigest: string;
  }>;
  qualitative: {
    rubricId: string;
    rubricVersion: string;
    rubricDigest: string;
    riskRulesDigest: string;
    calibrationManifestDigest: string;
  } | null;
  producers: Array<{
    producerId: string;
    declarationDigest: string;
    moduleSourceDigest: string;
    packageName: string;
    packageVersion: string;
    executableArtifactDigest: string | null;
  }>;
  runtime: {
    engineManifestDigest: string;
    pluginManifestDigest: string;
    toolchainManifestDigest: string;
    commandManifestDigest: string;
  };
  deploymentPlanDigest: string;
  retentionPolicyDigest: string;
  issuerRegistrySnapshot: {
    registryDigest: string;
    trustedIssuerMaterialDigests: string[];
    transparencyHeadDigest: string;
  };
  objects: Array<{
    role: string;
    digest: string;
    mediaType: string;
    sizeBytes: number;
  }>;
  createdAt: string;
}
```

Every digest points to immutable content-addressed bytes. `bundleRootHash` covers the canonical object excluding itself and observation-only `createdAt`; it also covers the ordered role/digest object inventory. `ReleaseCandidateIdentityV1` gains `policyBundleRootHash`, and this value contributes to `candidateId`. The existing profile/toolchain fields remain convenient explicit identity fields and must agree with the bundle.

### Historical verification rules

1. Gate, Main-verification, health, incident, and retention decisions reference the exact policy bundle root.
2. `release.certification.verify` loads the bundle by root from the dossier/durable store and validates historical evidence/decisions against those exact schemas and rules. It must not substitute the current installed plugin/profile/rubric.
3. The active installed profile is compared separately. Difference is reported as historical-policy/current-policy divergence, not corruption of the old decision.
4. Recertification under a changed profile creates a new candidate ID even when artifact bytes are unchanged; the old decision remains valid as history but cannot satisfy a new gate.
5. Issuer validity is checked against both the bundled registry snapshot at issuance and the append-only current issuer transparency/revocation history. A later compromise declaration with an effective compromise time can invalidate affected trust without rewriting the old bytes; this appends an incident/health consequence.
6. Missing bundle object, digest mismatch, unknown schema, or inconsistent explicit identity field is an integrity failure and cannot be repaired by downloading current package content.

### Retention split

Retain indefinitely as compact verification material:

- canonical profile and resolved requirement/applicability data;
- evidence/decision schemas;
- rubric, risk rules, and calibration manifest (not necessarily all heavy calibration media);
- producer declarations, package/source hashes, and command/toolchain manifests;
- deployment-plan and retention-policy bytes;
- issuer public verification material and transparency references.

Executable producer binaries, containers, browser traces, full calibration media, and build toolchain archives may follow the certified-heavy retention tier unless protected by an incident/audit hold. Their tombstones preserve digest, role, and deletion policy. Their removal means “historically verifiable but not locally re-executable,” which status/verify output must state explicitly.

## Why

A hash without the hashed policy bytes is not a durable semantic record. Historical certification must remain interpretable and cryptographically verifiable after upgrades, while indefinite retention of every executable/container is unnecessary and expensive. The bundle draws that boundary explicitly.

## Impact

- **CERT-001:** extend candidate identity and every decision reference with `policyBundleRootHash`; define historical/current policy divergence diagnostics.
- **CERT-002:** build, canonicalize, inventory, validate, and persist the complete policy bundle during candidate creation.
- **CERT-003:** durably store bundle objects, protect compact verification material indefinitely, and tombstone bounded executable artifacts.
- **CERT-004:** make status/verify resolve the historical bundle by root and separately report current-profile divergence/re-execution availability.
- **CERT-006:** preserve exact rubric/risk/calibration manifest and evaluator evidence schema.
- **CERT-008:** handle later issuer compromise or profile obsolescence through appended health/incident state rather than history mutation.
- **Verification:** prove old decisions verify after package/profile upgrades, current files cannot substitute for missing bundle objects, later key revocation is applied, and heavy executable removal does not erase cryptographic verification capability.
