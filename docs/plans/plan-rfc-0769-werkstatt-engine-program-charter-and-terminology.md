---
rfcId: RFC-0769
planId: PLAN-RFC-0769-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - docs/architecture-dna.md
    - AGENTS.md
---

# Implementation Plan: RFC-0769

## 1. Objectives

- [ ] Objective 1 — append DNA-64 entry to `docs/architecture-dna.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — add "Werkstatt engine program" section to root `AGENTS.md` with terminology and package taxonomy (maps to acceptance criterion 2)
- [ ] Objective 3 — verify all downstream RFCs (RFC-0770..0779) exist in draft with `related: [RFC-0769]` (maps to acceptance criterion 3; already satisfied)
- [ ] Objective 4 — `rfc.validate` passes on RFC-0769 (maps to acceptance criterion 4; already satisfied)

## 2. Affected artifacts

### 2.1 Code and commands

None — this is a charter (prose-only). No CLI surface, no packages, no commands.

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — append `## DNA-64 · Engine/plugin/workshop boundary` entry after DNA-63.
- `AGENTS.md` (root) — add `## Werkstatt engine program (RFC-0769)` section with terminology table and package taxonomy.
- `docs/rfcs/rfc-0769-*.md` — read-only reference; acceptance criteria checked off during final step.

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0769` — mechanical validation.
- `dna.registry.validate` — verifies DNA-64 entry is registered and in sync with the establishing RFC.

## 3. Step sequence

### Step 1. Append DNA-64 to architecture-dna.md

**Goal:** Add the new DNA invariant entry established by RFC-0769.

**Agent actions:**

- Read the last DNA entry (DNA-63) in `docs/architecture-dna.md` to match formatting.
- Append `## DNA-64 · Engine/plugin/workshop boundary` after DNA-63 with the invariant text from RFC-0769 § Architectural fit (DNA-64 paragraph).
- Include `Established by RFC-0769.` at the end of the entry.

**Validation:**

- `rtk grep "DNA-64" docs/architecture-dna.md` — confirms entry exists.
- `rtk pnpm exec site-kernel run dna.registry.validate` — confirms registry sync.

**Completion criterion:** DNA-64 entry exists in `docs/architecture-dna.md` with text matching RFC-0769's invariant description, and `dna.registry.validate` passes.

**Human review:** no

---

### Step 2. Add Werkstatt engine program section to root AGENTS.md

**Goal:** Document the engine/plugin/workshop taxonomy in the root agent guide.

**Agent actions:**

- Append a new `## Werkstatt engine program (RFC-0769)` section at the end of `AGENTS.md`.
- Include the terminology table (Engine, Plugin, Workshop, Project, Stack profile) from RFC-0769 § Terminology.
- Include the package taxonomy table from RFC-0769 § Package taxonomy.
- Include the program principles (dependency inversion, dogfooding, no legacy, publication via repo-extract, workshop layout is stable).
- Reference DNA-64 and the wave plan.

**Validation:**

- `rtk grep "Werkstatt engine program" AGENTS.md` — confirms section exists.
- `rtk grep "DNA-64" AGENTS.md` — confirms DNA-64 reference is present.

**Completion criterion:** Root `AGENTS.md` contains a "Werkstatt engine program" section with terminology, package taxonomy, and program principles matching RFC-0769.

**Human review:** no

---

### Step 3. Verify downstream RFCs and validate

**Goal:** Confirm all downstream RFCs exist and reference RFC-0769, and that mechanical validation passes.

**Agent actions:**

- Verify all 10 downstream RFCs (RFC-0770..0779) exist in `docs/rfcs/` with `status: draft` and `related: [RFC-0769]` — already confirmed during audit.
- Run `rtk pnpm exec site-kernel run rfc.validate --id RFC-0769 --json` — confirm 0 violations.
- Run `rtk pnpm exec site-kernel run dna.registry.validate` — confirm DNA-64 is registered.

**Validation:**

- `rfc.validate` exit code 0.
- `dna.registry.validate` exit code 0.

**Completion criterion:** All downstream RFCs exist with correct `related` references; `rfc.validate` and `dna.registry.validate` both pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp RFC-0769 as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check `docs/architecture-dna.md` and `AGENTS.md` against `git diff`.
- Run `rtk pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (not expected for this charter).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0769 against the implemented changes. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
  - Criterion 1: DNA-64 entry in `docs/architecture-dna.md` — `(evidence: docs/architecture-dna.md:DNA-64, dna.registry.validate exit 0)`
  - Criterion 2: Root `AGENTS.md` has "Werkstatt engine program" section — `(evidence: AGENTS.md:## Werkstatt engine program)`
  - Criterion 3: All downstream RFCs exist with `related: [RFC-0769]` — `(evidence: docs/rfcs/rfc-0770..0779, rfc.validate exit 0)`
  - Criterion 4: `rfc.validate` passes — `(evidence: rfc.validate --id RFC-0769 exit 0)`
- **Stamp the RFC as implemented:** run `rtk pnpm exec site-kernel run rfc.implement.stamp --id RFC-0769 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `rtk git status` — no uncommitted changes from the current session.
- `rtk pnpm exec site-kernel run rfc.validate --id RFC-0769` — 0 violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0769`
- `pnpm exec site-kernel run dna.registry.validate`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0769` (RFC-0330 — note: this RFC has commented-out acceptance probes, so verification emit will skip; this is expected)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0769` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file expected (acceptance probes are commented out)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Big-bang consolidation risk | Not applicable to this charter — consolidation happens in downstream RFCs (RFC-0772, RFC-0776) |
| DNA renumbering hazard | Step 1 appends DNA-64 after DNA-63; no renumbering |
| Plugin contract too narrow | Not applicable to this charter — contract defined in RFC-0770 |
| repo-extract feature gaps | Not applicable to this charter — extraction defined in RFC-0773 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-2, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0769 --reason "..." --invariant "DNA-N"` instead of working around it.
