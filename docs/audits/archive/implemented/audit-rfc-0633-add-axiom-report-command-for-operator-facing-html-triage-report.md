---
rfcId: RFC-0633
auditId: AUDIT-RFC-0633-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0633

## Verdict: Needs revision

RFC-0633 is architecturally sound and well-structured, but has a type mismatch between the proposed `EvidenceMetadata` interface and the actual `evidence-metadata.json` written by `mission.check`, plus a missing HTML-escaping requirement that could produce invalid HTML from finding content.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **`EvidenceMetadata.recordedAt` does not match actual file format.** The RFC declares `recordedAt: string` in the `EvidenceMetadata` interface (line 153), but `mission.check` writes `evidence-metadata.json` with only `{ missionId, commitSha? }` — no `recordedAt` field (`@/packages/os/site-kernel-checks/src/mission-check.ts:705-712`). The `recordedAt` timestamp is available in `StudyRun.recordedAt` (`@syrokomskyi/axiom-study/src/contracts.ts:134`). The interface should either remove `recordedAt` or mark it optional and source it from `study-run.json` instead.

## Axis B — DNA alignment

No issues. DNA-49 (Leitstand) and DNA-46 (Mission lifecycle) are correctly referenced and the RFC body explains how each is extended: `axiom.report` auto-invokes in `leitstand.dev-deploy` (DNA-49) and writes to `missions/<mid>/evidence/axiom/` (DNA-46).

## Axis C — Ecosystem fit

- **AGENTS.md update not identified.** The RFC does not mention which `AGENTS.md` files need updating. `packages/os/site-kernel-checks/AGENTS.md` should reference the new `axiom.report` command, and `packages/os/site-kernel-handoff/AGENTS.md` should note the `leitstand.dev-deploy` auto-invocation change.

- **RFC-0021 compatibility verified.** RFC-0021 (pipelines repo) changes `BrowserReceipt` from `screenshotDigest: DigestRef | null` to `screenshotDigests: DigestRef[]` and bumps schema to `browser-receipt@2`. The types that `axiom.report` imports — `StudyRun`, `Finding` (`@syrokomskyi/axiom-study/src/contracts.ts:107-120`), `StagedCapsule` (`@syrokomskyi/axiom-capture/src/contracts.ts:344-358`), `ObservationBundle` (`@syrokomskyi/axiom-study/src/contracts.ts:80-87`) — do not reference `BrowserReceipt` or `screenshotDigest`. RFC-0021 has zero impact on RFC-0633's type contracts.

## Axis D — Forward-only compliance

No issues. New command, no compatibility shims, no legacy paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes explicitly state `axiom.report` is a renderer, not a gate, and pipeline integration is best-effort.

## Axis F — Pragmatism

- **`AxiomReportResult` omits `nextSteps`.** For a reporting command that surfaces accessibility findings, `nextSteps` would be valuable (e.g., "Review 2 high-severity findings at missions/<mid>/evidence/axiom/report.html" or "Fix critical findings and re-run mission.check"). The `KernelCommandResult` type supports `nextSteps?` — adding it improves operator UX without over-engineering.

## Axis G — Blind spots

- **HTML escaping not specified.** `renderAxiomReportHtml` renders finding titles, rule IDs, URLs, and other string content from evidence JSON into a self-contained HTML file. The RFC does not mention HTML escaping requirements. Finding titles could contain `<`, `>`, `&` characters. The existing `renderReportHtml` in `@warpgogol/check-core/src/report.ts:125-131` has an `escapeHtml` function — the RFC should reference this pattern or state that all user-provided content must be escaped.

- **No freshness indicator for stale evidence.** `axiom.report` reads whatever evidence files exist in `missions/<mid>/evidence/axiom/`. If `mission.check` hasn't been run recently, the report would be generated from stale data with no visible indicator. The RFC should specify that the report header includes `StudyRun.recordedAt` (the timestamp from `study-run.json`) so the operator can verify evidence freshness.

## Questions for the author

1. Should `EvidenceMetadata.recordedAt` be removed from the interface (since the actual file doesn't contain it), or should the field be sourced from `StudyRun.recordedAt` and marked optional?
2. Should `renderAxiomReportHtml` be required to HTML-escape all string content from evidence JSON, and if so, should the RFC reference the existing `escapeHtml` pattern from `check-core`?
3. Should `axiom.report` populate `nextSteps` in its result (e.g., pointing the operator to the generated report path and summarizing action items)?
