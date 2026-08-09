---
rfcId: RFC-0766
planId: PLAN-RFC-0766-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ui"
  services: []
  docs:
    - packages/ui/AGENTS.md
---

# Implementation Plan: RFC-0766

## 1. Objectives

- [ ] O1 — `renderPriceDisplayHtml` function added to `price-marker.ts` — maps to acceptance criterion "renderPriceDisplayHtml function added"
- [ ] O2 — `resolvePriceMarkersInHtml` + `hasPriceMarkers` added to `prose-pipeline.ts` — maps to acceptance criterion "resolvePriceMarkersInHtml function added"
- [ ] O3 — Prose files with `{price:...}` markers render as currency-aware price displays — maps to acceptance criterion "Prose files with markers render"
- [ ] O4 — Prose files without markers render unchanged — maps to acceptance criterion "no regression"
- [ ] O5 — Markers inside `<code>` and `<pre>` blocks are not replaced — maps to acceptance criterion "code/pre skipping"
- [ ] O6 — Client-side currency switching toggles prices in prose content — maps to acceptance criterion "currency switching"
- [ ] O7 — `tsc --noEmit` and `vitest run` pass — maps to acceptance criteria "tsc" and "vitest"
- [ ] O8 — `packages/ui/AGENTS.md` updated to document prose marker support — maps to RFC file system responsibilities

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ui/src/utils/price-marker.ts` — add `renderPriceDisplayHtml` exported function
- `packages/ui/src/sections/markdown/prose-pipeline.ts` — add `hasPriceMarkers`, `resolvePriceMarkersInHtml`, integrate into all HTML-returning paths (inline body, animateNumbers, reference substitution, image-bearing)

### 2.2 Configuration and data

None. No new commands, no manifest changes, no ontology catalog changes.

### 2.3 Documentation and specs

- `packages/ui/AGENTS.md` — update "Dynamic pricing in UI components" section to document prose marker support

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/ui run build:check` (tsc --noEmit)
- `pnpm --filter @warpgogol/ui run test` (vitest run)

## 3. Step sequence

### Step 1. Add `renderPriceDisplayHtml` to `price-marker.ts`

**Goal:** Create the HTML generation function that produces `<span>`-based price display HTML matching `CurrencyAwarePriceDisplay` CSS classes and data attributes.

**Agent actions:**

- Add `renderPriceDisplayHtml(offeringId, chargeRef, lang, derivedPrices): string` to `packages/ui/src/utils/price-marker.ts`
- Reuse existing `buildPriceVariants` and `loadDerivedPrices` from `../sections/price-card/price-variants.ts`
- Use the same `offeringUriPrefix` and `priceMarkerRe` pattern as `parsePriceMarkers`
- Generate `<span>` elements (not `<div>`) with classes: `currency-aware-price-display`, `currency-aware-price-display__variant`, `currency-aware-price-display__amount`, `currency-aware-price-display__note`
- Include `data-currency-price-display` and `data-currency` attributes, `aria-live="polite"`, `hidden` on non-first variants, `aria-label` on variants
- Return empty string when `buildPriceVariants` returns `null`
- HTML-escape variant values (`formatted`, `note`) to prevent injection

**Validation:**

- `pnpm --filter @warpgogol/ui run build:check` passes

**Completion criterion:** `renderPriceDisplayHtml` is exported from `price-marker.ts`, produces valid HTML with `<span>` elements matching `CurrencyAwarePriceDisplay` classes, returns empty string for null variants.

**Human review:** no

---

### Step 2. Add `hasPriceMarkers` and `resolvePriceMarkersInHtml` to `prose-pipeline.ts`

**Goal:** Create the detection function and HTML post-processing function in the prose pipeline.

**Agent actions:**

- Add `hasPriceMarkers(text: string): boolean` using `PRICE_MARKER_RE` (without `g` flag for `.test()`)
- Add `resolvePriceMarkersInHtml(html, lang, derivedPrices): string`:
  - Split HTML by `<code>...</code>` and `<pre>...</pre>` segments using a regex that captures delimiters
  - Apply `renderPriceDisplayHtml` replacement only to non-code segments
  - Reassemble with code segments unchanged
- Import `loadDerivedPrices` from `../price-card/price-variants.ts` and `renderPriceDisplayHtml` from `../../utils/price-marker.ts`
- Call `loadDerivedPrices()` once at the top of `renderProse` when `hasPriceMarkers` is true (avoid loading on every prose entry)

**Validation:**

- `pnpm --filter @warpgogol/ui run build:check` passes

**Completion criterion:** Both functions exist in `prose-pipeline.ts`, `resolvePriceMarkersInHtml` skips `<code>` and `<pre>` blocks, uses `renderPriceDisplayHtml` for replacement.

**Human review:** no

---

### Step 3. Integrate price marker resolution into all HTML-returning paths in `renderProse`

**Goal:** Wire `hasPriceMarkers` and `resolvePriceMarkersInHtml` into all four HTML-returning paths in the pipeline.

**Agent actions:**

- **Inline body path** (lines 110-127): after `resolveProseImages`, if `hasPriceMarkers(resolvedBody)`, apply `resolvePriceMarkersInHtml` to the HTML before returning
- **`animateNumbers` path** (lines 153-177): after `wrapInlineNumbers` and `resolveProseImages`, if `hasPriceMarkers` on the source body, apply `resolvePriceMarkersInHtml` to the HTML before returning
- **Reference substitution path** (lines 180-188): after `resolveProseImages`, if `hasPriceMarkers(proseBody)`, apply `resolvePriceMarkersInHtml`
- **Image-bearing path** (lines 191-199): after `resolveProseImages`, if `hasPriceMarkers(sourceBody)`, apply `resolvePriceMarkersInHtml`
- Add `hasPriceMarkers` check to force micromark path: after reference resolution, if `hasPriceMarkers(proseBody)` is true, take the micromark HTML path (like `hasReferences` does) instead of falling through to Astro `render()`
- Load `derivedPrices` once at the top of `renderProse` when any marker check is true

**Validation:**

- `pnpm --filter @warpgogol/ui run build:check` passes

**Completion criterion:** All four HTML-returning paths in `renderProse` apply `resolvePriceMarkersInHtml` when markers are detected. The Astro `render()` path is never reached when markers are present.

**Human review:** no

---

### Step 4. Add unit tests

**Goal:** Test `renderPriceDisplayHtml` and `resolvePriceMarkersInHtml` in isolation.

**Agent actions:**

- Create `packages/ui/src/utils/price-marker.test.ts` (or extend if exists):
  - Test `renderPriceDisplayHtml` with known derived prices → produces correct `<span>` HTML with `data-currency` attributes
  - Test `renderPriceDisplayHtml` with null variants (single-currency) → returns empty string
  - Test `renderPriceDisplayHtml` with missing derived prices → returns empty string
  - Test `renderPriceDisplayHtml` HTML-escapes formatted values
- Create or extend a test for `resolvePriceMarkersInHtml`:
  - Test marker in plain text → replaced with HTML
  - Test marker inside `<code>` → not replaced
  - Test marker inside `<pre>` → not replaced
  - Test multiple markers in one HTML string → all replaced
  - Test no markers → HTML unchanged

**Validation:**

- `pnpm --filter @warpgogol/ui run test` passes

**Completion criterion:** All new tests pass, covering the acceptance criteria for marker replacement, code/pre skipping, and null variant handling.

**Human review:** no

---

### Step 5. Update `packages/ui/AGENTS.md`

**Goal:** Document prose marker support in the "Dynamic pricing in UI components" section.

**Agent actions:**

- Add a bullet point to the "Dynamic pricing in UI components" section (lines 382-389) documenting that prose content rendered through `prose-pipeline.ts` now supports `{price:...}` markers
- Note that the pipeline uses `renderPriceDisplayHtml` (not the `CurrencyAwarePriceDisplay` Astro component) because prose is rendered as HTML strings via micromark
- Note that `<span>` elements are used instead of `<div>` for valid HTML inside `<p>` elements

**Validation:**

- Visual review of the AGENTS.md section

**Completion criterion:** `packages/ui/AGENTS.md` documents prose price marker support.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/ui/AGENTS.md` is updated (Step 5).
- No Compass XML sync needed (RFC confirms no `docs/*.xml` changes required).
- No `docs/architecture-dna.md` changes (no new DNA invariant).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed — not applicable (no new commands).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0766 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0766`
- `pnpm --filter @warpgogol/ui run build:check`
- `pnpm --filter @warpgogol/ui run test`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0766`
- `pnpm --filter @warpgogol/ui run build:check`
- `pnpm --filter @warpgogol/ui run test`

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC frontmatter — `rfc.verification.emit` will skip evidence file creation (expected behavior).
- Commit messages referencing `RFC-0766` in the subject line.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Code block false positives | Step 2: `resolvePriceMarkersInHtml` splits HTML on `<code>`/`<pre>` segments |
| Performance | Step 2: `hasPriceMarkers` is a fast pre-check; full scan only runs when markers detected |
| HTML structure drift | Step 1: `renderPriceDisplayHtml` uses same CSS classes as `CurrencyAwarePriceDisplay` |
| Footnotes loss for marker-bearing prose | Accepted — documented in RFC Risks section, no plan step needed |
| `<div>` vs `<span>` difference | Step 1: uses `<span>` for valid HTML inside `<p>` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0766 --reason "..." --invariant "DNA-4"` instead of working around it.
