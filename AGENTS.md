# `@warpgogol/werkstatt` — Agent Guide

RFC-0769/0772: Werkstatt engine — stack-agnostic lifecycle platform. Consolidated from `packages/os/site-kernel`, `packages/os/site-kernel-handoff`, `packages/os/site-kernel-integrity`, `packages/os/site-kernel-observability`, `packages/os/site-kernel-changelog`, `packages/fingerprint`, `packages/agent-gate`, and `packages/ontology/operations` into a single engine package.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## Entry points

| Entry point | Module |
| --- | --- |
| `@warpgogol/werkstatt` | `./src/index.ts` |
| `@warpgogol/werkstatt/plugin` | `./src/plugin-contract.ts` |
| `@warpgogol/werkstatt/plugin/invoke-hook` | `./src/plugin/invoke-hook.ts` |
| `@warpgogol/werkstatt/os/werkstatt-plugin-module` | `./os/werkstatt-plugin.module.ts` |
| `@warpgogol/werkstatt/os/werkstatt-autonomy-module` | `./os/werkstatt-autonomy.module.ts` |
| `@warpgogol/werkstatt/kernel` | `./src/kernel/index.ts` |
| `@warpgogol/werkstatt/kernel/*` | `./src/kernel/*` (all kernel subpath exports) |
| `@warpgogol/werkstatt/mission` | `./src/mission/index.ts` |
| `@warpgogol/werkstatt/sternsystem` | `./src/sternsystem/index.ts` |
| `@warpgogol/werkstatt/release` | `./src/release/index.ts` |
| `@warpgogol/werkstatt/leitstand` | `./src/leitstand/index.ts` |
| `@warpgogol/werkstatt/bordbuch` | `./src/bordbuch/index.ts` |
| `@warpgogol/werkstatt/notausgang` | `./src/notausgang/index.ts` |
| `@warpgogol/werkstatt/artifact-store` | `./src/artifact-store/index.ts` |
| `@warpgogol/werkstatt/evidence` | `./src/evidence/index.ts` |
| `@warpgogol/werkstatt/integrity` | `./src/integrity/index.ts` |
| `@warpgogol/werkstatt/observability` | `./src/observability/index.ts` |
| `@warpgogol/werkstatt/fingerprint` | `./src/fingerprint/index.ts` |
| `@warpgogol/werkstatt/fingerprint/semantic` | `./src/fingerprint/semantic.ts` |
| `@warpgogol/werkstatt/agent-gate` | `./src/agent-gate/index.ts` |
| `@warpgogol/werkstatt/changelog` | `./src/changelog/index.ts` |
| `@warpgogol/werkstatt/schemas` | `./src/schemas/index.ts` |
| `@warpgogol/werkstatt/component` | `./src/component/index.ts` |
| `@warpgogol/werkstatt/handoff` | `./src/handoff/index.ts` |
| `@warpgogol/werkstatt/workshop` | `./src/workshop/index.ts` |
| `@warpgogol/werkstatt/workshop-module` | `./src/workshop/workshop.module.ts` |
| `@warpgogol/werkstatt/*-module` | `./src/*/*.module.ts` (all module entry points) |

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Package architecture

- This package owns the Werkstatt engine: kernel runtime, missions, mirrors (Sternsystem), releases, Leitstand, Bordbuch, Notausgang, artifact store, evidence, deploy orchestration, werkstatt consistency primitives, fingerprint, integrity, observability, agent-gate, changelog, operations schemas, and workshop scaffolding (RFC-0779).
- The package is stack-agnostic (DNA-64). It MUST NOT import stack plugins.
- The plugin contract (`werkstatt/plugin@1`) and registry in `src/plugin-contract.ts` and `src/plugin-registry.ts` are current pre-cutover code facts. RFC-0855 supersedes their architectural authority; packet 230 removes them after component-runtime and certification evidence agree.
- The `werkstatt.autonomy.validate` command (DNA-64 enforcement) scans `src/**` for forbidden `@warpgogol/*` imports.
- RFC-0776 completed the migration: old packages (`packages/os/site-kernel*`, `packages/fingerprint`, `packages/agent-gate`) are deleted. All imports now go through `@warpgogol/werkstatt` subpath exports.

### Canonical JSON identity bytes (RFC-0849)

- `snapshotCanonicalJsonObjectV1` is the only creator of runtime-branded `CanonicalJsonObjectV1`. The snapshot takes an object-root input only — root scalars, arrays, and all forbidden descriptors/values return bounded typed failures without logging or partial output.
- The canonical encoder follows strict RFC 8785 JCS (JSON Canonicalization Scheme): no insignificant whitespace, lexicographic key ordering by UTF-16 code unit, mandatory escaping, shortest number representation. The Werkstatt profile additionally rejects negative zero, unsafe integers, lone surrogates, bigint, undefined, functions, symbols, host objects (Date, Map, Set, RegExp, Error, typed arrays), toJSON customization, non-enumerable properties, accessors, symbol keys, sparse array holes, array extra own keys, cycles, and aliases.
- `canonicalJsonBytesV1` and `canonicalJsonHashV1` operate on the opaque branded snapshot only. Forged casts, structural lookalikes, and Proxy wrappers fail with `CERT-CANONICAL-BRAND-01`. The canonical source imports `byteHash` from `primitives.ts` but never `stableJsonHash` or `node:crypto`.
- Hard limits: 8 MiB output bytes, 64 depth, 250k nodes, 10k object keys, 100k array items, 1 MiB string bytes, 1 KiB key bytes. All limits report `actual = maximum + 1` in `CERT-CANONICAL-LIMIT-01` failures.
- Failure paths use only array indices and object sorted ordinals — never raw keys. Path segments are capped at 64; overflow increments `omittedPathSegments`.
- `Sha256Digest` is an opaque branded type (`sha256:` + 64 lowercase hex). `isSha256Digest` is the exact guard. `byteHash` and `byteHashFile` return `Sha256Digest`; existing string consumers remain compatible.

### Canonical Diagnostic schema (RFC-0852)

- `packages/werkstatt/src/schemas/diagnostic.ts` is the **sole owner** of `DiagnosticSeverity`, `DiagnosticEvidence`, and `Diagnostic` strict Zod schemas and inferred types. `kernel/types.ts` re-exports these types (type-only); no duplicate interface, severity union, or schema implementation may exist elsewhere.
- The site plugin (`@warpgogol/werkstatt-site`) imports diagnostic schemas from `@warpgogol/werkstatt/schemas`. Legacy aliases (`auditSeveritySchema`, `auditEvidenceSchema`, `auditFindingSchema`, `AuditFinding`) and deprecated fields (`id`, `blockId`, `suggestion`) are removed; no compatibility alias or parser may be reintroduced.
- `data` accepts only runtime-branded `CanonicalJsonObjectV1` (RFC-0849) validated via `z.custom` + `isCanonicalJsonObjectV1`; arbitrary objects and every RFC-0849-invalid value fail before persistence.
- Field/collection limits: `ruleId` 128 chars `[A-Z0-9][A-Z0-9._-]*`, `message` 4 KiB, `fixHint` 8 KiB, `file`/`ruleFile` 1 KiB, `url` 4 KiB, `snippet` 16 KiB, 32 evidence items, 64 KiB canonical `data` bytes, 128 KiB per Diagnostic, 1000 diagnostics per persisted result.
- Safe locator rules: `file`/`ruleFile` use workspace-relative POSIX paths (reject absolute, backslashes, `..`, empty, URI schemes, home expansion, credentials). URLs must be absolute `http:`/`https:` with no userinfo or credential-bearing query values.
- Redaction: diagnostic strings and canonical `data` must be redacted before construction. Known secret patterns (API keys, JWTs, private keys, bearer tokens, connection strings, AWS creds), absolute paths, and PII (email, phone) are hard failures (`CERT-DIAGNOSTIC-REDACTION-01`).

### Certification foundation integration (RFC-0848)

- The integration suite at `packages/werkstatt/src/tests/certification-foundation.integration.test.ts` proves ten `CERT-INTEGRATION-*` laws using public child APIs only (RFC-0849, 0850, 0851, 0852, 0853).
- No child logic is reimplemented in the integration suite; failures route to the owning child RFC for correction.
- The suite verifies: canonical JSON snapshotting of diagnostic/certification values, identity digest determinism, immutable evaluation cut, permutation invariance, dossier root sensitivity, fail > stale > incomplete > pass precedence, deployment/artifact separation, legacy state rejection, transition block fail-closed, and engine/plugin Diagnostic ownership boundary.
- `@warpgogol/werkstatt` imports no stack plugin; the site plugin defines no duplicate Diagnostic/certification authority.

### Resolved certification profile (CERT-002, packet 140)

- `packages/werkstatt/src/certification/profile/` owns `CertificationProfileV1` strict Zod schemas, producer declarations, requirements, applicability rules, reuse/freshness, execution, remediation, retention, and evaluator policy.
- `hashCertificationProfileV1` computes canonical hash via RFC-0849 fingerprint authority (`snapshotCanonicalJsonObjectV1` + `canonicalJsonHashV1`). The hash is key-order invariant and sensitive to every semantic field change.
- `validateCertificationProfileV1` validates: plugin/profile binding against active plugin and `forge.yaml`, duplicate requirement/producer IDs, producer registration and command existence, nine-dimension Main gate coverage, continuous-health freshness TTL/schedule, rollback drift-action eligibility, and evaluator policy consistency.
- No producer execution, deployment decisions, I/O, clock, env, or plugin imports exist in this module.

### Authority and durable storage (CERT-003, packet 150)

- `packages/werkstatt/src/certification/authority/` owns the issuer registry with idempotent add, conflicting-key rejection (`CERT-AUTHORITY-01`), attestation verification (`CERT-AUTHORITY-02`/`CERT-AUTHORITY-03`), and signed decision/root verification against registered issuers.
- `packages/werkstatt/src/certification/storage/` owns the content-addressed dossier repository with append-only event chain, `previousEventHash` chain validation (`CERT-DOSSIER-01`/`CERT-DOSSIER-02`), root hash recomputation via RFC-0849, chain-break detection (`CERT-DOSSIER-04`), and root reference building.
- The storage adapter interface is provider-neutral: `putObject`, `headObject`, `getObject`, `appendAuditRecord`. An in-memory adapter is provided for testing. `verifyStoredObject` checks existence and size (`CERT-STORAGE-01`/`CERT-STORAGE-02`).
- Retention GC checks protected references (`current`, `rollback-target`, `open-incident`, `audit-hold`), age thresholds (certified vs unsuccessful), and creates tombstones before deletion. Durable replica verification rejects root hash mismatch (`CERT-STORAGE-03`).
- No R2 adapter, producer orchestration, deployment commands, or I/O imports exist in this module.

### Certification orchestration and command surface (CERT-004, packet 160)

- `packages/werkstatt/src/certification/orchestration/` owns producer dependency planning via topological sort with cycle detection (`CERT-ORCHESTRATOR-01` duplicate IDs, `CERT-ORCHESTRATOR-02` unknown deps/cycles), gate lock manager with per-release+gate mutual exclusion and idempotent re-acquire (`CERT-ORCHESTRATOR-03` concurrent rejection), producer execution with bounded parallelism (semaphore), timeout, retry with backoff, progress events (`CERT-ORCHESTRATOR-04` execution failure), and resume point computation from partial evidence (`CERT-ORCHESTRATOR-07` all-complete rejection).
- `packages/werkstatt/src/certification/commands/` owns read-only `getCertificationStatus` (candidate identity, latest decisions, coverage, durable replica status, next required action, action-pack locators) and `verifyCertification` (candidate ID recompute, dossier integrity, root hash match, decision references). `CERT-ORCHESTRATOR-08`/`CERT-ORCHESTRATOR-09`/`CERT-ORCHESTRATOR-10` cover identity and integrity failures.
- No producer implementations, deployment commands, or I/O imports exist in this module.

### Deterministic site producers and false-pass removal (CERT-005, packet 170)

- `packages/werkstatt/src/certification/producers/` owns the deterministic producer framework — typed producer registry with duplicate rejection (`CERT-PRODUCER-01`), profile validation (`CERT-PRODUCER-03` missing, `CERT-PRODUCER-04` extra), applicability evaluation (always/entitlement/config/surface rules), false-pass guard rejecting empty-result success (`CERT-PRODUCER-05`), summary-only warning success for mandatory requirements (`CERT-PRODUCER-06`), and grace-period success (`CERT-PRODUCER-07`).
- Diagnostic normalization deduplicates by `ruleId:file:line` and rejects missing `ruleId` or `message` (`CERT-PRODUCER-08`). Route/state/viewport matrix planning generates full combination sets for coverage.
- Producer execution constructs evidence envelopes from handler results, rejecting unregistered producers (`CERT-PRODUCER-09`), handler crashes (`CERT-PRODUCER-10`), and false-pass results (`CERT-PRODUCER-11`).
- No site-specific producer implementations, deployment commands, or I/O imports exist in this module.

### Independent evaluator agents and qualitative consensus (CERT-006, packet 180)

- `packages/werkstatt/src/certification/evaluators/` owns the independent evaluator framework — evaluator registry with duplicate rejection (`CERT-EVAL-01`), risk routing (ordinary/critical/borderline with dimension-matched rules, 1 evaluator for ordinary, 2 for critical/borderline), evaluator isolation rejecting self-review (`CERT-EVAL-02`) and duplicate identities (`CERT-EVAL-03`).
- Consensus aggregation maps pass/pass → pass, fail/fail → fail, disagreement/missing → incomplete (`CERT-EVAL-05`). Payload validation rejects bundle hash mismatch (`CERT-EVAL-07`), rubric mismatch (`CERT-EVAL-08`), out-of-range confidence (`CERT-EVAL-09`), unknown criteria and empty rationale (`CERT-EVAL-10`).
- Evaluator execution checks isolation (`CERT-EVAL-11`), registration (`CERT-EVAL-12`), handler crashes and invalid payloads (`CERT-EVAL-13`). Coverage manifest builds from routes/states/viewports and deterministic evidence.
- No evaluator-led mutation, human approval, or I/O imports exist in this module.

### Capability artifacts and sandbox (RFC-0863, packet 190)

- `packages/werkstatt/src/capability-artifacts/` owns the immutable content-addressed artifact store — publication with size/media-type policy (`CERT-ARTIFACT-01`/`CERT-ARTIFACT-02`), immutability (`CERT-ARTIFACT-03`), hash verification (`CERT-ARTIFACT-04`/`CERT-ARTIFACT-05`), and provider admission store (`CERT-ARTIFACT-06` non-pass, `CERT-ARTIFACT-07` stale conformance).
- `packages/werkstatt/src/isolation/broker/` owns the deny-by-default capability bridge — ambient host access rejection (`CERT-BROKER-01` fs/net/process/env/credential/descriptor/ipc/host-object), duplicate capability rejection (`CERT-BROKER-02`), policy/grant enforcement, request/response size limits, concurrency limits, and redacted audit entries.
- `packages/werkstatt/src/isolation/providers/` owns concrete sandbox adapter implementations with all 12 required `IsolationPropertyEvidenceV1` properties. The fake sandbox adapter is for testing only.
- No evolution controller, canary promotion, production agent capability, or provider-specific manifest field is introduced.

### Governed capability evolution controller (RFC-0864, packet 200)

- `packages/werkstatt/src/evolution/contracts.ts` owns candidates, stages, five-layer evidence bundles (definition, evaluation, observation, authority, artifact), transition records, and compensating actions. All are immutable, content-addressed, and lineage-bound.
- `packages/werkstatt/src/evolution/reducer.ts` owns the monotonic transition reducer — forward-only sequence `defined → tested → shadowed → canary → promoted` with rollback and quarantine as compensating transitions. Enforces idempotency keys, sequence numbers, kill switch (`CERT-EVO-01`), and evidence requirements per stage.
- `packages/werkstatt/src/evolution/guards.ts` owns Law Kernel, evidence, boundary, and kill-switch checks — self-change boundary for forbidden scopes (`CERT-EVO-GUARD-01`), evidence immutability (`CERT-EVO-GUARD-02`/`03`), authority expiry (`CERT-EVO-GUARD-05`), shadow side effects (`CERT-EVO-GUARD-06`), canary boundaries (`CERT-EVO-GUARD-07`/`08`/`09`), and evidence poisoning (`CERT-EVO-GUARD-10`/`11`).
- `packages/werkstatt/src/evolution/controller.ts` owns inspect/define/evaluate/observe orchestration. The controller cannot change Law Kernel, permissions, effect/isolation contracts, canonical identities/diagnostics, controller code, or evaluator policy.

### RFC-0855 implementation discipline

- Implement component/runtime/certification work only from the currently sealed packet in `docs/plans/agent-runtime-certification/`; an RFC status alone is insufficient.
- The engine owns the Law Kernel, component graph, lifecycle fibers, effects, resolved-set identity, isolation admission, certification authority, and evolution reducer. Stack-profile packages provide capabilities through contracts and must never be imported into the engine.
- Do not add adapters for `werkstatt/plugin@1`, force unload, ambient authority, local certification fallback, mutable capability artifacts, or ungoverned production activation.
- An intentionally broken intermediate repository is permitted by RFC-0855. Never widen the packet or restore retired authority merely to recover a green build.

### Component and capability contracts (RFC-0858)

- `packages/werkstatt/src/component/` owns strict versioned contracts for immutable component artifacts, namespaced capability provides/requires, attenuated grants, closed effect declarations, isolation requirements, lifecycle-owned resources, and canonical resolved-component-set identity.
- `contracts.ts` exports TypeScript interfaces; `schemas.ts` exports Zod runtime schemas with `.strict()` validation; `identity.ts` computes canonical hashes via the existing fingerprint authority (`snapshotCanonicalJsonObjectV1` + `canonicalJsonHashV1`); `index.ts` provides narrow public exports.
- Unknown fields, invalid identities, duplicate provides, Law Kernel reserved grant scopes (`certify`, `administer`), resource owner mismatches, and unknown effect/isolation/grant/resource types fail with `COMPONENT-CONTRACT-01` through `COMPONENT-CONTRACT-07`.
- `computeSetHash` is input-order invariant and sensitive to every semantic field change. `verifySetHashStrict` detects set-hash mismatch (`COMPONENT-CONTRACT-07`).
- No registry, loader, sandbox, plugin adapter, or activation behavior exists in this module. Later packets implement lifecycle and resolution against these types.

### Lifecycle fiber and effect runtime (RFC-0859)

- `packages/werkstatt/src/component-runtime/` owns the structured-concurrency runtime: lifecycle state machine, component fibers, effect handlers, and activation transaction.
- `lifecycle.ts` exports a closed state machine (`declared → waiting → loading → active → draining → unloading → disposed` plus `failed`/`quarantined`). Invalid transitions are rejected with `LIFECYCLE-01`/`LIFECYCLE-02`.
- `effects.ts` exports four effect handlers: `RevertibleEffectHandler` (disposer required), `TransactionalEffectHandler` (prepare/commit/abort with idempotency), `CompensatableEffectHandler` (compensation with equivalence evidence), `IrreversibleEmissionEffectHandler` (withheld until commit). Failed rollback quarantines.
- `fiber.ts` exports `ComponentFiber` — structured ownership of child operations/resources, bounded drain with deadline, LIFO effect unwind, cancellation propagation at declared boundaries.
- `activation.ts` exports `ActivationTransaction` — bounded set transition with prepare/commit/abort, prior-set drain in reverse dependency order, quarantine on incomplete rollback.
- No resolver, sandbox, certification, or production activation occurs. Packet 070 supplies resolution; packet 230 performs production cutover.

### Deterministic component resolution and reconciliation (RFC-0860)

- `packages/werkstatt/src/component-runtime/resolver.ts` owns pure deterministic dependency resolution: validates manifests, checks artifact availability, verifies admitted grants, matches required capabilities by namespace/compatibility/schema identity, rejects zero/multiple providers, detects cycles, topologically sorts with canonical component-ID tie-breaking, computes graph/set identities through RFC-0858.
- `packages/werkstatt/src/component-runtime/reconciliation.ts` owns pure desired-state diff and transaction orchestration: computes stop/drain/unload/load/activate plans, detects no-op (unchanged setHash), drives RFC-0859 activation transaction.
- `packages/werkstatt/src/component-runtime/resolution-proof.ts` exports bounded proof/diagnostics types: `ResolutionProofV1`, `ResolutionViolationV1` with codes `RESOLUTION-01` through `RESOLUTION-08`.
- Resolution is deterministic under input permutation. Missing, incompatible, ambiguous, cyclic, unadmitted, or artifact-mismatched graphs are blocked before lifecycle mutation.
- No package/network discovery, fallback providers, cycle tolerance, or plugin adapters. Production activation remains absent until packet 230.

### Runtime reflection and conformance harness (RFC-0861)

- `packages/werkstatt/src/component-runtime/reflection.ts` owns the read-only, policy-filtered live capability catalog: `CapabilityCatalogV1`, `CapabilityCatalogEntryV1`, `createCapabilityCatalog`, `assertNoForbiddenFields`. Catalog entries are canonically ordered, exact-set-bound, caller-filtered, and omit secrets, raw grants, private state, credentials, prompts, executable bytes, and authority material.
- `packages/werkstatt/src/component-runtime/conformance.ts` owns scenario/result contracts: `ConformanceScenarioV1`, `ConformanceEventV1`, `ConformanceExpectationV1`, `ConformanceResultV1`, `ConformanceTraceEntryV1`, `ConformanceMismatchV1`, `ConformanceCleanupReportV1`. Results are always marked `testOnly: true` and contain no admission/promotion decision.
- `packages/werkstatt/src/component-runtime/testing/harness.ts` owns the test-only conformance harness: `runConformanceScenario`, `buildCatalog`, `TrustedFixture`. Guards reject non-test mode (`CONFORMANCE-01`), untrusted fixtures (`CONFORMANCE-02`), unpinned artifacts (`CONFORMANCE-03`), and hash mismatches (`CONFORMANCE-04`). Fixtures are embedded, hash-pinned, and trusted — no network/package discovery.
- Subpath exports: `@warpgogol/werkstatt/component-runtime/reflection`, `@warpgogol/werkstatt/component-runtime/conformance`, `@warpgogol/werkstatt/component-runtime/testing`.
- No production define/install/run/activate/promote command or authority decision is exported. Reflection and conformance results are projections/evidence, not authority.

### Provider-neutral isolation contract (RFC-0862)

- `packages/werkstatt/src/isolation/contracts.ts` owns neutral adapter/workload/bridge contracts: `IsolationAdapterV1`, `SandboxedWorkloadCreateV1`, `SandboxedWorkloadV1`, `CapabilityBridgeRequestV1`, `CapabilityBridgeResponseV1`, `TerminationReportV1`, `AttenuatedGrantSetV1`, `WorkloadLimitsV1`, `IsolationPropertyEvidenceV1`, `IsolationConformanceResultV1`. Workloads receive no ambient filesystem, network, process, environment, clock, randomness, credential, IPC, or host-object access.
- `packages/werkstatt/src/isolation/schemas.ts` owns strict Zod schemas with `.strict()` validation for all isolation messages, grants, limits, and evidence. Unknown fields, invalid grants, replay, confused identity, and all bound violations are rejected. `validateIsolationAdapter` and `validateBridgeRequest` are the public validators.
- `packages/werkstatt/src/isolation/conformance.ts` owns the provider-neutral adversarial conformance suite: `runIsolationConformance`, `createConformanceResult`. Covers filesystem/network/process/env/credential/descriptor escape, resource exhaustion, workload separation, teardown, crash, bridge confusion/replay. `node:vm`, `worker_threads`, and ordinary subprocesses fail the security-tier contract by definition. Missing property evidence returns `incomplete`, never `pass`.
- Subpath exports: `@warpgogol/werkstatt/isolation/contracts`, `@warpgogol/werkstatt/isolation/schemas`, `@warpgogol/werkstatt/isolation/conformance`.
- No concrete provider dependency, credential, artifact store, network endpoint, or production loader is added. Packet 190 selects and implements the first real provider.

### Certification contracts and identity builders (RFC-0853)

- `packages/werkstatt/src/certification/contracts/` owns strict Zod schemas and inferred types for all CERT-001 certification objects: identifiers, release candidates, policy bundles, evidence envelopes, dossier events, gate/main/health decisions, action packs, authority artifacts, and deployment operation state/events. All schemas use `.strict()` validation — unknown fields fail without coercion.
- `packages/werkstatt/src/certification/identity.ts` owns explicit identity builders for each certification object. Each builder constructs a fresh payload object field-by-field, snapshots through RFC-0849 `snapshotCanonicalJsonObjectV1`, and hashes through `canonicalJsonHashV1`. No clone/delete, generic hash, object spread from source, or parallel interface exists.
- Identity payloads include only semantic fields — excluded fields (candidate IDs, evidence IDs, event IDs, timestamps, locators, observed environments) do not affect identity digests. Included field changes (source hashes, content hashes, policy bundle roots, binding hashes, statuses, event kinds, task lists) always produce different digests.
- Evidence identity enforces redaction closure: unresolved redaction reports fail with `CERT-REDACTION-01` before identity construction.
- Subpath export: `@warpgogol/werkstatt/certification`.
- No evaluation algorithms, state cutover, storage, commands, producers, adapters, authority execution, or deployment logic exists. Later packets implement those concerns.

### Deterministic certification evaluation and remediation (RFC-0850)

- `packages/werkstatt/src/certification/evidence-selection.ts` owns a single-pass bounded evidence index (`buildEvidenceIndex`) and authority-sequence selection (`selectRequirementEvidence`). The index is built once per decision in O(E) time, keyed by requirement ID. Selection chooses the eligible record with greatest authority `admissionSequence` at or below the immutable `evaluationCutSequence`. Producer timestamps, filenames, mtimes, lexical IDs, and input array order never establish precedence.
- `packages/werkstatt/src/certification/aggregation.ts` owns deterministic certification aggregation (`evaluateCertificationDecision`). Resolves required/conditional/advisory requirements, selects at one immutable cut, preserves per-requirement `pass | fail | stale | incomplete | not-applicable`, applies top-level precedence `fail > stale > incomplete > pass`, records selected evidence IDs, coverage counts, and reason codes. Never infers pass from zero requirements, zero diagnostics, process exit 0, old evidence, producer crash, timeout, infrastructure unavailability, or unknown values.
- `packages/werkstatt/src/certification/action-pack.ts` owns deterministic anchored action-pack construction (`buildCertificationActionPack`). Creates one canonical task per actionable non-pass requirement, classifies `product-fix | infrastructure-retry | policy-defect`, validates anchors and verification commands, detects dependency cycles, and returns stable topological order with lexical tie-breaker. Missing anchors, vague tasks, missing verification commands, cycles, or >1000 tasks fail with `CERT-ACTION-01` or `CERT-LIMIT-03`.
- `packages/werkstatt/src/certification/dossier-hash.ts` owns pure event/root hashing (`computeDossierEventHash`, `computeDossierRoot`). Event hashing uses RFC-0853 `buildDossierEventIdentityV1`. Root hashing binds exact order — reordering, insertion, removal, or prior-hash changes alter the root; storage location and projection timestamps do not.
- Hard limits: 1,000 requirements (`CERT-LIMIT-01`), 10,000 evidence records (`CERT-LIMIT-02`), 1,000 action tasks (`CERT-LIMIT-03`). All overflow returns explicit non-pass failures without truncation.
- Complexity: indexing/selection/aggregation in O(E + R log R) time and O(E + R) memory. No per-requirement full evidence scan. Action-pack ordering in O(T + D + T log T).
- No function reads/writes `releases/**`, `missions/**`, `systems-cache/**`, object storage, URLs, clocks, environment variables, or provider APIs. All modules are pure and independently testable.

## Mission git helpers

- `commitWorkpieceIfDirty(workpieceDir, missionId)` (RFC-0644): auto-commits all dirty files in the workpiece via `git add -A` + `git commit --no-verify`. Returns `{ committed: boolean, commitSha: string | null }`. Used by `mission.reconcile` and `mission.close` (RFC-0797) to auto-commit dirty workpieces instead of throwing.
- `commitCacheCloneIfDirty(systemDir, systemId)` (RFC-0797): auto-commits all dirty files in the cache clone via `git add -A` + `git commit --no-verify`. Returns `{ committed: boolean, commitSha: string | null }`. Used by `mission.reconcile` (before the dirty guard) and `mission.validate` (post-validate cleanup) to auto-commit generated files instead of leaving the cache clone dirty.

## Env file persistence (RFC-0822)

- `persistEnvFilesToCacheClone(workpieceDir, cacheCloneDir)` (RFC-0822): copies `.env*` files from workpiece to cache clone (untracked). Excludes `.env.example` and `.env.*.example`. Used by `mission.close` as a final step. Non-fatal on failure.
- `restoreEnvFilesFromCacheClone(cacheCloneDir, workpieceDir)` (RFC-0822): restores `.env*` files from cache clone to workpiece after `atomicMoveDir`. Replaces `PUBLIC_IMAGE_PROVIDER` with `build-portable`. Used by `mission.materialize`. Non-fatal on failure.
- `sternsystem.validate` emits `ENV-PERSIST-01` warning when cache clone lacks `.env*` but active workpiece has them.

## Operator config file persistence (RFC-0840)

- `OPERATOR_CONFIG_FILES` constant in `operator-config-files.ts` declares the canonical list of operator config files to persist: `[".lighthouse-budget-ignore", "src/image-delivery.config.yaml"]`. Entries are path-based (not just filenames) to support files in subdirectories. Adding a new file requires a superseding RFC.
- `persistOperatorConfigFiles(workpieceDir, cacheCloneDir)` (RFC-0840): copies each file in `OPERATOR_CONFIG_FILES` from workpiece to cache clone (untracked). Uses `path.join` with subpath entries. Non-fatal on failure. Used by `mission.close` after `persistEnvFilesToCacheClone`.
- `restoreOperatorConfigFiles(cacheCloneDir, workpieceDir)` (RFC-0840): restores each file from cache clone to workpiece after `atomicMoveDir`. Creates parent directories with `mkdir { recursive: true }`. Does NOT modify file contents. Non-fatal on failure. Used by `mission.materialize` after `restoreEnvFilesFromCacheClone`.
- `materialize.config.validate` (RFC-0840): workspace-scope check command in `PACKAGES_CHECK_PIPELINE`. Emits MAT-CONFIG-01 (warning: unrecognized operator file in workpiece root or `src/`) and MAT-CONFIG-02 (error: dead entry in `OPERATOR_CONFIG_FILES` not found in any workpiece or cache clone).
- `workpiece.config.presence.check` (RFC-0844): pre-build gate in `mission.validate` that verifies all `OPERATOR_CONFIG_FILES` entries are present in the active workpiece before the build pipeline starts. Runs before the Playwright Chromium pre-flight (RFC-0813). Returns `status: "fail"` with restore commands for each missing file. Non-fatal if the check command itself throws. Skipped on distribution-reuse path.

## Autonomy guard

The `werkstatt.autonomy.validate` command enforces DNA-64. It scans `packages/werkstatt/src/**` for `@warpgogol/*` import specifiers. Exemptions:

- `@warpgogol/werkstatt` (self-imports)
- `@warpgogol/werkstatt-site/ontology`, `@warpgogol/werkstatt-site/share` (shared schema subpaths)
- `@warpgogol/forge` (governance)
- `@warpgogol/werkstatt-site/passport`, `@warpgogol/werkstatt-site/observability`, `@warpgogol/werkstatt-site/integration`, `@warpgogol/werkstatt-site/surface` (shared infrastructure subpaths)

Excludes: `node_modules/`, `tests/`, `tests-handoff/`, `*.test.ts`, `*.spec.ts`.

## Pre-dev critical file check in mission.preview

`mission.preview` must verify that dev-critical generated files exist before starting the dev server. The check uses `existsSync` (instant, no pipeline overhead) and auto-generates missing files via `executeKernelCommand`. If generation fails, the server launch is blocked with an actionable error message explaining what is missing, why it matters, and how to fix it. The `--skip-prepare` flag bypasses the check for fast restarts when files are known to exist.

RFC-0817: `mission.preview` also enforces a materialization gate before the dev-critical file check. If `materializedAt` is null and mission state is `open`, `mission.materialize` is auto-run. This gate is NOT bypassed by `--skip-prepare` — materialization is the formal lifecycle gate, not a convenience check. Non-open missions (closed, aborted) skip the materialization check.

Dev-critical files: `src/content-ref-index.generated.yaml`, `src/derived-prices.generated.json`, `src/video-manifest.generated.yaml`. Some generators have prerequisites (e.g. `derived-prices.materialize` requires `entitlements.resolve`, `rate-snapshot.resolve`, `currency-pricing.compile`) — the check runs prerequisites before the owning command.

## Cache-clone commit guard (RFC-0821)

`installBordbuchPreCommitHook` (RFC-0658) installs a **combined pre-commit hook** in cache clones that includes both the bordbuch integrity guard and a **commit guard** that blocks direct `git commit` unless the `MISSION_GIT_COMMIT=1` environment variable is set. `mission.git.commit` sets this variable; raw `git commit` does not.

This is the only **hard guard** preventing agents from directly committing to Sternsystem cache clones. AGENTS.md rules are soft guards — they rely on agent compliance. The pre-commit hook is enforced by git itself and cannot be bypassed without `--no-verify` (which AGENTS.md already restricts to last-resort use on closed missions).

Agents MUST NOT use `git commit --no-verify` in cache clones to bypass this guard. If a file needs to be committed to a cache clone, use `mission.git.commit` or open a mission and work through the workpiece.
