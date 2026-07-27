---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: approved
diffRange: ccb41fcf5...HEAD
filesReviewed:
  - packages/ontology/package.json
  - packages/ontology/src/archetype-registry.ts
  - packages/ontology/src/operations/index.ts
  - packages/ontology/src/operations/handoff.ts
  - packages/ontology/src/operations/sternsystem.ts
  - packages/ontology/src/operations/werkstatt.ts
  - packages/ontology/src/operations/mission.ts
  - packages/ontology/src/operations/release.ts
  - packages/ontology/src/operations/leitstand.ts
  - packages/ontology/src/operations/notausgang.ts
  - packages/ontology/src/operations/materialization.ts
  - packages/ontology/src/operations/artifact-store.ts
  - packages/ontology/src/operations/naming-policy.ts
  - packages/ontology/src/schemas/index.ts
  - packages/ontology/src/schemas/manifest-resolver.ts
  - packages/ontology/src/schemas/page-entry.ts
  - packages/ontology/src/schemas/system.ts
  - packages/ontology/src/schemas/system/growth.ts
  - packages/ontology/AGENTS.md
  - packages/ontology/README.md
  - packages/os/site-kernel-handoff/src/types.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts
  - packages/os/site-kernel-checks/src/structure/naming-policy.ts
---

# Code Review: ccb41fcf5...HEAD — Ontology package refactoring

## Verdict: Approved

Three deepening refactors (manifest-resolver extraction, operations schema separation, archetype registry Zod validation) are architecturally sound, forward-only, and typecheck-clean. Minor findings: two stale CHANGE_SUMMARY entries and one stale Compass path in `docs/knowledge-graph.xml`.

## Mechanical floor

Pass — `tsc --noEmit -p packages/ontology/tsconfig.json` exits 0. Consumer packages `@gogol/site-kernel-handoff` and `@gogol/site-kernel-checks` also typecheck clean.

## Axis A — Structural correctness

- **Type assertion in `manifest-resolver.ts:103`**: `local as Record<string, unknown> | undefined` casts from `unknown`. Not `as any` and safe in context (the value comes from a Zod `safeParse` result), but a Zod schema for the local props fragment would be more robust. Minor.
- **Silent catch blocks in `manifest-resolver.ts:57,74,84`**: `catch { continue; }` swallows filesystem, YAML parse, and Zod validation errors without logging. Inherited from the original `page-entry.ts` code — not a regression. Could benefit from debug-level logging for troubleshooting missing manifests.
- No `as any`, no magic numbers, no dead code in the diff.

## Axis B — DNA alignment

No issues.

- **DNA-6 (kebab-case)**: all new filenames use kebab-case (`manifest-resolver.ts`, `operations/index.ts`, `artifact-store.ts`, etc.).
- **DNA-42 (Compass markup)**: all 10 new operations files and `manifest-resolver.ts` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`.
- **DNA-1 (monorepo boundary)**: no `apps/* → apps/*` imports. Consumer imports flow `packages/os → packages/ontology` via the new `@gogol/ontology/operations` sub-path.
- No cosmic naming, no UI component, no route changes — DNA-5/17/23/24/25 not applicable.

## Axis C — Ecosystem fit

- **Stale Compass path in `docs/knowledge-graph.xml:312`**: `packages/ontology/src/schemas/handoff.ts` → should be `packages/ontology/src/operations/handoff.ts`. The node `packages.ontology.handoff-schemas` points to the old path. **Needs update.**
- **`docs/grace-inventory.xml` needs regeneration**: the inventory entry for `archetype-registry.ts` (line 1253) records 38 non-empty lines; the file now has 55 lines with Zod validation. New files (`operations/*.ts`, `manifest-resolver.ts`) are not listed. Run `ecosystem.manifest.generate` or the inventory regeneration command.
- **AGENTS.md and README.md**: updated with the new `@gogol/ontology/operations` entry point. Correct.
- **`package.json` exports**: `./operations` added pointing to `src/operations/index.ts`. Correct.
- **Consumer import migration**: all 22 consumer files in `site-kernel-handoff` and `site-kernel-checks` updated from `@gogol/ontology/schemas` to `@gogol/ontology/operations`. Verified no remaining operations schema imports from `@gogol/ontology/schemas`.

## Axis D — Forward-only compliance

No issues.

- No backward-compat shims: operations schemas were fully removed from `schemas/index.ts` — no re-exports, no deprecated aliases.
- No dual-paths: consumers must import from `@gogol/ontology/operations` — there is no fallback to `@gogol/ontology/schemas`.
- The `schemas/index.ts` comment on line 77-79 documents the extraction but does not provide a compat layer.

## Axis E — Agent-facing clarity

- **`page-entry.ts` CHANGE_SUMMARY not updated**: still reads `Wave 1 (RFC-0026): Initial creation.` — missing an entry for the extraction of `getSectionPropsSchema` to `manifest-resolver.ts`. The `MODULE_CONTRACT` purpose was correctly updated to say "pure declarative schemas, no I/O". **Needs CHANGE_SUMMARY entry.**
- **`schemas/index.ts` CHANGE_SUMMARY not updated**: lists RFC-0025, RFC-0071, RFC-0371 but not the operations extraction. **Needs CHANGE_SUMMARY entry.**
- All new files (`manifest-resolver.ts`, `operations/index.ts`, all 10 operations schema files) have correct `MODULE_CONTRACT` and `CHANGE_SUMMARY`.
- No ungrounded assertions — all referenced functions, types, and paths exist.

## Axis F — Pragmatism

No issues.

- The `./operations` sub-path earns its existence: 10 schemas with a distinct consumer group (`site-kernel-handoff`) vs. UI ontology schemas consumed by `site-kernel-checks`, `site-kernel-codegen`, and apps.
- No speculative generality — the operations barrel exports only what consumers need.
- `manifest-resolver.ts` is minimal — one function, one responsibility.
- `archetype-registry.ts` validation schema mirrors the existing JSON shape without adding speculative fields.

## Axis G — Blind spots

- **`archetype-registry.ts` Zod `parse` throws at import time**: if `index.json` shape drifts, the module load crashes with a Zod error tree. This is intentional (fail-fast), but the error message may not be immediately actionable for an agent encountering it. Consider wrapping with `safeParse` and a descriptive error message like `"archetype registry index.json failed validation: ..."`.
- **`manifest-resolver.ts` readdir pattern**: uses `readdir` directly (single-level, not recursive). The `fs.walk.lint` rule targets recursive walkers, so this should be exempt. If flagged, add a `// fs.walk.lint: allow — single-level dir scan, not recursive` comment.
- **No performance concern**: the Zod validation in `archetype-registry.ts` runs once at module load; `manifest-resolver.ts` I/O is per-call and unchanged from the original.

## Spec compliance

No spec available — spec compliance skipped. The refactoring was driven by an architecture review session, not a formal RFC or PRD.

## Questions for the author

1. Should `docs/knowledge-graph.xml` node `packages.ontology.handoff-schemas` path be updated to `packages/ontology/src/operations/handoff.ts`, or should the node be renamed to reflect the broader operations scope?
2. Will `docs/grace-inventory.xml` be regenerated separately, or should it be regenerated as part of this change?
3. Is the `z.parse()` fail-fast behavior in `archetype-registry.ts` acceptable, or should it be wrapped with `safeParse` + a descriptive error?
