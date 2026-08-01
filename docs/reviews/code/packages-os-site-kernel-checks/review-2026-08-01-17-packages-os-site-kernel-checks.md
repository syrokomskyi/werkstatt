---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: ae4c901...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/axiom-report.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/tests/axiom-report.test.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: ae4c901...HEAD (RFC-0633 axiom.report)

## Verdict: Needs revision

Two dead-code findings in `axiom-report.ts`. The implementation is architecturally sound, DNA-aligned, and well-tested. The findings are cosmetic cleanup, not structural issues.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` and `pnpm --filter @warpgogol/site-kernel-handoff run build:check` both exit 0. All 741 tests pass (including 10 new axiom-report tests). `rfc.validate --id RFC-0633` passes.

## Axis A — Structural correctness

1. **Dead code: `SEVERITY_PIE_COLORS` constant** (`axiom-report.ts:76-82`) — defined but never referenced anywhere in the codebase. The Mermaid pie chart uses severity labels and counts directly, not color values. Remove this constant.

2. **Dead export: `AxiomReportResult` interface** (`axiom-report.ts:59-64`) — exported but never used as a return type or imported by any other file. `runAxiomReport` returns `Promise<KernelCommandResult<AxiomReportData>>`, not `Promise<AxiomReportResult>`. The interface is redundant since `KernelCommandResult<AxiomReportData>` already defines the shape. Remove it.

## Axis B — DNA alignment

No issues. The implementation correctly satisfies DNA-49 (Leitstand) by integrating `axiom.report` into `leitstand.dev-deploy` as a best-effort post-`mission.check` step. DNA-46 (Mission lifecycle) is respected — the report is written to `missions/<mid>/evidence/axiom/report.html`, an ephemeral mission artifact.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct: `axiom-report.ts` imports from `@syrokomskyi/axiom-study`, `@syrokomskyi/axiom-capture` (type-only), `@warpgogol/site-kernel`, and `@warpgogol/site-kernel-handoff/mission` (for `resolveMissionDir`). The command is registered in the correct command table (`infra-contracts.ts`, same file as `mission.check`). AGENTS.md files for both impacted packages are updated. `docs/COMMANDS.md` and `docs/command-manifest.generated.yaml` regenerated.

## Axis D — Forward-only compliance

No issues. This is a new command — no legacy paths, no compatibility shims, no dual-paths.

## Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding present on `axiom-report.ts`. The `non-goals` section clearly states "renderer, not gate" and "does not replace `renderReportHtml` in check-core". Log messages include diagnostic codes (`AXIOM-REPORT-01..05`) and file paths. The `failResult` helper includes the evidence directory path in the data for debugging.

## Axis F — Pragmatism

No issues beyond the dead code in Axis A. The command earns its existence — it produces a human-readable HTML report from structured JSON, which is a distinct concern from `mission.check` (capture/gate) or `renderReportHtml` (different ecosystem). The `--dry-run` flag follows RFC-0601 convention. The `renderAxiomReportHtml` pure function is correctly separated from I/O.

## Axis G — Blind spots

No issues. The HTML report uses CDN scripts (Tailwind, Mermaid) — the RFC documents this as an accepted risk with mitigation (semantic HTML remains readable offline). HTML escaping is implemented and tested. The `failResult` function returns empty `missionId` and `reportPath` strings — this is acceptable since failure means no report was generated.

## Spec compliance

| Requirement from RFC-0633 | Status | Evidence |
| --- | --- | --- |
| `axiom.report` command registered | Done | `infra-contracts.ts:369-392` |
| `renderAxiomReportHtml` pure function | Done | `axiom-report.ts:256-335` |
| 9 HTML sections | Done | `axiom-report.ts:282-330`, test at `axiom-report.test.ts:341-368` |
| `--json` output format | Done | `AxiomReportData` interface, kernel CLI handles `--json` |
| `--dry-run` mode | Done | `axiom-report.ts:348,417-419,459-461`, test at `324-338` |
| Failure modes AXIOM-REPORT-01..05 | Done | `axiom-report.ts:353-411`, tests at `258-322` |
| `leitstand.dev-deploy` auto-invocation | Done | `leitstand-commands.ts:561-575` |
| Unit tests | Done | 10 tests, 741 total passing |
| `rfc.validate` passes | Done | exit 0 |

## Questions for the author

1. The `SEVERITY_PIE_COLORS` constant was likely intended for Mermaid pie segment coloring but Mermaid's `pie` syntax doesn't support per-segment colors via inline syntax. Was this planned for a future enhancement, or can it be removed now?
2. The `AxiomReportResult` interface duplicates `KernelCommandResult<AxiomReportData>` — was it intended as a public API contract for consumers, or can it be removed in favor of the generic?
