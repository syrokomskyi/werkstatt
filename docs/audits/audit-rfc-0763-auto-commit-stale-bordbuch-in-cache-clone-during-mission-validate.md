---
rfcId: RFC-0763
auditId: AUDIT-RFC-0763-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: rejected
---

# Audit: RFC-0763

## Verdict: Rejected

RFC-0763 proposes functionality that is **already implemented** in the codebase by two already-implemented RFCs (RFC-0724 and RFC-0749). The exact code the RFC's Design section describes — a post-validation `commitBordbuchProjections` cleanup call in `mission.validate` — exists at `mission-materialization-commands.ts:602-613`, labeled `// RFC-0749`. The RFC is a complete duplicate and should be rejected or superseded by RFC-0749.

## Mechanical validation (rfc.validate)

**Pass** with 1 warning:
- **V-19**: `RFC-0763.amends includes RFC-0702, but RFC-0702.amendedBy does not include RFC-0763`. RFC-0702 is already `implemented` and archived — its `amendedBy` field includes RFC-0724 but cannot be retroactively updated by a new draft RFC without a supersede chain.

## Axis A — Structural completeness

- **F-A1 (FAIL)**: The RFC's Design section (lines 83-96) proposes code that **already exists verbatim** in the codebase. `mission-materialization-commands.ts:602-613` contains a post-validation `commitBordbuchProjections` call with try/catch, `logger.info` on success, and `logger.warn` on failure — implemented by RFC-0749. The RFC's TypeScript contract is a near-copy of the existing code.
- **F-A2 (FAIL)**: The RFC's File system responsibilities table (line 104) lists `bordbuch/bordbuch-commit-helper.ts` as the location of `commitBordbuchProjections`. The function actually lives in `bordbuch/bordbuch-commit.ts` (line 49). `bordbuch-commit-helper.ts` contains different helpers (`appendAndCommitBordbuch`, `appendBatchAndCommitBordbuch` from RFC-0750).

## Axis B — DNA alignment

- **F-B1 (FAIL)**: `satisfies: [DNA-46]` — the RFC claims to enforce DNA-46 (Mission lifecycle) by ensuring the cache clone is clean for `mission.reconcile`. However, DNA-46 is already enforced in this aspect by RFC-0749 (implemented). The RFC does not explain what gap in DNA-46 enforcement remains after RFC-0749.
- **F-B2 (WARN)**: `related: [DNA-46, RFC-0355, RFC-0356]` — RFC-0355 and RFC-0356 are the establishing RFCs for DNA-46 and DNA-47. The RFC does not reference RFC-0749 or RFC-0724, which are the directly relevant implemented RFCs that already solve this problem.

## Axis C — Ecosystem fit

- **F-C1 (FAIL)**: The RFC amends RFC-0702, but RFC-0702 is already `implemented` and archived. Amending an archived RFC is architecturally incorrect — the amend should target RFC-0749 (the RFC that added the post-validation cleanup), or the RFC should supersede RFC-0749 if it changes the behavior. Instead, RFC-0763 proposes the same behavior RFC-0749 already implemented.
- **F-C2 (FAIL)**: `packagesImpacted` lists `@warpgogol/site-kernel-handoff` — correct package, but the change already exists there. No new code is needed.

## Axis D — Forward-only compliance

No issues. The RFC does not propose backward compatibility layers or dual-paths. However, the RFC itself is redundant — the forward-only path is already in the codebase.

## Axis E — Agent-facing policy

- **F-E1 (FAIL)**: The RFC's Context section (line 57) states the problem was "observed during missions `warpgogol-com-m000024` and `warpgogol-com-m000039`." RFC-0749 (implemented 2026-08-08) already resolved this exact problem. The RFC does not mention RFC-0749 at all, creating a false impression that the problem is unresolved.
- No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

- **F-F1 (FAIL)**: The RFC proposes a new code change that is entirely unnecessary — the code already exists. This is the ultimate pragmatism failure: zero new value, duplicate effort.
- **F-F2 (WARN)**: The RFC's `amends: [RFC-0702]` is incorrect — RFC-0702 made `commitBordbuchProjections` non-throwing and added the reuse-path cleanup. RFC-0749 added the post-validation cleanup. If this RFC were needed (it isn't), it should amend RFC-0749, not RFC-0702.

## Axis G — Blind spots

- **F-G1 (FAIL)**: The RFC does not consider that the problem it describes may already be solved. There is no mention of RFC-0749 or RFC-0724 anywhere in the document. The RFC's Context, Problem, and Alternatives sections all describe a state that no longer exists in the codebase.
- **F-G2 (WARN)**: The RFC's Alternatives section (line 126) rejects "Move cleanup to `mission.reconcile`" — but this alternative was already evaluated and rejected by RFC-0749 (line 109). The RFC re-evaluates a decision already made.

## Questions for the author

1. **Why does this RFC exist when RFC-0749 (implemented 2026-08-08) already added the exact post-validation `commitBordbuchProjections` cleanup call at `mission-materialization-commands.ts:602-613`?** The code the RFC proposes is already in the codebase.
2. **Why does the RFC amend RFC-0702 instead of RFC-0749?** RFC-0702 added the reuse-path cleanup and made `commitBordbuchProjections` non-throwing. RFC-0749 added the post-validation cleanup — which is what this RFC proposes.
3. **Was the operator aware of RFC-0749 when this RFC was drafted?** The RFC's Context describes a problem state ("The operator must manually `git add && git commit`") that RFC-0749 already resolved. If the problem persists despite RFC-0749, the RFC should describe what specific scenario RFC-0749 does not cover.
