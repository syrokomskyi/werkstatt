# Code Review — RFC-0715 Full Implementation

- **Date:** 2026-08-06
- **Reviewer:** fo-review (automated)
- **Scope:** `6c46c596..39bed0e2` (12 commits, full RFC-0715 session)
- **Files:** 29 files changed, +3092/-49

## Mechanical floor

| Check                                          | Result       |
| ---------------------------------------------- | ------------ |
| `tsc --noEmit` (site-kernel-handoff)           | ✓ pass       |
| `tsc --noEmit` (ontology)                      | ✓ pass       |
| `tsc --noEmit` (share)                         | ✓ pass       |
| `vitest run` (nachweis-commands + nachweis-n3) | ✓ 48/48 pass |

## Axis A — Structural correctness

| Item | Result | Evidence |
| --- | --- | --- |
| Strict typing | ✓ pass | All interfaces typed, no `any` |
| No magic numbers | ✓ pass |  |
| Minimalism | **FAIL** — Duplicated Code | `flagString`/`flagBool` duplicated across 6 files (nachweis-key-ensure, nachweis-sign, nachweis-timestamp, nachweis-verify-signature, nachweis-approve, nachweis-publish). Should be extracted to a shared helper. |
| Dead code | ✓ pass |  |
| Error handling | ✓ pass | All catch blocks have context |
| Fowler: Duplicated Code | **FAIL** | `createCustomTsaAdapter` in `nachweis-timestamp.ts:182-201` duplicates `FreeTsaAdapter.timestamp` logic — both do `encodeTimestampReq` → `fetch` → `arrayBuffer`. Should be a single `HttpTsaAdapter` class. |
| Fowler: Shotgun Surgery | **FAIL** | `flagString`/`flagBool` are copy-pasted to every new command file. Adding a new flag helper requires editing all files. |

## Axis B — DNA alignment

| Invariant | Result | Evidence |
| --- | --- | --- |
| DNA-53 (fingerprint governance) | **FAIL** | `nachweis-sign.ts:197-199` uses `node:crypto` `createHash("sha256")` for `payloadHash` instead of `byteHash` from `@warpgogol/fingerprint`. `tsa-adapter.ts:22,58` uses `node:crypto` `createHash("sha256")` for messageImprint instead of `byteHash`. DNA-53: "New ad hoc direct hashing helpers are forbidden outside the package." |
| DNA-34 (passport key separation) | ✓ pass | nachweis-key-ensure generates its own Ed25519 keypair, does not import from passport |

## Axis C — Ecosystem fit

| Item | Result | Evidence |
| --- | --- | --- |
| Package boundaries | ✓ pass | All imports flow packages → packages |
| `@noble/ed25519` dependency | ✓ pass | Declared in package.json |
| `pkijs`/`asn1js` dependencies | ✓ pass | Declared in package.json |
| Dynamic imports for heavy deps | ✓ pass | `pkijs`/`asn1js` dynamically imported in tsa-adapter.ts |
| `writeFileIfChanged` for generated files | ✓ pass | nachweis-key-ensure.ts:115 uses `writeFileIfChanged` for pubkey JSON |

## Axis D — Forward-only discipline

| Item | Result | Evidence |
| --- | --- | --- |
| No backward compatibility layers | ✓ pass | `--pilot-n2-exception` removed, not kept behind a flag |
| No dual-path | ✓ pass |  |

## Axis E — RFC contract alignment

| Item                         | Result | Evidence                                          |
| ---------------------------- | ------ | ------------------------------------------------- |
| RFC-0715 acceptance criteria | ✓ pass | All 16 criteria checked with evidence annotations |
| RFC-0715 N3 gate             | ✓ pass | Implemented in nachweis-approve.ts:117-142        |

## Axis F — Agent clarity

| Item                    | Result | Evidence                                                    |
| ----------------------- | ------ | ----------------------------------------------------------- |
| AGENTS.md rules         | ✓ pass | Nachweis N3 workflow rules added                            |
| MODULE_CONTRACT headers | ✓ pass | All 5 new files have MODULE_CONTRACT + CHANGE_SUMMARY       |
| Command descriptions    | ✓ pass | All 4 new commands have descriptions in module registration |

## Axis G — Test coverage

| Item | Result | Evidence |
| --- | --- | --- |
| New commands tested | ✓ pass | 18 tests in nachweis-n3.test.ts |
| N3 gate tested | ✓ pass | Tests for: both missing, signature only missing, timestamp only missing, both present |
| Idempotency tested | ✓ pass | Sign idempotency tested, timestamp idempotency tested |
| Verify-signature tested | ✓ pass | Valid signature, tampered evidence, missing signature |

## Findings

### F1 — DNA-53 violation: `node:crypto` createHash in nachweis-sign.ts (Axis B, **critical**)

`nachweis-sign.ts:195-201` uses `node:crypto` `createHash("sha256")` for `payloadHash` instead of `byteHash` from `@warpgogol/fingerprint`. DNA-53 forbids ad hoc hashing outside the fingerprint package.

**Fix:** Replace with `byteHash(canonicalBytes)` from `@warpgogol/fingerprint`.

### F2 — DNA-53 violation: `node:crypto` createHash in tsa-adapter.ts (Axis B, **critical**)

`tsa-adapter.ts:22,58` uses `node:crypto` `createHash("sha256")` for the RFC 3161 messageImprint hash instead of `byteHash`.

**Fix:** Replace with `byteHash` from `@warpgogol/fingerprint`. Note: `byteHash` returns `sha256:`-prefixed hex; the TSA adapter needs raw bytes. Use `Buffer.from(byteHash(message).replace("sha256:", ""), "hex")` or import `byteHash` and strip the prefix.

### F3 — Duplicated Code: `flagString`/`flagBool` in 6 files (Axis A, **warning**)

`flagString` and `flagBool` are copy-pasted to every nachweis command file. This is a Shotgun Surgery smell — adding a new flag helper requires editing all files.

**Fix:** Extract to `nachweis-n3-types.ts` (already a shared module) or a new `nachweis-flags.ts`.

### F4 — Duplicated Code: `createCustomTsaAdapter` duplicates `FreeTsaAdapter` (Axis A, **warning**)

`nachweis-timestamp.ts:182-201` `createCustomTsaAdapter` duplicates the `FreeTsaAdapter.timestamp` method — both do `encodeTimestampReq` → `fetch` → `arrayBuffer`.

**Fix:** Replace `FreeTsaAdapter` and `createCustomTsaAdapter` with a single `HttpTsaAdapter` class that takes a URL and name via constructor. `FreeTsaAdapter` becomes `new HttpTsaAdapter("FreeTSA", "https://freetsa.org/tsr")`.

## Verdict

**Conditional pass** — F1 and F2 (DNA-53 violations) must be fixed. F3 and F4 (code smells) should be fixed.
