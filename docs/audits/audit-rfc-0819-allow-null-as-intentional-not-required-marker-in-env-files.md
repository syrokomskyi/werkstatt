---
rfcId: RFC-0819
auditId: AUDIT-RFC-0819-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0819

## Verdict: Needs revision

The RFC is pragmatically sound — a one-line `fixHint` change in `deploy.preflight` to document the existing `null` convention. Two findings: the file system responsibilities table names `AGENTS.md` as the documentation target, but root AGENTS.md delegates env-and-deploy details to `docs/policies/agent-surface-ops.md`; and the acceptance criteria don't explicitly cover `.env.dev` files (RFC-0806), though the code change is in a shared path.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense ("The `null` string value is the standard marker..."). CLI surface shows exact commands including `--dev` flag. TypeScript contracts show the minimal one-line diff. Acceptance criteria are checkable and sufficient (7 items covering the fixHint change, pass/fail behavior, `.env.example` invariant, and documentation).

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for `kind: policy` (required only for architecture/contract RFCs). `related: [DNA-40]` is appropriate — the RFC extends a usage pattern within the DNA-40 env contract without modifying the invariant itself. The Architectural fit section correctly states "does not change the DNA invariant itself — it adds a usage pattern within the existing contract."

## Axis C — Ecosystem fit

**Finding C-1:** The file system responsibilities table lists `AGENTS.md` as the documentation target with role "Convention documented in the env-file section." However, root AGENTS.md (line 252) delegates the full env-and-deploy contract text to `docs/policies/agent-surface-ops.md`: "Env-and-deploy contract (RFC-0761 / DNA-40) — .env.example, .env, deploy.preflight, # How to obtain: instructions." The RFC should name `docs/policies/agent-surface-ops.md` as the file where the convention is documented, not `AGENTS.md`. Root AGENTS.md may get a one-line pointer, but the detailed convention belongs in the policy file.

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path. Amends RFC-0388 directly by changing the DEPLOY-PREFLIGHT-04 error message. No legacy code path maintained behind a flag.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). No NEEDS CLARIFICATION markers. No storage/persistence changes. Agent-facing rules are explicit: MUST NOT use `null` in `.env.example`, MUST NOT normalize `"null"` in runtime code, SHOULD use `KEY=null` for not-required variables in `.env`.

## Axis F — Pragmatism

No issues. No new command — extends existing `deploy.preflight` with a one-string change. Alternatives section honestly rejects 4 alternatives (new validator, `.env.example` null, runtime normalization, comment-based marker). `packagesImpacted` lists only `@warpgogol/werkstatt-site` — correct and minimal.

## Axis G — Blind spots

**Finding G-1:** The RFC's acceptance criteria don't explicitly mention `.env.dev` files (RFC-0806). `deploy.preflight --dev` checks `.env.dev` using the same code path with the same DEPLOY-PREFLIGHT-04 check. While the fixHint change automatically applies to `.env.dev` (it's the same code line), an acceptance criterion verifying this would prevent a future refactor that splits the code path from accidentally dropping the `null` suggestion for dev targets. The CLI surface section already shows `--dev` usage, so this is a minor gap in verification coverage, not a design gap.

## Questions for the author

1. Should the documentation target in the file system responsibilities table be `docs/policies/agent-surface-ops.md` instead of `AGENTS.md`, given that root AGENTS.md delegates env-and-deploy details to that file?
2. Should an acceptance criterion explicitly verify that `deploy.preflight --dev` (`.env.dev` files) also gets the `null` suggestion in DEPLOY-PREFLIGHT-04?
