---
rfcId: RFC-0607
planId: PLAN-RFC-0607-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/rfcs/rfc-0601-add-generated-drift-validate-command-for-content-drift-in-generated-files.md
---

# Implementation Plan: RFC-0607

## 1. Objectives

- [x] Objective 1 — DNA-58 section exists in `docs/architecture-dna.md` after DNA-57 (maps to acceptance criterion 1)
- [x] Objective 2 — DNA-58 text in `architecture-dna.md` matches RFC-0607 Decision section (maps to acceptance criterion 2)
- [x] Objective 3 — DNA-58 enforcement status references RFC-0601 (maps to acceptance criterion 3)
- [x] Objective 4 — RFC-0601 `satisfies` field includes DNA-58 (maps to acceptance criterion 4)
- [ ] Objective 5 — `rfc.validate` passes on RFC-0607 (maps to acceptance criterion 5)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0601 (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

None — this is a policy-only RFC. No commands, no code.

### 2.2 Configuration and data

None — no YAML/JSON/NDJSON changes.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-58 entry already present (line 247-249). Verify text alignment with RFC body.
- `docs/rfcs/rfc-0601-*.md` — `satisfies: [DNA-58]` already set. Verify via `rfc.validate`.

### 2.4 Validation and pipelines

- `rfc.validate RFC-0607` — must pass with zero violations.
- `rfc.validate RFC-0601` — must pass with zero violations.

## 3. Step sequence

### Step 1. Verify DNA-58 entry in architecture-dna.md

**Goal:** Confirm DNA-58 is present, correctly placed, and text matches the RFC.

**Agent actions:**

- Read `docs/architecture-dna.md` and verify DNA-58 section exists after DNA-57.
- Compare DNA-58 text against RFC-0607 Decision section and Invariant text section.
- Confirm enforcement reference to RFC-0601 (`generated.drift.validate`) is present.

**Validation:**

- Visual inspection: DNA-58 at line 247-249, text includes full binary file list, references RFC-0601.

**Completion criterion:** DNA-58 entry exists, text matches RFC body, enforcement references RFC-0601.

**Human review:** no

---

### Step 2. Verify RFC-0601 satisfies field

**Goal:** Confirm RFC-0601 has `satisfies: [DNA-58]`.

**Agent actions:**

- Read `docs/rfcs/rfc-0601-*.md` frontmatter.
- Verify `satisfies` field contains `DNA-58`.

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0601 --json` — must pass.

**Completion criterion:** RFC-0601 `satisfies` includes DNA-58 and `rfc.validate` passes.

**Human review:** no

---

### Step 3. Run rfc.validate on both RFCs

**Goal:** Mechanical validation passes on both RFC-0607 and RFC-0601.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0607 --json`.
- Run `pnpm exec werkstatt run rfc.validate RFC-0601 --json`.
- Fix any violations if found.

**Validation:**

- Both commands exit 0 with `status: pass`.

**Completion criterion:** Zero violations on both RFCs.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, stamp implemented.

**Agent actions:**

- Check off all 6 acceptance criteria with inline `(evidence: ...)` annotations.
- Run `fo-review` via the `skill` tool on all session code changes.
- Run `fo-fix` if review has findings.
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0607 --implementation-commit <sha>`.
- Commit the stamped RFC.

**Validation:**

- `git status` — clean working tree.
- `rfc.validate RFC-0607` — passes.
- Review report exists in `docs/reviews/code/`.

**Completion criterion:** All acceptance criteria checked with evidence; RFC stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0607 --json`
- `pnpm exec werkstatt run rfc.validate RFC-0601 --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0607` in the subject line.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Invariant proliferation | Step 1 verifies DNA-58 is a natural extension, no overlap |
| Dependency chain (RFC-0601 depends on RFC-0607) | Step 2 verifies RFC-0601 satisfies field |
| Agent confusion (DNA-58 vs DNA-18) | Step 1 verifies text explicitly states DNA-18 remains unchanged |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-18, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0607 --reason "..." --invariant "DNA-18"` instead of working around it.
