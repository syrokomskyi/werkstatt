---
rfcId: RFC-0603
planId: PLAN-RFC-0603-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0603

## 1. Objectives

- [ ] O1 — `sharp` PNG encoding is deterministic (disable `adaptiveFiltering`, remove redundant `resize`, set `palette: false`) — maps to acceptance criterion "adaptiveFiltering is set to false"
- [ ] O2 — `writeFileIfChanged` supports binary `Buffer` content and replaces raw `writeFile` in `preview-images.ts` — maps to "writeFile replaced with writeFileIfChanged"
- [ ] O3 — `public/preview/{lang}/{slug}.png` entries added to `GENERATOR_OWNERSHIP_MAP` — maps to "public/preview entries added to GENERATOR_OWNERSHIP_MAP"
- [ ] O4 — Running `preview.images.generate` twice produces byte-identical PNGs with zero git diff — maps to "byte-identical PNG files" and "git diff shows zero changes"
- [ ] O5 — Unit test in `src/tests/preview-determinism.test.ts` verifies byte-level determinism — maps to "Unit test verifies byte-level determinism"
- [ ] O6 — `--force-normalize` flag still works with deterministic output — maps to "--force-normalize flag still works"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/utils/fs-idempotent.ts` — extend `writeFileIfChanged` to accept `Buffer | Uint8Array` (currently `string` only). The underlying `writeFileAtomic` already accepts `Uint8Array` (`fs-atomic.ts:53`).
- `packages/os/site-kernel-checks/src/preview-templates.ts` — fix `sharp` options: disable `adaptiveFiltering`, remove redundant `.resize()` call, set `palette: false`.
- `packages/os/site-kernel-checks/src/preview-images.ts` — replace all `writeFile` calls (lines 270, 309, 383, 440) with `writeFileIfChanged` from `@warpgogol/site-kernel`. Import `writeFileIfChanged` at top, remove `writeFile` from `node:fs/promises` import.
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — add `public/preview/{lang}/{slug}.png` entry to `GENERATOR_OWNERSHIP_MAP` (currently only `public/og-image.png` is registered at line 376-382).

### 2.2 Configuration and data

- No YAML/JSON config changes. The `sharp` options are hardcoded in `preview-templates.ts`.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — update `preview-templates.ts` module description to note deterministic rendering (RFC-0603).
- RFC file (`docs/rfcs/rfc-0603-*.md`) — read-only reference; no edits during implementation except acceptance criteria check-off and `rfc.implement.stamp`.

### 2.4 Validation and pipelines

- `build.prepare` pipeline (`build-prepare.ts:89`) — no change, `preview.images.generate` stays in `build.prepare`.
- No new commands added to `build.check`.
- Unit test under `src/tests/` (vitest config requires this path).

## 3. Step sequence

### Step 1. Extend `writeFileIfChanged` to support binary content

**Goal:** Make `writeFileIfChanged` accept `Buffer | Uint8Array` in addition to `string`, enabling idempotent writes of binary PNG files.

**Agent actions:**

- Read `packages/forge/src/utils/fs-idempotent.ts` — currently `writeFileIfChanged(filePath: string, content: string)`.
- Change the `content` parameter type to `string | Uint8Array`.
- Update the comparison logic: when `content` is a `string`, read the existing file as UTF-8 and compare strings; when `content` is a `Uint8Array`, read the existing file as a Buffer and compare bytes.
- The underlying `writeFileAtomic` already accepts `string | Uint8Array` (`fs-atomic.ts:53`), so no change needed there.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.
- Existing `writeFileIfChanged` callers (string-based) continue to work unchanged.

**Completion criterion:** `writeFileIfChanged` accepts `Buffer` and skips the write when the existing file is byte-identical.

**Human review:** no

---

### Step 2. Fix `sharp` PNG encoding options in `preview-templates.ts`

**Goal:** Disable non-deterministic `sharp` options and remove the redundant `resize` call.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/preview-templates.ts:131-139`, change `generateBrandCardPng`:
  - Remove `.resize(OG_WIDTH, OG_HEIGHT, { fit: "fill" })` (line 136) — the SVG is already at 1200×630 native viewBox.
  - Change `.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })` to `.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })`.
- Keep `density: 144` — it affects SVG rasterization density, not PNG encoding determinism.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes.
- `generateBrandCardPng` returns a `Buffer` without error.

**Completion criterion:** `adaptiveFiltering` is `false`, `palette` is `false`, `.resize()` call is removed.

**Human review:** no

---

### Step 3. Replace `writeFile` with `writeFileIfChanged` in `preview-images.ts`

**Goal:** Use idempotent file writes so byte-identical PNGs skip disk writes.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/preview-images.ts`:
  - Add `import { writeFileIfChanged } from "@warpgogol/site-kernel";` (line 16, alongside existing kernel import).
  - Remove `writeFile` from the `node:fs/promises` import on line 17 (keep `access`, `mkdir`, `readFile`).
  - Replace all 4 `writeFile` calls with `writeFileIfChanged`:
    - Line 270: `await writeFileIfChanged(ultimateFallbackFullPath, png);`
    - Line 309: `await writeFileIfChanged(ultimateFallbackFullPath, png);`
    - Line 383: `await writeFileIfChanged(pagePreviewFullPath, png);`
    - Line 440: `await writeFileIfChanged(pagePreviewFullPath, png);`
  - `writeFileIfChanged` now accepts `Buffer` (after Step 1), so the `png` Buffer works directly.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes.
- `preview.images.generate` skips disk writes when PNG content is unchanged.

**Completion criterion:** Zero `writeFile` calls remain in `preview-images.ts`; all writes use `writeFileIfChanged`.

**Human review:** no

---

### Step 4. Add `public/preview/{lang}/{slug}.png` to `GENERATOR_OWNERSHIP_MAP`

**Goal:** Register per-page preview images in the generator ownership map so RFC-0601 drift validation can check them.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generator-ownership.ts`, after the existing `public/og-image.png` entry (line 376-382), add a glob-style entry for per-page previews:
  ```ts
  // RFC-0603: per-page OG preview images.
  {
    path: "public/preview/{lang}/{slug}.png",
    command: "preview.images.generate",
    markerPolicy: "registry-only",
    module: "packages/os/site-kernel-checks/src/preview-images.ts",
  },
  ```
- Verify the ownership map validator accepts glob-style path patterns with `{lang}` and `{slug}` placeholders (check existing patterns for the convention — e.g., `systems/{system}/public/.well-known/bordbuch.json` at line 386 uses `{system}`).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes.
- `generated.files.validate` recognizes `public/preview/{lang}/{slug}.png` as owned by `preview.images.generate`.

**Completion criterion:** `GENERATOR_OWNERSHIP_MAP` includes the per-page preview entry; no ownership lint violations.

**Human review:** no

---

### Step 5. Write determinism unit test

**Goal:** Verify byte-level determinism by rendering the same input twice and comparing buffers.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/preview-determinism.test.ts`.
- Test 1 — **Byte-identical render**: call `generateBrandCardPng` twice with the same input, assert `buf1.equals(buf2)`.
- Test 2 — **`writeFileIfChanged` skips unchanged**: write a PNG to a temp file, then call `writeFileIfChanged` with the same content, assert return value is `"unchanged"`.
- Test 3 — **`writeFileIfChanged` writes changed**: write a PNG, then call `writeFileIfChanged` with different content, assert return value is `"written"`.
- Test 4 — **`--force-normalize` produces deterministic output**: call `generateBrandCardPng` with normalize config, then call again with same config, assert byte-identical output.
- Use a minimal `PreviewTemplateInput` fixture: `{ pageTitle: "Test", siteName: "Test Site", lang: "de" }`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run preview-determinism` passes.
- All 4 test cases pass.

**Completion criterion:** Test file exists at `src/tests/preview-determinism.test.ts`; all 4 tests pass; `Buffer.equals()` assertion confirms byte-identical output.

**Human review:** no

---

### Step 6. Run determinism verification on warpgogol-com

**Goal:** Verify end-to-end determinism by running `preview.images.generate` twice on a real site and checking zero git diff.

**Agent actions:**

- Run `pnpm exec werkstatt run preview.images.generate --site warpgogol-com` (first run).
- Capture `git diff --stat` output.
- Run `pnpm exec werkstatt run preview.images.generate --site warpgogol-com` (second run).
- Capture `git diff --stat` output again.
- Verify the second run produces zero changes to `public/preview/` and `public/og-image.png`.
- If the second run still shows changes, investigate which files differ and identify the remaining non-determinism source. If `sharp` options are insufficient, proceed to Phase 2 (add `@resvg/resvg-js`).

**Validation:**

- `git diff --stat` after the second run shows zero changes to `public/preview/` and `public/og-image.png`.

**Completion criterion:** Two consecutive `preview.images.generate` runs produce zero git diff on preview images.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — add RFC-0603 note to `preview-templates.ts` module description noting deterministic rendering.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, so likely not needed).
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)`.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0603 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0603`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0603`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run preview-determinism`
- `pnpm exec werkstatt run preview.images.generate --site warpgogol-com` (twice, verify zero git diff)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0603.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0603` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Cross-platform output differences | Step 2 (sharp options fixed); Step 6 verifies on CI platform (Linux). Font bundling deferred |
| `sharp` still non-deterministic after Phase 1 | Step 6 includes Phase 2 fallback: add `@resvg/resvg-js` if `sharp` options are insufficient |
| `writeFileIfChanged` doesn't support Buffer | Step 1 extends it to accept `Uint8Array` before Step 3 uses it |
| `--force-normalize` breaks | Step 5 Test 4 verifies `--force-normalize` produces deterministic output |

## 6. Escalation triggers

- If `sharp` remains non-deterministic after disabling `adaptiveFiltering` and removing `resize`, add `@resvg/resvg-js` as Phase 2 fallback (per RFC Design §Phase 2). This is within RFC scope, not an escalation.
- If cross-platform font determinism becomes a requirement, create a follow-up RFC for Fontsource font bundling. This is out of scope for RFC-0603.
- If implementation reveals an invariant conflict with DNA-18, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0603 --reason "..." --invariant "DNA-18"` instead of working around it.
