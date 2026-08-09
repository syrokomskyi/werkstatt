---
rfcId: RFC-0366
planId: PLAN-RFC-0366-01
status: draft
owner: architecture
createdAt: 2026-07-10
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/rfcs/rfc-0000-template.md
    - docs/rfcs/rfc-0000-mini-template.md
    - docs/rfcs/rfc-0001-introduce-rfc-governance-process.md
    - docs/rfcs/rfc-0331-add-satisfies-dna-trace-frontmatter-and-coverage-validation.md
    - docs/rfcs/rfc-0335-require-reviewer-identity-on-newly-decided-rfcs.md
    - AGENTS.md
---

# Implementation Plan: RFC-0366

## 1. Objectives

- [ ] Introduce a lightweight ADR document model and Site OS command domain.
- [ ] Provide `adr.create`, `adr.validate` (fail-hard), and `adr.list` commands.
- [ ] Retire the unused RFC mini-template and remove the `--mini` flag.
- [ ] Create `wg-rfc-create` and `wg-adr-create` agent skills.
- [ ] Update `AGENTS.md` with ADR governance rules.
- [ ] Wire `adr.validate` into `build.check` and regenerate command manifests.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/adr/types.ts` — ADR types and constants.
- `packages/os/site-kernel/src/adr/frontmatter-io.ts` — ADR file listing and parsing.
- `packages/os/site-kernel/src/adr/handlers/` — `list-create.ts`, `validate.ts`.
- `packages/os/site-kernel/src/adr/adr.module.ts` — module registration.
- `packages/os/site-kernel/src/index.ts` — re-export `adrModule`.
- `packages/os/site-kernel/src/rfc/types.ts` — remove mini-template constants.
- `packages/os/site-kernel/src/rfc/handlers/list-create.ts` — remove `--mini` flag.
- `packages/os/site-kernel/src/rfc/handlers/validate.ts` — full sections for all kinds.
- `packages/os/site-kernel/src/rfc/rfc.module.ts` — no mini flag in command schema.
- `packages/os/site-kernel-checks/src/adr/` — validation helpers (optional, if reused).
- `tools/kernel.config.ts` — register `adrModule`.

### 2.2 Configuration and data

- `docs/adrs/` directory.
- `docs/adrs/adr-0000-template.md`.
- Generated `docs/command-manifest.generated.json` and `docs/COMMANDS.md`.

### 2.3 Documentation and specs

- `AGENTS.md` — add ADR governance protocol section.
- `docs/rfcs/rfc-0001-introduce-rfc-governance-process.md` — remove mini-template references.
- `docs/rfcs/rfc-0331-add-satisfies-dna-trace-frontmatter-and-coverage-validation.md` — remove mini-template references.
- `docs/rfcs/rfc-0335-require-reviewer-identity-on-newly-decided-rfcs.md` — remove mini-template references.
- `.agents/skills/wg-rfc-create/SKILL.md`.
- `.agents/skills/wg-adr-create/SKILL.md`.

### 2.4 Validation and pipelines

- Add `adr.validate` to the workspace-level `build.check` pipeline.
- Run `rfc.validate`, `adr.validate`, and root `pnpm build`.

## 3. Step sequence

### Step 1. Create ADR types and constants

**Goal:** Define the ADR frontmatter contract and shared constants.

**Agent actions:**

- Create `packages/os/site-kernel/src/adr/types.ts` with `AdrStatus`, `AdrScope`, `AdrFrontmatter`, `AdrListEntry`, `AdrValidationViolation`, `AdrValidationResult`, `AdrCreateResult`, `AdrListResult`, plus `ADR_DIR`, `ADR_TEMPLATE_FILE`, `ADR_ID_PATTERN`, `ADR_STATUSES`, `ADR_SCOPES`, and required sections list.

**Validation:**

- `pnpm --filter @gogol/site-kernel exec tsc --noEmit` passes.

**Completion criterion:** `adr/types.ts` compiles and exports all required types.

**Human review:** no.

---

### Step 2. Create ADR frontmatter I/O helpers

**Goal:** Read and parse ADR Markdown files consistently.

**Agent actions:**

- Create `packages/os/site-kernel/src/adr/frontmatter-io.ts` with `listAdrFiles`, `readAndParseAdr`, and helper to extract H2 sections.
- Reuse the same YAML parser and section extraction utilities as `rfc/frontmatter-io.ts` where possible.

**Validation:**

- Unit tests or a quick `adr.list` dry-run against `docs/adrs/`.

**Completion criterion:** Empty `docs/adrs/` returns an empty list without errors.

**Human review:** no.

---

### Step 3. Implement ADR handlers

**Goal:** Provide the three ADR commands.

**Agent actions:**

- Create `packages/os/site-kernel/src/adr/handlers/list-create.ts` with `runAdrList` and `runAdrCreate`.
- Create `packages/os/site-kernel/src/adr/handlers/validate.ts` with `runAdrValidate`.
- Validation rules: id format/filename match, known keys, required frontmatter fields, status/scope enums, required sections, `supersedes`/`supersededBy` referential integrity, empty-dir pass.

**Validation:**

- `rfc.validate` still passes.
- `pnpm --filter @gogol/site-kernel run build:check` passes.

**Completion criterion:** Commands can be registered and executed via `site-kernel run adr.*`.

**Human review:** no.

---

### Step 4. Register the ADR module

**Goal:** Wire `adrModule` into the Site OS kernel.

**Agent actions:**

- Create `packages/os/site-kernel/src/adr/adr.module.ts`.
- Export `adrModule` from `packages/os/site-kernel/src/adr/index.ts` and `packages/os/site-kernel/src/index.ts`.
- Import `adrModule` in `tools/kernel.config.ts` alongside `rfcModule`.

**Validation:**

- `pnpm exec site-kernel list` includes `adr.create`, `adr.validate`, `adr.list`.

**Completion criterion:** `site-kernel list` shows all three ADR commands.

**Human review:** no.

---

### Step 5. Create the ADR template

**Goal:** Provide the canonical scaffold for `adr.create`.

**Agent actions:**

- Create `docs/adrs/adr-0000-template.md` matching the RFC's ADR document shape.

**Validation:**

- `adr.create` with the template produces a file that passes `adr.validate`.

**Completion criterion:** `adr.create --title="Test"` emits a valid draft ADR.

**Human review:** no.

---

### Step 6. Retire the RFC mini-template

**Goal:** Remove mini-template artifacts and simplify RFC validation.

**Agent actions:**

- Delete `docs/rfcs/rfc-0000-mini-template.md`.
- Remove `RFC_MINI_TEMPLATE_FILE` and `RFC_MINI_REQUIRED_SECTIONS` from `packages/os/site-kernel/src/rfc/types.ts`.
- Remove `--mini` flag handling from `packages/os/site-kernel/src/rfc/handlers/list-create.ts`.
- Remove `mini` flag from `packages/os/site-kernel/src/rfc/rfc.module.ts` command schema.
- Update `packages/os/site-kernel/src/rfc/handlers/validate.ts` to use `RFC_FULL_REQUIRED_SECTIONS` for all RFCs.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` passes for all existing RFCs.
- `pnpm exec werkstatt run rfc.create --title="Smoke test command" --kind=command` works and produces a valid RFC.

**Completion criterion:** No references to `rfc-0000-mini-template.md` or `--mini` remain in code or docs.

**Human review:** no.

---

### Step 7. Update RFC documentation references

**Goal:** Remove mini-template references from existing RFCs and templates.

**Agent actions:**

- Update `docs/rfcs/rfc-0001-introduce-rfc-governance-process.md` to describe a single full template and mention ADRs for lightweight decisions.
- Update `docs/rfcs/rfc-0331-...md` and `docs/rfcs/rfc-0335-...md` to remove mini-template references.
- Update `docs/rfcs/rfc-0000-template.md` comments if they still mention mini-template.

**Validation:**

- `rfc.validate --json` passes for all touched RFCs.

**Completion criterion:** No `rfc-0000-mini-template.md` mentions in `docs/rfcs/`.

**Human review:** no.

---

### Step 8. Create agent skills

**Goal:** Provide stable instructions for `wg-rfc-create` and `wg-adr-create`.

**Agent actions:**

- Create `.agents/skills/wg-rfc-create/SKILL.md` using the expert prompt adapted to `rfc-0000-template.md`, with reviewer default rule.
- Create `.agents/skills/wg-adr-create/SKILL.md` using the expert prompt adapted to `adr-0000-template.md`.

**Validation:**

- Files exist and follow the existing skill format (`---` frontmatter with `name`, `description`, then markdown).

**Completion criterion:** Both skill files are present and consistent with RFC-0366.

**Human review:** no.

---

### Step 9. Update AGENTS.md ADR governance

**Goal:** Document agent behavior around ADRs.

**Agent actions:**

- Add an "ADR governance protocol" section to root `AGENTS.md` after the "RFC governance protocol" section.
- Include: when to use ADR vs RFC, allowed agent actions, status gate, link to RFCs, commit references.

**Validation:**

- `markdownlint` passes (if wired).
- `rfc.validate` passes.

**Completion criterion:** `AGENTS.md` contains clear ADR rules for agents.

**Human review:** no.

---

### Step 10. Wire into build.check and regenerate manifests

**Goal:** Make ADR validation part of the standard readiness signal.

**Agent actions:**

- Add `adr.validate` to the workspace-level `build.check` pipeline in `packages/os/site-kernel-checks` (or equivalent registry).
- Run `command.manifest.generate` and `docs.commands.generate` to update generated manifest/docs.

**Validation:**

- `pnpm exec werkstatt run command.manifest.validate --json` passes.
- `adr.validate` runs during `build.check`.

**Completion criterion:** A workspace `build.check` executes `adr.validate` and fails on invalid ADRs.

**Human review:** no.

---

### Step 11. Run heavy checks and acceptance probes

**Goal:** Verify the whole change is green.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --json`.
- Run `pnpm --filter @gogol/site-kernel run build:check`.
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`.
- Run `pnpm build` from workspace root.
- Run `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0366`.
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0366`.
- Fix any errors.

**Completion criterion:** All checks pass and evidence file is emitted.

**Human review:** no.

---

### Step 12. Stamp implemented

**Goal:** Mark RFC-0366 as implemented.

**Agent actions:**

- Set `status: implemented`, `implementedAt: 2026-07-10`, `updatedAt: 2026-07-10`.
- Commit.

**Completion criterion:** RFC-0366 frontmatter shows `status: implemented` with evidence committed.

**Human review:** no.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0366`
- `pnpm exec werkstatt run adr.validate --json`
- `pnpm exec werkstatt run adr.list --json`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm build`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0366`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0366`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0366.generated.json`

## 5. Risks and mitigation

| Risk (from RFC)               | Mitigation (plan step)                                   |
| ----------------------------- | -------------------------------------------------------- |
| Confusion between RFC and ADR | Step 9 — explicit rules in `AGENTS.md`.                  |
| ADR proliferation             | Step 3 — fail-hard validation rejects trivial ADRs.      |
| Drift in ADR quality          | Step 3/10 — validation rules and pipeline integration.   |
| Agent misinterpretation       | Steps 5/8/9 — canonical template and skill instructions. |

## 6. Escalation triggers

- If removing the mini-template causes existing `command`/`policy` RFCs to fail `rfc.validate`, stop and run `rfc.supersede.propose` or adjust the section requirements instead of weakening validation.
- If `adrModule` placement conflicts with package boundaries, escalate rather than placing ADR logic inside `rfc/`.
