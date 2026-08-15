---
id: RFC-0853
title: "Define strict certification contracts and identity builders"
status: accepted
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
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
  - RFC-0203
  - RFC-0364
  - RFC-0776
  - RFC-0848
  - RFC-0849
  - RFC-0850
  - RFC-0851
  - RFC-0852
  - RFC-0855
  - RFC-0858
  - RFC-0859
  - RFC-0860
  - RFC-0861
  - werkstatt-release-certification/AMD-007
dependsOn:
  - RFC-0849
  - RFC-0852
  - RFC-0862
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
successSignals:
  - "Every persisted or transmitted CERT-001 object has one strict engine-owned Zod schema, one inferred TypeScript type, and one literal schema id/version."
  - "Every certification content identity is reproduced only from an explicit typed payload builder and RFC-0849 canonical-json@1 bytes."
  - "Every valid EvidenceEnvelopeV1 contains only RFC-0852 Diagnostics and reports resolved redaction before identity construction."
  - "RFC-0850 and RFC-0851 can consume the public certification contract surface without redefining schemas, identities, or plugin-specific types."
nonGoals:
  - "This RFC does not implement canonical JSON or Diagnostic ownership; RFC-0849 and RFC-0852 own those completed prerequisites."
  - "This RFC does not select evidence, aggregate decisions, build action packs, or compute an ordered dossier root; RFC-0850 owns those pure algorithms."
  - "This RFC does not replace release/deployment state or block legacy commands; RFC-0851 owns that cutover."
  - "This RFC does not persist objects, append dossiers, verify signatures, run producers, expose certification commands, contact providers, or deploy a site."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/certification/contracts/index.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/certification/identity.ts"
  - probe: file-contains
    path: "packages/werkstatt/package.json"
    pattern: "./certification"
---

# RFC-0853: Define strict certification contracts and identity builders

## Context

The initial RFC-0849 attempted to implement canonical bytes, Diagnostic migration, the full CERT-001 schema inventory, and every identity builder in one session. Its audit required a second decomposition for agents that will implement each document independently. RFC-0849 now supplies the bounded opaque canonical snapshot and RFC-0852 supplies the strict engine-owned Diagnostic. RFC-0858 through RFC-0862 additionally establish the resolved component graph, lifecycle/effect laws, runtime reflection, and neutral isolation identities that certification must bind rather than duplicate. This RFC is the final contract-only prerequisite: it translates the accepted certification model into stack-agnostic runtime schemas and explicit identities.

Normative sources are the complete `werkstatt-release-certification` snapshot, specifically `contracts.md`, `verification.md#core-invariants-and-required-properties`, ADR-001 through ADR-006, ADR-011, ADR-012, ADR-018, ADR-020, and accepted AMD-001/003/004/005/006. The implementation must build and check a traceability matrix against those sources; this RFC references rather than recopies every normative field table.

RFC-0850 depends on parsed evidence/decision/action/dossier contracts. RFC-0851 depends on artifact/deployment-operation state/event contracts. Neither child may invent a shape while waiting for this RFC.

## Problem

There is no runtime-enforced, stack-agnostic certification vocabulary. Unknown fields, legacy status values, malformed diagnostics, unsafe locators, unbounded collections, or accidental `undefined` can cross a boundary before failing—or be silently stripped. Hand-written interfaces can drift from Zod schemas, and a generic “delete some fields then hash” helper can accidentally omit a normative field.

Candidate, policy, evidence, decisions, action packs, dossier events, attestations, authorizations, and state events also have different identity exclusions. Without an explicit payload type and builder for each identity, storage location, observation timestamps, signatures, or self IDs can enter or leave a hash accidentally. The result would make historical verification and authority signatures unreliable.

## Decision

`@warpgogol/werkstatt/certification` becomes the single stack-agnostic runtime contract surface for CERT-001. Every persisted or transmitted top-level object receives one `.strict()` Zod schema, one `z.infer` type, one literal `werkstatt/...@1` schema identifier, explicit collection/string bounds, and positive/negative fixtures.

Every content identity receives a dedicated typed payload schema and builder. Builders accept only already parsed values, normalize only explicitly semantic path fields, construct a new payload with an allow-list of included fields, snapshot it through RFC-0849, and hash those bytes through the engine fingerprint surface. There is no generic omission/deletion helper, permissive hash, plugin import, parallel interface, legacy reader, compatibility alias, or identity fallback.

## Architectural fit

### DNA-53 — semantic fingerprint governance

Identity builders call RFC-0849 and the existing `@warpgogol/werkstatt/fingerprint` byte hash. They do not import `node:crypto`, `stableJsonHash`, or a second digest implementation. Explicit payload types make identity semantics reviewable at compile time and in fixtures.

### DNA-64 — engine/plugin/workshop boundary

Candidate, policy, evidence, decision, dossier, action-pack, authority, state, and identifier contracts are stack-agnostic engine types. The site plugin later supplies a profile and producers through the existing closed plugin hooks; this RFC imports no plugin and defines no site-specific quality rule.

### RFC-0849/RFC-0852 prerequisites

All identity payloads use an RFC-0849 branded canonical snapshot. `EvidenceEnvelopeV1.result.diagnostics` uses RFC-0852 `diagnosticSchema`; the complete diagnostics participate in `evidenceId`. No contract module duplicates either value domain.

## Design

### CLI surface

This RFC adds or changes no command. Verification uses existing package/governance commands:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt exec vitest run src/tests/certification-contracts.test.ts
pnpm --filter @warpgogol/werkstatt exec vitest run src/tests/certification-identity.pbt.test.ts
pnpm --filter @warpgogol/werkstatt build:check
pnpm exec werkstatt run werkstatt.autonomy.validate --json
pnpm exec werkstatt run fingerprint.usage.lint --json
```

### Schema policy

1. Zod schemas are the only runtime/type source. Every TypeScript contract is `z.infer`; no parallel `interface`, `as any`, `.passthrough()`, `.catchall()`, unknown-field stripping, or post-parse coercion is permitted.
2. Every top-level persisted/transmitted object carries its exact literal schema id. Closed vocabularies use enums or discriminated unions; unknown strings fail.
3. Digests use `sha256:<64 lowercase hex>`. Content hashes, operation IDs, producer-attempt IDs, authority sequences, schema IDs, and human-readable IDs are non-substitutable branded schemas.
4. UTC timestamps are strict RFC 3339 instants and remain observation/freshness facts, never evidence precedence. Authority sequence and immutable evaluation cut establish order.
5. Every collection/string/record has a named bound. The shared upper bounds are 1,000 resolved requirements/profile or decision, 10,000 admitted evidence records/evaluation cut, 1,000 action tasks/pack, and RFC-0849's canonical document limits. Narrower normative bounds are declared in the owning schema.
6. Parsers never default missing authority facts, strip unknown fields, translate legacy status, synthesize empty arrays as success, or convert infrastructure failure to pass.
7. Semantic paths are normalized before canonical snapshot creation to workspace-relative POSIX form and reject absolute paths, backslashes, `.`/`..`/empty components, NUL, URI schemes, credentials, and home expansion. Generic canonical JSON performs no path normalization.

### Contract inventory and traceability

| Module | Top-level contract families | Normative sources |
| --- | --- | --- |
| `identifiers.ts` | digest, schema id, candidate/evidence/decision/action/event/operation/attempt IDs, sequence, gate/channel/environment/status primitives | contracts vocabulary; ADR-003/004; AMD-006 |
| `candidate.ts` | `ReleaseCandidateV1`, build config, deployment plan, observed environment references | ADR-001/005; AMD-003/005 |
| `policy-bundle.ts` | immutable policy bundle, resolved requirements, producer/schema/rubric/toolchain/issuer manifests | ADR-002; AMD-005 |
| `evidence.ts` | `EvidenceEnvelopeV1`, result, Diagnostic[], payload descriptors, applicability, redaction, attestation, freshness, authority admission | ADR-003/004/012; AMD-003/004/006 |
| `dossier.ts` | dossier event union, manifest projection, incident, tombstone, event/root references | ADR-003/004/011/020; AMD-001/002/004/006 |
| `decisions.ts` | gate decision, `MainVerificationDecisionV1`, current-health decision, coverage and selected-evidence references | ADR-004/011/018; AMD-001/003/006 |
| `action-pack.ts` | canonical pack/task/anchor/dependency/remediation contracts | ADR-012 |
| `authority.ts` | issuer registry entry, attestation verification, signed decision/root, operation authorization, non-authoritative preview | AMD-004/005 |
| `state.ts` | artifact readiness and deployment-operation state/event contracts consumed by RFC-0851 | ADR-005/020; AMD-001/003/004 |

Implementation first creates a checked test fixture listing every normative top-level schema and amendment delta. A missing inventory row fails tests. This is the scope budget for the session: contract translation and identity properties only—no algorithms, storage, command handlers, or adapters.

### Identity builder contract

```ts
type IdentityBuildResultV1<TPayload> =
  | { ok: true; payload: TPayload; canonical: CanonicalJsonObjectV1; digest: Sha256Digest }
  | { ok: false; diagnostic: CertificationIdentityDiagnosticV1 };

function buildReleaseCandidateIdentityV1(input: ReleaseCandidateV1): IdentityBuildResultV1<ReleaseCandidateIdentityPayloadV1>;
function buildPolicyBundleIdentityV1(input: CertificationPolicyBundleV1): IdentityBuildResultV1<PolicyBundleIdentityPayloadV1>;
function buildEvidenceIdentityV1(input: EvidenceEnvelopeV1): IdentityBuildResultV1<EvidenceIdentityPayloadV1>;
function buildDossierEventIdentityV1(input: CertificationDossierEventV1): IdentityBuildResultV1<DossierEventIdentityPayloadV1>;
function buildGateDecisionIdentityV1(input: GateDecisionV1): IdentityBuildResultV1<GateDecisionIdentityPayloadV1>;
function buildMainVerificationIdentityV1(input: MainVerificationDecisionV1): IdentityBuildResultV1<MainVerificationIdentityPayloadV1>;
function buildHealthDecisionIdentityV1(input: CertificationHealthDecisionV1): IdentityBuildResultV1<HealthDecisionIdentityPayloadV1>;
function buildActionPackIdentityV1(input: CertificationActionPackV1): IdentityBuildResultV1<ActionPackIdentityPayloadV1>;
function buildDeploymentOperationEventIdentityV1(input: DeploymentOperationEventV1): IdentityBuildResultV1<DeploymentOperationEventIdentityPayloadV1>;
```

Each payload has its own strict schema and contains the literal payload schema id. The payload type makes excluded fields absent, not optional. A builder constructs a fresh object field-by-field; object spread from the source and “clone then delete” are forbidden. It then snapshots through RFC-0849 and returns the snapshot plus digest so callers do not canonicalize again.

If a top-level input carries its own ID, parsing validates shape and the builder recomputes it. A mismatch returns `CERT-IDENTITY-01`; no builder silently replaces a supplied ID. Pure payload builders read no clock, filesystem, environment, network, random source, plugin registry, or mutable global state and mutate none of their inputs.

### Required identity inclusion and exclusions

| Identity | Required inclusions | Explicit exclusions |
| --- | --- | --- |
| Candidate | system/release/source/content/artifact/build-config/deployment-plan/policy-bundle/toolchain identities | candidate self ID; observation timestamps; observed environment; secret values |
| Policy bundle | complete canonical policy/profile/resolved requirements/schema/rubric/risk/producer/toolchain/deployment/retention/issuer manifests | root self ID; physical storage locators; materialization timestamp |
| Evidence | complete canonical envelope including full Diagnostics, producer/binding/result/applicability/payload digests/redaction/attestation statement digest/authority admission facts | evidence self ID; physical payload locators; detached signature bytes |
| Dossier event | event kind/schema, candidate, authority sequence, previous event hash, complete event payload references | event self hash; physical storage location; projection timestamp |
| Decisions | candidate/policy/gate/cut/selected evidence/status/coverage/reasons/action-pack/root or prior-operation bindings required by the exact decision type | decision self ID; projection timestamp; detached signature bytes |
| Action pack | candidate/decision/tasks/anchors/dependencies/remediation class and verification commands in canonical order | action-pack self ID; rendered Markdown/HTML; storage location |
| Deployment event | candidate/channel/target/deployment plan/observed environment/authority operation/previous event/state/result facts | event self ID; provider log locator; projection timestamp; raw secrets |

The table is a review index, not permission to omit spec fields not summarized here. Normative snapshot field tables and accepted amendments remain authoritative. Included/excluded sensitivity tests mutate one field at a time: included changes must change the digest; excluded changes must not; unclassified fields fail strict parsing rather than being ignored.

### Candidate and environment separation

Candidate identity includes `buildConfigHash`, `deploymentPlanHash`, and `policyBundleRoot`. It does not include an observed channel environment, so the identical immutable artifact can move through Dev, Alt, and Main without becoming three candidates. Evidence and deployment events separately bind `environmentIdentityHash`; a plan/observation mismatch is `stale` in RFC-0850.

Secret values are never stored or directly hashed. Deployment/environment contracts permit only safe provider reference/version/presence metadata or a separately specified keyed non-reversible fingerprint. An unkeyed hash of a low-entropy secret is forbidden.

### Evidence Diagnostic and redaction closure

`EvidenceEnvelopeV1.result.diagnostics` uses the exact RFC-0852 schema and is included completely in `evidenceId`. `payloads[].locator` is a physical retrieval hint, is excluded from identity, and must contain no credentials. Payload digest/media type/size/role remain included.

The redaction object includes policy version, detected counts, and resolved flags required by the normative contract. Evidence parsing/identity construction fails when unresolved secret or PII exposure is reported, when a safe locator rule fails, or when Diagnostic data is not an accepted canonical object. The builder does not redact, truncate, or delete unsafe fields; producers must submit a corrected envelope.

### File system responsibilities

| Path | Responsibility |
| --- | --- |
| `packages/werkstatt/src/certification/contracts/identifiers.ts` | Non-substitutable primitives, enums, sequences, timestamps, safe semantic paths |
| `packages/werkstatt/src/certification/contracts/candidate.ts` | Candidate, build config, deployment plan, observed-environment reference contracts |
| `packages/werkstatt/src/certification/contracts/policy-bundle.ts` | Immutable policy bundle contracts |
| `packages/werkstatt/src/certification/contracts/evidence.ts` | Evidence, result, Diagnostic, payload, redaction, attestation, admission contracts |
| `packages/werkstatt/src/certification/contracts/dossier.ts` | Event union, manifest projection, incident/tombstone/root-reference contracts |
| `packages/werkstatt/src/certification/contracts/decisions.ts` | Gate, Main verification, and current-health decision contracts |
| `packages/werkstatt/src/certification/contracts/action-pack.ts` | Action pack/task/anchor/dependency contracts |
| `packages/werkstatt/src/certification/contracts/authority.ts` | Issuer, attestation, authorization, verification, preview-authority contracts |
| `packages/werkstatt/src/certification/contracts/state.ts` | Artifact/deployment-operation state/event contracts consumed by RFC-0851 |
| `packages/werkstatt/src/certification/contracts/index.ts` | Deliberate internal contract barrel; no I/O or algorithms |
| `packages/werkstatt/src/certification/identity.ts` | Explicit payload schemas/builders and digest functions |
| `packages/werkstatt/src/certification/index.ts` | Deliberate public exports needed by known CERT nodes |
| `packages/werkstatt/src/tests/certification-contracts.test.ts` | Traceability inventory and positive/negative/limit fixtures |
| `packages/werkstatt/src/tests/certification-identity.pbt.test.ts` | Included/excluded sensitivity, permutation, immutability, and mismatch properties |
| `packages/werkstatt/package.json` | Explicit `@warpgogol/werkstatt/certification` public subpath |

The main package barrel does not expose internal helpers accidentally. Files remain below the repository warning threshold; if one contract module exceeds it, split by normative object family without changing public ownership.

### Failure contract

| Rule                     | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `CERT-SCHEMA-01`         | strict contract parse failed, including unknown/legacy fields |
| `CERT-IDENTITY-01`       | supplied self identity differs from recomputed identity       |
| `CERT-PATH-01`           | semantic path/locator is unsafe or non-canonical              |
| `CERT-REDACTION-01`      | evidence reports or contains unresolved secret/PII exposure   |
| `CERT-CONTRACT-LIMIT-01` | a contract-specific collection/string bound exceeded          |
| RFC-0849 failure code    | explicit identity payload cannot be snapshotted canonically   |
| RFC-0852 failure code    | embedded Diagnostic is invalid, unsafe, or oversized          |

Explicit schema `.parse()` may throw Zod errors. Exported recovery/admission helpers use `safeParse` and discriminated typed failures. Identity builders never log or throw for domain data. Failure messages are bounded, omit rejected values, absolute paths, credentials, complete evidence payloads, and arbitrary producer output, and expose stable structured paths/reason codes.

Required contract failures have zero suppression and zero intended false positives. A confirmed schema/identity defect is corrected through an accepted spec amendment/RFC and creates a new version or identity as required. Callers may not catch it and synthesize pass, strip a field, use `stableJsonHash`, or retry with a permissive schema.

## Rollout

1. Build the normative traceability inventory and identifier/primitives module with negative fixtures.
2. Implement candidate and policy-bundle schemas, then their explicit identity payloads/properties.
3. Implement evidence and dossier schemas, including Diagnostic/redaction/authority-order fields and identity properties.
4. Implement decision, action-pack, authority, and state schemas in dependency order with amendment fixtures.
5. Add all remaining explicit identity builders and field-by-field included/excluded sensitivity properties.
6. Add the public subpath, source-boundary/autonomy/usage-lint tests, exact agent/Compass updates, and run the full validation set.

Each step leaves `@warpgogol/werkstatt` compiling. This session performs no algorithm, persistence, command, plugin, deployment, or provider work. RFC-0850 and RFC-0851 can begin only after this RFC is implemented.

## Alternatives considered

### Combine this work back into RFC-0849

Rejected by semantic audit and operator grilling. Permanent canonical bytes and a complete domain schema inventory are separate independently verifiable execution boundaries.

### Start with TypeScript interfaces and add Zod later

Rejected: storage and authority consumers would begin from unenforced shapes and parallel definitions would drift.

### Generate identities by deleting excluded fields

Rejected: a newly added normative field could be omitted silently. Fresh allow-listed payload construction plus strict payload schemas makes review and tests fail closed.

### Permit the site plugin to own certification schemas

Rejected: core storage, authority, evaluation, and deployment would depend on one stack plugin, violating DNA-64.

### Exclude Diagnostics or redaction from evidence identity

Rejected: material evidence meaning/safety could change without changing evidence ID. Only physical locators and detached signature bytes are excluded.

## Risks

- **Large schema inventory:** mitigated by a checked normative traceability fixture, dependency-ordered modules, and no algorithm/I/O scope.
- **Amendment omission:** mitigated by explicit AMD-001/003/004/005/006 fixtures and inventory rows that fail when absent.
- **Permanent identity mistake:** mitigated by strict payload schemas, field-by-field sensitivity properties, RFC-0849 vectors, and stop-on-disagreement.
- **Secret/PII leakage:** mitigated by RFC-0852 safe Diagnostics, envelope redaction closure, safe locator schemas, negative fixtures, and no raw-secret hash.
- **Type/schema drift:** mitigated by `z.infer`, strict schemas, no parallel interfaces, and public source-boundary tests.
- **Agent scope creep:** mitigated by one explicit contract inventory and prohibition on evaluation, state cutover, storage, command, and plugin work.

## Acceptance criteria

- [x] The checked traceability inventory covers every CERT-001 top-level object and every AMD-001/003/004/005/006 delta; each has one strict schema, inferred type, literal schema id, bounds, and positive/negative fixtures. (evidence: packages/werkstatt/src/certification/contracts/index.ts:1-130)
- [x] Identifier schemas make digests, content IDs, operation/attempt IDs, authority sequences, timestamps, and human IDs non-substitutable; unknown/legacy vocabulary fails without coercion. (evidence: packages/werkstatt/src/certification/contracts/identifiers.ts:1-95)
- [x] Every listed identity has a dedicated strict payload schema and fresh allow-list builder; no clone/delete helper, generic hash, object spread from source, or parallel interface exists. (evidence: packages/werkstatt/src/certification/identity.ts:1-310)
- [x] Included/excluded field sensitivity properties cover candidate, policy bundle, evidence, dossier event, all decision kinds, action pack, and deployment-operation event. (evidence: packages/werkstatt/src/tests/certification-identity.pbt.test.ts:280-480)
- [x] Candidate identity separates build/deployment-plan/policy identity from observed environment identity and never stores or directly hashes raw secret values. (evidence: packages/werkstatt/src/certification/identity.ts:46-70)
- [x] Evidence identity includes complete RFC-0852 Diagnostics, redaction, payload digests, binding, producer, result, applicability, attestation statement, and authority admission facts while excluding only declared physical/detached fields. (evidence: packages/werkstatt/src/certification/identity.ts:100-140)
- [x] Every identity payload snapshots through RFC-0849 and hashes through the engine fingerprint owner; certification source contains no `stableJsonHash`, `node:crypto`, plugin import, clock, filesystem, network, or environment read. (evidence: packages/werkstatt/src/certification/identity.ts:1-10)
- [x] `@warpgogol/werkstatt/certification` is an explicit deliberate public subpath and the main barrel exposes no internal helper accidentally. (evidence: packages/werkstatt/package.json:330-333)
- [x] `packages/AGENTS.md` and `packages/werkstatt/AGENTS.md` document engine ownership, strict-schema-only types, explicit identity builders, redaction closure, bounds, and no compatibility path. (evidence: packages/werkstatt/AGENTS.md:124-140)
- [x] `docs/technology.xml`, `docs/knowledge-graph.xml`, and `docs/source-markup.xml` describe the public source boundary; verification evidence records explicit no-change rationales for remaining root Compass files. (evidence: docs/technology.xml, docs/knowledge-graph.xml, docs/source-markup.xml)
- [x] Package tests/build checks, `werkstatt.autonomy.validate`, and `fingerprint.usage.lint` pass. (evidence: packages/werkstatt/src/tests/certification-contracts.test.ts:1-42, packages/werkstatt/src/tests/certification-identity.pbt.test.ts:1-28)
- [x] `rfc.acceptance.run --id RFC-0853`, `rfc.verification.emit --id RFC-0853`, and `rfc.validate --id RFC-0853 --json` pass before implementation stamping. (evidence: docs/rfcs/rfc-0853-define-strict-certification-contracts-and-identity-builders.md:277-291)

## Implementation notes for agents

- Implement only after RFC-0849 and RFC-0852 are `implemented` and this RFC is `accepted`; draft text grants no code authority.
- Read the complete certification snapshot and accepted amendments before editing. Build the traceability fixture first and implement from normative sources, not this RFC's summaries alone.
- Complete only strict contracts and identities in one session. Do not implement RFC-0850 algorithms, RFC-0851 state cutover, storage, commands, producers, adapters, authority execution, or deployment.
- Use strict Zod schemas as the only type sources; no parallel interfaces, `as any`, `.passthrough()`, unknown-field stripping, compatibility aliases, or legacy readers.
- Construct identity payloads field-by-field and test every included/excluded field. Never clone then delete or call a generic certification hash.
- Do not normalize generic JSON. Normalize only schema-declared semantic paths before RFC-0849 snapshot creation.
- Keep source files bounded and apply Compass source markup to every non-trivial module. Update `packages/AGENTS.md`, `packages/werkstatt/AGENTS.md`, `docs/technology.xml`, `docs/knowledge-graph.xml`, and `docs/source-markup.xml`; record exact no-change rationales for other root Compass files.
- If the spec is inconsistent, create an amendment; for invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0853 --reason "..." --invariant "DNA-N"`.
- Follow RFC-0230 for the public package/agent surface, RFC-0330 for verification evidence, RFC-0334 for invariant conflict escalation, and RFC-0476 for stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0853`, then `rfc.implement.stamp --id RFC-0853 --dry-run` and commit through the canonical flow.
