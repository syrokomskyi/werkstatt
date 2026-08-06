---
rfcId: RFC-0715
planId: PLAN-RFC-0715-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/ontology"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/verification-plan.xml
    - docs/command-manifest.generated.yaml
---

# Implementation Plan: RFC-0715

## 1. Objectives

- [ ] O1 — Add `nachweis.key.ensure` command (Ed25519 keypair generation, key file provisioning) — maps to acceptance criterion [...]
- [ ] O2 — Add `nachweis.sign` command (record payload hash + Ed25519 detached signature + Bordbuch entry) — maps to [...]
- [ ] O3 — Add `nachweis.timestamp` command (RFC 3161 TSA request + Bordbuch entry) — maps to [...]
- [ ] O4 — Add `nachweis.verify-signature` command (read-only Ed25519 verification) — maps to [...]
- [ ] O5 — Amend `nachweis.approve` with N3 gate (signature + timestamp presence check) — maps to [...]
- [ ] O6 — Remove `--pilot-n2-exception` from `nachweis.publish` — maps to [...]
- [ ] O7 — Extend `nachweis.validate` with N3 artifact presence check — maps to [...]
- [ ] O8 — Add `nachweis-signed` and `nachweis-timestamped` Bordbuch entry kinds to ontology — maps to [...]
- [ ] O9 — Unit tests for all new commands + N3 gate — maps to [...]
- [ ] O10 — Documentation sync (AGENTS.md, command manifest, Compass) — maps to [...]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/nachweis/nachweis-key-ensure.ts` — NEW: pure function + thin handler for Ed25519 keypair generation
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-sign.ts` — NEW: pure function + thin handler for record signing
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-timestamp.ts` — NEW: pure function + thin handler for RFC 3161 timestamping
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-verify-signature.ts` — NEW: pure function + thin handler for signature verification
- `packages/os/site-kernel-handoff/src/nachweis/tsa/tsa-adapter.ts` — NEW: `TsaAdapter` interface
- `packages/os/site-kernel-handoff/src/nachweis/tsa/freetsa-adapter.ts` — NEW: FreeTSA.org adapter implementation (uses `pkijs` + `asn1js`)
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` — MODIFIED: add new result interfaces (`NachweisKeyEnsureResult`, `NachweisSignResult`, `NachweisTimestampResult`, `NachweisVerifySignatureResult`)
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts` — MODIFIED: add N3 gate logic (check for `nachweis-signed` and `nachweis-timestamped` Bordbuch entries when `--verification-level N3`)
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-publish.ts` — MODIFIED: remove `--pilot-n2-exception` flag and N2 acceptance logic
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-validate.ts` — MODIFIED: add N3 artifact presence check when record verification level is N3
- `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts` — MODIFIED: register 4 new commands, remove `--pilot-n2-exception` flag from `nachweis.publish`
- `packages/os/site-kernel-handoff/src/nachweis/index.ts` — MODIFIED: barrel exports for new modules
- `packages/os/site-kernel-handoff/package.json` — MODIFIED: add `@noble/ed25519`, `pkijs`, `asn1js` dependencies
- `packages/ontology/src/operations/mission.ts` — MODIFIED: add `nachweis-signed` and `nachweis-timestamped` to `bordbuchEntryKindSchema`
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — MODIFIED: add `nachweis-signed` and `nachweis-timestamped` to `WRITER_ROLE_KINDS` under `nachweis` role
- `.gitignore` — MODIFIED: add `*.key` pattern

### 2.2 Configuration and data

- `~/.warpgogol/nachweis-signing.key` — operator private key (outside repo)
- `~/.warpgogol/nachweis-signing.pub` — operator public key
- `missions/<id>/workpiece/public/.well-known/nachweis-pubkey.json` — published public key for visitor verification

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add N3 workflow rules, key file security policy, TSA adapter pattern
- `docs/verification-plan.xml` — sync if new Bordbuch kinds affect verification surface
- `docs/command-manifest.generated.yaml` — regenerated via `command.manifest.generate`

### 2.4 Validation and pipelines

- No new pipeline steps — all N3 commands are operator-invoked
- `nachweis.validate` (existing `build.check` pipeline step) is extended with N3 check
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests
- `pnpm --filter @warpgogol/ontology build:check` — typecheck ontology changes

## 3. Step sequence

### Step 1. Add dependencies and new Bordbuch entry kinds

**Goal:** Establish crypto dependencies and extend the ontology enum.

**Agent actions:**

- Add `@noble/ed25519: "^3.1.0"`, `pkijs: "^3.3.3"`, `asn1js: "^3.0.10"` to `packages/os/site-kernel-handoff/package.json` dependencies
- Add `"nachweis-signed"` and `"nachweis-timestamped"` to `bordbuchEntryKindSchema` in `packages/ontology/src/operations/mission.ts`
- Add `nachweis-signed` and `nachweis-timestamped` to `WRITER_ROLE_KINDS.nachweis` array in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** All 3 dependencies in package.json, both Bordbuch kinds in enum, `WRITER_ROLE_KINDS` updated, typecheck passes.

**Human review:** no

---

### Step 2. Implement `nachweis.key.ensure` (pure function + thin handler)

**Goal:** Ed25519 keypair generation and file provisioning.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-key-ensure.ts`
- Pure function: `ensureNachweisKey(keyFilePath: string, force: boolean): Promise<NachweisKeyEnsureResult>` — uses `@noble/ed25519` `utils.randomPrivateKey()` and `ed.getPublicKey()`, writes private key as hex to file, writes public key as hex to `<path>.pub`, computes `keyId` as SHA-256 of public key bytes via `byteHash`
- Thin handler: `runNachweisKeyEnsure(input, context)` — wraps pure function, handles `--force` flag, returns `KernelCommandResult`
- Refuses to overwrite existing key file without `--force`
- Writes public key JSON to `public/.well-known/nachweis-pubkey.json` in the workpiece (if resolvable from context)
- **Public key JSON schema (array for future key rotation):** `[{keyId: string, publicKeyHex: string, status: "current", createdAt: string}]`
- **Key encoding:** hex-encoded 32-byte Ed25519 seed (private) and hex-encoded 32-byte public key. Intentionally different from passport's multibase base58btc encoding.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `nachweis-key-ensure.ts` exists, pure function generates Ed25519 keypair, writes key files, computes keyId.

**Human review:** no

---

### Step 3. Implement `nachweis.sign` (pure function + thin handler)

**Goal:** Sign a Nachweis record payload with Ed25519 and append Bordbuch entry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-sign.ts`
- Pure function: `signNachweisRecord(workspaceRoot, systemId, slug, keyFilePath): Promise<NachweisSignResult>` — reads evidence-source entity from cache clone, computes canonical payload hash via `stableJsonHash` from `@warpgogol/fingerprint` over the **core evidence fields** `{recordId, slug, kind, name, items}` (excluding publication, status, and lifecycle metadata), reads private key from file, signs hash with `@noble/ed25519` `ed.sign()`, appends `nachweis-signed` Bordbuch entry with metadata (slug, recordPayloadHash, signature, keyId, signedAt)
- **Idempotency:** Multiple `nachweis-signed` entries are allowed (Bordbuch is append-only). Verification and gate checks use the latest entry.
- Thin handler: `runNachweisSign(input, context)` — resolves flags (`--system`, `--slug`, `--key-file`), calls pure function, returns `KernelCommandResult`
- Acquires `system:` and `bordbuch:` locks before Bordbuch append
- Checks nachweis entitlement (skip if not resolved)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `nachweis-sign.ts` exists, pure function signs record and appends Bordbuch entry, handler resolves flags correctly.

**Human review:** no

---

### Step 4. Implement TSA adapter interface and FreeTSA adapter

**Goal:** Abstraction layer for RFC 3161 timestamping.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/tsa/tsa-adapter.ts` — `TsaAdapter` interface with `requestTimestamp(dataHash: Uint8Array, hashAlgorithm: string): Promise<TimestampResult>`
- Create `packages/os/site-kernel-handoff/src/nachweis/tsa/freetsa-adapter.ts` — `FreeTsaAdapter implements TsaAdapter` — uses `pkijs` `TimeStampReq` + `MessageImprint` + `AlgorithmIdentifier` to construct the RFC 3161 timestamp query (DER-encoded via `asn1js`), POSTs to `https://freetsa.org/tsr` with `Content-Type: application/timestamp-query`, parses response via `pkijs.TimeStampResp`, extracts `timeStampToken` and `genTime`
- `TsaAdapter` interface: `requestTimestamp(dataHash: Uint8Array, hashAlgorithm: string): Promise<TimestampResponse>`
- No retry logic — caller handles retries

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `TsaAdapter` interface defined, `FreeTsaAdapter` implemented, DER encoding produces valid RFC 3161 query.

**Human review:** no

---

### Step 5. Implement `nachweis.timestamp` (pure function + thin handler)

**Goal:** Request RFC 3161 timestamp token and append Bordbuch entry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-timestamp.ts`
- Pure function: `timestampNachweisRecord(workspaceRoot, systemId, slug, tsaUrl, tsaCertFilePath?): Promise<NachweisTimestampResult>` — reads the latest `nachweis-signed` Bordbuch entry for the slug (**enforces sign-before-timestamp ordering**: fails with `SIGNATURE_NOT_FOUND` if no prior `nachweis-signed` entry exists), computes SHA-256 of the signed record hash, calls `TsaAdapter.requestTimestamp()`, appends `nachweis-timestamped` Bordbuch entry with metadata (slug, timestampToken, tsaUrl, timestampHash, timestampedAt)
- Thin handler: `runNachweisTimestamp(input, context)` — resolves flags (`--system`, `--slug`, `--tsa-url`, `--tsa-cert-file`), calls pure function, returns `KernelCommandResult`
- Default TSA URL: `https://freetsa.org/tsr`
- Acquires `system:` and `bordbuch:` locks
- Checks nachweis entitlement

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `nachweis-timestamp.ts` exists, pure function requests timestamp and appends Bordbuch entry.

**Human review:** no

---

### Step 6. Implement `nachweis.verify-signature` (pure function + thin handler)

**Goal:** Read-only Ed25519 signature verification.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-verify-signature.ts`
- Pure function: `verifyNachweisSignature(workspaceRoot, systemId, slug, publicKeyFilePath): Promise<NachweisVerifySignatureResult>` — reads the latest `nachweis-signed` Bordbuch entry, reads public key from file, re-computes record payload hash, verifies signature with `@noble/ed25519` `ed.verify()`, returns `valid: boolean`
- Thin handler: `runNachweisVerifySignature(input, context)` — resolves flags (`--system`, `--slug`, `--public-key-file`), calls pure function, returns `KernelCommandResult`
- Does NOT modify any state — read-only
- Exit code 0 with `valid: false` is a valid verification result, not an error
- Checks nachweis entitlement

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `nachweis-verify-signature.ts` exists, pure function verifies signature without private key.

**Human review:** no

---

### Step 7. Amend `nachweis.approve` with N3 gate

**Goal:** Block N3 approval when signature or timestamp is missing.

**Agent actions:**

- Modify `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts`
- After existing validation, when `verificationLevel === "N3"`: read Bordbuch entries for the slug, check for `nachweis-signed` and `nachweis-timestamped` entries
- If either is missing: return `exitCode: 1` with `N3_GATE_FAILED` error and `missing` array listing missing artifacts
- If both present: proceed with normal approval flow
- N0–N2: unchanged (no N3 gate)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `nachweis.approve --verification-level N3` fails with `N3_GATE_FAILED` when signature or timestamp missing, succeeds when both present.

**Human review:** no

---

### Step 8. Remove `--pilot-n2-exception` from `nachweis.publish`

**Goal:** Remove temporary N2 pilot exception flag.

**Agent actions:**

- Modify `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts` — remove `"pilot-n2-exception"` flag from `nachweis.publish` command registration
- Modify `packages/os/site-kernel-handoff/src/nachweis/nachweis-publish.ts` — remove `pilotN2Exception` flag parsing and the N2 acceptance branch in gate evaluation; `verificationLevelMet` now strictly checks for `N3`
- Update module contract comment to reflect RFC-0715 change

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes (existing tests for `--pilot-n2-exception` must be updated/removed)

- **N2 grandfathering:** Existing N2-published records remain valid and are not affected. The gate change only applies to new publication attempts. Re-publishing an N2 record requires upgrading to N3 (sign + timestamp + approve N3).

**Completion criterion:** `--pilot-n2-exception` flag removed from registration and handler, gate requires N3 only, N2 grandfathering documented in code comment.

**Human review:** no

---

### Step 9. Extend `nachweis.validate` with N3 artifact check

**Goal:** Validate N3 artifacts are present for N3 records.

**Agent actions:**

- Modify `packages/os/site-kernel-handoff/src/nachweis/nachweis-validate.ts`
- After existing gate evaluation, for records with `verificationLevel: N3` in Bordbuch metadata: check for presence of `nachweis-signed` and `nachweis-timestamped` Bordbuch entries
- If missing, add a violation: `N3_ARTIFACTS_MISSING` with details
- Does NOT perform cryptographic re-validation — that is the operator's responsibility via `nachweis.verify-signature`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `nachweis.validate` reports violations when N3 records lack signature or timestamp Bordbuch entries.

**Human review:** no

---

### Step 10. Register new commands in `nachweis.module.ts`

**Goal:** Wire 4 new commands into the kernel module.

**Agent actions:**

- Modify `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts`
- Add dynamic imports for `runNachweisKeyEnsure`, `runNachweisSign`, `runNachweisTimestamp`, `runNachweisVerifySignature`
- Register 4 new commands with correct names, descriptions, scopes, flags, reads/writes
- Update module contract comment

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** All 4 new commands registered in `createNachweisModule`.

**Human review:** no

---

### Step 11. Add `.gitignore` pattern for key files

**Goal:** Prevent accidental key file commits.

**Agent actions:**

- Add `*.key` pattern to `.gitignore` (anchored if needed — but `*.key` is a global pattern, appropriate here)

**Validation:**

- `git check-ignore test.key` returns success

**Completion criterion:** `*.key` in `.gitignore`.

**Human review:** no

---

### Step 12. Unit tests

**Goal:** Test all new commands and N3 gate logic.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/nachweis-n3-sign.test.ts` — test `nachweis.sign`: generates keypair, signs record, verifies Bordbuch entry
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-n3-timestamp.test.ts` — test `nachweis.timestamp`: mock TSA adapter, verify Bordbuch entry
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-n3-verify-signature.test.ts` — test `nachweis.verify-signature`: valid and invalid signatures
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-n3-key-ensure.test.ts` — test `nachweis.key.ensure`: key generation, `--force` flag, refusal to overwrite
- Extend `packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts` — test N3 gate in `nachweis.approve`: fails without signature/timestamp, succeeds with both; test `--pilot-n2-exception` removal from `nachweis.publish`
- Mock `fetch` for TSA tests using `vi.stubGlobal`
- Mock filesystem for key file tests using temp directories

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** All test files created, tests pass, N3 gate and pilot-n2-exception removal covered.

**Human review:** no

---

### Step 13. Documentation sync

**Goal:** Update AGENTS.md, command manifest, Compass.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` with N3 workflow rules: key file security, TSA adapter pattern, N3 gate behavior, `--pilot-n2-exception` removal note
- Run `pnpm exec site-kernel run command.manifest.generate` to update `docs/command-manifest.generated.yaml`
- Check `docs/verification-plan.xml` for needed sync (add new Bordbuch kinds if verification surface references them)
- Update RFC-0707 (archived/implemented) `amendedBy` field to include `RFC-0715` (fix V-19 warning)

**Validation:**

- `git diff docs/command-manifest.generated.yaml` shows 4 new commands
- `rfc.validate --id RFC-0715` passes with 0 errors

**Completion criterion:** AGENTS.md updated, command manifest regenerated, V-19 warning resolved.

**Human review:** no

---

### Final Step. Review, fix, verify acceptance criteria, stamp implemented

**Goal:** Code review, fix findings, verify all acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run `fo-review` via skill tool on all session code changes
- Run `fo-fix` if findings (max 3 iterations)
- Verify each acceptance criterion in RFC-0715 against implemented code, mark `[x]` with evidence
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0715`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0715` (if acceptance probes declared)
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0715 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `rfc.validate --id RFC-0715` passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence, RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0715`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0715` in the subject line
- `docs/rfcs/verification/rfc-0715.generated.json` (if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Private key loss | Step 2: `nachweis.key.ensure` generates new key; old signatures remain valid via published public key |
| TSA unavailability | Step 5: no retry logic; operator retries manually; record stays signed (N2) until timestamp obtained |
| Agent misinterpretation | Step 7: N3 gate fails with clear `N3_GATE_FAILED` message listing missing artifacts |
| Key file in repository | Step 11: `.gitignore` pattern for `*.key` |
| Record payload hash determinism | Step 3: uses `@warpgogol/fingerprint` `stableJsonHash` (DNA-53) |
| Bordbuch growth | Out of scope — addressed by separate R2 scalability mission (m000034) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-34 (VC signing) or DNA-53 (fingerprint governance), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0715 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `@noble/ed25519` API is incompatible with the expected Ed25519 signature format, investigate the passport package's usage pattern (`packages/passport/src/sign.ts`) for the correct API calls before considering an alternative library.
