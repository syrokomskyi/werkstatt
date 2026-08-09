---
rfcId: RFC-0760
planId: PLAN-RFC-0760-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages: []
  services: []
  docs: []
---

# Implementation Plan: RFC-0760

## 1. Objectives

- [ ] Add `vidpovidalniRekomendatsiyi` page entry to `system.md` with UK-only route, `locales: [uk]`, `semanticType: content`, `output.sitemap`, `cosmicStar`, `planets[]`, and `shell` — maps to acceptance criterion 1
- [ ] Create page content file `src/content/pages/uk/vidpovidalni-rekomendatsiyi.md` with `kind: page`, `lang: uk`, `blocks[]` — maps to acceptance criterion 2
- [ ] Create all prose content files in `src/content/prose/vidpovidalni-rekomendatsiyi/*.uk.md` — maps to acceptance criterion 3
- [ ] Pass `page.block.validate`, `mirror.quintet.validate`, and `build.check` with zero violations — maps to acceptance criteria 4–6
- [ ] Page renders at `/vidpovidalni-rekomendatsiyi` in UK build only, excluded from DE sitemap — maps to acceptance criteria 7–8
- [ ] Two `send-message` blocks have unique `formId` values — maps to acceptance criterion 9
- [ ] `service-metadata-block` includes `stats[]` for dynamic mandate counts — maps to acceptance criterion 10

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. No new Site OS commands. This RFC is pure content composition — adding a page to an existing site via `system.md` entry + content files.

### 2.2 Configuration and data

- `missions/warpgogol-com-m000040/workpiece/src/content/system.md` — add `vidpovidalniRekomendatsiyi` page entry to `pages[]` array
- `missions/warpgogol-com-m000040/workpiece/src/content/pages/uk/vidpovidalni-rekomendatsiyi.md` — new page content file (frontmatter-only, `kind: page`, `lang: uk`, `blocks[]`)
- `missions/warpgogol-com-m000040/workpiece/src/content/prose/vidpovidalni-rekomendatsiyi/*.uk.md` — prose content files referenced by `contentRef` in blocks

### 2.3 Documentation and specs

No `AGENTS.md` updates needed — no new commands, packages, or governance rules. No `docs/*.xml` Compass sync needed — no repository-wide semantic changes. No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `page.block.validate` — validates block composition against archetype schemas
- `mirror.quintet.validate` — validates manifest quintet for new content files
- `build.check` — full build validation for warpgogol-com
- Sitemap generation — verify UK-only inclusion

## 3. Step sequence

### Step 1. Update TBD cosmicPlanet names from RFC-0758 and RFC-0759

**Goal:** Resolve the two `<TBD>` cosmicPlanet entries in the RFC's `system.md` example by checking which names were picked by `cosmic.name.pick` during implementation of RFC-0758 and RFC-0759.

**Agent actions:**

- Check `packages/ontology/archetypes/index.yaml` for `dynamic-status-block` and `service-metadata-block` entries to find their `acceptedCosmicNames`
- Check `packages/share/src/page.ts` `PLANET_IMPORT_PATHS` for the picked cosmic names
- Record the picked cosmic names and pin versions for use in Step 2

**Validation:**

- Both archetypes exist in `index.yaml` with registered cosmic names
- `PLANET_IMPORT_PATHS` has entries for both picked names

**Completion criterion:** The two TBD cosmicPlanet names and their pin versions are identified and recorded.

**Human review:** no

---

### Step 2. Add page entry to system.md

**Goal:** Add the `vidpovidalniRekomendatsiyi` page entry to the `pages[]` array in `system.md`.

**Agent actions:**

- Open `missions/warpgogol-com-m000040/workpiece/src/content/system.md`
- Add a new `pages[]` entry after the last existing page with:
  - `pageId: vidpovidalniRekomendatsiyi`
  - `semanticType: content`
  - `output.sitemap.lastmod: "2026-08-08"`
  - `routes: { uk: vidpovidalni-rekomendatsiyi }` (no `de` route)
  - `locales: [uk]`
  - `cosmicStar: Vega`
  - `shell.background` with `cosmicMoon: Hermippe, pin: 1.0.0` and home-bg image layers (matching existing pages)
  - `planets[]` with cosmicPlanet objects and pins for all 9 unique archetypes used (hero → Europa, markdown → Hyperion, audience-cards → Epimetheus, controlled-responsibility-block → Calypso, send-message → Ceres, dynamic-status-block → <picked from Step 1>, faq-list → Atlas, final-cta → Dione, service-metadata-block → <picked from Step 1>)
- Commit via `mission.git.commit --mission warpgogol-com-m000040 --message "Add vidpovidalniRekomendatsiyi page entry to system.md"`

**Validation:**

- `system.md` YAML is valid (no parse errors)
- Page entry has `locales: [uk]` and no `de` route
- All `cosmicPlanet` entries have `pin` values

**Completion criterion:** `system.md` contains a valid `vidpovidalniRekomendatsiyi` page entry with all required fields.

**Human review:** no

---

### Step 3. Create page content file

**Goal:** Create the frontmatter-only block-declarative page content file.

**Agent actions:**

- Create `missions/warpgogol-com-m000040/workpiece/src/content/pages/uk/vidpovidalni-rekomendatsiyi.md`
- Set frontmatter: `kind: page`, `pageId: vidpovidalniRekomendatsiyi`, `cosmicStar: Vega`, `title: "Відповідальні рекомендації"`, `description: "..."`, `lang: uk`
- Add `blocks[]` array with 23 entries per the RFC's block composition table:
  - Block 1: `type: hero` with authored props (heading, subheading, 2 CTAs)
  - Blocks 2–4, 7–15, 18: `type: markdown` with `contentRef` pointing to prose files
  - Block 5: `type: audience-cards` with authored props
  - Block 6: `type: controlled-responsibility-block` with authored props
  - Block 16: `type: dynamic-status-block` with authored props (stats: open pilot mandates, open full mandates)
  - Block 17: `type: controlled-responsibility-block` with authored props (prohibited practices)
  - Blocks 19–20: `type: send-message` with custom `checklistItems[]` and unique `formId` values (`recommendation-form`, `market-steward-form`)
  - Block 21: `type: faq-list` with 12 FAQ items
  - Block 22: `type: final-cta` with summary and 2 CTAs
  - Block 23: `type: service-metadata-block` with `stats[]` for mandate counts
- Commit via `mission.git.commit`

**Validation:**

- File exists with valid YAML frontmatter
- `kind: page` and `lang: uk` are set
- `blocks[]` has 23 entries
- Two `send-message` blocks have unique `formId` values

**Completion criterion:** Page content file created with all 23 blocks declared.

**Human review:** no — but content props (headings, descriptions, FAQ items, checklist items) require human authoring. Agent should use `NEEDS_THIS_*` markers for any unsourced claims per RFC-0136.

---

### Step 4. Create prose content files

**Goal:** Create all prose files referenced by `contentRef` in the markdown blocks.

**Agent actions:**

- Create directory `missions/warpgogol-com-m000040/workpiece/src/content/prose/vidpovidalni-rekomendatsiyi/`
- Create the following `.uk.md` files per the RFC block composition table:
  - `how-it-works.uk.md` — 4-step path (block 2)
  - `what-70-eur-pays-for.uk.md` — payment conditions (block 3)
  - `openness-to-client.uk.md` — client transparency (block 4)
  - `after-12-subscriptions.uk.md` — transition to pilot (block 7)
  - `pilot-mandate.uk.md` — 3-month pilot details (block 8)
  - `what-ms-does.uk.md` — Market Steward responsibilities (block 9)
  - `pilot-evaluation.uk.md` — evaluation criteria (block 10)
  - `when-rate-rises.uk.md` — 2000€ threshold (block 11)
  - `marginal-income.uk.md` — marginal income formula (block 12)
  - `threshold-stability.uk.md` — 3-month stability (block 13)
  - `full-ms-reward.uk.md` — full mandate reward (block 14)
  - `if-results-decline.uk.md` — decline review (block 15)
  - `public-verifiability.uk.md` — annual report, 5 promises (block 18)
- Each file contains markdown prose authored from the expert content draft
- Use `NEEDS_THIS_*` markers for any unsourced claims per RFC-0136
- Commit via `mission.git.commit`

**Validation:**

- All 13 prose files exist
- Each file has `lang: uk` in frontmatter
- Content references in page content file match file names

**Completion criterion:** All prose files created and referenced by `contentRef` in the page content file.

**Human review:** no — but prose content requires human authoring. Agent should use `NEEDS_THIS_*` markers for unsourced claims.

---

### Step 5. Run validation suite

**Goal:** Validate the new page composition against all build-time validators.

**Agent actions:**

- Run `pnpm exec werkstatt run page.block.validate --site warpgogol-com` — validates block props against archetype schemas
- Run `pnpm exec werkstatt run mirror.quintet.validate --site warpgogol-com` — validates manifest quintet
- Run `pnpm --filter warpgogol-com exec astro check` — scoped typecheck (per AGENTS.md build verification discipline)
- Fix any violations found by re-editing the page content file or prose files
- Commit fixes via `mission.git.commit`

**Validation:**

- `page.block.validate` passes with zero violations
- `mirror.quintet.validate` passes with zero violations
- `astro check` passes

**Completion criterion:** All three validators pass with zero violations.

**Human review:** no

---

### Step 6. Verify UK-only routing and sitemap exclusion

**Goal:** Confirm the page renders only in the UK build and is excluded from the German sitemap.

**Agent actions:**

- Run `pnpm --filter warpgogol-com run build` (scoped, per AGENTS.md exception for first build verification)
- Check build output for `/vidpovidalni-rekomendatsiyi` HTML file in UK output
- Check German sitemap output — confirm `/vidpovidalni-rekomendatsiyi` is NOT present
- Check UK sitemap output — confirm `/vidpovidalni-rekomendatsiyi` IS present
- Verify language switcher does not show a DE link for this page (falls back to home or hides switcher)

**Validation:**

- UK build contains `/vidpovidalni-rekomendatsiyi` HTML
- DE sitemap does NOT contain `/vidpovidalni-rekomendatsiyi`
- UK sitemap contains `/vidpovidalni-rekomendatsiyi`

**Completion criterion:** Page renders UK-only, excluded from DE sitemap.

**Human review:** no

---

### Step 7. Commit all content and run final validation

**Goal:** Ensure all content is committed and the workpiece is clean.

**Agent actions:**

- Run `mission.git.commit --mission warpgogol-com-m000040 --message "Add vidpovidalni-rekomendatsiyi UK-only page content"` for any remaining uncommitted files
- Run `rtk git status` — verify clean working tree
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0760` — verify RFC still valid

**Validation:**

- `git status` shows no uncommitted changes in workpiece
- `rfc.validate` passes

**Completion criterion:** Workpiece is clean, RFC validation passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed (no new commands, packages, or governance rules)
- No `docs/*.xml` Compass sync needed (no repository-wide semantic changes)
- No `docs/architecture-dna.md` changes needed (no new DNA invariant)
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented content:
  - [x] Page entry in `system.md` with `semanticType: content`, `routes: { uk: ... }`, `locales: [uk]`, `output.sitemap`, `cosmicStar`, `planets[]`, `shell` (evidence: system.md entry)
  - [x] Page content file at `src/content/pages/uk/vidpovidalni-rekomendatsiyi.md` with `kind: page`, `lang: uk`, `blocks[]` (evidence: file exists)
  - [x] Prose files in `src/content/prose/vidpovidalni-rekomendatsiyi/*.uk.md` (evidence: files exist)
  - [x] `page.block.validate` passes (evidence: validator output)
  - [x] `mirror.quintet.validate` passes (evidence: validator output)
  - [x] `build.check` passes (evidence: build output)
  - [x] Page renders at `/vidpovidalni-rekomendatsiyi` in UK build (evidence: HTML file)
  - [x] Page NOT in DE sitemap (evidence: sitemap output)
  - [x] Two `send-message` blocks have unique `formId` values (evidence: block props)
  - [x] `service-metadata-block` includes `stats[]` (evidence: block props)
  - [x] `rfc.validate` passes (evidence: validator output)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session changes. Wait for review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0760 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0760`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; code review passed; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0760`
- `pnpm exec werkstatt run page.block.validate --site warpgogol-com`
- `pnpm exec werkstatt run mirror.quintet.validate --site warpgogol-com`
- `pnpm --filter warpgogol-com exec astro check`
- `pnpm --filter warpgogol-com run build` (scoped, per AGENTS.md exception)

### 4.2 Evidence artifacts

- No acceptance probes declared (commented out in RFC frontmatter) — `rfc.verification.emit` produces no evidence file, `rfc.implement.stamp` works without it
- Commit messages referencing `RFC-0760` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Dependency chain — RFC-0757, 0758, 0759 must be implemented first | Step 1 verifies archetype registration before adding page entry |
| UK-only precedent — first UK-only page, route registry must handle correctly | Step 6 verifies UK-only routing and DE sitemap exclusion |
| Content volume — ~23 blocks, more than typical | Step 5 validates each block independently via `page.block.validate` |
| Two forms on one page — unique `formId` required | Step 3 enforces unique `formId` values; Step 5 validates |
| Agent misinterpretation — may try to create DE version | RFC implementation notes explicitly prohibit DE version; plan does not include DE content |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0760 --reason "..." --invariant "DNA-N"` instead of working around it.
- If RFC-0758 or RFC-0759 have not yet been implemented (archetypes not in catalog), stop and wait — this RFC cannot be implemented without them.
