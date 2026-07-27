---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: bbde28897...e7189d59a
filesReviewed:
  - packages/check-core/src/diagnostics.ts
  - packages/check-core/src/run-paths.ts
  - packages/check-core/src/index.ts
  - packages/check-runner-node/src/dom-extract.ts
  - packages/check-runner-node/src/index.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/artifact-builders.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/deploy.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/evidence-readers.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/evidence.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/helpers.ts
  - services/check-warpgogol-runner/src/run-once.ts
---

# Code Review: bbde28897...e7189d59a (check-runner-node refactoring)

## Verdict: Needs revision

The refactoring successfully eliminates diagnostic pipeline duplication, extracts a DOM evidence seam, splits helpers.ts, deepens runner info, and centralizes run-path construction. The mechanical floor passes and the architecture is sound. However, two `as any` casts in the extracted modules violate the repo's type-safety discipline (Axis E), and five unused convenience exports in `run-paths.ts` are speculative generality (Axis F).

## Mechanical floor

Pass — `tsc --noEmit` succeeds for all four affected packages (`@warpgogol/check-core`, `@warpgogol/check-runner-node`, `@warpgogol/site-kernel-check-warpgogol`, `check-warpgogol-runner`).

## Axis A — Structural correctness

- **`as any` in `evidence-readers.ts:126`** — `JSON.parse(...) as Record<string, any>` in `updateRunArtifact`. The repo's `local-rules/no-as-any` ESLint rule flags `as any` as error for `packages/**/*.ts`. This cast bypasses type safety on the run artifact object. Use `Record<string, unknown>` and narrow with runtime checks, or parse via `checkRunArtifactSchema` from `@warpgogol/check-core`.

- **`as Record<string, any>` in `artifact-builders.ts:114`** — `manifest as Record<string, any>` in `buildHintsFromManifest`. Same ESLint violation. The `manifest` parameter is typed `unknown`; narrow it with a schema or typed guard instead of casting to `any`.

- **`as any` on `record.pages` in `artifact-builders.ts:117`** — `(record.pages as Array<Record<string, any>>)`. Cascading from the first `any` cast. Fix the root cast and this resolves.

## Axis B — DNA alignment

- **DNA-1 (monorepo boundary)** — Pass. `@warpgogol/check-core` imports `Diagnostic` type from `@warpgogol/site-kernel` (declared in `package.json` dependencies). No `apps/* → apps/*` or `apps/* → services/*` imports. The service imports from `@warpgogol/check-core` and `@warpgogol/check-runner-node`, not from `apps/*`.

- **DNA-42 (Compass markup)** — Pass. All three new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks: `diagnostics.ts`, `run-paths.ts`, `dom-extract.ts`. The split files `evidence-readers.ts` and `artifact-builders.ts` also carry Compass scaffolding.

- **DNA-6 (kebab-case)** — Pass. All new filenames use kebab-case: `dom-extract.ts`, `evidence-readers.ts`, `artifact-builders.ts`, `run-paths.ts`, `diagnostics.ts`.

## Axis C — Ecosystem fit

- **Package boundaries** — Pass. Imports flow correctly: `services/* → packages/*`, `packages/os/* → packages/*`. The diagnostic collectors moved from `packages/os/site-kernel-check-warpgogol` to `packages/check-core`, which is the right layer for shared schemas and utilities consumed by both the OS command layer and the runner service.

- **Compass sync** — The `compass-inventory.xml` is a generated file and does not yet list the new files (`diagnostics.ts`, `run-paths.ts`, `dom-extract.ts`, `evidence-readers.ts`, `artifact-builders.ts`). This is expected — the generator should be re-run to update the inventory snapshot. Not a blocker but should be addressed.

- **AGENTS.md updates** — No `AGENTS.md` exists for `site-kernel-check-warpgogol` or `check-core`. The `packages/AGENTS.md` ownership table lists `check-core` implicitly via the `os/site-kernel*` row. No new rules or patterns were introduced that require AGENTS.md updates.

## Axis D — Forward-only compliance

Pass. The refactoring replaces inline code with shared utilities — no compatibility shims, no dual-paths, no legacy bridges. The `helpers.ts` barrel re-exports from the new modules and from `@warpgogol/check-core`, maintaining the import surface for existing consumers without duplicating logic.

## Axis E — Agent-facing clarity

- **`as any` violations** — The two `as any` casts in `evidence-readers.ts:126` and `artifact-builders.ts:114` are agent-facing clarity failures. An agent reading `Record<string, any>` cannot reason about the shape of the data. The repo's `local-rules/no-as-any` ESLint rule exists precisely to prevent this. Per `packages/AGENTS.md` "Type-safety discipline": "Never use `as any` to mask type errors."

- **Compass scaffolding quality** — Pass. `MODULE_CONTRACT` blocks have `<purpose>` and where appropriate `<non-goals>`. `CHANGE_SUMMARY` entries reference the extraction rationale.

- **Readable names** — Pass. `extractPageEvidenceFromDOM`, `collectDeterministicDiagnostics`, `runRelDir`, `runRelPath` are self-documenting.

## Axis F — Pragmatism

- **Unused exports in `run-paths.ts`** — Five convenience helpers are exported but never imported anywhere in the codebase: `evidenceGraphRelPath`, `reportRelPath`, `reportHtmlRelPath`, `actionPackRelPath`, `targetRedactedRelPath`. The call sites use `runRelPath(runId, "evidence.graph.json")` etc. directly. These five exports are speculative generality — remove them or convert the call sites to use them. The `CHECK_WEBGOGOL_ROOT` and `RUNS_SUBDIR` constants are also exported but only used internally; they could be private.

- **`helpers.ts` barrel re-export of `makeDiagnostic as diagnostic`** — The alias `makeDiagnostic as diagnostic` preserves the old import name for consumers. This is a reasonable migration aid, but verify that existing import sites actually use the name `diagnostic` — if they already import `makeDiagnostic` directly, the alias is dead weight.

- **`renderReport` duplication** — `run-once.ts:163-168` has its own `renderReport` function, while `artifact-builders.ts:34-51` exports `renderReportHtml`. These produce similar HTML. The runner service could import `renderReportHtml` from `@warpgogol/check-core` (via the helpers barrel) instead of maintaining a separate implementation. Not a blocker — the runner's version is simpler and intentionally different — but worth noting.

## Axis G — Blind spots

- **Performance** — The diagnostic collectors iterate `graph.pages` linearly. No performance concern; the graphs are small (typically 1-20 pages).

- **Edge cases** — `runRelDir` handles empty `runId` by producing `.check-warpgogol/runs/` which is benign. `extractPageEvidenceFromDOM` handles missing elements gracefully (returns `undefined` for title, lang, canonical, metaDescription).

- **Migration path** — Existing consumers importing from `helpers.ts` continue to work via the barrel re-exports. No breaking changes to the public API.

## Spec compliance

No formal spec available — the refactoring was driven by an ad-hoc analysis session. The five identified candidates map to the diff:

| Candidate | Status | Evidence |
| --- | --- | --- |
| Collapse duplicated diagnostic pipeline | Done | `collectDeterministicDiagnostics` in `diagnostics.ts`, used by `run-once.ts:79` |
| Extract DOM evidence seam | Done | `extractPageEvidenceFromDOM` in `dom-extract.ts`, used by `index.ts:76` |
| Split helpers.ts | Done | `evidence-readers.ts` + `artifact-builders.ts`, `helpers.ts` is barrel |
| Deepen getCheckRunnerInfo | Done | `CHECK_RUNNER_INFO` const + `typeof` derivation in `index.ts:28-41` |
| Centralize run paths | Partial | `runRelDir`/`runRelPath` used in `deploy.ts`, `evidence.ts`, `run-once.ts`; but `evidence-readers.ts` still uses raw `posix.join(relRunDir, ...)` for artifact paths in `makeRunArtifact` and `updateRunArtifact` |

## Questions for the author

1. Why does `evidence-readers.ts` still use `posix.join(relRunDir, "report.json")` in `makeRunArtifact` and `updateRunArtifact` instead of `runRelPath` from `@warpgogol/check-core`? The centralization is incomplete — these functions were extracted from `helpers.ts` but not updated to use the new helpers.

2. Can the `as Record<string, any>` casts in `evidence-readers.ts:126` and `artifact-builders.ts:114` be replaced with `Record<string, unknown>` or schema validation? The repo's `no-as-any` ESLint rule should be failing on these.

3. Are the five unused exports in `run-paths.ts` (`evidenceGraphRelPath`, `reportRelPath`, `reportHtmlRelPath`, `actionPackRelPath`, `targetRedactedRelPath`) intentional for future use, or should they be removed?
