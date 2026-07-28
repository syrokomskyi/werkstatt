---
rfcId: RFC-0515
planId: PLAN-RFC-0515-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-codegen"
  services: []
  docs:
    - packages/os/site-kernel-codegen/AGENTS.md
---

# Implementation Plan: RFC-0515

## 1. Objectives

- [ ] O1 — Make `runGenerateOverlayPages` locale-aware: use `manifest.app` as brand for non-DE locales — maps to acceptance criterion "runGenerateOverlayPages uses manifest.app as the brand for non-DE locales"
- [ ] O2 — Add generator unit test asserting non-DE output does not contain the German tagline — maps to acceptance criterion "Generator unit test asserts non-DE output does not contain the German tagline"
- [ ] O3 — Regenerate warpgogol-com cosmic pages and verify UK output no longer contains the German tagline — maps to acceptance criteria "UK cosmic passport page does not contain the German tagline" and "UK cosmic star-map page does not contain the German tagline"
- [ ] O4 — Verify DE cosmic pages remain unchanged — maps to acceptance criterion "DE cosmic pages remain unchanged (tagline-derived brand retained)"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-codegen/src/app-boilerplate.ts` — modify `runGenerateOverlayPages` to move brand resolution inside the per-locale loop
- `packages/os/site-kernel-codegen/src/tests/cosmic-pages-i18n.test.ts` — new generator test file
- `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` — extract `buildOverlayFiles` pure helper (if needed for testability)

### 2.2 Configuration and data

- `missions/warpgogol-com-m000010/workpiece/src/content/pages/uk/cosmic/passport.md` — regenerated (not hand-edited)
- `missions/warpgogol-com-m000010/workpiece/src/content/pages/uk/cosmic/star-map.md` — regenerated (not hand-edited)
- `missions/warpgogol-com-m000010/workpiece/src/content/pages/de/cosmic/passport.md` — unchanged after regeneration
- `missions/warpgogol-com-m000010/workpiece/src/content/pages/de/cosmic/star-map.md` — unchanged after regeneration

### 2.3 Documentation and specs

- `packages/os/site-kernel-codegen/AGENTS.md` — no changes needed (existing `runGenerateOverlayPages` entry covers the generator; no new command added)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-codegen test` — generator unit test
- `pnpm exec site-kernel run overlay.pages.generate --site warpgogol-com` — regeneration
- `pnpm exec site-kernel run rfc.validate` — RFC validation

## 3. Step sequence

### Step 1. Extract `buildOverlayFiles` pure helper

**Goal:** Extract the file-generation logic from `runGenerateOverlayPages` into a pure function that can be tested without filesystem I/O.

**Agent actions:**

- In `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts`, add a `buildOverlayFiles` function that takes a manifest object and returns an array of `{ absolutePath: string, content: string }` entries — the same structure `runGenerateOverlayPages` currently builds inline.
- The helper must contain the locale-aware brand resolution logic: `brandHeadFromTagline(tagline) ?? manifest.app` for default locale, `manifest.app` for non-default locales.
- Refactor `runGenerateOverlayPages` to call `buildOverlayFiles` and then write the returned files via `runGeneratedFileSet`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — TypeScript compiles

**Completion criterion:** `buildOverlayFiles` is a pure function in `app-boilerplate-helpers.ts` that returns file entries without touching the filesystem; `runGenerateOverlayPages` delegates to it.

**Human review:** no

---

### Step 2. Make brand resolution locale-aware

**Goal:** Ensure `buildOverlayFiles` uses `manifest.app` as the brand for non-default-locale cosmic pages.

**Agent actions:**

- In `buildOverlayFiles` (extracted in Step 1), move brand resolution inside the per-locale loop:
  ```ts
  const defaultLang = getDefaultLanguage(manifest);
  for (const lang of langs) {
    const isDefaultLang = lang === defaultLang;
    const brand = isDefaultLang
      ? (brandHeadFromTagline(manifest.identity?.tagline) ?? manifest.app)
      : manifest.app;
    // … compute title/description per locale
  }
  ```
- Remove the locale-agnostic brand computation that currently runs before the loop.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — TypeScript compiles

**Completion criterion:** `buildOverlayFiles` produces different `title`/`description` for default vs non-default locales; non-default locales use `manifest.app` as brand.

**Human review:** no

---

### Step 3. Add generator unit test

**Goal:** Assert that non-DE cosmic page output does not contain the German tagline, and DE pages retain the tagline-derived brand.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/tests/cosmic-pages-i18n.test.ts`
- Add test: "non-DE cosmic pages do not contain the German tagline" — construct a manifest with the warpgogol-com tagline, call `buildOverlayFiles`, assert UK passport and star-map content does not contain the tagline string
- Add test: "DE cosmic pages retain the tagline-derived brand" — assert DE passport content contains the tagline string
- Add Compass `MODULE_CONTRACT` scaffolding to the test file (per `packages/AGENTS.md` Compass compliance rules)

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen test` — both tests pass

**Completion criterion:** Both tests pass; test file has Compass scaffolding.

**Human review:** no

---

### Step 4. Regenerate warpgogol-com cosmic pages

**Goal:** Regenerate the cosmic page files in the mission workpiece to verify the generator fix produces correct output.

**Agent actions:**

- Run `pnpm exec site-kernel run overlay.pages.generate --site warpgogol-com` in the mission workpiece
- Verify UK cosmic passport `title` is `"Cosmic Passport · warpgogol-com"` (not the German tagline)
- Verify UK cosmic star-map `title` is `"Cosmic Star Map · warpgogol-com"` (not the German tagline)
- Verify DE cosmic pages remain unchanged (tagline-derived brand retained)
- Commit regenerated files via `mission.git.commit`

**Validation:**

- `git diff` on UK cosmic pages shows tagline removed from title/description
- `git diff` on DE cosmic pages shows no changes

**Completion criterion:** UK cosmic pages use `warpgogol-com` as brand; DE cosmic pages unchanged.

**Human review:** no

---

### Step 5. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Verify all acceptance criteria in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Run `pnpm exec site-kernel run rfc.validate` — must pass
- Run `pnpm --filter @gogol/site-kernel-codegen test` — all tests pass
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0515 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate` — no violations
- All acceptance criteria checked off

**Completion criterion:** All acceptance criteria verified; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate` — RFC validation
- `pnpm --filter @gogol/site-kernel-codegen run build:check` — TypeScript compiles
- `pnpm --filter @gogol/site-kernel-codegen test` — generator unit tests pass
- `pnpm exec site-kernel run overlay.pages.generate --site warpgogol-com` — regeneration succeeds

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0515` in the subject line (RFC-0265 commit hygiene)
- Test file `packages/os/site-kernel-codegen/src/tests/cosmic-pages-i18n.test.ts` as regression evidence

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Low impact — cosmetic issue | Step 4 verifies the fix produces correct output |
| DE page title length — clamped to 70 chars | Step 4 verifies DE pages remain unchanged |
| `brandHeadFromTagline` edge case — no em-dash | Step 2 bypasses `brandHeadFromTagline` for non-DE locales entirely |
| Generator test false positives | Step 3 uses exact-match on full tagline string, not individual words |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-23, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0515 --reason "..." --invariant "DNA-23"` instead of working around it.
