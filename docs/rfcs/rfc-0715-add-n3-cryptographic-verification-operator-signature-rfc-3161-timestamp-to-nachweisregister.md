---
id: RFC-0715
title: "Add N3 cryptographic verification (operator signature + RFC 3161 timestamp) to Nachweisregister"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0707
amendedBy: []
related:
  - DNA-34
  - DNA-53
  - DNA-59
  - RFC-0706
  - RFC-0707
  - RFC-0708
  - RFC-0714
  - ADR-0028
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
  - DNA-59
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - nachweis.key.ensure
    - nachweis.sign
    - nachweis.timestamp
    - nachweis.verify-signature
  added: []
  changed:
    - nachweis.approve
    - nachweis.validate
    - nachweis.publish
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/ontology"
successSignals:
  - "nachweis.key.ensure generates an Ed25519 keypair and writes it to a key file outside the repository"
  - "nachweis.sign produces a detached Ed25519 signature over the record payload hash and records it in Bordbuch"
  - "nachweis.timestamp obtains an RFC 3161 timestamp token from a TSA and records it in Bordbuch"
  - "nachweis.verify-signature validates a signature against the published public key without requiring the private key"
  - "nachweis.approve --verification-level N3 succeeds only when both signature and timestamp are present in Bordbuch"
nonGoals:
  - "Does not implement qualified electronic signatures (QES) under eIDAS — N3 uses operator signature (Ed25519) + RFC 3161 timestamp, not QES."
  - "Does not implement a TSA service — consumes an external TSA (FreeTSA.org for pilot, configurable for production QTSA)."
  - "Does not implement key rotation policy — nachweis.key.ensure generates a new key; rotation workflow is a future RFC."
  - "Does not implement client-side verification — the verify page displays verification data; visitors verify independently using external tools."
  - "Does not implement R2 scalability for multi-tenant credential management — that is a separate future RFC."
  - "Does not implement N3 for records other than the Nicaragua-Projekt pilot in this mission."
  - "Does not implement contextual Nachweis projections on service/pricing/team/exit pages — that is a content-level task, not a kernel command."
  - "Does not modify the nachweis-card UI component — UI enrichment is a content-level task tracked separately."
  - "Does not implement redacted PDF creation — the public derivative workflow is handled by nachweis.public-derivative (RFC-0714)."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0715: Add N3 cryptographic verification (operator signature + RFC 3161 timestamp) to Nachweisregister

## Context

The Nachweisregister (ADR-0028) implements a managed registry of confirmed statements as an extension of the PBP trust layer and Bordbuch infrastructure. RFC-0706 extended PBP entities (`Claim`, `EvidenceSource`, `Consent`) with Nachweis-specific fields. RFC-0707 implemented the core kernel module with six commands (`ingest`, `validate`, `manifest.generate`, `consent.update`, `publish`, `withdraw`) and defined four verification levels (N0–N3). RFC-0714 added `nachweis.approve` and `nachweis.public-derivative`.

The verification levels are defined as:

- **N0** — Operator assertion (no cryptographic evidence)
- **N1** — SHA-256 hash of source document
- **N2** — Bordbuch lifecycle audit trail (append-only, hash-chained)
- **N3** — Operator cryptographic signature (Ed25519) + RFC 3161 qualified timestamp

RFC-0707 explicitly listed N3 implementation as a **nonGoal**: "Does not implement N3 (operator signature + qualified timestamp) — that is a future RFC." To date, no RFC has been created to close this gap. The `nachweis.approve` command (RFC-0714) accepts a `--verification-level` flag but does not enforce or produce N3 artifacts — it only records the level in Bordbuch.

The warpgogol-com pilot mission (m000033) requires a full N3 publication cycle for the Nicaragua-Projekt record, including real PDF ingestion, consent management, and publication with operator signature and RFC 3161 timestamp.

## Problem

1. **No kernel command produces an operator signature.** `nachweis.approve --verification-level N3` records the level string in Bordbuch but does not create or verify any cryptographic signature. An N3 badge on the public site would be an unverified claim — exactly what the Nachweisregister is designed to prevent.

2. **No kernel command obtains an RFC 3161 timestamp.** Without a qualified timestamp, the temporal existence of a record cannot be independently verified. A visitor cannot distinguish "this record existed before date X" from "this record was backdated."

3. **No kernel command verifies a signature.** Even if a signature were produced manually, there is no `nachweis.verify-signature` command to validate it against the published public key. The `nachweis-verify` UI component (RFC-0708) displays verification data but has no backend command to populate it.

4. **No signing key provisioning.** The passport key (DNA-34) is used for Verifiable Credential signing and must not be reused for Nachweis operator signatures. A separate Ed25519 keypair is needed, with a provisioning command that generates and stores it securely outside the repository.

5. **`nachweis.approve` does not gate on N3 artifacts.** The command accepts `--verification-level N3` without checking that a signature and timestamp actually exist in Bordbuch. This allows an operator to claim N3 without producing the evidence.

## Decision

The Nachweis kernel module gains three new commands — `nachweis.sign`, `nachweis.timestamp`, `nachweis.verify-signature` — and one key provisioning command — `nachweis.key.ensure` — that together implement the N3 verification level. `nachweis.approve` is amended to gate on N3 artifacts: when `--verification-level N3` is passed, the command verifies that both an operator signature and an RFC 3161 timestamp exist in Bordbuch before recording the level.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** `nachweis.sign` uses `@warpgogol/fingerprint` `byteHash` to compute the record payload hash that is signed. No ad hoc hashing outside the package.
- **DNA-59 (Evidence preservation):** The operator signature and RFC 3161 timestamp token are preserved as append-only Bordbuch entries, consistent with the evidence preservation invariant.
- **DNA-34 (Verifiable Credential signing):** This RFC explicitly does **not** reuse the passport Ed25519 key. A separate Nachweis signing key is provisioned by `nachweis.key.ensure`, isolating Nachweis operator signatures from VC signing.
- **ADR-0028 (Nachweisregister as PBP trust layer extension):** N3 artifacts (signature, timestamp) are stored as Bordbuch entries, not as separate PBP entity fields. The Bordbuch remains the append-only audit trail.
- **RFC-0707 (amended):** `nachweis.approve` gains an N3 gate. The six original commands are unchanged. Three new commands are added to the same kernel module.
- **RFC-0714:** `nachweis.public-derivative` is unchanged. It uploads the public PDF derivative to R2; N3 artifacts are independent of the derivative.
- **RFC-0708:** The `nachweis-verify` UI component already has props for `operatorSignature`, `qualifiedTimestamp`, and `verificationLevel`. This RFC provides the backend commands that populate those props.
- **Site OS operator model:** All four new commands are kernel commands registered in the nachweis module under `packages/os/site-kernel-handoff/src/nachweis/`. They follow the pure-function + thin-handler pattern (RFC-0647): crypto logic in pure functions callable from any package, thin kernel handlers wrap them for CLI/pipeline use.
- **Scaling:** N3 crypto is per-record, not per-tenant. The signing key is per-operator (one key signs all records for a given operator). This scales uniformly — the key is generated once and reused. TSA calls are per-record HTTP requests to an external service; rate limits are the TSA's concern, not the kernel's.

## Design

### CLI surface

```sh
# Provisioning (one-time per operator)
pnpm exec site-kernel run nachweis.key.ensure \
  --key-file ~/.warpgogol/nachweis-signing.key

# Sign a record (after ingest, before approve)
pnpm exec site-kernel run nachweis.sign \
  --system warpgogol-com \
  --slug nicaragua-projekt \
  --key-file ~/.warpgogol/nachweis-signing.key

# Timestamp a record (after sign, before approve)
pnpm exec site-kernel run nachweis.timestamp \
  --system warpgogol-com \
  --slug nicaragua-projekt \
  --tsa-url https://freetsa.org/tsr

# Verify a signature (any time, read-only)
pnpm exec site-kernel run nachweis.verify-signature \
  --system warpgogol-com \
  --slug nicaragua-projekt \
  --public-key-file ~/.warpgogol/nachweis-signing.pub

# Approve with N3 gate (amended)
pnpm exec site-kernel run nachweis.approve \
  --system warpgogol-com \
  --slug nicaragua-projekt \
  --verification-level N3 \
  --legal-content-check passed
```

**Flags:**

| Command | Flag | Description |
| --- | --- | --- |
| `nachweis.key.ensure` | `--key-file <path>` | Output path for the private key. Public key is written to `<path>.pub`. |
| `nachweis.sign` | `--system <id>` | Sternsystem ID. |
|  | `--slug <slug>` | Record slug (EvidenceSource entity ID). |
|  | `--key-file <path>` | Path to the Ed25519 private key file. |
| `nachweis.timestamp` | `--system <id>` | Sternsystem ID. |
|  | `--slug <slug>` | Record slug. |
|  | `--tsa-url <url>` | TSA endpoint URL (default: `https://freetsa.org/tsr`). |
|  | `--tsa-cert-file <path>` | Optional TSA certificate chain for verification. |
| `nachweis.verify-signature` | `--system <id>` | Sternsystem ID. |
|  | `--slug <slug>` | Record slug. |
|  | `--public-key-file <path>` | Path to the Ed25519 public key file. |
| `nachweis.approve` | (existing flags from RFC-0714) | Amended: when `--verification-level N3`, gates on signature + timestamp. |

### TypeScript contracts

```ts
// --- nachweis.key.ensure ---

interface NachweisKeyEnsureInput {
  keyFilePath: string;
}

interface NachweisKeyEnsureResult {
  keyFilePath: string;
  publicKeyFilePath: string;
  publicKeyBase64: string;
  keyId: string; // SHA-256 of the public key, hex
}

// --- nachweis.sign ---

interface NachweisSignInput {
  systemId: string;
  slug: string;
  keyFilePath: string;
}

interface NachweisSignResult {
  slug: string;
  recordPayloadHash: string; // SHA-256 of the canonical record payload, hex
  signature: string; // Ed25519 detached signature, base64
  keyId: string; // SHA-256 of the public key, hex
  signedAt: string; // ISO-8601
}

// --- nachweis.timestamp ---

interface NachweisTimestampInput {
  systemId: string;
  slug: string;
  tsaUrl: string;
  tsaCertFilePath?: string;
}

interface NachweisTimestampResult {
  slug: string;
  timestampToken: string; // RFC 3161 TSR, base64
  tsaUrl: string;
  timestampHash: string; // SHA-256 of the timestamp token, hex
  timestampedAt: string; // ISO-8601 from the TSA response
}

// --- nachweis.verify-signature ---

interface NachweisVerifySignatureInput {
  systemId: string;
  slug: string;
  publicKeyFilePath: string;
}

interface NachweisVerifySignatureResult {
  slug: string;
  valid: boolean;
  recordPayloadHash: string;
  signature: string;
  keyId: string;
  verifiedAt: string;
}

// --- Bordbuch entry kinds (extends RFC-0706 BordbuchEntryKind) ---

// "nachweis-signed" — appended by nachweis.sign
// "nachweis-timestamped" — appended by nachweis.timestamp
// Both carry the hash, signature/timestamp, keyId, and ISO-8601 timestamp.

// --- TSA adapter interface (for future QTSA swap) ---

interface TsaAdapter {
  requestTimestamp(data: Uint8Array): Promise<TimestampResponse>;
}

interface TimestampResponse {
  token: string; // base64-encoded RFC 3161 TSR
  timestamp: string; // ISO-8601
}

// FreeTSA.org adapter is the default; production QTSA is pluggable.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/nachweis/key-ensure.ts` | Pure function: Ed25519 keypair generation |
| `packages/os/site-kernel-handoff/src/nachweis/sign.ts` | Pure function: record payload hashing + Ed25519 signing |
| `packages/os/site-kernel-handoff/src/nachweis/timestamp.ts` | Pure function: RFC 3161 timestamp request + verification |
| `packages/os/site-kernel-handoff/src/nachweis/verify-signature.ts` | Pure function: Ed25519 signature verification |
| `packages/os/site-kernel-handoff/src/nachweis/tsa/` | TSA adapter interface + FreeTSA adapter |
| `packages/os/site-kernel-handoff/src/nachweis/commands/` | Thin kernel handlers (one per command) |
| `~/.warpgogol/nachweis-signing.key` | Private key file (outside repo, gitignored) |
| `~/.warpgogol/nachweis-signing.pub` | Public key file (committed to `public/.well-known/` for discovery) |
| `missions/<id>/workpiece/public/.well-known/nachweis-pubkey.json` | Published public key + keyId for visitor verification |
| Bordbuch (append-only) | Receives `nachweis-signed` and `nachweis-timestamped` entries |
| `packages/ontology/src/operations/mission.ts` | Extended with `nachweis-signed` and `nachweis-timestamped` BordbuchEntryKind values |

**Key file security:**

- The private key file MUST be outside the repository (default: `~/.warpgogol/`).
- The `.gitignore` MUST include `*.key` and `~/.warpgogol/` patterns.
- The public key is published at `public/.well-known/nachweis-pubkey.json` for independent verification.
- `nachweis.key.ensure` MUST refuse to overwrite an existing key file without `--force`.

### Output format

```json
{
  "command": "nachweis.sign",
  "status": "ok",
  "slug": "nicaragua-projekt",
  "recordPayloadHash": "a1b2c3...",
  "signature": "base64-encoded-ed25519-signature",
  "keyId": "d4e5f6...",
  "signedAt": "2026-08-06T12:00:00Z",
  "bordbuchEventId": "event-000127"
}
```

```json
{
  "command": "nachweis.timestamp",
  "status": "ok",
  "slug": "nicaragua-projekt",
  "timestampToken": "base64-encoded-rfc3161-tsr",
  "tsaUrl": "https://freetsa.org/tsr",
  "timestampHash": "e7f8g9...",
  "timestampedAt": "2026-08-06T12:00:01Z",
  "bordbuchEventId": "event-000128"
}
```

```json
{
  "command": "nachweis.verify-signature",
  "status": "ok",
  "slug": "nicaragua-projekt",
  "valid": true,
  "recordPayloadHash": "a1b2c3...",
  "signature": "base64-encoded-ed25519-signature",
  "keyId": "d4e5f6...",
  "verifiedAt": "2026-08-06T12:05:00Z"
}
```

```json
{
  "command": "nachweis.approve",
  "status": "fail",
  "slug": "nicaragua-projekt",
  "error": "N3_GATE_FAILED",
  "missing": ["operator-signature", "rfc3161-timestamp"],
  "message": "Cannot approve at N3: signature and timestamp not found in Bordbuch. Run nachweis.sign and nachweis.timestamp first."
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| Key file not found (`nachweis.sign`) | Exit code 1, error: `KEY_FILE_NOT_FOUND`. Does not create a key automatically. |
| Key file already exists (`nachweis.key.ensure` without `--force`) | Exit code 1, error: `KEY_FILE_EXISTS`. Refuses to overwrite. |
| Record not found in workpiece | Exit code 1, error: `RECORD_NOT_FOUND`. |
| Record not yet ingested (no Bordbuch entry) | Exit code 1, error: `RECORD_NOT_INGESTED`. Sign requires a prior `nachweis.ingest`. |
| TSA unreachable / timeout | Exit code 1, error: `TSA_UNREACHABLE`. Retries are the caller's responsibility (not built into the command). |
| TSA returns invalid response | Exit code 1, error: `TSA_INVALID_RESPONSE`. Includes the HTTP status and response body excerpt. |
| TSA certificate verification fails | Exit code 1, error: `TSA_CERT_VERIFICATION_FAILED`. |
| Signature verification fails (`nachweis.verify-signature`) | Exit code 0, `valid: false`. This is not an error — it's a valid verification result. |
| N3 gate fails (`nachweis.approve --verification-level N3`) | Exit code 1, error: `N3_GATE_FAILED`, lists missing artifacts. |
| Bordbuch write fails | Exit code 1, error: `BORDBUCH_WRITE_FAILED`. Transactional — no partial state. |
| `--json` mode | Errors are returned as JSON with `status: "fail"`, `error` code, and `message`. |
| Pretty mode | Errors are printed to stderr with human-readable messages. |

## Rollout

- **Default behavior:** All four new commands are opt-in — they are only called explicitly by the operator during the N3 publication workflow. No pipeline step calls them automatically. `nachweis.approve --verification-level N3` is the only gate; lower levels (N0–N2) are unaffected.
- **Existing apps:** No migration needed. Records at N0–N2 continue to work unchanged. The `nachweis.approve` amendment only adds a gate for N3; N0–N2 approvals are unchanged.
- **New apps:** Automatically comply — the nachweis module is registered in the kernel config, and the new commands are available from day one. No flag day.
- **Pilot adoption (warpgogol-com):**
  1. Run `nachweis.key.ensure` to generate the signing keypair.
  2. Publish the public key to `public/.well-known/nachweis-pubkey.json`.
  3. Run `nachweis.ingest` → `nachweis.validate` → `nachweis.sign` → `nachweis.timestamp` → `nachweis.approve --verification-level N3` → `nachweis.public-derivative` → `nachweis.publish`.
  4. The `nachweis-verify` page handler reads N3 artifacts from Bordbuch and populates the component props.
- **Pipeline integration:** None. N3 commands are operator-run, not pipeline-run. The `build.check` pipeline does not invoke them. The `nachweis.validate` command (RFC-0707) is extended to check N3 artifacts when the record's `verificationLevel` is `N3`: it verifies the presence of `nachweis-signed` and `nachweis-timestamped` Bordbuch entries for the record. Signature and timestamp content verification (cryptographic re-validation) is not performed by `nachweis.validate` — that is the operator's responsibility via `nachweis.verify-signature`.
- **Compass sync:** `docs/verification-plan.xml` may need synchronization if the new Bordbuch entry kinds affect the verification surface. `command.manifest.generate` must be re-run to include the four new commands in `docs/command-manifest.generated.yaml`.
- **Deprecation:** The `--pilot-n2-exception` flag on `nachweis.publish` (RFC-0707, temporary) is removed. With N3 timestamp support now implemented, the flag is no longer needed. `nachweis.publish` requires `verificationLevel: N3` in the Bordbuch (set by `nachweis.approve`) — N2 is no longer accepted as a pilot exception.
- **TSA migration path:** The `TsaAdapter` interface allows swapping FreeTSA.org for a production QTSA without changing the command surface. The `--tsa-url` flag and `--tsa-cert-file` flag accommodate any RFC 3161-compliant TSA.

## Alternatives considered

1. **Extend `nachweis.approve` with inline signing + timestamping (no new commands).**
   - Rejected: violates single-responsibility. `approve` would become a mega-command that ingests, signs, timestamps, and approves. Debugging individual failures becomes harder. The operator cannot re-sign without re-approving. The three-command split allows independent re-execution (e.g., re-timestamp after TSA outage without re-signing).

2. **Reuse the passport Ed25519 key (DNA-34) for Nachweis signatures.**
   - Rejected: the passport key signs Verifiable Credential provenance. Mixing Nachweis operator signatures with VC signing creates a single point of compromise — a leaked passport key would forge both VCs and Nachweis records. A separate key isolates the trust domains.

3. **Store the signing key in environment variables.**
   - Rejected: env vars are per-site and per-environment. The Nachweis signing key is per-operator (one key signs records across all sites the operator manages). A key file outside the repository is more appropriate and does not leak into process listings or CI logs.

4. **Store the signing key in Cloudflare Workers secrets for runtime signing.**
   - Rejected: the site is static-first (DNA-3, Astro SSG). Signing at build time is consistent with the architecture. Runtime signing would require a Worker, adding latency, cost, and a runtime dependency for a static site.

5. **Implement client-side signature verification in the browser.**
   - Rejected: the verify page displays verification data (hashes, signatures, timestamps). Visitors verify independently using external tools (e.g., OpenSSL, `openssl ts -verify`). Client-side verification would require shipping a WASM crypto library, adding bundle weight for a niche feature. The `nachweis.verify-signature` command provides server-side verification for the operator.

6. **Use a single `nachweis.n3` command that signs + timestamps in one step.**
   - Rejected: sign and timestamp are independent operations with different failure modes. A TSA outage should not block signing. Re-timestamping (e.g., after TSA key compromise) should not require re-signing. The split allows independent re-execution and independent Bordbuch entries.

## Risks

- **Private key loss:** If the signing key file is lost, existing N3 signatures remain valid (the public key is published), but new records cannot be signed with the same key. Mitigation: `nachweis.key.ensure` can generate a new key, but previously signed records keep their original `keyId`. The public key file at `.well-known/nachweis-pubkey.json` must be updated to include multiple keys (current + retired).
- **TSA unavailability:** FreeTSA.org is a free, community-run service with no SLA. A TSA outage blocks timestamping. Mitigation: the operator can retry `nachweis.timestamp` later. The record remains signed (N2 + signature) until the timestamp is obtained. A production QTSA with an SLA is recommended for non-pilot use.
- **TSA key compromise:** If the TSA's signing key is compromised, all timestamps from that TSA are suspect. Mitigation: `nachweis.timestamp` can be re-run with a different `--tsa-url`. The old timestamp remains in Bordbuch (append-only); the new timestamp is a new entry. The operator updates the record's effective timestamp.
- **Agent misinterpretation:** An AI agent might run `nachweis.approve --verification-level N3` without first running `nachweis.sign` and `nachweis.timestamp`. The N3 gate prevents this — the command fails with `N3_GATE_FAILED` and a clear message listing the missing artifacts.
- **Key file in repository:** An agent might accidentally commit the private key file. Mitigation: `.gitignore` patterns for `*.key` and `~/.warpgogol/`. The `nachweis.key.ensure` command writes outside the repo by default. Pre-commit hooks should check for `*.key` files.
- **Record payload hash determinism:** The canonical record payload must be deterministic. If the PBP entity serialization changes (e.g., field order, whitespace), the hash changes, invalidating the signature. Mitigation: use `@warpgogol/fingerprint` `stableJsonHash` for canonical serialization (DNA-53).
- **FreeTSA.org rate limiting:** FreeTSA.org may rate-limit or block frequent requests. Mitigation: the command does not retry automatically. The operator respects rate limits manually. Production QTSA is recommended for volume.
- **Bordbuch growth:** Each N3 record adds two Bordbuch entries (signed + timestamped). At scale (millions of records), Bordbuch size grows. This is a concern for the separate R2 scalability RFC (m000034), not this RFC.

## Acceptance criteria

- [ ] `nachweis.key.ensure` generates an Ed25519 keypair, writes private key to the specified path, and publishes the public key to `public/.well-known/nachweis-pubkey.json`
- [ ] `nachweis.sign` computes a record payload hash using `@warpgogol/fingerprint` `stableJsonHash`, signs it with Ed25519, and appends a `nachweis-signed` Bordbuch entry
- [ ] `nachweis.timestamp` requests an RFC 3161 timestamp token from the configured TSA, verifies the response, and appends a `nachweis-timestamped` Bordbuch entry
- [ ] `nachweis.verify-signature` validates the Ed25519 signature against the published public key without requiring the private key, returning `valid: true/false`
- [ ] `nachweis.approve --verification-level N3` fails with `N3_GATE_FAILED` when either signature or timestamp is missing from Bordbuch
- [ ] `nachweis.approve --verification-level N3` succeeds when both artifacts are present
- [ ] `nachweis.approve --verification-level N0|N1|N2` is unchanged (no N3 gate)
- [ ] Unit tests cover all four new commands and the N3 gate in `nachweis.approve`
- [ ] `TsaAdapter` interface is defined and FreeTSA.org adapter is implemented
- [ ] `packages/ontology/src/operations/mission.ts` is extended with `nachweis-signed` and `nachweis-timestamped` BordbuchEntryKind values
- [ ] `--pilot-n2-exception` flag is removed from `nachweis.publish` command registration and gate evaluation logic
- [ ] `nachweis.validate` checks for presence of `nachweis-signed` and `nachweis-timestamped` Bordbuch entries when a record's verification level is `N3`
- [ ] `.gitignore` includes `*.key` pattern
- [ ] `rfc.validate` passes on this file
- [ ] `AGENTS.md` updated with Nachweis N3 workflow rules
- [ ] `command.manifest.generate` re-run to include new commands in manifest

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT reuse the passport Ed25519 key (DNA-34) for Nachweis signatures. A separate key is provisioned by `nachweis.key.ensure`.
- Agents MUST NOT commit the private key file to the repository. The key file lives outside the repo (default: `~/.warpgogol/`).
- Agents MUST use `@warpgogol/fingerprint` `stableJsonHash` for record payload hashing (DNA-53). No ad hoc hashing.
- Agents MUST follow the pure-function + thin-handler pattern (RFC-0647) for all four new commands.
- Agents MUST NOT build retry logic into `nachweis.timestamp`. TSA retries are the operator's responsibility.
- Agents MUST NOT change `nachweis.approve` behavior for N0–N2. The N3 gate is additive.
- Agents MUST remove the `--pilot-n2-exception` flag from `nachweis.publish` (command registration in `nachweis.module.ts` and gate evaluation in `nachweis-publish.ts`). This flag was marked temporary in RFC-0707 and MUST be removed now that N3 timestamp support is implemented.
- Agents MUST register the new Bordbuch entry kinds (`nachweis-signed`, `nachweis-timestamped`) in the ontology (RFC-0706 `BordbuchEntryKind` enum).
- Agents MUST run `nachweis.sign` before `nachweis.timestamp`. The timestamp covers the signed record hash.
- Agents MUST run both `nachweis.sign` and `nachweis.timestamp` before `nachweis.approve --verification-level N3`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
