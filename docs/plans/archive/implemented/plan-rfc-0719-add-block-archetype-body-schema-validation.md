---
rfcId: RFC-0719
planId: PLAN-RFC-0719-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/src/command-tables/03-page-runtime.ts
---

# Implementation Plan: RFC-0719

## 1. Objectives

- [ ] O1 — Verify B-07 implementation in `page-block.ts` matches RFC design (maps to AC: B-07 violation emitted on kind mismatch)
- [ ] O2 — Add unit tests for B-07 covering mismatch, composite skip, missing body, and valid match (maps to AC: B-07 does not fire for composite/missing body; valid blocks pass)
- [ ] O3 — Update command table description to mention B-07 (maps to AC: diagnostic message includes expected bodyKind from section manifest)
- [ ] O4 — Run validation suite and stamp implemented (maps to AC: all criteria verified)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/page-block.ts` — B-07 check already implemented (lines 332-349). Verify only, no changes expected.
- `packages/os/site-kernel-checks/src/command-tables/03-page-runtime.ts` — update `page.block.validate` description to mention B-07 body.kind validation (line 28-29).

### 2.2 Configuration and data

- None. The existing JSON Schema fragments in `packages/ontology/src/shared-section-props/body-fragments.ts` are the source of truth and are not modified.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/src/command-tables/03-page-runtime.ts` — command description update.
- No `AGENTS.md` changes needed — `page-block.ts` is already listed in the module table of `packages/os/site-kernel-checks/AGENTS.md`.
- No `docs/*.xml` Compass changes — no repository-wide semantics changed.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `page.block.validate` already runs in `build.check` pipeline. No pipeline changes.
- No CI workflow changes.

## 3. Step sequence

### Step 1. Verify existing B-07 implementation

**Goal:** Confirm the B-07 check in `page-block.ts:332-349` matches the RFC design.

**Agent actions:**

- Read `packages/os/site-kernel-checks/src/page-block.ts` lines 332-349.
- Verify the check extracts `expectedBodyKind` from `schemaDef.propsSchema.properties.body.properties.kind.const`.
- Verify the check reads `actualBodyKind` from `sectionProps.body.kind`.
- Verify the check only fires when both are present and differ.
- Verify the MODULE_CONTRACT (line 14) documents B-07 and CHANGE_SUMMARY (line 23) references RFC-0719.

**Validation:**

- Visual inspection confirms code matches RFC Design section.

**Completion criterion:** B-07 code matches RFC design exactly — no changes needed.

**Human review:** no

---

### Step 2. Update command table description

**Goal:** Update `page.block.validate` command description to mention B-07.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/command-tables/03-page-runtime.ts` line 28-29.
- Append `B-07: body.kind matches archetype bodyKind (RFC-0719).` to the description string.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes.

**Completion criterion:** Command description mentions B-07 and RFC-0719.

**Human review:** no

---

### Step 3. Add unit tests for B-07

**Goal:** Add unit tests covering B-07 positive and negative cases.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/rfc-0719-body-kind-validate.test.ts`.
- Test case 1: `body.kind` matches expected — no B-07 violation.
- Test case 2: `body.kind` mismatches expected — B-07 violation emitted.
- Test case 3: Composite archetype (no body fragment) — no B-07 violation.
- Test case 4: Missing `body` field — no B-07 violation (B-03 catches it).
- Use the fixture pattern from `page-blocks-validate.test.ts`: temp dir, `system.md`, page markdown.
- Create fixture manifest YAML files in a temp `packages/ui/src/sections/` directory structure so `getSectionPropsSchema` resolves real composed schemas through `composeManifestPropsSchema`. This tests the full integration path: manifest → composed schema → B-07 check.
- Each test case creates a section manifest with `propsSchemaCompose: [body-list]` or `[body-paragraphs]` etc., plus the required archetype YAML in `packages/ontology/archetypes/sections/`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` passes with new tests.

**Completion criterion:** All 4 test cases pass.

**Human review:** no

---

### Step 4. Run validation suite

**Goal:** Run all required validations before stamping.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0719 --json` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` — must pass.
- Run `pnpm exec werkstatt run command.manifest.generate` — regenerate manifest after command description change.
- Run `pnpm exec werkstatt run docs.commands.generate` — regenerate COMMANDS.md.

**Validation:**

- All commands exit 0.

**Completion criterion:** All validation commands pass.

**Human review:** no

---

### Step 5. Check off acceptance criteria and stamp implemented

**Goal:** Verify all acceptance criteria, run review/fix, stamp RFC as implemented.

**Agent actions:**

- Check off all 6 acceptance criteria in the RFC with `[x]` and inline `(evidence: <file:line>)` annotations.
- Run `fo-review` via the `skill` tool on all session code changes.
- Run `fo-fix` if review findings exist. Re-run `fo-review` to confirm. Max 3 iterations.
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0719 --implementation-commit <sha>` to transition `accepted → implemented`.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0719` to confirm implemented status passes validation (V-25 reviewers, V-26 criteria checked).

**Validation:**

- `rfc.validate --id RFC-0719` passes with exitCode 0.
- `git status` — no uncommitted changes from session.
- Review report exists in `docs/reviews/code/`.

**Completion criterion:** RFC is stamped as `implemented`; all criteria checked with evidence; review passed.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0719`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0719` in the subject line.
- No `rfc.verification.emit` needed — RFC has no `acceptance` probes in frontmatter.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for custom archetypes | Step 3 test case 3 verifies composite archetypes are skipped |
| Agent misinterpretation (B-07 vs B-03) | Step 2 updates command description to name B-07 explicitly |
| Performance | Step 1 verifies O(1) const lookup — no additional I/O |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0719 --reason "..." --invariant "DNA-24"` instead of working around it.
