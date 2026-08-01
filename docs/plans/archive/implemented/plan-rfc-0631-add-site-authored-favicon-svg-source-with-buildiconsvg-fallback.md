---
rfcId: RFC-0631
planId: PLAN-RFC-0631-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - site-kernel-checks
  services: []
  docs:
    - docs/authoring/site-composition.md
---

# Implementation Plan: RFC-0631

## 1. Objectives

- [ ] Objective 1 — `resolveIconSvg` reads `src/content/favicon.svg` when present, falls back to `buildIconSvg` (maps to acceptance criterion 1)
- [ ] Objective 2 — `resolveIconSvg` reads `src/content/favicon-maskable.svg` for maskable variant, falls back to regular source (maps to acceptance criterion 2)
- [ ] Objective 3 — `public.icons.validate` reports ICON-SRC-01/02/03 diagnostics for source SVG issues (maps to acceptance criteria 3–5)
- [ ] Objective 4 — Generator falls back to `buildIconSvg` when `sharp` throws during conversion of a valid-XML source SVG (maps to acceptance criterion 6)
- [ ] Objective 5 — Sites without `src/content/favicon.svg` are unaffected (maps to acceptance criterion 7)
- [ ] Objective 6 — `rfc.validate` passes and documentation is updated (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/public-surface/icons.ts` — add `resolveIconSvg` and `validateSourceSvg` helpers; modify `runPublicIconsGenerate` to use `resolveIconSvg`; modify `runPublicIconsValidate` to validate source SVGs
- `packages/os/site-kernel-checks/src/command-tables/31-public-surface.ts` — update `reads` for `public.icons.generate` and `public.icons.validate` to include `src/content/favicon.svg` and `src/content/favicon-maskable.svg`

### 2.2 Configuration and data

- No configuration changes. The source-override is file-presence-based — no flags, no manifest fields.

### 2.3 Documentation and specs

- `docs/authoring/site-composition.md` — add mention of `src/content/favicon.svg` and `src/content/favicon-maskable.svg` as site-authored content files

### 2.4 Validation and pipelines

- `public.icons.validate` already runs in `build.check` — the new ICON-SRC-* diagnostics will surface there for sites with source SVGs
- No new pipeline placement needed

## 3. Step sequence

### Step 1. Add `resolveIconSvg` helper

**Goal:** Create the helper that reads `src/content/favicon.svg` (and maskable variant) when present, falling back to `buildIconSvg`.

**Agent actions:**

- Add `resolveIconSvg(app, context, maskable)` to `packages/os/site-kernel-checks/src/public-surface/icons.ts`
- For `maskable=false`: check `join(app.contentDirectory, "favicon.svg")` via `readTextIfExists`; if present return content, else return `buildIconSvg(app, false)`
- For `maskable=true`: check `join(app.contentDirectory, "favicon-maskable.svg")` first; if present return content; else check `join(app.contentDirectory, "favicon.svg")`; if present return that; else return `buildIconSvg(app, true)`
- Export `resolveIconSvg` for testability

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes with the new helper

**Completion criterion:** `resolveIconSvg` is exported and returns site-authored SVG when present, `buildIconSvg` output otherwise

**Human review:** no

---

### Step 2. Modify `runPublicIconsGenerate` to use `resolveIconSvg` with sharp fallback

**Goal:** Replace direct `buildIconSvg` calls in the generator with `resolveIconSvg`, and wrap sharp conversion in try/catch with `buildIconSvg` fallback.

**Agent actions:**

- Replace `const svg = buildIconSvg(app)` with `const svg = await resolveIconSvg(app, context, false)`
- Replace `const maskableSvg = buildIconSvg(app, true)` with `const maskableSvg = await resolveIconSvg(app, context, true)`
- Wrap the `writes` array construction (which calls `icoFromSvg` and `pngFromSvg`) in try/catch
- In the catch block, fall back to `buildIconSvg` for both `svg` and `maskableSvg`, then rebuild the writes array
- This ensures that if sharp throws on a structurally invalid SVG (valid XML but not valid SVG document), the generator still produces valid icons

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- Manual verification: generator with no source SVG produces identical output to pre-RFC behavior

**Completion criterion:** Generator uses `resolveIconSvg` and has try/catch fallback for sharp conversion failures

**Human review:** no

---

### Step 3. Add `validateSourceSvg` helper and ICON-SRC diagnostics to `runPublicIconsValidate`

**Goal:** Extend the validator to check source SVGs for correct viewBox and valid XML.

**Agent actions:**

- Add `validateSourceSvg(svgContent, filePath)` to `icons.ts` — parses XML, checks for `viewBox="0 0 512 512"` attribute on root `<svg>` element
- In `runPublicIconsValidate`, after existing artifact checks, read `src/content/favicon.svg` if present and run `validateSourceSvg` — report `ICON-SRC-01` (wrong viewBox) and `ICON-SRC-02` (invalid XML) with `ruleId` field set to the diagnostic code
- Read `src/content/favicon-maskable.svg` if present and run `validateSourceSvg` — report `ICON-SRC-03` (maskable wrong viewBox) and `ICON-SRC-02` (invalid XML)
- Use the existing `diagnostics()` helper from `shared.ts`, but with explicit `ruleId` per message instead of the command name

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `pnpm exec site-kernel run public.icons.validate --site <test-site>` passes for sites without source SVG (no new diagnostics)

**Completion criterion:** Validator reports ICON-SRC-01/02/03 when source SVGs have issues; no false positives for sites without source SVGs

**Human review:** no

---

### Step 4. Update command table `reads` metadata

**Goal:** Update the command table entries to reflect the new `reads` paths.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/31-public-surface.ts`, update `public.icons.generate` `reads` to add `"<app>/src/content/favicon.svg"` and `"<app>/src/content/favicon-maskable.svg"`
- Update `public.icons.validate` `reads` to add the same two paths

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** Command table entries list the new source SVG paths in `reads`

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Add unit tests covering all acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/icons-source-svg.test.ts`
- Test 1: `resolveIconSvg` returns site-authored SVG when `src/content/favicon.svg` exists
- Test 2: `resolveIconSvg` falls back to `buildIconSvg` when no source SVG exists
- Test 3: `resolveIconSvg` returns maskable SVG when `src/content/favicon-maskable.svg` exists
- Test 4: `resolveIconSvg` falls back to regular source SVG for maskable when no maskable-specific SVG exists
- Test 5: `validateSourceSvg` reports ICON-SRC-01 for wrong viewBox
- Test 6: `validateSourceSvg` reports ICON-SRC-02 for invalid XML
- Test 7: `validateSourceSvg` reports ICON-SRC-03 for maskable wrong viewBox
- Test 8: Generator falls back to `buildIconSvg` when sharp throws on valid-XML-but-invalid-SVG content
- Use the `unknown` data cast pattern for diagnostic extraction helpers (per memory)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run vitest -- --run src/tests/icons-source-svg.test.ts` passes

**Completion criterion:** All 8 tests pass

**Human review:** no

---

### Step 6. Update `docs/authoring/site-composition.md`

**Goal:** Document the favicon source override mechanism for agent discoverability.

**Agent actions:**

- Add a brief note in `docs/authoring/site-composition.md` mentioning `src/content/favicon.svg` and `src/content/favicon-maskable.svg` as site-authored content files that override the default `buildIconSvg` favicon

**Validation:**

- File updated with the new content

**Completion criterion:** `docs/authoring/site-composition.md` mentions the favicon source override

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0631` — must pass
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: commit the implementation code first, then run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0631 --implementation-commit <sha> --dry-run` to verify, then without `--dry-run` to stamp. Commit the stamped RFC separately.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0631` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`; implementation commit and stamp commit are separate.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0631`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run vitest -- --run src/tests/icons-source-svg.test.ts`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0631` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent confusion: editing `public/favicon.svg` directly | Step 6 documents `src/content/favicon.svg` as the source in `docs/authoring/site-composition.md` |
| Invalid SVG breaking generation: sharp fails on malformed SVG | Step 2 wraps sharp conversion in try/catch with `buildIconSvg` fallback |
| ViewBox mismatch: source SVG with non-512 viewBox renders incorrectly | Step 3 adds ICON-SRC-01 validation diagnostic |
| False positive rate | Step 5 test 5 verifies no false positives for sites without source SVGs |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0631 --reason "..." --invariant "DNA-N"` instead of working around it.
