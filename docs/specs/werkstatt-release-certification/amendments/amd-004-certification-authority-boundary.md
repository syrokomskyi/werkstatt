---
schema: forge/spec-amendment@1
id: AMD-004
title: Separate Certification Authority trust boundary
status: accepted
createdAt: 2026-08-14
reviewers:
  - human:andrii-syrokomskyi
targets:
  - kind: decision
    id: ADR-012
  - kind: section
    document: contracts
    anchor: security-and-privacy
  - kind: node
    id: CERT-003
  - kind: node
    id: CERT-004
discoveredBy: ingest-grilling
---

## Was

The snapshot defines content-addressing, a hash-chained dossier, producer attestations, and durable replication, but it does not define who is trusted to append and sign the authoritative root. A workspace-capable agent can modify local files and recompute an unsigned chain. If signing, durable-write, or deployment credentials are exposed to that same workspace, “manual files cannot certify” is not enforceable.

## Becomes

The system has an explicit provider-neutral `Certification Authority` boundary. Local engine commands are clients of the authority for consequential decisions. The authority may initially run as a dedicated CI workload or Worker-backed executor, but its contract is engine-owned and independent of that deployment choice.

### Trust model

Trusted components are:

- reviewed/pinned Werkstatt engine and active plugin/profile artifacts identified by exact hashes;
- the registered Certification Authority workload identity and issuer keys;
- registered deterministic producer workloads and evaluator identities within their declared scope;
- durable storage and deployment adapters acting through least-privilege service credentials.

Untrusted inputs are:

- candidate/site content, rendered page instructions, arbitrary workspace files, manually authored evidence JSON, producer stdout, evaluator prose, URLs, and external responses;
- author-agent and evaluator-agent requests outside their registered producer/evaluator contracts.

The model protects against accidental mutation, stale/malformed input, manual evidence fabrication, and an author/evaluator agent attempting to use workspace access as certification authority. It does not claim protection after compromise of the authority runtime, issuer keys, deployment account, or operator root account; those are critical security incidents requiring key rotation and revocation.

### Authority contract

```ts
interface CertificationAuthority {
  issuer(): Promise<CertificationAuthorityIssuerV1>;
  executeCertification(request: AuthorityCertificationRequestV1): Promise<AuthorityCertificationResultV1>;
  verifyAttestation(attestation: AuthorityDecisionAttestationV1): Promise<AuthorityVerificationResultV1>;
  executeMainVerification(request: AuthorityMainVerificationRequestV1): Promise<AuthorityMainVerificationResultV1>;
  executeHealthWindow(request: AuthorityHealthRequestV1): Promise<AuthorityHealthResultV1>;
}

interface AuthorityDecisionAttestationV1 {
  schema: "werkstatt/authority-decision-attestation@1";
  issuerId: string;
  issuerKeyId: string;
  authorityVersion: string;
  candidateId: string;
  profileHash: string;
  decisionKind: "gate" | "main-verification" | "health";
  decisionId: string;
  dossierRootHash: string;
  deploymentAuthorization: {
    operationId: string;
    gate: CertificationGate | "main-verification" | "continuous-health";
    adapterId: string;
    targetId: string;
    expiresAt: string;
    nonce: string;
  } | null;
  issuedAt: string;
  signatureAlgorithm: string;
  signature: string;
}
```

The signed canonical statement covers every field except detached `signature`. An issuer registry defines allowed issuer/key IDs, algorithms, activation/revocation windows, and public verification material. Key rotation preserves verification of historical signatures while preventing new authorization by revoked keys.

### Authority execution rules

1. The authority resolves and re-hashes the candidate, plugin/profile, producer registrations, and deployment plan from immutable inputs; it does not trust caller-supplied IDs alone.
2. Producer/evaluator submissions enter only through typed, authenticated workload channels. The authority performs envelope admission, redaction, payload verification, and applicability checks independently.
3. Only the authority holds credentials that can append authoritative events, sign decisions, verify durable replication, or issue exact deployment authorization.
4. Author and evaluator workloads have no authority signing key, durable-store overwrite/delete permission, or deployment credential.
5. The authority serializes dossier append through the candidate/gate operation lock and returns the signed exact decision/root.
6. A deployment executor verifies signature, issuer status, candidate/profile/root, target, operation ID, nonce, and expiry immediately before the external side effect. Authorization is single-operation and cannot be replayed for another target or candidate.
7. Main verification and continuous health use the same trust boundary and append their own signed decisions.
8. Authority timeout, unavailable issuer registry, invalid/revoked signature, durable-sync failure, or inability to re-resolve inputs is `incomplete` or an integrity incident. No local fallback can authorize deployment.
9. Local commands may run producers and render a diagnostic preview marked `authority: non-authoritative`; that output is useful for authoring but cannot create an authoritative dossier event or pass a gate.
10. Every authoritative status/verify output identifies issuer, key, authority version, signature status, and decision/root.

### Storage and credential isolation

- Durable object keys remain content-addressed, but authoritative append/index updates are accepted only from the authority identity.
- Prefer separate put/append, read, retention-delete, and deployment credential scopes; routine certification has no retention-delete permission.
- Credentials and private keys live in the executor/provider secret boundary, not `.env` files copied through missions, release state, logs, evidence, or action packs.
- Deployment may be performed by a separate executor receiving the authority's exact signed authorization; provider-neutral engine contracts must not require the authority process to embed a specific cloud SDK.
- All requests and decisions carry correlation/operation IDs and bounded audit metadata without secret values.

## Why

Hash chains prove internal consistency only relative to a trusted root. They do not establish who was allowed to produce that root. A separate authority makes agent-only operation compatible with issuer separation, least privilege, non-replayable deployment authorization, and independently verifiable history.

## Impact

- **CERT-001:** add signed authority-attestation identity to gate, Main verification, and health contracts; distinguish authoritative and preview results.
- **CERT-002:** profile validation checks registered authority-compatible producer/evaluator identities and output schemas.
- **CERT-003:** implement authority-only append/index policy, issuer registry verification, key rotation/revocation behavior, durable credential separation, and read-only local mirrors.
- **CERT-004:** make CLI orchestration an authority client for gate decisions; implement local non-authoritative preview without pass authorization.
- **CERT-006:** evaluator agents authenticate only as evaluator workloads and cannot inspect peer results or authority credentials.
- **CERT-007:** deployment verifies an exact short-lived signed authorization immediately before provider mutation; no unsigned local decision can transition a channel.
- **CERT-008:** scheduled health execution and decisions are authority-authenticated.
- **Verification:** cover forged/replayed/expired/revoked signatures, wrong target/nonce/root, compromised local files, key rotation, authority outage, credential-scope assertions, and confirmation that no workspace artifact contains authority/deployment secrets.
