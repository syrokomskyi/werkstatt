---
rfcId: RFC-0915
planId: PLAN-RFC-0915-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-shared
    - packages/werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/werkstatt-shared/AGENTS.md
---

# Implementation Plan: RFC-0915

## 1. Objectives

- [ ] Create canonical slug module at `packages/werkstatt-shared/src/share/slug/` with `slugUrl`, `slugId`, `HeadingSlugger` — maps to acceptance criterion [slug module created]
- [ ] Move external dependencies (`@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger`) from `werkstatt-site` to `werkstatt-shared` — maps to acceptance criterion [dependencies moved]
- [ ] Remove all custom `slugify()` implementations and update all consumers to import from canonical module — maps to acceptance criterion [duplicates removed]
- [ ] Add DNA-88 invariant to `docs/architecture-dna.md` — maps to acceptance criterion [DNA-88 added]
- [ ] Document canonical slug utilities in `packages/werkstatt-shared/AGENTS.md` — maps to acceptance criterion [AGENTS.md updated]
- [ ] `build:check` passes with all changes — maps to acceptance criterion [build:check passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/share/slug/index.ts` — Created: public API barrel
- `packages/werkstatt-shared/src/share/slug/slug-url.ts` — Created: locale-aware URL slug
- `packages/werkstatt-shared/src/share/slug/slug-id.ts` — Created: semantic block ID slug
- `packages/werkstatt-shared/src/share/slug/heading-slugger.ts` — Created: heading dedup wrapper
- `packages/werkstatt-shared/src/share/slug/strategies.ts` — Created: DE/UK/default strategies
- `packages/werkstatt-shared/src/share/semantic/extract.ts` — Modified: remove `slugify()`
- `packages/werkstatt-shared/src/share/semantic/page-utils.ts` — Modified: import `slugId` from `../slug/`
- `packages/werkstatt-site/src/domain/geo/slug.ts` — Deleted
- `packages/werkstatt-site/src/domain/geo/index.ts` — Modified: re-export `slugUrl as citySlug`
- `packages/werkstatt-site/src/domain/geo/cities.ts` — Modified: import `slugUrl`
- `packages/werkstatt-site/src/domain/geo/service.ts` — Modified: import `slugUrl`
- `packages/werkstatt-site/src/domain/geo/types.ts` — Modified: remove `SlugStrategy`
- `packages/werkstatt-site/src/domain/geo/tests/city-slug.pbt.test.ts` — Modified: import `slugUrl`
- `packages/werkstatt-site/src/domain/geo/tests/service.test.ts` — Modified: import `slugUrl`
- `packages/werkstatt-site/src/checks/person-create.ts` — Modified: remove local `slugify()`, import `slugUrl`
- `packages/werkstatt-site/src/domain/ui/sections/markdown/prose-pipeline.ts` — Modified: import `HeadingSlugger`
- `packages/werkstatt-shared/package.json` — Modified: add 3 dependencies
- `packages/werkstatt-site/package.json` — Modified: remove 3 dependencies

### 2.2 Configuration and data

- `packages/werkstatt-shared/package.json` — dependency additions
- `packages/werkstatt-site/package.json` — dependency removals

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — add DNA-88 invariant entry
- `packages/werkstatt-shared/AGENTS.md` — document canonical slug utilities

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run rfc.validate --id RFC-0915`

## 3. Step sequence

### Step 1. Create canonical slug module structure

**Goal:** Create the `slug/` directory with all TypeScript modules.

**Agent actions:**

- Create `packages/werkstatt-shared/src/share/slug/strategies.ts` — transfer `SlugStrategy` interface, `GermanSlugStrategy`, `UkrainianSlugStrategy`, `DefaultSlugStrategy` from `werkstatt-site/src/domain/geo/slug.ts`
- Create `packages/werkstatt-shared/src/share/slug/slug-url.ts` — export `slugUrl(name, lang?)` function, re-export `citySlug` as alias
- Create `packages/werkstatt-shared/src/share/slug/slug-id.ts` — export `slugId(value)` function (replaces custom `slugify` from `extract.ts`)
- Create `packages/werkstatt-shared/src/share/slug/heading-slugger.ts` — export `HeadingSlugger` class wrapping `github-slugger`
- Create `packages/werkstatt-shared/src/share/slug/index.ts` — barrel re-exporting all public API

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` — typecheck passes

**Completion criterion:** All 5 files exist and typecheck passes.

**Human review:** no

---

### Step 2. Move external dependencies

**Goal:** Transfer the three external packages from `werkstatt-site` to `werkstatt-shared`.

**Agent actions:**

- Add `@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger` to `packages/werkstatt-shared/package.json` dependencies
- Remove `@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger` from `packages/werkstatt-site/package.json` dependencies
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm install` succeeds
- `pnpm --filter @warpgogol/werkstatt-shared run build:check` — imports resolve

**Completion criterion:** Dependencies moved, lockfile updated, imports resolve.

**Human review:** no

---

### Step 3. Update werkstatt-shared consumers

**Goal:** Remove custom `slugify()` from `extract.ts` and update `page-utils.ts`.

**Agent actions:**

- In `packages/werkstatt-shared/src/share/semantic/extract.ts`: remove the `slugify()` function (lines 19-26)
- In `packages/werkstatt-shared/src/share/semantic/page-utils.ts`: remove `import { slugify } from "./extract.ts"` and `export { slugify }`, add `import { slugId } from "../slug/index.ts"`, replace `slugify(block.heading)` with `slugId(block.heading)` at lines 102 and 118

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` — typecheck passes

**Completion criterion:** No `slugify` function in `extract.ts`, `page-utils.ts` uses `slugId`.

**Human review:** no

---

### Step 4. Update werkstatt-site geo consumers

**Goal:** Replace `geo/slug.ts` with imports from canonical module.

**Agent actions:**

- Delete `packages/werkstatt-site/src/domain/geo/slug.ts`
- In `packages/werkstatt-site/src/domain/geo/index.ts`: replace `export { citySlug } from "./slug.ts"` with `export { slugUrl as citySlug } from "@warpgogol/werkstatt-shared/share/slug"`
- In `packages/werkstatt-site/src/domain/geo/cities.ts`: replace `import { citySlug } from "./slug.ts"` with `import { slugUrl } from "@warpgogol/werkstatt-shared/share/slug"`, update usages
- In `packages/werkstatt-site/src/domain/geo/service.ts`: replace `import { citySlug } from "./slug.ts"` with `import { slugUrl } from "@warpgogol/werkstatt-shared/share/slug"`, update usages
- In `packages/werkstatt-site/src/domain/geo/types.ts`: remove `SlugStrategy` interface
- In `packages/werkstatt-site/src/domain/geo/tests/city-slug.pbt.test.ts`: replace `import { citySlug } from "../slug.ts"` with `import { slugUrl } from "@warpgogol/werkstatt-shared/share/slug"`, update test assertions
- In `packages/werkstatt-site/src/domain/geo/tests/service.test.ts`: update import if needed

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — geo tests pass

**Completion criterion:** `geo/slug.ts` deleted, all geo imports use canonical module, tests pass.

**Human review:** no

---

### Step 5. Update werkstatt-site other consumers

**Goal:** Remove custom `slugify()` from `person-create.ts` and update `prose-pipeline.ts`.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/person-create.ts`: remove local `slugify()` function (lines 37-44), add `import { slugUrl } from "@warpgogol/werkstatt-shared/share/slug"`, replace `slugify(rawSlug)` and `slugify(name)` with `slugUrl(rawSlug)` and `slugUrl(name)`
- In `packages/werkstatt-site/src/domain/ui/sections/markdown/prose-pipeline.ts`: remove `import GithubSlugger from "github-slugger"`, add `import { HeadingSlugger } from "@warpgogol/werkstatt-shared/share/slug"`, replace `new GithubSlugger()` with `new HeadingSlugger()`, replace `slugger.slug(text)` with `slugger.slug(text)` (same API)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** No local `slugify` in `person-create.ts`, `prose-pipeline.ts` uses `HeadingSlugger`.

**Human review:** no

---

### Step 6. Add DNA-88 and update AGENTS.md

**Goal:** Write the DNA-88 invariant and document canonical utilities.

**Agent actions:**

- Add DNA-88 entry to `docs/architecture-dna.md` after DNA-87:
  ```
  ## DNA-88 · Canonical slug generation ownership

  All slug generation in the monorepo uses `@warpgogol/werkstatt-shared/share/slug`. The external packages `@sindresorhus/slugify`, `cyrillic-to-translit-js`, and `github-slugger` are dependencies of `werkstatt-shared` only — no other package may import them directly. Ad hoc `slugify()` reimplementations are forbidden outside the canonical module. Enforced by `utility.provenance.validate` (RFC-0916). Established by RFC-0915.
  ```
- Update `packages/werkstatt-shared/AGENTS.md` with a "Canonical utilities" section documenting:
  - `slugUrl(name, lang?)` — locale-aware URL slug
  - `slugId(value)` — semantic block ID
  - `HeadingSlugger` — heading anchor deduplication
  - Rule: agents MUST import from `@warpgogol/werkstatt-shared/share/slug` and MUST NOT reimplement

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0915` — passes
- DNA-88 entry exists in `docs/architecture-dna.md`

**Completion criterion:** DNA-88 written, AGENTS.md updated.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Verify slug output compatibility with existing behavior.

**Agent actions:**

- Run existing geo tests: `pnpm --filter @warpgogol/werkstatt-site run test -- --grep "city-slug"`
- Verify `slugId("")` returns `"entity"` (edge case)
- Verify `slugUrl("München", "de")` returns `"muench-en"` (German umlaut handling)
- Verify `slugUrl("Київ", "uk")` returns `"kyiv"` (Ukrainian transliteration)
- Verify `HeadingSlugger` deduplication: first `slug("Fazit")` → `fazit`, second → `fazit-1`

**Validation:**

- All existing tests pass
- New edge case checks pass

**Completion criterion:** All slug tests pass with canonical module.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp as implemented.

**Agent actions:**

- Verify `docs/architecture-dna.md` has DNA-88 entry
- Verify `packages/werkstatt-shared/AGENTS.md` has canonical utilities section
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if needed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`, re-run `fo-review` (max 3 iterations)
- Check off acceptance criteria: verify each criterion against implemented code, mark `[x]` with `(evidence: <file:line>)`
- Stamp the RFC: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0915 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0915`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0915`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0915` in the subject line
- `docs/rfcs/verification/rfc-0915.generated.json` (if acceptance probes declared — none in this RFC)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `slugId` output differs from custom `slugify` | Step 7 — unit tests verify output compatibility |
| `HeadingSlugger` dedup behavior differs | Step 7 — verify dedup test cases |
| `citySlug` consumers break | Step 4 — `index.ts` re-exports `slugUrl as citySlug` preserving public API |
| `pnpm install` lockfile conflicts | Step 2 — run `pnpm install` immediately after dependency changes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0915 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `slugUrl` output differs from `citySlug` in a way that breaks existing URLs, stop and assess whether a migration path is needed (this would require a new RFC).
