# Code Review: Compass Headers for Game Plugin Projects

**Date:** 2026-08-20
**Scope:** Uncommitted diff (15 files, +115/-20 lines)
**Reviewer:** fo-review skill (autonomous)

## Diff summary

Enable Compass headers for game plugin projects (Phaser, Godot) by:
1. Adding `.cs`, `.tscn`, `.tres`, `.gd` to `SOURCE_EXTENSIONS` in compass-inventory
2. Adding `compass` field to stack profile schema + interface + `stackProfileSchema`
3. Flowing profile `compass.fileExtensions` → `forge.yaml` via `loadProfileDomainFields` → `runInit`
4. Adding `compass.fileExtensions` to `phaser-turborepo.yaml` and `godot-csharp.yaml`
5. Extending `comment-styles.md` with game file comment syntax
6. Expanding `reads`/`writes` glob patterns in `compass.module.ts` (8 commands)
7. Adding `compass.validate` to scaffolded CI + pre-commit hooks for both game profiles

## Mechanical floor

- **tsc:** clean (0 errors)
- **vitest:** 77 files, 1005 tests, all pass
- **No lint errors reported**

## Axis A — Structural correctness

### PASS items

- **Strict typing:** `compass` schema uses `z.object({ fileExtensions: z.array(z.string()).optional(), testPatterns: z.array(z.string()).optional() }).optional()` — properly typed, optional fields, no `any`.
- **No magic numbers:** No new magic numbers introduced.
- **Minimalism:** The merge pattern `config.bindings.compass = { ...(config.bindings.compass ?? {}), ...domainFields.compass }` follows the same pattern as the existing `terminology` merge on line 148. Consistent.
- **No dead code:** All new code paths are reachable.
- **Error handling:** No new error paths introduced. The `loadProfileDomainFields` catch block returns `{}` on failure, which is existing behavior.

### FINDING A-1: `SOURCE_EXTENSIONS` is hardcoded — `forge.yaml` `compass.fileExtensions` is written but never read

**Severity:** medium (architectural gap)
**File:** `packages/forge/os/compass/handlers/compass-inventory.ts:25-38`

The `SOURCE_EXTENSIONS` set is hardcoded. The `compass.fileExtensions` field is written to `forge.yaml` during `forge create`, but `createCompassInventoryEntries` never reads `forge.yaml` to determine which extensions to scan. The profile-declared extensions flow into `forge.yaml` as documentation only — they have no runtime effect.

This means:
- A project that adds a custom extension to `forge.yaml` `compass.fileExtensions` will not have it discovered by `compass.validate`.
- The `forge.yaml` field creates a false expectation that it controls Compass behavior.
- The hardcoded `SOURCE_EXTENSIONS` is the actual source of truth, diverging from the declarative config.

**Recommendation:** Either (a) make `createCompassInventoryEntries` read `forge.yaml` `compass.fileExtensions` and merge with the hardcoded set, or (b) document that `forge.yaml` `compass.fileExtensions` is declarative metadata only, not a runtime config. Option (a) is the correct long-term design — the profile-driven config should drive runtime behavior.

### FINDING A-2: `compass.summary.trim` will corrupt line-comment-style files (`.gd`, `.tscn`, `.tres`)

**Severity:** high (data corruption risk)
**File:** `packages/forge/os/compass/handlers/compass-change-summary-handler.ts:58-68`

`rebuildChangeSummaryBlock` reconstructs the `CHANGE_SUMMARY` block as raw XML tags:
```ts
function rebuildChangeSummaryBlock(items: string[]): string {
  const lines = ["<CHANGE_SUMMARY>"];
  for (const item of items) {
    lines.push(`  <item>${item}</item>`);
  }
  lines.push("</CHANGE_SUMMARY>");
  return lines.join("\n");
}
```

For `.ts`/`.cs` files, this works — the block is inside `/* ... */`, so raw `<CHANGE_SUMMARY>` tags are valid.

For `.gd` files, each line of the block must be prefixed with `# `. For `.tscn`/`.tres`, each line must be prefixed with `; `. The `rebuildChangeSummaryBlock` function does NOT add these prefixes. If `compass.summary.trim` runs on a `.gd` file, it will produce:
```
# <CHANGE_SUMMARY>
  <item>fixed bug</item>
</CHANGE_SUMMARY>
```
instead of:
```
# <CHANGE_SUMMARY>
#   <item>fixed bug</item>
# </CHANGE_SUMMARY>
```

This corrupts the file — the unprefixed lines become code/statements instead of comments, breaking the file syntax.

**Recommendation:** `rebuildChangeSummaryBlock` and `replaceChangeSummaryBlock` need to be comment-syntax-aware. They should detect the file extension and prefix each line accordingly. Alternatively, `compass.summary.trim` should skip files with line-comment syntaxes until this is fixed.

### FINDING A-3: `detectMarkup` uses `source.includes()` — works for all comment styles

**Severity:** pass (no issue)
**File:** `packages/forge/os/compass/handlers/compass-inventory.ts:438-441`

`detectMarkup` checks `source.includes("<MODULE_CONTRACT>")` and `source.includes("<CHANGE_SUMMARY>")`. This is comment-syntax-agnostic — it finds the tags regardless of whether they're inside `/* */`, `<!-- -->`, `# `, or `; ` comments. This is correct for validation (detection). The issue is only with mutation (A-2).

### FINDING A-4: `extractBlockContent` regex is comment-syntax-agnostic — works for all styles

**Severity:** pass
**File:** `packages/forge/os/compass/handlers/compass-inventory.ts:383-387`

`extractBlockContent` uses `source.match(new RegExp(\`<${tagName}>[\\s\\S]*?</${tagName}>\`))`. This matches the XML tags regardless of comment wrapper. Correct for validation.

## Axis B — DNA alignment

### DNA-185 (Compass scaffolding)

> Every authored source file in `apps/` and `packages/` that requires semantic scaffolding MUST carry exactly two Compass blocks...

**Status:** PARTIALLY ALIGNED

The invariant says "apps/ and packages/". The `SOURCE_EXTENSIONS` now includes game extensions, and `DEFAULT_SCAN_ROOTS` is `["apps", "packages", "services"]`. The invariant doesn't mention `services/` — but Compass already scanned services before this diff, so this is a pre-existing condition, not introduced here.

The invariant requires `MODULE_CONTRACT` with `<purpose>` ≥ 10 words and ≥ 1 `<non-goals>` item, and `CHANGE_SUMMARY` with ≥ 1 item. The validation logic (`detectComplianceViolations`) enforces this correctly for all file types — the detection is string-based and comment-syntax-agnostic.

**Gap:** The invariant says "apps/ and packages/" but game projects use `apps/` for game code. The Godot profile scaffolds `apps/` as a workspace dir. This is aligned.

### DNA-189 (Compass audit)

> Every authored file with risk-class-dependent scaffolding undergoes periodic semantic-truth audit...

**Status:** ALIGNED — no changes to audit logic. The audit commands now scan game files via the expanded `reads` patterns.

## Axis C — Ecosystem fit

### PASS items

- **Package boundaries:** All changes are within `@warpgogol/forge`. No cross-package imports added.
- **No engine back-imports:** `forge` package remains autonomous (RFC-0556). No imports from `@warpgogol/werkstatt` or `@warpgogol/werkstatt-site`.
- **Profile schema extension:** The `compass` field follows the existing `stackProfileDomainFieldsSchema` pattern. It's optional, additive, and doesn't break existing profiles.
- **`forge.yaml` config flow:** The `runInit` merge follows the same pattern as `terminology` and `semanticBindings`.

### FINDING C-1: `compass.validate` in pre-commit hook may be too slow for game projects

**Severity:** low (UX concern)
**File:** `packages/forge/profiles/phaser-turborepo.yaml:299`, `packages/forge/profiles/godot-csharp.yaml:696`

The pre-commit hook now runs three commands: `werkstatt.autonomy.validate`, `werkstatt.plugin.validate`, `compass.validate`. For a Godot project with hundreds of `.cs` files, `compass.validate` reads every source file and checks for markup. This could add several seconds to every commit.

The Werkstatt workshop's own pre-commit hook does NOT run `compass.validate` (it runs only ENV/CSS/RFC guards). Compass validation runs in the release pipeline instead.

**Recommendation:** Consider making the pre-commit `compass.validate` opt-in or warn-only for game projects, or document that it may be slow. Alternatively, keep it — game projects typically have fewer source files than the Werkstatt monorepo.

## Axis D — Forward-only discipline

### PASS

- No backward compatibility shims introduced.
- No deprecated fields kept alive.
- The `compass` field is additive — existing profiles without it are unaffected.
- `SOURCE_EXTENSIONS` is extended, not replaced — existing extensions still work.

## Axis E — Agent clarity

### FINDING E-1: `comment-styles.md` documents syntax but no code enforces it

**Severity:** medium (agent confusion risk)
**File:** `packages/forge/skills/fo/fo-compass-annotate/reference/comment-styles.md`

The `comment-styles.md` reference tells agents to use `; ` prefix for `.tscn`/`.tres` and `# ` prefix for `.gd`. But:
1. `compass.validate` only checks for `<MODULE_CONTRACT>` string presence — it doesn't verify the comment syntax is correct.
2. `compass.summary.trim` doesn't respect line-comment prefixes (A-2).
3. The `fo-compass-annotate` skill reads `comment-styles.md` to know HOW to write headers, but there's no validation that the agent actually used the correct comment syntax.

An agent could write a `.gd` file with `/* <MODULE_CONTRACT> ... */` (wrong syntax for GDScript) and `compass.validate` would pass — the tags are present, even though the comment syntax is wrong. The file would have broken syntax but a "valid" Compass header.

**Recommendation:** Add a comment-syntax validator that checks whether the comment wrapper around `MODULE_CONTRACT` matches the expected syntax for the file extension. This is a future improvement — for now, the `comment-styles.md` reference is the only guide.

## Axis F — Test coverage

### FINDING F-1: No unit tests for the new `compass` profile field flow

**Severity:** medium
**Files:** `packages/forge/src/onboarding/create.ts:90-92`, `packages/forge/src/onboarding/init.ts:157-162`

The `loadProfileDomainFields` extraction and `runInit` merge of `compass` settings are untested. The existing `create.test.ts` tests verify `forge.yaml` creation but don't assert that `compass.fileExtensions` appears in the generated config when a profile declares it.

**Recommendation:** Add a test case in `create.test.ts` that scaffolds with `--profile godot-csharp` and asserts `forge.yaml` contains `compass.fileExtensions` with `.cs`, `.tscn`, `.tres`, `.gd`.

### FINDING F-2: No unit tests for `compass.validate` on game file extensions

**Severity:** medium
**File:** `packages/forge/os/compass/handlers/compass-inventory.ts`

The existing `compass-inventory.test.ts` in `packages/werkstatt` tests Compass inventory behavior, but there are no tests verifying that `.cs`, `.tscn`, `.tres`, `.gd` files are discovered and validated correctly.

**Recommendation:** Add test cases that create temp files with game extensions and verify `createCompassInventoryEntries` discovers them and `detectMarkup` finds their Compass blocks.

## Axis G — Pragmatism

### PASS

- The changes are minimal and focused — each file change serves a clear purpose.
- The profile-driven approach (declaring extensions in profile YAML) is the right pattern — it just needs to be wired through to runtime (A-1).
- Adding `compass.validate` to CI and pre-commit is pragmatic — it catches missing headers early.

## Summary

| Axis | Findings | Severity |
| --- | --- | --- |
| A — Structural | A-1 (hardcoded extensions), A-2 (trim corruption), A-3 (pass), A-4 (pass) | 1 high, 1 medium |
| B — DNA | Partially aligned (DNA-185) | — |
| C — Ecosystem | C-1 (pre-commit speed) | 1 low |
| D — Forward-only | Pass | — |
| E — Agent clarity | E-1 (no syntax enforcement) | 1 medium |
| F — Tests | F-1 (no profile flow test), F-2 (no game ext test) | 2 medium |
| G — Pragmatism | Pass | — |

## Critical findings (must fix before commit)

1. **A-2 (high):** `compass.summary.trim` will corrupt `.gd`/`.tscn`/`.tres` files by not prefixing rebuilt lines with the correct comment syntax. Either fix `rebuildChangeSummaryBlock` to be comment-syntax-aware, or exclude line-comment-style files from `compass.summary.trim`.

## Important findings (should fix)

2. **A-1 (medium):** `forge.yaml` `compass.fileExtensions` is written but never read at runtime. The profile-driven config should drive `SOURCE_EXTENSIONS`, not just document it.
3. **E-1 (medium):** No validation enforces correct comment syntax per file type. Agents may write headers in wrong comment style and `compass.validate` will pass.
4. **F-1 (medium):** No test verifies the profile → `forge.yaml` `compass` flow.
5. **F-2 (medium):** No test verifies game extensions are discovered by `createCompassInventoryEntries`.

## Minor findings (nice to have)

6. **C-1 (low):** Pre-commit `compass.validate` may be slow for large game projects.
