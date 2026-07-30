---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: c1e5430...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0614-public-well-known-bordbuch-conflict.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0614-expand-bordbuch-conflict-auto-resolution-to-include-public-well-known-bordbuch-paths-in-mission-reconcile.md
  - docs/rfcs/archive/implemented/rfc-0584-auto-resolve-bordbuch-delete-modify-conflicts-in-mission-reconcile.md
---

# Code Review: c1e5430...HEAD (RFC-0614 implementation)

### Verdict: Needs revision

The implementation is minimal and correct in its core logic — the dynamic `conflictedPaths` approach is a genuine improvement over hardcoded path literals. However, the test file contains a code smell (duplicated setup logic) and a potential edge case in the `setupCommonAncestor` helper that could mask failures.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes, `pnpm --filter @warpgogol/site-kernel-handoff test -- --run` passes (412 tests, 0 failures).

### Axis A — Structural correctness

- **Duplicated Code (test helper):** The `setupCommonAncestor` function and the inline setup in test case 5 ("mixed bordbuch + non-bordbuch conflict") share the same pattern: `gitInit` → `mkdirSync` → `writeFileSync` → `gitCommit` → `git clone`. The inline version duplicates this because it needs two files, but the helper only supports one. Consider generalizing `setupCommonAncestor` to accept a `Record<string, string>` of file paths → content, so test case 5 can reuse it. This is a minor smell — the test is still readable as-is.
- **Mysterious Name (`simulateDeleteModify`):** The function name is adequate but the `cacheFilePath` and `workpieceFilePath` parameters are always identical in all call sites. The two-parameter signature suggests they could differ, but they never do. Simplifying to a single `filePath` parameter would reduce confusion.

### Axis B — DNA alignment

No issues. The diff satisfies DNA-51 (Werkstatt consistency primitives) — it expands the bordbuch conflict auto-resolution scope without weakening any existing invariant. No DNA invariants are amended or introduced.

### Axis C — Ecosystem fit

No issues. `AGENTS.md` for `packages/os/site-kernel-handoff` is updated (line 158) to reflect the expanded scope. RFC-0584's `amendedBy` field is updated for V-19 bidirectional integrity. No new commands, no pipeline changes, no package boundary changes.

### Axis D — Forward-only compliance

No issues. The hardcoded path literals are replaced (not kept alongside) by the dynamic `conflictedPaths` approach. No dual-paths or compatibility shims.

### Axis E — Agent-facing clarity

No issues. The test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding. The RFC comment on line 759 is updated to reference both RFC-0584 and RFC-0614. Variable names (`pathArgs`, `conflictedPaths`, `isBordbuchPath`) are self-documenting.

### Axis F — Pragmatism

No issues. The change is minimal — 12 insertions, 17 deletions in the source file. No new commands, no new abstractions. The dynamic path approach is simpler than the hardcoded version it replaces.

### Axis G — Blind spots

- **Edge case — empty `conflictedPaths` after `git status` failure:** If `git status --porcelain` fails (line 785-786), `conflictedPaths` remains `[]`. The `allBordbuch` check (`conflictedPaths.length > 0 && ...`) correctly prevents auto-resolution in this case, falling through to the abort path. This is handled correctly.
- **Edge case — paths with spaces:** The `JSON.stringify(p)` in `pathArgs` construction correctly quotes paths containing spaces. No issue.
- **Test edge case — `setupCommonAncestor` mkdir:** The helper uses `join(filePath, "..").replace(/^\.\//, "")` to create parent directories. For `bordbuch/events.ndjson`, this produces `bordbuch` — correct. For `public/.well-known/bordbuch.json`, this produces `public/.well-known` — correct. For `public/.well-known/bordbuch/index.html`, this produces `public/.well-known/bordbuch` — correct. No issue, but the `replace(/^\.\//, "")` is defensive against a leading `./` that never appears in the test inputs. Minor dead code.

### Spec compliance

| Requirement from RFC-0614 | Status | Evidence |
| --- | --- | --- |
| `isBordbuchPath` matches `bordbuch/` and `public/.well-known/bordbuch*` | Done | `mission-materialization-commands.ts:789-790` — unchanged, already matched |
| `git checkout --ours`/`git add` use dynamic `conflictedPaths` | Done | `mission-materialization-commands.ts:796-806` |
| Auto-resolves `public/.well-known/bordbuch*` delete/modify conflicts | Done | Test cases 2-3 pass |
| Aborts on non-bordbuch conflicts | Done | Test case 5 passes |
| Regression test covers both RFC-0584 and RFC-0614 scenarios | Done | Test cases 1-3 |
| RFC-0584 `amendedBy` updated | Done | `docs/rfcs/archive/implemented/rfc-0584-*.md:25-26` |
| `rfc.validate` passes | Done | status: pass, violations: [] |

### Questions for the author

1. The `simulateDeleteModify` function takes both `cacheFilePath` and `workpieceFilePath` but they are always identical — was the two-parameter signature intentional for future flexibility, or can it be simplified to a single `filePath`?
2. Test case 5 ("mixed conflict") inlines the setup logic instead of reusing `setupCommonAncestor` — would generalizing the helper to accept multiple files be cleaner?
