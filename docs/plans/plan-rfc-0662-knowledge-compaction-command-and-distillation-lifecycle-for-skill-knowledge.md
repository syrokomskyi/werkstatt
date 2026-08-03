---
rfcId: RFC-0662
planId: PLAN-RFC-0662-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/forge/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0662

## 1. Objectives

- [ ] Implement `planCompaction` pure function with expiry, supersession, L0 retention, and L2 staleness actions — maps to acceptance criterion "planCompaction is pure and unit-tested"
- [ ] Implement `executeCompaction` with per-file atomic writes and archive companion append-merge — maps to acceptance criterion "executeCompaction round-trips active entries byte-identically"
- [ ] Register `forge.skill.knowledge.compact` command in `forgeCoreModule` with all flags — maps to acceptance criterion "forge.skill.knowledge.compact is registered in forgeCoreModule"
- [ ] Create `fo-knowledge-distill` skill with operator-approved distillation process — maps to acceptance criterion "fo-knowledge-distill skill exists with the documented process"
- [ ] Dogfood: run `--all --dry-run` on this monorepo and verify report accuracy — maps to acceptance criterion "A full --all --dry-run on this monorepo reports current state accurately"
- [ ] Stamp RFC-0662 as implemented — maps to all acceptance criteria

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/knowledge/compact.ts` — pure planning + execution functions (`planCompaction`, `executeCompaction`)
- `packages/forge/os/core/core.module.ts` — register `forge.skill.knowledge.compact` command
- `packages/forge/src/tests/compact.test.ts` — unit tests for planning and execution
- `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md` — new skill definition
- `packages/forge/skills/fo/fo-knowledge-distill/` — skill directory

**Dependency:** RFC-0660 is implemented — `packages/forge/src/knowledge/` has `parse.ts`, `serialize.ts`, `schema.ts`, and `index.ts` with `parseKnowledgeFile`, `serializeKnowledgeFile`, and the needed types. This plan imports from that module.

### 2.2 Configuration and data

- `forge.yaml` — document `bindings.knowledge.retentionDays` and `bindings.knowledge.staleDays` override keys (alongside RFC-0661 `bindings.knowledge.budgets`)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add `forge.skill.knowledge.compact` to the OS modules table; document the `fo-knowledge-distill` skill
- `docs/COMMANDS.md` — regenerated via `docs.commands.generate` after command registration

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge test` — must pass with new compact tests
- `pnpm --filter @warpgogol/forge build:check` — must pass
- `pnpm exec site-kernel run rfc.validate --id RFC-0662` — must pass
- `pnpm exec site-kernel run forge.skill.validate --all` — must pass (new skill must validate)
- No pipeline integration — compaction is operator-invoked maintenance, never wired into `build.check` or CI

## 3. Step sequence

### Step 1. Verify RFC-0660 prerequisites

**Goal:** Confirm that RFC-0660's parser, serializer, and schema modules exist and are usable.

**Agent actions:**

- Verify `packages/forge/src/knowledge/` exists with `parse.ts`, `serialize.ts`, `schema.ts`, `index.ts` (RFC-0660 is implemented).
- Verify `parseKnowledgeFile` and `serializeKnowledgeFile` are exported from `packages/forge/src/knowledge/index.ts`.
- Read the exported types (`ParsedKnowledgeFile`, `KnowledgeEntry`, `KnowledgeEntryMeta`, `KnowledgeEntryStatus`, `LegacySection`) to understand the input/output contracts for `planCompaction`.

**Validation:**

- `packages/forge/src/knowledge/` directory exists with `parse.ts`, `serialize.ts`, `schema.ts`, `index.ts`
- `pnpm --filter @warpgogol/forge build:check` passes with the knowledge module

**Completion criterion:** RFC-0660's `parseKnowledgeFile`, `serializeKnowledgeFile`, and related types are importable from `packages/forge/src/knowledge/`

**Human review:** no

---

### Step 2. Implement `planCompaction` pure function

**Goal:** Create the deterministic planning function that computes compaction actions from parsed knowledge files.

**Agent actions:**

- Create `packages/forge/src/knowledge/compact.ts`
- Implement `CompactOptions`, `CompactAction`, `CompactFilePlan` interfaces per RFC-0662 § TypeScript contracts
- Implement `planCompaction(files: ParsedKnowledgeFile[], options: CompactOptions): CompactFilePlan[]` with:
  - Expiry archive: entries with `expiresAt < today` → `archive-expired`
  - Supersession archive: entries with `status: superseded` → `archive-superseded`
  - L0 retention: L0 entries with `created < today - retentionDays` → `archive-l0-retention`
  - L2 staleness: L2 entries with `status: active` and `lastConfirmedAt < today - staleDays` → `mark-stale`
  - Legacy section count per file
- No filesystem access — pure function, injectable `today` for tests

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- Unit tests in Step 5 cover all four action kinds

**Completion criterion:** `planCompaction` is exported and produces correct `CompactFilePlan[]` for all four action kinds

**Human review:** no

---

### Step 3. Implement `executeCompaction` and command handler

**Goal:** Create the execution function and wire it as a kernel command.

**Agent actions:**

- Implement `executeCompaction(plans: CompactFilePlan[], dryRun: boolean): CompactReport` in `compact.ts`:
  - Parse each target file via `parseKnowledgeFile`
  - Refuse to proceed if any file has SKILL-19/SKILL-20 parse issues (exit 1, no writes)
  - Apply actions: move entries to archive companions (parse + append + re-serialize), mark stale in place
  - Per-file atomic writes (staging + rename)
  - Archive companion strategy: parse existing archive, append new entries, re-serialize (round-trip preserves existing content)
- Create command handler in `packages/forge/os/core/core.module.ts` (inline or via imported wrapper):
  - Parse flags: `--skill`, `--all`, `--dry-run`, `--json`, `--retention-days`, `--stale-days`
  - Resolve overrides from `forge.yaml` `bindings.knowledge.retentionDays` / `staleDays` (fallback to defaults: 90)
  - Discover target skills: `--skill <name>` or `--all` (forge + pack skills with `knowledge:` declarations)
  - Call `planCompaction` then `executeCompaction`
  - Return `KernelCommandResult<CompactReport>` with exit codes
- Register command in `forgeCoreModule` with `scope: workspace`, `cacheable: false`

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- Command appears in `pnpm exec site-kernel run forge.skill.list` (or equivalent registry)
- `docs/command-manifest.generated.yaml` regenerated via `command.manifest.generate`

**Completion criterion:** `forge.skill.knowledge.compact` is registered, accepts all documented flags, and produces the documented JSON output shape

**Human review:** no

---

### Step 4. Create `fo-knowledge-distill` skill

**Goal:** Create the AI-assisted distillation skill with operator approval gates.

**Agent actions:**

- Create `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md` with frontmatter:
  ```yaml
  name: fo-knowledge-distill
  description: Distill raw knowledge logs (L0) into durable fix patterns (L1) and learned principles (L2), maintain confirmation counters, and migrate legacy sections — with operator approval on every mutation.
  invocation: user
  category: fo
  concerns: document-only
  dependsOn: ['my-preferences', 'grilling']
  languagePolicy: ref(PREFERENCES.md)
  ```
- Write the 8-step process from RFC-0662 § The fo-knowledge-distill skill:
  1. Scope selection
  2. Read cold material (L0 + archives)
  3. Propose distillations (table format, operator confirms/edits/drops)
  4. Re-confirmation pass (confirmations + 1, stale → active)
  5. Legacy migration (propose structured entry, operator approves)
  6. Write (via serializer, never touch unapproved entries)
  7. Recommend compact
  8. Commit (only mutated knowledge files)
- Include the "Read `PREFERENCES.md`…" instruction (SKILL-09)
- Sync to `.agents/skills/fo-knowledge-distill/SKILL.md`

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --all` passes with the new skill (SKILL-01..18)
- SKILL-13 passes (no knowledge files declared for this skill — it reads others')
- SKILL-10 passes (document-only concern, no code execution instructions)

**Completion criterion:** `fo-knowledge-distill` validates cleanly and is synced to `.agents/skills/`

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Cover planning purity, execution round-trip, and edge cases.

**Agent actions:**

- Create `packages/forge/src/tests/compact.test.ts`:
  - `planCompaction` tests: expiry action with correct reason, supersession action, L0 retention with custom `retentionDays`, L2 staleness with custom `staleDays`, legacy section count
  - `executeCompaction` tests: active entries byte-identical after run, archive companion created on demand, archive companion append-merge preserves existing entries, stale marking in place, dry-run writes nothing
  - Refusal test: file with parse issues → exit 1, no writes
  - PBT: parse → executeCompaction → parse produces identical active entries (round-trip)
- Use `today` injection for deterministic test dates
- Use temp directories with `mkdtempSync` for filesystem tests

**Validation:**

- `pnpm --filter @warpgogol/forge test` passes
- All test cases green

**Completion criterion:** All compact unit tests pass, covering the four action kinds, round-trip, refusal, and dry-run

**Human review:** no

---

### Step 6. Dogfood run and documentation sync

**Goal:** Run the command on this monorepo and update documentation.

**Agent actions:**

- Run `pnpm exec site-kernel run forge.skill.knowledge.compact --all --dry-run --json` on this monorepo
- Verify the report accurately reflects current knowledge file state (legacy sections, archivable entries, stale candidates)
- Update `packages/forge/AGENTS.md`:
  - Add `forge.skill.knowledge.compact` to the `forgeCoreModule` command list in the OS modules table
  - Document the `fo-knowledge-distill` skill in the skills section
- Regenerate `docs/COMMANDS.md` via `docs.commands.generate` (or `pnpm exec tsx` direct import per established pattern)
- Regenerate `docs/command-manifest.generated.yaml` via `command.manifest.generate`

**Validation:**

- `--all --dry-run --json` produces a valid report with no errors
- `packages/forge/AGENTS.md` mentions `forge.skill.knowledge.compact` and `fo-knowledge-distill`
- `docs/COMMANDS.md` includes the new command
- `pnpm exec site-kernel run forge.skill.validate --all` passes

**Completion criterion:** Dry-run report is accurate; documentation artifacts updated; `forge.skill.validate` passes

**Human review:** no

---

### Step 7. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/forge/`) with new command and skill.
- Update affected `docs/*.xml` Compass files if repository-wide semantics changed (likely not needed for a forge-internal command — verify and document if skipped).
- **Verify every file listed in `scope.docs` is updated** — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0662 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0662`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0662`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate --all`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0662` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0662.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0662` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Over-eager archival hiding raw material before distillation | Step 2: 90-day default retention; Step 6: dry-run first; distill reads archives too |
| Stale-marking churn (flapping stale → active) | Step 2: staleness is a trust signal, not a penalty; Step 4: distill skill restores active on re-confirmation |
| Agent misinterpretation: running compact as part of unrelated tasks | Step 4: skill bodies may recommend but not auto-invoke; Step 7: implementation notes forbid pipeline wiring |
| Serializer regressions corrupting live files | Step 5: PBT round-trip test; Step 3: per-file atomic writes; refusal on parse issues |
| Archive companion merge strategy ambiguity | Step 3: parse + append + re-serialize with round-trip guarantee; Step 5: test existing archive entries preserved byte-identically |
| Concurrent compaction runs | Step 3: documented as low-risk; no lock file; operators advised not to run simultaneously |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0662 --reason "..." --invariant "DNA-N"` instead of working around it.
- If RFC-0660's parser/serializer are not yet implemented, implement RFC-0660 first — this RFC cannot proceed without them.
