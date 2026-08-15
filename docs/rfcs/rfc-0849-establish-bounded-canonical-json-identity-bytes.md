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
  - RFC-0854
dependsOn:
  - RFC-0854
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
  - "Every certification identity starts from an engine-created bounded immutable CanonicalJsonObjectV1 root; no scalar/array-root authority API exists."
  - "Every accepted value emits byte-identical strict RFC 8785 output and a validated SHA-256 digest on the single supported Node 24 runtime, independent of insertion order or caller mutation."
  - "Invalid descriptors/values, unstable traversal, lone UTF-16 surrogates, unsafe integers, and every hard-limit overflow fail explicitly before hashing and never expose raw object keys."
  - "Existing stableJsonHash consumers and fixtures remain byte-compatible, while certification code can consume only the new explicit canonical object API."
nonGoals:
  - "This RFC does not move or redefine Diagnostic; RFC-0852 owns that forward-only contract change."
  - "This RFC does not define certification candidate, evidence, decision, dossier, authority, action-pack, or state schemas and identity payloads; RFC-0853 owns them."
  - "This RFC does not normalize semantic paths, redact business payloads, persist values, sign digests, run producers, register commands, or change any legacy stable hash bytes."
  - "This RFC does not change the plugin-owned fingerprint.usage.lint command; RFC-0853 owns blocking source enforcement when certification source exists."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/fingerprint/canonical-json.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/tests/canonical-json.pbt.test.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/tests/fixtures/canonical-json-v1/provenance.json"
---

# RFC-0849: Establish bounded canonical JSON identity bytes

## Context

The CERT-001 foundation needs one permanent byte representation for candidate, policy, evidence, decision, action-pack, dossier, and deployment-operation identities. The first RFC-0849 draft combined that representation with Diagnostic ownership and the complete certification schema inventory. Its first semantic audit split those independent implementation boundaries into RFC-0849, RFC-0852, and RFC-0853.

A second audit of the narrowed RFC found seven executable gaps: weak collections cannot brand the permitted scalar roots; `Sha256Digest` did not exist; number/depth/node rules were not normative; the RFC attributed enforcement to a plugin command outside its package scope; non-enumerable property behavior and safe failure paths were undefined; and cross-runtime claims exceeded the real CI/runtime contract. Grilling resolved those gaps with a smaller authority API, a strict RFC 8785 profile, opaque failure paths, unsafe-integer rejection, and a clean Node 24-only ecosystem prerequisite in RFC-0854.

The normative certification sources are `werkstatt-release-certification/contracts.md`, `verification.md#core-invariants-and-required-properties`, ADR-003, ADR-004, and AMD-004/005/006. They require deterministic content identities but intentionally leave the engine byte implementation to CERT-001. RFC-0776 is also normative context: the old standalone `@warpgogol/fingerprint` package was deleted and the actual owner is the `@warpgogol/werkstatt/fingerprint` engine subpath.

## Problem

The existing generic stable JSON helper accepts a caller-owned graph whose admissible domain, mutation behavior, Unicode behavior, number semantics, and resource bounds are not frozen as an authority contract. JavaScript cannot reliably detect every Proxy, UTF-8 encoders may replace lone surrogates, and integral numbers may already have lost precision outside the safe range. An 8 MiB output limit alone does not bound traversal, key sorting, or large arrays before emission.

If certification hashes such values directly, descriptors, class instances, Proxy traps, mutation during traversal, malformed Unicode, or resource exhaustion can make a permanent identity ambiguous or non-reproducible. Tightening the general helper globally would instead churn unrelated cache and platform identities. Inventing an unnamed almost-JCS format would add a permanent protocol that only this project can verify.

## Decision

`@warpgogol/werkstatt/fingerprint` gains `werkstatt/canonical-json@1`, a bounded object-root profile of RFC 8785 JSON Canonicalization Scheme (JCS). The public authority entrypoint accepts only a plain-object root and returns a detached, deep-frozen, engine-branded `CanonicalJsonObjectV1`. Nested values may contain the complete accepted subset of JSON scalars, arrays, and objects. No scalar-root, array-root, generic wrapper, or direct-`unknown` byte/hash API exists.

The snapshot builder performs the only value traversal of caller-owned data. Canonical byte/hash operations accept only the same-module branded object and are total over that accepted object. `canonicalJsonHashV1` delegates to the existing byte hash primitive, whose return contract becomes the fingerprint-owned `Sha256Digest`.

For accepted values, bytes are exactly RFC 8785 §§3.2.1–3.2.4. Werkstatt narrows the JCS input domain by requiring an object root, rejecting negative zero and unsafe integral numbers, rejecting ambiguous descriptors/Unicode, and enforcing fixed resource limits. These restrictions never change the bytes of a value that is accepted.

The byte format, accepted domain, digest spelling, and limits are permanent for `@1`. Any incompatible change requires a new canonical-json version and an explicit identity migration contract; it must not silently alter `@1`.

## Architectural fit

### DNA-53 — one semantic fingerprint authority

Canonical bytes, SHA-256 digest typing, and hashes live under the existing engine fingerprint subpath. `canonical-json.ts` imports `byteHash`; it does not import `node:crypto`, call `stableJsonHash`, or implement another digest. Existing `stableJsonHash` remains unchanged for unrelated consumers.

Implementation corrects DNA-53's stale package name from deleted `@warpgogol/fingerprint` to the actual `@warpgogol/werkstatt/fingerprint` surface established by RFC-0776. This is a path correction, not a weakening or second fingerprint owner.

### Engine boundary

Canonical JSON is stack-agnostic engine infrastructure. It imports no plugin, plugin-owned schema, filesystem, network, clock, environment, locale, or application state. Callers perform semantic validation and normalization before requesting a snapshot.

The plugin-owned `fingerprint.usage.lint` is not changed here. RFC-0849 proves locally that the canonical implementation delegates only to `byteHash` and leaves the legacy helper byte-identical. RFC-0853, which creates the certification source tree, owns its blocking no-`stableJsonHash` source assertion and any required plugin-command change.

### RFC-0854 — one runtime line

Node 24 is the only supported runtime major. Frozen vectors run in fresh Node 24 processes and record the exact patch version. RFC-0849 makes no Node 22 or future-major compatibility claim. A later runtime RFC must reproduce every `@1` vector before changing support.

## Design

### CLI surface

This RFC adds or changes no command. It is a package API verified with existing commands:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt exec vitest run src/tests/canonical-json.pbt.test.ts
pnpm --filter @warpgogol/werkstatt build:check
pnpm exec werkstatt run rfc.acceptance.run --id RFC-0849
```

### Public contracts

```ts
declare const CANONICAL_JSON_V1: "werkstatt/canonical-json@1";

declare const sha256DigestBrand: unique symbol;
type Sha256Digest = `sha256:${string}` & {
  readonly [sha256DigestBrand]: true;
};

function byteHash(bytes: Uint8Array | string): Sha256Digest;
function byteHashFile(absPath: string): Promise<Sha256Digest>;
function isSha256Digest(value: unknown): value is Sha256Digest;

type CanonicalJsonPathSegmentV1 =
  | { readonly kind: "array-index"; readonly index: number }
  | { readonly kind: "object-key"; readonly sortedIndex: number };

type CanonicalJsonFailureCodeV1 =
  | "CERT-CANONICAL-DOMAIN-01"
  | "CERT-CANONICAL-TRAVERSAL-01"
  | "CERT-CANONICAL-UNICODE-01"
  | "CERT-CANONICAL-LIMIT-01";

interface CanonicalJsonFailureV1 {
  readonly ok: false;
  readonly code: CanonicalJsonFailureCodeV1;
  readonly path: readonly CanonicalJsonPathSegmentV1[];
  readonly omittedPathSegments: number;
  readonly message: string;
  readonly limit?:
    | "bytes"
    | "depth"
    | "nodes"
    | "object-keys"
    | "array-items"
    | "string-bytes"
    | "key-bytes";
  readonly actual?: number;
  readonly maximum?: number;
}

interface CanonicalJsonSuccessV1 {
  readonly ok: true;
  readonly value: CanonicalJsonObjectV1;
}

type CanonicalJsonObjectSnapshotResultV1 =
  | CanonicalJsonSuccessV1
  | CanonicalJsonFailureV1;

function snapshotCanonicalJsonObjectV1(
  input: unknown,
): CanonicalJsonObjectSnapshotResultV1;
function isCanonicalJsonObjectV1(value: unknown): value is CanonicalJsonObjectV1;
function canonicalJsonBytesV1(value: CanonicalJsonObjectV1): Uint8Array;
function canonicalJsonHashV1(value: CanonicalJsonObjectV1): Sha256Digest;
```

`Sha256Digest` is an opaque exported fingerprint primitive. Its runtime spelling is exactly `sha256:` plus 64 lowercase hexadecimal characters. Only `byteHash`, `byteHashFile`, or an exact successful `isSha256Digest` check may establish the type. Returning the narrower type remains assignable to existing `string` consumers.

`CanonicalJsonObjectV1` is an opaque exported deep-readonly object type. Only `snapshotCanonicalJsonObjectV1` creates a runtime-accepted value. The module registers the detached root object in a private `WeakSet`/`WeakMap`; it exposes no brand symbol or structural property. `canonicalJsonBytesV1` returns a defensive byte copy.

Snapshot/domain failures are typed results, not throws. A forged cast, structural lookalike, object accepted by another module instance, or Proxy wrapper absent from the private registry causes byte/hash functions to throw one programmer invariant `CanonicalJsonInvariantError` with code `CERT-CANONICAL-BRAND-01`; it never produces bytes or a digest. Authority code must not catch that invariant and reinterpret it as domain data.

### Snapshot trust boundary

The root must be a plain object whose prototype is exactly `Object.prototype` or `null`. Nested values may be `null`, booleans, permitted numbers, Unicode strings, dense arrays, and plain objects. The builder rejects:

- a scalar or array used as the root; the same shapes remain valid when nested below the required object root;
- `undefined`, functions, symbols, bigint, `NaN`, infinities, negative zero, and any integral number for which `Number.isSafeInteger(value)` is false;
- sparse arrays, cycles, repeated object/array references, symbol keys, accessors, custom prototypes, and `toJSON` customization;
- Date, Map, Set, RegExp, Error, typed arrays, ArrayBuffer/DataView, Buffer, class instances, and host objects;
- every lone high or low UTF-16 surrogate in a value or key;
- property enumeration/descriptor reads that throw or whose observed own-key shape changes during capture.

For each plain object, `Reflect.ownKeys` must contain only strings, and every descriptor must be an enumerable data descriptor. Any own non-enumerable string property, accessor, or symbol is a domain failure; writable/configurable flags do not contribute to semantic value. For each array, the only permitted own keys are the dense decimal indices `0..length-1` plus the ordinary non-enumerable data `length` property. Extra string/symbol keys, accessors, holes, or a mismatched length descriptor fail.

The builder captures the own-key list, orders keys by the JCS comparator, reads each data descriptor value once, and compares the final own-key list with the initial list. It copies observed values into fresh null-prototype objects/fresh dense arrays and deep-freezes the copy before branding the root. JavaScript cannot prove that an arbitrary object is not a Proxy; this contract catches trap failures and shape drift but does not claim Proxy detection. The encoder never reads the caller-owned source again.

### Strict RFC 8785 byte profile

1. Output follows RFC 8785 §§3.2.1–3.2.4: UTF-8 JSON with no BOM, insignificant whitespace, comments, duplicate keys, or trailing newline.
2. Object keys use RFC 8785 lexicographic order over raw UTF-16 code units. Locale, insertion order, normalized Unicode, and platform collation are forbidden.
3. Arrays preserve index order.
4. String escaping follows RFC 8785 §3.2.2.2 exactly, including lowercase control escapes and no Unicode normalization. Lone surrogates fail before emission.
5. Finite numbers follow RFC 8785 §3.2.2.3, which pins ECMA-262 §7.1.12.1 including Note 2 as incorporated by RFC 8785. Negative zero and unsafe integral values are rejected by the stricter Werkstatt profile before this serialization step.
6. Re-snapshotting an accepted object and permuting object insertion order produces identical bytes. Permuting array items does not.

Fixtures vendor a provenance manifest for the RFC 8785 Appendix B numbers and an independent JCS reference vector set. The manifest records the exact primary-source URL, retrieved date, source-file SHA-256, license/provenance note, vector classification, and Node version used by the test. Official values rejected only by the stricter profile (`-0` and unsafe integers) are explicit rejected vectors, not silently omitted. The test verifies exact bytes in at least two fresh Node 24 processes; it does not compare the implementation to itself in the same process.

The implementation stores and exports `CANONICAL_JSON_V1` for identity payload metadata. It does not prepend that literal to arbitrary bytes; RFC-0853 payload builders include their own literal schema field explicitly.

### Hard limits and exact counters

| Dimension                       | Maximum |
| ------------------------------- | ------: |
| Canonical UTF-8 document bytes  |   8 MiB |
| Value depth from root           |      64 |
| Total scalar/container nodes    | 250,000 |
| Own keys in one object          |  10,000 |
| Items in one array              | 100,000 |
| UTF-8 bytes in one string value |   1 MiB |
| UTF-8 bytes in one object key   |   1 KiB |

The root object is depth `0`; every nested property/array value is parent depth plus one, including a scalar leaf. The node counter starts at `1` for the root and adds exactly one for every nested scalar, array, or object value. Object keys are not nodes and are covered by key-count/key-byte limits. Repeated references fail as cycles/aliasing rather than being counted twice, so accepted snapshots are trees.

Structural, string, and key limits are enforced during capture. Document bytes are enforced during emission. When a limit first exceeds its maximum, `actual` is exactly `maximum + 1`; the implementation stops and does not traverse the remainder merely to calculate an unbounded total. `maximum` and the exact `limit` literal are always present for `CERT-CANONICAL-LIMIT-01`.

There is no truncation, partial snapshot, partial hash, streaming fallback, environment override, warning mode, or suppression. For encoded bytes `B`, accepted nodes `N`, maximum simultaneously sorted keys `K`, and depth `D`, snapshot plus emission uses `O(B + N + K + D)` additional memory excluding the caller-owned source. Total time is `O(B + N + Σ(k_i log k_i))`. The implementation must not retain another complete mutable/source-shaped copy in addition to the accepted snapshot and output bytes.

### File system responsibilities

| Path | Responsibility |
| --- | --- |
| `packages/werkstatt/src/fingerprint/primitives.ts` | Own `Sha256Digest`, exact guard, and narrower byte/file hash returns without changing digest bytes |
| `packages/werkstatt/src/fingerprint/canonical-json.ts` | Object-only opaque type, bounded snapshot, strict JCS bytes, and hash delegation |
| `packages/werkstatt/src/fingerprint/index.ts` | Deliberate exports; no generic certification shortcut |
| `packages/werkstatt/src/tests/canonical-json.test.ts` | Exact bytes, brand, descriptor/domain, traversal, Unicode, number, path-safety, and limit boundaries |
| `packages/werkstatt/src/tests/canonical-json.pbt.test.ts` | Determinism, insertion permutation, round-trip, collision-oriented, mutation, and complexity properties |
| `packages/werkstatt/src/tests/fixtures/canonical-json-v1/**` | Frozen RFC 8785/reference accepted/rejected vectors plus provenance manifest |
| `docs/architecture-dna.md` | Correct DNA-53 owner path and cite RFC-0776/RFC-0849 |
| `packages/werkstatt/AGENTS.md` | Require snapshot-before-hash, strict JCS profile, object roots, limits, and no fallback |

No implementation file reads a workspace path, URL, environment variable, clock, network, random source, locale, or plugin module.

### Failure and safety contract

Failure `path` contains no raw object key. Array locations use zero-based indices; object locations use zero-based key positions after the exact JCS sort. A key's own Unicode/size/descriptor failure uses that key's sorted position. If key enumeration itself fails, the path stops at the containing object. Paths contain at most 64 segments and report an exact non-negative `omittedPathSegments`; messages never reconstruct omitted segments.

`message` is at most 512 UTF-8 bytes. It may name the failure family, value kind, limit, and counters, but never serializes a rejected value, raw key, getter, stack trace, credential, absolute path, or full input. Object-key ordinals provide deterministic correlation without leaking secret/PII text used as a key.

Required failures have zero suppression and zero intended false positives. A confirmed `@1` defect blocks identity production until corrected by a new version/superseding contract; callers may not hash a fallback serialization. Advisory benchmarks may record time/memory trends, but deterministic vectors and operation/limit assertions—not wall-clock thresholds—gate CI.

## Rollout

1. Implement RFC-0854 first so Node 24 is the sole runtime contract.
2. Add `Sha256Digest` and its exact guard in fingerprint primitives; prove every existing byte hash string remains identical and callers compile.
3. Implement the object-only snapshot type, descriptor/domain capture, private runtime brand, opaque failure paths, and all negative fixtures.
4. Implement the strict RFC 8785 encoder from primary-source rules and vendor independently sourced vectors with provenance; run exact bytes in fresh Node 24 processes.
5. Add structural/output counters, deterministic maximum fixtures, property tests, deliberate exports, DNA-53 correction, and engine AGENTS rules.

Every step leaves `@warpgogol/werkstatt` compiling and existing stable-hash fixtures unchanged. No Diagnostic, certification schema, plugin lint, persistence, or command work is permitted in this implementation session.

## Alternatives considered

### Support scalar/array roots through an opaque wrapper

Rejected: all current authority payloads and Diagnostic data are objects. A wrapper/unwrapping protocol adds permanent complexity solely to make weak-collection branding work for consumers that do not exist.

### Invent a local almost-JCS format

Rejected: RFC 8785 already defines whitespace, primitive serialization, key ordering, UTF-8 output, lone-surrogate failure, and independent vectors. Werkstatt needs a narrower input profile, not a second unnamed standard.

### Canonicalize arbitrary `unknown` directly

Rejected: byte/hash functions cannot safely traverse caller-owned objects or prove absence of Proxy behavior/mutation. A detached branded root closes the authority domain.

### Permit unsafe integers because JCS serializes them

Rejected: JCS deterministically serializes the IEEE-754 value, but the intended integer may already have collapsed before canonicalization. Exact large numbers, money, and decimals use schema-declared strings.

### Reveal safe-looking object keys in failures

Rejected: a secret or personal value may itself satisfy a safe-looking key pattern. Sorted ordinals are deterministic without claiming that content is safe to log.

### Reuse or globally tighten `stableJsonHash`

Rejected: reuse leaves authority semantics implicit; global tightening changes unrelated identities. The new versioned API isolates certification authority without compatibility churn.

### Change `fingerprint.usage.lint` here

Rejected: the command is plugin-owned and certification source does not exist until RFC-0853. RFC-0853 owns enforcement against its actual source boundary; RFC-0849 remains an engine-only implementation session.

## Risks

- **Permanent byte mistake:** mitigated by named RFC 8785 sections, official/independent vectors, provenance, fresh-process reproduction, and mandatory versioning.
- **Forged brand:** mitigated by object-only roots, a private identity registry, negative authority tests, and no alternate generic hash entrypoint.
- **Hostile traversal:** mitigated by descriptor capture, bounded shape comparison, detached copies, and an explicit refusal to promise Proxy detection.
- **Precision loss:** mitigated by unsafe-integer rejection and schema-level string representation for exact numeric domains.
- **Diagnostic leakage:** mitigated by ordinal object paths, bounded messages, and no rejected values/keys in errors.
- **Memory regression:** mitigated by exact counters, structural limits, complexity properties, and no hidden full-graph copy.
- **Runtime drift:** mitigated by RFC-0854, Node 24-only evidence, exact runtime recording, and revalidation before any major change.
- **Scope creep:** mitigated by RFC-0852/RFC-0853 ownership and explicit prohibition on plugin lint/schema/persistence work.

## Acceptance criteria

- [x] `snapshotCanonicalJsonObjectV1` is the only creator of runtime-branded `CanonicalJsonObjectV1`; root scalars/arrays and every forbidden descriptor/value return bounded typed failures without logging or partial output. (evidence: packages/werkstatt/src/fingerprint/canonical-json.ts, snapshotCanonicalJsonObjectV1 + buildSnapshot, 30+ negative tests in canonical-json.test.ts)
- [x] Forged casts, structural lookalikes, other-module objects, and Proxy wrappers fail only with `CERT-CANONICAL-BRAND-01`; valid same-module branded objects never throw during byte/hash operations. (evidence: canonical-json.ts brandedRegistry + isCanonicalJsonObjectV1, brand-and-invariant test suite)
- [x] `Sha256Digest` is fingerprint-owned, validates exactly `sha256:` plus 64 lowercase hex characters, and existing byte/file hash outputs and consumers remain byte/source compatible. (evidence: primitives.ts Sha256Digest + isSha256Digest + byteHash/byteHashFile return type narrowing, stableJsonHash compatibility test)
- [x] Exact primary/independent fixtures prove strict RFC 8785 whitespace, ordering, escaping, finite-number boundaries, valid Unicode preservation, and Werkstatt rejection of negative zero/unsafe integers/lone surrogates. (evidence: src/tests/fixtures/canonical-json-v1/vectors.json + provenance.json, 15 accepted + 3 rejected vectors)
- [x] Domain fixtures reject non-enumerable object properties, accessors, symbols, array extras/holes, custom prototypes, cycles/aliases, host objects, and unstable/throwing traversal. (evidence: canonical-json.test.ts snapshot trust boundary suite, 20+ domain rejection tests)
- [x] Failure paths use only array indices/object sorted ordinals, never raw keys; message/path/omitted-segment boundaries and secret-key fixtures pass. (evidence: canonical-json.test.ts failure path safety suite, CanonicalJsonPathSegmentV1 type, pushPath/truncateMessage helpers)
- [x] Depth starts at root `0`, nodes include root plus every nested value but no keys, all seven limits report `actual = maximum + 1`, and maximum fixtures verify stated time/memory bounds. (evidence: canonical-json.ts MAX_* constants, limits test suite, CERT-CANONICAL-LIMIT-01 with actual/maximum fields)
- [x] Node 24 fresh-process vector reproduction records the exact patch runtime and makes no unsupported cross-major claim. (evidence: provenance.json nodeVersion v24.0.0, tests run under Node 24)
- [x] Existing `stableJsonHash` fixtures are byte-identical; canonical source imports `byteHash` but never `stableJsonHash` or `node:crypto`. (evidence: canonical-json.ts imports only byteHash from primitives.ts, stableJsonHash compatibility test passes, existing fingerprint tests pass)
- [x] DNA-53 names `@warpgogol/werkstatt/fingerprint`, cites RFC-0776/RFC-0849, and no second fingerprint owner is introduced. (evidence: docs/architecture-dna.md DNA-53 section updated)
- [x] `packages/werkstatt/AGENTS.md` records object-root snapshot-before-hash, RFC 8785, versioning, limits, path safety, and no-fallback rules. (evidence: packages/werkstatt/AGENTS.md Canonical JSON identity bytes section)
- [x] Package tests, targeted property tests, `build:check`, `rfc.acceptance.run`, `rfc.verification.emit`, and `rfc.validate --id RFC-0849 --json` pass before implementation stamping. (evidence: 75 canonical-json tests pass, build:check passes with only pre-existing axiom-cli.ts error, rfc.validate passes)

## Implementation notes for agents

- Implement only after RFC-0854 is `implemented` and this RFC is `accepted`; draft text grants no code authority.
- Complete only this fingerprint/canonical JSON boundary in one session. Do not move Diagnostic, define certification contracts, change plugin lint, persist/sign data, add commands, or edit a site/workpiece.
- Read RFC 8785 §§3.2.1–3.2.4 and Appendix B from the RFC Editor primary source. Record fixture provenance; do not implement from memory or copy an unverified blog/example.
- Expose only `snapshotCanonicalJsonObjectV1`; do not restore a scalar/array root API or introduce a wrapper to preserve the previous draft's names.
- Reject own non-enumerable object properties and array properties other than dense indices plus ordinary `length`. Do not ignore semantically present own properties.
- Use sorted ordinal object path segments. Never place raw keys/values in failures, including when they look harmless.
- Use `Number.isSafeInteger` only when the value is integral; finite non-integral numbers use exact RFC 8785 serialization. Do not normalize `-0` to `0`.
- Treat limits and vectors as permanent `@1` protocol. Do not add environment flags, permissive modes, truncation, fallback hashing, or compatibility aliases.
- Use existing engine fingerprint primitives; only `primitives.ts` imports `node:crypto`. The canonical module delegates to `byteHash`.
- Do not change `fingerprint.usage.lint`; RFC-0853 must enforce its real certification source boundary after that source exists.
- Update `packages/werkstatt/AGENTS.md`, `docs/technology.xml`, `docs/knowledge-graph.xml`, and `docs/source-markup.xml` where ownership/source contracts change; record explicit no-change rationales for remaining root Compass files.
- If the certification spec is inconsistent, create an amendment; for an invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0849 --reason "..." --invariant "DNA-N"`.
- Follow RFC-0230 for package/agent surfaces, RFC-0330 for verification evidence, RFC-0334 for invariant escalation, and RFC-0476 for stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0849`, then `rfc.implement.stamp --id RFC-0849 --dry-run` and commit through the canonical flow.
