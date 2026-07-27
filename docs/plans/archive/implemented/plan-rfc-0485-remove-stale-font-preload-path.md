---
rfcId: RFC-0485
planId: PLAN-RFC-0485-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ui"
  services: []
  docs: []
---

# Implementation Plan: RFC-0485

## 1. Objectives

- [ ] Remove the stale `<link rel="preload" href="/fonts/inter-400.woff2">` tag from `layout-component.astro` — maps to acceptance criterion 1
- [ ] Remove the accompanying RFC-0164 comment block above the preload link — maps to acceptance criterion 1
- [ ] Update the `CHANGE_SUMMARY` block in `layout-component.astro` with a new entry referencing RFC-0485 (DNA-42) — maps to acceptance criterion 1
- [ ] Verify `pnpm --filter @gogol/ui build:check` passes after the removal — maps to acceptance criterion 4
- [ ] Verify `rfc.validate` passes on RFC-0485 — maps to acceptance criterion 5

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ui/src/components/layout/layout-component.astro` — remove the `<link rel="preload">` tag (line 183) and its comment block (lines 179–182); add a `CHANGE_SUMMARY` entry.

### 2.2 Configuration and data

None. No biome, manifest, or configuration changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0485-remove-stale-font-preload-path.md` — read-only reference (accepted status).
- No AGENTS.md updates needed — the removal does not change any documented rule.
- No Compass XML sync needed — single-line removal in a shared component.

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/ui run build:check` — scoped TypeScript check for `@gogol/ui`.
- `pnpm exec site-kernel run rfc.validate RFC-0485 --json` — mechanical validation.

## 3. Step sequence

### Step 1. Remove the stale preload link and comment block

**Goal:** Eliminate the dead `<link rel="preload">` tag and its accompanying RFC-0164 comment from the shared layout head.

**Agent actions:**

- In `packages/ui/src/components/layout/layout-component.astro`, remove the comment block (lines 179–182):
  ```astro
  {
    /* RFC-0164: self-hosted fonts. @font-face is inlined via global.css → fonts.generated.css
      (no third-party origin, no GDPR exposure). Preload the body base weight for early paint. */
  }
  ```
- Remove the preload link (line 183):
  ```astro
  <link rel="preload" as="font" type="font/woff2" href="/fonts/inter-400.woff2" crossorigin />
  ```

**Validation:**

- Visually confirm the `<head>` section no longer contains any `preload` link for font assets.
- Confirm the `globalStylesheetUrl` preload (line 131) is untouched — it is a separate, valid preload for the CSS stylesheet.

**Completion criterion:** No `rel="preload"` with `as="font"` exists in `layout-component.astro`. No RFC-0164 comment about font preloading remains.

**Human review:** no

---

### Step 2. Update CHANGE_SUMMARY Compass scaffolding

**Goal:** Keep the Compass markup (DNA-42) in sync with the code change.

**Agent actions:**

- In the `CHANGE_SUMMARY` block of `layout-component.astro` (lines 12–19), add a new `<item>` entry:
  ```html
  <item>RFC-0485: remove stale font preload for /fonts/inter-400.woff2 (404 fix).</item>
  ```

**Validation:**

- `compass.validate` (if run as part of `build.check`) passes on the file.

**Completion criterion:** `CHANGE_SUMMARY` block contains the new RFC-0485 entry.

**Human review:** no

---

### Step 3. Run scoped build check

**Goal:** Verify the removal does not break TypeScript compilation or introduce type errors.

**Agent actions:**

- Run `pnpm --filter @gogol/ui run build:check` (which executes `tsc --noEmit`).

**Validation:**

- Command exits zero with no type errors.

**Completion criterion:** `build:check` passes for `@gogol/ui`.

**Human review:** no

---

### Step 4. Run RFC validation

**Goal:** Confirm the RFC file passes mechanical validation after the enhancement.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0485 --json`.

**Validation:**

- Command exits zero; status is `pass`.

**Completion criterion:** `rfc.validate` passes for RFC-0485.

**Human review:** no

---

### Step 5. Commit and stamp implemented

**Goal:** Commit the code change and transition the RFC to `implemented`.

**Agent actions:**

- Stage only `packages/ui/src/components/layout/layout-component.astro`.
- Commit with message: `feat(ui): remove stale font preload for /fonts/inter-400.woff2 (RFC-0485)`.
- Stamp the RFC as implemented per RFC-0224: set `status: implemented`, `implementedAt: 2026-07-22`, update `updatedAt`.
- Commit the RFC status transition.

**Validation:**

- `git log --oneline -2` shows both commits.

**Completion criterion:** Code change committed; RFC status is `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0485 --json` — mechanical validation
- `pnpm --filter @gogol/ui run build:check` — scoped TypeScript check

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0485` in the subject line (RFC-0265 commit hygiene)
- No verification probe needed — RFC-0485 has no `acceptance` probes declared (RFC-0330 applies only to probe-bearing RFCs)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Slight font paint delay without preload hint | Accepted — the RFC's Risks section documents that the delay is negligible for same-origin fonts with `font-display: swap`. No mitigation step needed. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0485 --reason "..." --invariant "DNA-N"` instead of working around it.
