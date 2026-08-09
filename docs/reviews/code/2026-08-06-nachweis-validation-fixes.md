# Code Review: Nachweis Validation Fixes

**Date:** 2026-08-06 **Scope:** `8cb2dfa3..HEAD` (3 commits, 19 files, +144/-32 lines) **Reviewer:** fo-review (automated)

## Commits

1. `eed9d84b` — fix(nachweis): replace hardcoded `lang='de'` with `resolveDefaultLang` from `system.md` `i18n.default`
2. `e122f64c` — fix(nachweis): consent matching in `nachweis.validate` — match by `c.id` fallback
3. `6e1d5a64` — fix(nachweis): ownership map entries, CSS token fixes, transparency block body.kind

## Mechanical Floor

- `@warpgogol/site-kernel-handoff` `build:check` — **PASS**
- `@warpgogol/site-kernel-checks` `build:check` — **PASS**
- `nachweis-commands.test.ts` — **30/30 PASS** (after fixture fix: added `writeSystemManifest` to `writeEntitlements` helper)

## Axis A — Structural Correctness

| Item | Verdict | Notes |
| --- | --- | --- |
| Strict typing | **PASS** | `resolveDefaultLang` returns `Promise<string>`, throws on missing `i18n.default`. No `any` introduced. |
| Magic numbers/strings | **PASS** | No new magic values. |
| Minimalism | **PASS** | `resolveDefaultLang` is a small focused helper, reused across 10 call sites. |
| Dead code | **PASS** | No unreachable branches. |
| Error handling | **PASS** | Descriptive error message with context: `[nachweis] system.md i18n.default is required...`. |
| Duplicated Code | **PASS** | The `lang = "de"` hardcode was duplicated across 10 files; `resolveDefaultLang` eliminates it. |
| Shotgun Surgery | **PASS (expected)** | 10 files changed for a single logical fix (lang resolution), but each is a 2-line mechanical replacement. This is the correct shape for removing a hardcoded constant. |

## Axis B — DNA Alignment

| Invariant | Verdict | Notes |
| --- | --- | --- |
| DNA-4 (Canonical content in `src/content/`) | **PASS** | `resolveDefaultLang` reads `system.md` from `src/content/` — the canonical location for site configuration. Removes hardcoded `lang = "de"` that violated DNA-4. |
| DNA-10 (No hardcoded design tokens) | **PASS** | CSS fixes replace non-existent `--ds-font-size-*` tokens with valid `--ds-text-*` tokens. Also fixes `--ds-color-warning` → `--ds-color-warning-strong`, `--ds-color-text-tertiary` → `--ds-color-text-quiet`, `--ds-color-focus` → `--ds-color-accent-focus`. All replacements use existing tokens from `tokens.css`. |
| DNA-24 (Block-declarative pages) | **PASS** | `transparency` blocks changed from `body.kind: paragraphs` to `body.kind: list` — the `transparency` section archetype dispatches to `SectionList` which requires `body.items`, not `body.paragraphs`. |
| DNA-44 (Sternsystem bundle contract) | **PASS** | `GENERATOR_OWNERSHIP_MAP` entries added for `public/.well-known/bordbuch/events.ndjson`, `status.generated.yaml`, `nachweis-pubkey.json`, `public/nachweise/manifest.json` — all map to their correct owning modules in `packages/os/site-kernel-handoff/src/`. |
| DNA-58 (Generated-file content determinism) | **PASS** | `behavior.snapshot.generate` regenerated to include 99 routes including new nachweis routes. |

## Axis C — Ecosystem Fit

| Item | Verdict | Notes |
| --- | --- | --- |
| Package boundaries | **PASS** | `site-kernel-handoff` imports from `site-kernel-content` (`loadSystemManifest`) — both are `packages/os/*`, valid dependency direction. |
| Ownership map module paths | **PASS** | All 4 new `GENERATOR_OWNERSHIP_MAP` entries point to correct modules: `bordbuch-io.ts`, `bordbuch-generate.ts`, `nachweis-key-ensure.ts`, `nachweis-manifest.ts`. |
| `markerPolicy: "registry-only"` | **PASS** | All 4 entries use `registry-only` — these are generated files tracked in git without generated markers. Consistent with existing entries. |

## Axis D — Forward-Only Discipline

| Item | Verdict | Notes |
| --- | --- | --- |
| No downgrade path | **PASS** | `resolveDefaultLang` is a pure addition; old `lang = "de"` is replaced, not paralleled. |
| No speculative generality | **PASS** | `resolveDefaultLang` serves an immediate need (10 call sites). No unused parameters. |

## Axis E — Agent Clarity

| Item | Verdict | Notes |
| --- | --- | --- |
| Compass headers | **N/A** | No new source files with Compass headers added. Modified files retain existing headers. |
| Error messages | **PASS** | `resolveDefaultLang` error: `[nachweis] system.md i18n.default is required to resolve PBP entity language.` — clear, actionable, prefixed with module name. |

## Axis F — Test Coverage

| Item | Verdict | Notes |
| --- | --- | --- |
| Existing tests pass | **PASS** | 30/30 nachweis-commands tests pass after fixture fix. |
| Test fixture fix | **FINDING F-1** | `writeEntitlements` helper was modified to also write `system.md` via `writeSystemManifest`. This is correct — every test that creates a `cachePath` with `writeEntitlements` now needs `system.md` for `resolveDefaultLang`. The fix is minimal and coupled. |
| No new test for `resolveDefaultLang` | **FINDING F-2 (advisory)** | `resolveDefaultLang` has no dedicated unit test. It is exercised indirectly through 30 nachweis command tests. A direct test for the missing-`i18n.default` error path would be valuable but is not blocking. |
| No test for consent `c.id` fallback | **FINDING F-3 (advisory)** | The `c.id === slug` fallback in `nachweis-validate.ts:259` has no dedicated test. The existing consent test uses `slug` matching via `c.data.slug`, not `c.id`. A test where consent entity `id` matches slug but `data.slug` is absent would verify the fallback. Advisory only — the production case (nicaragua-projekt) was verified end-to-end. |

## Axis G — CSS Token Correctness

| Item | Verdict | Notes |
| --- | --- | --- |
| `--ds-font-size-sm` → `--ds-text-sm` | **PASS** | `--ds-text-sm: 0.9rem` exists in `tokens.css:140`. |
| `--ds-font-size-xs` → `--ds-text-xs` | **PASS** | `--ds-text-xs: 0.64rem` exists in `tokens.css:147`. |
| `--ds-font-size-base` → `--ds-text-2` | **PASS** | `--ds-text-2: 1rem` exists in `tokens.css:116`. |
| `--ds-color-warning` → `--ds-color-warning-strong` | **PASS** | `--ds-color-warning-strong: rgb(140 91 11)` exists in `tokens.css:291`. |
| `--ds-color-text-tertiary` → `--ds-color-text-quiet` | **PASS** | `--ds-color-text-quiet: rgb(107 114 128)` exists in `tokens.css:254`. |
| `--ds-color-focus` → `--ds-color-accent-focus` | **PASS** | `--ds-color-accent-focus: rgb(230 176 62 / 0.85)` exists in `tokens.css:273`. |
| `biome.tokens.validate` | **PASS** | 0 errors, 0 warnings — 74 CSS files, 1161 token uses checked. |

## Findings Summary

| ID | Severity | Description | Action |
| --- | --- | --- | --- |
| F-1 | **fixed** | Test fixtures missing `system.md` for `resolveDefaultLang` | Fixed: `writeEntitlements` now writes `system.md` |
| F-2 | advisory | No dedicated unit test for `resolveDefaultLang` error path | Non-blocking — indirectly covered |
| F-3 | advisory | No dedicated test for consent `c.id` fallback | Non-blocking — verified end-to-end in production |

## Verdict

**APPROVED.** The diff is structurally sound, DNA-aligned, ecosystem-fitting, and forward-only. The mechanical floor passes (typecheck + 30/30 tests). CSS token fixes are correct — all replacement tokens exist in `tokens.css`. The `GENERATOR_OWNERSHIP_MAP` entries are accurate. Two advisory findings (F-2, F-3) are non-blocking and can be addressed in a follow-up if desired.
