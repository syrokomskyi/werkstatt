---
id: RFC-0850
title: "Implement deterministic certification evaluation and remediation"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-15
enhancedAt: 2026-08-15
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0362
  - RFC-0848
  - RFC-0849
  - RFC-0852
  - RFC-0853
  - RFC-0855
  - RFC-0860
  - RFC-0861
  - RFC-0862
  - werkstatt-release-certification/AMD-007
dependsOn:
  - RFC-0853
batch: werkstatt-release-certification-cert-001
satisfies:
  - DNA-51
  - DNA-64
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Equivalent admitted evidence produces one byte-identical decision and action pack regardless of input order, retry order, clocks, filenames, or map insertion order."
  - "Missing, stale, failed, and not-applicable requirements remain distinct and no empty or unknown input can become pass."
  - "Evaluation of the maximum supported profile/evidence cut obeys the declared non-quadratic complexity contract."
  - "Every non-pass decision yields a deterministic anchored remediation pack or fails decision construction explicitly."
nonGoals:
  - "This RFC does not define runtime schemas or identity bytes; RFC-0849, RFC-0852, and RFC-0853 own those prerequisites."
  - "This RFC does not read/write dossiers, assign authority sequences, verify signatures, run producers, expose commands, or deploy artifacts."
  - "This RFC does not replace release/deployment state or block legacy commands; RFC-0851 owns that transition."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/certification/evidence-selection.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/certification/aggregation.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/certification/action-pack.ts"
---

# RFC-0850: Implement deterministic certification evaluation and remediation

## Context

RFC-0849 supplies canonical bytes, RFC-0852 supplies canonical Diagnostic, and RFC-0853 supplies strict parsed certification contracts and immutable identities bound to the resolved component runtime. CERT-001 also requires executable laws for selecting admitted evidence, freezing an evaluation cut, computing coverage/status, constructing remediation, and hashing ordered dossier history. Evaluator inputs are immutable data snapshots obtained through admitted lifecycle capabilities; evaluator output is untrusted evidence until the independent aggregation law admits it. Those laws remain separate so a single implementation session can stay pure and bounded.

Normative sources are `werkstatt-release-certification/contracts.md#aggregation-laws`, `verification.md`, ADR-003/004/011/012/018, and AMD-001/004/006. Storage and Certification Authority behavior remain CERT-003/CERT-004; these functions operate only on already parsed values supplied by a caller.

## Problem

Without one reusable pure evaluator, commands, storage, Main verification, and monitoring can choose different evidence or status for the same cut. Common but invalid implementations scan all evidence once per requirement, order by producer timestamps, treat producer crashes as pass/skip, collapse stale into failure, or generate remediation in nondeterministic diagnostic order.

The result would be both unauditable and vulnerable to scale: retries and concurrent producers could change a historical decision, while a large evidence cut could cause quadratic work.

## Decision

`@warpgogol/werkstatt/certification` gains one bounded pure evidence index/selection pipeline, one deterministic certification aggregator, one deterministic anchored action-pack builder, and ordered dossier event/root hashing. The algorithms use authority admission sequence plus immutable evaluation cuts, preserve all normative statuses, obey explicit scale/complexity limits, never mutate the candidate, and provide no waiver or suppression for required outcomes.

## Architectural fit

### DNA-51 — consistency primitives

This RFC performs no locking or I/O, but defines the deterministic computation that later locked/idempotent operations invoke exactly once per immutable cut. It returns stable identities/reason codes suitable for append-only persistence; later commands must not reimplement it inside their transaction handlers.

### DNA-64 — engine/plugin boundary

Evidence eligibility, status precedence, mandatory coverage, immutable cut semantics, action-task ordering, and dossier hashes are stack-agnostic engine logic. Stack plugins contribute versioned profiles/producers later; they cannot replace aggregation.

## Design

### CLI surface

This RFC adds or changes no commands. It is verified as a package API:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt exec vitest run src/tests/certification-evaluation.pbt.test.ts
pnpm --filter @warpgogol/werkstatt build:check
```

No implementation may register a temporary evaluation command. `release.certify` belongs to CERT-004.

### Limits and complexity contract

| Input | Hard limit | Overflow result |
| --- | --: | --- |
| Resolved requirements per profile/decision | 1,000 | `CERT-LIMIT-01`, `incomplete`; no partial decision |
| Admitted evidence records at one evaluation cut | 10,000 | `CERT-LIMIT-02`, `incomplete`; no truncation |
| Action tasks in one pack | 1,000 | `CERT-LIMIT-03`; action-pack/decision construction fails |

For evidence count `E` and requirement count `R`, indexing, selection, and aggregation must run in `O(E + R log R)` time and `O(E + R)` memory. A full `E` scan inside each requirement evaluation is forbidden. Action-pack ordering is `O(T + D + T log T)` for tasks `T` and dependency edges `D`. Dossier root hashing is `O(H)` in ordered event hashes. Tests include a deterministic maximum-size fixture with 1,000 requirements and 10,000 evidence records. An advisory benchmark records time/memory trends but elapsed time is not a flaky CI gate.

### Evidence indexing and selection

```ts
function buildEvidenceIndex(input: EvidenceIndexInputV1): EvidenceIndexV1 | CertificationLimitFailureV1;

function selectRequirementEvidence(
  input: RequirementEvidenceSelectionInputV1,
  index: EvidenceIndexV1,
): RequirementEvidenceSelectionV1;
```

The index is built once per decision. It excludes any record above the immutable `evaluationCutSequence` and keys eligible lookup by candidate, policy/profile, requirement, decision kind/gate, producer, and permitted environment dimensions. Selection then:

1. validates operation closure/reuse rules;
2. validates attestation structure, applicability, input/toolchain/environment compatibility, and freshness;
3. chooses the eligible record with greatest authority `admissionSequence`;
4. records exact selected evidence IDs/sequences and stable rejection/reason codes.

Producer timestamps, filenames, mtimes, lexical IDs, diagnostic order, and input array order never establish precedence. No admitted record means `incomplete`; compatible but expired/mismatched evidence means `stale`; an admitted current violation means `fail`. `not-applicable` requires complete machine applicability evidence. Late submissions are unselectable and will become incidents in CERT-003.

### Deterministic aggregation

```ts
function evaluateCertificationDecision(
  input: CertificationEvaluationInputV1,
): CertificationEvaluationResultV1;
```

The aggregator:

- resolves required, conditional, and advisory requirements for the exact decision kind;
- selects at one immutable cut using the prebuilt index;
- preserves per-requirement `pass | fail | stale | incomplete | not-applicable`;
- requires at least one applicable required requirement for every mandatory dimension;
- applies top-level precedence `fail > stale > incomplete > pass`;
- records selected evidence IDs, evaluation cut, coverage counts, reason codes, and canonical ordering;
- treats advisory results as visible but non-authorizing;
- never infers pass from zero requirements, zero diagnostics, process exit 0, old evidence, producer crash, timeout, infrastructure unavailability, malformed output, or an unknown value.

Permuting requirements, evidence input, diagnostics, equivalent maps, retries below the same cut, or observation timestamps cannot change the decision or action-pack identity.

### Deterministic action packs

```ts
function buildCertificationActionPack(
  input: CertificationActionPackInputV1,
): CertificationActionPackV1 | CertificationActionPackFailureV1;
```

The builder reads only parsed decision results and requirement remediation metadata. It creates one canonical task per actionable non-pass requirement, classifies product fix/infrastructure retry/policy defect, validates exact anchors plus reproduce/verification commands, validates dependencies, and returns stable topological order with a stable lexical tie-breaker.

A dependency cycle, missing anchor, generic/unbounded instruction, missing reproduce/verification command, more than 1,000 tasks, or non-pass outcome without an actionable task prevents complete authoritative decision construction with `CERT-ACTION-01`. It never invokes an agent or edits source/content/build artifacts. Markdown/HTML are later projections of canonical JSON.

### Dossier hashing

`computeDossierEventHash()` hashes the RFC-0853 explicit event identity payload. `computeDossierRoot(candidateId, orderedEventHashes)` binds exact order; reordering/insertion/removal/prior-hash changes alter the root, while storage location and projection timestamps do not. This RFC does not read event files or append roots.

### File system responsibilities

| Path | Responsibility |
| --- | --- |
| `packages/werkstatt/src/certification/evidence-selection.ts` | One-pass bounded index plus authority-sequence selection |
| `packages/werkstatt/src/certification/aggregation.ts` | Coverage, status precedence, decision construction |
| `packages/werkstatt/src/certification/action-pack.ts` | Anchored tasks, dependencies, stable topological order |
| `packages/werkstatt/src/certification/dossier-hash.ts` | Pure event/root hashing over ordered identities |
| `packages/werkstatt/src/certification/index.ts` | Public exports of deliberate pure evaluation surface |
| `packages/werkstatt/src/tests/certification-evaluation*.test.ts` | Truth tables, properties, edge and stress fixtures |

No function reads or writes `releases/**`, `missions/**`, `systems-cache/**`, object storage, URLs, clocks, environment variables, or provider APIs.

### Output and failure contract

Pure functions return discriminated typed results and never log. Stable diagnostics/reasons are:

| Rule                | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| `CERT-EVIDENCE-01`  | no compatible admitted evidence at cut                        |
| `CERT-EVIDENCE-02`  | compatible evidence is stale/incompatible for current binding |
| `CERT-GATE-01`      | required requirement/dimension coverage incomplete            |
| `CERT-GATE-02`      | contradictory or impossible evaluation input                  |
| `CERT-ACTION-01`    | remediation is missing, unsafe, cyclic, or unverifiable       |
| `CERT-LIMIT-01..03` | requirements, evidence, or task hard limit exceeded           |

Required evaluation has zero suppression and zero intended false positives. A confirmed producer/profile/evaluator defect is repaired normatively and creates new policy/candidate evidence; it is never suppressed, downgraded, or translated to pass. Infrastructure problems remain `incomplete`.

## Rollout

1. Implement maximum-limit checks and the single-pass evidence index first.
2. Implement evidence selection with table/property tests over cuts, retries, clocks, freshness, environments, and applicability.
3. Implement aggregation truth tables and permutation properties.
4. Implement action packs with graph/canonical order properties.
5. Implement ordered dossier hashes and public exports.
6. Run the maximum-size deterministic stress fixture and advisory benchmark.

Every step is pure and independently testable. RFC-0851 begins only after this RFC is implemented; RFC-0848 integration waits for both.

## Alternatives considered

### Scan all evidence for every requirement

Rejected: it is simple but `O(R×E)` and makes retries/large profiles an avoidable bottleneck. A single bounded index is equally deterministic and safer.

### Let each command aggregate for its own gate

Rejected: orchestration, Main verification, and health would drift in precedence, coverage, and evidence choice.

### Sort by producer timestamp or filename

Rejected: clocks skew, retries return out of order, and filenames are not authority. Only monotonic admission sequence plus a frozen cut preserves history.

### Emit best-effort remediation when metadata is incomplete

Rejected: vague tasks encourage agents to guess. An authoritative non-pass without safe anchored remediation is itself incomplete and must fail construction.

## Risks

- **Quadratic regression:** a developer may bypass the index. Mitigation: source-focused tests, operation-count instrumentation in stress fixtures, and explicit complexity acceptance.
- **Permutation nondeterminism:** unsorted arrays/maps can change IDs. Mitigation: canonical sort keys and fast-check permutations for every collection.
- **False green from empty/unknown input:** mitigation is exhaustive truth tables and explicit non-pass defaults; no fallback success exists.
- **False positives:** expected rate for deterministic contract laws is zero; suspected defects follow normative correction, never runtime suppression.
- **Scope creep into storage/orchestration:** mitigation is a no-I/O boundary test and separate CERT-003/CERT-004 ownership.

## Acceptance criteria

- [ ] A single bounded evidence index is built in `O(E)` before requirement selection; source/tests prohibit per-requirement full evidence scans.
- [ ] Hard limits of 1,000 requirements, 10,000 evidence records, and 1,000 action tasks return explicit non-pass failures without truncation.
- [ ] Selection uses admission sequence and evaluation cuts; timestamp/order/retry/late-result properties prove historical decisions cannot change.
- [ ] Aggregation exhaustively proves `fail > stale > incomplete > pass`, applicability, advisory neutrality, empty-profile non-pass, and mandatory dimension coverage.
- [ ] Equivalent permutations yield byte-identical decision IDs, selected evidence lists, coverage summaries, and action-pack IDs.
- [ ] Every non-pass produces one valid anchored task per actionable requirement or fails with `CERT-ACTION-01`; dependency cycles and vague tasks are rejected.
- [ ] Dossier event/root hashing is order-sensitive and location/projection-time independent.
- [ ] Deterministic maximum-size stress fixtures complete without limit bypass; advisory performance results are recorded without wall-clock CI assertions.
- [ ] Evaluation modules have no filesystem/network/clock/env/plugin imports and mutate none of their inputs.
- [ ] `pnpm --filter @warpgogol/werkstatt test`, `build:check`, `rfc.acceptance.run --id RFC-0850`, `rfc.verification.emit --id RFC-0850`, and `rfc.validate --id RFC-0850 --json` pass before stamping.

## Implementation notes for agents

- Implement only after RFC-0853 is `implemented` and this RFC is `accepted`; draft text grants no authority.
- Complete only this pure evaluation boundary in the session. Do not add commands, storage, authority credentials, producers, state cutover, deployment, or rendering.
- Build the evidence index once and pass it to selection. Any `requirements.map(... evidence.filter ...)`-style full nested scan violates this RFC.
- Never use process exit, diagnostic emptiness, timeout, catch/fallback, or limit overflow as pass.
- Keep input/output immutable and deterministic; inject authority time as parsed input where freshness arithmetic is required.
- Required outcomes have no suppressions, force flags, advisory downgrade, or grace mode.
- If the spec is inconsistent, create an amendment; for invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0850 --reason "..." --invariant "DNA-N"` (RFC-0334).
- Follow RFC-0230 for public agent-facing types, RFC-0330 for probe evidence, and RFC-0476 for stamping.
- Before stamping, add line-accurate evidence, run `rfc.verification.emit --id RFC-0850`, then `rfc.implement.stamp --id RFC-0850 --dry-run` and commit through the canonical flow.
