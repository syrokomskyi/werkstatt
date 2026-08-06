---
rfc: RFC-0715
createdAt: 2026-08-06
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 5
---

# Design Summit: RFC-0715

## Architect

### Findings

- **A1 (concern):** The file system table (line 293) mentions `packages/os/site-kernel-handoff/src/nachweis/commands/` as a subdirectory for thin kernel handlers, but all existing nachweis command handlers are flat files (`nachweis-approve.ts`, `nachweis-publish.ts`, etc.) — no `commands/` subdirectory exists. An agent following the RFC literally would create an inconsistent directory structure. The plan correctly uses flat `nachweis-key-ensure.ts` etc., but the RFC text should match.

- **A2 (concern):** `nachweis.timestamp` depends on `nachweis.sign` having been run first (it reads the signed record hash from Bordbuch). This ordering dependency is documented in Implementation Notes (line 454) but not enforced by the `nachweis.timestamp` command itself. If an agent runs timestamp before sign, the command will fail with an unclear error (no `nachweis-signed` entry found). The command should check for a prior `nachweis-signed` entry and fail with a clear `SIGNATURE_NOT_FOUND` error.

### No concerns

- The 4-command split is well-justified — the Alternatives section honestly addresses and rejects consolidation.
- DNA-53 and DNA-59 alignment is correctly explained.
- The `--pilot-n2-exception` removal is a clean forward-only deprecation.
- The `TsaAdapter` interface is a good abstraction point for future QTSA swap.

## Security Engineer

### Findings

- **S1 (concern):** The "record payload" that gets signed is not precisely defined. The RFC says `stableJsonHash` of the "canonical record payload" (line 224) but does not specify which fields of the EvidenceSource entity constitute the payload. If the payload is ambiguous (e.g., includes `publication` status? includes `items` map?), the signature is ambiguous — two implementations could produce different hashes for the same record. The RFC should specify: "The record payload is the JSON serialization of the EvidenceSource entity's `items` field (the evidence file map with sha256, mediaType, qualityStatus) plus `recordId`, `slug`, `kind`, and `name` — excluding `publication`, `status`, and other lifecycle metadata."

- **S2 (concern):** Key file encoding is unspecified. The RFC says the private key is written as hex (plan step 2), but the passport package uses multibase base58btc (`toMultibase` from `packages/passport/src/sign.ts`). While Nachweis uses a separate key (correctly), the encoding inconsistency could confuse agents who reference passport patterns. The RFC should explicitly state the encoding: "Private key file: hex-encoded 32-byte Ed25519 seed. Public key file: hex-encoded 32-byte Ed25519 public key. This is intentionally different from passport's multibase encoding."

- **S3 (question):** The Risks section (line 413) mentions multi-key support for key rotation ("public key file must be updated to include multiple keys (current + retired)"), but the design does not address the `nachweis-pubkey.json` schema for multiple keys. Is this a future RFC concern, or should the initial `nachweis-pubkey.json` schema be an array to accommodate future keys?

## QA Engineer

### Findings

- **Q1 (concern):** Idempotency of `nachweis.sign` is unspecified. If called twice for the same record, Bordbuch gets two `nachweis-signed` entries. The `nachweis.verify-signature` command reads "the latest" entry — but what if the two signatures differ (e.g., key was rotated between calls)? The RFC should specify: "Multiple `nachweis-signed` entries are allowed (append-only). `nachweis.verify-signature` verifies the latest entry. `nachweis.approve` N3 gate checks for at least one `nachweis-signed` entry."

- **Q2 (concern):** Already-published N2 records (published with `--pilot-n2-exception`) are not addressed. The RFC removes the flag (line 388) and says "N2 is no longer accepted as a pilot exception," but records already published at N2 remain in the system. The `nachweis.publish` gate will now require N3 — will it reject re-publishing of existing N2 records? The RFC should clarify: "Existing N2-published records remain valid. The gate change only affects new publication attempts. Re-publishing an N2 record requires upgrading to N3 (sign + timestamp + approve N3)."

### No concerns

- Acceptance criteria are checkable and comprehensive.
- Test seams are clear: mock `fetch` for TSA, use real `@noble/ed25519` for crypto.
- Failure modes table is thorough.

## Product Manager

### Findings

- **P1 (concern):** Already-published N2 pilot records (if any exist) are not addressed by the rollout. The `--pilot-n2-exception` removal is forward-only for new publications, but the RFC should explicitly state that existing N2 records are grandfathered and not affected by the gate change.

### No concerns

- Problem statement is grounded in real pilot need (m000033).
- Scope is correctly bounded — 4 new commands, 3 changed, no new package.
- nonGoals are explicit and meaningful.
- Rollout is opt-in with no migration needed for N0–N2 records.

## Developer Advocate

### Findings

- **D1 (concern):** File naming inconsistency between RFC and existing codebase pattern. The RFC file system table (lines 288–291) lists `key-ensure.ts`, `sign.ts`, `timestamp.ts`, `verify-signature.ts` (without `nachweis-` prefix), but all existing nachweis files use the `nachweis-` prefix (`nachweis-approve.ts`, `nachweis-publish.ts`, etc.). The plan correctly uses `nachweis-key-ensure.ts` etc. The RFC should match the existing naming convention to avoid agent confusion.

- **D2 (question):** The `TsaAdapter` interface in the RFC (line 273) shows `requestTimestamp(data: Uint8Array)`, but the plan (step 4) shows `requestTimestamp(dataHash: Uint8Array, hashAlgorithm: string)`. Which is the canonical signature? The plan's version is more precise (RFC 3161 requires specifying the hash algorithm), so the RFC should be updated to match.

## Consensus findings

- **A1 + D1 (2 personas):** File naming and directory structure inconsistency. The RFC lists `key-ensure.ts` in a `commands/` subdirectory, but the existing pattern is `nachweis-key-ensure.ts` as flat files. **Recommendation:** Update the RFC file system table to use `nachweis-key-ensure.ts`, `nachweis-sign.ts`, `nachweis-timestamp.ts`, `nachweis-verify-signature.ts` as flat files (no `commands/` subdir), matching the existing nachweis module structure.

- **Q1 + P1 (2 personas):** Already-published N2 records and idempotency of sign are not addressed. **Recommendation:** Add a note to the Rollout section: "Existing N2-published records remain valid and are not affected. The gate change only applies to new publication attempts. Re-publishing an N2 record requires upgrading to N3." Add to Design: "Multiple `nachweis-signed` entries are allowed (append-only). Verification and gate checks use the latest entry."

## Unique findings

- **A2 (1 persona):** `nachweis.timestamp` should enforce sign-before-timestamp ordering by checking for a prior `nachweis-signed` Bordbuch entry. **Recommendation:** Add `SIGNATURE_NOT_FOUND` error to failure modes.
- **S1 (1 persona):** Record payload definition is ambiguous. **Recommendation:** Specify which EvidenceSource fields are included in the signed payload.
- **S2 (1 persona):** Key file encoding inconsistency with passport. **Recommendation:** Explicitly state hex encoding and note the intentional difference from passport's multibase.
- **S3 (1 persona):** Multi-key support in `nachweis-pubkey.json` schema. **Recommendation:** Use an array schema from the start to accommodate future key rotation.
- **D2 (1 persona):** `TsaAdapter` interface signature mismatch between RFC and plan. **Recommendation:** Update RFC to include `hashAlgorithm` parameter.

## Recommendation

**Revise the RFC** — 2 consensus findings and 5 unique findings exist. The consensus findings (file naming + N2 grandfathering) should be addressed before implementation. The unique findings (payload definition, key encoding, ordering enforcement) are important for security and clarity but can be addressed during implementation since the RFC is already `accepted`.

No findings does not mean no issues — it means no issues were found from these five perspectives.
