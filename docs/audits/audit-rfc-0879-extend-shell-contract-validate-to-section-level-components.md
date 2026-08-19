---
rfcId: RFC-0879
auditId: AUDIT-RFC-0879-01
date: 2026-08-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0879

## Verdict: Needs revision

The RFC correctly identifies a real scope gap (SHELL-01..04 doesn't scan `components/`), but contains three critical path errors that would make the proposed implementation non-functional at runtime, and underestimates false-positive risk for registered sub-components.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A-1 (Decision, line 103):** The Decision says SHELL-01 and SHELL-02 apply to component-level blocks, but the existing `shell.ts` code also implements SHELL-03 (deleted `VisualModifiers` check) and PARSE-01. The RFC's Failure modes section (line 204) lists all four rules, but the Decision section only mentions two. Minor inconsistency.
- **A-2 (TypeScript contracts, lines 126-164):** The proposed `walkSectionLevelComponents` code has incorrect import paths (see Axis C findings). The code sample is not copy-pasteable as written.
- **A-3 (Acceptance criteria, line 245):** "AGENTS.md updated with note about component-level shell enforcement" — which AGENTS.md? Root, `packages/werkstatt-site/`, or `packages/AGENTS.md`? The RFC should specify.

## Axis B — DNA alignment

- **B-1 (DNA-8, line 109):** The RFC says it "strengthens DNA-8 by ensuring that components acting as section-level blocks obey the same shell contract as sections." This is a reasonable extension of the hierarchy invariant. No issue.
- **B-2 (DNA-37, line 110):** The RFC says section-level components receive `SectionProps` including `sectionNumber`. The `satisfies` claim is valid — without `<SectionShell>`, `sectionNumber` cannot propagate to `<SectionHeader>`. No issue.

## Axis C — Ecosystem fit

- **C-1 CRITICAL (archetype index path, line 143-150):** The RFC references `packages/werkstatt-shared/src/ontology/archetypes/index.yaml`. This file does NOT exist in `werkstatt-shared`. The actual archetype index is at `packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml`. The proposed `walkSectionLevelComponents` function would throw `ENOENT` at runtime.
- **C-2 CRITICAL (existing `walkAstroSections` path bug, line 94-97):** The RFC quotes the existing code at `shared.ts:94-97` which uses path `packages/werkstatt-site/src/domain/ui/src/sections` (with extra `src/`). The actual directory is `packages/werkstatt-site/src/domain/ui/sections/` (no intermediate `src/`). `collectFiles` silently swallows `readdir` errors (catch → return, `fs/index.ts:48`), so `walkAstroSections` currently returns an empty array. This means SHELL-01..04 is **already broken** — it scans zero files. The RFC doesn't address this pre-existing bug. The proposed `walkSectionLevelComponents` uses the correct path (`ui/components/`, no extra `src/`), but the RFC must also fix `walkAstroSections` and `walkSectionManifests` (line 99-102, same bug).
- **C-3 CRITICAL (filtering logic, lines 153-163):** `sectionLevelIds` is built from `e.id` (e.g. `layout.not-found`, `section-body-offer-capacity`). The file filter `file.match(/components\/([^/]+)\//)` extracts the **directory name** (e.g. `not-found`, `offer-capacity`). For multi-segment IDs like `layout.not-found`, the archetype `id` is `layout.not-found` but the directory is `not-found` (sourceFile: `components/not-found.yaml`). The `sectionLevelIds.has(match[1])` check will fail for any component whose directory name differs from its archetype ID. The filter should use `sourceFile` path matching instead of `id` comparison.
- **C-4 (Compass sync):** The RFC does not identify which `docs/*.xml` files need synchronization. If the check scope changes, `docs/verification-plan.xml` may need a new verification method entry. The RFC should mention this.
- **C-5 (AGENTS.md updates):** The RFC's acceptance criteria (line 245) mentions updating AGENTS.md but doesn't specify which one. The most likely target is `packages/werkstatt-site/AGENTS.md` § Check commands, which lists all validators.

## Axis D — Forward-only compliance

No issues. The RFC extends an existing check's scope without adding compatibility layers or dual-paths.

## Axis E — Agent-facing policy

- **E-1 (reviewers, line 9):** `reviewers: []` is empty. For `draft` status this is acceptable, but before transitioning to `implemented`, a reviewer must be added (V-25).
- **E-2 (status gate):** The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 249). No self-authorizing language.
- **E-3 (NEEDS CLARIFICATION markers):** No unresolved markers found.

## Axis F — Pragmatism

- **F-1 MAJOR (false-positive risk underestimated, line 208):** The RFC claims `responsive-image` and `live-photo` are "not registered in the archetype index" and therefore excluded. Both ARE registered with `layer: component` in `index.yaml` (lines 220-228 and 418-426 respectively). The proposed filtering logic WOULD scan them, producing false positives — these are pure sub-components that should never wrap `<SectionShell>`. The RFC's exclusion claim is factually wrong.
- **F-2 MAJOR (incomplete component list, lines 54-74):** The RFC lists 21 section-level components but the archetype index has ~27 entries with `layer: component`. Missing from the RFC's list: `brand-label`, `copyright`, `currency-selector`, `lang-switcher`, `material-credit`, `scroll-to-top`, `social-meta`. Several of these are pure sub-components (brand-label, copyright, lang-switcher, scroll-to-top, material-credit) that would produce false positives.
- **F-3 (UTILITY_COMPONENT_SLUGS, line 209):** The proposed allow-list mechanism uses archetype IDs, but the filtering logic uses directory names (see C-3). For `layout.not-found`, the allow-list would need `not-found` (directory name) or the filtering logic needs to change. The two mechanisms are misaligned.

## Axis G — Blind spots

- **G-1 (performance):** The RFC mentions the WeakMap AST cache and "single small YAML file" (line 230). The archetype index is 26.9K — not huge, but parsed on every invocation. Consider caching the parsed YAML or reading it once per pipeline run.
- **G-2 (edge case — empty components dir):** If `components/` is empty or missing, `collectFiles` returns empty (same swallow-errors behavior). The validator would silently pass with zero files scanned. No diagnostic warning is emitted.
- **G-3 (edge case — archetype index missing):** If the archetype index file is missing, `readFile` throws. The RFC's proposed code doesn't handle this case — it would crash the entire pipeline. Should catch and emit a PARSE or IO warning.

## Questions for the author

1. The existing `walkAstroSections` path (`ui/src/sections`) is wrong — it includes a non-existent `src/` segment and silently scans zero files. Should the RFC fix this pre-existing bug as part of the same change, or should it be a separate fix? If separate, the RFC's premise that "SHELL-01..04 enforces that every shared section roots through SectionShell" (line 50) is currently false.
2. The archetype index is at `packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml`, not `packages/werkstatt-shared/src/ontology/archetypes/index.yaml`. Should the proposed code read from the correct path, or is there an intent to move the index to `werkstatt-shared`?
3. How should the filtering logic handle components whose archetype `id` differs from their directory name (e.g. `layout.not-found` → directory `not-found/`, `section-body-offer-capacity` → directory `offer-capacity/`)? Should the filter use `sourceFile` path matching instead of `id` comparison?
4. `responsive-image` and `live-photo` are registered in the archetype index with `layer: component` but are pure sub-components. The proposed logic would scan them and produce false positives. Should the `UTILITY_COMPONENT_SLUGS` allow-list include them, or should the filtering use a different signal (e.g. a `sectionLevel: true` flag in the archetype YAML)?
