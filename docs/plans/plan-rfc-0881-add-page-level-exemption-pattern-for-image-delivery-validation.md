---
rfcId: RFC-0881
planId: PLAN-RFC-0881-01
status: draft
owner: architecture
createdAt: 2026-08-19
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0881

## 1. Objectives

- [ ] Objective 1 — Add unit tests for `isPageSkipped` covering match, no-match, invalid glob, missing `pagePattern` — maps to acceptance criterion "Unit tests cover: pagePattern match → exempt, pagePattern no match → not exempt, invalid glob → not exempt (no crash), missing pagePattern → not exempt"
- [ ] Objective 2 — Add unit test verifying `pagePattern` override exempts a page from `IMG-DELIVERY-04` page-level check — maps to acceptance criterion "IMG-DELIVERY-04 check calls isPageSkipped alongside the existing 404.html exemption"
- [ ] Objective 3 — Add unit test verifying `pagePattern` does NOT affect per-image rules (`IMG-DELIVERY-01`, `IMG-DELIVERY-02`) — maps to acceptance criterion "pagePattern only affects page-level rules (IMG-DELIVERY-04), not per-image rules"
- [ ] Objective 4 — Add unit test verifying non-string `pagePattern` is silently ignored (treated as `undefined`) — maps to acceptance criterion "loadDeliveryConfig parses pagePattern from YAML and silently ignores non-string values"
- [ ] Objective 5 — Update `packages/werkstatt-site/AGENTS.md` to document `pagePattern` field — maps to implementation notes "Agents MUST update packages/werkstatt-site/AGENTS.md"
- [ ] Objective 6 — Verify `ConfigOverride` interface includes `pagePattern?: string` and `rfc.validate` passes — maps to acceptance criteria 1 and 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/image-delivery.ts` — already contains `isPageSkipped`, `pagePattern` parsing, and integration into `IMG-DELIVERY-04` check. No code changes needed (ad-hoc implementation from m000077 is the formalized contract).
- `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` — add new test cases for `pagePattern` behavior.

### 2.2 Configuration and data

- `{workpiece}/src/image-delivery.config.yaml` — operator config; no changes to the schema itself, just documenting the optional `pagePattern` field.

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — update `image.delivery.validate` command description to document `pagePattern` field.
- RFC file (`docs/rfcs/rfc-0881-*.md`) — read-only reference; mark acceptance criteria `[x]` during final step.

### 2.4 Validation and pipelines

- `image.delivery.validate` already runs in `SITES_CHECK_POSTBUILD_PIPELINE` — no pipeline changes.
- `rfc.validate --id RFC-0881` — must pass after acceptance criteria are checked off.

## 3. Step sequence

### Step 1. Add unit tests for `pagePattern` behavior

**Goal:** Add test coverage proving `pagePattern` works correctly for page-level exemption and does not affect per-image rules.

**Agent actions:**

- Add test: `pagePattern` match → page exempt from `IMG-DELIVERY-04` page-level check (configure override with `pagePattern: "**/nachweise/**"`, write HTML to `nachweise/test/index.html` with images but no `fetchpriority="high"`, verify no `IMG-DELIVERY-04` page-level finding)
- Add test: `pagePattern` no match → page NOT exempt (configure override with `pagePattern: "**/nachweise/**"`, write HTML to `index.html`, verify `IMG-DELIVERY-04` page-level finding IS emitted)
- Add test: invalid glob in `pagePattern` → `isPageSkipped` returns `false`, no crash (configure override with `pagePattern: "["`, verify no crash and page-level finding IS emitted)
- Add test: missing `pagePattern` → override does not exempt pages (configure override with `srcPattern` and `rules` but no `pagePattern`, verify page-level finding IS emitted)
- Add test: `pagePattern` does NOT exempt per-image rules (configure override with `pagePattern: "**/nachweise/**"` and `rules: [IMG-DELIVERY-01]`, write HTML to `nachweise/test/index.html` with `<img>` lacking srcset, verify `IMG-DELIVERY-01` finding IS still emitted)
- Add test: non-string `pagePattern` silently ignored (configure override with `pagePattern: 123` as YAML number, verify override loads but page-level finding IS emitted)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose image-delivery`

**Completion criterion:** All 6 new test cases pass; existing tests still pass.

**Human review:** no

---

### Step 2. Update `packages/werkstatt-site/AGENTS.md`

**Goal:** Document the `pagePattern` field in the `image.delivery.validate` command description.

**Agent actions:**

- Find the `image.delivery.validate` entry in `packages/werkstatt-site/AGENTS.md` (in the "Check commands" section).
- Add documentation for `pagePattern` field: "Supports optional `pagePattern` field in overrides for page-level rule exemptions (currently `IMG-DELIVERY-04` only). Uses picomatch glob syntax matched against dist file paths. When `pagePattern` is present and matches a page path, the listed rules are skipped for that page. Per-image rules (`IMG-DELIVERY-01`, `IMG-DELIVERY-02`) are unaffected by `pagePattern`."

**Validation:**

- `grep pagePattern packages/werkstatt-site/AGENTS.md` returns at least 1 match.

**Completion criterion:** `pagePattern` is documented in the `image.delivery.validate` command description in `packages/werkstatt-site/AGENTS.md`.

**Human review:** no

---

### Step 3. Verify acceptance criteria and run validation

**Goal:** Confirm all acceptance criteria are met and run the full validation suite.

**Agent actions:**

- Verify `ConfigOverride` interface in `image-delivery.ts` includes `pagePattern?: string` (already present from m000077).
- Verify `loadDeliveryConfig` silently ignores non-string `pagePattern` values (already present — `typeof override.pagePattern === "string" ? override.pagePattern : undefined`).
- Verify `isPageSkipped` uses `picomatch` (already present).
- Verify `IMG-DELIVERY-04` check calls `isPageSkipped` alongside `404.html` exemption (already present — `const pageExempt = basename === "404.html" || isPageSkipped(config, file, "IMG-DELIVERY-04")`).
- Verify `pagePattern` only affects page-level rules (covered by Step 1 test).
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0881` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests must pass.

**Validation:**

- `rfc.validate` passes with 0 violations.
- `build:check` passes.
- All tests pass.

**Completion criterion:** All 7 acceptance criteria verified against code; validation suite green.

**Human review:** no

---

### Step 4. Commit changes

**Goal:** Commit test additions and AGENTS.md update via `ecosystem.commit`.

**Agent actions:**

- Stage `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` and `packages/werkstatt-site/AGENTS.md`.
- Run `pnpm exec werkstatt run ecosystem.commit` with message: `feat: RFC-0881 add pagePattern tests and AGENTS.md documentation`
- Record the commit SHA for the stamp step.

**Validation:**

- `git log -1 --oneline` shows the commit.
- `git status` is clean.

**Completion criterion:** Changes committed; SHA recorded.

**Human review:** no

---

### Step 5. Mark acceptance criteria and stamp implemented

**Goal:** Check off all acceptance criteria in the RFC file and stamp as implemented.

**Agent actions:**

- Edit `docs/rfcs/rfc-0881-*.md`: mark all 7 acceptance criteria as `[x]`.
- Run `pnpm exec werkstatt run rfc.implement.stamp --id=RFC-0881 --implementation-commit=<SHA from Step 4>`.
- The stamp command validates: status is `accepted`, all criteria are `[x]`, clean tree, commit reachability.

**Validation:**

- `rfc.validate --id RFC-0881` passes.
- `git log -1 --oneline` shows the stamp commit.

**Completion criterion:** RFC-0881 status is `implemented`; `implementedAt` and `closedAt` set by the stamp command.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0881`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0881` in the subject line (RFC-0265 commit hygiene)
- No `rfc.verification.emit` needed — RFC-0881 has no acceptance probes in frontmatter

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Over-exemption via broad `pagePattern` | Step 1 tests verify `pagePattern` only affects listed rules; mandatory `reason` field provides audit trail |
| Glob pattern errors silently fail | Step 1 test for invalid glob verifies no crash and no false exemption |
| Performance (per-page `isPageSkipped` call) | No mitigation needed — <10 overrides typical, picomatch caches compilation |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-72 (validator config location diagnostics), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0881 --reason "..." --invariant "DNA-72"` instead of working around it.
- If `pagePattern` needs to apply to per-image rules in the future, create a new superseding RFC — do not extend `pagePattern` scope without one.
