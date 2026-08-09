---
rfcId: RFC-0775
planId: PLAN-RFC-0775-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
    - packages/ui
    - packages/pbp
    - packages/pbp-rate-adapters
    - packages/ontology
    - packages/tokens
    - packages/share
    - packages/growth
    - packages/growth-adapter-matomo
    - packages/growth-adapter-null
    - packages/growth-adapter-plausible
    - packages/integration
    - packages/integration-adapter-stripe
    - packages/integration-adapter-supabase-crm
    - packages/chat
    - packages/chat-adapter-null
    - packages/chat-adapter-uchat
    - packages/surface
    - packages/geo
    - packages/faq
    - packages/passport
    - packages/content-source
    - packages/studio-gate
    - packages/check-core
    - packages/check-runner-node
    - packages/observability
    - packages/nebula
    - packages/star-map
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - packages/AGENTS.md
    - docs/PACKAGE_GRAPH.md
---

# Implementation Plan: RFC-0775

## 1. Objectives

- [ ] O1 — Move all site domain packages into `packages/werkstatt-site/src/domain/` (maps to acceptance criterion: "All site domain packages moved")
- [ ] O2 — Configure subpath exports for every domain module including adapter sub-packages (maps to: "Subpath exports work for each domain module, including adapter sub-packages")
- [ ] O3 — Preserve existing test suite behavior without assertion changes (maps to: "Existing test suites pass without assertion changes")
- [ ] O4 — Eliminate dangling imports to old `@warpgogol/<name>` specifiers within the plugin (maps to: "No dangling imports remain in the plugin or workpiece")
- [ ] O5 — Verify `packages/ui` sections and components render correctly in warpgogol-com (maps to: "packages/ui sections and components build and render correctly")
- [ ] O6 — Verify LFS assets materialize in extraction dry-run (maps to: "LFS assets materialize correctly in extraction dry-run")
- [ ] O7 — Delete old domain package directories after move (maps to: "Old domain package directories deleted")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/` — new directory tree for all consolidated domain modules
- `packages/werkstatt-site/package.json` — `exports` map expanded with ~30 subpath entries; `dependencies` trimmed (workspace:* deps on moved packages removed)
- `packages/werkstatt-site/tsconfig.json` — path aliases for internal domain imports
- `pnpm-workspace.yaml` — ~27 workspace package entries removed
- `packages/werkstatt-site/.gitattributes` — LFS patterns for `src/domain/ui/**` assets
- Old `packages/{ui,pbp,pbp-rate-adapters,ontology,tokens,share,growth,growth-adapter-*,integration,integration-adapter-*,chat,chat-adapter-*,surface,geo,faq,passport,content-source,studio-gate,check-core,check-runner-node,observability,nebula,star-map}/` — deleted after move

### 2.2 Configuration and data

- `packages/werkstatt-site/extract.config.yaml` — update if LFS asset paths change (RFC-0773)
- `packages/ui` LFS-tracked assets (LordIcon JSON, PNGs) — move into `src/domain/ui/`

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add domain module table and entry points
- `packages/AGENTS.md` — remove ownership entries for deleted packages
- `docs/PACKAGE_GRAPH.md` — regenerate or update to reflect consolidation

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck the consolidated package
- `pnpm --filter @warpgogol/werkstatt-site run test` — run plugin test suite (per-domain vitest configs)
- Runtime subpath export smoke test (summit Q1)
- Studio Gate MCP whitelist verification (summit S1)

### 2.5 Grilling decisions

- **Tests move with packages** — each package's test suite moves into the corresponding `domain/<name>/` subdirectory.
- **Per-domain vitest config** — each domain subdirectory gets its own `vitest.config.ts` inheriting from the root.
- **LFS assets move to plugin** — create `packages/werkstatt-site/.gitattributes` with LFS patterns for `src/domain/ui/**`.
- **Commit per step** — each step is a separate commit for traceability and revertability.
- **Workshop-wide rewrite deferred to RFC-0776** — this RFC only rewrites imports within `packages/werkstatt-site/src/`. Other packages will have broken imports until RFC-0776 runs; this is acceptable during the wave.
- **os/ re-export shims untouched** — `packages/os/site-kernel-*` shims are managed by RFC-0774/0776, not this RFC.

## 3. Step sequence

### Step 1. Create domain directory skeleton and subpath exports

**Goal:** Establish the `src/domain/` directory structure and declare all subpath exports in `package.json` before moving any files.

**Agent actions:**

- Create `packages/werkstatt-site/src/domain/` with subdirectories: `ui/`, `pbp/`, `pbp-rate-adapters/`, `ontology/`, `tokens/`, `share/`, `growth/`, `growth-adapter-matomo/`, `growth-adapter-null/`, `growth-adapter-plausible/`, `integration/`, `integration-adapter-stripe/`, `integration-adapter-supabase-crm/`, `chat/`, `chat-adapter-null/`, `chat-adapter-uchat/`, `surface/`, `geo/`, `faq/`, `passport/`, `content-source/`, `studio-gate/`, `check-core/`, `check-runner/`, `observability/`, `nebula/`, `star-map/`
- Update `packages/werkstatt-site/package.json` `exports` map with subpath entries for each domain module, including adapter sub-packages (summit A1: add `@warpgogol/werkstatt-site/pbp-rate-adapters`)
- Create `src/domain/index.ts` barrel that re-exports from each subdirectory

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes (empty directories are valid)

**Completion criterion:** `src/domain/` exists with all subdirectories; `package.json` `exports` map includes all subpath entries; `build:check` passes.

**Human review:** no

---

### Step 2. Move leaf domain packages

**Goal:** Move domain packages with no dependencies on other domain packages. These are the safest to move first.

**Agent actions:**

- Move `packages/tokens/src/**` → `packages/werkstatt-site/src/domain/tokens/`
- Move `packages/tokens/**/*.test.ts` → `packages/werkstatt-site/src/domain/tokens/` (tests travel with packages)
- Move `packages/tokens/vitest.config.ts` → `packages/werkstatt-site/src/domain/tokens/vitest.config.ts` (per-domain vitest config)
- Repeat for: `geo`, `faq`, `passport`, `content-source`, `check-core`, `check-runner-node` (→ `check-runner/`), `observability`, `nebula`, `star-map`, `surface`, `studio-gate`
- Move each package's `package.json` `exports` entries into the plugin's `exports` map
- Update `tsconfig.json` with path aliases for the new locations
- **Commit** (commit per step)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes with moved leaf packages
- `pnpm --filter @warpgogol/werkstatt-site run test` — moved test suites pass

**Completion criterion:** All leaf domain packages physically relocated with tests; typecheck and tests pass.

**Human review:** no

---

### Step 3. Move mid-level domain packages

**Goal:** Move domain packages that depend on leaf packages. Rewrite their imports to use new specifiers.

**Agent actions:**

- Move `packages/ontology/src/**` + tests + vitest.config.ts → `packages/werkstatt-site/src/domain/ontology/` (site-facing parts only; operations schemas already in engine per RFC-0771)
- Move `packages/share/src/**` + tests + vitest.config.ts → `packages/werkstatt-site/src/domain/share/` (site-facing parts only; summit A2: verify which subpath exports are operations vs site-facing before move — check `@warpgogol/share/integration` and other operations-adjacent exports)
- Move `packages/pbp/src/**` + `packages/pbp-rate-adapters/src/**` + tests → `packages/werkstatt-site/src/domain/pbp/` and `packages/werkstatt-site/src/domain/pbp-rate-adapters/`
- Move `packages/growth/src/**` + 3 adapter packages + tests → `packages/werkstatt-site/src/domain/growth/` and adapter subdirectories
- Move `packages/integration/src/**` + 2 adapter packages + tests → `packages/werkstatt-site/src/domain/integration/` and adapter subdirectories
- Move `packages/chat/src/**` + 2 adapter packages + tests → `packages/werkstatt-site/src/domain/chat/` and adapter subdirectories
- Rewrite intra-domain imports: `@warpgogol/ontology` → `@warpgogol/werkstatt-site/ontology`, etc.
- Update `tsconfig.json` with path aliases
- **Commit** (commit per step)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes with moved mid-level packages
- `pnpm --filter @warpgogol/werkstatt-site run test` — moved test suites pass
- Checkpoint: verify `@warpgogol/share` operations schemas are not lost (summit A2)

**Completion criterion:** All mid-level domain packages relocated with tests; intra-domain imports rewritten; typecheck and tests pass.

**Human review:** no

---

### Step 4. Move packages/ui (highest risk — with checkpoint)

**Goal:** Move the largest domain package with a checkpoint after the move.

**Agent actions:**

- Move `packages/ui/src/sections/**` → `packages/werkstatt-site/src/domain/ui/sections/`
- Move `packages/ui/src/components/**` → `packages/werkstatt-site/src/domain/ui/components/`
- Move `packages/ui/src/icons/**` → `packages/werkstatt-site/src/domain/ui/icons/`
- Move `packages/ui` test suite → `packages/werkstatt-site/src/domain/ui/` (tests travel with packages)
- Move `packages/ui/vitest.config.ts` → `packages/werkstatt-site/src/domain/ui/vitest.config.ts`
- Move LFS-tracked assets (LordIcon JSON, PNGs) → `packages/werkstatt-site/src/domain/ui/`
- Create `packages/werkstatt-site/.gitattributes` with LFS patterns for `src/domain/ui/**/*.json` and `src/domain/ui/**/*.png` (grilling decision: LFS assets move to plugin)
- Rewrite `@warpgogol/ui` imports within domain to `@warpgogol/werkstatt-site/ui`
- Rewrite `@warpgogol/share`, `@warpgogol/pbp`, etc. imports within `domain/ui/` to new subpath specifiers
- Update `tsconfig.json` with path aliases
- **Commit** (commit per step)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — ui test suite passes in new location
- Checkpoint: verify a sample section component renders (e.g. `faq-list-section.astro`) by running a scoped Astro build or import test

**Completion criterion:** `packages/ui` fully relocated to `domain/ui/` with tests and LFS assets; `.gitattributes` created; typecheck and tests pass; sample component renders.

**Human review:** no

---

### Step 5. Rewrite engine module imports to domain

**Goal:** Update imports in `packages/werkstatt-site/src/` engine modules (paths, checks, codegen, content, onboarding, audit, deploy, changelog) to use new domain subpath specifiers.

**Agent actions:**

- Grep for `@warpgogol/{ui,pbp,ontology,share,tokens,growth,integration,chat,surface,geo,faq,passport,content-source,studio-gate,check-core,check-runner-node,observability,nebula,star-map}` in `packages/werkstatt-site/src/` (excluding `src/domain/`)
- Rewrite each to `@warpgogol/werkstatt-site/<name>`
- Verify no `@warpgogol/<old>` specifiers remain in `packages/werkstatt-site/src/` (acceptance criterion: no dangling imports)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `grep -r "@warpgogol/" packages/werkstatt-site/src/ --exclude-dir=domain | grep -v "@warpgogol/werkstatt" | grep -v "@warpgogol/forge"` — zero results

**Completion criterion:** All engine module imports point to `@warpgogol/werkstatt-site/<name>`; no dangling `@warpgogol/<old>` specifiers.

**Human review:** no

---

### Step 6. Update package.json dependencies and pnpm-workspace.yaml

**Goal:** Remove workspace dependencies on moved packages and update workspace configuration.

**Agent actions:**

- Remove all `@warpgogol/{ui,pbp,pbp-rate-adapters,ontology,tokens,share,growth,...}` workspace:* entries from `packages/werkstatt-site/package.json` `dependencies` (summit D1)
- Remove moved package entries from `pnpm-workspace.yaml` (summit D1)
- Run `pnpm install` to update lockfile
- Update `packages/werkstatt-site/tsconfig.json` — remove old path aliases for deleted packages, ensure domain path aliases are correct (summit D2)

**Validation:**

- `pnpm install` — succeeds without errors
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** No workspace:* dependencies on moved packages remain; `pnpm-workspace.yaml` updated; lockfile regenerated.

**Human review:** no

---

### Step 7. Delete old package directories

**Goal:** Remove the original package directories after all content is moved and imports are rewritten.

**Agent actions:**

- Delete `packages/{ui,pbp,pbp-rate-adapters,ontology,tokens,share,growth,growth-adapter-matomo,growth-adapter-null,growth-adapter-plausible,integration,integration-adapter-stripe,integration-adapter-supabase-crm,chat,chat-adapter-null,chat-adapter-uchat,surface,geo,faq,passport,content-source,studio-gate,check-core,check-runner-node,observability,nebula,star-map}/`
- Note: workshop-wide import rewrite is deferred to RFC-0776 (grilling decision). The workshop will have broken imports in other packages until RFC-0776 runs — this is acceptable during the wave.
- Note: `packages/os/site-kernel-*` re-export shims are managed by RFC-0774/0776, not this RFC (grilling decision)
- **Commit** (commit per step)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — test suite passes

**Completion criterion:** All old domain package directories deleted; plugin typecheck and tests pass.

**Human review:** no

---

### Step 8. Runtime smoke test and Studio Gate verification

**Goal:** Verify subpath exports resolve at runtime (not just typecheck) and Studio Gate whitelist enforcement is intact.

**Agent actions:**

- Write a temporary smoke test script that imports from each subpath export and verifies resolution (summit Q1)
- Run the smoke test: `node --loader tsx packages/werkstatt-site/tmp-smoke-test.ts` (or vitest)
- Delete the temporary smoke test after verification
- Verify Studio Gate MCP `workpiece.read`/`workpiece.write` still enforce `clientEditable[]` whitelist (summit S1): run existing `studio-gate` test suite or write a targeted test

**Validation:**

- Smoke test passes — all subpath exports resolve
- Studio Gate whitelist tests pass

**Completion criterion:** All subpath exports resolve at runtime; Studio Gate whitelist enforcement verified.

**Human review:** no

---

### Step 9. Update documentation

**Goal:** Synchronize AGENTS.md files and package graph with the new structure.

**Agent actions:**

- Update `packages/werkstatt-site/AGENTS.md` — add domain module table, entry points, and architecture notes
- Update `packages/AGENTS.md` — remove ownership entries for deleted packages
- Update or regenerate `docs/PACKAGE_GRAPH.md` to reflect consolidation
- Update `packages/werkstatt-site/.gitattributes` if LFS asset paths changed

**Validation:**

- `git diff` shows only documentation changes
- No stale references to old package paths in updated docs

**Completion criterion:** All documentation artifacts in scope are updated.

**Human review:** no

---

### Step 10. Validation suite

**Goal:** Run the full validation suite to verify all acceptance criteria.

**Agent actions:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0775`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- Verify LFS assets materialize: run extraction dry-run per RFC-0773 (if `extract.config.yaml` exists)
- Check off each acceptance criterion with evidence

**Validation:**

- All commands exit 0
- All acceptance criteria verified

**Completion criterion:** All validation commands pass; acceptance criteria checked off.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0775 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0775`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0775`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- Runtime subpath export smoke test (summit Q1)
- Studio Gate whitelist verification (summit S1)
- LFS extraction dry-run (RFC-0773, if extract.config.yaml exists)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0775` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for the implementation session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Package size (`packages/ui` 2683 items) | Step 4 moves `ui` separately with a checkpoint |
| TypeScript resolution speed | Step 1 adds explicit `types` fields in subpath exports |
| LFS binary assets | Step 4 moves LFS assets with `.gitattributes` update; Step 10 verifies extraction |
| `share`/`ontology` split boundary | Step 3 verifies operations vs site-facing split before move (summit A2) |
| Test fixture paths | Step 7 runs test suite after deletion; plan budgets time for fixture repair |
| Subpath export misconfiguration | Step 8 runtime smoke test catches resolution failures (summit Q1) |
| Studio Gate whitelist enforcement | Step 8 verifies MCP whitelist post-move (summit S1) |
| `pnpm-workspace.yaml` stale entries | Step 6 removes entries before package deletion (summit D1) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1, DNA-5, DNA-17, DNA-20, DNA-56, or DNA-64, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0775 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `share`/`ontology` split boundary is ambiguous (operations schemas not cleanly separable from site-facing parts), escalate to the operator — this may require an amendment to RFC-0771.
- If `packages/ui` LFS assets fail to materialize in extraction dry-run, escalate to RFC-0773 publication runbook before proceeding.
