---
rfcId: RFC-0527
planId: PLAN-RFC-0527-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/share"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-content"
  services: []
  docs:
    - docs/source-markup.xml
    - docs/technology.xml
    - packages/share/AGENTS.md
    - packages/os/site-kernel-content/AGENTS.md
---

# Implementation Plan: RFC-0527

## 1. Objectives

- [ ] O1 — Content reference index builder (`content.ref-index.generate`) scans `src/content/` and writes `src/content-ref-index.generated.yaml` — maps to acceptance criterion [content.ref-index.generate scans...]
- [ ] O2 — Index contains frontmatter of all `.md` files and full content of all `.yaml` files, excluding markdown body — maps to acceptance criteria [Index contains...] and [Index does NOT contain...]
- [ ] O3 — Updated `content.references.validate` detects unresolved braceless references with REF-01..04 — maps to acceptance criterion [content.references.validate detects...]
- [ ] O4 — Unified resolver API (`loadContentRefIndex`, `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep`) in `@gogol/share` — maps to acceptance criteria [resolveReference...], [resolveReferencesInString...], [resolveReferencesDeep...]
- [ ] O5 — Resolver works without `astro:content` (kernel context compatible) — maps to acceptance criterion [Resolver works without...]
- [ ] O6 — Pipeline wiring: `content.ref-index.generate` in `build-prepare` after `yaml.parse.validate`; `content.references.validate` updated in `sites-check-author` — maps to acceptance criteria [content.ref-index.generate registered...] and [content.references.validate updated...]
- [ ] O7 — Documentation sync: AGENTS.md + Compass XML updated — maps to RFC rollout steps 6–7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/content-reference.ts` — rewrite: remove `astro:content` import, implement index-based resolver (`ContentRefIndex`, `loadContentRefIndex`, `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep`)
- `packages/share/src/content/resolve-field-path.ts` — preserved (field traversal primitive)
- `packages/share/src/content/substitute-deep.ts` — preserved (async walker, callback changes from Astro-based to index-based)
- `packages/share/src/content/substitute-references-in-string.ts` — preserved (regex match/replace, resolver injected)
- `packages/os/site-kernel-codegen/src/` — new: `content-ref-index-generate.ts` command handler (scan, parse, build index, write YAML)
- `packages/os/site-kernel-checks/src/content-references.ts` — update: validate braceless references against index (REF-01..04)
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — add `content.ref-index.generate` after `yaml.parse.validate` (line 20)
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — no change (existing `content.references.validate` at line 263)
- `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` — update `content.references.validate` description
- `packages/os/site-kernel-content/src/content-reference.ts` — preserved (filesystem-based resolver, removed in RFC-0529)

### 2.2 Configuration and data

- `src/content-ref-index.generated.yaml` — new derived artefact (gitignored, GENERATED marker)
- `.gitignore` — add `src/content-ref-index.generated.yaml` pattern (per-site, handled by template)

### 2.3 Documentation and specs

- `packages/share/AGENTS.md` — update resolver API description (remove Astro dependency, add index-based API)
- `packages/os/site-kernel-content/AGENTS.md` — note legacy resolver status (removed in RFC-0529)
- `docs/source-markup.xml` — update source-file contracts for `@gogol/share/content-reference`
- `docs/technology.xml` — update shared package contracts for `@gogol/share`

### 2.4 Validation and pipelines

- `build-prepare` pipeline — new step after `yaml.parse.validate`
- `sites-check-author` pipeline — existing step, updated validation logic
- `pnpm exec site-kernel run rfc.validate --id RFC-0527`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`

## 3. Step sequence

### Step 1. ContentRefIndex interface and resolver types

**Goal:** Define the TypeScript contracts for the index and resolver API.

**Agent actions:**

- Add `ContentRefIndex` interface to `packages/share/src/content-reference.ts` (version, generatedAt, entries, collections)
- Define `resolveReference` return type: `{ value: unknown; resolved: boolean; error?: string }`
- Export types from `@gogol/share` entrypoint

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `ContentRefIndex` and `resolveReference` types are exported from `@gogol/share` and typecheck passes.

**Human review:** no

---

### Step 2. Index-based resolver implementation

**Goal:** Implement `loadContentRefIndex`, `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep` in `@gogol/share`.

**Agent actions:**

- Implement `loadContentRefIndex(indexPath: string): ContentRefIndex | null` — read and parse YAML index file
- Implement `resolveReference(index, ref, lang, defaultLang)` — parse `ref` via regex `^([a-z][a-z-]*)\.([a-z0-9-/]+)\.(.+)$`, look up `index.entries[collection][file][lang]`, traverse field path via `resolveFieldPath`, fall back to `defaultLang`
- Implement `resolveReferencesInString(index, text, lang, defaultLang)` — scan for `collection.file.field` patterns, validate against index (collection existence check), replace matches
- Implement `resolveReferencesDeep(index, data, lang, defaultLang): Promise<unknown>` — delegate to existing `substituteRefsDeep` with index-based resolver as the async callback
- Remove `astro:content` import from `packages/share/src/content-reference.ts`
- Remove `parseContentReference`, `inferLanguageFromPath`, `resolveContentReference`, `substituteContentReferences`, `substituteContentReferencesInData` (legacy functions replaced by new API)

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes
- `pnpm --filter @gogol/share run test` — existing tests pass (some may need updating for new API)

**Completion criterion:** Resolver functions are implemented, `astro:content` import removed, typecheck and tests pass.

**Human review:** no

---

### Step 3. Index builder command (`content.ref-index.generate`)

**Goal:** Implement the index builder command in `@gogol/site-kernel-codegen`.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/content-ref-index-generate.ts` — scan `src/content/**/*.md` and `src/content/**/*.yaml`, parse frontmatter/YAML, build `ContentRefIndex` object, write `src/content-ref-index.generated.yaml`
- Implement collection inference from directory structure (per RFC table)
- Implement language inference (directory-based, suffix-based, `_default` for assets/media)
- Add GENERATED marker header to output YAML
- Register command in codegen module's command table
- Ensure idempotency — identical input produces identical output (deterministic key ordering)

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` — typecheck passes
- Manual smoke: `pnpm exec site-kernel run content.ref-index.generate --site <test-site> --json` produces valid YAML

**Completion criterion:** Command is registered, produces valid index YAML with GENERATED marker, idempotent on re-run.

**Human review:** no

---

### Step 4. Updated reference validator (`content.references.validate`)

**Goal:** Update the existing validator to check braceless references against the index.

**Agent actions:**

- Update `packages/os/site-kernel-checks/src/content-references.ts` — load index via `loadContentRefIndex`, scan for both braceless and brace patterns (transition period: both syntaxes coexist until RFC-0529 migrates all content)
- Validate braceless references against the index: REF-01 (collection not found — error), REF-02 (file not found — error), REF-03 (field not found — error), REF-04 (ambiguous — warning)
- Preserve existing brace `{collection.file.field}` validation logic — RFC-0529 will remove it after migration
- Add closest-match suggestion for REF-01/02 (Levenshtein or prefix match on collection/file names)
- Update command description in `command-tables/04-content-quality.ts`
- Ensure `--json` output shape matches RFC specification

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm --filter @gogol/site-kernel-checks run test` — existing tests pass

**Completion criterion:** Validator detects unresolved braceless references with REF-01..04 diagnostics, exit codes correct (1 for REF-01..03, 0 for REF-04).

**Human review:** no

---

### Step 5. Pipeline wiring

**Goal:** Register `content.ref-index.generate` in `build-prepare` and verify `content.references.validate` in `sites-check-author`.

**Agent actions:**

- Add `{ command: "content.ref-index.generate" }` to `SITES_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`, immediately after `yaml.parse.validate` (line 20), before `kernel.wire` (line 22)
- Verify `content.references.validate` remains at existing position in `sites-check-author` (line 263) — no change needed

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run build.prepare --site <test-site>` — index is generated before downstream generators

**Completion criterion:** `content.ref-index.generate` runs immediately after `yaml.parse.validate` in `build-prepare`; index YAML exists before `material.credits.generate` runs.

**Human review:** no

---

### Step 6. Unit tests

**Goal:** Add unit tests for the new resolver API and index builder.

**Agent actions:**

- Create `packages/share/src/tests/content-ref-index.test.ts` — test `loadContentRefIndex`, `resolveReference` (pure ref, mixed string, missing collection, missing file, missing field, language fallback), `resolveReferencesDeep` (object tree, nested arrays, null/undefined handling)
- Create `packages/os/site-kernel-codegen/src/tests/content-ref-index-generate.test.ts` — test index builder with fixture content (collection inference, language inference, idempotency, empty state)
- Update existing `packages/share/src/tests/substitute-references-in-string.test.ts` — update for new index-based API (inject mock index instead of mock resolver)
- Update existing `packages/share/src/tests/substitute-deep.test.ts` — update callback to match new resolver signature

**Validation:**

- `pnpm --filter @gogol/share run test` — all tests pass
- `pnpm --filter @gogol/site-kernel-codegen run test` — all tests pass

**Completion criterion:** New and updated tests pass; resolver, index builder, and validator have test coverage.

**Human review:** no

---

### Step 7. Documentation sync

**Goal:** Update AGENTS.md files and Compass XML to reflect the new resolver architecture.

**Agent actions:**

- Update `packages/share/AGENTS.md` — replace Astro-based resolver description with index-based API; document `ContentRefIndex`, `loadContentRefIndex`, `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep`
- Update `packages/os/site-kernel-content/AGENTS.md` — note legacy filesystem resolver status (preserved for RFC-0529 migration, then removed)
- Update `docs/source-markup.xml` — update `MODULE_CONTRACT` for `packages/share/src/content-reference.ts` (new purpose, non-goals)
- Update `docs/technology.xml` — update `@gogol/share` package contract (remove Astro dependency for content references, add index-based API)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surface changed

**Validation:**

- `git diff` — verify all scope.docs files are updated or documented as not-applicable
- `pnpm exec site-kernel run workspace.surface.validate` — no drift

**Completion criterion:** All files in `scope.docs` are updated; `workspace.surface.validate` passes.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Verify each acceptance criterion in the RFC against implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0527` — passes
- Run `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0527` (if acceptance probes declared)
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0527` (RFC-0330)
- Stamp: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0527 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0527`
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0527`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/share run test`
- `pnpm --filter @gogol/site-kernel-codegen run test`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0527` (if acceptance probes declared)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0527` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0527.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0527` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Index staleness | Step 5 — pipeline ordering: index generation is first after `yaml.parse.validate`, all mutations happen after |
| False positives in mixed strings | Step 4 — REF-04 warning diagnostic; closed-set collection check prevents non-collection patterns from resolving |
| Index size | Step 3 — build-time only, gitignored, GENERATED marker; 50–500 KB typical |
| Agent misinterpretation | Step 7 — AGENTS.md documents that only known collections trigger resolution |
| Sync/async mismatch | Step 2 — `resolveReferencesDeep` is async, delegates to existing async `substituteRefsDeep` walker |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-4 or DNA-22, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0527 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the braceless parsing regex proves ambiguous for file names containing dots, escalate to a new RFC — do not patch the regex inline.
