# Implementation Roadmap

This roadmap decomposes release certification into ten implementation RFCs. Each RFC is independently reviewable, but later waves must not invent alternate contracts. `contracts.md` and `site-profile-v1.md` are the common source of truth.

## Delivery rules for every RFC

Every materialized RFC must:

1. cite this specification as `werkstatt-release-certification/<document>#<section>` and cite relevant decisions as `werkstatt-release-certification/ADR-NNN`;
2. use the existing engine/plugin boundary and explicitly supersede conflicting legacy behavior;
3. map each changed command, package, state field, generated artifact, and validator;
4. define typed inputs/outputs, canonical diagnostics, exit codes, lock/idempotency behavior, failure recovery, and observability;
5. include unit, property-based, integration, crash-recovery, and negative-path evidence appropriate to its scope;
6. update owning templates/generators before generated output;
7. update command manifests, ecosystem projections, Compass XML, living specs, authoring docs, and AGENTS rules only through their owning mechanisms;
8. avoid compatibility layers, permissive transition modes, runtime waivers, and silent fallback;
9. leave the tree clean and commit through the canonical platform command;
10. provide line-accurate acceptance evidence before `implemented` status.

The implementation agent must inspect existing commands and history before removing or superseding any field or behavior. The specification authorizes the target architecture, not careless deletion.

## Waves and dependency graph

```text
Wave 1: CERT-001 ─┬─> CERT-002 ─┐
                  └─> CERT-003 ─┼─> CERT-004 ─> CERT-005 ─> CERT-006
                                │                         │
Wave 3:                         └─────────────────────────┴─> CERT-007 ─> CERT-008
                                                                        │
Wave 4:                                                                └─> CERT-009 ─> CERT-010
```

CERT-002 and CERT-003 may be implemented in parallel after CERT-001. CERT-005 may start after CERT-004 but cannot be accepted without the profile contract from CERT-002. CERT-006 requires deterministic capture and coverage from CERT-005. All cutover and deletion work waits for the complete certification path.

## Wave 1 — Foundation

### CERT-001 — Core certification domain and deterministic decisions

**Goal:** establish the engine-owned domain model without deploying, storing remotely, or running site-specific producers.

**Required scope:**

- introduce `ReleaseCandidateIdentityV1`, canonical identity payload, and candidate resolver;
- introduce all status vocabularies and precedence `fail > stale > incomplete > pass`;
- introduce evidence, dossier event, gate decision, action pack, and health contracts;
- implement pure schema parsing and canonical serialization through the shared fingerprint package;
- implement deterministic requirement selection, applicability handling, evidence selection, dimension coverage, and aggregation;
- implement action-pack construction for every non-pass result;
- introduce stable diagnostic families and structured result types;
- define package/module ownership and public exports without site-specific imports;
- explicitly reconcile release-state vocabulary conflicts in DNA-49/DNA-73 and existing release schemas.

**Acceptance emphasis:** property tests prove hash stability/sensitivity and aggregation laws; fixtures prove missing evidence cannot pass; no command or deployment integration is required yet.

**Out of scope:** plugin profile loading, filesystem repository, remote storage, producer execution, deployment transitions.

### CERT-002 — Versioned plugin certification profile

**Depends on:** CERT-001.

**Goal:** make quality policy declarative, versioned, plugin-owned, hash-bound, and activation-validated.

**Required scope:**

- extend the closed `werkstatt/plugin@1` contract through an existing allowed surface or explicitly supersede the contract with a versioned successor; do not add an ad hoc sixth hook;
- implement `CertificationProfileV1`, producer declarations, requirements, applicability, reuse/freshness, risk, remediation, and retention schemas;
- register exactly one active profile and bind its plugin/profile IDs to `forge.yaml`;
- canonicalize and hash parsed profile data; retain source-file hash separately;
- implement coverage validation for all nine dimensions and all Main gate paths;
- implement producer registration validation and command/module existence checks;
- add `release.certification.profile.validate` with JSON output and stable diagnostics;
- make plugin/package activation fail when a required profile is absent or invalid.

**Acceptance emphasis:** malformed, under-covered, mismatched, silently skippable, or unregistered profiles fail. Formatting-only YAML differences do not change canonical hash.

**Out of scope:** running producers or making deployment decisions.

### CERT-003 — Content-addressed dossier repository, durable storage, and retention

**Depends on:** CERT-001.

**Goal:** persist immutable, verifiable evidence and decisions locally and durably.

**Required scope:**

- implement candidate-scoped dossier repository with append-only event chain, projection rebuild, and atomic append;
- admit only valid evidence envelopes and record rejected-ingestion incidents safely;
- implement payload content addressing, size/digest verification, redaction metadata, and attestation validation boundary;
- implement local cache adapter and provider-neutral durable adapter interface;
- implement R2 as the first durable adapter using environment bindings and no embedded credentials;
- implement verified dossier-root replication and durable-replica events;
- implement retention classification, protected references, dry-run GC, apply-mode safety, and tombstones;
- test concurrent appends, crash points, corruption, missing payloads, replica mismatch, and projection recreation.

**Acceptance emphasis:** arbitrary relocation does not change dossier root; corruption is detected; Alt/Main durability can be proven; protected payloads cannot be collected.

**Out of scope:** legacy releases/missions cleanup, producer orchestration, deployment commands.

## Wave 2 — Orchestration and site quality

### CERT-004 — Certification orchestrator and command surface

**Depends on:** CERT-001, CERT-002, CERT-003.

**Goal:** provide one idempotent, resumable, locked certification workflow and inspection surface.

**Required scope:**

- implement `release.certify` exactly around immutable candidate/gate identity;
- implement producer dependency planning, bounded parallelism, timeout, retry, cancellation, and progress events;
- ensure producers return results to engine ingestion rather than writing dossiers;
- implement gate lock, operation ID, resumability, crash recovery, and concurrent invocation behavior;
- implement `release.certification.status` and `release.certification.verify` as read-only commands;
- implement canonical JSON and human rendering from the same result objects;
- return exit 0 only for pass and return action-pack location for every non-pass;
- expose reusable engine APIs for deployment integration without requiring shell-out between modules.

**Acceptance emphasis:** repeated unchanged runs are deterministic; a killed run resumes; concurrent runs do not fork dossiers; missing/stale/failed producers cannot be misreported as pass.

**Out of scope:** full Site Profile implementation, evaluator agents, deployment transition changes.

### CERT-005 — Site Profile v1 deterministic producers and false-pass removal

**Depends on:** CERT-002, CERT-004.

**Goal:** implement deterministic coverage for every non-qualitative Site Profile v1 requirement and remove legacy permissive behavior.

**Required scope:**

- ship the canonical Site Profile v1 data from the site plugin;
- inventory and adapt existing content, PBP, route, accessibility, performance, security, browser, and deployment checks into typed producers;
- add missing producers and representative route/state/viewport planning;
- bind every result to exact candidate/profile/environment/toolchain inputs;
- emit explicit applicability evidence for every conditional requirement;
- normalize existing diagnostic families into canonical `Diagnostic[]` without losing anchors;
- remove grace-period success, summary-only warning success, empty-result success, and equivalent permissive paths, including the date-based grace behavior currently described by verification plan `vm-15`;
- keep certification read-only and produce agent-ready action tasks rather than editing content;
- run actual Dev/Alt browser workloads through registered remote workload producers.

**Acceptance emphasis:** every matrix row in `site-profile-v1.md` has a producer, fixture, environment rule, and negative test. Existing checks cannot claim quality without admitted envelopes.

**Out of scope:** qualitative evaluator consensus and Main traffic switching.

### CERT-006 — Independent evaluator agents and qualitative consensus

**Depends on:** CERT-001, CERT-002, CERT-005.

**Goal:** add isolated qualitative judgment without allowing self-review or ungrounded prose.

**Required scope:**

- define/version the site qualitative rubric and evaluator input bundle;
- build complete route/state/viewport/change coverage manifest from deterministic producer outputs;
- run one evaluator for ordinary changes and two for critical/borderline changes;
- implement critical/borderline risk rules from Site Profile v1;
- ensure distinct evaluator identities and isolation from authoring agents and peer outputs;
- validate confidence, criterion verdicts, diagnostics, anchors, and bundle hash;
- aggregate pass/pass and fail/fail consensus; disagreement, missing independence, missing coverage, or insufficient evidence becomes incomplete;
- make evaluator provider/model replaceable without weakening evidence contract;
- produce action-pack tasks that a separate author agent can execute.

**Acceptance emphasis:** adversarial fixtures cover self-review, identical evaluator identity, peer-result leakage, unanchored praise, missed changed routes, disagreement, and critical change routing.

**Out of scope:** evaluator-led mutation or human approval.

## Wave 3 — Deployment and ongoing truth

### CERT-007 — Deployment gates, Main verification, and rollback

**Depends on:** CERT-004, CERT-005, CERT-006.

**Goal:** make certification the sole authority for Dev, Alt, and Main transitions.

**Required scope:**

- integrate automatic certification calls into canonical deployment commands;
- enforce same immutable artifact across candidate creation, Dev, Alt, and Main;
- enforce `dev-deploy: pass`, `propagate-alt: pass`, and `promote-main: pass` plus durability before their transitions;
- remove force/skip/waiver/grace paths and any success inference from deploy command exit alone;
- add explicit `main-verifying` and `main-certified` state semantics;
- prefer isolated Main slot deployment and atomic traffic switching when adapter capability permits;
- execute bounded post-switch Main requirements, durable-sync the new root, and certify only after pass;
- on required failure, evaluate rollback usefulness, restore verified rollback candidate when appropriate, verify restoration, and open incident/action pack;
- define crash recovery for every point between deploy start, switch, verify, rollback, and state persistence;
- align release state schemas, CLI output, Bordbuch events, materialization state, and deployment adapters.

**Acceptance emphasis:** integration tests inject failure/crash at every transition boundary and prove there is no false Main success or unknown deployed identity.

**Out of scope:** scheduled health monitoring and old-estate deletion.

### CERT-008 — Continuous certification health and drift response

**Depends on:** CERT-004, CERT-007.

**Goal:** distinguish immutable historical certification from current public health.

**Required scope:**

- implement `release.certification.monitor` and schedule/event-window idempotency;
- execute Site Profile v1 Main TTL/scheduled requirements;
- append health decisions without changing historical gate decisions;
- expose `current`, `degraded`, and `revoked` state with triggering evidence;
- classify drift response as retry, incident-only, or rollback using profile rules and rollback usefulness;
- integrate incident creation, action packs, status projection, and Leitstand visibility;
- handle shared infrastructure outage, expired evidence, public output drift, DNS/header drift, and candidate-specific regression distinctly;
- recover from monitor crashes, duplicate scheduler delivery, and late/out-of-order evidence.

**Acceptance emphasis:** deterministic time-controlled tests prove expiry and recovery; a shared outage does not cause pointless rollback; recovered health appends a new event rather than rewriting history.

**Out of scope:** changing product content or provider-specific incident management.

## Wave 4 — Clean migration and estate reduction

### CERT-009 — Single-site clean cutover

**Depends on:** CERT-005, CERT-006, CERT-007, CERT-008.

**Goal:** republish the one current site through the new complete pipeline without importing legacy certification state.

**Required scope:**

- inventory current Main URL/domain, candidate source, environment bindings, rollback target, external mirrors, and publication adapter;
- create a new immutable candidate and dossier exclusively through the new system;
- pass Dev, Alt, evaluator, promote-Main, post-switch, durable storage, and continuous-health paths;
- retain the previous deployed artifact as a protected rollback target until the new candidate is stable;
- write an explicit clean-cutover marker containing new candidate, decision IDs, dossier root, Main identity, health state, rollback identity, and timestamp;
- prove no runtime command reads a legacy release certification/grace/mission artifact for success;
- remove temporary migration wiring only after the complete path passes.

**Acceptance emphasis:** operator receives a single reproducible cutover report; public Main identity and dossier agree; rollback remains possible; no legacy import/bootstrap logic exists.

**Out of scope:** deleting old release and archived mission payloads.

### CERT-010 — Post-cutover legacy artifact cleanup

**Depends on:** CERT-009.

**Goal:** remove heavy obsolete release/mission material safely after the first certified Main cutover.

**Required scope:**

- implement `ecosystem.legacy-artifacts.cleanup` as a separate idempotent inventory/plan/apply command;
- require clean-cutover marker, current `main-certified` identity, verified durable dossier, verified mirrors, and protected rollback references;
- inventory exact legacy allow-listed categories and byte counts before mutation;
- preserve git repositories/history, compact Bordbuch/audit records, specifications/RFCs/ADRs, session transcripts, manifests, material reports, cutover record, and protected/current rollback artifacts;
- delete only heavy superseded workpieces, snapshots, cached build outputs, and staging payloads explicitly classified by the plan;
- default to dry-run; bind apply to the exact plan hash; reject drift or unknown paths;
- append tombstones/cleanup report and verify freed bytes, remaining protected records, and clean trees;
- make interruption and re-run safe; never use broad unresolved paths, globs, or recursive workspace-root deletion.

**Acceptance emphasis:** fixtures prove unknown files stop cleanup, protected artifacts survive, plan drift aborts, interrupted apply resumes, and audit reconstruction remains possible.

**Out of scope:** certification retention GC, which belongs to CERT-003.

## Release and migration checkpoints

| Checkpoint | Minimum completed RFCs | Observable outcome |
|---|---|---|
| Foundation usable | 001–004 | candidate/dossier/profile can be verified and a synthetic gate can be certified |
| Site quality usable | 005–006 | real site candidate receives deterministic and independent qualitative decisions |
| Publication authoritative | 007 | canonical deploy path cannot cross a channel without certification |
| Ongoing truth authoritative | 008 | Main exposes immutable decision plus current health |
| New system proven | 009 | the sole site is republished and certified end-to-end |
| Old estate reduced | 010 | allowed heavy legacy data removed with retained audit history |

No checkpoint may advertise production readiness while a required predecessor is implemented only behind a grace mode.

## Cross-cutting documentation updates

Implementation RFCs must allocate ownership rather than duplicating policy:

- Compass requirements describe fail-closed release quality, certification evidence, and current health;
- technology/architecture Compass describe engine/plugin and storage boundaries;
- verification Compass maps every gate and failure mode to executable evidence;
- `docs/authoring/site-composition.md` tells author agents how to respond to action packs;
- deployment/publication runbooks describe gate behavior, Main verification, rollback, and incidents;
- generated command/ecosystem manifests are regenerated from registries;
- architecture DNA records only durable cross-feature invariants, not command-specific details;
- active AGENTS rules point agents to canonical commands and forbid bypasses only after those commands exist.

## Completion definition for the program

The program is complete only when all ten RFCs are implemented and verified, the sole site has a new certified Main candidate with current health, canonical deploy paths have no bypass, legacy heavy data cleanup has an accepted report, and all normative/generated documentation agrees with the executable system.
