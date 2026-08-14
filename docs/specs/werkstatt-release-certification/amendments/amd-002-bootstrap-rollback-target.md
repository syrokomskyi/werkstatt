---
schema: forge/spec-amendment@1
id: AMD-002
title: One-time bootstrap rollback target for first cutover
status: accepted
createdAt: 2026-08-14
reviewers:
  - human:andrii-syrokomskyi
targets:
  - kind: decision
    id: ADR-015
  - kind: node
    id: CERT-009
  - kind: node
    id: CERT-010
discoveredBy: ingest-grilling
---

## Was

The snapshot correctly refuses to retroactively certify the currently serving legacy production artifact and says ordinary rollback restores an eligible prior `main-certified` candidate. At the first clean cutover, however, no prior candidate certified by the new system exists. Without an explicit bootstrap rule, the first switch is either irreversible or pressures the implementation to invent a legacy certification/import path.

## Becomes

CERT-009 may create exactly one `BootstrapRollbackTargetV1` for the first clean cutover:

```ts
interface BootstrapRollbackTargetV1 {
  schema: "werkstatt/bootstrap-rollback-target@1";
  targetId: string;
  systemId: string;
  provider: {
    adapterId: string;
    targetId: string;
    deploymentId: string;
    slotId: string | null;
  };
  identity: {
    observedUrl: string;
    buildIdentityHash: string | null;
    artifactDigest: string | null;
    providerSnapshotDigest: string;
  };
  verification: {
    availabilityEvidenceIds: string[];
    restoreRehearsalOperationId: string;
    restoreRehearsalEvidenceIds: string[];
    verifiedAt: string;
  };
  scope: "first-certified-cutover-rollback-only";
  protectedUntilCutoverMarker: true;
  contentHash: string;
}
```

The target is governed by these invariants:

1. It identifies exact current provider state or a provider-native rollback slot; a mutable channel name or “whatever was previously deployed” is invalid.
2. Its identity, public availability, provider restoration capability, and a non-destructive rehearsal or isolated-slot restore are verified before traffic switching.
3. When a full restore rehearsal would itself change public Main, provider-native preview/slot verification plus a tested exact restoration command is sufficient; the limitation is recorded explicitly.
4. It is not a release candidate, receives no certification gate decision, and is never described as `main-certified`.
5. Its evidence cannot satisfy Site Profile requirements, candidate gates, evaluator coverage, or any future forward promotion.
6. It is eligible only as the rollback target of the first new-system `MainVerificationDecisionV1`.
7. If the target cannot be identified or its restoration path cannot be proved, CERT-009 reports `incomplete` and must not switch traffic.
8. A rollback to it records a critical bootstrap rollback incident and verifies restored public identity/availability. The failed new candidate remains non-certified.
9. After the first new candidate has a passing Main verification decision, verified durable dossier root, at least one successful continuous-health schedule window, and a committed clean-cutover marker, the bootstrap exception is closed permanently for that Sternsystem.
10. All later rollback targets must be prior eligible `main-certified` candidates.

The bootstrap target is protected from CERT-003 retention GC and CERT-010 legacy cleanup until the cutover marker closes the exception. CERT-010 must list the target explicitly in its pre-cleanup inventory and may remove its heavy payload only after confirming closure and the existence of the new certified rollback chain.

## Why

The first transition needs recovery without granting legacy evidence authority. A narrow, identity-bound, rollback-only object preserves transactional safety while keeping the clean-republish decision intact. It also prevents an implementation agent from silently treating old release files as valid certification evidence.

## Impact

- **CERT-001:** define the bootstrap target schema or a core migration-bound equivalent without adding it to certification status vocabulary.
- **CERT-007:** allow `MainVerificationDecisionV1.rollback.targetCandidateId` to be null only when a separately referenced bootstrap target is used during the first-cutover operation; record that reference through a versioned optional bootstrap field.
- **CERT-009:** inventory, create, verify, rehearse, protect, use if necessary, and permanently close the one-time target.
- **CERT-010:** refuse cleanup while the target remains protected; after closure, preserve its compact identity/rehearsal/incident record even if heavy payload is deleted.
- **Verification:** cover missing identity, unavailable snapshot, failed rehearsal, successful bootstrap restore, failed bootstrap restore, attempted reuse on a second cutover, and attempted use as forward evidence.
