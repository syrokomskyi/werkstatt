---
schema: forge/spec-amendment@1
id: AMD-001
title: Explicit immutable Main verification decision
status: accepted
createdAt: 2026-08-14
reviewers:
  - human:andrii-syrokomskyi
targets:
  - kind: decision
    id: ADR-011
  - kind: section
    document: contracts
    anchor: dossier-event-log-and-manifest
  - kind: section
    document: contracts
    anchor: deployment-integration-contract
  - kind: node
    id: CERT-007
discoveredBy: ingest-grilling
---

## Was

The snapshot defines a pre-switch `promote-main` gate decision and says that deployment then enters `main-verifying`, but it does not define a distinct immutable decision object for the post-switch Main evidence. `GateDecisionV1` cannot express deployment/rollback facts, while `CertificationHealthDecisionV1` is the subsequent mutable-current-health projection.

## Becomes

Main verification is a separate immutable dossier decision between the pre-switch promotion gate and continuous health.

```ts
interface MainVerificationDecisionV1 {
  schema: "werkstatt/main-verification-decision@1";
  decisionId: string;
  candidateId: string;
  profileHash: string;
  promoteMainDecisionId: string;
  promoteMainDossierRoot: string;
  deployment: {
    operationId: string;
    adapterId: string;
    targetId: string;
    slotId: string | null;
    trafficSwitchId: string;
    switchedAt: string;
    observedCandidateId: string;
  };
  status: CertificationStatus;
  requirementResults: Array<{
    requirementId: string;
    status: RequirementStatus;
    selectedEvidenceIds: string[];
    reasonCodes: string[];
  }>;
  actionPackId: string | null;
  rollback: {
    action: "not-required" | "incident-only" | "rollback";
    reason: string;
    targetCandidateId: string | null;
    operationId: string | null;
    status: "not-started" | "verifying" | "restored" | "failed";
    verificationEvidenceIds: string[];
    completedAt: string | null;
  };
  dossierRootBefore: string;
  dossierRootAfter: string;
  decidedAt: string;
  engineVersion: string;
}
```

The dossier event union gains `MainVerificationDecisionEventV1`, and the closed event vocabulary gains `main-verification-decision`. The event participates in the same sequence, previous-hash, atomic append, integrity verification, and durable replication rules as every other authoritative dossier event.

The lifecycle is normative:

1. `promote-main: pass` authorizes traffic-switch execution for the exact candidate and dossier root.
2. The deployment operation enters `main-verifying` and records the provider operation and observed public candidate identity.
3. Main-only requirements run and are admitted through the ordinary evidence envelope.
4. The engine aggregates those exact requirements into `MainVerificationDecisionV1`.
5. Any `fail`, `stale`, or `incomplete` decision creates an action pack and records the profile-selected incident/rollback action. It cannot produce `main-certified`.
6. When rollback is selected, the decision remains non-pass until the rollback attempt and verification evidence are recorded. A failed or unverified rollback remains a critical incident and never becomes publication success.
7. A `pass` becomes eligible for `main-certified` only after `dossierRootAfter` is verified in a required durable replica.
8. The first `CertificationHealthDecisionV1` is appended only after `main-certified`; continuous health cannot substitute for or retroactively alter Main verification.

`decisionId` hashes all normative fields except itself. Physical storage locators are not fields in this decision. The selected evidence must be Main-environment evidence unless the profile explicitly marks the requirement environment-independent.

## Why

Without this object, the system has no durable proof for the transition from “Alt evidence permits an attempted Main switch” to “the intended candidate actually works on Main.” Reusing `promote-main` would blur pre-switch authorization with post-switch fact. Reusing current health would make historical publication truth depend on a later mutable projection.

This amendment preserves the accepted separation of historical certification and current health while making transactional Main verification reconstructable, crash-resumable, and auditable.

## Impact

- **CERT-001:** include the event/decision schema, identity function, dossier union, and aggregation-compatible status vocabulary.
- **CERT-003:** persist, verify, replicate, and reconstruct the new event type.
- **CERT-004:** expose the decision in status/verify output and resume orchestration from partial Main verification.
- **CERT-007:** implement the complete pre-switch gate → switch → Main decision → durable sync → certified/rollback state machine and fault-injection tests.
- **CERT-008:** start continuous health only from a successfully durably replicated Main verification decision.
- **Verification:** tests must prove that traffic switching, provider success, pre-switch gate pass, or an early health probe cannot independently create `main-certified`.
