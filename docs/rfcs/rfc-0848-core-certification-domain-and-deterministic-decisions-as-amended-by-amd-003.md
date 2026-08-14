---
id: RFC-0848
title: "Establish the core certification domain and deterministic decisions"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - DNA-51
  - DNA-52
  - DNA-73
  - RFC-0203
  - RFC-0357
  - RFC-0608
  - RFC-0628
  - RFC-0724
  - RFC-0842
satisfies:
  - DNA-53
  - DNA-64
specRef: "werkstatt-release-certification/CERT-001"
versionBump: major
liveSpec: release-certification
commands:
  proposed: []
  added: []
  changed:
    - release.validate
    - release.rollback
    - release.state.validate
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - leitstand.status
    - leitstand.rollback
    - leitstand.health
    - leitstand.pipeline.check
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Every persisted or transmitted certification object has one strict engine-owned runtime schema, one inferred TypeScript type, and a versioned canonical identity function."
  - "Gate aggregation reproduces the same decision and action pack for every permutation of equivalent admitted evidence, while preserving fail, stale, and incomplete as distinct outcomes."
  - "Release artifact state, deployment-operation state, immutable certification decisions, and current health are separate contracts; no legacy deployment label remains in the release schema."
  - "The site plugin consumes the engine-owned Diagnostic runtime schema without the Werkstatt engine importing any stack plugin."
  - "Legacy readiness evidence is never read or translated into a new certification object, and legacy deployment commands fail closed until CERT-007 replaces the blocked path."
nonGoals:
  - "This RFC does not implement the plugin-owned certification profile or producer registry; that is CERT-002."
  - "This RFC does not persist dossiers, append events, upload objects, rotate keys, or implement a Certification Authority runtime; that is CERT-003."
  - "This RFC does not add release.certify or any certification inspection command; that is CERT-004."
  - "This RFC does not implement site validators, evaluator agents, deployment orchestration, continuous monitoring, cutover, or cleanup."
  - "This RFC does not import, migrate, validate, or preserve authority for any legacy quality report, Axiom capsule, test-evidence file, Nebula score, or release deployment state."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/certification/index.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/schemas/diagnostic.ts"
---

# RFC-0848: Establish the core certification domain and deterministic decisions

## Context

The accepted `werkstatt-release-certification` specification makes one immutable release candidate and its append-only dossier the subject of deployment certification. CERT-001 is the foundation node: later profile, storage, orchestration, evaluator, deployment, health, cutover, and cleanup RFCs depend on its public contracts and pure decision functions.

The current engine has useful but incompatible pieces:

- `packages/werkstatt/src/schemas/release.ts` models release deployment as one enum containing `prepared`, `published`, `alt-deployed`, `promoted`, and `rolled-back`;
- `release.ready` writes the undeclared value `ready`, while release and Leitstand handlers also compare or write other state spellings;
- DNA-48/DNA-49 and DNA-73 describe incompatible release/deployment chains;
- `packages/werkstatt/src/kernel/types.ts` owns the TypeScript `Diagnostic` interface, but the only strict runtime schema is implemented inside `@warpgogol/werkstatt-site`;
- `stableJsonHash` is a useful general primitive but accepts values that are ambiguous or invalid for an authoritative identity contract;
- no engine-owned type distinguishes a product failure from missing or stale evidence, freezes the evaluated dossier cut, or represents signed authority decisions.

The specification and accepted amendments resolve the product decisions. This RFC maps them onto the existing repository without copying their model definitions. Normative model sources are:

- `werkstatt-release-certification/contracts.md` for base schemas, status vocabulary, identity rules, aggregation, and state-independent storage contracts;
- `werkstatt-release-certification/ADR-001` through `werkstatt-release-certification/ADR-006`, ADR-011, ADR-012, ADR-018, and ADR-020;
- `werkstatt-release-certification/amendments/amd-001-explicit-main-verification-decision.md`;
- `werkstatt-release-certification/amendments/amd-003-environment-identity-binding.md`;
- `werkstatt-release-certification/amendments/amd-004-certification-authority-boundary.md`;
- `werkstatt-release-certification/amendments/amd-005-immutable-policy-bundle.md`;
- `werkstatt-release-certification/amendments/amd-006-authority-ordered-evidence.md`;
- `werkstatt-release-certification/verification.md#core-invariants-and-required-properties`.

The operator has explicitly chosen a forward-only cutover. The repository may remain operationally unavailable between program nodes. That permission does not allow untyped or untested foundation code: CERT-001 must leave its own packages compiling and its pure contracts fully verified, while old deployment entrypoints fail closed until CERT-007 implements their new behavior.

## Problem

### There is no single runtime contract for certification

Later RFCs cannot safely persist or exchange objects that exist only as prose or TypeScript interfaces. Every authoritative object needs a strict runtime parser, an inferred type, an identity payload, and one hash implementation. Hand-written parallel interfaces would drift from Zod parsing and allow unknown fields or legacy statuses to enter the dossier.

### Diagnostic ownership violates the intended engine/plugin boundary

The engine must validate `EvidenceEnvelopeV1.result.diagnostics`, but its canonical diagnostic is currently only a TypeScript interface. Importing `diagnosticSchema` from the site plugin would reverse DNA-64. Copying it would create two sources of truth. The contract must move into the engine and the site package must consume it in the same forward-only implementation.

### Current hashing is not strict enough for authority identities

`stableJsonHash` recursively sorts object keys but does not define an admissible JSON domain or reject `undefined`, sparse arrays, non-finite numbers, class instances, cycles, functions, symbols, or bigint. Silently dropping or coercing such values can make different inputs share a claimed identity. Changing the existing helper would create unrelated cache/platform hash churn.

### Release state conflates unrelated lifecycles

A ready immutable artifact can be deployed multiple times, fail in one channel, remain a rollback target, and later have degraded production health. Those facts cannot be represented truthfully by one mutable `release.state` value. The present vocabulary has already drifted between schemas, handlers, RFCs, and DNA. Extending the enum again would preserve the modeling error.

### Evidence selection and aggregation lack executable laws

The specification requires explicit `pass`, `fail`, `incomplete`, `stale`, and `not-applicable`; authority admission order; an immutable evaluation cut; dimension coverage; and deterministic action packs. Without pure functions and property tests, later orchestration code will likely reimplement selection and precedence differently in commands, storage, Main verification, and monitoring.

### Transitional success would reintroduce the defect

Keeping old deployment commands operational against old state/evidence while new contracts land would create two authorities. The operator does not require compatibility. A blocked transition is preferable to a command that appears to succeed under obsolete semantics.

## Decision

`@warpgogol/werkstatt` gains one strict, stack-agnostic `certification` public domain containing the versioned runtime contracts and pure identity, evidence-selection, aggregation, action-pack, dossier-hash, and state-transition functions defined by CERT-001; the canonical Diagnostic runtime schema moves into the engine; certification uses a new strict `canonical-json@1` fingerprint API; release artifact state is separated from append-only deployment operations and certification health; and every legacy site deployment command fails closed until CERT-007 supplies the new authority-backed workflow.

## Architectural fit

### DNA-53 — semantic fingerprint governance

All certification hashes remain inside `@warpgogol/werkstatt/fingerprint`. CERT-001 extends that package with a new versioned strict canonical JSON surface rather than calling `node:crypto` from certification modules or changing existing hashes implicitly.

### DNA-64 — engine/plugin/workshop boundary

Candidate identity, status vocabulary, evidence admission shape, decisions, dossier events, authority attestations, and pure aggregation are stack-agnostic engine concerns. No core module imports `@warpgogol/werkstatt-site`. The site plugin consumes the engine-owned Diagnostic schema; concrete profile requirements and producers remain deferred to CERT-002/CERT-005.

### DNA-48/DNA-49/DNA-73 — release and deployment state

This RFC formally amends their executable state model. DNA-48 becomes artifact-focused (`prepared | ready`). Deployment history becomes append-only operation data, not a release-manifest phase. Certification decisions and current health remain separate. CERT-007 later restores the site deployment commands against these contracts.

### DNA-51/DNA-52 — consistency and artifact store

CERT-001 defines operation identifiers, state transitions, candidate/artifact references, and dossier identities but performs no I/O. CERT-003/CERT-004 must reuse existing locks, atomic writes, idempotency primitives, and artifact-store references when they implement persistence/orchestration.

### RFC-0203 — canonical diagnostics

RFC-0203's diagnostic vocabulary is retained but its runtime ownership moves from the site audit module to the engine schema layer. Legacy audit alias names are removed because the operator chose a clean cut.

### Forward-only program boundary

No compatibility reader, status translator, evidence importer, alias enum, dual-write, grace period, or passing fallback is created. Old release directories may remain on disk until CERT-010, but new parsers identify them as legacy/invalid rather than reinterpret them.

## Design

### CLI surface

CERT-001 adds no certification command. `release.certify`, status, verification, and profile validation belong to CERT-004.

This RFC changes existing command behavior only to enforce the forward-only boundary:

- `release.validate` validates the new artifact-only release manifest and rejects legacy deployment states;
- `release.rollback` returns `CERT-TRANSITION-01` because rollback is a deployment operation, not an artifact mutation;
- `release.state.validate` reports artifact state only and rejects legacy deployment-state expectations;
- `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.status`, `leitstand.rollback`, `leitstand.health`, and `leitstand.pipeline.check` return `CERT-TRANSITION-01` until CERT-007 replaces the guard.

The blocked result is a normal canonical nonzero kernel result, not an uncaught exception:

```json
{
  "command": "leitstand.promote",
  "status": "incomplete",
  "diagnostics": [
    {
      "ruleId": "CERT-TRANSITION-01",
      "severity": "error",
      "message": "Site deployment is unavailable until the authority-backed certification transition is implemented.",
      "fixHint": "Implement the accepted werkstatt-release-certification roadmap through CERT-007; no bypass is permitted."
    }
  ],
  "requiredNode": "CERT-007"
}
```

No `--force`, legacy, compatibility, or skip flag is accepted. Service deployment commands are outside this site-release transition and are not changed by this RFC.

### Module and public API layout

The implementation uses small modules with one responsibility; no new source file may exceed the repository's 600-line warning threshold.

| Path | Responsibility |
|---|---|
| `packages/werkstatt/src/schemas/diagnostic.ts` | Strict engine-owned Diagnostic and DiagnosticEvidence schemas plus inferred types |
| `packages/werkstatt/src/certification/contracts/identifiers.ts` | Digest, schema-ID, operation-ID, status, gate, channel, and environment primitives |
| `packages/werkstatt/src/certification/contracts/candidate.ts` | Release candidate and deployment-plan schemas from the spec plus AMD-003/AMD-005 fields |
| `packages/werkstatt/src/certification/contracts/policy-bundle.ts` | Immutable policy-bundle schema from AMD-005 |
| `packages/werkstatt/src/certification/contracts/evidence.ts` | Evidence envelope, requirement result, applicability, authority sequence, and freshness schemas |
| `packages/werkstatt/src/certification/contracts/dossier.ts` | Dossier event base/discriminated union, manifest projection, incident and root schemas |
| `packages/werkstatt/src/certification/contracts/decisions.ts` | Gate, Main-verification, and current-health decision schemas including AMD-001/AMD-006 cuts |
| `packages/werkstatt/src/certification/contracts/action-pack.ts` | Canonical action-pack and anchored task schemas |
| `packages/werkstatt/src/certification/contracts/authority.ts` | Authority issuer, attestation, authorization, verification, and preview-authority schemas |
| `packages/werkstatt/src/certification/contracts/state.ts` | Artifact and deployment-operation state/event schemas |
| `packages/werkstatt/src/certification/contracts/index.ts` | Internal contract barrel; no I/O |
| `packages/werkstatt/src/certification/identity.ts` | Exhaustive identity payload builders and canonical hashes |
| `packages/werkstatt/src/certification/evidence-selection.ts` | Eligibility, freshness, admission-sequence selection, and evaluation-cut filtering |
| `packages/werkstatt/src/certification/aggregation.ts` | Applicability resolution, coverage, precedence, and decision construction |
| `packages/werkstatt/src/certification/action-pack.ts` | Deterministic non-pass task construction and topological ordering |
| `packages/werkstatt/src/certification/dossier-hash.ts` | Pure event and dossier-root hashing; no repository writes |
| `packages/werkstatt/src/certification/state-machine.ts` | Pure artifact/deployment transition validation and legacy rejection |
| `packages/werkstatt/src/certification/transition-block.ts` | Canonical `CERT-TRANSITION-01` kernel result for temporarily unavailable commands |
| `packages/werkstatt/src/certification/index.ts` | Deliberate public API for later CERT nodes |
| `packages/werkstatt/src/fingerprint/canonical-json.ts` | Strict `canonical-json@1` validation, bytes, and hash API |

`packages/werkstatt/package.json` adds the explicit `@warpgogol/werkstatt/certification` subpath. The main barrel must not expose internal helpers accidentally. Only contracts and pure functions required by known roadmap nodes are public.

### Runtime schema policy

Every persisted or transmitted certification contract defined in `werkstatt-release-certification/contracts.md` and AMD-001/003/004/005/006 receives a strict Zod schema. Types are inferred with `z.infer`; parallel hand-written interfaces are forbidden.

Implementation rules:

1. Every object schema uses `.strict()` unless the normative spec explicitly defines a free-form record.
2. Every closed vocabulary is a Zod enum or discriminated union; unknown values fail parsing.
3. Digest fields use one `sha256:<64 lowercase hex>` schema. Content IDs are their canonical digest, not random identifiers.
4. Human/operation/run identifiers use their own schema and cannot be passed where a content digest is required.
5. Every authoritative top-level object contains its literal schema version.
6. Timestamps require ISO-8601 UTC date-time strings but never determine evidence precedence.
7. Safe physical locators, observation-only timestamps, detached signature bytes, and self IDs are excluded only where the normative identity rule explicitly says so.
8. Unknown fields, legacy state/status values, unsafe locators, and malformed diagnostics are parse failures; parsers never strip them silently.

The RFC does not repeat model field tables. Implementers must translate the cited immutable spec schemas exactly and apply accepted amendment deltas before writing tests.

### Canonical Diagnostic migration

`packages/werkstatt/src/schemas/diagnostic.ts` becomes the only implementation of:

- `diagnosticSeveritySchema`;
- `diagnosticEvidenceSchema`;
- `diagnosticSchema`;
- inferred `DiagnosticSeverity`, `DiagnosticEvidence`, and `Diagnostic` types.

`packages/werkstatt/src/kernel/types.ts` imports/re-exports these types instead of declaring parallel interfaces. `packages/werkstatt/src/schemas/index.ts` exports the runtime schemas and types.

`packages/werkstatt-site/src/checks/audit/types.ts` imports the core schemas. It keeps only site audit schemas that add site-specific result/caching structure. `auditSeveritySchema`, `auditEvidenceSchema`, and `auditFindingSchema` aliases are deleted; internal references are renamed to canonical diagnostic names in the same change. No engine file imports the site package.

### Strict canonical JSON v1

`canonicalJsonBytesV1(value)` validates the input recursively and returns UTF-8 bytes for one deterministic representation. `canonicalJsonHashV1(value)` delegates hashing to the existing `byteHash`; certification code never imports `node:crypto`.

The v1 admissible domain is JSON null, booleans, finite JSON numbers, strings, dense arrays, and plain objects with own enumerable string keys. It rejects:

- `undefined`, functions, symbols, bigint, `NaN`, positive/negative infinity, and negative zero if its sign would carry domain meaning;
- sparse arrays, cyclic references, symbol keys, accessors, class instances, dates, maps, sets, typed arrays, buffers, and objects with a custom prototype/toJSON;
- values whose traversal changes during serialization.

Object keys sort by a documented code-unit comparator, arrays preserve order, and number/string emission is pinned by fixtures. Unicode is preserved byte-for-byte after JavaScript string encoding; hidden Unicode normalization is forbidden. Domain payload builders normalize semantic paths to workspace-relative POSIX form before canonicalization and reject absolute paths, `..` escapes, empty components, NUL, or embedded credentials.

The API exports the literal `CANONICAL_JSON_V1 = "werkstatt/canonical-json@1"`. Every content-addressed certification identity records or is unambiguously governed by that version. Existing `stableStringify` and `stableJsonHash` remain byte-compatible for non-certification consumers and are forbidden inside `src/certification/**` by a focused source test.

### Identity functions

Each content-addressed object has an explicit pure payload builder and hash function rather than a generic “delete id and hash the rest” helper. Examples of the required API pattern are:

```ts
function toReleaseCandidateIdentityPayload(
  input: ReleaseCandidateIdentityInputV1,
): ReleaseCandidateIdentityPayloadV1;

function computeReleaseCandidateId(
  input: ReleaseCandidateIdentityInputV1,
): Sha256Digest;

function toEvidenceIdentityPayload(
  envelope: EvidenceEnvelopeV1,
): EvidenceIdentityPayloadV1;

function computeEvidenceId(envelope: EvidenceEnvelopeV1): Sha256Digest;

function computePolicyBundleRoot(bundle: CertificationPolicyBundleV1): Sha256Digest;
function computeDossierEventHash(event: DossierEventV1): Sha256Digest;
function computeDossierRoot(candidateId: Sha256Digest, eventHashes: readonly Sha256Digest[]): Sha256Digest;
function computeDecisionId(decision: CertificationDecisionV1): Sha256Digest;
function computeActionPackId(pack: CertificationActionPackV1): Sha256Digest;
```

Payload types make excluded fields impossible rather than optional. Builders parse their input first, normalize allowed path-like values explicitly, verify supplied self IDs when present, and return deeply immutable values. No identity function reads time, environment variables, filesystem state, installed packages, network state, or mutable global configuration.

Candidate identity incorporates build configuration, deployment-plan identity, and immutable policy-bundle root as amended by AMD-003/AMD-005. Observed Dev/Alt/Main environment identity remains evidence/deployment-operation data and does not split one candidate into three.

### Evidence eligibility and authority order

`selectRequirementEvidence()` is pure. It receives an already parsed candidate/policy binding, requirement, target decision kind/environment, authority operation ID, evaluation cut, authority time, and admitted evidence records. It returns a discriminated result containing the selected evidence IDs/sequences or an explicit reason class.

The algorithm follows `werkstatt-release-certification/amendments/amd-006-authority-ordered-evidence.md`:

1. discard records whose admission sequence is greater than the immutable evaluation cut;
2. require exact candidate, policy-bundle/profile, requirement, gate/decision kind, producer, and permitted environment binding;
3. enforce authority operation closure/reuse rules;
4. evaluate attestation shape, applicability, input/toolchain/environment compatibility, and freshness;
5. choose the eligible record with the greatest authority admission sequence;
6. never use producer timestamps, filenames, mtimes, lexical IDs, or diagnostic order as precedence.

No record maps to `incomplete`; compatible but expired/mismatched evidence maps to `stale`; an admitted current violation maps to `fail`. `not-applicable` is eligible only with complete machine applicability evidence. Rejected or late submissions are not selectable requirement evidence.

CERT-001 validates attestation and event structure only. Cryptographic verification, issuer registries, append authority, and late-result persistence belong to CERT-003.

### Deterministic aggregation

`evaluateCertificationDecision()` is the single pure aggregator reused by later gate, Main-verification, and health orchestration. It:

- resolves required and conditional requirements for the decision kind;
- invokes evidence selection at the fixed evaluation cut;
- preserves per-requirement `pass`, `fail`, `stale`, `incomplete`, and `not-applicable`;
- verifies that every mandatory dimension has applicable required coverage;
- applies top-level precedence `fail > stale > incomplete > pass`;
- records exact selected evidence IDs and reason codes;
- emits stable coverage counts and a deterministic action-pack input for every non-pass;
- never infers success from zero requirements, zero diagnostics, exit code 0, old evidence, advisory evidence, or producer failure.

All input sets and output arrays have explicit canonical sorting keys. Permuting requirements, evidence input arrays, diagnostics, or equivalent map insertion order must not change the decision ID or action-pack ID.

### Deterministic action packs

`buildCertificationActionPack()` consumes only parsed decision results plus requirement remediation metadata. It never reads source files or invokes an agent. It creates one task per actionable non-pass requirement, preserves product-fix/infrastructure-retry/policy-defect classification, validates anchors and exact verification commands, constructs dependencies, and produces a stable topological order.

A cyclic dependency, generic instruction without an anchor, missing reproduce/verification command, or non-pass without an actionable task is a contract error and prevents the decision from being represented as a complete authoritative result. Markdown/HTML rendering is outside CERT-001; later projections must derive from canonical JSON.

### State contracts

The core defines three independent domains:

1. `ReleaseArtifactState = "prepared" | "ready"` in the release manifest;
2. append-only deployment-operation events whose state vocabulary is the accepted K-0036 sequence and whose identity binds candidate, channel, target, authority operation, and prior event;
3. immutable gate/Main decisions plus `current | degraded | revoked` current-health decisions.

`releaseStateSchema` is replaced/renamed to artifact-state terminology. Legacy values `published`, `dev-deployed`, `alt-deployed`, `promoted`, `main-deployed`, and `rolled-back` are absent from schemas and rejected by tests. Rollback is an operation/event; it never mutates artifact readiness.

The pure transition validator returns an explicit allowed/forbidden result with stable reason code. It contains no adapter or filesystem behavior. Main verification and bootstrap rollback structures follow AMD-001; the bootstrap object's runtime use remains CERT-009.

### Release manifest parsing and legacy handling

`readReleaseManifest()` must stop hand-parsing YAML into `Record<string, unknown>`. It reads YAML with the shared parser, validates the strict release manifest schema, and returns the inferred type. `writeReleaseYaml()` accepts only that type and uses the existing atomic writer.

Old release directories are not migrated. A legacy state produces a bounded `CERT-LEGACY-STATE-01` diagnostic identifying the release and value and explaining that the clean certification program does not import it. `release.list` may list it only in an explicit invalid/legacy diagnostics collection; it must not present it as ready or deployable. CERT-010 later inventories/deletes legacy payloads.

### Transitional command block

All site deployment handlers listed in `commands.changed` call one shared fail-closed result builder before any build, provider request, registry write, release mutation, Bordbuch append, CDN purge, or health request. Unit tests assert the provider/deploy adapter is not invoked.

The result uses `status: "incomplete"`, `CERT-TRANSITION-01`, `requiredNode: "CERT-007"`, and no bypass. This guard is intentionally deleted/replaced by CERT-007; it is not a compatibility mode and cannot be disabled through environment/configuration.

`release.rollback` is blocked because it currently mutates artifact state without a deployment operation. `release.state.validate` and `release.validate` are updated to use artifact-state terminology and strict parsing. The service deployment commands remain untouched because this specification's first profile/cutover is the site workshop.

### File system responsibilities

| Path | CERT-001 behavior |
|---|---|
| `packages/werkstatt/src/certification/**` | New pure stack-agnostic certification domain; no filesystem/network/provider I/O |
| `packages/werkstatt/src/fingerprint/canonical-json.ts` | New strict canonical bytes/hash implementation |
| `packages/werkstatt/src/schemas/diagnostic.ts` | New canonical runtime diagnostic owner |
| `packages/werkstatt/src/schemas/release.ts` | Replace overloaded release state with artifact-only state and typed manifest |
| `packages/werkstatt/src/kernel/types.ts` | Re-export schema-inferred Diagnostic types |
| `packages/werkstatt/src/release/**` | Typed manifest I/O, legacy rejection, rollback block, artifact-only validation |
| `packages/werkstatt/src/leitstand/**` | Early shared transition block for site deployment/readiness commands |
| `packages/werkstatt-site/src/checks/audit/types.ts` | Consume core Diagnostic schemas; remove duplicate/legacy aliases |
| `packages/werkstatt/package.json` | Add certification public subpath |
| `docs/architecture-dna.md` and root Compass XML | Record the implemented artifact/deployment/certification separation and temporary blocked command surface |
| `docs/command-manifest.generated.yaml` | Regenerated because existing command behavior changes |
| `docs/ecosystem.generated.yaml` | Regenerated from registries; never hand-edited |

CERT-001 reads no existing `releases/**`, `missions/**`, or R2 evidence during implementation tests except isolated fixtures in `tmp-*` directories. It never edits a Sternsystem mirror or mission workpiece.

### Output format

The new core is a library API. Runtime schemas return normal Zod parse results or throw only through explicit `parse` entrypoints. Pure decision functions return discriminated result objects and do not log.

Temporarily blocked commands return canonical kernel results with:

- `command`;
- `status: "incomplete"`;
- one or more canonical diagnostics;
- `requiredNode: "CERT-007"`;
- `exitCode: 1`;
- a bounded summary and required next step.

Pretty and JSON rendering continue through the kernel result renderer. No command prints a second ad hoc JSON document or embeds full evidence payloads in terminal output.

### Stable diagnostics

CERT-001 allocates only core/transition families needed by its code:

| Rule | Meaning |
|---|---|
| `CERT-SCHEMA-01` | certification object fails its strict runtime schema |
| `CERT-IDENTITY-01` | supplied identity does not equal recomputed canonical identity |
| `CERT-CANONICAL-01` | value is outside the canonical-json@1 domain |
| `CERT-EVIDENCE-01` | no compatible admitted evidence exists at the evaluation cut |
| `CERT-EVIDENCE-02` | evidence is incompatible or expired and therefore stale |
| `CERT-GATE-01` | mandatory requirement/dimension coverage is incomplete |
| `CERT-GATE-02` | aggregation input is internally contradictory |
| `CERT-ACTION-01` | non-pass remediation is missing, unanchored, cyclic, or unverifiable |
| `CERT-STATE-01` | artifact/deployment transition is not allowed |
| `CERT-LEGACY-STATE-01` | a legacy release deployment state is encountered and rejected |
| `CERT-TRANSITION-01` | legacy site deployment command is blocked until CERT-007 |

Messages are bounded and never include secrets, full evidence payloads, absolute local paths, or arbitrary producer output.

### Failure modes

| Failure | Required result |
|---|---|
| Unknown schema/status/state field | strict parse failure; never strip or default |
| Unsupported canonical JSON value | `CERT-CANONICAL-01`; no digest returned |
| Supplied ID differs from recomputed ID | `CERT-IDENTITY-01`; object is unusable |
| No evidence | `incomplete` |
| Expired or identity-incompatible evidence | `stale` |
| Current admitted violation | `fail` |
| Explicit applicable pass with complete coverage | `pass` |
| Conditional requirement without applicability proof | `incomplete` |
| Required dimension absent | `incomplete` plus `CERT-GATE-01` |
| Non-pass without valid remediation task | decision construction fails with `CERT-ACTION-01` |
| Legacy release state | invalid/legacy diagnostic; never translated |
| Legacy site deployment invocation | `incomplete`, exit 1, no side effect |
| Site plugin still defines its own Diagnostic schema | build/source-contract test failure |

### Tests

All new tests live under `packages/werkstatt/src/tests/` or the package's existing accepted test layout; property suites use `.pbt.test.ts` and fast-check.

Required suites:

1. **Schema fixtures:** valid object and one-field-at-a-time invalid fixtures for every top-level contract and closed vocabulary.
2. **Canonical JSON properties:** key-order invariance, array-order sensitivity, Unicode byte stability, finite-number fixtures, forbidden-domain rejection, cycle rejection, and unchanged legacy `stableJsonHash` fixtures.
3. **Identity properties:** excluded-field invariance, every included-field sensitivity, path normalization, self-ID verification, no mutation, repeated-run equality, and cross-contract ID non-substitutability.
4. **Evidence selection tables/properties:** evaluation cuts, admission ordering, expiry, environment reuse, not-applicable proof, operation binding, and permutation invariance.
5. **Aggregation truth table:** exhaustive combinations proving `fail > stale > incomplete > pass`, advisory neutrality, empty-profile non-pass, dimension coverage, and stable selected IDs/reasons.
6. **Action-pack properties:** one actionable task per non-pass requirement, stable topological ordering, cycle/missing-anchor rejection, and classification consequence.
7. **Dossier hash properties:** event order sensitivity, prior-hash sensitivity, location independence, and projection-time exclusion.
8. **State-machine tables:** every allowed and forbidden artifact/deployment transition; explicit rejection of all legacy labels.
9. **Transition-block command tests:** every listed handler exits 1 before mocked side effects and exposes `CERT-TRANSITION-01` in JSON.
10. **Boundary tests:** engine certification source has no stack-plugin imports; site audit source imports core diagnostic schemas and defines no duplicate.

Tests must use deterministic clocks/fixtures and synthetic secrets. No production release, mission, cache clone, provider, R2 bucket, or URL is touched.

## Rollout

This is a clean, fail-closed foundation landing, not a compatibility rollout.

1. Add `canonical-json@1` and its regression/property tests without changing `stableJsonHash`.
2. Move the Diagnostic runtime schema/types into the engine; update every site audit reference in the same commit set and delete legacy alias implementations.
3. Add certification contract schemas in dependency order: primitives → candidate/policy → evidence → dossier → decisions/action packs/authority → states.
4. Add explicit identity payload builders and hash tests.
5. Add evidence selection, aggregation, action-pack, dossier-hash, and state-machine pure functions with table/property tests.
6. Replace release manifest state and manual parsing; reject legacy manifests without migrating them.
7. Install the shared transition block before any legacy site deployment side effect and update command result types/tests.
8. Add the public package export and verify engine autonomy.
9. Update DNA/Compass/agent documentation to describe the actually implemented transitional state; regenerate command and ecosystem manifests from their owners.
10. Run package builds, full relevant tests, `werkstatt.autonomy.validate`, `fingerprint.usage.lint`, RFC validation, generated drift checks, and clean-tree verification.

There is no grace window, compatibility flag, alias, fallback, dual-write, old evidence import, or requirement to keep the site deployment pipeline usable before CERT-007. The codebase must still typecheck and the CERT-001 tests must pass at the end of this RFC.

## Alternatives considered

### Keep one release state enum and add more values

Rejected. It cannot represent concurrent/historical deployment operations and current health without overwriting facts. The existing schema/command/DNA drift is evidence that the abstraction has already failed.

### Preserve legacy state/evidence through adapters

Rejected by the operator. There is one replaceable site and no certification authority worth migrating. Adapters would legitimize ambiguous old evidence and give later agents two success paths.

### Change `stableJsonHash` globally

Rejected. It would alter unrelated cache/platform identities. A versioned strict API gives certification a frozen domain without hidden ecosystem-wide churn.

### Keep Diagnostic schema in the site plugin

Rejected. Engine evidence admission would either import a stack plugin or duplicate the schema, both violating DNA-64 and single ownership.

### Define TypeScript interfaces now and add runtime schemas later

Rejected. Persistence and authority boundaries require runtime validation from the first consumer. Parallel interfaces drift and allow unknown values.

### Keep legacy deployment commands working until CERT-007

Rejected. That would leave an executable uncertified promotion path. Explicit unavailability is truthful and accepted by the operator.

### Combine storage and orchestration into CERT-001

Rejected. It would mix pure contracts with I/O, credentials, locks, and command lifecycle, making the foundation harder to test and later adapters harder to replace. CERT-003/CERT-004 own those concerns.

## Risks

### Large contract surface

The spec defines many related objects. An implementation agent may place everything in one oversized file or omit amendment fields. Mitigation: use the prescribed file map, implement in dependency order, translate every cited schema into a traceability checklist, and keep each module below the size warning.

### False confidence from typechecking

Types alone do not prove identity or aggregation laws. Mitigation: strict runtime schemas plus negative fixtures, property-based identity tests, exhaustive precedence tables, and permutation tests are mandatory.

### Canonicalization mistakes become permanent identities

An ambiguous v1 encoder would contaminate all future dossiers. Mitigation: reject a narrow input domain, version it explicitly, pin byte fixtures, retain old hash APIs unchanged, and stop implementation if cross-runtime bytes cannot be demonstrated.

### Operational outage during program implementation

Site deployment commands will be intentionally unavailable. This is accepted. Mitigation: preserve the currently serving public site, make every blocked command explicit/actionable, and prioritize roadmap nodes through CERT-007 before attempting a new cutover.

### Overblocking service deployment

The site transition must not accidentally disable backend service workflows. Mitigation: block only the enumerated site release/Leitstand handlers and add service-command regression tests.

### Diagnostic migration blast radius

Removing aliases may expose hidden consumers. Mitigation: repository-wide symbol search, engine/site build checks, and no reintroduction of local schemas to make compilation pass.

### Legacy release directories remain present

Agents may mistake them for new candidates. Mitigation: strict schema rejection, explicit `CERT-LEGACY-STATE-01`, no translation, and CERT-010 cleanup dependency.

### Agent misinterpretation of “project may be broken”

An agent may leave TypeScript/tests broken or implement partial schemas. Mitigation: the permission applies only to operational availability of the old deployment path. Compilation, contract completeness, tests, canonical validation, and clean commits remain hard acceptance criteria.

### Amendment omission

`spec.materialize` annotated the node with AMD-003, while AMD-001/004/005/006 also assign CERT-001 impact in their bodies. Mitigation: the RFC cites and tests every applicable accepted amendment explicitly; implementation must use `spec.status` plus the amendment directory, not only the generated title suffix.

## Acceptance criteria

- [ ] `packages/werkstatt/src/schemas/diagnostic.ts` is the only runtime implementation of the canonical Diagnostic contract; kernel and site audit code consume it, and legacy diagnostic schema aliases are removed.
- [ ] `canonicalJsonBytesV1` and `canonicalJsonHashV1` implement the strict versioned domain, certification imports only the v1 API, existing stable-hash fixtures remain byte-identical, and negative/property tests pass.
- [ ] Every top-level contract required by the base spec and AMD-001/003/004/005/006 has a strict runtime schema, inferred type, literal schema version, and positive/negative fixture coverage.
- [ ] Candidate, policy bundle, evidence, dossier event/root, decision, and action-pack identity payload builders are explicit, pure, non-mutating, and covered by included/excluded-field property tests.
- [ ] Evidence selection uses authority admission sequence and immutable evaluation cuts; clock/order/retry/permutation tests prove late or reordered results cannot alter a prior decision.
- [ ] Aggregation exhaustively proves `fail > stale > incomplete > pass`, explicit not-applicable handling, advisory neutrality, mandatory dimension coverage, and non-pass action-pack generation.
- [ ] Artifact, deployment-operation, immutable certification, and current-health schemas are separate; release manifests accept only `prepared | ready`; every legacy state spelling is rejected.
- [ ] `readReleaseManifest` and `writeReleaseYaml` use the strict inferred manifest contract; old release directories are not migrated and surface `CERT-LEGACY-STATE-01` rather than a translated state.
- [ ] Every site command listed in `commands.changed` returns `CERT-TRANSITION-01` and exits nonzero before any provider/build/registry/release/Bordbuch side effect; service deployment regression tests remain green.
- [ ] `@warpgogol/werkstatt/certification` is an explicit public subpath, certification source imports no stack plugin, and `werkstatt.autonomy.validate` passes.
- [ ] Required unit, property-based, state-table, boundary, and transition-block tests pass under `pnpm --filter @warpgogol/werkstatt test`.
- [ ] `pnpm --filter @warpgogol/werkstatt build:check` and `pnpm --filter @warpgogol/werkstatt-site build:check` pass with no compatibility aliases or type escapes.
- [ ] DNA-48/DNA-49/DNA-73, applicable Compass XML, package/root agent documentation, command manifest, and ecosystem projection describe the implemented separated/transitionally blocked model and are regenerated through their owning commands.
- [ ] `rfc.acceptance.run --id RFC-0848`, `rfc.validate --id RFC-0848 --json`, `spec.validate --spec=werkstatt-release-certification --json`, generated-drift checks, and `bash scripts/check-clean-trees.sh` pass before implementation stamping.

## Implementation notes for agents

- Agents MAY implement this RFC only after its status is `accepted`.
- This RFC is document-only while `draft`; do not edit package code during RFC creation or acceptance.
- Begin by reading the complete `werkstatt-release-certification` snapshot and every accepted amendment. Do not implement from this RFC's summaries alone.
- Build a private traceability checklist from every top-level spec schema and amendment delta before creating files; remove it before the final commit unless it becomes durable verification documentation.
- Implement in the rollout order. Do not start release/Leitstand blocking before the core schemas and transition result contract compile.
- MUST use Zod strict schemas as type sources. MUST NOT maintain a parallel interface with the same shape.
- MUST use `@warpgogol/werkstatt/fingerprint`; MUST NOT import `node:crypto` in certification source or change legacy stable-hash output.
- MUST NOT import any stack plugin into `@warpgogol/werkstatt`, including for Diagnostic validation.
- MUST delete duplicate site diagnostic schema implementations and update consumers; do not retain aliases, shims, re-exports under legacy audit names, or `as any` escapes.
- MUST NOT add a legacy certification reader, release-state translator, evidence importer, grace date, fallback pass, feature flag, opt-in strict mode, or bypass.
- The accepted operational break does not permit a broken build. Both impacted packages and all CERT-001 tests must be green before committing.
- The transition guard must run before every side effect. Tests must mock/spy the first provider/build/write boundary and prove zero calls.
- Do not remove old release directories manually. CERT-001 only rejects them; CERT-010 owns audited cleanup.
- Do not implement profile loading, repository writes, remote storage, authority credentials, commands, producer execution, deployment, monitoring, or rendering beyond the explicit transitional block.
- Update source `MODULE_CONTRACT`/`CHANGE_SUMMARY` markup for every non-trivial authored file and use `.ts` extensions in relative imports.
- When command source behavior changes, regenerate `docs/command-manifest.generated.yaml` with `command.manifest.generate`; regenerate `docs/ecosystem.generated.yaml` with `ecosystem.manifest.generate`. Never hand-edit generated projections.
- Before every commit, inspect `git diff` for every touched file and `git status`; stage only this RFC's files and use `ecosystem.commit`.
- If an accepted spec contract is internally inconsistent, stop and create a spec amendment. Do not silently choose one interpretation.
- If implementation cannot keep the core contract internally complete and tests green within one session, stop with the RFC unimplemented and create a handoff; do not stamp partial work.
- Before `implemented`, mark every acceptance criterion `[x]` with line-accurate evidence, run `rfc.implement.stamp --id RFC-0848 --dry-run`, then stamp and commit separately according to repository rules.
