---
schema: forge/spec-amendment@1
id: AMD-003
title: Separate candidate deployment plan from observed environment identity
status: accepted
createdAt: 2026-08-14
reviewers:
  - human:andrii-syrokomskyi
targets:
  - kind: decision
    id: ADR-002
  - kind: section
    document: contracts
    anchor: candidate-identity
  - kind: section
    document: contracts
    anchor: evidence-envelope
  - kind: node
    id: CERT-001
discoveredBy: ingest-grilling
---

## Was

The snapshot says candidate identity binds configuration and required environment inputs, and `EvidenceEnvelopeV1` contains an `environmentIdentityHash`. `ReleaseCandidateIdentityV1`, however, exposes only `buildConfigHash`. This leaves two unsafe interpretations: include one live environment in candidate identity and accidentally create a different candidate per channel, or omit deployment topology/configuration and allow it to drift after certification.

## Becomes

Identity is separated into three explicit layers.

### 1. Build-affecting identity

`platform.buildConfigHash` remains part of `candidateId` and covers every configuration input that can change artifact bytes or behavior snapshot. A different build-time public value, feature definition, compiler option, generated source input, or bundler/runtime mode creates a different candidate.

### 2. Intended deployment-plan identity

`ReleaseCandidateIdentityV1` gains:

```ts
deployment: {
  deploymentPlanHash: string;
  adapterId: string;
  targetSetHash: string;
  bindingContractHash: string;
  publicRuntimeContractHash: string;
};
```

All five values contribute to `candidateId`. The canonical deployment plan contains safe declarative intent for Dev, Alt, and Main: adapter and target identifiers, domains/routes, required binding names and types, capability/entitlement expectations, public runtime configuration contract, security/header policy references, and traffic-switch/rollback topology. It contains no secret value, credential, signed URL, or mutable provider observation.

Changing deployment intent after candidate creation creates a new candidate even when artifact bytes are unchanged. Formatting-only change does not.

### 3. Observed environment identity

Each environment-specific evidence envelope continues to bind:

```ts
binding: {
  inputHashes: Record<string, string>;
  toolchainHash: string;
  environmentIdentityHash: string;
};
```

The environment identity is a canonical observation of the actual channel target: adapter/target/deployment identity, public URL/domain, deployed candidate/build identity, binding-name/type/presence metadata, provider configuration versions, relevant route/header/DNS/TLS/runtime facts, and observation source/time. Every deployment operation and Main verification decision records the same observed hash or exact referenced evidence ID.

Secret material follows these rules:

- raw secret values and ordinary unsalted hashes of low-entropy secret values are forbidden;
- prefer provider-issued immutable secret/reference IDs and versions plus presence/type metadata;
- where a value comparison is unavoidable, use a keyed non-reversible fingerprint from the approved secret boundary and persist only the fingerprint/key-version identifier;
- changing a secret reference/version changes observed identity without exposing the secret;
- inability to establish required secret binding identity is `incomplete`, not pass.

### Matching rules

- artifact/build mismatch is `stale` and creates a new candidate requirement;
- deployment-plan mismatch is `stale` and blocks the transition;
- actual environment mismatch with the candidate plan is `stale` for the affected gate;
- observation expiry without an identity mismatch is `stale` evidence and must be refreshed;
- a different channel naturally has a different observed environment hash but uses the same candidate because its declared target is already part of the candidate deployment plan;
- environment-independent evidence never claims that an observed environment hash is reusable.

`GateDecisionV1` must reference the candidate deployment-plan hash and the exact environment-identity evidence used for environment-dependent requirements. It need not duplicate unsafe provider data.

## Why

Build identity, intended deployment topology, and observed live configuration have different lifecycles. Conflating them either destroys same-artifact promotion or makes configuration drift invisible. The three-layer model preserves one candidate across channels while binding every consequential claim to both declared intent and actual observation.

## Impact

- **CERT-001:** implement deployment-plan schema/canonicalization, extend candidate identity, and define mismatch classification.
- **CERT-002:** require profile requirements to declare which deployment-plan and observed-environment facts they consume.
- **CERT-004:** resolve and verify the plan before producer execution; report exact mismatch/action-pack anchors.
- **CERT-005:** environment producers emit safe observed identity without raw secrets.
- **CERT-007:** re-observe and match environment identity immediately before/after channel transitions and in Main verification.
- **CERT-008:** refresh environment identity for continuous-health requirements and append drift decisions without changing the historical candidate.
- **Verification:** mutate every plan and observation field independently; prove candidate sensitivity for plan/build data, per-channel observation differences, safe secret rotation detection, and absence of secret values in every output/store.
