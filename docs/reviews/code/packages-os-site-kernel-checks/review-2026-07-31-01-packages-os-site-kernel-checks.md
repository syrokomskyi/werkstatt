---
reviewId: REVIEW-CODE-2026-07-31-01
date: 2026-07-31
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 3e7d896~1...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/ownership-sync-validate.ts
  - packages/os/site-kernel-checks/src/generated-stale-validate.ts
  - packages/os/site-kernel-checks/src/command-tables/01-codegen.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts
  - packages/os/site-kernel-checks/src/tests/ownership-sync-validate.test.ts
---

# Code Review: 3e7d896~1...HEAD (RFC-0612 ownership.sync.validate)

### Verdict: Needs revision

The implementation is structurally sound and well-tested, but has a duplicated placeholder expansion function that should reuse existing logic from `generated-files-validate.ts`, and the OWN-02 diagnostic computes `resolvedPath` redundantly using a different path resolution strategy than the initial scan, which could produce inconsistent `file` paths in diagnostics.

### Mechanical floor

Pass — typecheck clean, 669 tests pass (110 files, including 7 new tests).

### Axis A — Structural correctness

1. **Duplicated placeholder expansion logic.** `expandPlaceholders` in `ownership-sync-validate.ts:68-77` duplicates the inline expansion in `generated-stale-validate.ts:79-85` and `generated-files-validate.ts`. The RFC itself says "Agents MUST use the same placeholder expansion logic — extract a shared utility if duplication is detected." This is duplicated logic (Fowler: Duplicated Code). Extract a shared `expandOwnershipPlaceholders` function to `generated-files-validate.ts` and import it from both `generated-stale-validate.ts` and `ownership-sync-validate.ts`.

2. **Redundant path computation in OWN-02.** `ownership-sync-validate.ts:121-127` recomputes `resolvedPath` for OWN-02 diagnostics using `join(basePath, expandedPath)` — a different resolution strategy than the initial scan which uses `resolveEntryPath()` for non-glob entries. This means the `file` field in OWN-02 diagnostics may not match the actual path checked during the scan. Store the resolved path from the initial scan and reuse it in the OWN-02 diagnostic.

### Axis B — DNA alignment

No issues. DNA-58 alignment is correctly described as supporting/indirect. The command does not weaken any existing invariant.

### Axis C — Ecosystem fit

1. **Pipeline placement is correct.** `ownership.sync.validate` is placed before `generated.stale.validate` in all three pipelines (`build-prepare`, `build-prepare-dev`, `sites-check-author`), consistent with the RFC's design.

2. **Command table registration is correct.** Entry in `01-codegen.ts:611-623` follows the same pattern as adjacent entries.

3. **AGENTS.md updated.** Module table entry added at `packages/os/site-kernel-checks/AGENTS.md:51`.

4. **COMMANDS.md updated.** Entry added at `docs/COMMANDS.md:296`.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy maintenance.

### Axis E — Agent-facing clarity

1. **Compass scaffolding present.** `ownership-sync-validate.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. Test file carries `MODULE_CONTRACT` with responsibilities.

2. **No ungrounded assertions.** All imports reference real modules. Diagnostic messages are clear and distinct from STALE-01.

### Axis F — Pragmatism

1. **`nonConditionalEntries` type annotation is verbose.** `Array<{ entry: typeof GENERATOR_OWNERSHIP_MAP[number]; expandedPath: string }>` — this inline type is readable but could be extracted to a named interface for clarity. Minor.

### Axis G — Blind spots

1. **No `--json` flag handling.** The RFC specifies `--json` as an optional flag, but the implementation doesn't reference `input.flags.json` or format output differently. The `diagnosticsResult` helper always returns `KernelCommandResult<CheckResult>` which is JSON-serializable, so this is likely handled by the kernel's output formatting layer. Verify this is the case — if the kernel doesn't auto-format `--json`, the command needs explicit handling.

2. **Preview image exemption not addressed.** `generated-stale-validate.ts` has a content-aware preview image resolver (`public/preview/{lang}/{slug}.png` with existing content page). `ownership-sync-validate.ts` does not implement this exemption. Preview images that are generated but whose ownership entries use `{lang}` and `{slug}` placeholders should be covered by glob expansion — but if any preview images are produced by a generator not in the ownership map, they will produce OWN-01 false positives. The RFC's nonGoals says "Do not check authored content files in src/content/" but doesn't explicitly address preview images. Consider whether the preview image exemption from `generated-stale-validate.ts` should be reused.

### Spec compliance

| Requirement from RFC-0612 | Status | Evidence |
| --- | --- | --- |
| Command registered with `--site` and `--json` flags | Done | `01-codegen.ts:611-623` |
| OWN-01 diagnostic | Done | `ownership-sync-validate.ts:139-152` |
| OWN-02 diagnostic | Done | `ownership-sync-validate.ts:121-134` |
| Pipeline integration (build.prepare) | Done | `build-prepare.ts:127-128` |
| Pipeline integration (sites-check-author) | Done | `sites-check-author.ts:259-260` |
| Static asset exemption via STATIC_ASSET_EXEMPT_DIRS | Done | `ownership-sync-validate.ts:145` |
| Conditional entries exempt from OWN-02 | Done | `ownership-sync-validate.ts:101,113` |
| Reuse placeholder expansion logic | Partial | Duplicated instead of shared (Axis A-1) |
| `--json` flag | Partial | Not explicitly handled (Axis G-1) |

### Questions for the author

1. Should `expandPlaceholders` be extracted to a shared utility in `generated-files-validate.ts` to eliminate the duplication identified in Axis A-1?
2. Does the kernel's output formatting layer handle `--json` automatically, or does the command need explicit `--json` handling?
3. Should the preview image content-aware exemption from `generated-stale-validate.ts` be reused to avoid false positives on generated preview images whose generator isn't in the ownership map?
