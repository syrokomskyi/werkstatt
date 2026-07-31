---
rfcId: RFC-0582
auditId: AUDIT-RFC-0582-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0582

## Verdict: Needs revision

The RFC correctly identifies the root cause (`existsSync` filter at `generate.ts:89` silently dropping blueprints) and the filter removal is sound. However, the proposed post-generation consistency check logic is flawed — it will never fire because `surfaces` always contains entries for every processed blueprint. The output format example also mismatches the actual `failResult` behavior.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Post-generation check logic is incorrect.** The RFC proposes:
   ```ts
   const generatedBlueprintIds = new Set(surfaces.map((s) => s.surfaceId));
   const missingBlueprints = blueprints.filter((bp) => !generatedBlueprintIds.has(bp.id));
   ```
   But in `generate.ts:152`, `surfaces.push(countFor(blueprint.id, entries))` runs for **every** blueprint in the loop, regardless of whether `entries` is empty. `countFor` (`shared.ts:200`) always returns `{ surfaceId, generated: entries.length, ... }` — `surfaceId` is always set to `blueprint.id`. Therefore `generatedBlueprintIds` will always contain every blueprint ID, and `missingBlueprints` will always be `[]`. **The check will never fire.** The correct approach is to check `s.generated === 0`:
   ```ts
   const emptyBlueprints = surfaces.filter((s) => s.generated === 0);
   if (emptyBlueprints.length > 0) { ... }
   ```

2. **Output format `ruleId` mismatch.** The RFC's output format example (line 170) shows `"ruleId": "SURFACE-GEN-01"`. However, `failResult` (`result-helpers.ts:74`) creates diagnostics with `ruleId: command` (i.e., `"surface.generate"`), not a custom rule ID. To emit `ruleId: "SURFACE-GEN-01"`, the implementation must use `diagnosticsResult` directly with a `Diagnostic[]` that specifies the custom `ruleId`. The RFC's TypeScript contracts section uses `failResult`, which contradicts the output format example.

3. **Acceptance criterion for unit test lacks location.** The criterion "Unit test covers the depth-0-hub-without-collection-directory scenario" doesn't specify where the test lives. No existing test file targets `surface/generate.ts` directly. The implementer needs to know whether to create a new test file (e.g., `src/tests/surface-generate.test.ts`) or add to an existing surface test.

## Axis B — DNA alignment

1. **`satisfies: [DNA-22]` is weak.** DNA-22 is the "Client-editable surface whitelist" invariant — it defines which paths are client-editable vs engineering surface. The RFC's claim that "Programmatic Surface blueprints declared in system.md must produce their depth-0 hub page regardless of collection directory state" is not what DNA-22 enforces. DNA-39 (Route registry is a merge of route sources, including the Programmatic Surface) is directly about surface-generated virtual routes and is more relevant, but is not referenced in `satisfies` or `related`. Consider adding DNA-39 to `related[]` and either justifying the DNA-22 connection more precisely or removing it from `satisfies`.

## Axis C — Ecosystem fit

No issues. `packagesImpacted` correctly lists `@warpgogol/site-kernel-checks`. `commands.changed: [surface.generate]` is correct. Pipeline placement (`build.prepare`) is unchanged. No new command is added. No Compass XML or AGENTS.md updates needed.

## Axis D — Forward-only compliance

No issues. The fix removes a redundant filter and adds a validation — no compatibility shim, no dual-path, no flag.

## Axis E — Agent-facing policy

No issues. Status gate is correct (draft → accepted → implemented). Implementation notes reference the correct governance rules. The note about not creating empty collection directories as a workaround is good agent guidance.

## Axis F — Pragmatism

No issues. The fix is minimal (removing one `existsSync` call, adding one check). Alternatives are honestly considered and rejected with reasons. `nonGoals` are meaningful.

## Axis G — Blind spots

1. **False positive risk for SURFACE-GEN-01 not fully addressed.** The Risks section (line 205) says the check "only applies to blueprints that passed the entitlement and declaration filter" — this is correct. But the deeper question is: can a declared and entitled blueprint legitimately produce zero entries after `expandBlueprint`? Looking at the code, `generateEntries` (from `@warpgogol/surface`) always produces depth-0 hub entries from blueprint levels, and gates set `noindex` but don't remove entries. So `expandBlueprint` should always return at least the depth-0 hub. The RFC should document this invariant ("`expandBlueprint` always returns ≥1 entry for a valid blueprint because depth-0 hubs are generated from level definitions, not from records") to explain why `SURFACE-GEN-01` indicates a real problem, not a legitimate empty state.

2. **`existsSync` import remains used.** After removing the filter at line 89, the `existsSync` import (line 17) is still needed for the cache directory check at line 108. The RFC doesn't mention this, which is fine — but the implementer should be aware that the import stays.

## Questions for the author

1. The proposed post-generation check uses `surfaces.map((s) => s.surfaceId)` to find missing blueprints, but `surfaces` always contains every processed blueprint ID. Should the check instead filter `surfaces` by `generated === 0` to find blueprints that produced zero entries?
2. The output format shows `ruleId: "SURFACE-GEN-01"`, but `failResult` emits `ruleId: "surface.generate"`. Should the implementation use `diagnosticsResult` with a custom `Diagnostic[]` to get the `SURFACE-GEN-01` rule ID?
3. Should DNA-39 (Route registry as merge of route sources) be added to `related[]` given that it directly covers the Programmatic Surface route source that this RFC fixes?
