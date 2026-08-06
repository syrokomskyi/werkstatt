---
rfcId: RFC-0711
planId: PLAN-RFC-0711-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - AGENTS.md
    - packages/forge/AGENTS.md
    - packages/forge/os/rfc/rfc-0000-template.md
---

# Implementation Plan: RFC-0711

## 1. Objectives

- [ ] Objective 1 — Register `spec.live.merge`, `spec.live.list`, `spec.live.show`, `spec.live.validate` commands in `forgeSpecModule` (maps to acceptance criteria 1–5)
- [ ] Objective 2 — Integrate `spec.live.merge` into `docs.archive` as a post-loop step for implemented RFCs with `liveSpec` field (maps to acceptance criterion 6)
- [ ] Objective 3 — Add `liveSpec` optional field to RFC frontmatter schema, template, and `rfc.validate` known keys (maps to acceptance criteria 7, 8)
- [ ] Objective 4 — Implement delta extraction and merge logic with `--dry-run` confirmation, conflict detection, and atomic writes (maps to acceptance criteria 9, 10)
- [ ] Objective 5 — Update `AGENTS.md` and `packages/forge/AGENTS.md` with living spec documentation (maps to acceptance criterion 11)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/spec/spec.module.ts` — register 4 new commands: `spec.live.merge`, `spec.live.list`, `spec.live.show`, `spec.live.validate`
- `packages/forge/os/spec/live-spec-merge.ts` — new handler: delta extraction, classification, merge, conflict detection, atomic write
- `packages/forge/os/spec/live-spec-list.ts` — new handler: list all living specs in `docs/specs/live/`
- `packages/forge/os/spec/live-spec-show.ts` — new handler: show a single living spec by domain
- `packages/forge/os/spec/live-spec-validate.ts` — new handler: V-LS-01..05 validation rules
- `packages/forge/os/spec/types.ts` — new types: `LivingSpec`, `LivingSpecHistoryEntry`, `SpecLiveMergeInput`, `SpecLiveMergeResult`, `DeltaOperation`, `DeltaConflict`
- `packages/forge/os/core/core.module.ts` — update `docs.archive` command: add post-loop step 7, update `writes` and `reads` arrays to include `docs/specs/live/**`
- `packages/forge/os/rfc/types.ts` — add `liveSpec?: boolean | string` to `RfcFrontmatter` interface, add `"liveSpec"` to `RFC_KNOWN_KEYS`
- `packages/forge/os/rfc/handlers/validate-rules.ts` — no new rule needed; `liveSpec` is accepted as a known optional field (V-20 won't fire)

### 2.2 Configuration and data

- `docs/specs/live/` — new directory for living spec files (created on first merge)
- `docs/specs/live/README.md` — explanatory README (acceptance criterion 1)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update § Spec vendoring (DNA-55) to document `docs/specs/live/` subdirectory and distinction between vendored and living specs
- `packages/forge/AGENTS.md` — update OS modules table to include `spec.live.*` commands in `forgeSpecModule`
- `packages/forge/os/rfc/rfc-0000-template.md` — add `liveSpec` optional field with comment

### 2.4 Validation and pipelines

- `rfc.validate` — updated to recognize `liveSpec` as a known optional frontmatter field (no new validation rule)
- `spec.live.validate` — new validation command with V-LS-01..05 rules
- `command.manifest.generate` — must be run after adding new commands to update `docs/command-manifest.generated.yaml`
- No CI workflow changes needed (living specs are not build-time artifacts)

## 3. Step sequence

### Step 1. Add `liveSpec` to RFC frontmatter schema and template

**Goal:** Make `liveSpec` a recognized optional frontmatter field so RFCs can declare living spec participation.

**Agent actions:**

- Add `liveSpec?: boolean | string` to `RfcFrontmatter` interface in `packages/forge/os/rfc/types.ts`
- Add `"liveSpec"` to `RFC_KNOWN_KEYS` array in `packages/forge/os/rfc/types.ts`
- Add `liveSpec` field with comment to `packages/forge/os/rfc/rfc-0000-template.md` (after `satisfies` or near `specRef`)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles
- `pnpm exec site-kernel run rfc.validate --id RFC-0711 --json` — still passes

**Completion criterion:** `liveSpec` is in `RFC_KNOWN_KEYS` and `RfcFrontmatter` interface; template has the field; TypeScript compiles; `rfc.validate` passes.

**Human review:** no

---

### Step 1.5. Add acceptance probes to RFC-0711

**Goal:** Define machine-checkable acceptance probes in the RFC frontmatter so `rfc.acceptance.run` can verify the implementation automatically.

**Agent actions:**

- Add `acceptance` array to RFC-0711 frontmatter with probes covering:
  - `spec.live.list --json` returns empty array when `docs/specs/live/` is empty or non-existent
  - `spec.live.validate --json` passes with zero violations on a valid living spec fixture
  - `spec.live.merge --id <test-rfc> --dry-run` produces delta preview without writing files
  - `spec.live.merge --id <test-rfc>` creates a new living spec when none exists (`operation: "created"`)
  - `spec.live.merge --id <test-rfc>` modifies an existing living spec (`operation: "modified"`)
  - `spec.live.merge` aborts without writing when a heading conflict is detected
  - `docs.archive` triggers `spec.live.merge` for implemented RFCs with `liveSpec` field
  - `docs.archive` skips `rejected` RFCs with `liveSpec` field
  - `rfc.validate` accepts `liveSpec` as a known optional frontmatter field (no V-20 warning)
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0711 --json` to verify probes are syntactically valid

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0711 --json`

**Completion criterion:** RFC-0711 frontmatter has `acceptance` array with 9 probes; `rfc.validate` passes.

**Human review:** no

---

### Step 2. Define living spec types

**Goal:** Create the TypeScript contracts for living specs, delta operations, and merge results.

**Agent actions:**

- Create `packages/forge/os/spec/types.ts` (or extend if it exists) with: `LivingSpec`, `LivingSpecHistoryEntry`, `SpecLiveMergeInput`, `SpecLiveMergeResult`, `DeltaOperation`, `DeltaConflict`
- Types match the contracts in RFC-0711 § TypeScript contracts
- `DeltaConflict.resolution` is `"pending" | "resolved"` — conflicts start as `"pending"`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** Types compile and are exported from the spec module directory.

**Human review:** no

---

### Step 3. Implement `spec.live.merge` handler

**Goal:** Core merge logic — extract deltas from an RFC's `## Design` section, classify them, apply to living spec, handle conflicts and initial creation.

**Agent actions:**

- Create `packages/forge/os/spec/live-spec-merge.ts` with `runSpecLiveMerge` handler
- Implement domain derivation: if `liveSpec` is `true`, derive from `packagesImpacted[0]` (strip `packages/` prefix); if `liveSpec` is a string, use it as explicit domain override
- Implement delta extraction: parse RFC `## Design` section into headings, classify each as ADDED/MODIFIED/REMOVED against existing living spec headings
- Implement merge: ADDED → append, MODIFIED → replace heading body, REMOVED → delete heading
- Implement conflict detection: if a heading was last modified by a different RFC, record `DeltaConflict` with `resolution: "pending"` and abort (no file write). **All-or-nothing semantics:** if any heading has a conflict, the entire merge is aborted — no deltas are applied, no file is written. The operator resolves the conflict by editing the RFC's `## Design` section and re-running `spec.live.merge`.
- Implement `--dry-run` flag: preview deltas without writing
- Implement initial creation: if living spec doesn't exist, create with RFC content as initial body, `operation: "created"`
- Implement supersession: if RFC `supersedes` another RFC, remove superseded RFC's contributions before adding new
- Use `writeFileIfChanged` from `@warpgogol/forge/utils` for all file writes
- Add `GENERATED` header marker to living spec output
- Reject RFCs with `status !== "implemented"` (merge happens during archive, status is `implemented` at that point)
- Skip RFCs without `liveSpec` field (no-op)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- Unit test: create a mock RFC and verify delta extraction produces correct ADDED/MODIFIED/REMOVED classification
- Unit test: verify conflict detection aborts before file write
- Unit test: verify `--dry-run` produces no file changes
- Unit test: verify initial creation produces valid living spec frontmatter

**Completion criterion:** Handler compiles, all unit tests pass, `--dry-run` and conflict detection work correctly.

**Human review:** no

---

### Step 4. Implement `spec.live.list`, `spec.live.show`, `spec.live.validate` handlers

**Goal:** Read-only and validation companions to the merge command.

**Agent actions:**

- Create `packages/forge/os/spec/live-spec-list.ts` — list all `docs/specs/live/*.md` files with domain, title, lastMergedRfc, updatedAt, historyCount
- Create `packages/forge/os/spec/live-spec-show.ts` — read and return a single living spec by domain
- Create `packages/forge/os/spec/live-spec-validate.ts` — implement V-LS-01..05:
  - V-LS-01: required frontmatter fields (`domain`, `title`, `lastMergedRfc`, `updatedAt`, `createdAt`, `history`)
  - V-LS-02: `domain` matches filename
  - V-LS-03: `lastMergedRfc` references an existing archived RFC
  - V-LS-04: all `history[].rfc` references exist and are archived
  - V-LS-05: no duplicate `domain` values

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- Unit tests for each handler

**Completion criterion:** All 4 handlers compile and pass unit tests.

**Human review:** no

---

### Step 5. Register commands in `forgeSpecModule`

**Goal:** Wire the 4 new commands into the forge spec module registry.

**Agent actions:**

- Update `packages/forge/os/spec/spec.module.ts` to register `spec.live.merge`, `spec.live.list`, `spec.live.show`, `spec.live.validate`
- `spec.live.merge`: `scope: "workspace"`, `mutatesState: true`, `writes: ["docs/specs/live/**"]`, `reads: ["docs/rfcs/**/*.md", "docs/specs/live/**"]`, flags: `id` (string, required), `dry-run` (boolean)
- `spec.live.list`: `scope: "workspace"`, `reads: ["docs/specs/live/**"]`, flags: none
- `spec.live.show`: `scope: "workspace"`, `reads: ["docs/specs/live/**"]`, flags: `domain` (string, required)
- `spec.live.validate`: `scope: "workspace"`, `reads: ["docs/specs/live/**", "docs/rfcs/**/*.md"]`, flags: none
- Run `pnpm exec site-kernel run command.manifest.generate` to update `docs/command-manifest.generated.yaml`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm exec site-kernel run command.manifest.generate`
- Verify `docs/command-manifest.generated.yaml` contains the 4 new commands

**Completion criterion:** All 4 commands are registered and discoverable in the command manifest.

**Human review:** no

---

### Step 6. Integrate `spec.live.merge` into `docs.archive`

**Goal:** Run `spec.live.merge` automatically during `docs.archive` for implemented RFCs with `liveSpec` field.

**Agent actions:**

- Update `packages/forge/os/core/core.module.ts` `docs.archive` handler:
  - After the main 6-sub-command loop, collect all RFCs moved to `docs/rfcs/archive/implemented/` in this run
  - For each such RFC with `liveSpec` field, call `runSpecLiveMerge`
  - Only process `status: implemented` RFCs — skip `rejected` and `superseded`
  - Merge failures are non-blocking (warn only, consistent with `docs.archive` non-atomic contract)
  - `--dry-run` flag passes through to `spec.live.merge`
- Update `writes` array to include `"docs/specs/live/**"`
- Update `reads` array to include `"docs/specs/live/**"`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- Unit test: verify `docs.archive` calls `spec.live.merge` for implemented RFCs with `liveSpec`
- Unit test: verify `rejected` RFCs are skipped
- Unit test: verify `--dry-run` passes through

**Completion criterion:** `docs.archive` integration works; unit tests pass.

**Human review:** no

---

### Step 7. Create `docs/specs/live/` directory with README

**Goal:** Create the directory structure and explanatory README.

**Agent actions:**

- Create `docs/specs/live/README.md` explaining:
  - Purpose of living specs
  - How they differ from vendored specs (`docs/specs/<spec-id>/`)
  - How to add `liveSpec` to RFC frontmatter
  - How to run `spec.live.merge` manually
  - That living specs are generated artifacts (GENERATED marker)

**Validation:**

- File exists at `docs/specs/live/README.md`

**Completion criterion:** README exists and explains living specs.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Update AGENTS.md files and RFC template with living spec documentation.

**Agent actions:**

- Update root `AGENTS.md` § Spec vendoring (DNA-55): add note about `docs/specs/live/` subdirectory, distinction between vendored (immutable, SPEC-01..07) and living (mutable, V-LS-01..05) specs
- Update `packages/forge/AGENTS.md` OS modules table: add `spec.live.merge`, `spec.live.list`, `spec.live.show`, `spec.live.validate` to `forgeSpecModule` row
- Update `packages/forge/os/rfc/rfc-0000-template.md`: add `liveSpec` optional field with comment (already done in Step 1 if template was updated there)

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0711 --json`
- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** All documentation files updated; `rfc.validate` passes.

**Human review:** no

---

### Step 9. Write unit tests

**Goal:** Comprehensive test coverage for all new handlers and the `docs.archive` integration.

**Agent actions:**

- Create `packages/forge/os/spec/tests/live-spec-merge.test.ts`:
  - Test delta extraction: ADDED, MODIFIED, REMOVED classification
  - Test conflict detection: heading collision aborts before write
  - Test `--dry-run`: no file changes
  - Test initial creation: no existing living spec
  - Test supersession: removes superseded RFC's contributions first
  - Test domain auto-derivation from `packagesImpacted[0]`
  - Test domain override via explicit `liveSpec: "custom-domain"`
  - Test no-op when `liveSpec` is absent
  - Test rejection when RFC status is not `implemented`
- Create `packages/forge/os/spec/tests/live-spec-list.test.ts`:
  - Test empty directory
  - Test multiple living specs
- Create `packages/forge/os/spec/tests/live-spec-show.test.ts`:
  - Test existing spec
  - Test non-existent domain
- Create `packages/forge/os/spec/tests/live-spec-validate.test.ts`:
  - Test V-LS-01 through V-LS-05
- Create `packages/forge/os/core/tests/docs-archive-live-spec.test.ts`:
  - Test integration: implemented RFC with `liveSpec` triggers merge
  - Test `rejected` RFC is skipped
  - Test `--dry-run` passes through

**Validation:**

- `pnpm --filter @warpgogol/forge run test`

**Completion criterion:** All tests pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/forge/`) with new commands and living spec documentation.
- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces changed (already done in Step 5).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if pipeline topology changed (no pipeline changes in this RFC).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0711 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0711`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0711`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0711` (acceptance probes added in Step 1.5)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0711` (RFC-0330, generates evidence file)
- `pnpm exec site-kernel run command.manifest.generate` (verify new commands appear in manifest)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0711.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0711` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Living spec drift (merge not run during archive) | Step 6 integrates merge into `docs.archive`; `spec.live.validate` V-LS-03 checks `lastMergedRfc` |
| Merge conflicts (heading-based matching is fragile) | Step 3 implements conflict detection that aborts before file write; operator resolves manually |
| Adoption friction (authors forget `liveSpec` field) | Step 1 adds field to template; `fo-idea-create-rfc` suggestion is a future enhancement (non-critical) |
| Scope creep (living specs accumulate implementation details) | `spec.live.validate` could check for code-like content — deferred to future RFC if needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-55, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0711 --reason "..." --invariant "DNA-55"` instead of working around it.
- If the delta classification heuristics prove insufficient for real RFCs, create a follow-up RFC to refine the merge algorithm rather than patching it inline.
