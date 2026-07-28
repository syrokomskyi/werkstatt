---
rfcId: RFC-0503
planId: PLAN-RFC-0503-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0503

## 1. Objectives

- [ ] O1 — Editorial policy page prose created in DE and UK with all 5 required H2 sections — maps to acceptance criterion "Policy page contains all 5 required H2 sections in both DE and UK"
- [ ] O2 — Page entries created at `src/content/pages/{lang}/ratgeber-redaktion.md` (frontmatter-only, DNA-24) — maps to acceptance criterion "Page entries exist at src/content/pages/{lang}/ratgeber-redaktion.md"
- [ ] O3 — Page registered in `system.md` with `cosmicStar: Polaris` and language-keyed routes — maps to acceptance criterion "Page is registered in system.md"
- [ ] O4 — `ratgeber.policy.validate` command implemented and registered — maps to acceptance criterion "ratgeber.policy.validate passes on warpgogol-com"
- [ ] O5 — `bakeRatgeberHub` updated to emit link to policy page with correct link text — maps to acceptance criterion "Hub links to the policy page"
- [ ] O6 — `url-schema.yaml` extended with `/ratgeber/redaktion/` route pattern — maps to acceptance criterion "breaksC: true"
- [ ] O7 — `amendedBy` on RFC-0500 updated to include RFC-0503 — maps to rfc.validate V-19 resolution
- [ ] O8 — All validation passes (`rfc.validate`, `build:check`) — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/ratgeber-policy-validate.ts` — **New**: validator implementation (RG-POL-01..05)
- `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts` — **Updated**: update `redaktionLink` labels and emit link to policy page
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — **Updated**: register `ratgeber.policy.validate` command entry
- `packages/ontology/src/external-surfaces/url-schema.yaml` — **Updated**: add `/ratgeber/redaktion/` route pattern

### 2.2 Configuration and data

- `src/content/prose/de/ratgeber-redaktion.md` — **New content**: DE editorial policy page prose with 5 required H2 sections
- `src/content/prose/uk/ratgeber-redaktion.md` — **New content**: UK editorial policy page prose with 5 required H2 sections
- `src/content/pages/de/ratgeber-redaktion.md` — **New content**: DE page entry (frontmatter-only, DNA-24)
- `src/content/pages/uk/ratgeber-redaktion.md` — **New content**: UK page entry (frontmatter-only, DNA-24)
- `src/content/system.md` — **Updated**: add `ratgeber-redaktion` page entry with `cosmicStar: Polaris`, routes, planets

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — add `ratgeber.policy.validate` check entry
- `docs/COMMANDS.md` — add `ratgeber.policy.validate` command documentation
- `docs/requirements.xml` — update: new static page, policy validator
- `docs/technology.xml` — update: new validator file
- `docs/knowledge-graph.xml` — update: RFC-0503 relationships
- `packages/os/site-kernel-checks/AGENTS.md` — update: document `ratgeber-policy-validate.ts` module
- `docs/rfcs/rfc-0503-ratgeber-editorial-policy-page-and-status-workflow.md` — read-only reference
- `docs/rfcs/rfc-0500-ratgeber-editorial-knowledge-hub-article-collection-and-hub-restructure.md` — **Updated**: add `RFC-0503` to `amendedBy` frontmatter

### 2.4 Validation and pipelines

- `build.check` — `ratgeber.policy.validate` joins the build check pipeline
- `rfc.validate` — must pass on RFC-0503 and RFC-0500 (V-19 resolved)
- `surface.contract.validate` — must pass with extended url-schema.yaml (no code changes needed — reads dynamically)

## 3. Step sequence

### Step 1. Create editorial policy page prose (DE + UK)

**Goal:** Create the editorial policy page prose files with all 5 required H2 sections in both languages.

**Agent actions:**

- Create `src/content/prose/de/ratgeber-redaktion.md` with frontmatter and 5 H2 sections: `## Redaktionsstandards`, `## Prüfrhythmus`, `## Autoren`, `## Quellenpolitik`, `## Kontakt`
- Create `src/content/prose/uk/ratgeber-redaktion.md` with frontmatter and 5 H2 sections: `## Редакційні стандарти`, `## Ритм перевірки`, `## Автори`, `## Політика джерел`, `## Контакти`
- Draft placeholder editorial content for each section (standards, review cadence, author profiles, source policy, contact info). The operator should review the prose before publication.

**Validation:**

- Both files exist and contain all 5 required H2 headings (exact match, trimmed, no trailing attributes)

**Completion criterion:** Both prose files exist with all 5 required H2 sections in the correct language.

**Human review:** yes — operator should review the editorial policy prose content before publication. The agent drafts the structure and placeholder content; the operator ensures the editorial standards text is accurate.

---

### Step 2. Create page entries (DNA-24 frontmatter-only)

**Goal:** Create frontmatter-only page entries that reference the prose files via `contentRef`.

**Agent actions:**

- Create `src/content/pages/de/ratgeber-redaktion.md` with frontmatter: `kind: page`, `cosmicStar: Polaris`, `title`, `description`, `lang: de`, `blocks: [{ type: markdown, props: { contentRef: ratgeber-redaktion, heading: "Redaktion" } }]`
- Create `src/content/pages/uk/ratgeber-redaktion.md` with equivalent UK frontmatter

**Validation:**

- `pnpm exec site-kernel run page.block.validate --site warpgogol-com` — page entries must pass B-01..B-06 checks (frontmatter-only, no markdown body, valid schema)

**Completion criterion:** Both page entries exist, are frontmatter-only (no markdown body), and pass `page.block.validate`.

**Human review:** no

---

### Step 3. Register page in system.md

**Goal:** Add the editorial policy page to the site's `system.md` pages[] array.

**Agent actions:**

- Add a new page entry to `src/content/system.md` `pages[]`:
  ```yaml
  - pageId: ratgeber-redaktion
    semanticType: about
    routes:
      de: ratgeber/redaktion
      uk: porady/redaktsiya
    cosmicStar: Polaris
    planets:
      - { cosmicPlanet: Hyperion, pin: "1.0.0" }
  ```

**Validation:**

- `pnpm exec site-kernel run system.manifest.validate --site warpgogol-com` — manifest must parse and validate
- `pnpm exec site-kernel run page.block.validate --site warpgogol-com` — pageId must resolve in system.md (B-04)

**Completion criterion:** `system.manifest.validate` passes and the new pageId `ratgeber-redaktion` is declared in `pages[]`.

**Human review:** no

---

### Step 4. Implement ratgeber.policy.validate

**Goal:** Create the policy validator with rules RG-POL-01..05.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ratgeber-policy-validate.ts`
- Implement `runRatgeberPolicyValidate` following the pattern of `ratgeber-hub-validate.ts` and `ratgeber-provenance-validate.ts`
- RG-POL-01: Check that `src/content/prose/{lang}/ratgeber-redaktion.md` exists for each supported language
- RG-POL-02: Check that the prose file contains all 5 required H2 sections (exact match, trimmed, H2 only)
- RG-POL-03: Check published articles' `reviewedAt` date — warn if older than 3 months
- RG-POL-04: Delegate to `ratgeber.article.validate` — collect published-article failures
- RG-POL-05: Delegate to `ratgeber.hub.validate` — collect review-required-in-surface-artifact failures
- Use `REQUIRED_SECTIONS_DE`, `REQUIRED_SECTIONS_UK`, `REVIEW_CADENCE_MONTHS` constants from the RFC TypeScript contracts
- Export `runRatgeberPolicyValidate`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — TypeScript compiles
- `pnpm exec site-kernel run ratgeber.policy.validate --site warpgogol-com --json` — command executes

**Completion criterion:** Validator compiles, executes, and produces correct diagnostics for all 5 rules.

**Human review:** no

---

### Step 5. Register command in check module

**Goal:** Register `ratgeber.policy.validate` in the data-driven command table.

**Agent actions:**

- Add entry to `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`:
  ```ts
  {
    name: "ratgeber.policy.validate",
    description: "RFC-0503: validate ratgeber editorial policy page existence, required sections, review cadence, and article status workflow.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/prose/**/ratgeber-redaktion.md",
      "<app>/src/content/surface/articles/**/*.md",
      "<app>/src/surface.generated.yaml",
    ],
    execute: runRatgeberPolicyValidate,
  },
  ```
- Add import for `runRatgeberPolicyValidate` at the top of the file

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — TypeScript compiles
- Command appears in `pnpm exec site-kernel run --list` output

**Completion criterion:** Command is registered and discoverable via the kernel command list.

**Human review:** no

---

### Step 6. Update bakeRatgeberHub to emit policy page link

**Goal:** Update the hub baker to emit a visible link to the editorial policy page.

**Agent actions:**

- Update `HUB_LABELS` in `bake-ratgeber-hub.ts`: change `redaktionLink` from "Mehr zur redaktionellen Arbeit" to "Mehr zur Redaktion" (DE) and from "Дізнатися більше про редакційну роботу" to "Докладніше про редакцію" (UK)
- Update the "So arbeitet die Redaktion" block emission (line 191) to include a link to the policy page. Two approaches:
  - **Option A (recommended):** Append a `ctaBlock` after the `md` block with a single link item targeting `ratgeber-redaktion` pageId
  - **Option B:** Include an inline markdown link in the `redaktionBody` text
- Verify the hub still passes `ratgeber.hub.validate` RG-HUB-02 (block types must be from the allowed set: hero, audience-cards, markdown, final-cta). A `ctaBlock` produces a `final-cta` block type which is already in the allowed set.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — TypeScript compiles
- `pnpm exec site-kernel run ratgeber.hub.validate --site warpgogol-com` — RG-HUB-02 still passes (no unexpected block types)

**Completion criterion:** Hub baker emits a visible link to `/ratgeber/redaktion/` (DE) / `/porady/redaktsiya/` (UK) and RG-HUB-02 still passes.

**Human review:** no

---

### Step 7. Extend url-schema.yaml with policy page route

**Goal:** Add the editorial policy page route pattern to the C-contract.

**Agent actions:**

- Add a new route pattern to `packages/ontology/src/external-surfaces/url-schema.yaml`:
  ```yaml
  - pattern: "/:locale?/ratgeber/redaktion"
    params:
      locale:
        optional: true
        enum: [de, en]
    generated: false
  ```
- Note: The UK variant `/porady/redaktsiya/` is handled via the `routes` map in `system.md` (language-keyed), not via a separate url-schema pattern. The url-schema pattern documents the DE route structure. The `surface.contract.validate` command reads url-schema dynamically and does not need code changes.

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` — YAML parses and validates against the Zod schema
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com` — passes with the extended schema

**Completion criterion:** url-schema.yaml includes the new route pattern and `surface.contract.validate` passes.

**Human review:** no

---

### Step 8. Update amendedBy on RFC-0500

**Goal:** Resolve the V-19 warning by adding RFC-0503 to RFC-0500's `amendedBy` field.

**Agent actions:**

- Edit `docs/rfcs/rfc-0500-ratgeber-editorial-knowledge-hub-article-collection-and-hub-restructure.md` frontmatter: add `RFC-0503` to the `amendedBy` array

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0503 --json` — V-19 warning is resolved (no more "RFC-0500.amendedBy does not include RFC-0503")

**Completion criterion:** `rfc.validate` on RFC-0503 passes with zero warnings.

**Human review:** no

---

### Step 9. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — add `ratgeber-policy-validate.ts` module entry to the "What lives here" table
- Update `docs/verification-plan.xml` — add `ratgeber.policy.validate` check entry
- Update `docs/COMMANDS.md` — add `ratgeber.policy.validate` command documentation
- Update `docs/requirements.xml` — add new static page and policy validator
- Update `docs/technology.xml` — add new validator file
- Update `docs/knowledge-graph.xml` — add RFC-0503 relationships
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (do not hand-edit `docs/ecosystem.generated.yaml`)
- Check off acceptance criteria: verify each criterion against the implemented code, mark `[x]` with inline `(evidence: ...)` annotations
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0503 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0503` — passes
- `pnpm --filter @gogol/site-kernel-checks run build:check` — passes
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0503`
- `pnpm exec site-kernel run rfc.validate RFC-0500` (V-19 resolved)
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm exec site-kernel run ratgeber.policy.validate --site warpgogol-com --json`
- `pnpm exec site-kernel run ratgeber.hub.validate --site warpgogol-com` (RG-HUB-02 still passes after baker update)
- `pnpm exec site-kernel run page.block.validate --site warpgogol-com` (new page entries pass)
- `pnpm exec site-kernel run system.manifest.validate --site warpgogol-com` (new page registration passes)
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com` (extended url-schema passes)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0503` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0503.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Policy page content requires human authoring | Step 1 marks human review — operator reviews prose before publication |
| Hub link mechanism changes hub layout | Step 6 verifies RG-HUB-02 still passes after baker update |
| RG-POL-04/05 overlap causes duplicate diagnostics | Step 4 delegates to existing validators rather than duplicating logic |
| Section heading false positives | Step 4 implements exact trimmed H2 matching per RFC-0501 convention |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (page entry structure), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0503 --reason "..." --invariant "DNA-24"` instead of working around it.
- If the hub baker cannot emit a link without breaking RG-HUB-02, escalate to the plan author — the block type allowed set may need extension via a separate RFC.
