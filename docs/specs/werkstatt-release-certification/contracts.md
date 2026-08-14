# Core Contracts

This document defines the implementation-facing contracts for the Werkstatt Release Certification System. Field names and status vocabularies are normative. RFCs may add optional fields but must not rename or weaken these fields within the `@1` schemas.

## Contract ownership

| Contract | Owner | Consumer |
|---|---|---|
| Candidate identity | Werkstatt engine | release, artifact store, certification, deploy |
| Certification profile schema | Werkstatt engine | active stack plugin, profile validator |
| Site Profile v1 data | Werkstatt site plugin | certification engine |
| Evidence envelope | Werkstatt engine | all producers, dossier repository |
| Dossier manifest/events | Werkstatt engine | certification, deploy, monitor, storage |
| Gate decision | Werkstatt engine | Leitstand deployment transitions |
| Action pack | Werkstatt engine with plugin-provided fix metadata | author agents |
| Evaluator evidence payload | Werkstatt site plugin | evidence envelope, aggregator |
| Storage adapter | Werkstatt engine | local cache, R2 adapter, future stores |
| Current health projection | Werkstatt engine | monitor, Leitstand status, incidents |

## Canonicalization and hashing

All digests use `@warpgogol/fingerprint`; direct `node:crypto` hashing is forbidden outside that package under DNA-53.

Canonical JSON hashing follows the shared stable-JSON fingerprint implementation. Unless explicitly stated, an object’s self-referential ID, timestamps used only for observation, and physical storage locators are excluded from its identity payload. Every schema must expose a pure `toIdentityPayload()` function and property-based tests proving:

- key-order independence;
- path-separator normalization;
- stable Unicode handling;
- exclusion of non-identity timestamps/locators;
- sensitivity to every declared identity field;
- deterministic serialization across repeated runs.

Digest strings use the canonical `sha256:<hex>` representation returned by the fingerprint package.

## Candidate identity

```ts
interface ReleaseCandidateIdentityV1 {
  schema: "werkstatt/release-candidate@1";
  candidateId: string; // digest of identity payload below
  systemId: string;
  releaseId: string;
  source: {
    commitSha: string;
    treeHash: string;
  };
  content: {
    siteContentHash: string;
    contentManifestHash: string;
  };
  artifact: {
    artifactId: string;
    artifactManifestHash: string;
    distTreeHash: string;
    behaviorSnapshotHash: string;
  };
  platform: {
    werkstattVersion: string;
    pluginId: string;
    pluginVersion: string;
    profileId: string;
    profileVersion: string;
    profileHash: string;
    toolchainHash: string;
    buildConfigHash: string;
  };
  createdAt: string; // observation only; excluded from candidateId
}
```

### Candidate identity invariants

1. Every field except `createdAt` and `candidateId` contributes to `candidateId`.
2. `releaseId` resolves to exactly one candidate ID. Rebinding a release ID is an integrity violation.
3. The artifact store must verify artifact fields before candidate creation.
4. A candidate cannot be created from a dirty or mutable source boundary.
5. No build occurs after candidate creation for channel promotion. Deploy adapters consume the stored artifact.
6. Live build identity must resolve to the same candidate inputs before a channel can satisfy its gate.
7. Candidate mismatch is `stale`, not `fail`.

## Status vocabularies

```ts
type CertificationStatus = "pass" | "fail" | "incomplete" | "stale";
type RequirementStatus = CertificationStatus | "not-applicable";
type RequirementClass = "required" | "conditional" | "advisory";
type CertificationGate = "dev-deploy" | "propagate-alt" | "promote-main";
type EvidenceEnvironment = "authoring" | "build" | "dev" | "alt" | "main";
type CertificationHealth = "current" | "degraded" | "revoked";
type RemediationClass = "product-fix" | "infrastructure-retry" | "policy-defect";
type DriftAction = "retry" | "incident-only" | "rollback";
```

Unknown string values are schema violations. There is no `warn`, `skip`, `unknown`, `grace`, or `forced-pass` certification status.

## Evidence envelope

```ts
interface EvidenceEnvelopeV1 {
  schema: "werkstatt/certification-evidence@1";
  evidenceId: string;
  candidateId: string;
  profile: {
    id: string;
    version: string;
    hash: string;
  };
  requirement: {
    id: string;
    dimension: SiteQualityDimension | "core";
    gate: CertificationGate | "continuous-health";
    classification: RequirementClass;
  };
  environment: EvidenceEnvironment;
  producer: {
    id: string;
    kind: "kernel-command" | "evaluator-agent" | "remote-workload";
    version: string;
    sourceHash: string;
    invocationHash: string;
  };
  run: {
    runId: string;
    attempt: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  binding: {
    inputHashes: Record<string, string>;
    toolchainHash: string;
    environmentIdentityHash: string;
  };
  result: {
    status: RequirementStatus;
    summary: string;
    diagnostics: Diagnostic[];
    applicability?: {
      ruleId: string;
      value: boolean;
      reason: string;
      inputsHash: string;
    };
  };
  payloads: Array<{
    role: string;
    mediaType: string;
    digest: string;
    sizeBytes: number;
    locator?: string; // excluded from evidenceId; must contain no credentials
  }>;
  redaction: {
    policyVersion: string;
    secretsDetected: number;
    piiDetected: number;
    logsRedacted: boolean;
  };
  attestation: {
    kind: "engine-local" | "workload-signature";
    issuer: string;
    keyId?: string;
    statementDigest: string;
    signature?: string;
  };
  observedAt: string;
  expiresAt: string | null;
}
```

### Evidence identity

`evidenceId` hashes the full canonical envelope except `evidenceId`, physical payload locators, and detached signature bytes. It includes the attestation statement digest and payload digests. Changing status, diagnostics, producer, binding, applicability, or payload changes the ID.

### Evidence admission rules

The dossier repository rejects evidence when:

- candidate or profile binding differs;
- requirement or producer is absent from the active profile;
- producer kind/version/source hash violates the requirement declaration;
- environment is not permitted;
- run timestamps or duration are incoherent;
- required payload is absent or has a digest/size mismatch;
- diagnostics do not conform to canonical `Diagnostic[]`;
- `not-applicable` lacks explicit applicability evidence;
- attestation is invalid or issued by an unregistered identity;
- redaction reports unresolved secret/PII exposure;
- the same evidence ID already exists with different bytes.

Rejected evidence is not appended as passing or failing evidence. The ingestion attempt appends an integrity incident when the dossier itself remains writable.

## Certification profile

```ts
interface CertificationProfileV1 {
  schema: "werkstatt/certification-profile@1";
  id: string;
  version: string;
  plugin: {
    id: string;
    profileId: string; // must match forge.yaml and WerkstattPlugin.profileId
  };
  dimensions: SiteQualityDimension[];
  producers: Record<string, ProducerDeclarationV1>;
  requirements: CertificationRequirementV1[];
  evaluatorPolicy?: EvaluatorPolicyV1;
  retentionPolicy: RetentionPolicyV1;
}

interface CertificationRequirementV1 {
  id: string;
  title: string;
  dimension: SiteQualityDimension | "core";
  gates: Array<CertificationGate | "continuous-health">;
  classification: RequirementClass;
  applicability: ApplicabilityRuleV1;
  producerId: string;
  evidenceSchema: string;
  environments: EvidenceEnvironment[];
  reuse: {
    environmentIndependent: boolean;
    allowedFrom: EvidenceEnvironment[];
  };
  freshness: {
    maxAgeSeconds: number | null;
    schedule?: string;
  };
  execution: {
    timeoutMs: number;
    maxAttempts: number;
    backoffMs: number[];
  };
  criticality: "ordinary" | "critical";
  driftAction: DriftAction;
  remediation: {
    classification: RemediationClass;
    ownerRole: "author-agent" | "platform-agent" | "operator-agent";
    reproduceCommand: string;
    verificationCommand: string;
  };
  normativeRefs: string[];
}

type ApplicabilityRuleV1 =
  | { kind: "always" }
  | { kind: "entitlement"; ref: string; expected: boolean }
  | { kind: "config"; ref: string; predicate: string }
  | { kind: "surface"; ref: string; predicate: string };

interface ProducerDeclarationV1 {
  id: string;
  kind: "kernel-command" | "evaluator-agent" | "remote-workload";
  command?: string;
  moduleId?: string;
  outputSchema: string;
  versionSource: "package-version" | "module-hash" | "evaluator-profile";
  requiredPayloadRoles: string[];
}
```

### Profile digest

The profile hash is calculated from the canonical parsed profile, not raw YAML formatting. The engine records both the canonical hash and source file hash.

### Profile validation

Profile validation fails when:

- plugin ID/profile ID does not match the one active plugin and `forge.yaml`;
- a requirement ID or producer ID is duplicated;
- a required/conditional requirement has no producer;
- a producer command is unregistered or output schema is unknown;
- an environment or gate reference is impossible;
- `allowedFrom` contradicts `environmentIndependent`;
- timeout/retry metadata is invalid;
- a requirement has no normative reference or remediation commands;
- any of the nine site dimensions lacks a Main required/conditional coverage path;
- applicability can silently skip without emitting `not-applicable` evidence;
- a continuous requirement has no freshness TTL/schedule;
- a rollback drift action has no rollback-eligibility predicate;
- evaluator risk rules can require an evaluator identity that is not registered.

## Site quality dimensions

```ts
type SiteQualityDimension =
  | "candidate-integrity"
  | "business-truth-compliance"
  | "editorial-localization"
  | "information-architecture-discoverability"
  | "ux-conversion"
  | "visual-accessibility"
  | "performance-runtime"
  | "security-operational-readiness"
  | "independent-qualitative-evaluation";
```

## Dossier event log and manifest

```ts
type DossierEventV1 =
  | EvidenceAcceptedEventV1
  | GateDecisionEventV1
  | HealthDecisionEventV1
  | IncidentEventV1
  | StorageSyncEventV1
  | RetentionTombstoneEventV1;

interface DossierEventBaseV1 {
  schema: "werkstatt/certification-dossier-event@1";
  eventId: string;
  candidateId: string;
  sequence: number;
  previousEventHash: string | null;
  eventHash: string;
  eventType:
    | "evidence-accepted"
    | "gate-decision"
    | "health-decision"
    | "incident"
    | "storage-sync"
    | "retention-tombstone";
  occurredAt: string;
  payloadDigest: string;
}

interface DossierManifestV1 {
  schema: "werkstatt/certification-dossier@1";
  candidate: ReleaseCandidateIdentityV1;
  sequence: number;
  headEventHash: string | null;
  dossierRootHash: string;
  counts: Record<DossierEventBaseV1["eventType"], number>;
  durableReplicas: Array<{
    adapterId: string;
    locator: string;
    verifiedRootHash: string;
    verifiedAt: string;
  }>;
  projectedAt: string; // excluded from dossierRootHash
}
```

### Append invariants

1. Sequence starts at 1 and increases by one.
2. Each event references the exact previous event hash.
3. Append uses a candidate-scoped lock and atomic stage/rename.
4. Existing events are immutable; correction is a later incident/decision.
5. Projection files may be regenerated from events and are not authority.
6. Dossier root covers candidate identity and ordered event hashes.
7. Concurrent append conflict retries from the new head; it never forks silently.

## Gate decision

```ts
interface GateDecisionV1 {
  schema: "werkstatt/certification-gate-decision@1";
  decisionId: string;
  candidateId: string;
  gate: CertificationGate;
  profileHash: string;
  status: CertificationStatus;
  requirementResults: Array<{
    requirementId: string;
    status: RequirementStatus;
    selectedEvidenceIds: string[];
    reasonCodes: string[];
  }>;
  coverage: Array<{
    dimension: SiteQualityDimension | "core";
    applicableRequired: number;
    passedRequired: number;
  }>;
  precedenceReason: "fail" | "stale" | "incomplete" | "all-required-pass";
  actionPackId: string | null;
  dossierRootBefore: string;
  dossierRootAfter: string;
  decidedAt: string;
  engineVersion: string;
}
```

### Decision selection

For each requirement, the engine selects the newest admitted evidence that is valid for the candidate/profile/gate/environment and not expired. A newer invalid envelope cannot shadow an earlier valid one because it is not admitted. A newer valid failure supersedes an earlier pass for current evaluation. A decision lists exact evidence IDs; it never references “latest” implicitly.

### Aggregation algorithm

1. Evaluate applicability and require evidence for the applicability result.
2. Resolve required/conditional requirements for the gate.
3. Select compatible evidence for each requirement.
4. Map no evidence to incomplete, mismatch/expiry to stale, and admitted violation to fail.
5. Verify dimension coverage.
6. Compute top-level precedence: any fail; else any stale; else any incomplete; else pass.
7. Generate an action pack for every non-pass.
8. Append the decision and resulting dossier root atomically.

## Certification action pack

```ts
interface CertificationActionPackV1 {
  schema: "werkstatt/certification-action-pack@1";
  actionPackId: string;
  candidateId: string;
  decisionId: string;
  gate: CertificationGate | "continuous-health";
  tasks: CertificationActionTaskV1[];
  contentHash: string;
}

interface CertificationActionTaskV1 {
  taskId: string;
  requirementId: string;
  dimension: SiteQualityDimension | "core";
  status: Exclude<RequirementStatus, "pass" | "not-applicable">;
  classification: RemediationClass;
  ownerRole: string;
  priority: "critical" | "high" | "medium" | "low";
  dependsOn: string[];
  blockingReason: string;
  evidenceIds: string[];
  anchors: Array<{
    kind: "file" | "url" | "route" | "dom-selector" | "screenshot-region" | "log";
    value: string;
    digest?: string;
  }>;
  instructions: string[];
  reproduceCommand: string;
  verificationCommand: string;
  expectedEvidence: string;
  candidateConsequence: "new-candidate" | "same-candidate-retry" | "policy-rfc";
}
```

Tasks are topologically sorted. Generic instructions without anchors or verification are schema-invalid. Rendered Markdown and HTML must derive from the canonical JSON object and share its content hash.

## Evaluator policy and payload

```ts
interface EvaluatorPolicyV1 {
  ordinaryEvaluators: 1;
  criticalEvaluators: 2;
  borderlineEvaluators: 2;
  confidenceThreshold: number;
  borderlineMargin: number;
  requireDistinctEvaluatorIds: true;
  preferDistinctModelFamilies: boolean;
  criticalChangeRules: RiskRuleV1[];
  borderlineRules: RiskRuleV1[];
  rubricId: string;
  rubricVersion: string;
}

interface QualitativeEvaluationPayloadV1 {
  schema: "werkstatt/site-qualitative-evaluation@1";
  evaluatorId: string;
  evaluatorRunId: string;
  modelProvider: string;
  modelVersion: string;
  rubricId: string;
  rubricVersion: string;
  inputBundleHash: string;
  riskClass: "ordinary" | "critical" | "borderline";
  verdict: "pass" | "fail" | "borderline" | "incomplete";
  confidence: number;
  criteria: Array<{
    criterionId: string;
    verdict: "pass" | "fail" | "borderline" | "incomplete";
    rationale: string;
    diagnosticIds: string[];
    evidenceAnchors: string[];
  }>;
  diagnostics: Diagnostic[];
}
```

Evaluator runs are isolated and may not consume another evaluator’s result. For two-evaluator routes: pass/pass maps to pass; fail/fail maps to fail; all disagreements and missing runs map to incomplete.

## Current certification health

```ts
interface CertificationHealthDecisionV1 {
  schema: "werkstatt/certification-health@1";
  healthDecisionId: string;
  candidateId: string;
  previousHealth: CertificationHealth | null;
  health: CertificationHealth;
  triggeringRequirementIds: string[];
  selectedEvidenceIds: string[];
  action: DriftAction;
  incidentId: string | null;
  dossierRootBefore: string;
  dossierRootAfter: string;
  decidedAt: string;
}
```

Historical gate decisions are never edited when health changes. A health projection selects the newest health event for the currently deployed candidate.

## Durable storage adapter

```ts
interface CertificationStorageAdapter {
  id: string;
  putObject(input: {
    digest: string;
    bytes: Uint8Array;
    mediaType: string;
  }): Promise<{ locator: string; sizeBytes: number }>;
  headObject(digest: string): Promise<{
    exists: boolean;
    sizeBytes?: number;
    digest?: string;
    locator?: string;
  }>;
  getObject(digest: string): Promise<Uint8Array>;
  appendAuditRecord(record: Uint8Array): Promise<{ locator: string }>;
}
```

### Storage invariants

- Digest keys are immutable.
- `putObject` followed by `headObject` must confirm digest and size before sync evidence is appended.
- Credentials are provided through environment/bindings and never persisted in release state or evidence.
- Alt/Main require at least one verified durable replica matching the current dossier root.
- Local cache eviction cannot delete the only durable copy of a protected payload.
- Retention GC checks current deployment, rollback eligibility, incidents, and audit holds before deletion.

## Retention policy

```ts
interface RetentionPolicyV1 {
  schema: "werkstatt/certification-retention@1";
  compactAudit: "indefinite";
  certifiedFullDossierAfterSupersessionDays: 730;
  unsuccessfulEvidenceDays: 180;
  certifiedHeavyPayloadDays: 365;
  unsuccessfulHeavyPayloadDays: 90;
  protectedReferences: Array<"current" | "rollback-target" | "open-incident" | "audit-hold">;
}
```

GC appends a retention tombstone before deleting a payload. A tombstone records payload digest, size, media type, retention-policy hash, reason, and deletion time. Compact decision/evidence metadata remains.

## Command contracts

### `release.certify`

```sh
pnpm exec werkstatt run release.certify \
  --release=<release-id> \
  --gate=<dev-deploy|propagate-alt|promote-main> \
  [--resume] [--json]
```

Behavior:

1. Resolve the immutable candidate and active plugin profile.
2. Validate profile and candidate identity.
3. Acquire release+gate lock.
4. Re-verify dossier integrity and durable sync state.
5. Determine missing/stale requirements.
6. Run eligible producers according to dependency/timeout/retry policy.
7. Ingest evidence and evaluate the gate.
8. Generate action pack for non-pass.
9. Sync current dossier where the gate requires durability.
10. Return canonical data and release the lock.

Exit code is 0 only for `pass`; all non-pass decisions return 1 with structured status and action-pack locator. `--resume` does not weaken identity or evidence requirements.

### `release.certification.status`

Read-only. Returns candidate identity, latest decision per gate, current health, coverage, durable replica status, active incidents, next required action, and action-pack locators.

### `release.certification.verify`

Read-only. Recomputes candidate ID, evidence IDs, event chain, dossier root, decision references, attestations, payload availability, and durable replica match. It never runs producers.

### `release.certification.profile.validate`

Read-only. Validates the one active plugin profile and producer registrations. This command is an activation and package-check gate.

### `release.certification.monitor`

Runs TTL/scheduled continuous requirements for the current Main candidate, appends evidence/health decisions, opens incidents/action packs, and dispatches the profile-declared drift action. It is idempotent for a schedule window.

### `release.certification.gc`

Applies certification retention policy to content-addressed evidence payloads. Defaults to dry-run; mutation requires an explicit apply flag defined by its implementation RFC. This is distinct from legacy release/mission cleanup.

### `ecosystem.legacy-artifacts.cleanup`

Separate post-cutover command. Inventories allowed legacy release/mission payloads, verifies mirrors and protected records, writes compact tombstones, and removes only exact allow-listed paths. Defaults to dry-run and refuses to run before the clean-cutover marker and first new `main-certified` candidate.

## Deployment integration contract

| Transition | Required decision | Artifact behavior | Postcondition |
|---|---|---|---|
| Dev deploy | `dev-deploy: pass` | Deploy immutable stored candidate artifact | Dev URL identity recorded; runtime producers may run |
| Propagate Alt | `propagate-alt: pass` plus durable dossier | Deploy same artifact | Alt URL identity recorded; Alt producers run |
| Promote Main | `promote-main: pass` plus durable dossier | Prefer isolated slot; switch same artifact | Enter `main-verifying`, then `main-certified` or rollback |

Deployment commands invoke certification automatically and then re-verify the returned decision ID and dossier root. No caller flag can substitute for this call.

## Concurrency, idempotency, and recovery

- Lock key is `certification:<candidateId>:<gate>`.
- Every orchestrated run has a stable operation ID and append-only progress events.
- Re-execution with unchanged identity selects admitted current evidence and executes only missing/stale producers.
- A crash after evidence append but before decision append resumes from the dossier head.
- A crash after decision append but before durable sync sees an unsynced pass and cannot promote until sync completes.
- A crash during Main verification resumes verification or rolls back according to recorded deploy operation state; it never marks success from partial state.
- Lock recovery follows DNA-51 consistency primitives and records an incident.

## Stable diagnostic families

Implementation RFCs must allocate stable rules within these families:

| Family | Meaning |
|---|---|
| `CERT-PROFILE-*` | profile schema, coverage, producer, and dependency violations |
| `CERT-CANDIDATE-*` | candidate identity and artifact binding violations |
| `CERT-EVIDENCE-*` | envelope, payload, freshness, environment, and attestation violations |
| `CERT-DOSSIER-*` | hash chain, sequence, root, append, and replica violations |
| `CERT-GATE-*` | applicability, aggregation, and decision violations |
| `CERT-EVAL-*` | evaluator isolation, routing, rubric, and consensus violations |
| `CERT-DEPLOY-*` | transition, Main verification, and rollback violations |
| `CERT-HEALTH-*` | monitoring, TTL, drift, and incident violations |
| `CERT-RETENTION-*` | protected payload and tombstone violations |
| `CERT-CLEANUP-*` | legacy inventory, allow-list, mirror, and deletion violations |

Every error includes `ruleId`, severity, bounded message, evidence locator when safe, and an executable fix/verification hint. Summary-only warnings are forbidden.

## Security and privacy

- Producer logs pass through shared secret/PII detection before persistence.
- Payload locators never embed credentials or signed query strings with long-lived access.
- Evaluator input bundles exclude secrets, private customer data, and hidden operator credentials.
- Public screenshots are treated as potentially personal data and follow retention/redaction policy.
- Remote attestation keys are workload-scoped and rotatable; key ID is recorded.
- Signature verification trusts a configured issuer registry, not arbitrary keys included in evidence.
- Failed redaction or signature verification cannot be suppressed for required evidence.
