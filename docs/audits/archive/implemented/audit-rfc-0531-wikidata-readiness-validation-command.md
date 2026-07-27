---
rfcId: RFC-0531
auditId: AUDIT-RFC-0531-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0531

## Verdict: Approved

The RFC is structurally sound, follows the existing `jsonld.parity` command pattern correctly, and aligns with DNA-16. Two minor findings (output status vocabulary mismatch and missing `system.md` in `reads`) are correctable during enhancement without revisiting the architectural decision.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec site-kernel run rfc.validate RFC-0531 --json` returned 0 violations.

## Axis A — Structural completeness

**Finding A-1: Output status uses `"pass"` but the actual schema has no `"pass"` value.**

The RFC's output format section (line 210) states: `status` is `"fail"` when any finding has severity `"error"`, or when `--strict` is set and any finding has severity `"warning"`. Otherwise `"pass"`.

However, `auditStatusSchema` in `@/packages/os/site-kernel-checks/src/audit/types.ts:23` is `z.enum(["ok", "warn", "fail", "pending"])`. There is no `"pass"` status. The success status should be `"ok"`, matching the existing `buildAuditResult` helper (`@/packages/os/site-kernel-checks/src/audit/helpers.ts:108-114`) which returns `"ok"` when there are zero errors and zero warnings.

**Finding A-2: `reads` field omits `<app>/src/content/system.md`.**

The command table entry (line 150-153) declares:
```ts
reads: [
  "<app>/src/content/business-profile/**/*.md",
  "<app>/dist/client/**/*.html",
],
```

But `loadAuditAppContext` (called by every audit validator) reads the system manifest via `loadSystemManifest(paths.contentDirectory)` to derive `defaultLanguageFromManifest`. The existing `jsonld.parity` command declares `reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"]`. The RFC should include `<app>/src/content/system.md` in its `reads` field for contract completeness.

All other structural items pass: Decision is a single present-tense statement, CLI surface shows exact invocations, TypeScript contracts are minimal signatures, file system responsibilities table names concrete paths, failure modes specify exit codes, rollout describes default behavior and adoption path, alternatives are honest, risks include false-positive rate and agent misinterpretation risk, acceptance criteria are checkable and sufficient, implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues.

- `satisfies: [DNA-16]` — DNA-16 exists in `@/docs/architecture-dna.md:67-69`: "Semantic outputs (JSON-LD, sitemaps, structured breadcrumb data) must be derived from the same page topology and visibility state used for navigation rendering." The RFC body (line 104) explains how it enforces this: "enforces that the semantic output (JSON-LD `sameAs`) is correctly derived from the PBP entity graph — the same source that drives all other semantic outputs." This is a valid enforcement explanation.
- No new DNA invariant is established.
- No conflict with existing DNA invariants.
- `related[]` references (DNA-16, RFC-0163, RFC-0530) are all relevant and non-decorative.

## Axis C — Ecosystem fit

**Finding C-1: RFC does not mention updating `packages/os/site-kernel-checks/AGENTS.md`.**

The AGENTS.md "What lives here" table lists every module in the package with its exports. A new file `audit/validators/wikidata.ts` exporting `runWikidataValidate` should be documented there. The RFC's file system responsibilities table (line 175-181) lists the file but does not mention the AGENTS.md update.

Other items pass:
- Package boundaries: command lives in `@gogol/site-kernel-checks` — correct for validation commands. No import violations.
- Pipeline placement: standalone (not in `build.check` or `sites-check`) — justified by the non-goal and rollout section.
- Compass sync: no `docs/*.xml` changes needed — the RFC adds a command, not a repository-wide requirement.
- Cosmic naming: N/A — no manifest or component changes.
- Command lifecycle: `commands.proposed: ["wikidata.validate"]` is correct; will land in `added` upon implementation.

## Axis D — Forward-only compliance

No issues.

- No compatibility shims, bridges, or dual-paths.
- No deprecation.
- No amendments to other RFCs.
- No legacy code paths maintained behind a flag.

## Axis E — Agent-facing policy

No issues.

- Status gate: RFC is `status: draft` and contains no self-authorizing language. Implementation notes (line 259) correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Correct.
- Anti-fabrication: all acceptance criteria are code changes (command registration, validator implementation, unit tests). No content authoring required.
- Storage policy: no persistence changes.

## Axis F — Pragmatism

No issues.

- Minimal command surface: `wikidata.validate` has distinct concerns from `jsonld.parity` (QID presence, URL construction from `schemeRef + value`, LegalIdentity readiness). The alternatives section (line 231) explains why extending `jsonld.parity` was insufficient.
- Lean contracts: `WikidataValidationRule` type alias is minimal and useful for rule ID documentation.
- Existing patterns: RFC explicitly says to follow `runJsonLdParityValidate` pattern and names specific helpers (`loadAuditAppContext`, `collectRenderedHtml`, `extractJsonLdGraph`, `buildAuditResult`, `finding`).
- Scope discipline: `appsImpacted: []` and `packagesImpacted: ["@gogol/site-kernel-checks"]` are correct. `nonGoals` are meaningful (no Wikidata API calls, no auto-add QIDs, no build.check integration, no Person validation).

## Axis G — Blind spots

No issues.

- Performance: standalone on-demand command — cost is bounded by PBP content file count and dist/ HTML file count, same as `jsonld.parity`. Not in `build.check` so no build-time bottleneck.
- False positives: Risks section (line 239) addresses URL validation false positives and stale dist/ HTML.
- Edge cases: RFC considers empty states — no PBP content → exits 0 (line 219), no dist/ HTML → skips JSON-LD parity check (line 218). Mirrors `jsonld.parity` behavior.
- Migration path: no content changes required (line 226). Works immediately after RFC-0530.
- Security/privacy: no user data, PII, or external services.

## Questions for the author

1. The output format uses `"pass"` as the success status, but `auditStatusSchema` (`@/packages/os/site-kernel-checks/src/audit/types.ts:23`) is `z.enum(["ok", "warn", "fail", "pending"])`. Should this be changed to `"ok"` to match the actual schema?
2. The `reads` field omits `<app>/src/content/system.md`, which `loadAuditAppContext` reads for `defaultLanguageFromManifest`. Should this be added for contract completeness, matching `jsonld.parity`?
3. The `--strict` flag escalates `*-missing-qid` warnings to errors. Should the implementation escalate severity before calling `buildAuditResult` (so `status` naturally becomes `"fail"`), or compute the exit code separately from the status? The RFC's failure modes section (line 215) implies severity escalation, but this is not explicit in the design section.
