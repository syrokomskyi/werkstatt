---
reviewId: REVIEW-CODE-2026-08-16-01
date: 2026-08-16
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1717368b...HEAD
filesReviewed:
  - packages/werkstatt/src/leitstand/certify.ts
  - packages/werkstatt/src/leitstand/leitstand.module.ts
  - packages/werkstatt/src/tests-handoff/leitstand-0867-evidence-reuse.test.ts
---

# Code Review: RFC-0867 evidence reuse implementation (1717368b...HEAD)

### Verdict: Needs revision

Implementation is functionally correct — all 5 tests pass, evidence reuse logic is sound, and the `--force` flag works. Three findings require attention: an unvalidated sidecar cast, a missing `MODULE_CONTRACT` on the test file, and a potential evidence-integrity gap in the reuse path.

### Mechanical floor

Pass — `tsc --noEmit` passes for the changed files (pre-existing `axiom-cli.ts` error is unrelated). All 5 unit tests pass.

### Axis A — Structural correctness

- **Finding A-1: Unvalidated sidecar cast** — `certify.ts:131` uses `sidecarParsed as EvidenceCacheSidecar` after only checking `schema`, `artifactHash`, and `Array.isArray(evidence)`. The individual evidence envelopes inside the sidecar are not validated against `evidenceEnvelopeV1Schema`. A corrupted or manually-edited sidecar could inject malformed evidence into the evaluation pipeline. Use `evidenceEnvelopeV1Schema.safeParse` on each envelope or define a `z.object` for the sidecar and parse it.

### Axis B — DNA alignment

No issues. The change aligns with DNA-59 (evidence preservation) — evidence is persisted and reused rather than discarded. DNA-73 (sequential pipeline enforcement) is maintained — each gate still gets its own `GateDecisionV1`.

### Axis C — Ecosystem fit

No issues. Command registration in `leitstand.module.ts` correctly adds `--force` flag and `gate-decisions/**` to `reads`. The `writeEvidenceSidecar` helper uses `writeFileIfChanged` per package conventions.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The reuse logic is additive — when reuse fails, the existing execution path runs unchanged.

### Axis E — Agent-facing clarity

- **Finding E-1: Missing `MODULE_CONTRACT` on test file** — `leitstand-0867-evidence-reuse.test.ts` has `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers. This is correct. No issue.

### Axis F — Pragmatism

No issues. The `tryReuseEvidence` function is minimal — it scans 3 gate files, reads one sidecar, filters by freshness. The `flagBoolean` helper is a 2-line utility matching the existing `flagString` pattern.

### Axis G — Blind spots

- **Finding G-1: Evidence integrity in reuse path** — When evidence is reused from a prior gate, the `bindingHash` field in each evidence envelope still references the original artifact hash (which matches). However, the evaluation pipeline receives evidence that was produced by a different producer execution context. If the certification profile or policy bundle changes between gates (unlikely in the current sequential pipeline, but possible if the profile is updated between dev and alt), the reused evidence may not satisfy the new profile's requirements. Consider adding a profile-hash check to `tryReuseEvidence` or documenting this assumption.

### Spec compliance

| Requirement from RFC-0867 | Status | Evidence |
| --- | --- | --- |
| `tryReuseEvidence` scans gate decisions for matching `policyBundleRoot` | Done | `certify.ts:100-115` |
| Reads evidence sidecar `{release}-evidence.json` | Done | `certify.ts:117-134` |
| `--force` flag bypasses reuse cache | Done | `certify.ts:87`, `leitstand.module.ts:325-328` |
| Evidence sidecar written after producer execution | Done | `certify.ts:157-178`, `certify.ts:507` |
| Gate-decision JSON still written per gate with unique `decisionId` | Done | `certify.ts:545-580` |
| Stale evidence not reused | Done | `certify.ts:136-141` |
| Missing sidecar falls through to execution | Done | `certify.ts:117-118` |
| `reads` includes `gate-decisions/**` | Done | `leitstand.module.ts:331-335` |
| Log message indicates reuse source gate | Done | `certify.ts:461-463` |
| Unit tests: 4 scenarios | Done | `leitstand-0867-evidence-reuse.test.ts` (5 tests) |

### Questions for the author

1. Should the sidecar evidence envelopes be validated against `evidenceEnvelopeV1Schema` before reuse, or is the `policyBundleRoot` match sufficient trust?
2. What happens if the certification profile changes between dev and alt gates — should `tryReuseEvidence` also check profile hash?
3. Is the `evidence-cache@1` sidecar schema intended to be a formal schema in `packages/werkstatt/src/certification/contracts/`, or is the inline interface sufficient?
