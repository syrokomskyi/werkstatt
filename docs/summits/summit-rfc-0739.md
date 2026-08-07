---
rfc: RFC-0739
createdAt: 2026-08-07
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 3
---

# Design Summit: RFC-0739

## Architect

### Findings

- **A1 (concern):** `PbpCurrencyConversionResult` extends `PbpDerivationResult` with a typed `value` and `trace` field. The `executeContract` dispatcher returns `PbpDerivationResult`. While structurally compatible (subtype), consumers that receive the result from `runDerivations` will see `PbpDerivationResult` and must downcast to access `trace`. This is a hidden coupling — the trace channel is only accessible to consumers that know the runtime type is `PbpCurrencyConversionResult`. The RFC should document this downcast pattern or propose a typed dispatch mechanism.
- **A2 (question):** The trace interface references `PbpRateDirection` and `PbpRateSnapshotSourceKind` from RFC-0737 and RFC-0738 without `@see` references. A new agent implementing this RFC would need to search for these types. Should the RFC add explicit `@see` references?

### No concerns

- Additive derivation branch in `executeContract` — no existing derivations are modified.
- DNA-1 and DNA-55 alignment is well-justified in the RFC body.
- Reversibility: the `currency-conversion` branch can be removed without affecting `first-year-cost` or `tco`.

## Security Engineer

### Findings

- **S1 (concern):** The trace includes `snapshotDigest` — a tamper-evident digest of the rate snapshot. While not PII, it could serve as a fingerprinting vector if exposed to client-side via the AI Answer Projection (RFC-0742). The RFC should specify whether the trace (or specific fields like `snapshotDigest`) is server-side only, or whether RFC-0742 should redact it in client-facing projections.

### No concerns

- No new trust boundaries — the derivation operates on the resolved graph in build-time.
- No API endpoints, no cookies, no client-side storage.
- Pricing data (amounts, rates) is public business information, not sensitive personal data.

## QA Engineer

### Findings

- **Q1 (concern):** Golden test vectors cover success paths (5 vectors) but do not cover failure modes. The RFC defines three failure modes (`PBP-CURRENCY-CONVERSION-NEGATIVE`, `PBP-CURRENCY-CONVERSION-ZERO`, `PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE`) but provides no test vectors for them. The plan should include negative test vectors that verify each failure mode produces the correct `status: "failed"` result.
- **Q2 (concern):** Currency with 0 decimal places (JPY, KRW, VND) — `decimalDivide` precision = target currency decimal places + 2 = 0 + 2 = 2. For large amounts divided by small rates, 2 decimal places of precision may be insufficient for accurate rounding. The RFC should clarify whether `precision` refers to decimal places after the decimal point or total significant digits, and verify that JPY/KRW conversions produce correct results.

### No concerns

- Acceptance criteria are checkable — each has a clear verification command (`tsc --noEmit`, `vitest run`, `rfc.validate`).
- Failure modes are well-defined with specific error codes.
- The fixed pipeline ordering eliminates combinatorial test explosion.

## Product Manager

### No concerns

- Problem statement is grounded in the multi-currency pricing program (RFC-0735).
- Scope is correctly bounded — `nonGoals` explicitly defer materialization (RFC-0740), build pipeline (RFC-0741), and price projection (RFC-0742).
- Rollout risk is low — the derivation is not invoked until RFC-0740 integrates it into the compiler pipeline.
- No direct user impact — this is a library-level contract.

## Developer Advocate

### Findings

- **D1 (concern):** The trace interface uses `PbpRateDirection` and `PbpRateSnapshotSourceKind` without `@see` references or import path hints. A new agent implementing this RFC would need to search `packages/pbp/src/` to find these types. The RFC should add `@see RFC-0737` and `@see RFC-0738` references or specify the import path (`@warpgogol/pbp` re-exports both types).

### No concerns

- Implementation notes are explicit with behavioral rules (fixed pipeline order, decimal-only arithmetic, price ending restrictions).
- TypeScript contracts are self-contained with concrete interfaces.
- File system responsibilities table clearly maps each file to its role.

## Consensus findings

- **A2 + D1 (2 personas — Architect + Developer Advocate):** The trace interface references `PbpRateDirection` and `PbpRateSnapshotSourceKind` without `@see` references. Both the architect (hidden dependency on RFC-0737/0738 types) and dev advocate (agent discoverability) flagged this. **Recommendation:** Add `@see RFC-0737` and `@see RFC-0738` references in the trace interface JSDoc, and note that both types are re-exported from `@warpgogol/pbp`.

## Unique findings

- **S1 (Security Engineer):** Trace exposure of `snapshotDigest` in client-facing projections. **Recommendation:** Add a note in implementation notes that trace is server-side only; RFC-0742 should redact `snapshotDigest` in client-facing AI projections.
- **Q1 (QA Engineer):** Missing negative test vectors for failure modes. **Recommendation:** The implementation plan should include test vectors for `PBP-CURRENCY-CONVERSION-NEGATIVE`, `PBP-CURRENCY-CONVERSION-ZERO`, and `PBP-CURRENCY-CONVERSION-ENDING-INCOMPATIBLE`.
- **Q2 (QA Engineer):** Zero-decimal currency precision. **Recommendation:** Add a golden test vector for JPY (0 decimal places) to verify `decimalDivide` precision = 2 is sufficient.
- **A1 (Architect):** `PbpCurrencyConversionResult` downcast pattern in `executeContract`. **Recommendation:** Document the downcast in implementation notes — consumers of `runDerivations` results that need trace access should check `derivationRef === "currency-conversion"` and cast to `PbpCurrencyConversionResult`.

## Recommendation

**Revise the RFC** — 1 consensus finding and 4 unique findings, all minor. Route through `fo-idea-enhance` to add `@see` references, trace exposure note, and downcast documentation. The QA findings (negative test vectors, JPY test vector) should be addressed in the implementation plan rather than the RFC itself.

No findings does not mean no issues — it means no issues were found from these five perspectives.
