---
rfcId: RFC-0906
auditId: AUDIT-RFC-0906-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0906

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has one mechanical violation (V-28 date monotonicity) and a few minor findings around CANON-04 severity consistency and a missing JSON-LD `url` check in the acceptance criteria.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-28**: RFC-0906 (createdAt 2026-08-22) has a lower number than RFC-0916 (createdAt 2026-08-21), violating monotonic non-decreasing order. RFC-0916 was created earlier but numbered higher. Fix: set `createdAt` to `2026-08-21` to match the RFC-0916 boundary, or renumber (not practical). This is a numbering artifact, not a content issue.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense. CLI surface shows exact commands with flags. TypeScript contracts are minimal signatures. File system responsibilities table names concrete paths. Output format documents `--json` shape. Failure modes specify exit codes. Rollout describes default behavior, existing-app migration, and new-app compliance. Alternatives section has 3 real alternatives with rejection reasons. Risks section covers performance, false positives, and maintenance burden. Acceptance criteria are checkable and cover the full scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. DNA-85 already exists in `docs/architecture-dna.md:355-357` with text matching the RFC's description. `satisfies: [DNA-85]` is self-referential (RFC establishes and satisfies it) — this is the standard pattern. DNA-58 (related) is relevant: the RFC extends generated-file content determinism to canonical URLs. The RFC body explains how it enforces DNA-85 (byte-identical URLs across all surfaces via `canonicalPageUrl`).

## Axis C — Ecosystem fit

No issues. Package boundary: `@warpgogol/werkstatt-site` is correct — both the validator and runtime fix live in this package. Pipeline placement: `SITES_CHECK_POSTBUILD_PIPELINE` after `canonical.url.validate` is correct — verified at `sites-check-postbuild.ts:48`. Command table: `09b-build-artifacts-part2.ts` is correct — `canonical.url.validate` is already registered there at line 748. AGENTS.md updates are identified. Command lifecycle buckets are internally consistent: `proposed: [canonical.html-parity.validate]`, `changed: [canonical.url.validate]`.

## Axis D — Forward-only compliance

No issues. No backward compatibility shim. The runtime fix directly changes `pageUrl` construction from `localizeUrl` to `canonicalPageUrl` — no dual-path. Legacy `localizeUrl`-based URL construction is replaced, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues. Status is `draft`, no self-authorizing language. Implementation notes reference correct governance rules (RFC-0224 for accepted→implemented transition). No storage/persistence concerns. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

- **CANON-04 severity mismatch**: The RFC declares CANON-04 as `severity: warning` in the `canonical.url.validate` enhancement (line 191), while CANON-HTML-01 (the same check in the new command) is `severity: error`. The same condition (HTML canonical not matching expected) produces a warning in one command and an error in another. This is intentional per the RFC (CANON-04 is a subset check), but the inconsistency could confuse agents diagnosing failures. Consider documenting the rationale: CANON-04 checks set membership (is the URL in the expected set?), while CANON-HTML-01 checks exact per-page equality.

- Otherwise, the split is justified: different input domains (XML/text vs HTML), different extraction logic. The runtime fix is a one-line change.

## Axis G — Blind spots

- **JSON-LD `url` check missing from acceptance criteria**: DNA-85 mentions JSON-LD `url` as a canonical URL surface ("Every canonical URL emitted in rendered HTML (`<link rel="canonical">`, `<meta property="og:url">`, JSON-LD `url`) MUST be byte-identical"), but the validator only checks `<link rel="canonical">` (CANON-HTML-01) and `og:url` (CANON-HTML-02). There is no CANON-HTML-04 for JSON-LD `url`. The acceptance criteria do not mention JSON-LD `url` validation. Either add a rule or explicitly document it as a non-goal.

- **Performance**: The RFC says performance impact is "negligible" and compares to `seo.domain.validate` and `csp.origins.validate`. This is reasonable — both scan `dist/client/**/*.html` with regex extraction. No blind spot.

- **Edge cases**: Missing `dist/client/`, missing `system.md`, missing canonical tag — all handled. No blind spot.

## Questions for the author

1. Fix V-28: should `createdAt` be changed to `2026-08-21` to resolve the monotonicity violation with RFC-0916?
2. DNA-85 mentions JSON-LD `url` as a canonical surface, but no validator rule checks it. Should `canonical.html-parity.validate` also extract and validate JSON-LD `url` fields, or should JSON-LD `url` be explicitly listed as a non-goal?
3. CANON-04 (warning) and CANON-HTML-01 (error) check the same condition with different severities. Should the RFC document why the same mismatch is a warning in `canonical.url.validate` but an error in `canonical.html-parity.validate`?
