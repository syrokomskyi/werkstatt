---
rfcId: RFC-0690
planId: PLAN-RFC-0690-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - "packages/os/site-kernel-checks/AGENTS.md"
    - "docs/COMMANDS.md"
---

# Implementation Plan: RFC-0690

## 1. Objectives

- [ ] Objective 1 — Register `HEADING-UNIQ-01` rule id in the diagnostic rule registry (maps to acceptance criterion: "HEADING-UNIQ-01 diagnostic emitted")
- [ ] Objective 2 — Implement `surface.heading-uniqueness.validate` command handler using parse5 and surface artifact route identification (maps to acceptance criterion: "command registered in @warpgogol/site-kernel-checks")
- [ ] Objective 3 — Register the command in the build-artifacts command table and wire it into `SITES_CHECK_POSTBUILD_PIPELINE` (maps to acceptance criterion: "command integrated into build.post pipeline")
- [ ] Objective 4 — Write unit tests with pass and fail fixtures (maps to acceptance criterion: "command catches duplicate headings when bake functions reuse labels")
- [ ] Objective 5 — Verify the command passes on warpgogol-com with zero duplicate headings (maps to acceptance criterion: "command passes on warpgogol-com after the label fix")
- [ ] Objective 6 — Regenerate command manifest and docs, run validation suite, stamp RFC as implemented (maps to acceptance criterion: "rfc.validate passes on this file before merging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts` — **New**: command handler `runSurfaceHeadingUniquenessValidate`
- `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` — **Modified**: add `HEADING-UNIQ-01` rule descriptor
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — **Modified**: register `surface.heading-uniqueness.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` — **Modified**: add `{ command: "surface.heading-uniqueness.validate" }` after `surface.media-leakage.validate`
- `packages/os/site-kernel-checks/src/tests/surface-heading-uniqueness.test.ts` — **New**: unit tests with pass and fail fixtures
- `docs/command-manifest.generated.yaml` — **Regenerated**: `pnpm exec site-kernel run command.manifest.generate`
- `docs/COMMANDS.md` — **Regenerated**: `pnpm exec site-kernel run docs.commands.generate`

### 2.2 Configuration and data

No configuration or data files are affected. The command is read-only and requires no `.env.example` entries.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — **Modified**: add module table entry for `src/surface-heading-uniqueness.ts`
- `docs/COMMANDS.md` — **Regenerated** (see 2.1)
- RFC file `docs/rfcs/rfc-0690-*.md` — read-only reference, not modified during implementation

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` in `sites-check-postbuild.ts` — new step added after `surface.media-leakage.validate`
- `SITES_BUILD_POST_PIPELINE` in `build-post.ts` — no direct change (inherits the new step via the spread of `SITES_CHECK_POSTBUILD_PIPELINE`)
- `diagnostic.shape.lint` — must pass after registering `HEADING-UNIQ-01` in the rules registry
- `check.fixture.lint` — must pass with the new test file covering both pass and fail cases

## 3. Step sequence

### Step 1. Register HEADING-UNIQ-01 diagnostic rule

**Goal:** Add the `HEADING-UNIQ-01` rule id to the diagnostic rule registry so `diagnostic.shape.lint` (DSL-02) does not fail when the new handler emits it.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts`
- Add a new entry in `CONTENT_SURFACE_RULES`:
  ```ts
  "HEADING-UNIQ-01": rule(
    "HEADING-UNIQ-01",
    "Duplicate section heading text on the same surface page",
    "surface.heading-uniqueness.validate",
  ),
  ```
- Add a `<CHANGE_SUMMARY>` item: `RFC-0690: register HEADING-UNIQ-01 for surface.heading-uniqueness.validate.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- `grep -r "HEADING-UNIQ-01" packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` — entry exists

**Completion criterion:** `HEADING-UNIQ-01` is registered in `CONTENT_SURFACE_RULES` and `build:check` passes.

**Human review:** no

---

### Step 2. Implement the command handler

**Goal:** Create `surface-heading-uniqueness.ts` with `runSurfaceHeadingUniquenessValidate` that scans dist HTML for surface routes and reports duplicate section headings.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts`
- Add `MODULE_CONTRACT` header (purpose, non-goals) and `CHANGE_SUMMARY` per conventions
- Import `parse5` (already a dependency in `package.json`), `diagnosticsResult` and `passResult` from `result-helpers.ts`, `ARTIFACT_FILE` and route helpers from `surface/shared.ts`
- Implement the handler following the pattern from `surface-media-leakage-validate.ts`:
  1. Resolve app context (`context.site?.name` or `input.flags.site`)
  2. Load surface artifact from `join(app.directory, ARTIFACT_FILE)` — no-op pass if missing
  3. For each `VirtualRouteEntry` in the artifact, resolve the corresponding `dist/client/*.html` path
  4. Parse each HTML file with `parse5.parse()` in a try/catch per file
  5. Walk the AST: for each `<section>` element, find the first `<h2>` or `<h3>` child element and extract its text content
  6. Normalize heading text: trim, lowercase, collapse whitespace
  7. Group by normalized heading text per page; emit `HEADING-UNIQ-01` diagnostic for each heading appearing more than once
  8. Return `diagnosticsResult("surface.heading-uniqueness.validate", diagnostics)` on fail, `passResult` on pass
- Export a pure helper `extractSectionHeadings(html: string): Map<string, number>` for unit testing
- No-op pass when `dist/client/` does not exist (following `dist-html-structure.ts` pattern)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- `diagnostic.shape.lint` will pass because `HEADING-UNIQ-01` is registered (Step 1)

**Completion criterion:** Handler compiles, uses `diagnosticsResult` with registered `HEADING-UNIQ-01` ruleId, follows the `surface-media-leakage-validate.ts` pattern for surface route identification, uses `parse5` for HTML parsing.

**Human review:** no

---

### Step 3. Register command in command table and pipeline

**Goal:** Wire the new command into the command table and the postbuild pipeline.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`
- Add import: `import { runSurfaceHeadingUniquenessValidate } from "../surface-heading-uniqueness.ts";`
- Add a new `CheckCommandEntry` after the `surface.media-leakage.validate` entry:
  ```ts
  {
    name: "surface.heading-uniqueness.validate",
    description:
      "RFC-0690: scan rendered surface page HTML for duplicate section heading text (first <h2>/<h3> child of each <section>). Fails on duplicates to catch bake function label reuse before the Axiom gate.",
    scope: "app",
    flags: {
      app: {
        kind: "string",
        description: "App name to use when no app context is active.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/surface.generated.yaml"],
    cacheable: true,
    execute: runSurfaceHeadingUniquenessValidate,
  },
  ```
- Open `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts`
- Add `{ command: "surface.heading-uniqueness.validate" }` after the `surface.media-leakage.validate` entry (last line before the closing `]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- `pnpm exec site-kernel run command.manifest.generate` — manifest regenerates with the new command
- `pnpm exec site-kernel run docs.commands.generate` — COMMANDS.md regenerates

**Completion criterion:** Command is registered in `BUILD_ARTIFACT_COMMANDS_PART2`, pipeline step is added to `SITES_CHECK_POSTBUILD_PIPELINE`, manifest and COMMANDS.md are regenerated.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create unit tests with pass and fail fixtures covering the heading uniqueness check logic.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/surface-heading-uniqueness.test.ts`
- Test the pure helper `extractSectionHeadings`:
  - **Pass case**: HTML with unique section headings → empty violations
  - **Fail case**: HTML with duplicate `<h2>` text in two `<section>` elements → `HEADING-UNIQ-01` diagnostic
  - **Edge case**: `<section>` without any `<h2>`/`<h3>` → skipped, no diagnostic
  - **Edge case**: `<section>` with `<h3>` but no `<h2>` → uses `<h3>` text
  - **Edge case**: whitespace normalization (heading with extra spaces matches trimmed version)
  - **Edge case**: empty HTML string → no violations
- Test the full handler `runSurfaceHeadingUniquenessValidate`:
  - **No surface artifact**: returns pass result (no-op)
  - **No dist/client directory**: returns pass result (no-op)
  - **App not specified**: returns fail result with HTML-STRUCT-02-style error
- Use `vitest` with `describe`/`it`/`expect` following existing test patterns in the package

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass
- `check.fixture.lint` — the new test file covers both pass and fail fixtures for the command

**Completion criterion:** Test file exists, covers pass + fail + edge cases, `pnpm test` passes, `check.fixture.lint` is satisfied.

**Human review:** no

---

### Step 5. Update AGENTS.md

**Goal:** Add the new module to the package-level AGENTS.md module table.

**Agent actions:**

- Open `packages/os/site-kernel-checks/AGENTS.md`
- Add a new row to the module table (after the `surface-media-leakage-validate.ts` entry):
  ```
  | `src/surface-heading-uniqueness.ts` | RFC-0690 `runSurfaceHeadingUniquenessValidate` — scans rendered surface page HTML for duplicate section heading text (first `<h2>`/`<h3>` child of each `<section>`). Uses parse5 for HTML parsing and surface artifact for route identification. Diagnostics: HEADING-UNIQ-01 |
  ```

**Validation:**

- `git diff packages/os/site-kernel-checks/AGENTS.md` — shows the new row added

**Completion criterion:** AGENTS.md module table includes the new entry.

**Human review:** no

---

### Step 6. Validation suite

**Goal:** Run the full validation suite to verify the implementation is correct and ready for stamping.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0690 --json` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` — must pass
- Run `pnpm exec site-kernel run diagnostic.shape.lint` (or the packages-check pipeline that includes it) — must pass (DSL-02 satisfied for `HEADING-UNIQ-01`)
- Run `pnpm exec site-kernel run command.manifest.generate` and `pnpm exec site-kernel run docs.commands.generate` — regenerate to ensure manifest is current
- Verify `rfc.validate` RFC-CMD-02 passes: the command is listed in `commands.added` in the RFC frontmatter and the live command is registered in the manifest

**Validation:**

- All commands above return exit code 0

**Completion criterion:** `rfc.validate`, `build:check`, `test`, and `diagnostic.shape.lint` all pass. Command manifest is regenerated.

**Human review:** no

---

### Step 7. Final Step — Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` is updated (Step 5)
- Verify `docs/COMMANDS.md` is regenerated (Step 3)
- Verify `docs/command-manifest.generated.yaml` is regenerated (Step 3)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0690 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0690` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0690`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run command.manifest.generate` (regenerate, then verify no diff)
- `pnpm exec site-kernel run docs.commands.generate` (regenerate, then verify no diff)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0690.generated.json` — verification evidence (RFC-0330), if acceptance probes are declared
- Commit messages referencing `RFC-0690` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| False positives from intentionally repeated headings | Step 2: only checks first `<h2>`/`<h3>` child of `<section>` on surface pages (identified by surface artifact); Step 4: edge case tests for sections without headings |
| Performance (~150 HTML files with parse5) | Step 2: parse5 is already a dependency; ~2-3 seconds estimated; Step 4: no performance test needed at this scale |
| parse5 parse errors on malformed HTML | Step 2: try/catch per file following `strip-html-generated-marker.ts` pattern; `dist.html-structure.validate` runs earlier and catches structural issues |
| Multilingual pages with duplicate headings in one language | Step 2: all language variants checked; Step 4: test with multilingual fixture |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with any DNA invariant, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0690 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `parse5` AST walking approach proves unreliable for nested `<section>` elements, consider using `@warpgogol/share` HTML utilities or a different parsing strategy — but do not switch to regex-based extraction without justifying the trade-off in a follow-up RFC.
