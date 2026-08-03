---
rfcId: RFC-0667
auditId: AUDIT-RFC-0667-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0667

## Verdict: Needs revision

The RFC correctly formalizes the `missionId` ↔ `auditId` boundary adapter pattern and the codebase implementation is solid. However, the TypeScript contracts section contains illustrative pseudo-code that diverges from the actual implementation in four specific ways, and the Problem section raises a `validTimeStart` concern that the Design section doesn't address.

## Mechanical validation (rfc.validate)

Pass — 0 errors.

## Axis A — Structural completeness

1. **TypeScript contracts diverge from actual code — `readEvidenceMetadata` function**: The RFC (line 171-179) shows a standalone `readEvidenceMetadata` function in `axiom-adapter.ts`. The actual code reads metadata inline in `runAxiomReport` (`packages/os/site-kernel-checks/src/axiom-adapter.ts:345-365`), not via a separate function. Agents following the RFC's TypeScript contracts would look for a function that doesn't exist.

2. **TypeScript contracts diverge from actual code — `EvidenceMetadata` interface ownership**: The RFC (line 163-168) shows a locally-defined `interface EvidenceMetadata` in `axiom-adapter.ts`. The actual code imports `EvidenceMetadata` from `@syrokomskyi/axiom-factory-app/run/report` (line 34-35) and re-exports it (line 45). The boundary type is owned by the external package, not defined locally in werkstatt. This is actually the correct pattern (external package owns the external type), but the RFC's TypeScript contracts misrepresent it.

3. **TypeScript contracts diverge from actual code — `auditId` optionality**: The RFC (line 183-188) shows `auditId: string` (required) for `EvidenceMetadata` in `evidence-fetch.ts` and `evidence-sync.ts`. The actual interfaces in both files use `auditId?: string` (optional) — `evidence-sync.ts:47` and `evidence-fetch.ts:52`. The optionality is semantically important: the code reads `auditId` as an optional field from the JSON, not a required one.

4. **TypeScript contracts diverge from actual code — `leitstand.propagate` fallback**: The RFC (line 192) shows `const evidenceAuditId = metadata.auditId ?? metadata.missionId;` followed by a strict mismatch check. The actual code at `leitstand-commands.ts:1121` does `if (metadata.auditId && metadata.auditId !== missionId)` — it only checks `auditId` if present, and does NOT fall back to `metadata.missionId`. The actual code is more lenient than the RFC's contract: if `auditId` is absent, the check is skipped entirely (the evidence is still accepted via the methodologies gate at line 1134-1142).

5. **CLI surface example incomplete**: The `mission.check` example (line 148) shows `--mission warpgogol-com-m000027 --external-preview` but omits `--base-url`, which is required by the actual code (`axiom-adapter.ts:164-166`).

6. **`validTimeStart` raised in Problem but not addressed in Design**: Failure mode #4 (line 112) describes `validTimeStart` set to `git:${commitSha}` instead of an ISO 8601 timestamp. The Decision, Design, and acceptance criteria do not address `validTimeStart`. If this is an external Axiom CLI bug (the `orchestrator.ts` is in the external project), the RFC should state that explicitly. If werkstatt code was involved, the Design section should describe the fix.

## Axis B — DNA alignment

No issues. `DNA-48` (Release discipline) and `DNA-59` (Evidence preservation) are real invariants. The RFC explains how `leitstand.propagate` protects DNA-48 by formalizing the `auditId` comparison, and how `evidence-metadata.json` schema stability protects DNA-59.

## Axis C — Ecosystem fit

1. **No AGENTS.md updates identified**: The RFC establishes a boundary governance rule (`missionId` internal, `auditId` external, mapping in `axiom-adapter.ts`). The "Implementation notes for agents" section (lines 260-267) has agent-facing rules, but the RFC doesn't identify which `AGENTS.md` files need rule updates. Agents working in `packages/os/site-kernel-checks/` and `packages/os/site-kernel-handoff/` need to know this boundary pattern. Consider adding a rule to the relevant `AGENTS.md` files or explicitly stating that the RFC's implementation notes are the sole governance surface.

## Axis D — Forward-only compliance

No issues. The `raw.auditId ?? raw.missionId ?? missionId` fallback chain is a read-side resilience mechanism for historical evidence files, not a dual-path compatibility shim. Evidence files are immutable historical records — they cannot be "migrated." New evidence files are written with `auditId` by the external Axiom CLI. The fallback only affects the read path.

## Axis E — Agent-facing policy

1. **Draft RFC with all acceptance criteria checked**: The RFC status is `draft` but all 9 acceptance criteria are marked `[x]` with evidence, and the Rollout section says "Already implemented." This is a post-hoc RFC documenting existing implementation. While this is a valid workflow, the RFC should explicitly state it is post-hoc to avoid agent confusion. The "Implementation notes for agents" section says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" — but the code is already implemented, which could confuse agents about whether they need to wait for acceptance.

## Axis F — Pragmatism

No issues beyond the TypeScript contract discrepancies in Axis A. The RFC formalizes an existing pattern without proposing new commands. `packagesImpacted` and `appsImpacted` lists are accurate. `nonGoals` are meaningful and explicit.

## Axis G — Blind spots

1. **Silent fallback on external `auditId` rename**: The Risks section (line 242) mentions that if the external Axiom CLI renames `auditId` again, the adapter will need updating. But the current fallback chain (`raw.auditId ?? raw.missionId ?? missionId`) would silently fall back to `missionId` if `auditId` disappears — producing no error or warning. There is no detection mechanism (e.g., a log warning when `auditId` is absent and `missionId` fallback is used). This could mask a real breaking change in the external CLI.

2. **`leitstand.propagate` lenient check not documented as intentional**: The actual code at `leitstand-commands.ts:1121` skips the `auditId` check when `auditId` is absent (`if (metadata.auditId && ...)`). This is more lenient than the RFC's contract (line 192-195) which always checks. The RFC should document whether this leniency is intentional (backward compatibility with pre-auditId evidence) or a gap that should be tightened.

## Questions for the author

1. The TypeScript contracts section shows code that doesn't match the actual implementation in four ways (function name, interface ownership, optionality, fallback logic). Should the contracts be updated to match the actual code, or should the code be updated to match the contracts? If the former, mark the section as illustrative pseudo-code. If the latter, file code changes.
2. The `validTimeStart` failure mode (#4) is described in the Problem section but not addressed in the Design section. Is this an external Axiom CLI concern that should be explicitly scoped out, or a werkstatt concern that needs a Design section fix?
3. The `leitstand.propagate` code skips the `auditId` check when `auditId` is absent, but the RFC's contract shows an unconditional check. Is the leniency intentional for backward compatibility, and should the RFC document it?
