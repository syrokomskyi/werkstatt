# Verification Strategy

This document defines the minimum evidence needed to claim that the Werkstatt Release Certification System is correct. It is intentionally stronger than command-level happy-path tests: the system controls publication, retention, and rollback, so false success and irrecoverable ambiguity are the primary hazards.

## Verification principles

1. **Absence is exercised explicitly.** Every required input, producer, envelope, payload, replica, evaluator, and postcondition needs a missing-case test.
2. **Identity is adversarially tested.** Tests mutate one identity field at a time and prove that stale or integrity failure results.
3. **Crash points are first-class.** An implementation is incomplete until interruption and resumption have been tested at each persistent boundary.
4. **Negative evidence is durable.** Tests verify that fail, stale, incomplete, rejected evidence, rollback, and incident events survive reconstruction.
5. **Render truth is measured in deployed environments.** Static/build-only tests cannot stand in for browser/runtime requirements.
6. **The evaluator is not trusted by default.** Its identity, isolation, input coverage, anchors, and schema are validated just like deterministic producers.
7. **Deletion is verified more strongly than creation.** Cleanup needs plan binding, protected-set proof, interruption safety, and retained audit reconstruction.

## Test layers

| Layer | Primary purpose | Minimum tooling style |
|---|---|---|
| Type/schema | reject malformed public objects and unknown vocabulary | strict TypeScript plus runtime schema tests |
| Unit | prove pure identity, selection, aggregation, applicability, and policy functions | deterministic table tests |
| Property-based | prove canonicalization, hash sensitivity, ordering, aggregation laws, idempotency | fast-check using project conventions |
| Repository integration | prove append, atomicity, locking, corruption detection, projection rebuild, retention | real temporary filesystem and adapter contract fixtures |
| Command integration | prove registered commands, outputs, exit codes, resume, status, diagnostics | kernel command harness |
| Workshop fixture | prove engine + exactly one site plugin + profile + producers | fixture workshop from clean install/tarball where applicable |
| Browser/deployment | prove deployed identity, runtime behavior, environment specificity, traffic switch, rollback | deterministic local/provider fixture and controlled remote target |
| Evaluator contract | prove isolation, routing, consensus, anchors, incomplete behavior | fake evaluator providers plus controlled real-agent evaluation |
| End-to-end cutover | prove one candidate traverses Dev, Alt, Main, verification, durable sync, health | dedicated disposable environment before sole-site cutover |
| Cleanup rehearsal | prove exact legacy inventory and protected retention without deleting real estate | byte-for-byte fixture clone and dry-run plan |

## Core invariants and required properties

### Candidate identity

Property suites must prove:

- canonical object key order and source path separator do not change `candidateId`;
- `createdAt`, physical locator, and detached signature bytes do not change identity;
- changing any source/content/artifact/platform identity field changes `candidateId`;
- changing profile semantics changes profile hash and candidate ID;
- a release ID cannot be rebound to different candidate bytes;
- a dirty source boundary cannot create a candidate;
- a deployed identity mismatch is stale even when all previous evidence passed;
- rebuilding identical source with a different toolchain/config is a new candidate;
- promotion never invokes a build after candidate creation.

### Evidence admission

For every `EvidenceEnvelopeV1` field group, tests include valid, missing, malformed, mismatched, and tampered cases. Required cases include:

- unknown producer, wrong producer version/source hash, wrong output schema;
- wrong candidate, profile, requirement, gate, or environment;
- expired evidence and future/incoherent timestamps;
- missing payload, wrong digest, wrong size, and locator with credentials;
- invalid canonical diagnostic, unanchored blocking finding, or oversized unbounded message;
- `not-applicable` without rule/result/input hash;
- unresolved secret/PII redaction;
- invalid/untrusted attestation;
- duplicate ID with same bytes is idempotent; duplicate ID with different bytes is an incident;
- rejected evidence cannot shadow or alter selected admitted evidence.

### Aggregation

Exhaustive/property tests prove:

- any fail dominates stale, incomplete, pass, and not-applicable;
- without fail, any stale dominates incomplete and pass;
- without fail/stale, any incomplete dominates pass;
- `not-applicable` participates only when classification and applicability are valid;
- advisory requirements never make a gate pass and cannot hide required coverage;
- no requirements, no producer result, empty diagnostics, process exit 0, or old evidence never imply pass;
- newest compatible admitted evidence is selected deterministically;
- selected evidence IDs are explicit and reproduce the same decision;
- missing dimension coverage blocks Main even if all present requirements pass;
- every non-pass deterministically produces a non-empty valid action pack.

### Dossier and storage

Tests prove:

- sequence gaps, duplicate sequence, wrong previous hash, changed event, and changed payload digest are detected;
- two concurrent appenders serialize or retry without silent fork;
- crash before temp write, after temp write, after fsync, after rename, and before projection update recovers to one valid head;
- projections deleted or corrupted can be rebuilt solely from authority events;
- moving the dossier/cache does not change the root;
- durable adapter verifies digest and size after upload;
- Alt/Main cannot pass when replica is missing or root differs;
- adapter timeouts and partial uploads remain resumable and non-passing;
- credentials never appear in manifests, events, command JSON, or logs;
- retention protects current, rollback, open-incident, and audit-hold references;
- tombstone is committed before payload deletion and compact evidence remains reconstructable.

## Command conformance matrix

| Command | Success evidence | Required negative/recovery evidence |
|---|---|---|
| `release.certification.profile.validate` | valid one-plugin profile, complete dimension/gate coverage | zero/multiple plugin, profile mismatch, missing producer, invalid reuse, missing remediation, coverage hole |
| `release.certify` | pass decision with exact candidate/profile/evidence/root | every non-pass class, timeout, retry exhaustion, concurrent run, killed run, stale identity, missing replica, no bypass flags |
| `release.certification.status` | projection agrees with event reconstruction | corrupt/missing projection is reported/rebuilt without producer execution |
| `release.certification.verify` | recomputed IDs, chain, root, payloads, attestations, replica match | each tamper class is a stable diagnostic and nonzero result |
| `release.certification.monitor` | idempotent schedule window and appended health event | duplicate delivery, late evidence, expiry, shared outage, candidate regression, recovery |
| `release.certification.gc` | dry-run/apply bound to retention plan | protected reference, plan drift, missing durable copy, interruption, unknown payload |
| `ecosystem.legacy-artifacts.cleanup` | exact inventory, plan hash, tombstones, verified freed bytes | no cutover marker, wrong current candidate, mirror failure, unknown path, protected path, plan drift, interruption |

Every command fixture validates canonical JSON schema, bounded human rendering, exit code, diagnostic rule IDs, action/next-step fields, and absence of secrets.

## Site Profile v1 coverage verification

The implementation must maintain a machine-readable traceability table generated or validated from the profile. Every requirement ID in `site-profile-v1.md` maps to:

- profile source location;
- producer registration and version source;
- evidence output schema;
- gate/environment/applicability declaration;
- at least one positive fixture;
- at least one blocking negative fixture;
- explicit `not-applicable` fixture for conditional rules;
- remediation/action-pack fixture;
- relevant normative reference.

Profile activation fails if any mapping is absent. A hand-maintained prose-only claim of coverage is insufficient.

### Representative site fixtures

The test estate must include at least:

1. a minimal truthful static single-locale site;
2. a multilingual site with alternate/canonical routes and incomplete translation fixture;
3. a business site with products, prices, claims, evidence, legal/privacy surfaces, and structured data;
4. a site with forms, consent, external integration, async/error states, and primary conversion journey;
5. a visually complex responsive site with multiple templates, navigation, media, interaction, and accessibility states;
6. intentionally broken variants covering each requirement family;
7. a stale deployment where public build identity differs from the candidate;
8. a shared-infrastructure outage distinct from a candidate-specific regression.

Fixtures should be small and compositional. They must avoid copying a production site or embedding customer secrets.

## Evaluator verification

### Contract and routing tests

Tests must cover:

- ordinary change routes to exactly one evaluator;
- each critical rule routes to two evaluator identities;
- borderline confidence/criterion routes to two;
- identical evaluator identity, missing model identity, missing rubric version, or missing bundle hash is rejected;
- a second evaluator cannot read the first result;
- author-agent identity cannot satisfy evaluator identity in the same candidate workflow;
- missing changed route/state/locale/viewport makes bundle coverage incomplete;
- pass/pass yields pass, fail/fail yields fail, disagreement/missing run yields incomplete;
- unanchored rationale, generic praise, contradictory criterion/verdict, or invalid confidence is rejected;
- evaluator timeout/provider failure is incomplete and creates an infrastructure-retry action, never pass.

### Quality calibration set

A versioned calibration set contains accepted, rejected, and borderline page bundles with rationale authored during implementation review. It spans all nine rubric axes and critical surface classes. Changes to rubric or calibration labels require versioning and regression comparison. Acceptance requires:

- no accepted critical defect is classified as pass by consensus;
- deterministic anchor/coverage defects are always caught before qualitative verdict;
- evaluator disagreement rate and provider failure rate are reported, not hidden;
- repeated runs on the same bundle are evaluated for stability within an explicit tolerance;
- calibration assets contain no private production data.

Agent judgment is evidence, not proof of its own correctness; deterministic contract validation remains authoritative.

## Deployment state-machine verification

The deployment harness models at least these states:

```text
candidate-created
  -> dev-certified -> dev-deployed
  -> alt-certified -> alt-deployed
  -> main-certified-pre-switch -> main-verifying
  -> main-certified
  or rollback-verifying -> rolled-back
  or incident-open
```

The exact final vocabulary is resolved by CERT-001/CERT-007, but tests must show:

- no transition crosses a gate without a recorded pass for exact candidate/profile/gate;
- the same artifact digest is deployed at every channel;
- certification result is reverified immediately before transition;
- a pass without required durable root is not promotable;
- Main does not become certified on traffic switch alone;
- post-switch route, identity, action, DNS/TLS/header, and health failures block certification;
- useful rollback deploys and verifies the previous candidate before reporting recovery;
- failed rollback leaves an incident and truthful unknown/degraded serving state, not success;
- shared outage does not switch to an equally affected rollback candidate;
- concurrent or repeated deployment request is idempotent;
- crash recovery is defined for every durable write and external side-effect boundary.

### Fault injection points

At minimum inject termination/failure:

1. before and after gate decision append;
2. before, during, and after durable dossier sync;
3. before provider deploy request and after provider accepted it but before local acknowledgement;
4. after artifact upload but before channel identity observation;
5. before and after traffic switch;
6. during each required Main post-switch producer;
7. after rollback request and before rollback verification;
8. before final state/Bordbuch/materialization persistence.

Each case must converge after resume to one explainable state with no duplicate destructive side effect.

## Continuous-health verification

Use a fake clock and deterministic scheduler windows to prove:

- evidence is current before TTL, stale after TTL, and current again only after new admitted evidence;
- duplicate schedule deliveries append at most one effective run/decision per operation key;
- delayed results cannot overwrite a newer health decision silently;
- health transitions `current -> degraded -> current` preserve all events;
- revocation conditions and recovery requirements are explicit;
- retry, incident-only, and rollback dispatch exactly the profile-selected action;
- current public candidate mismatch is immediately severe and cannot reuse prior health;
- status presents historical gate pass and current degraded/revoked health simultaneously;
- monitor failure itself is observable and cannot masquerade as current health indefinitely.

## Security, privacy, and supply-chain verification

Required checks include:

- generated fixtures with token/key/password/credential patterns in logs, locators, screenshots, and payloads;
- PII redaction fixtures and false-positive-safe blocking behavior;
- untrusted attestation issuer, rotated key, invalid signature, and replayed envelope;
- path traversal, symlink, digest collision simulation interface, oversized payload, decompression bomb boundary, and malformed media type;
- evaluator prompt/input injection originating in site content; the evaluator must treat page content as evidence, not instructions;
- command argument injection and locator escaping;
- dependency/package activation from a clean tarball/fixture workshop;
- public output scan for source maps, environment files, internal prompts, action packs, and dossier contents.

No test may print real workspace secrets. Test secrets are synthetic and clearly marked.

## Performance and scale budgets

Implementation RFCs must set measured budgets based on fixtures, but at minimum verify:

- status/verify can stream or bound memory for a long dossier;
- content-addressed duplicate payloads are not stored repeatedly;
- independent producers execute with bounded concurrency and cancellation;
- one slow producer cannot exceed its declared timeout unnoticed;
- action packs and human output remain bounded for thousands of diagnostics through summary plus full artifact;
- repository verification and projection rebuild have reported duration/count metrics;
- retention/cleanup inventory can handle the observed estate scale (approximately 61 GB at specification time) without loading file contents into memory.

Performance budget failure is a test failure or a documented RFC revision; it is not silently converted to an advisory result.

## Cutover rehearsal and production evidence

Before the sole-site cutover, run the complete pipeline in a disposable environment with the same adapter classes and bindings shape. The rehearsal report records candidate/profile hashes, each decision/evidence ID, URLs, artifact digests, durable root, evaluator identities, fault-injection results, rollback result, and current health.

Production cutover acceptance requires:

- new candidate created by the new system with no legacy dossier import;
- pass at Dev, Alt, Main pre-switch, and Main post-switch for exact identity;
- independent evaluator coverage appropriate to risk (first cutover is critical);
- durable replica verified before Alt/Main and after Main verification;
- previous candidate retained and rollback procedure verified;
- public Main build identity equals dossier candidate;
- continuous monitor completes at least one successful window;
- clean-cutover marker and compact report are committed through canonical mechanisms;
- operators can reproduce `status` and `verify` from documented commands.

## Legacy cleanup verification

Cleanup implementation and execution need separate evidence.

### Fixture verification

Create a fixture estate containing allowed heavy payloads, protected current/rollback payloads, git/Bordbuch/docs/transcripts/manifests, symlinks, unknown files, partially removed directories, mirror disagreement, and plan drift. Prove:

- dry-run is the default and writes no deletion;
- apply requires the exact inventory/plan hash;
- unknown or newly appeared paths abort before deletion;
- symlink targets outside allowed roots are never followed;
- protected and durable-audit artifacts survive;
- interruption at every deletion boundary resumes idempotently;
- tombstones and final byte accounting match actual deletion;
- a second apply is a safe no-op with an explanatory report.

### Real-estate execution evidence

Before real apply, archive the dry-run inventory and obtain operator confirmation of the exact plan. After apply, verify mirrors, current/rollback deployment, certification status, dossier reconstruction, git clean trees, remaining protected inventory, and actual freed bytes. The cleanup report must enumerate exact removed categories and whether recovery is possible from any retained mirror/object store.

## Required CI and release gates

As implementation progresses, CI must gain gates in dependency order:

1. schema/type/property tests;
2. profile coverage and command-manifest validation;
3. repository/storage adapter contracts;
4. orchestrator and crash-recovery fixtures;
5. site producer matrix;
6. evaluator contract/calibration;
7. deployment state machine and disposable environment smoke;
8. continuous-health fake-clock suite;
9. cleanup fixture suite.

All workflow changes follow repository CI reliability rules. Remote/provider tests must separate deterministic PR-safe fixtures from credentialed scheduled/pre-release tests; absence of credentials must report an explicit not-run CI job and cannot certify a release that requires the evidence.

## Program acceptance evidence index

At the end of CERT-010, create a generated or validated index mapping every specification decision, core contract invariant, Site Profile v1 requirement, and roadmap RFC acceptance item to:

- implementation file/symbol;
- executable test name;
- latest CI evidence;
- command/report artifact;
- normative documentation location.

The index is not authority, but its completeness is a release gate. A missing mapping is `incomplete`; narrative assurances do not close it.
