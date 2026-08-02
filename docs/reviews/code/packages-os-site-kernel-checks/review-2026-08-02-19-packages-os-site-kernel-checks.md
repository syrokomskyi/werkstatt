---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: c9d0d0c5...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/dist-html-structure.ts
  - packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts
  - packages/os/site-kernel-checks/src/pipelines/build-post.ts
  - packages/os/site-kernel-checks/src/tests/dist-html-structure.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
---

# Code Review: c9d0d0c5...HEAD (RFC-0654 implementation)

### Verdict: Needs revision

Implementation is clean, well-typed, follows established patterns (pure function + thin handler split, same as RFC-0647). One minor finding: the `HTML-STRUCT-02` rule ID is used in the handler but not documented in AGENTS.md.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` exits 0. `rfc.validate --id RFC-0654` passes with 0 errors. All 743 unit tests pass (including 12 new tests).

### Axis A — Structural correctness

No issues. Strict typing throughout (`as const` for `STRUCTURAL_TAGS`, typed interfaces for `HtmlStructureViolation` and `HtmlStructureValidateResult`). No `any`, no magic numbers, no dead code. Error handling follows the established pattern: read errors silently skip the file (same as `dist-generated-marker.ts:132-138`). The pure function + thin handler split is correctly implemented per RFC-0647 pattern.

### Axis B — DNA alignment

No issues. The command directly protects DNA-8 (structural integrity of `<main>`) and reinforces DNA-35 (build pipeline integrity). No invariant conflicts.

### Axis C — Ecosystem fit

No issues. Package boundaries correct (`site-kernel-checks` imports from `@warpgogol/site-kernel` and `@warpgogol/share/fs`). Pipeline placement correct (after `text.normalize.apply`, before `SITES_CHECK_POSTBUILD_PIPELINE`). Command registered in the correct table (`09-build-artifacts.ts`). AGENTS.md module table updated.

### Axis D — Forward-only compliance

No issues. New command, no legacy paths, no compatibility shims.

### Axis E — Agent-facing clarity

- **E1: `HTML-STRUCT-02` rule ID not documented.** The handler uses `HTML-STRUCT-02` for the "app not specified" error (`dist-html-structure.ts:120`), but the AGENTS.md entry (`AGENTS.md:26`) only documents `HTML-STRUCT-01`. The AGENTS.md entry should read `Diagnostics: HTML-STRUCT-01..02` to cover both rule IDs.

### Axis F — Pragmatism

No issues. Minimal command surface, lean contracts, follows existing patterns. The `cacheable: true` declaration is justified by the RFC (deterministic, read-only).

### Axis G — Blind spots

No issues. Performance documented in RFC (151 files scanned in <1s on warpgogol-com). False positives documented (comment stripping, attribute value trade-off). Edge cases handled: no dist/client → skip with pass, read errors → skip file. Migration path verified (warpgogol-com passes on clean build).

### Spec compliance

| Requirement from RFC-0654 | Status | Evidence |
| --- | --- | --- |
| Command registered with `reads` and `cacheable: true` | Done | `09-build-artifacts.ts:134-150` |
| Handler with pure function + thin kernel handler split | Done | `dist-html-structure.ts:77-99` (pure), `dist-html-structure.ts:106-196` (handler) |
| 14 structural non-void tags checked | Done | `dist-html-structure.ts:31-46` |
| HTML comments stripped before counting | Done | `dist-html-structure.ts:48,78` |
| Pipeline integration after `text.normalize.apply` | Done | `build-post.ts:33-36` |
| `--json` output shape with `violations[]` | Done | `dist-html-structure.ts:50-64` |
| Unit tests cover 5 required scenarios | Done | `dist-html-structure.test.ts`, 12 tests |
| Existing apps pass on clean build | Done | 151 files, 0 violations, exit 0 |
| `rfc.validate` passes | Done | 0 errors |

### Questions for the author

1. Should the `HTML-STRUCT-02` rule ID be documented in AGENTS.md, or should the "app not specified" error use `HTML-STRUCT-01` instead to keep the rule ID space minimal?
