---
reviewId: REVIEW-CODE-2026-07-25-20
date: 2026-07-25
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a01cae014...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/page-markdown.ts
  - packages/os/site-kernel-checks/src/surface-media-leakage-validate.ts
  - packages/ui/src/components/material-credit/material-credit.astro
  - onboarding/.output/04-author/first-party-data.yaml
---

# Code Review: a01cae014...HEAD (4 files, +44 −23)

### Verdict: Needs revision

The diff fixes three real build-check failures (page-markdown base path, media-leakage context-aware matching, MaterialCredit enum leakage) but breaks an existing unit test, leaves dead code, and introduces a content-level inconsistency in `first-party-data.yaml`.

### Mechanical floor

**Partial pass** — `tsc --noEmit` passes for `@warpgogol/site-kernel-checks` and `@warpgogol/ui`. However, `vitest run src/tests/surface-media-leakage-validate.test.ts` **fails 1 test**:

```
FAIL  detects context-aware prohibited string Gemini inside figcaption
AssertionError: expected 0 to be greater than 0
```

The test encodes the old inverted behavior (flag patterns _inside_ credit context). The fix correctly inverts the logic, but the test was not updated.

### Axis A — Structural correctness

- **Dead code — `extractCreditContextHtml` and `creditContextHtml` parameter.** `extractCreditContextHtml` is still called at `surface-media-leakage-validate.ts:210` and its result is passed as `creditContextHtml` to `matchProhibitedString`, but none of the three `switch` cases use it anymore. The `context-aware` case now calls `stripCreditContext(visibleHtml)`. The function and parameter should be removed.
- **Duplicated Code — `stripCreditContext` and `extractCreditContextHtml`.** Both functions match the same four element types (`figcaption`, `details`, `dl`, `data-credit-context`) with identical regex patterns. One extracts, one strips. Only `stripCreditContext` is needed; `extractCreditContextHtml` is dead.
- **Redundant normalization in `surfaceRoutePaths`.** `surface-media-leakage-validate.ts:191` builds `normalized` with `"/" + route.replace(...).replace(...) + "/"` then applies `.replace(/\/+/g, "/")`. The second replace is only needed if `route` contains interior `//`, which is unlikely from surface artifact route paths. Not a bug, but verbose.

### Axis B — DNA alignment

- **DNA-4 (canonical content)** — Pass. The `first-party-data.yaml` edit adds a field declaration to the content/strategy layer, not to a route or component.
- **DNA-1 (monorepo boundary)** — Pass. No cross-app imports introduced.
- **DNA-24 (block-declarative pages)** — N/A. No page entries changed in this diff.

### Axis C — Ecosystem fit

- **Package boundaries** — Pass. `material-credit.astro` imports `labelForSourceType` from `@warpgogol/share`, which is the correct package.
- **Pipeline placement** — Pass. No new commands; existing validators fixed in place.
- **Compass sync** — N/A. No repository-wide requirements or contracts changed.
- **AGENTS.md updates** — N/A. No new rules or patterns introduced.

### Axis D — Forward-only compliance

- **No compatibility shims** — Pass. The `context-aware` strategy is changed directly, no dual-path.
- **Legacy removal** — Pass. `party.kind !== "Person"` is replaced with `party.kind === "Organization"`, not kept behind a flag.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — N/A. No new source files.
- **Ungrounded assertions** — Pass. Comments reference real RFCs (RFC-0166, RFC-0510) and the logic mirrors `people-routes.ts:88-97`.
- **Readable by another agent** — Pass. `teamPage`, `parentPage`, `stripCreditContext` are clear names.

### Axis F — Pragmatism

- **Minimal command surface** — Pass. No new commands.
- **Existing patterns** — Pass. `page-markdown.ts` now mirrors `people-routes.ts` logic exactly.
- **Scope discipline** — Pass. Each file change addresses one specific failure.

### Axis G — Blind spots

- **False positives** — The `stripCreditContext` regex uses non-greedy `[\s\S]*?` which will fail on nested `<details>` or `<dl>` elements (matches first closing tag). Not a regression — the same pattern was in `extractCreditContextHtml` before. In practice, MaterialCredit does not nest these elements.
- **Edge cases** — The `surfaceRoutePaths` filtering correctly skips non-surface pages. The `routeFromHtmlPath` function already normalizes with `.replace(/\/+/g, "/")`, so the normalization in `surfaceRoutePaths` is consistent.
- **Migration path** — The credit YAML data fix (replacing `commissioned-warpgogol-material` with human-readable labels) was done via `sed` across 14 files in the workpiece. This is a data fix, not a code fix — new credit files could still contain raw enum values in `license.label`. Consider adding a validator for `license.label` content.

### Spec compliance

No spec available — spec compliance skipped.

### Questions for the author

1. **Test update**: The test "detects context-aware prohibited string Gemini inside figcaption" now fails because the behavior was correctly inverted. Should this test be updated to "does NOT flag context-aware prohibited string inside figcaption" (expect 0 diagnostics), and a new test added for "detects context-aware prohibited string OUTSIDE credit context"?
2. **Dead code removal**: Should `extractCreditContextHtml` and the `creditContextHtml` parameter be removed in this diff, or in a follow-up cleanup?
3. **`first-party-data.yaml` inconsistency**: The comment on lines 32–35 says "no structured PII fields" and `consent.required: false` with note "no structured PII fields", but `email` (line 25–30) IS a structured PII field. Should the comment and consent section be updated to reflect the new email field?
