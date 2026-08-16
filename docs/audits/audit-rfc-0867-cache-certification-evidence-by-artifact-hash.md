---
rfcId: RFC-0867
auditId: AUDIT-RFC-0867-01
date: 2026-08-16
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0867

## Verdict: Needs revision

The RFC has a fundamental design flaw: it proposes reusing `EvidenceEnvelopeV1[]` from prior gate-decision JSON files, but `GateDecisionV1` does not contain evidence envelopes — only `selectedEvidence` references (evidenceId, evidenceHash, selectedAt). The reuse mechanism as described cannot work without either changing the gate-decision schema (which the RFC explicitly non-goals) or introducing a separate evidence persistence file. Additionally, `satisfies` is empty (V-24 error), and the `reads` field in the command registration is not updated to include `gate-decisions/**`.

## Mechanical validation (rfc.validate)

Fail — 1 error, 1 warning:

- **V-24 (error)**: `satisfies: []` — architecture RFC created 2026-08-16 must declare at least one DNA invariant (RFC-0331).
- **V-19 (warning)**: `amends: [RFC-0866]` but RFC-0866 `amendedBy` does not include RFC-0867. Expected — RFC-0866 is `implemented` and archived; the enhance step should add RFC-0867 to its `amendedBy`.

## Axis A — Structural completeness

- **A-1 (FAIL)**: TypeScript contracts section defines `EvidenceCacheEntry` with `evidence: EvidenceEnvelopeV1[]`, but the RFC does not explain where this evidence array is persisted. `GateDecisionV1` (in `packages/werkstatt/src/certification/contracts/decisions.ts:33-48`) contains only `selectedEvidence` references (`evidenceId`, `evidenceHash`, `selectedAt`), not full evidence envelopes. The `tryReuseEvidence` function comment says "Scan gate-decisions/{releaseId}-*.json for matching artifactHash" — but the gate-decision JSON does not contain `artifactHash` (it has `policyBundleRoot` which is set to the artifact hash) and does not contain evidence envelopes. The RFC must either: (a) introduce a separate evidence persistence file, (b) add an `artifactHash` field and evidence envelopes to `GateDecisionV1` (which conflicts with the non-goal "Does not change the gate decision schema"), or (c) clarify that evidence envelopes are persisted elsewhere (e.g., in the dossier or a sidecar file).

- **A-2 (FAIL)**: File system responsibilities table lists `gate-decisions/{release}-{gate}.json` for both "Read for prior evidence reuse" and "Written per gate (unchanged)" — but the `reads` field in the command registration at `packages/werkstatt/src/leitstand/leitstand.module.ts:327-330` does not include `gate-decisions/**`. The RFC must update the `reads` field to include `systems-cache/{system}/gate-decisions/**`.

- **A-3 (PASS)**: Decision is present tense. CLI surface shows exact invocations. Failure modes specify stale/missing/force behavior. Rollout describes default behavior. Alternatives section has 3 real alternatives with rejection reasons. Risks section covers stale evidence and agent confusion. Acceptance criteria are checkable.

## Axis B — DNA alignment

- **B-1 (FAIL)**: `satisfies: []` is empty — V-24 error. This RFC amends RFC-0866 which satisfies DNA-49 (fleet propagation), DNA-73 (sequential deployment pipeline), and DNA-59 (evidence preservation). RFC-0867 should declare at least one of these in `satisfies`. DNA-59 (evidence preservation) is most relevant since the RFC reuses evidence. DNA-49 is also relevant since it covers the Leitstand certification pipeline.

- **B-2 (PASS)**: The RFC does not establish a new DNA invariant. It does not conflict with existing DNA invariants — it adds a cache layer without changing the authority, dossier, or gate decision schema (per its non-goals).

## Axis C — Ecosystem fit

- **C-1 (FAIL)**: The `reads` field in the command registration (`leitstand.module.ts:327-330`) is not updated to include `systems-cache/{system}/gate-decisions/**`. The RFC proposes reading prior gate-decision JSON files, but the command registration only lists `system-config.yaml` and `system-state.yaml` in `reads`. This must be updated.

- **C-2 (PASS)**: Package boundaries are correct — all changes are in `@warpgogol/werkstatt`. No cross-package import issues.

- **C-3 (PASS)**: `commands.changed: [leitstand.certify]` is correct — the command was added in RFC-0866 (now implemented) and this RFC changes it. No new commands are proposed.

- **C-4 (PASS)**: No AGENTS.md updates needed — the change is internal to the certify command handler.

## Axis D — Forward-only compliance

- **D-1 (PASS)**: No backward compatibility shims or dual paths. The `--force` flag is a bypass, not a legacy path. Evidence reuse is a new optimization, not a compatibility layer.

- **D-2 (PASS)**: The RFC amends RFC-0866's certify pipeline directly — no parallel interpretation. Legacy code paths (unconditional producer execution) are replaced, not maintained behind a flag.

## Axis E — Agent-facing policy

- **E-1 (PASS)**: No self-authorizing language. Implementation notes reference correct governance rules (RFC-0224, RFC-0334).

- **E-2 (PASS)**: No NEEDS CLARIFICATION markers.

- **E-3 (PASS)**: No storage policy issues — no cookies, no client-side persistence. Server-side persistence uses existing `gate-decisions/` directory in the cache clone.

## Axis F — Pragmatism

- **F-1 (PASS)**: `--force` flag is a minimal addition to an existing command. No new command proposed — the optimization is internal to `leitstand.certify`.

- **F-2 (PASS)**: `EvidenceCacheEntry` type is minimal (4 fields). No speculative generality.

- **F-3 (FAIL)**: The RFC does not check whether the gate-decision JSON actually contains the data needed for reuse. The existing `GateDecisionV1` schema does not store `artifactHash` or `EvidenceEnvelopeV1[]` — the RFC's design assumes data that is not persisted. This is a pragmatism failure: the design was not validated against the actual schema.

## Axis G — Blind spots

- **G-1 (FAIL)**: The RFC does not address what happens when the gate-decision JSON exists but the evidence envelopes are not available (because they were never persisted). The `tryReuseEvidence` function returns `EvidenceCacheEntry | null`, but there is no code path for "gate-decision exists but evidence is missing" — this should fall through to producer execution, but the RFC does not make this explicit.

- **G-2 (FAIL)**: The RFC does not consider concurrent certification requests. If two agents run `leitstand.certify` for the same release+gate simultaneously, both might read the same prior gate-decision and both might try to reuse the same evidence. The gate lock manager (`CERT-ORCHESTRATOR-03`) handles per-release+gate mutual exclusion, but the RFC should clarify that the reuse path is also protected by the lock.

- **G-3 (PASS)**: Edge cases for missing prior gate and stale evidence are covered in the failure modes section.

## Questions for the author

1. Where are `EvidenceEnvelopeV1[]` persisted? `GateDecisionV1` only contains `selectedEvidence` references (evidenceId, evidenceHash), not full evidence envelopes. The reuse mechanism requires the full evidence array to pass to `evaluateCertificationDecision()`. Does the RFC propose a separate evidence persistence file, or does it need to add evidence envelopes to the gate-decision JSON (which conflicts with the non-goal)?

2. How does `tryReuseEvidence` match the artifact hash? `GateDecisionV1` has `policyBundleRoot` (set to `artifactHash` in code) but no explicit `artifactHash` field. Should the RFC use `policyBundleRoot` as the match key, or should it add an `artifactHash` field to `GateDecisionV1`?

3. Should the `reads` field in the `leitstand.certify` command registration be updated to include `systems-cache/{system}/gate-decisions/**`? The current registration only lists `system-config.yaml` and `system-state.yaml`.
