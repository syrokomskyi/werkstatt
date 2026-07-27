---
rfcId: RFC-0495
planId: PLAN-RFC-0495-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/requirements.xml
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0495

## 1. Objectives

- [ ] O1 — Update blueprint slug templates for depth-4 and depth-5 (maps to AC: "website-local.yaml slug templates for depth-4 and depth-5 no longer include {country} or {region}")
- [ ] O2 — Update C-contract url-schema.yaml with depth-5 route pattern (maps to AC: "url-schema.yaml contains depth-4 and depth-5 route patterns")
- [ ] O3 — Reverse redirect direction in buildRetiredSurfaceRedirectBlock (maps to AC: "buildRetiredSurfaceRedirectBlock emits reversed redirect entries")
- [ ] O4 — Extend surface.validate to detect old URL patterns (maps to AC: "No internal links use old URL patterns" and "Sitemap contains only new canonical URLs")
- [ ] O5 — Register no-op migrator rfc-0495 (maps to AC: "Migrator rfc-0495 registered" and "migrator.registry.validate passes")
- [ ] O6 — Update Compass docs and AGENTS.md (maps to AC: documentation sync)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/blueprints/website-local.yaml` — update depth-4 and depth-5 slug templates
- `packages/ontology/src/external-surfaces/url-schema.yaml` — add depth-5 route pattern
- `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` — reverse `buildRetiredSurfaceRedirectBlock` redirect direction (lines 126-174)
- `packages/os/site-kernel-checks/src/surface/validate.ts` — add check for old URL patterns in sitemap and internal links
- `packages/os/site-kernel-handoff/src/migrators/rfc-0495.ts` — new file: no-op migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register `rfc-0495` migrator
- Commands changed: `surface.generate`, `surface.validate`, `public.infrastructure.generate`, `redirect.map.validate`

### 2.2 Configuration and data

- `packages/ontology/blueprints/website-local.yaml` — blueprint slug templates (depth-4, depth-5)
- `packages/ontology/src/external-surfaces/url-schema.yaml` — C-contract route patterns

### 2.3 Documentation and specs

- `docs/requirements.xml` — update req-22/req-24 if URL structure rules are documented
- `docs/verification-plan.xml` — add redirect.map.validate check for old URL patterns
- `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` — update CHANGE_SUMMARY Compass block
- `packages/os/site-kernel-checks/src/surface/validate.ts` — update CHANGE_SUMMARY Compass block
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — update CHANGE_SUMMARY Compass block

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/ontology build:check` — blueprint YAML validation
- `pnpm --filter @gogol/site-kernel-codegen build:check` — codegen validation
- `pnpm --filter @gogol/site-kernel-codegen test` — redirect generation tests
- `pnpm --filter @gogol/site-kernel-checks build:check` — checks validation
- `pnpm --filter @gogol/site-kernel-checks test` — surface.validate tests
- `pnpm --filter @gogol/site-kernel-handoff build:check` — handoff validation
- `pnpm --filter @gogol/site-kernel-handoff test` — migrator tests
- `pnpm exec site-kernel run migrator.registry.validate` — migrator registry validation
- `pnpm exec site-kernel run rfc.validate RFC-0495` — RFC validation

## 3. Step sequence

### Step 1. Update blueprint slug templates

**Goal:** Change depth-4 and depth-5 slug templates in website-local.yaml to remove {country}/{region} segments.

**Agent actions:**

- Edit `packages/ontology/blueprints/website-local.yaml` lines 170-195:
  - depth-4 slug: `website/{industry}/{country}/{region}/{city}` → `website/{industry}/{city}` (DE), `sait/{industry}/{country}/{region}/{city}` → `sait/{industry}/{city}` (UK)
  - depth-5 slug: `website/{industry}/{country}/{region}/{city}/{demand}` → `website/{industry}/{city}/{demand}` (DE), `sait/{industry}/{country}/{region}/{city}/{demand}` → `sait/{industry}/{city}/{demand}` (UK)

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** depth-4 and depth-5 slug templates in website-local.yaml do not contain `{country}` or `{region}`.

**Human review:** no

---

### Step 2. Update C-contract url-schema.yaml

**Goal:** Add depth-5 route pattern and align the C-contract with the new slug templates.

**Agent actions:**

- Edit `packages/ontology/src/external-surfaces/url-schema.yaml`:
  - Keep existing `/:locale?/:slug` pattern (generated: false)
  - Keep existing `/:locale?/:industry/:city` pattern (generated: true) — already matches new depth-4
  - Add new pattern `/:locale?/:industry/:city/:demand` (generated: true) for depth-5

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** url-schema.yaml contains depth-4 (`/:locale?/:industry/:city`) and depth-5 (`/:locale?/:industry/:city/:demand`) route patterns.

**Human review:** no

---

### Step 3. Reverse redirect direction in buildRetiredSurfaceRedirectBlock

**Goal:** Update the redirect generation function to emit redirects from old URLs (with country/region) to new URLs (without).

**Agent actions:**

- Edit `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` function `buildRetiredSurfaceRedirectBlock` (lines 126-174):
  - Currently: matches `/website/{trade}/deu/bw/{city}/` routes and creates redirects from short to long
  - Change: match new routes `/website/{trade}/{city}/` and construct old URLs by inserting `deu/bw` segments, then emit redirects old → new (301)
  - For depth-5: match `/website/{trade}/{city}/{demand}/` and construct old `/website/{trade}/deu/bw/{city}/{demand}/`
  - Read the surface.generated.json entries to get country/region axis values for constructing old URLs (current dataset: country=deu, region=bw)
  - Remove the existing short→long redirect logic (lines 149-158)
  - Add old→new redirect logic
- Update CHANGE_SUMMARY Compass block with `RFC-0495` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen build:check`
- `pnpm --filter @gogol/site-kernel-codegen test`

**Completion criterion:** `buildRetiredSurfaceRedirectBlock` emits redirect entries from old URLs (with `{country}/{region}`) to new URLs (without) with 301 status. Existing tests pass (update test fixtures if needed).

**Human review:** no

---

### Step 4. Extend surface.validate to detect old URL patterns

**Goal:** Add a validation check that fails when old URL patterns (containing `/{country}/{region}/` segments) are found in the surface artifact or sitemap.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/surface/validate.ts`:
  - Add a check that scans surface artifact entries for routes matching the old pattern (containing country/region segments like `/deu/bw/`)
  - Report violation `SURF-OLD-URL: old URL pattern detected in surface artifact` for any entry with a route containing country/region segments
  - The check should only apply to depth-4 and depth-5 entries (depth-2 and depth-3 legitimately contain country/region)
- Update CHANGE_SUMMARY Compass block with `RFC-0495` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-checks test`

**Completion criterion:** `surface.validate` reports violations when old URL patterns (with country/region segments) are found in depth-4 or depth-5 surface entries. Existing tests pass.

**Human review:** no

---

### Step 5. Register no-op migrator rfc-0495

**Goal:** Create the no-op migrator and register it in the migrator registry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0495.ts`:
  - Export `rfc0495Migrator: Migrator` with id `"rfc-0495"`, fromVersion `"4.8.0"`, toVersion `"4.9.0"`
  - `transform: async (data) => data` — no-op, returns data unchanged
  - Description: "No-op migrator — URL slugs are derived from blueprint + geo, not authored data. Advances migratorCursor."
  - Include MODULE_CONTRACT and CHANGE_SUMMARY Compass blocks
- Edit `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Import `rfc0495Migrator` from `./rfc-0495.ts`
  - Add `rfc0495Migrator` to `migratorRegistry` array
  - Update CHANGE_SUMMARY with `RFC-0495` entry
- Create test file `packages/os/site-kernel-handoff/src/tests/migrators-rfc-0495.test.ts`:
  - Test idempotency: `f(f(x)) === f(x)` — applying migrator twice produces same result
  - Test no-op: migrator returns data unchanged

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** Migrator `rfc-0495` registered in registry.ts. `migrator.registry.validate` passes. Idempotency test passes.

**Human review:** no

---

### Step 6. Update Compass documentation

**Goal:** Synchronize docs/*.xml Compass files and AGENTS.md with the URL structure change.

**Agent actions:**

- Check `docs/requirements.xml` for URL structure rules referencing old slug templates — update if found
- Check `docs/verification-plan.xml` for redirect validation rules — add `redirect.map.validate` check for old URL patterns if not present
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff docs/requirements.xml docs/verification-plan.xml` — either updated or documented as not-applicable

**Completion criterion:** All docs in scope are either updated or documented as not-applicable.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why
- Run `pnpm exec site-kernel run rfc.validate RFC-0495`
- Check off acceptance criteria:
  - [ ] `website-local.yaml` slug templates for depth-4 and depth-5 no longer include `{country}` or `{region}` — verify via Step 1
  - [ ] `url-schema.yaml` contains depth-4 and depth-5 route patterns — verify via Step 2
  - [ ] `buildRetiredSurfaceRedirectBlock` emits reversed redirect entries — verify via Step 3
  - [ ] `redirect.map.validate` confirms `_redirects` file — existing command, verify after `public.infrastructure.generate`
  - [ ] Sitemap contains only new canonical URLs — verify via `surface.validate` (Step 4)
  - [ ] No internal links use old URL patterns — verify via `surface.validate` (Step 4)
  - [ ] `surface.generate` and `surface.validate` pass — run both commands
  - [ ] `surface.contract.validate` passes — **BLOCKED**: command not yet implemented (RFC-0480 accepted, not implemented). Document as blocked.
  - [ ] Migrator `rfc-0495` registered — verify via Step 5
  - [ ] `migrator.registry.validate` passes — verify via Step 5
  - [ ] `rfc.validate` passes on this file — verify
- **DO NOT stamp RFC or plan status as `implemented`** — request the human operator to run `rfc.implement.stamp --id RFC-0495 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0495`
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all verifiable acceptance criteria are checked off; agent has requested the human operator to perform the `accepted → implemented` transition.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator verifies remaining runtime acceptance criteria and runs `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0495`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-codegen build:check`
- `pnpm --filter @gogol/site-kernel-codegen test`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0495.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0495` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| SEO disruption during URL change | Step 3 emits 301 redirects for all old URLs before new URLs go live |
| Redirect chain (old → intermediate → new) | Step 3 emits direct old → new redirects, no intermediate hops |
| City slug collision when dataset expands beyond Germany | NonGoal documented in RFC; current dataset is Germany-only |
| `buildRetiredSurfaceRedirectBlock` logic error | Step 3 updates existing tested function; Step 4 validates no old patterns remain |
| Agent misinterpretation: editing _redirects directly | Implementation notes in RFC prohibit direct _redirects edits |
| Migrator false positive on non-Germany data | Step 5 migrator is no-op — returns data unchanged regardless of content |
| `url-schema.yaml` drift from blueprint | Step 2 updates C-contract in same change as blueprint (Step 1) |
| `surface.contract.validate` not yet implemented | Final Step documents this as blocked by RFC-0480 (accepted, not implemented) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16 or DNA-39, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0495 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `buildRetiredSurfaceRedirectBlock` cannot construct old URLs from new routes (e.g., surface.generated.json doesn't include country/region axis data), escalate — the function may need to read the full surface artifact entries instead of just route strings.
- If `surface.contract.validate` is needed but RFC-0480 is not yet implemented, document the blocked acceptance criterion and proceed without it — the C-contract update (Step 2) is still valid as a declarative contract.
