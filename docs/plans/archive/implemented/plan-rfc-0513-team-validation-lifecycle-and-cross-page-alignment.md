---
rfcId: RFC-0513
planId: PLAN-RFC-0513-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - docs/ecosystem.generated.yaml
---

# Implementation Plan: RFC-0513

## 1. Objectives

- [ ] Objective 1 — `team.lifecycle.validate` enforces status transitions, CTA removal, and visibility rules — maps to acceptance criterion 1
- [ ] Objective 2 — `team.lifecycle.validate` warns on stale review dates — maps to acceptance criterion 2
- [ ] Objective 3 — `team.cross-page.validate` enforces hub ↔ profile, home ↔ profile, navigation ↔ hub consistency — maps to acceptance criterion 3
- [ ] Objective 4 — `team.cross-page.validate` enforces JSON ↔ HTML consistency — maps to acceptance criterion 4
- [ ] Objective 5 — `content.voice.lint` extended with profile-specific prohibited patterns — maps to acceptance criterion 5
- [ ] Objective 6 — Status badges render via hero `tagline` prop for non-active participants — maps to acceptance criterion 6
- [ ] Objective 7 — Both validators registered in correct pipelines and pass — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/team-lifecycle.ts` — new file: `runTeamLifecycleValidate`
- `packages/os/site-kernel-checks/src/team-cross-page.ts` — new file: `runTeamCrossPageValidate`
- `packages/os/site-kernel-checks/src/content-voice.ts` — extend `runContentVoiceLint` with profile-specific prohibited patterns
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — register `team.lifecycle.validate` and `team.cross-page.validate` command entries
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — register `team.lifecycle.validate` after `participant.ai-agent.validate` (line 174)
- `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` — register `team.cross-page.validate` after `participant.json.validate` (line 21)
- `packages/os/site-kernel-checks/src/module.ts` — import and wire new command executors
- `packages/share/src/astro/page-handler/resolve-route.ts` — add status badge to hero block `tagline` prop for non-active participants
- `packages/os/site-kernel-checks/src/tests/team-lifecycle.test.ts` — new test file
- `packages/os/site-kernel-checks/src/tests/team-cross-page.test.ts` — new test file

### 2.2 Configuration and data

- No new YAML/JSON config files.
- No ontology catalog changes.
- No blueprint changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add module table entries for `team-lifecycle.ts` and `team-cross-page.ts`
- `docs/ecosystem.generated.yaml` — regenerate via `ecosystem.manifest.generate` after command surface changes

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — `team.lifecycle.validate` joins after `participant.ai-agent.validate`
- `SITES_CHECK_POSTBUILD_PIPELINE` — `team.cross-page.validate` joins after `participant.json.validate`
- `rfc.validate` — must pass on RFC-0513
- `build:check` — must pass for `@gogol/site-kernel-checks` and `@gogol/share`

## 3. Step sequence

### Step 1. Create `team.lifecycle.validate` validator

**Goal:** Implement the lifecycle validation command that checks status transitions, CTA removal, visibility rules, and review cadence.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/team-lifecycle.ts` with `runTeamLifecycleValidate` function
- Implement status consistency checks: no CTA for former/retired, no public visibility for draft/suspended, status badge presence for non-active
- Implement review cadence warnings: consent >12 months, lastReviewedAt >12 months, AI-agent technical evaluation >6 months, nextReviewAt in past, nextEvaluationAt in past
- No-op pass (exit 0, no diagnostics) when site has no people records
- Read people collection frontmatter from `src/content/people/**/*.md`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Unit tests pass: `pnpm --filter @gogol/site-kernel-checks run test -- --grep team-lifecycle`

**Completion criterion:** `team-lifecycle.ts` exists, exports `runTeamLifecycleValidate`, passes typecheck and unit tests, no-op passes when no people records.

**Human review:** no

---

### Step 2. Create `team.cross-page.validate` validator

**Goal:** Implement the cross-page alignment validation command that checks hub ↔ profile, home ↔ profile, navigation ↔ hub, and JSON ↔ HTML consistency.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/team-cross-page.ts` with `runTeamCrossPageValidate` function
- Implement hub ↔ profile checks: every public active participant on hub, profile URL resolvable, publicName matches, role/purposeStatement matches
- Implement home page checks: people section shows only active public humans with consent, no suspended/draft/former
- Implement navigation checks: team entry exists, founder entry absent
- Implement JSON ↔ HTML checks: every participant in profiles.json has HTML page and vice versa, status and publicName match
- No-op pass when site has no people records or no team hub page
- Read from `dist/` artifacts (postbuild validator)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Unit tests pass: `pnpm --filter @gogol/site-kernel-checks run test -- --grep team-cross-page`

**Completion criterion:** `team-cross-page.ts` exists, exports `runTeamCrossPageValidate`, passes typecheck and unit tests, no-op passes when no people records.

**Human review:** no

---

### Step 3. Extend `content.voice.lint` with profile-specific patterns

**Goal:** Add profile-specific prohibited claim patterns to the existing voice lint validator.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/content-voice.ts` to add profile-specific prohibited patterns
- Add patterns: "garantierte Rankings", "automatische Konvertierung", "fehlerfrei" (AI-agent only), "100% genau", "autonom ohne menschliche Aufsicht" (AI-agent only)
- Scope the patterns to prose files matching the people collection slug pattern (`prose/{slug}-beruflich.md`, `prose/{slug}-nachweise.md`, etc.)
- Use the existing `matchesForbiddenPhrase` word-boundary helper for single-token patterns

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Existing voice lint tests still pass

**Completion criterion:** `content-voice.ts` includes profile-specific prohibited patterns, scoped to profile prose files, passes typecheck and existing tests.

**Human review:** no

---

### Step 4. Register commands in command table and pipelines

**Goal:** Wire both new validators into the command registry and pipeline constants.

**Agent actions:**

- Add `team.lifecycle.validate` and `team.cross-page.validate` entries to `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`
- Add `team.lifecycle.validate` to `SITES_CHECK_AUTHOR_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` after `participant.ai-agent.validate` (line 174)
- Add `team.cross-page.validate` to `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` after `participant.json.validate` (line 21)
- Import and wire executors in `packages/os/site-kernel-checks/src/module.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run sites-check.author --site warpgogol-com` passes (or no-ops if no people records)
- `pnpm exec werkstatt run sites-check.postbuild --site warpgogol-com` passes (or no-ops if no people records)

**Completion criterion:** Both commands registered, pipeline wiring complete, `build:check` passes, commands are discoverable via `site-kernel run --list`.

**Human review:** no

---

### Step 5. Add status badge rendering to hero block

**Goal:** Render a status badge via the hero `tagline` prop for non-active participants.

**Agent actions:**

- Edit `packages/share/src/astro/page-handler/resolve-route.ts` to add `statusBadge` function
- In the profile page hero block builder, set `tagline` to the status badge text when participant status is `former`, `retired`, `on-leave`, `temporarily-unavailable`, or `suspended`
- Do not set `tagline` for `active` or `draft` participants
- Use localized badge text (DE/UK) based on the page language

**Validation:**

- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter warpgogol-com run build:check` (if site exists with people records)

**Completion criterion:** Hero block for non-active participants includes `tagline` with localized status badge text; `active`/`draft` participants have no badge; `build:check` passes.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create unit tests for both new validators covering all rules and edge cases.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/team-lifecycle.test.ts`:
  - Test: no-op pass when no people records
  - Test: `cta-on-former` error for former/retired with CTA
  - Test: `public-draft` error for draft with public visibility
  - Test: `public-suspended` error for suspended with public visibility
  - Test: `consent-review-due` warning for stale consent
  - Test: `stale-technical-evaluation` warning for AI-agent
  - Test: `next-review-past` warning
  - Test: active participant with CTA passes
- Create `packages/os/site-kernel-checks/src/tests/team-cross-page.test.ts`:
  - Test: no-op pass when no people records
  - Test: no-op pass when no team hub page
  - Test: `hub-missing-participant` error
  - Test: `name-mismatch` error
  - Test: `home-page-suspended` error
  - Test: `navigation-founder-remnant` error
  - Test: `json-html-status-mismatch` error
  - Test: `json-missing-html` error

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test`

**Completion criterion:** All tests pass, covering all rules from the failure modes table and edge cases (empty state, active participant passes).

**Human review:** no

---

### Step 7. Update AGENTS.md and regenerate ecosystem manifest

**Goal:** Synchronize documentation artifacts with the new modules and commands.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` module table with entries for `src/team-lifecycle.ts` and `src/team-cross-page.ts`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` to update `docs/ecosystem.generated.yaml`
- Do not hand-edit `docs/ecosystem.generated.yaml`

**Validation:**

- `pnpm exec werkstatt run ecosystem.manifest.validate`
- `pnpm exec werkstatt run workspace.surface.validate`

**Completion criterion:** AGENTS.md module table includes both new modules; `ecosystem.generated.yaml` regenerated and validates.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0513 --implementation-commit <sha>`.
- Run `pnpm exec werkstatt run rfc.validate` to confirm no errors.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate` — no errors for RFC-0513.
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate` — no errors for RFC-0513
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm exec werkstatt run ecosystem.manifest.validate`
- `pnpm exec werkstatt run workspace.surface.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0513` in the subject line (RFC-0265 commit hygiene)
- Unit test files demonstrating all rules from the failure modes table

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Validator false positives (public participant not on hub) | Step 2: `hub-missing-participant` is a warning when participant has `visibility: public` but is not in any hub `select` |
| Stale review dates | Step 1: warnings only, not errors — operator responsibility |
| Behavior snapshot drift from tagline badge | Step 5: `breaksC: false` declared; behavior snapshot must be regenerated after deployment |
| Postbuild false positives from stale dist | Step 2: `team.cross-page.validate` runs in postbuild which fails fast when dist/ is missing |
| Performance | Steps 1-2: both validators scan 1-20 participants; negligible I/O |
| Empty state | Steps 1-2: both validators no-op pass when no people records or no team hub page |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0513 --reason "..." --invariant "DNA-24"` instead of working around it.
- If the hero `tagline` prop is insufficient for the status badge (e.g., visual distinction requirements), create a follow-up RFC for a dedicated badge component rather than overloading `tagline`.
