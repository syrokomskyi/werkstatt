---
id: RFC-0849
title: "Establish strict certification runtime contracts and identities"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0364
  - RFC-0848
dependsOn: []
batch: werkstatt-release-certification-cert-001
satisfies:
  - DNA-53
  - DNA-64
versionBump: major
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Every persisted or transmitted CERT-001 object has one strict engine-owned Zod schema and one inferred TypeScript type."
  - "Every certification identity is reproduced from an explicit payload builder and canonical-json@1 bytes."
  - "The engine owns the canonical Diagnostic runtime schema without importing the site plugin."
  - "Certification code cannot use the permissive legacy stableJsonHash surface."
nonGoals:
  - "This RFC does not select evidence, aggregate decisions, build action packs, or compute dossier roots; RFC-0850 owns those pure algorithms."
  - "This RFC does not replace release/deployment state or block legacy commands; RFC-0851 owns that cutover."
  - "This RFC does not persist objects, append dossiers, verify signatures, run producers, expose certification commands, or deploy a site."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/schemas/diagnostic.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/fingerprint/canonical-json.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/certification/contracts/index.ts"
---

# RFC-0849: Establish strict certification runtime contracts and identities

## Context

RFC-0848 was split during enhancement because CERT-001 was too large for one isolated implementation session. This RFC is the first implementation boundary. RFC-0850 and RFC-0851 depend on its schemas, canonical bytes, identifiers, and package boundary.

Normative model sources are `werkstatt-release-certification/contracts.md`, `verification.md#core-invariants-and-required-properties`, ADR-001 through ADR-006, ADR-011, ADR-012, ADR-018, ADR-020, and accepted amendments AMD-001/003/004/005/006. The implementation must translate those sources; this RFC intentionally does not copy their field tables.

Today the engine has only a hand-written `Diagnostic` interface, the strict runtime schema lives in `@warpgogol/werkstatt-site`, and `stableJsonHash` accepts values that are ambiguous for an authority identity. Later certification code cannot safely persist or exchange parallel interfaces or hashes whose admissible value domain is implicit.

## Problem

There is no runtime-enforced, stack-agnostic certification vocabulary. Unknown fields, legacy status values, malformed diagnostics, unsafe locators, or accidental `undefined` can cross a boundary before failing—or be silently discarded. Importing the site's diagnostic schema would reverse DNA-64; copying it would create two owners.

Generic stable JSON hashing is also insufficient for permanent authority identities: it does not freeze a strict JSON domain, nesting/size bounds, path normalization, or handling of cycles, accessors, class instances, sparse arrays, non-finite numbers, and mutable traversal.

## Decision

`@warpgogol/werkstatt` gains one strict certification contract layer, one engine-owned canonical Diagnostic runtime schema, and a versioned bounded `canonical-json@1` byte/hash API. Every certification content identity uses an explicit typed payload builder over parsed values; no generic field-deletion hash helper, parallel interface, plugin import, legacy reader, or compatibility alias is permitted.

## Architectural fit

### DNA-53 — semantic fingerprint governance

`canonicalJsonBytesV1` and `canonicalJsonHashV1` live under the engine fingerprint surface and delegate digest computation to the existing byte hash. Certification modules never import `node:crypto`. Existing stable hash functions remain byte-compatible for unrelated consumers.

### DNA-64 — engine/plugin/workshop boundary

Candidate, evidence, decision, dossier, authority, action-pack, state, and Diagnostic shapes are stack-agnostic engine contracts. `@warpgogol/werkstatt-site` consumes the engine-owned Diagnostic schema; the engine imports no plugin. Profile composition and site-specific producers remain CERT-002/CERT-005 work.

### RFC-0203 — canonical diagnostics

The diagnostic vocabulary remains canonical. Only runtime ownership changes: the engine becomes the sole Zod/type source, while site-only audit result/cache schemas remain in the plugin. This is a forward-only ownership move, not a second diagnostic dialect.

## Design

### CLI surface

This RFC adds or changes no commands. Its public surface is a package API. Verification uses existing workspace commands:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt build:check
pnpm --filter @warpgogol/werkstatt-site build:check
pnpm exec werkstatt run werkstatt.autonomy.validate --json
pnpm exec werkstatt run fingerprint.usage.lint --json
```

### Runtime schema policy

1. Each persisted or transmitted object in the cited CERT-001 sources receives a `.strict()` Zod schema and `z.infer` type.
2. Each top-level object carries its literal schema id/version. Closed vocabularies use enums or discriminated unions.
3. Digests use `sha256:<64 lowercase hex>`; content IDs, operation IDs, producer attempts, and human-readable IDs are non-substitutable schemas.
4. UTC timestamps are observation/freshness facts, never evidence precedence.
5. Unknown fields, unsafe locators, malformed diagnostics, and legacy certification/status values fail parsing; parsers never strip them.
6. Identity payload types make excluded fields absent, not optional. Builders parse first, normalize allowed path values, verify supplied self IDs, deep-freeze their result, and read no clock, filesystem, environment, network, or global mutable state.

### Canonical Diagnostic ownership

`packages/werkstatt/src/schemas/diagnostic.ts` is the only runtime owner of severity, evidence, and Diagnostic schemas/types. `kernel/types.ts` imports and re-exports inferred types. `packages/werkstatt-site/src/checks/audit/types.ts` imports the engine schema and keeps only site audit result/cache structure. `auditSeveritySchema`, `auditEvidenceSchema`, and `auditFindingSchema` are removed together with all internal alias references; no deprecated re-export remains.

### Canonical JSON v1

```ts
declare const CANONICAL_JSON_V1: "werkstatt/canonical-json@1";

function canonicalJsonBytesV1(value: unknown): Uint8Array;
function canonicalJsonHashV1(value: unknown): Sha256Digest;
```

The admissible domain is JSON null, booleans, finite JSON numbers, strings, dense arrays, and plain objects with own enumerable string keys. The encoder rejects `undefined`, functions, symbols, bigint, non-finite numbers, ambiguous negative zero, sparse/cyclic arrays, accessors, symbol keys, custom prototypes/toJSON, dates, maps, sets, typed arrays, buffers, and traversal mutation.

Object keys sort by a pinned code-unit comparator; arrays retain order; JavaScript string-to-UTF-8 bytes are preserved without hidden Unicode normalization. Semantic paths are normalized before canonicalization to workspace-relative POSIX form and reject absolute paths, `..`, empty components, NUL, and embedded credentials.

One canonical document is limited to 8 MiB encoded bytes and depth 64. Limit excess fails with `CERT-CANONICAL-LIMIT-01`; the encoder never truncates. Traversal and emission are `O(B + K log K)` for encoded bytes `B` and total per-object key sorting `K`, with `O(B + D)` working memory for bytes and depth. An advisory benchmark records performance; deterministic fixtures, not elapsed-time thresholds, gate CI.

### Contract and identity layout

| Path | Responsibility |
|---|---|
| `packages/werkstatt/src/schemas/diagnostic.ts` | Canonical strict Diagnostic schemas and inferred types |
| `packages/werkstatt/src/certification/contracts/identifiers.ts` | Digests, schema ids, operation ids, status/gate/channel/environment primitives |
| `packages/werkstatt/src/certification/contracts/candidate.ts` | Candidate and deployment-plan contracts including AMD-003/005 |
| `packages/werkstatt/src/certification/contracts/policy-bundle.ts` | Immutable policy bundle contract |
| `packages/werkstatt/src/certification/contracts/evidence.ts` | Evidence, requirement result, applicability, authority order, freshness contracts |
| `packages/werkstatt/src/certification/contracts/dossier.ts` | Dossier events, manifest projection, incident, and root contracts |
| `packages/werkstatt/src/certification/contracts/decisions.ts` | Gate, Main verification, and current-health decision contracts |
| `packages/werkstatt/src/certification/contracts/action-pack.ts` | Action pack, task, anchor, and dependency contracts |
| `packages/werkstatt/src/certification/contracts/authority.ts` | Issuer, attestation, authorization, verification, and preview-authority contracts |
| `packages/werkstatt/src/certification/contracts/state.ts` | Artifact and deployment-operation state/event contracts consumed by RFC-0851 |
| `packages/werkstatt/src/certification/contracts/index.ts` | Deliberate internal barrel; no I/O |
| `packages/werkstatt/src/certification/identity.ts` | Explicit payload builders and identity functions |
| `packages/werkstatt/src/fingerprint/canonical-json.ts` | Bounded strict canonical bytes/hash implementation |
| `packages/werkstatt/src/certification/index.ts` | Deliberate public exports required by known CERT nodes |
| `packages/werkstatt-site/src/checks/audit/types.ts` | Consumer of engine Diagnostic; site-only audit structures |

`packages/werkstatt/package.json` adds `@warpgogol/werkstatt/certification`. The main barrel does not expose internal helpers accidentally.

Representative signatures are:

```ts
function toReleaseCandidateIdentityPayload(input: ReleaseCandidateIdentityInputV1): ReleaseCandidateIdentityPayloadV1;
function computeReleaseCandidateId(input: ReleaseCandidateIdentityInputV1): Sha256Digest;
function toEvidenceIdentityPayload(input: EvidenceEnvelopeV1): EvidenceIdentityPayloadV1;
function computeEvidenceId(input: EvidenceEnvelopeV1): Sha256Digest;
function computePolicyBundleRoot(input: CertificationPolicyBundleV1): Sha256Digest;
function computeDecisionId(input: CertificationDecisionV1): Sha256Digest;
function computeActionPackId(input: CertificationActionPackV1): Sha256Digest;
```

Candidate identity includes build configuration, deployment-plan identity, and immutable policy-bundle root. Observed environment identity remains evidence/deployment-operation data; it does not create a different candidate per channel. Secret values are neither stored nor directly hashed.

### Output and failure contract

Library entrypoints return parsed typed values or discriminated success/failure results where recovery is expected. Explicit `parse` entrypoints may throw Zod errors; pure builders do not log. Stable diagnostic families are:

| Rule | Meaning |
|---|---|
| `CERT-SCHEMA-01` | strict contract parse failed |
| `CERT-IDENTITY-01` | supplied self identity differs from recomputed identity |
| `CERT-CANONICAL-01` | value is outside canonical-json@1 domain |
| `CERT-CANONICAL-LIMIT-01` | byte or depth bound exceeded |
| `CERT-PATH-01` | semantic path is unsafe or non-canonical |

Messages are bounded and omit absolute paths, secrets, complete evidence payloads, and arbitrary producer output. Required contract failures have zero suppression and zero intended false positives. A confirmed schema defect is corrected through a versioned spec amendment/RFC; callers may not catch it and synthesize pass.

## Rollout

1. Land canonical JSON fixtures/properties without changing legacy stable hash bytes.
2. Move Diagnostic ownership and update all engine/site consumers atomically.
3. Add schemas in dependency order: primitives → candidate/policy → evidence → dossier → decisions/action packs/authority/state.
4. Add identity builders and included/excluded-field property tests.
5. Add the public subpath, autonomy/source-boundary tests, and package documentation.

Every step ends with both impacted packages compiling. There is no alias/grace/dual-read phase. The serving site is unaffected because this RFC exposes no deployment command and performs no persistence.

## Alternatives considered

### Keep Diagnostic in the site plugin

Rejected: the engine would import a stack plugin or duplicate the schema, both violating DNA-64.

### Reuse or globally tighten stableJsonHash

Rejected: reuse leaves an ambiguous authority domain; global tightening changes unrelated cache/platform identities. A new explicit version freezes certification semantics without global churn.

### Start with TypeScript interfaces and add Zod later

Rejected: storage and authority consumers would begin from unenforced shapes, and parallel definitions would drift.

### Permit large values and rely on process memory

Rejected: canonical identity is a trust boundary. Explicit bounds make denial-of-service and accidental bulk embedding observable rather than machine-dependent.

## Risks

- **Large schema inventory:** an agent may omit amendment fields. Mitigation: create a traceability checklist from the complete spec/amendment set and one-field negative fixtures for every top-level contract.
- **Alias removal blast radius:** hidden site consumers may fail. Mitigation: repository-wide symbol search and both package build checks; never restore aliases to make compilation pass.
- **Permanent identity mistake:** incorrect v1 bytes contaminate future dossiers. Mitigation: pinned byte fixtures, property tests, included/excluded-field sensitivity, and stop-on-cross-runtime-disagreement.
- **False positives:** strict rejection is intentional for invalid inputs; expected false-positive rate is zero. Contract defects require normative correction, never suppression.
- **Agent scope creep:** persistence, evaluation, state cutover, or command work would make this session unsafe. Mitigation: explicit non-goals and child RFC boundaries.

## Acceptance criteria

- [ ] The engine is the only runtime owner of Diagnostic; kernel/site consumers use inferred core types and every legacy audit alias is absent.
- [ ] `canonicalJsonBytesV1`/`canonicalJsonHashV1` implement the pinned domain, 8 MiB/depth-64 bounds, stable fixtures, and negative/property tests without changing legacy stable-hash fixtures.
- [ ] Every CERT-001 top-level contract and AMD-001/003/004/005/006 delta has one strict schema, inferred type, literal schema id, and positive/negative fixtures.
- [ ] Explicit identity payload builders cover candidate, policy bundle, evidence, dossier event/root, decisions, and action packs with included/excluded-field sensitivity tests.
- [ ] Candidate identity separates build/deployment-plan identity from observed environment identity and never records/hashes raw secret values.
- [ ] `@warpgogol/werkstatt/certification` is an explicit public subpath and engine certification source has no stack-plugin import.
- [ ] `pnpm --filter @warpgogol/werkstatt test`, both impacted `build:check` commands, `werkstatt.autonomy.validate`, and `fingerprint.usage.lint` pass.
- [ ] Required schema/identity diagnostics have no suppression/bypass and documented normative correction procedure.
- [ ] `packages/werkstatt/AGENTS.md` and `packages/werkstatt-site/AGENTS.md` identify the engine contract owner and forward-only alias prohibition.
- [ ] `rfc.acceptance.run --id RFC-0849`, `rfc.verification.emit --id RFC-0849`, and `rfc.validate --id RFC-0849 --json` pass before implementation stamping.

## Implementation notes for agents

- Implement only after `status: accepted`; draft text grants no code authority.
- Read the complete certification snapshot and all accepted amendments before coding; do not implement from summaries alone.
- Complete this RFC in one session boundary. Do not begin RFC-0850 or RFC-0851 work in the same implementation.
- Use strict Zod schemas as the only type sources; no parallel interfaces, `as any`, `.passthrough()`, unknown-field stripping, or compatibility aliases.
- Do not import a stack plugin or `node:crypto` into certification source. Use the existing fingerprint byte hash.
- Do not add persistence, commands, producer execution, evaluation, deployment, or remote authority behavior.
- Keep source files below the repository warning threshold and update required Compass source markup for non-trivial files.
- If the spec is inconsistent, create an amendment; if an invariant conflict appears, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0849 --reason "..." --invariant "DNA-N"` (RFC-0334).
- Follow RFC-0230 for the package/agent-facing public surface and RFC-0476 for the verified implementation transition.
- Before stamping, attach line-accurate acceptance evidence, run `rfc.verification.emit --id RFC-0849` (RFC-0330), then use `rfc.implement.stamp --id RFC-0849 --dry-run` and the canonical commit flow.
