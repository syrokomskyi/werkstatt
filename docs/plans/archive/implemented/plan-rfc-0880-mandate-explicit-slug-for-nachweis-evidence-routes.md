---
rfcId: RFC-0880
planId: PLAN-RFC-0880-01
status: draft
owner: architecture
createdAt: 2026-08-19
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
    - packages/werkstatt-site
  services: []
  docs:
    - docs/rfcs/rfc-0880-mandate-explicit-slug-for-nachweis-evidence-routes.md
---

# Implementation Plan: RFC-0880

## 1. Objectives

- [ ] O1 — `nachweis.validate` emits `NACHWEIS-SLUG-01` for published evidence records missing or having an empty `slug` (acceptance criterion 1)
- [ ] O2 — `nachweis-routes.ts` uses only `data.slug`, no fallback to file path derivation (acceptance criterion 2)
- [ ] O3 — `nachweis-list-component.astro` uses `data.slug` without fallback (acceptance criterion 6)
- [ ] O4 — Unit tests cover slug present → correct route, slug absent → NACHWEIS-SLUG-01, route format, synthetic page ID resolution (acceptance criterion 7)
- [ ] O5 — `rfc.validate` passes on RFC-0880 (acceptance criterion 8)
- [ ] O6 — Formalize already-implemented behavior: route format (no slashes), resolvePageRoute synthetic ID mapping (acceptance criteria 3, 4, 5 — already satisfied, verified by tests)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/nachweis/nachweis-validate.ts` — add `NACHWEIS-SLUG-01` check in the evidence-source loop
- `packages/werkstatt/src/nachweis/nachweis-io.ts` — no changes needed (`NachweisViolation` type already supports `rule`, `message`, `recordId`)
- `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` — remove fallback `?? stripEntryLanguage(toDataEntryId(entry.id))`, throw if `slug` is absent
- `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` — remove fallback `?? stripEntryLanguage(toDataEntryId(entry.id))` in `loadPublishedNachweisRecords`

### 2.2 Configuration and data

No configuration or data files need changes. The `slug` field already exists as `optional` in `evidenceSourceSchema` (`packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts:146`). The RFC enforces mandatory slug via validation, not via schema change — the schema remains optional for non-Nachweis evidence kinds.

**Key field distinction:** The PBP schema uses `status` (draft, published, suspended) while Nachweis raw frontmatter uses `recordStatus` (published, withdrawn). The validator reads raw frontmatter via `parseMarkdownFrontmatter`, so it sees `recordStatus`. The route generator uses Astro's `getCollection` which parses through the Zod schema, so it sees `status`. The NACHWEIS-SLUG-01 check does NOT filter by status (per operator decision) — it checks all Nachweis-kind records.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0880-mandate-explicit-slug-for-nachweis-evidence-routes.md` — mark acceptance criteria `[x]` after verification
- No `AGENTS.md` updates needed — no new commands, no new rules, no new package boundaries
- No `docs/*.xml` Compass sync needed — no repository-wide semantic changes
- No `docs/architecture-dna.md` updates needed — no new DNA invariant

### 2.4 Validation and pipelines

- `nachweis.validate` already runs in `SITES_BUILD_CHECK_PIPELINE` (`build-check.ts:28`) — no pipeline wiring change needed
- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck for validator changes
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck for route generator + component changes
- `pnpm --filter @warpgogol/werkstatt run test` — run nachweis test suite

## 3. Step sequence

### Step 1. Add NACHWEIS-SLUG-01 validator check

**Goal:** `nachweis.validate` emits a violation with rule `NACHWEIS-SLUG-01` for published evidence records with Nachweis kinds that lack a non-empty `slug` field.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-validate.ts`, inside the existing evidence-source loop (line ~158), after the `NACHWEIS_EVIDENCE_KINDS` filter and before the sha256 check, add a slug presence check:
  - Read `slug` from `es.data.slug`
  - If `slug` is `undefined`, `null`, empty string, or whitespace-only (`typeof slug !== "string" || slug.trim() === ""`), push a `NachweisViolation` with `rule: "NACHWEIS-SLUG-01"`, `message: "EvidenceSource '<id>' has kind '<kind>' but no frontmatter slug. Add a slug field to the frontmatter."`, `recordId: es.id`
  - Check ALL Nachweis-kind records (no status filter) — consistent with the existing sha256 check. The operator confirmed this broader scope catches draft records early before they fail at publication.
- Update the `CHANGE_SUMMARY` block comment with `RFC-0880: add NACHWEIS-SLUG-01 check for mandatory slug in published evidence records.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Existing nachweis tests still pass (`pnpm --filter @warpgogol/werkstatt run test`)

**Completion criterion:** `nachweis.validate` emits `NACHWEIS-SLUG-01` violation when a published evidence record with a Nachweis kind has no `slug` or an empty `slug`.

**Human review:** no

---

### Step 2. Remove file-path fallback in nachweis-routes.ts

**Goal:** `nachweis-routes.ts` uses only `data.slug` — no fallback to `stripEntryLanguage(toDataEntryId(entry.id))`.

**Agent actions:**

- In `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts`, line 113:
  - Replace `const slug = data.slug ?? stripEntryLanguage(toDataEntryId(entry.id));` with:
    ```ts
    const slug = data.slug;
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      throw new Error(
        `[nachweis-routes] Evidence record ${entry.id} is missing required frontmatter "slug". ` +
        `Run nachweis.validate to identify affected files.`
      );
    }
    ```
  - Remove the now-unused imports `stripEntryLanguage` and `toDataEntryId` from the import statement (line 27-30) if no other code in the file uses them. Check: `getEntryLanguage` is still used on line 100 — keep it. `stripEntryLanguage` and `toDataEntryId` are only used on line 113 — remove them.
- Update the `CHANGE_SUMMARY` block comment with `RFC-0880: remove file-path fallback, require explicit slug.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- No unused import warnings from eslint

**Completion criterion:** `nachweis-routes.ts` has no `stripEntryLanguage` or `toDataEntryId` usage. The route generator throws if `slug` is absent.

**Human review:** no

---

### Step 3. Remove file-path fallback in nachweis-list-component.astro

**Goal:** `nachweis-list-component.astro` uses `data.slug` without fallback.

**Agent actions:**

- In `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro`, line 182:
  - Replace `const slug = data.slug ?? stripEntryLanguage(toDataEntryId(entry.id));` with:
    ```ts
    const slug = data.slug;
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      // Skip records without slug — nachweis.validate will report NACHWEIS-SLUG-01
      continue;
    }
    ```
  - The list component skips records without slug rather than throwing — it is a UI component, not a route generator. The validator catches the issue.
  - Remove unused imports `stripEntryLanguage` and `toDataEntryId` from the import statement (line 31-34) if no other code in the file uses them. Check: `getEntryLanguage` is still used — keep it. `stripEntryLanguage` and `toDataEntryId` are only used on line 182 — remove them.
- Update the `CHANGE_SUMMARY` block comment with `RFC-0880: remove file-path fallback, require explicit slug.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** `nachweis-list-component.astro` has no `stripEntryLanguage` or `toDataEntryId` usage. Records without `slug` are skipped.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Unit tests cover all acceptance criteria related to slug presence/absence and route format.

**Agent actions:**

- In `packages/werkstatt/src/tests-handoff/`, create `rfc-0880-nachweis-slug.test.ts`:
  - **Test 1: NACHWEIS-SLUG-01 emitted when slug absent** — create a published evidence-source record with a Nachweis kind but no `slug` field → run `runNachweisValidate` → expect violation with `rule: "NACHWEIS-SLUG-01"`
  - **Test 2: NACHWEIS-SLUG-01 emitted when slug is empty string** — same but `slug: ""` → expect violation
  - **Test 3: NACHWEIS-SLUG-01 emitted when slug is whitespace** — `slug: "   "` → expect violation
  - **Test 4: No violation when slug present** — published record with `slug: "cloudflare-cf-ar-01"` → no `NACHWEIS-SLUG-01` violation
  - **Test 5: Violation for draft records without slug** — `recordStatus: "draft"`, no `slug` → `NACHWEIS-SLUG-01` violation (all Nachweis-kind records are checked, not just published)
  - **Test 6: No violation for non-Nachweis kinds without slug** — `kind: "external-web-sources"`, no `slug` → no `NACHWEIS-SLUG-01` violation
- Follow the existing test pattern in `nachweis-rfc-0872.test.ts` for fixture setup (mkdtemp, write evidence-source markdown, run validate, check violations)
- Use `describe("RFC-0880: NACHWEIS-SLUG-01", ...)` block
- Follow the test fixture pattern from `nachweis-rfc-0872.test.ts`: use `recordStatus` (not `status`) in frontmatter, include `schema: "pbp/evidence-source@1"`, `type: "evidence-source"`, `kind`, `name`, `authority: { kind: "platform" }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --reporter=verbose rfc-0880` passes all 6 tests

**Completion criterion:** 6 tests pass, covering slug absent, empty, whitespace, present, draft (violation), and non-Nachweis kind.

**Human review:** no

---

### Step 5. Commit platform changes

**Goal:** Commit all code changes in `packages/werkstatt` and `packages/werkstatt-site` via `ecosystem.commit`.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.commit --message "feat: RFC-0880 mandate explicit slug for Nachweis evidence routes

Add NACHWEIS-SLUG-01 validator check, remove file-path fallback in nachweis-routes.ts and nachweis-list-component.astro."`

- This auto-bumps the platform version and runs post-commit checks

**Validation:**

- `git log -n 1` shows the commit
- `git status` shows clean tree

**Completion criterion:** All code changes committed via `ecosystem.commit`.

**Human review:** no

---

### Step 6. Verify acceptance criteria and stamp implemented

**Goal:** All acceptance criteria are verified and the RFC is stamped as implemented.

**Agent actions:**

- Mark acceptance criteria `[x]` in the RFC file for all verified criteria
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0880` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run test` — must pass (including new tests)
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Get the implementation commit SHA: `git log --grep="RFC-0880" -n 1 --format="%H"`
- Run `pnpm exec werkstatt run rfc.implement.stamp --id=RFC-0880 --implementation-commit=<SHA>`
- Run `pnpm exec werkstatt run command.manifest.generate` if command surface changed (no new commands, but `nachweis.validate` changed — regenerate to update description if needed)

**Validation:**

- `rfc.validate` passes
- `build:check` passes for both packages
- `test` passes for `@warpgogol/werkstatt`
- RFC status is `implemented` after stamping

**Completion criterion:** RFC-0880 status is `implemented`, all acceptance criteria checked off.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, verify all documentation is in sync.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Verify no `AGENTS.md` files need updates (no new commands, no new rules)
- Verify no `docs/*.xml` Compass files need updates (no repository-wide semantic changes)
- Commit any review fixes via `ecosystem.commit`

**Validation:**

- `git status` — no uncommitted changes from the current session
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** Code review passed (findings fixed if any); all documentation artifacts verified; RFC is stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0880`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0880` in the subject line (RFC-0265 commit hygiene)
- Test file `packages/werkstatt/src/tests-handoff/rfc-0880-nachweis-slug.test.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive rate — check only applies to published Nachweis records | Step 1: filter by `status === "published"` and `NACHWEIS_EVIDENCE_KINDS` — non-Nachweis content unaffected |
| Agent confusion — agents creating new evidence records must know to include `slug` | Step 1: `NACHWEIS-SLUG-01` message includes fix hint: "Add a slug field to the frontmatter." |
| Route generator throw if validator bypassed | Step 2: defensive throw with descriptive message pointing to `nachweis.validate` |

## 6. Escalation triggers

- If implementation reveals that making `slug` mandatory breaks existing published records that were previously valid, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0880 --reason "slug mandatory check breaks existing records" --invariant "DNA-17"` instead of working around it.
