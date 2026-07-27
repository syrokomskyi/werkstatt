---
rfcId: RFC-0535
auditId: AUDIT-RFC-0535-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0535

## Verdict: Approved

The RFC is a well-scoped, additive extension of an existing command. All claims about the codebase (Claim schema, EvidenceSource schema, existing `wikidata.validate` structure, command table location, `escalateMissingQidWarnings` function) are verified accurate. No failures on axes B, D, or E. Minor findings on axes C and F are addressable during enhance.

## Mechanical validation (rfc.validate)

Pass — zero violations. `rfc.validate RFC-0535 --json` returns `status: "pass"`.

## Axis A — Structural completeness

No issues. All sections contain real content — no template placeholders remain. Decision is present tense ("The `wikidata.validate` command gains four additional validation rules"). CLI surface shows exact command invocations. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Output format documents the `--json` shape with a full example. Failure modes specifies QID-gating, empty directories, malformed frontmatter, and `--strict` escalation. Rollout describes default behavior, adoption path, and new-app compliance. Alternatives section has five real alternatives with rejection reasons. Risks covers false positives, performance, agent misinterpretation, and maintenance burden. Acceptance criteria are checkable and sufficient. Implementation notes are explicit behavioral rules with MUST/MAY/MUST NOT.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for `kind: command` — `satisfies` is required only for architecture/contract RFCs. DNA-16 in `related` is appropriate: the RFC extends the semantic validation chain, which is adjacent to DNA-16's concern (semantic outputs derived from same topology), but does not modify the invariant itself. No conflicts with any existing DNA invariant.

## Axis C — Ecosystem fit

**Minor finding C-1:** The command table entry at `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts:194-210` has `description: "Validate PBP content and rendered JSON-LD for Wikidata integration readiness (RFC-0531)."`. After this RFC, the description should reference RFC-0535 as well (e.g. `(RFC-0531, RFC-0535)`). The RFC does not mention updating the command table description. This is a documentation drift risk — the command table is the machine-readable source of command metadata.

**Minor finding C-2:** The command table `reads` field (line 206-209) lists `<app>/src/content/system.md` and `<app>/dist/client/**/*.html` but does not list `<app>/src/content/business-profile/{lang}/claims/*.md` or `<app>/src/content/business-profile/{lang}/evidence-sources/*.md`. After this RFC, the `reads` field should include these paths. The RFC's file system responsibilities table lists them but does not mention updating the command table `reads` array.

No other issues. Package boundaries are correct (`@gogol/site-kernel-checks`). Pipeline placement (standalone) is justified. Command lifecycle (`commands.changed: [wikidata.validate]`) is correct.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — four new rules added to an existing command. No compatibility shim, no dual-path, no backward compatibility layer. No legacy code paths maintained behind a flag. No deprecation.

## Axis E — Agent-facing policy

No issues. No self-authorizing language — the RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Anti-fabrication: acceptance criteria are all about code changes (pure functions, I/O helper, tests), not content authoring. No persistence changes — no cookies, no `document.cookie`, no `Set-Cookie`.

## Axis F — Pragmatism

**Minor finding F-1:** The RFC proposes extending `escalateMissingQidWarnings` (line 185-195 of `wikidata.ts`) to escalate `wikidata.no-notability-evidence` and `wikidata.claim-without-evidence` in addition to `*-missing-qid` rules. The function name `escalateMissingQidWarnings` will become misleading after extension — it will escalate not just missing-QID warnings but also notability and claim-evidence warnings. The RFC should mention renaming the function to something like `escalateStrictWarnings` or `escalateWikidataWarnings` to reflect its broader scope. This is a naming issue, not a design flaw.

No other issues. Minimal command surface (extends existing command, no new command). Lean contracts (minimal type signatures). Existing patterns followed (`readPbpEntity` pattern, `AuditFinding` shape, `buildAuditResult` helper). Scope discipline is good — `packagesImpacted` lists only `@gogol/site-kernel-checks`, `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

No issues. Performance addressed ("10-30 files, negligible impact"). False positives addressed for both notability evidence (`verified-record` excluded) and claim evidence coverage (self-evident claims). Edge cases addressed (empty directories, malformed frontmatter). Migration path documented ("no migration, no content changes required"). No security/privacy implications (no user data, PII, or external services).

## Questions for the author

1. Should the command table `reads` array be updated to include `claims/*.md` and `evidence-sources/*.md` paths? (Finding C-2)
2. Should `escalateMissingQidWarnings` be renamed to reflect its broader scope after this RFC? (Finding F-1)
3. Should the command table description reference RFC-0535 alongside RFC-0531? (Finding C-1)
