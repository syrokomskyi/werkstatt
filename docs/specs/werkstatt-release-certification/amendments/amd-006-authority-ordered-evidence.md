---
schema: forge/spec-amendment@1
id: AMD-006
title: Authority-ordered evidence selection and immutable evaluation cuts
status: accepted
createdAt: 2026-08-14
reviewers:
  - human:andrii-syrokomskyi
targets:
  - kind: decision
    id: ADR-006
  - kind: section
    document: contracts
    anchor: decision-selection
discoveredBy: ingest-grilling
---

## Was

The snapshot says the engine selects the “newest admitted evidence” but does not define newest. `EvidenceEnvelopeV1` contains producer run timestamps, which are unsuitable for total ordering under clock skew, retries, parallel producers, duplicated scheduler delivery, and late remote responses. The contracts also do not freeze the dossier boundary evaluated by a decision.

## Becomes

The Certification Authority owns evidence ordering and operation closure.

### Required identity and ordering fields

`EvidenceEnvelopeV1.run` gains:

```ts
run: {
  certificationOperationId: string;
  producerAttemptId: string;
  scheduleWindowId: string | null;
  runId: string;
  attempt: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  authorityAdmittedAt: string;
  admissionSequence: number;
};
```

`authorityAdmittedAt` and `admissionSequence` are assigned by the authority after successful admission and are included in authoritative evidence identity. A producer submission does not supply or choose them. `scheduleWindowId` is required for continuous-health operations and null for ordinary gates.

`GateDecisionV1`, `MainVerificationDecisionV1`, and `CertificationHealthDecisionV1` gain:

```ts
certificationOperationId: string;
evaluationCutSequence: number;
```

Health decisions also carry their stable `scheduleWindowId`.

### Selection and closure rules

1. Every gate, Main-verification, and health execution creates or resumes one stable authority operation ID bound to candidate, policy bundle, gate/decision kind, and target environment.
2. Producer attempts are registered before dispatch. Attempt identity is unique within the operation and retry number is monotonic per producer/requirement.
3. The authority validates and appends accepted evidence, then assigns the next dossier admission sequence. Producer time, filename, filesystem mtime, response arrival at the client, and lexicographic ID never determine precedence.
4. For each requirement, evaluation selects the eligible record with the highest `admissionSequence` not greater than `evaluationCutSequence`, after candidate/profile/environment/freshness/applicability compatibility filtering.
5. A permitted retry may supersede an earlier result within the same open operation. The selected evidence IDs and sequence make the result reproducible.
6. The authority atomically closes the operation at an evaluation cut and appends the decision. The cut cannot move and the decision cannot be recomputed in place.
7. A producer result received after operation closure is not admitted as requirement evidence for that operation. The authority appends a bounded `late-result` incident containing safe attempt/operation identity and payload digest, then discards or retention-stores the payload as non-authoritative telemetry.
8. New current evidence requires a new operation and a new appended decision. It never changes which bytes an older decision evaluated.
9. Concurrent clients resuming the same idempotency key converge on the same operation; incompatible requests receive a conflict and create no parallel authority operation.
10. Evidence from a prior completed operation may be reused by a later operation only when the profile permits reuse and identity/freshness checks pass. The later decision still records its own cut and exact evidence IDs.

### Time and freshness rules

- Ordering is sequence-based; time is used only for observation validity and freshness.
- Authority admission/decision time is the default TTL reference.
- A signed producer observation time may be required for an external fact, but the authority checks it against profile-defined maximum clock skew and plausible duration.
- Excessive skew, future observation, time reversal, or inability to establish the required observation window is `incomplete`; it cannot reorder evidence.
- `scheduleWindowId` is derived canonically from schedule policy, candidate, requirement group, and window boundary. Duplicate scheduler delivery resumes the same window.
- A late result from window N cannot enter window N+1 automatically; N+1 needs its own registered attempt/evidence or explicit profile-permitted prior evidence reuse.

### Recovery rules

- Crash after evidence append but before close resumes the open operation and may reuse admitted evidence.
- Crash after close/decision append returns the existing immutable decision.
- Crash during the atomic close must recover to either open-without-decision or closed-with-one-decision, never a closed operation without a resolvable decision.
- An orphan registered attempt times out according to profile policy and yields `incomplete` at the cut; its later response is handled as late.

## Why

Distributed producer time is not a trustworthy total order. Authority admission sequence and an immutable evaluation cut provide deterministic replay, safe retry, crash recovery, scheduler deduplication, and protection against late evidence shadowing a newer result.

## Impact

- **CERT-001:** extend evidence and decision schemas, identity functions, selection algorithm, and late-result incident vocabulary.
- **CERT-003:** allocate sequence under the dossier append lock and atomically persist operation closure/decision.
- **CERT-004:** implement stable idempotency/operation IDs, attempt registration, retries, resume, close, and late-result handling.
- **CERT-006:** evaluator requests are registered attempts and peer results remain isolated; late evaluator responses cannot alter a closed consensus.
- **CERT-007:** Main verification uses one operation/cut across post-switch evidence and rollback handling.
- **CERT-008:** derive stable schedule windows and prove duplicate/late delivery behavior.
- **Verification:** use fake clocks and controlled concurrent responses to cover skew, retry, out-of-order arrival, close races, duplicate client/scheduler delivery, late pass, late fail, crash on every closure boundary, and exact decision replay.
