---
reviewId: REVIEW-CODE-2026-07-28-01
date: 2026-07-28
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: ecdc062...HEAD
filesReviewed:
  - packages/star-map/src/render.ts
  - packages/star-map/src/svg-renderer.ts
  - packages/studio-gate/src/index.ts
  - packages/studio-gate/src/auth-errors.ts
  - packages/studio-gate/src/tool-dispatcher.ts
  - packages/surface/src/blueprint.ts
  - packages/surface/src/blueprint-types.ts
  - packages/surface/src/index.ts
  - packages/surface/src/governance/index.ts
  - packages/tokens/package.json
  - packages/tokens/scripts/gen-token-names.ts
  - packages/tokens/src/index.ts
  - packages/tokens/src/token-names.generated.ts
---

# Code Review: ecdc062...HEAD (5 commits, 13 files)

### Verdict: Needs revision

The diff contains four clean extraction/refactor tasks (star-map, studio-gate, surface, tokens) that are mechanically sound — all packages pass `build:check` and tests. However, there are two findings that require action: a dead import in `blueprint-types.ts` and an orphaned sub-barrel (`governance/index.ts`) that is still referenced by one consumer and still declared as a package export. Additionally, two AGENTS.md files are stale after the extractions.

### Mechanical floor

**Pass** — all four affected packages pass `build:check` and tests:

- `@warpgogol/star-map`: 11 tests pass
- `@warpgogol/studio-gate`: 39 tests pass
- `@warpgogol/surface`: 47 tests pass
- `@warpgogol/tokens`: 14 tests pass

### Axis A — Structural correctness

- **Dead import in `blueprint-types.ts`** — `import type { EligibilityPolicy } from "./types.ts"` at line 16 is unused. `EligibilityPolicy` is not referenced anywhere in `blueprint-types.ts`; it was left over from the extraction. TypeScript `build:check` passes because `import type` is elided, but this is dead code. **Fails.**

- **`blueprint.ts` double import from `blueprint-types.ts`** — Lines 41–72 contain a `export type { ... } from "./blueprint-types.ts"` re-export block, then line 74 has a separate `import type { Blueprint, BlueprintPolicy, BlueprintLevel } from "./blueprint-types.ts"`. This is functionally correct but structurally redundant — the three types could be included in the re-export block and imported locally from the same statement. Minor, no functional impact. **Passes (advisory).**

- **`tokens/index.ts` stale MODULE_CONTRACT** — Line 12: `<item>Do not include app-specific override tokens (e.g. --ds-z-*).</item>` but `--ds-z-*` tokens ARE included in `tokens.css` (lines 607–614) and in the generated `TOKEN_NAMES`. The AGENTS.md for `@warpgogol/tokens` explicitly lists z-index as a canonical category. This non-goals item is stale and contradicts the actual behavior. **Fails.**

- **`tokens/index.ts` stale reference to `apps-todo/main`** — Line 7: `DEFAULT values are those of the Warpgogol studio site (apps-todo/main).` — `apps/` is retired (RFC-0381). This is a stale reference but predates this diff. **Passes (pre-existing).**

### Axis B — DNA alignment

- **DNA-42 (Compass markup)** — New files `svg-renderer.ts`, `auth-errors.ts`, `tool-dispatcher.ts`, `blueprint-types.ts` all carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. `token-names.generated.ts` carries a "GENERATED — do not edit" header, which is correct for generated files (scaffolding mode: `none`). **Passes.**

- **DNA-6 (kebab-case)** — All new filenames use kebab-case: `svg-renderer.ts`, `auth-errors.ts`, `tool-dispatcher.ts`, `blueprint-types.ts`, `token-names.generated.ts`, `gen-token-names.ts`. **Passes.**

- **DNA-1 (monorepo boundary)** — No cross-package boundary violations. All imports stay within their own package. **Passes.**

### Axis C — Ecosystem fit

- **Orphaned `governance/index.ts` sub-barrel** — `packages/surface/src/index.ts` was refactored to import directly from `governance.ts`, `breaker.ts`, `fleet.ts`, etc., bypassing `governance/index.ts`. However:
  1. `governance/index.ts` still exists and is not imported by `index.ts` anymore.
  2. `packages/surface/src/io/visibility-outcomes-io.ts:22` still imports `from "../governance/index.ts"` — a consumer left on the old sub-barrel.
  3. `package.json` line 34–37 still declares `"./governance"` as a public export pointing to `governance/index.ts`.

  The sub-barrel is now in an inconsistent state: the main barrel bypasses it, but one consumer and the package export still reference it. Either delete `governance/index.ts` and update the consumer + `package.json`, or keep it and have `index.ts` re-export from it. **Fails.**

- **AGENTS.md not updated for new modules** — Three AGENTS.md files are stale after the extractions:
  1. `packages/star-map/AGENTS.md` — does not mention `svg-renderer.ts` in its "What lives here" table.
  2. `packages/studio-gate/AGENTS.md` — does not mention `auth-errors.ts` or `tool-dispatcher.ts` in its module table.
  3. `packages/AGENTS.md` — the `surface` entry still says "`governance/index.ts` groups pure Zod schema bags" but the main barrel now imports directly from the individual modules.

  **Fails** — AGENTS.md files should be updated when new modules are extracted.

- **`tokens` codegen script not in AGENTS.md** — `packages/tokens/AGENTS.md` does not mention the `codegen:token-names` script or the `token-names.generated.ts` file. **Fails.**

### Axis D — Forward-only compliance

- No compatibility shims, bridges, or dual-paths. The `blueprint.ts` re-export from `blueprint-types.ts` is a direct re-export, not a compatibility shim. **Passes.**

- The `governance/index.ts` situation is not a forward-only violation — it's an incomplete migration, not a deliberate compatibility layer. **Passes.**

### Axis E — Agent-facing clarity

- **Compass scaffolding** — All new authored files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. The generated file carries a "GENERATED" header. **Passes.**

- **No ungrounded assertions** — Code comments reference real functions, types, and files. **Passes.**

- **Readable names** — `findTool`, `buildCommandArgs`, `dispatchTool`, `formatAuthError`, `renderSvg` — all clear. **Passes.**

### Axis F — Pragmatism

- **Minimal command surface** — The `codegen:token-names` script is a single-purpose codegen step, not a new command. It earns its existence by eliminating a 448-line hand-maintained array. **Passes.**

- **Existing patterns** — The codegen approach mirrors the existing `growth` package's `gen-event-names.ts` pattern. **Passes.**

- **Scope discipline** — Each extraction is minimal and focused. No scope creep. **Passes.**

### Axis G — Blind spots

- **Codegen regex robustness** — The `gen-token-names.ts` script uses `/^\s*(--ds-[a-z0-9-]+)\s*:/gm` to match custom properties. This correctly handles the `:root {}` block in `tokens.css`. It deduplicates via `!tokens.includes(name)`. The regex won't match tokens with uppercase letters or non-alphanumeric characters, but `--ds-*` tokens are all lowercase kebab-case by convention. **Passes.**

- **Codegen idempotency** — Running the codegen twice produces identical output (deterministic). **Passes.**

- **Edge cases** — The codegen handles empty CSS gracefully (would produce an empty array). **Passes.**

### Spec compliance

No spec available — spec compliance skipped. The diff is a series of architectural refactoring tasks from a todo list, not an RFC implementation.

### Questions for the author

1. **`governance/index.ts`**: Should the sub-barrel be deleted (and `visibility-outcomes-io.ts` + `package.json` updated), or should `index.ts` revert to re-exporting from it? The current state is half-migrated.
2. **`blueprint-types.ts` dead import**: Was `EligibilityPolicy` intentionally kept for future use, or is it a leftover from the extraction?
3. **`tokens/index.ts` stale non-goals**: The `--ds-z-*` exclusion in the MODULE_CONTRACT contradicts the actual `tokens.css` content. Should the non-goals item be removed or corrected?
