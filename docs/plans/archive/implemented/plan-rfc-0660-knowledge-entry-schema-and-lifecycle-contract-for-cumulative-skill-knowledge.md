---
rfcId: RFC-0660
planId: PLAN-RFC-0660-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/forge/AGENTS.md
    - packages/forge/skills/shared/writing-great-skills/SKILL.md
    - packages/forge/skills/meta/skill-create/SKILL.md
---

# Implementation Plan: RFC-0660

## 1. Objectives

- [ ] O1 — Create `packages/forge/src/knowledge/` module with tolerant parser, Zod schema, and round-trip serializer (maps to acceptance criteria 1, 2)
- [ ] O2 — Add SKILL-19 (entry schema) and SKILL-20 (identifier uniqueness) validation rules to `forge.skill.validate` (maps to acceptance criterion 4)
- [ ] O3 — Extend `forge.doctor` with legacy-section count reporting (maps to acceptance criterion 5)
- [ ] O4 — Migrate all forge knowledge files to structured format with zero legacy warnings (maps to acceptance criterion 6)
- [ ] O5 — Update `writing-great-skills` and `skill-create` with entry format documentation (maps to acceptance criterion 7)
- [ ] O6 — Add DNA-60 to `docs/architecture-dna.md` and update `packages/forge/AGENTS.md` (maps to acceptance criterion 8)
- [ ] O7 — Property-based test proving parse → serialize → parse losslessness (maps to acceptance criterion 3)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/knowledge/parse.ts` — tolerant markdown parser
- `packages/forge/src/knowledge/schema.ts` — Zod metadata schema + layer refinements
- `packages/forge/src/knowledge/serialize.ts` — round-trip serializer
- `packages/forge/src/knowledge/index.ts` — barrel export
- `packages/forge/src/validators/skill-validate.ts` — SKILL-19/SKILL-20 rules
- `packages/forge/src/onboarding/doctor.ts` — legacy-section count reporting
- `packages/forge/src/tests/knowledge-parse.test.ts` — parser unit tests
- `packages/forge/src/tests/knowledge-pbt.test.ts` — property-based round-trip test
- `packages/forge/src/tests/skill-validate-knowledge.test.ts` — SKILL-19/SKILL-20 validation tests

### 2.2 Configuration and data

- `packages/forge/skills/fo/fo-memory-sync/qa-log.md` — migrate to structured format
- `packages/forge/skills/fo/fo-memory-sync/fix-patterns.md` — migrate to structured format
- `packages/forge/skills/fo/fo-memory-sync/learned-principles.md` — migrate to structured format
- `packages/forge/skills/fo/fo-session-save/qa-log.md` — migrate to structured format
- `packages/forge/skills/fo/fo-session-save/fix-patterns.md` — migrate to structured format
- `packages/forge/skills/fo/fo-session-save/learned-principles.md` — migrate to structured format
- `packages/forge/skills/shared/grilling/qa-log.md` — migrate to structured format
- `packages/forge/skills/shared/grilling/learned-principles.md` — migrate to structured format
- `.agents/skills/` — synced copies of migrated knowledge files (committed alongside source)

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — add DNA-60 invariant
- `packages/forge/AGENTS.md` — Skills section: document SKILL-19/SKILL-20 alongside SKILL-13
- `packages/forge/skills/shared/writing-great-skills/SKILL.md` — § Cumulative knowledge pattern: add entry format contract
- `packages/forge/skills/meta/skill-create/SKILL.md` — add knowledge file authoring guidance

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — typecheck
- `pnpm --filter @warpgogol/forge run test` — unit + PBT tests
- `pnpm exec site-kernel run forge.skill.validate --all` — all skills pass with zero legacy warnings
- `pnpm exec site-kernel run forge.doctor --json` — reports zero legacy sections

## 3. Step sequence

### Step 1. Create knowledge module — schema and types

**Goal:** Establish the TypeScript contracts and Zod schema for knowledge entry metadata.

**Agent actions:**

- Create `packages/forge/src/knowledge/schema.ts` with `KnowledgeLayer`, `KnowledgeEntryStatus` types, `KnowledgeEntryMeta` interface, and `knowledgeEntryMetaSchema` Zod schema with layer-specific refinements (L0: id/layer/created/status required, confirmations/lastConfirmedAt forbidden; L1: supersedes allowed, confirmations forbidden; L2: all fields allowed, confirmations/lastConfirmedAt required)
- Create `packages/forge/src/knowledge/index.ts` barrel exporting types and schema
- Ensure no `@warpgogol/*` imports (forge autonomy guard)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `schema.ts` exports `knowledgeEntryMetaSchema` with layer-specific refinements; typecheck passes

**Human review:** no

---

### Step 2. Create knowledge module — parser

**Goal:** Implement the tolerant markdown parser that produces `ParsedKnowledgeFile` with entries, legacy sections, and parse issues.

**Agent actions:**

- Create `packages/forge/src/knowledge/parse.ts` with `parseKnowledgeFile(path: string)` function
- Parser logic: read file → extract preamble (content before first `### K-NNNN` heading) → scan for `### K-NNNN: title` headings → extract `knowledge-entry` fenced YAML block immediately after heading → parse YAML via Zod → collect freeform body until next heading or EOF → non-matching content becomes `LegacySection`
- Determine layer: check `<!-- knowledge-layer: LX -->` preamble comment, fall back to filename mapping (`qa-log.md`→L0, `fix-patterns.md`→L1, `learned-principles.md`→L2)
- Knowledge-adjacent files (no `### K-NNNN` headings and no `<!-- knowledge-layer: -->` preamble) return empty entries, empty legacy sections, and no parse issues — they are exempt
- Tolerant: never throw; malformed entries surface as `ParseIssue` with 1-based line numbers
- Export `ParsedKnowledgeFile`, `KnowledgeEntry`, `LegacySection`, `ParseIssue` types from index

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `parseKnowledgeFile` returns entries, legacySections, parseIssues, and layer; never throws on malformed input

**Human review:** no

---

### Step 3. Create knowledge module — serializer

**Goal:** Implement the round-trip serializer that reconstructs markdown from `ParsedKnowledgeFile`.

**Agent actions:**

- Create `packages/forge/src/knowledge/serialize.ts` with `serializeKnowledgeFile(parsed: ParsedKnowledgeFile): string`
- Serializer: write preamble → for each entry, write `### K-NNNN: title` heading, fenced `knowledge-entry` YAML block (fields in schema order), freeform body → for legacy sections, write opaque text
- Ensure field ordering in YAML output is deterministic (matches schema table order: id, layer, created, lastConfirmedAt, confirmations, expiresAt, supersedes, promotedTo, status)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `serializeKnowledgeFile` produces valid markdown that re-parses to identical metadata

**Human review:** no

---

### Step 4. Implement SKILL-19/SKILL-20, doctor legacy counts, and migrate all forge knowledge files

**Goal:** Wire the knowledge entry parser into `forge.skill.validate` with two new validation rules, extend `forge.doctor` with legacy-section reporting, and migrate all forge knowledge files to structured format — all in one commit so `forge.skill.validate` never produces legacy warnings on forge's own knowledge files.

**Agent actions:**

- In `packages/forge/src/validators/skill-validate.ts`, after the existing SKILL-13 block, add SKILL-19 and SKILL-20 checks:
  - SKILL-19 (entry schema): for each knowledge file declared in `knowledge:` frontmatter, call `parseKnowledgeFile`; for each `parseIssue`, emit a violation with `severity: error`; for legacy sections, emit one aggregated warning per file with `severity: warning` and message "N legacy sections predate RFC-0660 — run the knowledge compaction command to migrate"
  - SKILL-20 (identifier uniqueness): check entry ids match `^K-\d{4}$`, are unique within file, `supersedes` references resolve to entries in same file, `promotedTo` matches `^shared/K-\d{4}$`; violations are errors
  - Skip both rules for knowledge-adjacent files (parser returns empty entries and no parse issues)
  - Extend the `Violation` type with optional `file` and `severity` fields if not already present
- In `packages/forge/src/onboarding/doctor.ts`, after the existing stale knowledge file check, add a scan that calls `parseKnowledgeFile` on each declared knowledge file and sums legacy section counts across all skills. Report as informational output (warning severity, not failure): "N legacy sections across M knowledge files — run the knowledge compaction command to migrate". Non-fatal: `forge.doctor` exit code is unaffected.
- Migrate all forge knowledge files to structured format:
  - For each knowledge file under `packages/forge/skills/` that contains entries (not knowledge-adjacent files): read existing content, identify existing entries (Q&A pairs in qa-log.md, fix patterns in fix-patterns.md, principles in learned-principles.md), convert each entry to structured format: `### K-NNNN: title` + `knowledge-entry` YAML block + body, assign K-NNNN ids sequentially starting from K-0001, for L2 entries extract existing `confirmations: N` prose into metadata field, preserve preamble
  - `forge-bootstrap` knowledge files (`forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md`) are knowledge-adjacent — leave unchanged
  - Manually copy migrated files to `.agents/skills/` and commit both source and synced copies in the same commit (per AGENTS.md guidance)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec site-kernel run forge.skill.validate --all --json` — zero SKILL-19/SKILL-20 errors, zero legacy-section warnings on forge's own knowledge files
- `pnpm exec site-kernel run forge.doctor --json` — reports zero legacy sections

**Completion criterion:** SKILL-19/SKILL-20 violations appear in `forge.skill.validate --json` output with correct severity, file, and line fields; `forge.doctor --json` reports legacy-section counts as informational output; all forge knowledge files validate with zero legacy warnings

**Human review:** no

---

### Step 5. Write tests — unit and property-based

**Goal:** Create comprehensive tests for the parser, serializer, validation rules, and round-trip property.

**Agent actions:**

- Create `packages/forge/src/tests/knowledge-parse.test.ts`:
  - Test: valid entry with full metadata parses correctly
  - Test: L0 minimal metadata (id, layer, created, status) parses correctly
  - Test: layer-specific forbidden fields produce parse issues (L0 with confirmations, L1 with confirmations)
  - Test: malformed YAML in metadata block produces parse issue with line number, does not throw
  - Test: unparseable heading id (`### K-7: title`) produces parse issue
  - Test: legacy sections are returned as opaque text ranges
  - Test: knowledge-adjacent file (no K-NNNN headings, no layer preamble) returns empty entries, no issues
  - Test: file-layer mapping via filename convention and via `<!-- knowledge-layer: -->` preamble
- Create `packages/forge/src/tests/knowledge-pbt.test.ts`:
  - Property: parse → serialize → parse produces identical metadata for generated valid files
  - Use fast-check to generate valid `KnowledgeEntryMeta` objects with layer-appropriate fields
  - Generate markdown from valid entries, parse, serialize, re-parse, assert deep equality
- Create `packages/forge/src/tests/skill-validate-knowledge.test.ts`:
  - Test: SKILL-19 error for malformed metadata
  - Test: SKILL-19 warning for legacy sections
  - Test: SKILL-20 error for duplicate ids
  - Test: SKILL-20 error for unresolved supersedes reference
  - Test: SKILL-20 error for malformed promotedTo
  - Test: knowledge-adjacent files produce no SKILL-19/SKILL-20 violations

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** All tests pass; PBT proves round-trip losslessness

**Human review:** no

---

### Step 6. Update documentation — writing-great-skills, skill-create, AGENTS.md, architecture-dna.md

**Goal:** Synchronize all documentation artifacts with the new entry format contract.

**Agent actions:**

- Update `packages/forge/skills/shared/writing-great-skills/SKILL.md` § Cumulative knowledge pattern:
  - Add "Entry format" subsection documenting `### K-NNNN: title` + `knowledge-entry` YAML block + body
  - Add metadata schema table (field, type, required, layers, meaning)
  - Add layer-specific rules (L0/L1/L2 required/forbidden fields)
  - Add knowledge-adjacent file exemption
  - Update confidence progression to reference metadata `confirmations` field
- Update `packages/forge/skills/meta/skill-create/SKILL.md`:
  - Add knowledge file authoring guidance: structured entry format, id allocation (`max+1`), layer-specific fields
- Update `packages/forge/AGENTS.md` Skills section:
  - Document SKILL-19 (entry schema) and SKILL-20 (identifier uniqueness) alongside SKILL-13
- Update `docs/architecture-dna.md`:
  - Add DNA-60: "Cumulative skill knowledge has a schema-backed lifecycle — structured entries, budgeted layers, explicit compaction, and audited promotion. Enforced by `forge.skill.validate` (SKILL-19, SKILL-20). Established by RFC-0660."
- Sync updated `writing-great-skills` and `skill-create` SKILL.md files to `.agents/skills/`

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --all` passes (SKILL-11/SKILL-17 still pass on updated skill files)
- `git diff` shows all `scope.docs` files modified

**Completion criterion:** All scope docs updated; `forge.skill.validate` passes on updated skill files

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0660 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0660`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0660`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate --all --json`
- `pnpm exec site-kernel run forge.doctor --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0660` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0660.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0660` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on hand-edited entries | Step 2: tolerant parser with precise line-numbered errors; Step 5: tests cover hand-edited edge cases |
| Agent misinterpretation: agents write entries without metadata | Step 6: `writing-great-skills` update makes format the single documented one; Step 4: SKILL-19 catches violations at validation time |
| Id allocation races when two agents append concurrently | Step 4: SKILL-20 catches duplicate ids on next validation — deterministic, never silent |
| Parser drift between parse and serialize breaking round-trips | Step 5: PBT proves parse → serialize → parse identity; Step 3: deterministic field ordering in serializer |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0660 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the parser cannot handle a knowledge file format without throwing, expand the tolerant parser rather than adding special-case bypasses.
