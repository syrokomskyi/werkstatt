---
id: RFC-0849
title: "Establish bounded canonical JSON identity bytes"
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
  - RFC-0364
  - RFC-0776
  - RFC-0848
  - RFC-0852
  - RFC-0853
dependsOn: []
batch: werkstatt-release-certification-cert-001
satisfies:
  - DNA-53
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
  - "Every certification identity is computed only from an engine-created bounded immutable CanonicalJsonValueV1 snapshot."
  - "Equivalent accepted values yield byte-identical canonical-json@1 output and SHA-256 digests independent of insertion order or caller-owned object mutation."
  - "Invalid values, unstable traversal, lone UTF-16 surrogates, and every hard-limit overflow fail explicitly before hashing and never produce partial bytes."
  - "Existing stableJsonHash consumers and fixtures remain byte-compatible and cannot be used accidentally for certification authority identities."
nonGoals:
  - "This RFC does not move or redefine Diagnostic; RFC-0852 owns that forward-only contract change."
  - "This RFC does not define certification candidate, evidence, decision, dossier, authority, action-pack, or state schemas and identity payloads; RFC-0853 owns them."
  - "This RFC does not normalize semantic paths, redact business data, persist values, sign digests, run producers, register commands, or change any legacy stable hash bytes."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/fingerprint/canonical-json.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/tests/canonical-json.pbt.test.ts"
---

# RFC-0849: Establish bounded canonical JSON identity bytes

## Context

The CERT-001 foundation needs one permanent byte representation for candidate, policy, evidence, decision, action-pack, dossier, and deployment-operation identities. The first RFC-0849 draft combined that representation with Diagnostic ownership and the complete certification schema inventory. Its semantic audit found that the implementation boundary was still too large and that `canonicalJsonBytesV1(value: unknown)` made impossible promises about hostile JavaScript objects.

The operator approved a second decomposition. This RFC now owns only the canonical identity substrate. RFC-0852 consumes its canonical object type for Diagnostic data; RFC-0853 consumes both RFCs to define certification schemas and explicit identity builders. RFC-0850 and RFC-0851 begin only after RFC-0853.

The normative certification sources are `werkstatt-release-certification/contracts.md`, `verification.md#core-invariants-and-required-properties`, ADR-003, ADR-004, and AMD-004/005/006. They require deterministic content identities but intentionally leave the engine byte implementation to CERT-001. RFC-0776 is also normative context: the old standalone `@warpgogol/fingerprint` package was deleted and the actual owner is the `@warpgogol/werkstatt/fingerprint` engine subpath.

## Problem

The existing generic stable JSON helper accepts a caller-owned graph whose admissible domain, mutation behavior, Unicode behavior, and resource bounds are not frozen as an authority contract. JavaScript cannot reliably detect every Proxy, and UTF-8 encoders may replace lone surrogates, allowing distinct strings to collapse to the same bytes. An 8 MiB output limit alone does not bound traversal, key sorting, or large arrays before emission.

If certification hashes such values directly, insertion order, accessors, class instances, Proxy traps, mutation during traversal, malformed Unicode, or resource exhaustion can make a permanent identity ambiguous or non-reproducible. Tightening the general helper globally would instead churn unrelated cache and platform identities.

## Decision

`@warpgogol/werkstatt/fingerprint` gains `werkstatt/canonical-json@1`, consisting of one recoverable snapshot boundary and total canonical byte/hash operations over an opaque accepted snapshot. Arbitrary input is never hashed directly. The snapshot builder performs the only traversal of caller-owned data, copies allowed JSON values into detached engine-owned structures, enforces all structural/Unicode/size limits, deep-freezes the result, and records an internal non-exported runtime brand.

The canonical byte format and its limits are permanent for `@1`. Any incompatible domain, ordering, escaping, number, or limit change requires a new canonical-json version and an explicit identity migration contract; it must not silently change `@1`.

## Architectural fit

### DNA-53 — one semantic fingerprint authority

Canonical bytes and hashes live under the existing engine fingerprint subpath and reuse its byte-level SHA-256 primitive. No certification module imports `node:crypto` or implements a private digest. Existing `stableJsonHash` remains unchanged for unrelated consumers but is forbidden for certification source by usage-lint fixtures.

Implementation must correct DNA-53's stale package name from deleted `@warpgogol/fingerprint` to the actual `@warpgogol/werkstatt/fingerprint` surface established by RFC-0776. This is a path correction, not a weakening or second fingerprint owner.

### Engine boundary

Canonical JSON is stack-agnostic engine infrastructure. It imports no plugin, schema package owned by a plugin, filesystem, network, clock, environment, or global mutable application state. Callers perform semantic validation and normalization before requesting a canonical snapshot.

## Design

### CLI surface

This RFC adds or changes no command. It is a package API verified with existing commands:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt exec vitest run src/tests/canonical-json.pbt.test.ts
pnpm --filter @warpgogol/werkstatt build:check
pnpm exec werkstatt run fingerprint.usage.lint --json
```

### Public contracts

```ts
declare const CANONICAL_JSON_V1: "werkstatt/canonical-json@1";

type CanonicalJsonFailureCodeV1 =
  | "CERT-CANONICAL-DOMAIN-01"
  | "CERT-CANONICAL-TRAVERSAL-01"
  | "CERT-CANONICAL-UNICODE-01"
  | "CERT-CANONICAL-LIMIT-01";

interface CanonicalJsonFailureV1 {
  ok: false;
  code: CanonicalJsonFailureCodeV1;
  path: readonly (string | number)[];
  message: string;
  limit?: "bytes" | "depth" | "nodes" | "object-keys" | "array-items" | "string-bytes" | "key-bytes";
  actual?: number;
  maximum?: number;
}

interface CanonicalJsonSuccessV1 {
  ok: true;
  value: CanonicalJsonValueV1;
}

type CanonicalJsonSnapshotResultV1 = CanonicalJsonSuccessV1 | CanonicalJsonFailureV1;
type CanonicalJsonObjectSnapshotResultV1 =
  | { ok: true; value: CanonicalJsonObjectV1 }
  | CanonicalJsonFailureV1;

function snapshotCanonicalJsonV1(input: unknown): CanonicalJsonSnapshotResultV1;
function snapshotCanonicalJsonObjectV1(input: unknown): CanonicalJsonObjectSnapshotResultV1;
function canonicalJsonBytesV1(value: CanonicalJsonValueV1): Uint8Array;
function canonicalJsonHashV1(value: CanonicalJsonValueV1): Sha256Digest;
```

`CanonicalJsonValueV1` and `CanonicalJsonObjectV1` are opaque exported types. Only the two snapshot functions can create a runtime-accepted value. The brand mechanism is module-private and identity-based (for example an internal `WeakSet`/`WeakMap`), not an exported symbol or structural property. The canonical byte function returns a defensive byte copy; a caller cannot mutate cached authoritative bytes.

Domain failures are returned, not thrown. Explicit Zod `.parse()` elsewhere retains ordinary Zod throw semantics, but recoverable package boundaries use `safeParse` or typed results. `canonicalJsonBytesV1` and `canonicalJsonHashV1` are total and non-throwing for values returned by the snapshot builder. A runtime call with a forged cast, plain lookalike, or Proxy wrapper that is absent from the private brand registry throws one non-recoverable `CanonicalJsonInvariantError` with code `CERT-CANONICAL-BRAND-01`; it never returns bytes or a digest. Authority code may call byte/hash functions only with a snapshot result from the same module instance and must not catch this programmer invariant as domain data.

### Snapshot trust boundary

The admissible source domain is `null`, booleans, finite JSON numbers other than negative zero, Unicode strings, dense arrays, and plain objects whose prototypes are exactly `Object.prototype` or `null` and whose own enumerable keys are strings. The builder rejects:

- `undefined`, functions, symbols, bigint, `NaN`, infinities, and negative zero;
- sparse/cyclic arrays, symbol keys, accessors, custom prototypes, and `toJSON` customization;
- Date, Map, Set, RegExp, Error, typed arrays, ArrayBuffer/DataView, Buffer, class instances, and host objects;
- property descriptor/key/value traversal that throws, changes the discovered shape during the single traversal, or cannot be copied consistently;
- every lone high or low UTF-16 surrogate in a value or key.

JavaScript cannot prove that an arbitrary object is not a Proxy. This RFC therefore does not promise Proxy detection. The snapshot builder catches trap failures and copies only the values observed during one bounded traversal into fresh null-prototype objects and fresh dense arrays. The canonical encoder never traverses the caller-owned source again. Certification identity builders in RFC-0853 accept only strict parsed engine values and immediately snapshot their explicit payloads; they do not treat a successful traversal of arbitrary untrusted code as authority provenance.

### Canonical byte format

1. Output is UTF-8 JSON with no byte-order mark, insignificant whitespace, trailing newline, comments, or duplicate keys.
2. Object keys are ordered by a pinned ascending UTF-16 code-unit comparator; locale, insertion order, and platform collation are forbidden.
3. Arrays preserve index order.
4. Strings use pinned JSON escaping for quotation mark, reverse solidus, and U+0000..U+001F. Other valid Unicode scalar content is emitted without NFC/NFD/NFKC/NFKD normalization. Lone surrogates never reach emission.
5. Numbers use the pinned ECMAScript JSON finite-number representation, with fixtures for integer boundaries, fractions, exponent thresholds, and round trips. Negative zero is rejected rather than normalized.
6. Re-snapshotting the accepted value and permuting object insertion order produces identical bytes. Permuting array items does not.

The implementation stores the schema literal alongside fixtures and exposes it for identity payload metadata. It does not prepend the schema literal to arbitrary payload bytes implicitly; RFC-0853 identity payloads include their own literal schema fields explicitly.

### Hard limits and complexity

| Dimension | Maximum |
|---|---:|
| Canonical UTF-8 document bytes | 8 MiB |
| Nesting depth | 64 |
| Total scalar/container nodes | 250,000 |
| Own keys in one object | 10,000 |
| Items in one array | 100,000 |
| UTF-8 bytes in one string value | 1 MiB |
| UTF-8 bytes in one object key | 1 KiB |

Every limit is enforced during snapshot traversal and again where emission could expose an implementation discrepancy. Overflow returns `CERT-CANONICAL-LIMIT-01` with the exact limit name, actual bounded counter, maximum, and bounded path. There is no truncation, partial snapshot, partial hash, streaming fallback, environment-configurable override, or warning mode.

For encoded bytes `B`, accepted nodes `N`, maximum simultaneously sorted keys `K`, and depth `D`, snapshot plus emission uses `O(B + N + K + D)` additional memory excluding the caller-owned source. Sorting is the only superlinear component: total time is `O(B + N + Σ(k_i log k_i))` across object key sets. The implementation must not retain a second hidden copy of the complete source graph in addition to the accepted snapshot and output bytes.

### File system responsibilities

| Path | Responsibility |
|---|---|
| `packages/werkstatt/src/fingerprint/canonical-json.ts` | Opaque types, bounded snapshot builder, pinned bytes, and hash delegation |
| `packages/werkstatt/src/fingerprint/index.ts` | Deliberate exports; no generic certification shortcut |
| `packages/werkstatt/src/tests/canonical-json.test.ts` | Exact byte fixtures, Unicode, numbers, domain, traversal, mutation, and limit boundaries |
| `packages/werkstatt/src/tests/canonical-json.pbt.test.ts` | Determinism, insertion permutation, round-trip, collision-oriented, and mutation properties |
| `packages/werkstatt/src/tests/fixtures/canonical-json-v1/**` | Frozen cross-runtime accepted/rejected vectors with schema/version metadata |
| `docs/architecture-dna.md` | Correct DNA-53 owner path and cite RFC-0776/RFC-0849 |
| `packages/werkstatt/AGENTS.md` | Require snapshot-before-hash and prohibit legacy stable hash for certification |

No implementation file reads a workspace path, URL, environment variable, clock, network, random source, locale, or plugin module.

### Failure and safety contract

Failure messages and paths are bounded: at most 512 UTF-8 bytes for `message`, at most 64 path segments, at most 256 UTF-8 bytes per string segment, with additional segments reported only as an omitted count. Messages never serialize rejected object values, getters, stack traces, secrets, absolute paths, or full input payloads.

Required canonical failures have zero suppression and zero intended false positives. A confirmed `@1` defect blocks identity production until corrected by a superseding/versioned contract; callers may not catch it and hash a fallback serialization. An advisory benchmark records time/memory trends, but deterministic fixtures and operation/limit assertions—not wall-clock thresholds—gate CI.

## Rollout

1. Implement the opaque snapshot/result types and all domain/brand negative fixtures.
2. Implement Unicode/key/number encoding with pinned byte vectors and cross-process reproduction tests.
3. Implement structural/output limits and the deterministic maximum-size fixture.
4. Add property tests for insertion permutations, mutation after snapshot, collision-oriented Unicode cases, and defensive byte copies.
5. Export the deliberate fingerprint API, add usage-lint cases, update DNA-53 and the engine AGENTS rule, then run the complete validation set.

Every step leaves `@warpgogol/werkstatt` compiling and existing stable-hash fixtures unchanged. No Diagnostic or certification schema work is permitted in this implementation session.

## Alternatives considered

### Canonicalize arbitrary `unknown` directly

Rejected: a public arbitrary-object traversal cannot guarantee absence of Proxy behavior or caller mutation. A detached branded snapshot gives the encoder a closed reproducible domain.

### Detect and reject every Proxy

Rejected: JavaScript provides no reliable general Proxy detector. The contract instead contains traps at the snapshot boundary and never re-traverses caller-owned data.

### Escape lone surrogates

Rejected: accepting non-scalar strings expands a permanent identity domain with little legitimate value and increases cross-runtime risk. Explicit rejection is simpler and collision-safe.

### Reuse or globally tighten `stableJsonHash`

Rejected: reuse leaves authority semantics implicit; global tightening changes unrelated cache/platform identities. The new versioned API isolates certification identity without compatibility churn.

### Enforce only byte/depth limits

Rejected: large arrays/key sets can consume traversal and sorting resources before final byte size is known. Structural limits make peak work deterministic.

## Risks

- **Permanent byte mistake:** mitigated by frozen cross-runtime vectors, exact numeric/Unicode edges, and a mandatory new version for incompatible change.
- **Forged type cast:** mitigated by a private runtime brand, authority-path tests, and no alternate generic hash entrypoint.
- **Hostile traversal:** mitigated by one bounded snapshot pass, trap handling, detached copies, no source re-traversal, and explicit refusal to promise Proxy detection.
- **Memory regression:** mitigated by structural counters, peak-complexity assertions, maximum fixtures, and no hidden full-graph copy.
- **Scope creep:** mitigated by RFC-0852/RFC-0853 dependencies and explicit prohibition on Diagnostic/schema/persistence work.
- **Agent confusion over stable hash:** mitigated by source usage lint and exact AGENTS.md ownership text.

## Acceptance criteria

- [ ] `snapshotCanonicalJsonV1`/`snapshotCanonicalJsonObjectV1` are the only creators of runtime-branded `CanonicalJsonValueV1`/`CanonicalJsonObjectV1`; they create detached deep-frozen values and return typed failures without logging or partial output.
- [ ] Forged casts, structural lookalikes, and Proxy wrappers fail with only `CERT-CANONICAL-BRAND-01` and can never produce authoritative bytes; valid branded snapshots never throw.
- [ ] Canonical byte/hash operations are total for accepted snapshots, return defensive bytes, reuse the engine byte hash, and do not traverse caller-owned source values.
- [ ] Exact fixtures pin object ordering, arrays, escaping, finite number boundaries, negative zero rejection, valid Unicode preservation, and lone-surrogate rejection.
- [ ] Domain fixtures reject every listed non-JSON/container/accessor/cycle/sparse/traversal case; mutation and Proxy-trap tests cannot alter an accepted snapshot's bytes.
- [ ] All seven hard limits are enforced without truncation or overrides and the maximum accepted/rejected fixtures verify `O(B + N + K + D)` memory accounting and key-sort complexity.
- [ ] Existing `stableJsonHash` fixtures are byte-identical and `fingerprint.usage.lint` rejects its use under certification source.
- [ ] DNA-53 names `@warpgogol/werkstatt/fingerprint`, cites RFC-0776/RFC-0849, and no second fingerprint owner is introduced.
- [ ] `packages/werkstatt/AGENTS.md` records snapshot-before-hash, versioning, limit, and no-fallback rules.
- [ ] `pnpm --filter @warpgogol/werkstatt test`, targeted property tests, `build:check`, and `fingerprint.usage.lint --json` pass.
- [ ] `rfc.acceptance.run --id RFC-0849`, `rfc.verification.emit --id RFC-0849`, and `rfc.validate --id RFC-0849 --json` pass before implementation stamping.

## Implementation notes for agents

- Implement only after `status: accepted`; draft text grants no code authority.
- Complete only this canonical JSON boundary in one session. Do not move Diagnostic, define certification contracts, add commands, persist data, sign values, or edit a site/workpiece.
- Treat the limits and byte fixtures as permanent `@1` protocol, not tunable defaults. Do not add environment flags, permissive modes, truncation, fallback hashing, or compatibility aliases.
- Do not claim to detect all Proxies. Snapshot once into engine-owned values, catch traversal failures, and never re-read the source graph while emitting bytes.
- Do not normalize Unicode or paths inside the generic canonicalizer. Semantic builders normalize allowed paths before snapshot creation.
- Use existing engine fingerprint primitives; do not import `node:crypto` into the canonical module.
- Read RFC-0776 and the current fingerprint implementation before editing DNA-53 or exports.
- Update `packages/werkstatt/AGENTS.md`, `docs/technology.xml`, `docs/knowledge-graph.xml`, and `docs/source-markup.xml` where ownership/source contracts change; record explicit no-change rationales for `packages/AGENTS.md`, `docs/requirements.xml`, `docs/development-plan.xml`, `docs/verification-plan.xml`, and `docs/styling.xml` in verification evidence.
- If the certification spec is inconsistent, create an amendment; for an invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0849 --reason "..." --invariant "DNA-N"`.
- Follow RFC-0230 for the package/agent surface, RFC-0330 for verification evidence, RFC-0334 for invariant conflict escalation, and RFC-0476 for verified stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0849`, then `rfc.implement.stamp --id RFC-0849 --dry-run` and commit through the canonical flow.
