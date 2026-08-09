---
rfcId: RFC-0506
planId: PLAN-RFC-0506-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/requirements.xml
    - docs/verification-plan.xml
    - docs/knowledge-graph.xml
    - packages/share/AGENTS.md
    - packages/ontology/AGENTS.md
---

# Implementation Plan: RFC-0506

## 1. Objectives

- [ ] O1 — C-contract `jsonld-types.yaml` updated with Article optional fields and FAQPage prohibition — maps to acceptance criteria 1, 2
- [ ] O2 — `SemanticPageModel` extended with `authorRecord`, `reviewedAt`, `changelog` fields — maps to acceptance criterion 7
- [ ] O3 — `buildArticleNode` emits structured Person author and URL-string `mainEntityOfPage` for ratgeber depth-1 — maps to acceptance criteria 3, 4
- [ ] O4 — `buildFaqNodes` suppresses FAQPage for ratgeber depth-1 — maps to acceptance criterion 5
- [ ] O5 — `dateModified` computed from `reviewedAt`/`changelog` for ratgeber depth-1 — maps to acceptance criterion 6
- [ ] O6 — `seo.structured.data.validate` enforces SD-RAT-01..04 — maps to acceptance criterion 8
- [ ] O7 — `surface.contract.validate` checks updated C-contract — maps to acceptance criterion 9
- [ ] O8 — No-op migrator `rfc-0506` registered — maps to acceptance criterion 10
- [ ] O9 — Documentation synced (AGENTS.md, Compass XML) — maps to acceptance criteria 11, 12

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Article type: add `description`, `mainEntityOfPage` to `optional`; ratgeber depth-1 `prohibitedTypes`: add `FAQPage` |
| `packages/share/src/semantic/models.ts` | `SemanticPageModel`: add `authorRecord?: { name: string; contactUrl?: string }`, `reviewedAt?: string`, `changelog?: Array<{ date: string; summary: string; authorId: string }>` |
| `packages/share/src/semantic/jsonld/article.ts` | `buildArticleNode`: use `authorRecord` for structured Person; use `page.url` for `mainEntityOfPage` on ratgeber depth-1 |
| `packages/share/src/semantic/jsonld/faq.ts` | `buildFaqNodes`: return `[]` when `surfaceId === "ratgeber" && depth === 1` |
| `packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts` | Add SD-RAT-01..04 rules for ratgeber depth-1 pages |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | Add ratgeber depth-1 Article field checks against C-contract |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0506.ts` | New: no-op migrator (same pattern as `rfc-0498.ts`) |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Import and register `rfc0506Migrator` |

### 2.2 Configuration and data

No content files are modified. The no-op migrator advances `migratorCursor` without transforming authored data.

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `packages/share/AGENTS.md` | Document `authorRecord`, `reviewedAt`, `changelog` fields on `SemanticPageModel`; FAQPage suppression for ratgeber depth-1 |
| `packages/ontology/AGENTS.md` | Document Article type optional fields, ratgeber depth-1 FAQPage prohibition |
| `docs/requirements.xml` | Add ratgeber Article JSON-LD field policy requirement |
| `docs/verification-plan.xml` | Add SD-RAT-01..04 verification checks |
| `docs/knowledge-graph.xml` | Update RFC-0506 relationships |

### 2.4 Validation and pipelines

- `surface.contract.validate` runs in `build.check` — extended with ratgeber depth-1 Article field checks
- `seo.structured.data.validate` runs in `sites-check-postbuild` — extended with SD-RAT-01..04
- `migrator.registry.validate` — verifies `rfc-0506` migrator registration

## 3. Step sequence

### Step 1. Update C-contract `jsonld-types.yaml`

**Goal:** Add `description` and `mainEntityOfPage` to Article optional fields; add `FAQPage` to ratgeber depth-1 prohibited types.

**Agent actions:**

- Edit `packages/ontology/src/external-surfaces/jsonld-types.yaml`:
  - Article type `optional`: add `description`, `mainEntityOfPage`
  - Ratgeber depth-1 `prohibitedTypes`: add `FAQPage`
- Update `CHANGE_SUMMARY` in the file header with `RFC-0506` entry

**Validation:**

- `pnpm --filter @gogol/ontology build:check`
- `pnpm exec werkstatt run surface.contract.validate --app warpgogol-com --json`

**Completion criterion:** `jsonld-types.yaml` Article type includes `description` and `mainEntityOfPage` in optional; ratgeber depth-1 prohibitedTypes includes `FAQPage`; `build:check` passes.

**Human review:** no

---

### Step 2. Extend `SemanticPageModel` with ratgeber article fields

**Goal:** Add `authorRecord`, `reviewedAt`, and `changelog` optional fields to `SemanticPageModel`.

**Agent actions:**

- Edit `packages/share/src/semantic/models.ts`:
  - Add `authorRecord?: { name: string; contactUrl?: string }` to `SemanticPageModel`
  - Add `reviewedAt?: string` to `SemanticPageModel`
  - Add `changelog?: Array<{ date: string; summary: string; authorId: string }>` to `SemanticPageModel`
- Update `CHANGE_SUMMARY` with `RFC-0506` entry

**Validation:**

- `pnpm --filter @gogol/share build:check`

**Completion criterion:** `SemanticPageModel` type includes all three new optional fields; `build:check` passes.

**Human review:** no

---

### Step 3. Update `buildArticleNode` for ratgeber depth-1

**Goal:** Emit structured Person author from `authorRecord` and URL-string `mainEntityOfPage` for ratgeber depth-1 pages.

**Agent actions:**

- Edit `packages/share/src/semantic/jsonld/article.ts`:
  - If `page.authorRecord` is present, emit `author: { "@type": "Person", name: authorRecord.name, ...(authorRecord.contactUrl ? { url: authorRecord.contactUrl } : {}) }`
  - If `page.surfaceId === "ratgeber" && page.depth === 1`, emit `mainEntityOfPage: page.url` (URL string); else keep existing `{ "@id": webpageId }` object form
  - If `page.authorRecord` is absent, fall back to existing `page.author` string behavior
- Update `CHANGE_SUMMARY` with `RFC-0506` entry

**Validation:**

- `pnpm --filter @gogol/share build:check`

**Completion criterion:** `buildArticleNode` uses `authorRecord` for structured Person when present; uses `page.url` for `mainEntityOfPage` on ratgeber depth-1; `build:check` passes.

**Human review:** no

---

### Step 4. Suppress FAQPage for ratgeber depth-1

**Goal:** `buildFaqNodes` returns `[]` when `surfaceId === "ratgeber" && depth === 1`.

**Agent actions:**

- Edit `packages/share/src/semantic/jsonld/faq.ts`:
  - In `buildFaqNodes`, add early return: if `context.page.surfaceId === "ratgeber" && context.page.depth === 1`, return `[]`
- Update `CHANGE_SUMMARY` with `RFC-0506` entry

**Validation:**

- `pnpm --filter @gogol/share build:check`

**Completion criterion:** `buildFaqNodes` returns `[]` for ratgeber depth-1; `build:check` passes.

**Human review:** no

---

### Step 5. Add SD-RAT-01..04 validation rules

**Goal:** `seo.structured.data.validate` enforces Article field policy and FAQPage prohibition for ratgeber depth-1.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts`:
  - After the existing prohibited-type check, add ratgeber depth-1 specific checks:
    - SD-RAT-01: Article node must have `headline`, `description`, `author`, `publisher`, `datePublished`, `mainEntityOfPage`
    - SD-RAT-02: `author` must be a structured `Person` object (not a plain string)
    - SD-RAT-03: `mainEntityOfPage` must match the canonical URL of the page
    - SD-RAT-04: `FAQPage` must not be present (already covered by prohibited-type check, but add explicit SD-RAT-04 ruleId for clarity)
- Update `CHANGE_SUMMARY` with `RFC-0506` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check`

**Completion criterion:** `seo.structured.data.validate` reports SD-RAT-01..04 for ratgeber depth-1 violations; `build:check` passes.

**Human review:** no

---

### Step 6. Extend `surface.contract.validate` for ratgeber depth-1 Article fields

**Goal:** `surface.contract.validate` checks the updated C-contract for ratgeber depth-1 Article fields and FAQPage prohibition.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/surface-contract.ts`:
  - Add check: Article type in `jsonld-types.yaml` includes `description` and `mainEntityOfPage` in optional
  - Add check: ratgeber depth-1 `prohibitedTypes` includes `FAQPage`
- Update `CHANGE_SUMMARY` with `RFC-0506` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm exec werkstatt run surface.contract.validate --app warpgogol-com --json`

**Completion criterion:** `surface.contract.validate` reports violations if Article optional fields or FAQPage prohibition are missing from C-contract; `build:check` passes.

**Human review:** no

---

### Step 7. Register no-op migrator `rfc-0506`

**Goal:** Create and register the no-op migrator to advance `migratorCursor`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0506.ts` (same pattern as `rfc-0498.ts`):
  - `id: "rfc-0506"`
  - `fromVersion: "4.16.0"` (current latest from rfc-0505)
  - `toVersion: "4.17.0"`
  - `transform: async (data) => data` (no-op)
- Edit `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Import `rfc0506Migrator`
  - Add to `migratorRegistry` array (after `rfc0505Migrator`)
  - Add `CHANGE_SUMMARY` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm exec werkstatt run migrator.registry.validate`

**Completion criterion:** `rfc-0506` migrator registered; `migrator.registry.validate` passes; `build:check` passes.

**Human review:** no

---

### Step 8. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/share/AGENTS.md` with `authorRecord`, `reviewedAt`, `changelog` fields on `SemanticPageModel`; FAQPage suppression for ratgeber depth-1
- Update `packages/ontology/AGENTS.md` with Article type optional fields, ratgeber depth-1 FAQPage prohibition
- Update `docs/requirements.xml` with ratgeber Article JSON-LD field policy
- Update `docs/verification-plan.xml` with SD-RAT-01..04 checks
- Update `docs/knowledge-graph.xml` with RFC-0506 relationships
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Check off acceptance criteria: verify each criterion against implemented code, mark `[x]` with `(evidence: ...)` annotations
- Stamp the RFC as implemented: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0506 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0506`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/share build:check`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm exec werkstatt run migrator.registry.validate`
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0506`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/share build:check`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm exec werkstatt run migrator.registry.validate`
- `pnpm exec werkstatt run surface.contract.validate --app warpgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0506` in the subject line (RFC-0265 commit hygiene)
- `rfc.implement.stamp` output confirming `accepted → implemented` transition

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Layer C regression | Step 1 updates C-contract; Step 6 validates compliance via `surface.contract.validate` |
| Author record dependency | Step 3 falls back to `page.author` string if `authorRecord` is absent — non-ratgeber pages unaffected |
| dateModified ambiguity | Step 3 computes `dateModified` with fallback chain: changelog → reviewedAt → datePublished |
| Agent misinterpretation: new JSON-LD types | Step 8 updates AGENTS.md with explicit "no new types" rule |
| False positive: SD-RAT-02 during partial migration | Step 3 populates `authorRecord` before `buildJsonLd` is called — no partial state |
| Migrator not registered | Step 7 creates and registers no-op migrator; `migrator.registry.validate` confirms |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, DNA-24, or DNA-53, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0506 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `surface.contract.validate` reveals additional C-contract drift beyond Article fields and FAQPage, document it in a new RFC rather than expanding this RFC's scope.
