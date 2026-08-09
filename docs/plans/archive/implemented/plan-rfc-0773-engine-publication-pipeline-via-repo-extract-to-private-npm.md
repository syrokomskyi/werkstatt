---
rfcId: RFC-0773
planId: PLAN-RFC-0773-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - docs/authoring/publication-runbook.md
    - docs/technology.xml
    - AGENTS.md
    - .forge/pinned.yaml
    - packages/werkstatt/README.md
---

# Implementation Plan: RFC-0773

## 1. Objectives

- [ ] O1 — Create `extract.config.yaml` for `packages/werkstatt` (maps to acceptance criterion: "extract.config.yaml exists for packages/werkstatt with excludePathSegments: [.npmrc]")
- [ ] O2 — Document versioning policy in engine README (maps to: "Versioning policy documented in engine README")
- [ ] O3 — Write publication runbook at `docs/authoring/publication-runbook.md` (maps to: "Publication runbook written at docs/authoring/publication-runbook.md")
- [ ] O4 — Create fixture workshop in engine test fixtures (maps to: "Fixture workshop created in engine package test fixtures")
- [ ] O5 — Pin extraction configs in `.forge/pinned.yaml` (maps to: "Extraction configs pinned in .forge/pinned.yaml (protect mode)")
- [ ] O6 — Update `docs/technology.xml` with publication pipeline entry (maps to: "docs/technology.xml updated with publication pipeline entry")
- [ ] O7 — Update root `AGENTS.md` with agent publication rule (maps to: "Root AGENTS.md updated with agent publication rule")
- [ ] O8 — `rfc.validate` passes (maps to: "rfc.validate passes on this file before merging")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/extract.config.yaml` — new file, modeled on `packages/forge/extract.config.yaml`
- `packages/werkstatt/test-fixtures/fixture-workshop/` — new directory with minimal workshop fixture (forge.yaml, tools/kernel.config.ts, empty systems/ and missions/)

### 2.2 Configuration and data

- `.forge/pinned.yaml` — add `packages/werkstatt/extract.config.yaml` entry (protect mode)
- `packages/werkstatt/package.json` — no changes in this RFC (private→false transition happens at actual publication time, not in this policy RFC)

### 2.3 Documentation and specs

- `packages/werkstatt/README.md` — new file: versioning policy, peerDependency rules, breaking-major-all-plugins-republished rule, workshop version 4→5 migration note
- `docs/authoring/publication-runbook.md` — new file: step-by-step operator publication runbook (dry-run → extract → build → pack → fixture install → publish), token management, rollback procedure
- `docs/technology.xml` — add `<publication-pipeline>` section under technology
- `AGENTS.md` (root) — add agent publication rule: "Agents MUST NOT trigger npm publish without an explicit operator command"

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0773` — must pass
- `pnpm --filter @warpgogol/werkstatt run build:check` — must pass (no code changes, but verify no breakage from new files)
- No new CI workflows (publication is operator-triggered, not automated)

## 3. Step sequence

### Step 1. Create extract.config.yaml for packages/werkstatt

**Goal:** Create the extraction configuration for the engine package, modeled on the forge precedent.

**Agent actions:**

- Read `packages/forge/extract.config.yaml` as the reference template
- Create `packages/werkstatt/extract.config.yaml` with:
  - `projectDir: packages/werkstatt`
  - `destName: werkstatt`
  - `standalone: true`
  - `workspacePrefixes: ["@warpgogol/"]`
  - `stripScopes: ["@warpgogol/"]`
  - `preservePackages: ["@warpgogol/werkstatt"]`
  - `packageManager: "pnpm"`
  - `ignoreDirs: [.turbo, .agents, node_modules, tmp-*]`
  - `excludePathSegments: [.npmrc]`
  - `postProcess: [{ action: delete, path: AGENTS.md }]`
  - `git: { remote: git@github.com:syrokomskyi/werkstatt.git, autoPush: true }`
- Verify the config is valid YAML

**Validation:**

- `cat packages/werkstatt/extract.config.yaml` — file exists and is valid YAML
- `repo-extract --config packages/werkstatt/extract.config.yaml --dry-run` — dry-run plan review (if repo-extract is available; otherwise note as operator verification step)

**Completion criterion:** `packages/werkstatt/extract.config.yaml` exists with `excludePathSegments: [.npmrc]` and all required fields.

**Human review:** no

---

### Step 2. Pin extract.config.yaml in .forge/pinned.yaml

**Goal:** Protect the extraction config from accidental deletion via the pinned-files manifest.

**Agent actions:**

- Read `.forge/pinned.yaml`
- Add entry: `{ path: packages/werkstatt/extract.config.yaml, mode: protect, reason: "Engine extraction config — required for npm publication (RFC-0773)" }`
- Run `forge pinned.validate` to verify the manifest is valid

**Validation:**

- `pnpm exec werkstatt run forge.pinned.validate` — passes with no violations

**Completion criterion:** `packages/werkstatt/extract.config.yaml` is listed in `.forge/pinned.yaml` with `mode: protect`.

**Human review:** no

---

### Step 3. Write engine README with versioning policy

**Goal:** Document the versioning policy, peerDependency rules, and breaking-change procedure in the engine package README.

**Agent actions:**

- Create `packages/werkstatt/README.md` with:
  - Package description (`@warpgogol/werkstatt` — Werkstatt engine)
  - Versioning policy section:
    - Independent SemVer for engine and plugins
    - Plugin peerDependency on engine range (e.g. `@warpgogol/werkstatt: ^1.x`)
    - Workspace `workspace:*` deps rewritten by repo-extract; plugins pin engine peer range explicitly
    - Version bumps via `ecosystem.commit`
    - Breaking engine major → all plugins republished simultaneously
    - Workshop version 4→5 migration after full RFC-0769..0779 implementation
  - Reference to publication runbook at `docs/authoring/publication-runbook.md`
  - Reference to extract.config.yaml

**Validation:**

- `cat packages/werkstatt/README.md` — file exists with versioning policy section

**Completion criterion:** `packages/werkstatt/README.md` exists and contains the versioning policy with all rules from the RFC.

**Human review:** no

---

### Step 4. Write publication runbook

**Goal:** Create the operator-facing step-by-step publication runbook.

**Agent actions:**

- Create `docs/authoring/publication-runbook.md` with:
  - Prerequisites: npm token, `.npmrc` setup, `@warpgogol` scope access
  - Verification gate steps (1-5 from RFC Design section):
    1. `repo-extract --config packages/<name>/extract.config.yaml --dry-run`
    2. Real extraction to external folder
    3. `pnpm install && pnpm build && pnpm test` in extraction folder
    4. `npm pack` → install tarball into fixture workshop → run smoke commands
    5. `npm publish` (restricted)
  - Token management section: token in `.npmrc` in extraction folder only, excluded from git via `excludePathSegments`, rotation procedure
  - Rollback section: `npm deprecate` + fix-forward patch, `npm unpublish` within 72h for new packages
  - Failure modes: secret scan hit, smoke test failure, network failure
  - Note: plugin packages (werkstatt-site, werkstatt-game, werkstatt-video) reuse the same config shape when they land

**Validation:**

- `cat docs/authoring/publication-runbook.md` — file exists with all sections

**Completion criterion:** `docs/authoring/publication-runbook.md` exists with verification gate, token management, rollback, and failure modes sections.

**Human review:** no

---

### Step 5. Create fixture workshop

**Goal:** Create a minimal workshop fixture for tarball smoke testing.

**Agent actions:**

- Create `packages/werkstatt/test-fixtures/fixture-workshop/` directory with:
  - `forge.yaml` — minimal config with `project.stack: [typescript, astro, turborepo]`, `packageManager: pnpm`
  - `tools/kernel.config.ts` — minimal composition point importing engine + placeholder for plugin
  - `systems/registry.yaml` — empty registry
  - `missions/` — empty directory (with .gitkeep)
  - `package.json` — minimal, with `@warpgogol/werkstatt` as dependency
- Verify the fixture is a valid workshop structure (not a full working workshop, just enough for smoke tests)

**Validation:**

- `ls packages/werkstatt/test-fixtures/fixture-workshop/` — directory exists with expected files

**Completion criterion:** Fixture workshop exists at `packages/werkstatt/test-fixtures/fixture-workshop/` with forge.yaml, kernel.config.ts, empty systems/ and missions/.

**Human review:** no

---

### Step 6. Update docs/technology.xml

**Goal:** Add the publication pipeline to the technology Compass document.

**Agent actions:**

- Read `docs/technology.xml`
- Add a `<publication-pipeline>` section (after the existing `<command-policy>` section or in a logically appropriate position) with:
  - `<tool>repo-extract</tool>` — standalone package extraction
  - `<registry>npm (private scoped)</registry>` — `@warpgogol` scope, restricted access
  - `<trigger>operator-triggered</trigger>` — no automated publish-on-merge
  - `<config>extract.config.yaml</config>` — per-package extraction config
  - Reference to RFC-0773

**Validation:**

- `grep publication-pipeline docs/technology.xml` — section exists

**Completion criterion:** `docs/technology.xml` contains a `<publication-pipeline>` section referencing RFC-0773.

**Human review:** no

---

### Step 7. Update root AGENTS.md with agent publication rule

**Goal:** Add the agent-facing publication rule to the root AGENTS.md.

**Agent actions:**

- Read `AGENTS.md` (root)
- Add a section under the existing Werkstatt plugin contract section or in a new "Publication policy" subsection:
  - "Agents MUST NOT trigger `npm publish` without an explicit operator command."
  - "Publication is operator-triggered, never automated."
  - "Extraction configs (`extract.config.yaml`) are pinned in `.forge/pinned.yaml` and MUST NOT be deleted or modified without operator approval."
  - Reference to RFC-0773 and the runbook at `docs/authoring/publication-runbook.md`

**Validation:**

- `grep "MUST NOT trigger.*npm publish" AGENTS.md` — rule exists

**Completion criterion:** Root `AGENTS.md` contains the agent publication rule referencing RFC-0773.

**Human review:** no

---

### Step 8. Validate, review, fix, and stamp

**Goal:** Run all validation checks, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0773 --json` — must pass
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass (no code changes, but verify no breakage)
- Run `forge pinned.validate` — must pass with new entry
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented artifacts. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0773 --implementation-commit <sha>` (dry-run first, then without --dry-run).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0773` — passes
- Review report exists in `docs/reviews/code/` for this session
- All agent-executable acceptance criteria are checked off with evidence

**Completion criterion:** All validation passes; code review passed (findings fixed if any); all agent-executable acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`. The operator-executable criterion (end-to-end publication verification) remains unchecked — it requires npm token and registry access and is deferred to the operator.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`. The operator-executable acceptance criterion is documented as deferred.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0773`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm exec werkstatt run forge.pinned.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0773` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| LFS-tracked binaries in werkstatt-site (ui assets) | Not applicable in this RFC — site plugin doesn't exist yet. Noted in runbook for future reference. |
| Peer-range drift | Step 3 documents the breaking-major-all-plugins-republished rule in engine README. |
| npm token leakage | Step 1 mandates `excludePathSegments: [.npmrc]`; Step 4 documents token management in runbook. |
| Broken publication | Step 4 documents rollback procedure (deprecate + fix-forward). |

## 6. Escalation triggers

- If `repo-extract` lacks LFS support (discovered during dry-run), that is an upstream fix — create an issue/PR against `@warpgogol/repo-extract` before wave 3.
- If `forge.pinned.validate` rejects the new entry format, check the pinned.yaml schema and adjust the entry to match the existing format.
- If implementation reveals an invariant conflict with DNA-62, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0773 --reason "..." --invariant "DNA-62"` instead of working around it.
