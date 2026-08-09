---
rfcId: RFC-0663
planId: PLAN-RFC-0663-01
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

# Implementation Plan: RFC-0663

## 1. Objectives

- [ ] Extend RFC-0660 schema and serializer with `promotedFrom` field — maps to acceptance criterion "planPromotion builds shared entries with promotedFrom provenance" (prerequisite: without schema support, `promotedFrom` is silently stripped on parse and never written on serialize)
- [ ] Implement `detectDuplicatePrinciples` pure function with exact and bounded containment matching — maps to acceptance criterion "detectDuplicatePrinciples reports exact and containment pairs"
- [ ] Implement `planPromotion` pure function with summed confirmations and `promotedFrom` provenance — maps to acceptance criterion "planPromotion builds shared entries with summed confirmations and promotedFrom provenance"
- [ ] Add `knowledge-duplicate` warnings to `forge.doctor` and `checkSharedKnowledgeFile()` validation — maps to acceptance criterion "forge.doctor emits knowledge-duplicate informational warnings"
- [ ] Create the shared knowledge layer file and wire `syncSharedKnowledge()` into `forge.create` and `forge.upgrade` — maps to acceptance criterion "Shared layer file exists, syncs via forge.create, ships empty to npm"
- [ ] Extend `fo-knowledge-distill` with the promotion protocol steps — maps to acceptance criterion "fo-knowledge-distill contains the promotion protocol steps"
- [ ] Document the shared layer as the fourth tier in `writing-great-skills` — maps to acceptance criterion "writing-great-skills documents the shared layer as the fourth tier"
- [ ] Dogfood: run detection on this monorepo; promote if duplicates found — maps to acceptance criterion "At least one real duplicate pair promoted end-to-end" (conditional: if no duplicates exist, detection pipeline runs end-to-end as evidence)
- [ ] Stamp RFC-0663 as implemented — maps to all acceptance criteria

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/knowledge/schema.ts` — extend `knowledgeEntryMetaSchema` with `promotedFrom` field (optional, `z.array(z.string().regex(/^[a-z0-9-]+\/K-\d{4}$/))`); extend `KnowledgeEntryMeta` interface
- `packages/forge/src/knowledge/serialize.ts` — add `promotedFrom` to `FIELD_ORDER` array
- `packages/forge/src/knowledge/promote.ts` — pure functions: `detectDuplicatePrinciples`, `planPromotion`, `normalizeTitle`, types (`DuplicatePair`, `PromotionPlan`)
- `packages/forge/src/knowledge/index.ts` — re-export promote types and functions
- `packages/forge/src/onboarding/doctor.ts` — new `checkKnowledgeDuplicates()` function (warn when duplicates found), new `checkSharedKnowledgeFile()` function (validates shared layer schema/uniqueness), both wired into `runDoctor` checks array
- `packages/forge/src/onboarding/init.ts` — new `syncSharedKnowledge()` step in `runInit`, copies shared layer to `.agents/skills/shared-knowledge/`
- `packages/forge/src/onboarding/upgrade.ts` — new `syncSharedKnowledge()` step in `syncForgeSkills`, keeps `.agents/skills/shared-knowledge/` in sync on upgrade
- `packages/forge/src/tests/promote.test.ts` — unit tests for detection, promotion planning, and edge cases
- `packages/forge/skills/shared/knowledge/learned-principles.md` — shared layer file (source of truth), ships empty to npm
- `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md` — extend with promotion protocol steps
- `packages/forge/skills/shared/writing-great-skills/SKILL.md` — add fourth-tier documentation

**Dependencies (implemented):** RFC-0660 (`parse.ts`, `serialize.ts`, `schema.ts`), RFC-0661 (`budgets.ts`), RFC-0662 (`compact.ts`, `fo-knowledge-distill` skill).

### 2.2 Configuration and data

- `forge.yaml` — document `bindings.knowledge.budgets.shared` override key (alongside RFC-0661 `hot`/`warm`)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — document the shared knowledge layer, `syncSharedKnowledge()`, and the `knowledge-duplicate` doctor check
- `docs/COMMANDS.md` — regenerated via `docs.commands.generate` (no new commands, but `forge.doctor` output changed)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge test` — must pass with new promote tests
- `pnpm --filter @warpgogol/forge build:check` — must pass
- `pnpm exec werkstatt run rfc.validate --id RFC-0663` — must pass
- `pnpm exec werkstatt run forge.skill.validate --all` — must pass (extended `fo-knowledge-distill` and `writing-great-skills` must validate)
- No pipeline integration — `knowledge-duplicate` warnings are informational, never affect doctor's exit status

## 3. Step sequence

### Step 1. Verify prerequisites

**Goal:** Confirm RFC-0660/0661/0662 dependencies are implemented and the knowledge module is usable.

**Agent actions:**

- Verify `packages/forge/src/knowledge/` has `parse.ts`, `serialize.ts`, `schema.ts`, `budgets.ts`, `compact.ts`, `index.ts`
- Verify `parseKnowledgeFile`, `serializeKnowledgeFile`, `ParsedKnowledgeFile`, `KnowledgeEntry` are exported from `index.ts`
- Verify `fo-knowledge-distill` skill exists at `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md`
- Read `ParsedKnowledgeFile` and `KnowledgeEntry` types to understand the input contracts for detection and promotion

**Validation:**

- `packages/forge/src/knowledge/` directory exists with all modules
- `pnpm --filter @warpgogol/forge build:check` passes with the knowledge module

**Completion criterion:** RFC-0660/0661/0662 modules are importable from `packages/forge/src/knowledge/`

**Human review:** no

---

### Step 2. Extend schema and serializer with `promotedFrom`

**Goal:** Add the `promotedFrom` field to the RFC-0660 schema and serializer so shared-layer entries can carry provenance metadata.

**Agent actions:**

- Edit `packages/forge/src/knowledge/schema.ts`:
  - Add `promotedFrom` to `baseMetaSchema`: `promotedFrom: z.array(z.string().regex(/^[a-z0-9-]+\/K-\d{4}$/)).optional()`
  - Pattern: `^<skill-name>/K-NNNN$` (e.g., `grilling/K-0001`, `fo-session-save/K-0003`)
  - Add `promotedFrom?: string[]` to `KnowledgeEntryMeta` interface
  - Add `<!-- RFC-0663 -->` to `CHANGE_SUMMARY` block
- Edit `packages/forge/src/knowledge/serialize.ts`:
  - Add `"promotedFrom"` to `FIELD_ORDER` array (after `"promotedTo"`, before `"status"`)
  - Add `<!-- RFC-0663 -->` to `CHANGE_SUMMARY` block
- Verify existing tests still pass — `promotedFrom` is optional, so all existing entries without it parse and serialize unchanged

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- `pnpm --filter @warpgogol/forge test` passes (existing tests unaffected — `promotedFrom` is optional)
- Round-trip test: parse → serialize → parse produces identical results for entries with and without `promotedFrom`

**Completion criterion:** `promotedFrom` is in the Zod schema, `KnowledgeEntryMeta` interface, and `FIELD_ORDER`; existing tests pass

**Human review:** no

---

### Step 3. Implement `detectDuplicatePrinciples` pure function

**Goal:** Create the deterministic duplicate detection function with normalized-title matching.

**Agent actions:**

- Create `packages/forge/src/knowledge/promote.ts`
- Implement `normalizeTitle(title: string): string`:
  - Lowercase
  - Strip punctuation and emoji
  - Collapse whitespace
  - Drop stop-words (`the`, `a` — but keep `always`, `never` as they carry meaning)
- Implement `DuplicatePair` interface per RFC-0663 § TypeScript contracts:
  ```ts
  interface DuplicatePair {
    a: { skill: string; entryId: string; title: string };
    b: { skill: string; entryId: string; title: string };
    normalizedTitle: string;
    kind: "exact" | "containment";
  }
  ```
- Implement `detectDuplicatePrinciples(files: Array<{ skill: string; parsed: ParsedKnowledgeFile }>): DuplicatePair[]`:
  - Parse every skill's L2 file via `parseKnowledgeFile` (forge skills + pack skills + shared layer)
  - Normalize each active entry's title
  - Report pairs where normalized titles are identical (`kind: "exact"`)
  - Report pairs where one normalized title is a substring of the other (`kind: "containment"`), bounded: shorter title must be ≥ 20 characters AND ≥ 60% of the longer title's length
  - Exclude pairs already linked by `promotedTo`/`supersedes`
  - Exclude entries with `status: stale`, `status: archived`, or `promotedTo` set
- No filesystem access — pure function

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- Unit tests in Step 8 cover exact, containment, bounded containment, and exclusion cases

**Completion criterion:** `detectDuplicatePrinciples` is exported and produces correct `DuplicatePair[]` for exact and bounded containment matches

**Human review:** no

---

### Step 4. Implement `planPromotion` pure function

**Goal:** Create the promotion planning function that builds the shared entry and local pointer rewrites.

**Agent actions:**

- Implement `PromotionPlan` interface per RFC-0663 § TypeScript contracts:
  ```ts
  interface PromotionPlan {
    sharedEntry: KnowledgeEntry;
    localPointers: Array<{ skill: string; file: string; entryId: string }>;
  }
  ```
- Implement `planPromotion(sources, merged, nextSharedId, today): PromotionPlan`:
  - Build `sharedEntry` with:
    - `id: nextSharedId` (e.g. `K-0001`)
    - `layer: L2`
    - `created: today`
    - `lastConfirmedAt: today`
    - `confirmations`: sum of all source entries' confirmations
    - `status: active`
    - `promotedFrom: ["<skill>/K-NNNN", ...]` provenance
    - `title`: merged title
    - `body`: merged body
  - Build `localPointers` array: one per source entry, naming the skill, file, and entryId to rewrite
- No filesystem access — pure function

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- Unit tests in Step 8 cover summed confirmations, `promotedFrom` provenance, and pointer list

**Completion criterion:** `planPromotion` is exported and produces correct `PromotionPlan` with summed confirmations and `promotedFrom` provenance

**Human review:** no

---

### Step 5. Add `knowledge-duplicate` warnings and shared-layer validation to `forge.doctor`

**Goal:** Wire duplicate detection and shared-layer validation into doctor.

**Agent actions:**

- Add `checkKnowledgeDuplicates(workspaceRoot, forgeRoot): DoctorCheck` to `packages/forge/src/onboarding/doctor.ts`:
  - Discover all L2 knowledge files (forge skills + pack skills + shared layer)
  - Parse each via `parseKnowledgeFile`
  - Call `detectDuplicatePrinciples` on the parsed files
  - Return a `DoctorCheck` with `status: "warn"` when duplicates found, `"pass"` when none:
    - `name: "knowledge-duplicates"`
    - `message`: "No cross-skill duplicate principles detected" or "N duplicate pair(s) detected — run fo-knowledge-distill to promote"
  - `warn` does not affect doctor's exit status (only `fail` does) — consistent with RFC-0661 SKILL-21 budget warnings
  - For `--json` output, include the `DuplicatePair[]` in the check's data (extend `DoctorCheck` with optional `details?: unknown` field if needed, or add to the result's `data` object)
- Add `checkSharedKnowledgeFile(workspaceRoot, forgeRoot): DoctorCheck` to `packages/forge/src/onboarding/doctor.ts`:
  - Parse the shared layer file (`packages/forge/skills/shared/knowledge/learned-principles.md`) via `parseKnowledgeFile`
  - Check SKILL-19 (schema validity — report `parseIssues` as errors) and SKILL-20 (entry id uniqueness) directly, since the shared layer is not inside a skill directory and is not reached by `forge.skill.validate`
  - Return a `DoctorCheck` with `status: "pass"` or `"fail"` (schema violations are errors, not warnings)
  - `name: "shared-knowledge-file"`
- Wire both `checkKnowledgeDuplicates` and `checkSharedKnowledgeFile` into the `runDoctor` checks array, after `checkKnowledgeBudgets`
- Add `<!-- RFC-0663 -->` to the `CHANGE_SUMMARY` block in `doctor.ts`

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- `pnpm exec werkstatt run forge.doctor --json` includes `knowledge-duplicates` and `shared-knowledge-file` checks
- Doctor's exit status is unaffected by duplicate detection (`warn`); shared-layer schema violations produce `fail`

**Completion criterion:** `forge.doctor` emits `knowledge-duplicate` warnings with promotion fixHints; shared-layer file validated for schema/id uniqueness; exit status unaffected by duplicates

**Human review:** no

---

### Step 6. Create shared layer and wire `syncSharedKnowledge()`

**Goal:** Create the shared knowledge layer file and extend `forge.create`/`forge.upgrade` to sync it.

**Agent actions:**

- Create `packages/forge/skills/shared/knowledge/learned-principles.md`:
  - Empty template (preamble only — no entries)
  - Layer marker: `<!-- knowledge-layer: L2 -->`
  - File heading: `# learned-principles.md (shared)`
  - Ships empty to npm — accumulated promotions are project-specific
- Add `syncSharedKnowledge()` to `packages/forge/src/onboarding/init.ts`:
  - Source: `packages/forge/skills/shared/knowledge/learned-principles.md`
  - Destination: `.agents/skills/shared-knowledge/learned-principles.md`
  - Create destination directory on demand
  - Call after the forge skills sync loop in `runInit`
- Add `syncSharedKnowledge()` to `packages/forge/src/onboarding/upgrade.ts`:
  - Same source/destination
  - Call after the forge skills sync loop in `syncForgeSkills`
- Add `<!-- RFC-0663 -->` to `CHANGE_SUMMARY` blocks in both files

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- `packages/forge/skills/shared/knowledge/learned-principles.md` exists with preamble only
- `forge.create` syncs the shared layer to `.agents/skills/shared-knowledge/learned-principles.md`

**Completion criterion:** Shared layer file exists at `packages/forge/skills/shared/knowledge/learned-principles.md`, syncs via `forge.create` and `forge.upgrade`, ships empty to npm

**Human review:** no

---

### Step 7. Extend `fo-knowledge-distill` with promotion protocol

**Goal:** Add the cross-skill promotion protocol steps to the distill skill.

**Agent actions:**

- Edit `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md`:
  - Add a new section "## Cross-skill promotion" after the existing process
  - Document the 5-step promotion protocol from RFC-0663 § Promotion protocol:
    1. Present the pair — both titles, bodies, confirmations, proposed merged shared entry. Operator approves/edits/rejects via grilling.
    2. Write the shared entry — append to shared layer with next `K-NNNN` id, `status: active`, `created: today`, `lastConfirmedAt: today`.
    3. Rewrite local copies — each skill-local entry: `promotedTo: shared/K-NNNN`, `status: superseded`; body replaced with one-line reference.
    4. Cite, don't copy — future distill runs reference the shared id.
    5. Commit — shared file + all touched skill files in one commit.
  - Add constraint: "Promotion requires operator approval inside grilling — detection is deterministic, promotion is human."
  - Add constraint: "Never copy shared-layer content into skill-local files — cite via `shared/K-NNNN`."
  - Add constraint: "Never promote project-specific knowledge from pack skills into the forge shared layer — domain-neutrality is checked during grilling."
- Sync the updated skill to `.agents/skills/fo-knowledge-distill/SKILL.md`

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` passes with the extended skill (SKILL-01..21)
- SKILL-17 passes (no platform RFC/ADR ids in the skill body — reference "RFC-0663" only in the process description, not in instruction lines)

**Completion criterion:** `fo-knowledge-distill` contains the promotion protocol steps; every promotion requires operator approval; skill validates cleanly

**Human review:** no

---

### Step 8. Write unit tests

**Goal:** Cover detection, promotion planning, and edge cases.

**Agent actions:**

- Create `packages/forge/src/tests/promote.test.ts`:
  - `normalizeTitle` tests: lowercasing, punctuation stripping, whitespace collapse, stop-word dropping, `always`/`never` preserved
  - `detectDuplicatePrinciples` tests:
    - Exact match: two entries with identical normalized titles → `kind: "exact"`
    - Containment match: one title is substring of other, shorter ≥ 20 chars and ≥ 60% → `kind: "containment"`
    - Containment bounded: shorter title < 20 chars → no match
    - Containment bounded: shorter title < 60% of longer → no match
    - Exclusion: pairs linked by `promotedTo` → excluded
    - Exclusion: pairs linked by `supersedes` → excluded
    - Exclusion: entries with `status: stale` or `status: archived` → excluded
    - Multiple skills: detection across 3+ skills
  - `planPromotion` tests:
    - Summed confirmations: two sources with confirmations 3 and 5 → shared entry has confirmations 8
    - `promotedFrom` provenance: lists all source skill/id pairs
    - Pointer list: one pointer per source entry
    - Shared entry metadata: `status: active`, `created: today`, `lastConfirmedAt: today`
- Use `today` injection for deterministic test dates
- Use fixture `ParsedKnowledgeFile` objects — no filesystem access needed
- Add schema tests: `promotedFrom` field parses correctly, round-trips through serializer, and rejects invalid patterns

**Validation:**

- `pnpm --filter @warpgogol/forge test` passes
- All test cases green

**Completion criterion:** All promote unit tests pass, covering exact/containment detection, bounded containment, exclusions, promotion planning, and `promotedFrom` schema/serialization

**Human review:** no

---

### Step 9. Document fourth tier in `writing-great-skills`

**Goal:** Add the shared layer as the fourth tier of the cumulative knowledge pattern.

**Agent actions:**

- Edit `packages/forge/skills/shared/writing-great-skills/SKILL.md`:
  - Update § Cumulative knowledge pattern to mention the fourth tier
  - Add a subsection "### Shared layer (L2, cross-skill)" after the three-layer reference pattern:
    - Path: `packages/forge/skills/shared/knowledge/learned-principles.md`
    - Format: RFC-0660 structured entries with `shared/K-NNNN` ids
    - Promotion: via `fo-knowledge-distill` under operator grilling
    - Detection: `forge.doctor` reports cross-skill duplicates
    - Consumption: knowledge-adopting skills read the shared layer at run start
  - Update the three-layer reference pattern heading to note it is "three skill-local layers plus one shared layer"
- Sync the updated skill to `.agents/skills/writing-great-skills/SKILL.md`

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` passes with the updated skill

**Completion criterion:** `writing-great-skills` documents the shared layer as the fourth tier of the cumulative knowledge pattern

**Human review:** no

---

### Step 10. Dogfood: detect and promote a real duplicate pair

**Goal:** Run the full detection → promotion loop end-to-end on this monorepo.

**Agent actions:**

- Run `pnpm exec werkstatt run forge.doctor --json` on this monorepo
- Check the `knowledge-duplicates` check for detected pairs
- If duplicate pairs are found:
  - Present them to the operator via `ask_user_question`
  - For each approved pair, run the promotion protocol via `fo-knowledge-distill`:
    - Write the shared entry to `packages/forge/skills/shared/knowledge/learned-principles.md`
    - Rewrite each skill-local copy to a pointer entry (`promotedTo: shared/K-NNNN`, `status: superseded`)
    - Commit shared file + all touched skill files in one commit
- If no duplicate pairs are found:
  - Document this in the session summary
  - The dogfood criterion is met by the detection pipeline running end-to-end (detection → doctor report → zero duplicates). Promotion is verified by unit tests in Step 8. This is a conditional criterion: the current monorepo has very few L2 entries across skills, and real duplicates are unlikely.

**Validation:**

- `forge.doctor --json` includes the `knowledge-duplicates` check
- If promoted: shared layer has the new entry; skill-local files have pointer entries
- `pnpm exec werkstatt run forge.skill.validate --all` passes after promotion

**Completion criterion:** Detection pipeline ran end-to-end on this monorepo. If duplicates found: at least one promoted with operator approval. If none found: documented and detection verified.

**Human review:** yes — the operator must approve each promotion via grilling inside `fo-knowledge-distill`. This is the core governance gate.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/forge/AGENTS.md`:
  - Add `knowledge-duplicates` to the doctor check list
  - Document `syncSharedKnowledge()` in the init/upgrade section
  - Document the shared knowledge layer in the knowledge section
- Regenerate `docs/COMMANDS.md` via `docs.commands.generate` (no new commands, but `forge.doctor` output changed)
- Regenerate `docs/command-manifest.generated.yaml` via `command.manifest.generate`
- **Verify every file listed in `scope.docs` is updated** — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0663 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0663`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0663`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run forge.skill.validate --all`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0663` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0663.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0663` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `promotedFrom` silently stripped by Zod parser, never written by serializer | Step 2: extend schema.ts and serialize.ts before any logic depends on the field |
| False-positive duplicate reports (different principles with similar titles) | Step 3: containment matching bounded (≥ 20 chars, ≥ 60% length ratio); Step 10: operator rejects bad pairs during grilling — detection proposes, never acts |
| False negatives (same principle, differently worded titles) | Step 3: accepted as a trade-off — deterministic detection trades recall for precision; distill-run meta-analysis catches misses |
| Premature promotion freezing a skill-specific principle | Step 10: grilling includes the portability question ("is this principle genuinely cross-skill?"); Step 7: promotion protocol requires operator approval |
| Agent misinterpretation: citing shared ids that don't exist | Step 7: SKILL-20 validates `promotedTo` format; Step 5: `checkSharedKnowledgeFile()` validates shared layer schema/id uniqueness |
| Shared layer not validated by SKILL-19/SKILL-20 (not inside a skill directory) | Step 5: dedicated `checkSharedKnowledgeFile()` in doctor.ts validates schema and id uniqueness directly |
| `forge.create`/`forge.upgrade` sync gap for non-skill `shared/knowledge/` directory | Step 6: dedicated `syncSharedKnowledge()` step in both `init.ts` and `upgrade.ts` — explicitly handles the non-skill directory |
| Containment matching false positives for short generic titles | Step 3: bounded containment (min 20 chars, 60% length ratio); Step 8: unit tests verify bounds |
| Dogfood finds no real duplicates (current monorepo has few L2 entries) | Step 10: conditional dogfood — detection pipeline runs end-to-end as evidence; promotion verified by unit tests in Step 8 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0663 --reason "..." --invariant "DNA-N"` instead of working around it.
- If RFC-0660's parser/serializer or RFC-0662's distill skill are not yet implemented, implement those first — this RFC cannot proceed without them.
- If the `shared/knowledge/` directory cannot be synced by `forge.create` without breaking the existing skill sync loop, create a separate sync path rather than modifying the skill discovery logic.
- If extending the RFC-0660 schema with `promotedFrom` breaks existing round-trip tests, the field may need to be in a separate schema extension (e.g., `knowledgeEntryMetaSchemaV2`) — but this is unlikely since the field is optional.
