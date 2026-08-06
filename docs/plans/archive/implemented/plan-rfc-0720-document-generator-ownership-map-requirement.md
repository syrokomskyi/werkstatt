---
rfcId: RFC-0720
planId: PLAN-RFC-0720-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0720

## 1. Objectives

- [ ] Objective 1 — Add "Generator ownership map" section to `packages/os/site-kernel-checks/AGENTS.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add cross-reference note to `packages/os/site-kernel-handoff/AGENTS.md` (maps to acceptance criterion 2)
- [ ] Objective 3 — The AGENTS.md example includes `markerPolicy: "registry-only"` for `public/**` files (maps to acceptance criterion 3)
- [ ] Objective 4 — The AGENTS.md example mentions `conditional: true` semantics (maps to acceptance criterion 4)
- [ ] Objective 5 — `rfc.validate` passes on RFC-0720 with zero errors (maps to acceptance criterion 5)

## 2. Affected artifacts

### 2.1 Code and commands

None. This RFC is documentation-only — no code, no commands, no pipeline changes.

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add new "Generator ownership map" section after the existing `GENERATOR_OWNERSHIP_MAP` mention (line 118)
- `packages/os/site-kernel-handoff/AGENTS.md` — add cross-reference note in the rules section
- RFC file: `docs/rfcs/draft/rfc-0720-document-generator-ownership-map-requirement.md` (read-only reference, already accepted)

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0720` — must pass with zero errors
- No pipeline changes — `ownership.sync.validate` (RFC-0612) remains the automated safety net

## 3. Step sequence

### Step 1. Add "Generator ownership map" section to `site-kernel-checks/AGENTS.md`

**Goal:** Add the documentation note that reminds agents to register generated files in `GENERATOR_OWNERSHIP_MAP`.

**Agent actions:**

- Read `packages/os/site-kernel-checks/AGENTS.md` and locate line 118 (the existing `GENERATOR_OWNERSHIP_MAP` mention about `{system}` placeholder)
- Add a new `## Generator ownership map (RFC-0087, RFC-0612)` section after the existing rules section (after line 124, the last rule in the file)
- The section content must include:
  - The MUST requirement to register generated paths in `GENERATOR_OWNERSHIP_MAP`
  - The consequence: `ownership.sync.validate` (OWN-01) fails in `build.prepare` and `sites-check-author`
  - An example entry with `path`, `command`, `module`, and `markerPolicy: "registry-only"` fields
  - The `conditional: true` semantics explanation

**Validation:**

- `grep -c "Generator ownership map" packages/os/site-kernel-checks/AGENTS.md` returns 1
- `grep "markerPolicy" packages/os/site-kernel-checks/AGENTS.md` returns a match in the new section
- `grep "conditional: true" packages/os/site-kernel-checks/AGENTS.md` returns a match in the new section

**Completion criterion:** The new section exists in `packages/os/site-kernel-checks/AGENTS.md` with all four required elements (MUST requirement, OWN-01 consequence, example with `markerPolicy`, `conditional` semantics).

**Human review:** no

---

### Step 2. Add cross-reference note to `site-kernel-handoff/AGENTS.md`

**Goal:** Add a brief note in `site-kernel-handoff/AGENTS.md` pointing agents to the ownership map requirement.

**Agent actions:**

- Read `packages/os/site-kernel-handoff/AGENTS.md` and locate the rules section
- Add a bullet point: "When adding a new generated file to `public/` or `public/.well-known/`, register it in `GENERATOR_OWNERSHIP_MAP` in `packages/os/site-kernel-checks/src/generator-ownership.ts`. See `packages/os/site-kernel-checks/AGENTS.md` § Generator ownership map for details."

**Validation:**

- `grep "GENERATOR_OWNERSHIP_MAP" packages/os/site-kernel-handoff/AGENTS.md` returns at least 1 match

**Completion criterion:** The cross-reference note exists in `packages/os/site-kernel-handoff/AGENTS.md` and mentions `GENERATOR_OWNERSHIP_MAP` with a pointer to `site-kernel-checks/AGENTS.md`.

**Human review:** no

---

### Step 3. Validate and stamp implemented

**Goal:** Verify the RFC passes validation, check off acceptance criteria, and stamp as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0720 --json` — must return `exitCode: 0`
- Verify all 5 acceptance criteria are met:
  1. `packages/os/site-kernel-checks/AGENTS.md` includes the new section
  2. `packages/os/site-kernel-handoff/AGENTS.md` includes the cross-reference note
  3. The example includes `markerPolicy: "registry-only"`
  4. The example mentions `conditional: true` semantics
  5. `rfc.validate` passes with zero errors
- Run `fo-review` via the `skill` tool on the session's code changes (the two AGENTS.md edits)
- Run `fo-fix` if `fo-review` reports findings (max 3 iterations)
- Commit the AGENTS.md changes with a message referencing RFC-0720
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0720 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0720 --json` — `exitCode: 0`, zero violations
- `git status` — clean working tree after stamping
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** RFC-0720 is stamped as `implemented` via `rfc.implement.stamp`; all acceptance criteria checked off with inline evidence annotations.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0720` — must pass with zero errors
- No `build:check` needed — no code changes
- No acceptance probes — RFC-0720 has no `acceptance` frontmatter field
- No `rfc.verification.emit` needed — RFC-0720 has no acceptance probes (RFC-0330 applies only to probe-bearing RFCs)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0720` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file (no acceptance probes)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent reading behavior — agents may not re-read AGENTS.md mid-implementation | Step 1 explicitly states the OWN-01 consequence, reinforcing that the check is fatal |
| Note staleness — OwnershipEntry interface may change | Step 1 uses the current interface shape; implementation notes say to update the example if the interface changed |
| False sense of security — agents might skip running ownership.sync.validate locally | The note explicitly states "Failure to do so causes ownership.sync.validate (OWN-01) to fail" |

## 6. Escalation triggers

- If implementation reveals that `GENERATOR_OWNERSHIP_MAP` or `OwnershipEntry` has been removed or renamed, stop and consult the operator — the RFC's design assumes these exist.
- If `ownership.sync.validate` has been removed from the pipelines, the RFC's consequence statement is stale — update the note or create a superseding RFC.
