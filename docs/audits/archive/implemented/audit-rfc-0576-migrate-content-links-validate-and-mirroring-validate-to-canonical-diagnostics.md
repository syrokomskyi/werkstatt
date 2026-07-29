---
rfcId: RFC-0576
auditId: AUDIT-RFC-0576-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0576

## Verdict: Needs revision

The RFC's core migration plan is sound, but three findings block implementation: (1) LINK-01 and LINK-02 rule titles don't match the actual validator code semantics, (2) MIRROR-02 and MIRROR-03 are emitted by `page-blocks-mirror.ts` but not registered, which will cause DSL-02 failures after migration, and (3) `mirroring.validate` currently distinguishes errors (default-language missing) from warnings (non-default missing) — the RFC's single MIRROR-MISSING rule with severity "error" collapses this distinction.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0576 --json` exits 0 with zero violations.

## Axis A — Structural completeness

- **LINK-01/LINK-02 rule titles are semantically wrong.** The RFC proposes (line 140–141):
  - `LINK-01: "External URL is missing or malformed"`
  - `LINK-02: "Anchor link target not found"`
  
  But the actual code in `content-links.ts` uses these codes differently:
  - LINK-01 (lines 328–329, 392–393): anchor not found on a page — used for unresolved `#anchor` references, not external URLs.
  - LINK-02 (lines 345–346, 362–363): same-page anchor must not carry a path prefix — a style/canonical-form violation, not a missing target.
  - LINK-03 (lines 373–378): internal path does not resolve — matches the RFC's description.
  
  The registry titles must match the actual check semantics or agents relying on `DIAGNOSTIC_RULES[ruleId].title` for remediation guidance will be misled.

- **fixHints for LINK-01 and LINK-02 are missing from the Design section.** The RFC only specifies a fixHint for LINK-03 (line 183). The acceptance criteria (line 294) require "LINK-01..03 ruleIds and fixHints" — LINK-01 and LINK-02 fixHints must be specified in the Design section.

- **MIRROR-MISSING fixHint is incomplete for multi-language sites.** The proposed fixHint (line 189) says "Add `${missingLang}: route in system.md pages[].routes" — but `mirroring.validate` checks all language directories, and a page may be missing in multiple languages. The fixHint should account for multiple missing languages or the Design section should clarify that one diagnostic is emitted per missing (page, lang) pair.

## Axis B — DNA alignment

- **DNA-11 satisfaction is correctly claimed.** `mirroring.validate` and `page.blocks.mirror.validate` are the primary enforcement commands for DNA-11 (Language mirroring). The RFC's `satisfies: [DNA-11]` is accurate.

- **DNA-4 (Canonical content) is not listed but is relevant.** `content.links.validate` validates internal links against the route map derived from `system.md` — this supports DNA-4 (canonical content in `src/content/`). The RFC's `related[]` includes RFC-0203/0206/0205 but `satisfies[]` only lists DNA-11. Consider whether DNA-4 should be added to `satisfies[]` or whether the RFC's scope is intentionally limited to DNA-11.

## Axis C — Ecosystem fit

- **MIRROR-02 and MIRROR-03 are not registered.** `page-blocks-mirror.ts` emits three rule codes: MIRROR-01 (line 134), MIRROR-02 (line 169), MIRROR-03 (line 195). The RFC only registers MIRROR-01 (line 148). After migration to `diagnosticsResult`, `diagnostic.shape.lint` (DSL-02) will fail for MIRROR-02 and MIRROR-03 because they are not in `DIAGNOSTIC_RULES`. The RFC must either register all three or explicitly state that MIRROR-02/03 are being merged into MIRROR-01 (which would lose diagnostic granularity).

- **`mirroring.validate` error/warning distinction is not preserved.** The current code (lines 120–133) treats missing-in-default-language as errors (`context.logger.error`, `hasErrors = true`) and missing-in-non-default as warnings (`context.logger.warn`). The RFC's single MIRROR-MISSING rule has `severity: "error"` (line 145). This collapses the distinction — non-default-language missing pages would become errors, changing the exit-code behavior (the current code only sets `exitCode: 1` when `hasErrors` is true, i.e., only for default-language missing). The RFC must either: (a) register two rules (e.g., MIRROR-MISSING-DEFAULT and MIRROR-MISSING-LOCALE), or (b) use dynamic severity per-diagnostic while keeping a single registered rule, or (c) explicitly state that all missing pages are now errors (a behavior change that needs to be called out in Rollout).

- **`mirroring.validate` data shape change is not addressed.** The current return type is `KernelCommandResult<{ checkedPages: number }>`. After migration to `diagnosticsResult`, the return becomes `KernelCommandResult<CheckResult>` — the `checkedPages` field is lost from `data`. The RFC's Output Format section (line 238–253) shows the new shape but doesn't mention that `data.checkedPages` is removed. If any pipeline or agent reads `data.checkedPages`, it will break. The RFC should explicitly state this is a breaking change to the data shape and confirm no consumers depend on `checkedPages`.

- **`page.blocks.mirror.validate` data shape change is not addressed.** The current return type is `KernelCommandResult<PageBlocksMirrorResult>` with `pagesCompared` and `violations[]` fields. After migration, these are replaced by `CheckResult` shape. The RFC doesn't mention how `pagesCompared` is preserved or removed.

- **DSL-04 baseline removal for `content-links.ts` is not mentioned.** `content-links.ts` is listed in `dsl04-baseline.generated.yaml` (line 23). When migrated to `diagnosticsResult`, it must be removed from the baseline (otherwise DSL-04 will flag it as using the shim when it no longer does, or the baseline becomes stale). The RFC should mention that the baseline must be regenerated. `mirroring.ts` and `page-blocks-mirror.ts` are not in the baseline (they use custom result shapes, not `resultFromViolations`), so they are not affected.

## Axis D — Forward-only compliance

- **No compatibility shims.** The RFC removes `resultFromViolations` usage in `content-links.ts`, removes the custom result shape in `mirroring.ts`, and removes `PageBlocksMirrorResult` in `page-blocks-mirror.ts`. All replaced by `diagnosticsResult`. This is forward-only — no dual paths. Good.

- **`parseUrl` normalization is a pure bug fix.** The RFC correctly identifies this as a same-commit fix, not a separate RFC. Forward-only — the old behavior (false positives on trailing slashes) is removed, not maintained behind a flag.

## Axis E — Agent-facing policy

- **Status gate is correct.** The RFC is `status: draft` and the implementation notes (line 304) correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

- **Implementation notes reference correct governance.** Lines 305–307 reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Good.

## Axis F — Pragmatism

- **Minimal command surface.** No new commands — three existing commands change output shape. Good.

- **Scope discipline is clean.** `packagesImpacted` lists only `@warpgogol/site-kernel-checks` — all three files are in that package. `appsImpacted: []` is correct. `nonGoals` are explicit and meaningful.

- **`parseUrl` normalization in `parseUrl` (not `localizeUrl`) is the right choice.** The RFC's alternatives section (line 275) correctly rejects normalizing `localizeUrl` due to unbounded blast radius. `parseUrl` is validator-only — contained blast radius.

## Axis G — Blind spots

- **`parseUrl` edge case: `/uk/` → `/uk`.** After normalization, `/uk/` becomes `/uk`. If the route map has `/uk` (which it should, since `localizeUrl` produces no trailing slash), this is fine. But if a route slug is empty for the default language and the path is `/<lang>/`, normalization produces `/<lang>` — the RFC should confirm this matches the route map entry. The proposed code handles this correctly (`path.length > 1` guard preserves root `/`).

- **`mirroring.validate` currently uses `context.logger` for output.** The violations are emitted via `context.logger.error` and `context.logger.warn` (lines 124–133) — they appear in logs but not in any structured `data` field. The migration must collect these as `Diagnostic[]` objects instead of logging them. The RFC doesn't mention this implementation detail, though it's implied by the migration to `diagnosticsResult`.

- **No performance concern.** `diagnosticsResult` is a pure function. `parseUrl` normalization is a single `endsWith` + `slice`. No I/O changes. Good.

## Questions for the author

1. What are the correct titles for LINK-01 and LINK-02 in the rule registry? The current code uses LINK-01 for "anchor not found" and LINK-02 for "same-page anchor must not carry path prefix" — not "external URL missing" and "anchor link target not found" as the RFC proposes. Should the registry titles match the code, or should the code be renumbered to match the RFC's intended semantics?

2. What happens to MIRROR-02 and MIRROR-03? `page-blocks-mirror.ts` emits three distinct rule codes. The RFC only registers MIRROR-01. Are MIRROR-02 and MIRROR-03 being merged into MIRROR-01 (losing the distinction between missing block, wrong type, and missing prop), or should they be registered alongside MIRROR-01?

3. How should `mirroring.validate` preserve its current error/warning distinction? Missing-in-default-language is currently an error (exit 1), while missing-in-non-default is a warning (exit 0). A single MIRROR-MISSING rule with `severity: "error"` makes both exit 1 — is this intentional, or should the validator emit warnings for non-default-language missing pages?
