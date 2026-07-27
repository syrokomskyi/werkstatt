---
rfcId: RFC-0500
planId: PLAN-RFC-0500-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/surface"
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/share"
    - "@gogol/site-kernel-handoff"
    - "@gogol/ui"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/surface/AGENTS.md
    - packages/ontology/AGENTS.md
---

# Implementation Plan: RFC-0500

## 1. Objectives

- [ ] O1 — Extend blueprint schema with `hub` and `statusGate` fields (maps to acceptance: "ratgeber.hub.validate passes")
- [ ] O2 — Rewrite ratgeber blueprint: `topics` → `articles`, new constellations, `semanticType: collection` at depth-0 (maps to: "Hub emits CollectionPage", "blueprint uses articles")
- [ ] O3 — Implement `bakeRatgeberHub` and `bakeRatgeberArticle` specializations (maps to: "Hub renders six-block layout", "Article cards show seven fields")
- [ ] O4 — Implement `ratgeber.hub.validate` command with 8 rules (maps to: "ratgeber.hub.validate passes", "No prohibited commercial claims")
- [ ] O5 — Implement `rfc-0500` migrator: `topics` → `articles` + `sections` → prose + category records (maps to: "surface/articles replaces topics", "Migrator transforms all records", "article-categories created")
- [ ] O6 — Update existing validators: `surface.validate`, `article.depth.validate`, `seo.structured-data.validate`, `surface.contract.validate` (maps to: "ratgeber.hub.validate passes")
- [ ] O7 — Add ratgeber JSON-LD type policy to `jsonld-types.yaml` (maps to: "Hub emits CollectionPage")
- [ ] O8 — Sync Compass docs and AGENTS.md files (maps to: "rfc.validate passes")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/surface/src/blueprint-schema.ts` — add `hubSchema`, `statusGateSchema` to `blueprintSchema`
- `packages/surface/src/blueprint.ts` — add `BlueprintHubConfig`, `BlueprintStatusGate` interfaces
- `packages/ontology/blueprints/ratgeber.yaml` — full rewrite
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — add ratgeber dispatch in `bakePage`
- `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts` — new file
- `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` — new file
- `packages/os/site-kernel-checks/src/ratgeber-hub-validate.ts` — new file
- `packages/os/site-kernel-checks/src/lib/surface-articles.ts` — update collection name from `topics` to `articles`
- `packages/os/site-kernel-checks/src/article-depth.ts` — update for new article fields
- `packages/os/site-kernel-handoff/src/migrators/rfc-0500.ts` — new migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register `rfc-0500`
- `tools/kernel.config.ts` — register `ratgeber.hub.validate` command
- `packages/os/site-kernel-checks/src/module.ts` — wire `ratgeber.hub.validate` into check module

### 2.2 Configuration and data

- `packages/ontology/src/external-surfaces/jsonld-types.yaml` — add ratgeber per-depth type policy
- `missions/webgogol-com-m000010/workpiece/src/content/surface/articles/{lang}/*.md` — migrated from topics
- `missions/webgogol-com-m000010/workpiece/src/content/surface/article-categories/{lang}/*.md` — new category records
- `missions/webgogol-com-m000010/workpiece/src/content/prose/{lang}/ratgeber-{slug}.md` — converted from sections

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — add `ratgeber.hub.validate` check
- `docs/COMMANDS.md` — add command entry
- `docs/requirements.xml` — update: new content collections, blueprint schema extension
- `docs/technology.xml` — update: new baker files, validator
- `docs/knowledge-graph.xml` — update: RFC-0500 relationships
- `packages/os/site-kernel-checks/AGENTS.md` — add `ratgeber-hub-validate.ts`, `bake-ratgeber-hub.ts`, `bake-ratgeber-article.ts` to module table
- `packages/surface/AGENTS.md` — update: `BlueprintHubConfig`, `BlueprintStatusGate` types
- `packages/ontology/AGENTS.md` — update: rewritten ratgeber blueprint, new JSON-LD type policy

### 2.4 Validation and pipelines

- `ratgeber.hub.validate` joins `build.check` (blocking)
- `surface.contract.validate` includes ratgeber JSON-LD type policy
- `migrator.registry.validate` verifies rfc-0500 migrator registration

## 3. Step sequence

### Step 1. Blueprint schema extension

**Goal:** Add `hub` and `statusGate` fields to the blueprint Zod schema and TypeScript types.

**Agent actions:**

- Add `hubSchema` (with `cardFields: string[]`, `reservedSlugs: string[]`) and `statusGateSchema` (with `allowedStatuses: string[]`, `excludedStatuses: string[]`) to `packages/surface/src/blueprint-schema.ts`
- Add `BlueprintHubConfig` and `BlueprintStatusGate` interfaces to `packages/surface/src/blueprint.ts`
- Add `hub?: hubSchema` and `statusGate?: statusGateSchema` to the `levels` and `policy` objects in `blueprintSchema`
- Add `hub?: BlueprintHubConfig` to `BlueprintLevel` and `statusGate?: BlueprintStatusGate` to `BlueprintPolicy`

**Validation:**

- `pnpm --filter @gogol/surface run build:check`

**Completion criterion:** `blueprintSchema.safeParse` accepts a blueprint with `hub` and `statusGate` fields; TypeScript types compile.

**Human review:** no

---

### Step 2. Rewrite ratgeber blueprint

**Goal:** Replace the ratgeber blueprint with the new structure from RFC-0500.

**Agent actions:**

- Rewrite `packages/ontology/blueprints/ratgeber.yaml` with: `dataset.collection: articles`, axis id `article`, depth-0 `constellation: ratgeber-hub`, `semanticType: collection`, `hub` config with `cardFields` and `reservedSlugs: [redaktion]`, depth-1 `constellation: ratgeber-article`, `semanticType: article`, `statusGate` in policy
- Remove `pillar` block from depth-0
- Remove `article` block from depth-0

**Validation:**

- `pnpm --filter @gogol/ontology run build:check`
- `pnpm exec site-kernel run blueprint.validate --site webgogol-com` (if available)

**Completion criterion:** `ratgeber.yaml` parses against the extended `blueprintSchema`; no `pillar` or `article` block at depth-0.

**Human review:** no

---

### Step 3. Implement bakeRatgeberHub

**Goal:** Create the hub baker that emits the six-block editorial layout.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts`
- Implement `bakeRatgeberHub(entry, lang, ctx)` that emits:
  1. Hero (eyebrow, H1, lead, CTA to `#themenbereiche`)
  2. Aktuelle Entscheidungshilfen (3 most recently updated `entscheidungshilfe`/`rechenmodell` articles, sorted by `updatedAt` desc) — omit if zero matching
  3. Themenbereiche (all categories sorted by `sortOrder`)
  4. So arbeitet die Redaktion (editorial standards + link to `/ratgeber/redaktion/`)
  5. Neu (3 most recently published, sorted by `publishedAt` desc) — omit if zero
  6. Grundlagen (all `grundlagenartikel` sorted by `title`) — omit if zero
  7. Optional contact (final-cta, only when site has contact page)
- Read article records from `ctx.recordsByPageId` and category records from a new collection read
- Add dispatch in `bakePage`: `if (entry.surfaceId === "ratgeber" && entry.depth === 0) return bakeRatgeberHub(entry, lang, ctx)` — before the pillar check

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `bakeRatgeberHub` returns a `PageEntry` with the six-block layout; editorial blocks omitted when zero matching articles.

**Human review:** no

---

### Step 4. Implement bakeRatgeberArticle

**Goal:** Create the article baker that emits hero + prose body + FAQ + related + CTA.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts`
- Implement `bakeRatgeberArticle(entry, lang, ctx)` that emits:
  1. Hero (title, question as tagline, summary as description, CTA to contact)
  2. Article body (markdown `contentRef` to `prose/{lang}/ratgeber-{slug}.md`)
  3. FAQ (markdown blocks for each `faq[]` entry)
  4. Related articles (up to 6 siblings in same `categoryId`)
  5. Closing CTA
- Add dispatch in `bakePage`: `if (entry.surfaceId === "ratgeber" && entry.depth === 1) return bakeRatgeberArticle(entry, lang, ctx)` — before the generic bake path

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `bakeRatgeberArticle` returns a `PageEntry` with hero + markdown contentRef + FAQ blocks + related articles + CTA.

**Human review:** no

---

### Step 5. Implement ratgeber.hub.validate

**Goal:** Create the validator with 8 rules (RG-HUB-01..08).

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ratgeber-hub-validate.ts`
- Implement `runRatgeberHubValidate(input)` that checks:
  - RG-HUB-01: Hub emits `CollectionPage` as primary JSON-LD type
  - RG-HUB-02: Hub layout matches six-block structure
  - RG-HUB-03: Article card missing a required field
  - RG-HUB-04: Category has no published articles (warning)
  - RG-HUB-05: Article slug matches a reserved slug
  - RG-HUB-06: Non-published article in surface artifact
  - RG-HUB-07: Prohibited commercial result claim in article prose/fields (exclude `faq[].answer`)
  - RG-HUB-08: Article missing required field
- Exit codes: 0 = pass, 1 = any error, 2 = only warnings
- `--json` output: `{ exitCode, summary, diagnostics: Array<{ rule, severity, message, file? }> }`
- Register in `tools/kernel.config.ts` and `packages/os/site-kernel-checks/src/module.ts`
- Wire into `build.check` pipeline

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run ratgeber.hub.validate --site webgogol-com --json` (after content migration)

**Completion criterion:** Command runs and returns diagnostics with correct exit codes.

**Human review:** no

---

### Step 6. Implement rfc-0500 migrator

**Goal:** Transform `topics` → `articles` + `sections` → prose + create category records.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0500.ts`
- Implement migrator that:
  - Reads `surface/topics/{lang}/*.md`, writes `surface/articles/{lang}/*.md`
  - Maps fields per RFC migrator table (slug, name→title, intro→summary, etc.)
  - Converts `sections[]` to `prose/{lang}/ratgeber-{slug}.md` markdown files
  - Creates `surface/article-categories/{lang}/kosten.md` and `sichtbarkeit.md`
  - Maps `website-kosten` → `categoryId: kosten`, `lokale-sichtbarkeit` → `categoryId: sichtbarkeit`
  - Idempotent: skips files already migrated
- Create `rfc-0500.pbt.test.ts` (idempotency test: f(f(x)) == f(x))
- Create `rfc-0500.snapshot.test.ts` (snapshot on real data)
- Register in `packages/os/site-kernel-handoff/src/migrators/registry.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** Migrator transforms topics to articles, creates category records, converts sections to prose; idempotent; registered in registry.

**Human review:** no

---

### Step 7. Update existing validators

**Goal:** Update `surface.validate`, `article.depth.validate`, `seo.structured-data.validate`, `surface.contract.validate` for the new ratgeber structure.

**Agent actions:**

- Update `packages/os/site-kernel-checks/src/lib/surface-articles.ts`: read `articles` collection instead of `topics`
- Update `packages/os/site-kernel-checks/src/article-depth.ts`: check new article fields (`question`, `summary`, `readTime`, `reviewedAt`, `authorId`)
- Update `seo.structured-data.validate`: expect `CollectionPage` at ratgeber depth-0, `Article` at depth-1
- Update `surface.contract.validate`: include ratgeber JSON-LD type policy from `jsonld-types.yaml`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** All four validators handle the new ratgeber structure without errors.

**Human review:** no

---

### Step 8. Add ratgeber JSON-LD type policy

**Goal:** Add ratgeber per-depth type policy to the Layer C contract.

**Agent actions:**

- Add to `packages/ontology/src/external-surfaces/jsonld-types.yaml`:
  - `surface: ratgeber, depth: 0, requiredTypes: [CollectionPage, BreadcrumbList], prohibitedTypes: [Article, Service, LocalBusiness, Offer]`
  - `surface: ratgeber, depth: 1, requiredTypes: [Article, BreadcrumbList], prohibitedTypes: [CollectionPage, Service, LocalBusiness, Offer]`

**Validation:**

- `pnpm exec site-kernel run surface.contract.validate --site webgogol-com`

**Completion criterion:** `surface.contract.validate` enforces the ratgeber type policy.

**Human review:** no

---

### Step 9. Run migration and create content

**Goal:** Execute the migrator on webgogol-com content and verify the result.

**Agent actions:**

- Run `pnpm exec site-kernel run mission.migrate --mission webgogol-com-m000010` (or the current mission id)
- Verify `surface/articles/{lang}/*.md` exists with correct fields
- Verify `surface/article-categories/{lang}/*.md` exists with `kosten` and `sichtbarkeit`
- Verify `prose/{lang}/ratgeber-{slug}.md` exists with converted sections
- Delete old `surface/topics/{lang}/*.md` files

**Validation:**

- `pnpm exec site-kernel run ratgeber.hub.validate --site webgogol-com --json`
- `pnpm exec site-kernel run surface.validate --site webgogol-com --json`

**Completion criterion:** Migration produces valid article records, category records, and prose files; old topics collection removed.

**Human review:** no

---

### Step 10. Update referential integrity

**Goal:** Update `supersededBy` and `amendedBy` fields on related RFCs.

**Agent actions:**

- Update `docs/rfcs/archive/implemented/rfc-0325-*.md`: add `RFC-0500` to `supersededBy`
- Update `docs/rfcs/archive/implemented/rfc-0193-*.md`: add `RFC-0500` to `amendedBy`
- Update `docs/rfcs/rfc-0498-*.md`: add `RFC-0500` to `amendedBy`

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0500 --json` (warnings should be resolved)

**Completion criterion:** `rfc.validate` reports zero violations for RFC-0500.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md`: add `ratgeber-hub-validate.ts`, `bake-ratgeber-hub.ts`, `bake-ratgeber-article.ts` to module table
- Update `packages/surface/AGENTS.md`: document `BlueprintHubConfig`, `BlueprintStatusGate` types
- Update `packages/ontology/AGENTS.md`: document rewritten ratgeber blueprint, new JSON-LD type policy
- Update `docs/verification-plan.xml`: add `ratgeber.hub.validate` check
- Update `docs/COMMANDS.md`: add command entry
- Update `docs/requirements.xml`: new content collections, blueprint schema extension
- Update `docs/technology.xml`: new baker files, validator
- Update `docs/knowledge-graph.xml`: RFC-0500 relationships
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Check off all acceptance criteria with inline `(evidence: ...)` annotations
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0500 --implementation-commit <sha> --dry-run` first, then without `--dry-run`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0500 --json`
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0500 --json`
- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run ratgeber.hub.validate --site webgogol-com --json`
- `pnpm exec site-kernel run surface.validate --site webgogol-com --json`
- `pnpm exec site-kernel run surface.contract.validate --site webgogol-com`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0500` in the subject line (RFC-0265 commit hygiene)
- Migrator PBT + snapshot test results

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Migrator data loss | Step 6: idempotent migrator with PBT test; sections converted to prose, not dropped |
| Category inference errors | Step 6: explicit slug-to-category mapping for existing articles; `unsorted` fallback flagged by RG-HUB-03 |
| Hub layout regression | Step 5: `ratgeber.hub.validate` enforces six-block structure (RG-HUB-02) |
| JSON-LD type change | Step 8: `breaksC: true` declared; `surface.contract.validate` enforces new type policy |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16 (semantic layer topology), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0500 --reason "..." --invariant "DNA-16"` instead of working around it.
- If the blueprint schema extension is rejected by `blueprintSchema.safeParse` due to an unforeseen constraint, investigate the schema contract before loosening validation.
