---
rfcId: RFC-0716
planId: PLAN-RFC-0716-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages: []
  services: []
  docs:
    - missions/warpgogol-com-m000033/workpiece/src/content/system.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/home.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/de/home.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/services.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/de/services.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/pricing.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/de/pricing.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/team.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/de/team.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/notausgang.md
    - missions/warpgogol-com-m000033/workpiece/src/content/pages/de/notausgang.md
---

# Implementation Plan: RFC-0716

## 1. Objectives

- [ ] Add Tethys (pin 1.3.0) to team page `planets[]` in system.md — maps to acceptance criterion "Team page renders nachweis-reference transparency block"
- [ ] Add `nachweis-register` trust-strip block to homepage (UK + DE) — maps to acceptance criterion "Homepage renders nachweis-register trust-strip block with CTA to /nachweise/"
- [ ] Add `nachweis-reference` transparency blocks to services, pricing, team, notausgang pages (UK + DE) — maps to acceptance criteria for each page
- [ ] All projections use existing block types only — maps to acceptance criterion "All projections use existing block types (trust-strip, transparency)"
- [ ] UK content is source of truth, DE maintains semantic parity — maps to acceptance criterion "UK content is source of truth, DE maintains semantic parity"
- [ ] `astro check` passes for warpgogol-com — maps to acceptance criterion "astro check passes"
- [ ] `rfc.validate` passes — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. No new Site OS commands. No package modifications. This RFC is pure content composition.

### 2.2 Configuration and data

- `missions/warpgogol-com-m000033/workpiece/src/content/system.md` — add Tethys (pin 1.3.0) to team page `planets[]`
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/home.md` — add nachweis-register block
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/home.md` — add nachweis-register block (DE translation)
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/services.md` — add nachweis-reference block
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/services.md` — add nachweis-reference block (DE translation)
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/pricing.md` — add nachweis-reference block
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/pricing.md` — add nachweis-reference block (DE translation)
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/team.md` — add nachweis-reference block
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/team.md` — add nachweis-reference block (DE translation)
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/notausgang.md` — add nachweis-reference block
- `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/notausgang.md` — add nachweis-reference block (DE translation)

### 2.3 Documentation and specs

No AGENTS.md changes needed — the block-declarative pattern is already documented. No Compass XML changes — no repository-wide semantics changed. No DNA invariant changes.

### 2.4 Validation and pipelines

- `page.block.validate` — validates block types against system.md planet pins and propsSchema
- `astro check` — Astro typecheck for warpgogol-com
- `rfc.validate` — RFC frontmatter validation

## 3. Step sequence

### Step 1. Add Tethys to team page planets[] in system.md

**Goal:** Enable the `transparency` block type (cosmicPlanet: Tethys) on the team page by adding it to the planet pin list.

**Agent actions:**

- Read `missions/warpgogol-com-m000033/workpiece/src/content/system.md` at the `pageId: team` entry (line ~678)
- Add `- cosmicPlanet: Tethys` with `pin: 1.3.0` to the `planets[]` array
- Commit with `mission.git.commit`

**Validation:**

- Visually confirm Tethys appears in team page `planets[]`
- `page.block.validate` will confirm in Step 4

**Completion criterion:** `system.md` team page `planets[]` includes `Tethys` with `pin: 1.3.0`

**Human review:** no

---

### Step 2. Add nachweis-register trust-strip block to homepage (UK + DE)

**Goal:** Add the Nachweisregister contextual projection to the homepage as a trust-strip block before the final CTA.

**Agent actions:**

- Read `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/home.md`
- Add `nachweis-register` trust-strip block before the `availability` final-cta block (UK text as source of truth)
- Read `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/home.md`
- Add the same block with DE translation maintaining semantic parity
- Ensure block heading is distinct from existing `promo` trust-strip block heading (axe landmark-unique)
- Commit with `mission.git.commit`

**Validation:**

- Block `id: nachweis-register` is unique within the page
- Block `type: trust-strip` is pinned in system.md for home page (Deimos is pinned)
- Block heading differs from existing `promo` block heading

**Completion criterion:** Both UK and DE home.md files contain a `nachweis-register` trust-strip block with CTA `target: nachweise`

**Human review:** no

---

### Step 3. Add nachweis-reference transparency blocks to services, pricing, team, notausgang (UK + DE)

**Goal:** Add Nachweisregister contextual projections to the four remaining pages as transparency blocks.

**Agent actions:**

- For each page (services, pricing, team, notausgang):
  - Read the UK page file
  - Add `nachweis-reference` transparency block at the semantically appropriate position (after main content, before final CTA)
  - Read the DE page file
  - Add the same block with DE translation maintaining semantic parity
- Ensure each block has a unique `id` within its page
- Ensure heading text is distinct from any existing transparency block on the same page (axe landmark-unique)
- Commit with `mission.git.commit`

**Validation:**

- Each block `type: transparency` is pinned in system.md for its page (Tethys is pinned for services, pricing, notausgang; Step 1 added it for team)
- Each block has a CTA with `target: nachweise`
- Block headings differ from existing transparency blocks on the same page

**Completion criterion:** All 8 page files (4 pages × 2 languages) contain a `nachweis-reference` transparency block with CTA `target: nachweise`

**Human review:** no

---

### Step 4. Validation

**Goal:** Run all validation checks to confirm the content changes are structurally correct.

**Agent actions:**

- Run `pnpm exec werkstatt run page.block.validate --site warpgogol-com` (or equivalent scoped validation)
- Run `pnpm --filter warpgogol-com exec astro check`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0716`
- Fix any violations found

**Validation:**

- `page.block.validate` exits 0 (no B-02 planet-not-pinned, no B-03 props-schema violations)
- `astro check` exits 0
- `rfc.validate` exits 0

**Completion criterion:** All three validation commands pass with zero violations

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review and fix, stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented content. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0716 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0716`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0716`
- `pnpm exec werkstatt run page.block.validate --site warpgogol-com`
- `pnpm --filter warpgogol-com exec astro check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0716` in the subject line
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Empty Nachweisregister page | Step 2/3: CTA links to `/nachweise/` which has RFC-0708 empty-state design — no mitigation needed, by design |
| Projection staleness | Step 2/3: text is generic enough to remain valid across concept evolution |
| CTA link breakage if entitlement removed | Step 4: `page.block.validate` confirms block structure; entitlement removal is out of scope |
| Tethys not pinned for team page | Step 1: adds Tethys to team page `planets[]` before any content blocks are added |
| Duplicate trust-strip heading on homepage | Step 2: ensures `nachweis-register` heading differs from existing `promo` block heading |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0716 --reason "..." --invariant "DNA-24"` instead of working around it.
- If `page.block.validate` reveals a propsSchema mismatch for `trust-strip` or `transparency` blocks, check the section's manifest in `packages/ui/src/sections/` — do not modify the manifest without a new RFC.
