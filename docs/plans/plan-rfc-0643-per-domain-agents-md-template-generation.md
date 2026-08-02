---
rfcId: RFC-0643
planId: PLAN-RFC-0643-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0643

## Prerequisites

This RFC depends on three draft RFCs that must be implemented first:

- **RFC-0638** (Domain-Neutral Profile Schema Extensions) — provides `terminology`, `workspaceTypes`, `register` profile fields
- **RFC-0639** (Semantic Bindings Schema Extensions) — provides `resolveTerminology()` and `UNIVERSAL_TERMINOLOGY`
- **RFC-0640** (Domain-Aware Project Bootstrapping) — extends `forge.agents.generate` to use `workspaceTypes[]` for detection

Implement in order: RFC-0638 → RFC-0639 → RFC-0640 → RFC-0643.

## 1. Objectives

- [ ] O1 — `substituteTemplate()` function replaces `{{terminology.key}}` placeholders in generated AGENTS.md content — maps to acceptance criterion 1
- [ ] O2 — Root AGENTS.md static prose extracted to template files (`root-agents-business.md`, `root-agents-creative.md`) with `{{terminology.key}}` placeholders — maps to acceptance criteria 2, 3, 4, 5
- [ ] O3 — Nested AGENTS.md templates use `workspaceTypes[].agentsMdTemplate` when present, fallback to hardcoded — maps to acceptance criteria 6, 7
- [ ] O4 — `--json` output adds `details` field with per-file domain metadata; `generated` remains `string[]` — maps to acceptance criterion 8
- [ ] O5 — Template path resolution: `agentsMdTemplate` relative to profile directory, no traversal — maps to acceptance criterion 9
- [ ] O6 — Unit tests cover terminology substitution, register selection, nested template, fallback, path traversal rejection — maps to acceptance criterion 10
- [ ] O7 — Existing software-domain projects generate identical AGENTS.md (no regression) — maps to acceptance criterion 11
- [ ] O8 — `packages/forge/AGENTS.md` updated with domain template documentation — maps to acceptance criterion 12

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — extended: `profile?: StackProfile` field in `ForgeConfig`, `loadForgeConfig` loads profile from `profiles/<id>.yaml` when `profile` field is present in forge.yaml
- `packages/forge/src/onboarding/create.ts` — extended: writes `profile: <id>` to forge.yaml during `forge.create`
- `packages/forge/src/onboarding/agents-generate.ts` — extended: `substituteTemplate()` on final content, `selectRootTemplate()`, `details` field in result, reads `config.profile` for terminology and register
- `packages/forge/src/onboarding/nested-agents-templates.ts` — extended: `selectNestedTemplate()` with profile-driven template selection, path traversal guard, reads `config.profile`
- `packages/forge/src/onboarding/templates/root-agents-business.md` — new: static prose extracted from inline `runAgentsGenerate` content
- `packages/forge/src/onboarding/templates/root-agents-creative.md` — new: creative register static prose
- `packages/forge/src/tests/agents-generate-domain.test.ts` — new test file
- `packages/forge/src/tests/fixtures/agents-generate-business-before.txt` — new: golden fixture for regression test

### 2.2 Configuration and data

- No forge.yaml changes (profile fields are consumed read-only)
- No system.md or manifest changes

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — updated with domain template documentation
- `docs/rfcs/rfc-0643-per-domain-agents-md-template-generation.md` — read-only reference (acceptance criteria source)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — typecheck
- `pnpm --filter @warpgogol/forge run test` — unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0643` — RFC validation

## 3. Step sequence

### Step 1. Capture golden fixture and add profile loading to `ForgeConfig`

**Goal:** Capture current AGENTS.md output as golden fixture before any changes, and extend `ForgeConfig` to load the profile from forge.yaml.

**Agent actions:**

- Run `runAgentsGenerate` with current code (no profile) in a test context, capture the full output and save as `packages/forge/src/tests/fixtures/agents-generate-business-before.txt`
- Add `profile?: StackProfile` field to `ForgeConfig` interface in `packages/forge/src/config/forge-config.ts`
- Add `profile?: string` field to the forge.yaml schema (the profile id, e.g. `forge-shell`)
- Extend `loadForgeConfig` to read the `profile` field from forge.yaml, load the corresponding `profiles/<id>.yaml` file, and attach it to `config.profile`
- When `profile` field is absent in forge.yaml, `config.profile` = undefined (backward compatible)
- Extend `forge.create` to write `profile: <id>` to forge.yaml (the `--profile` flag value, defaulting to `forge-shell`)
- Import `StackProfile` and `StackProfileDomainFields` from RFC-0638's `profile-schema.ts`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Golden fixture file exists and contains the current AGENTS.md output
- `loadForgeConfig` with no `profile` field in forge.yaml returns `config.profile` = undefined
- `loadForgeConfig` with `profile: forge-shell` loads `profiles/forge-shell.yaml` and attaches to `config.profile`

**Completion criterion:** Golden fixture captured; `ForgeConfig` has `profile?: StackProfile` field; `loadForgeConfig` loads profile when `profile` field present in forge.yaml; `forge.create` writes profile id to forge.yaml.

**Human review:** no

---

### Step 2. Add `substituteTemplate()` and `TemplateContext` type

**Goal:** Create the terminology placeholder substitution function and its input type.

**Agent actions:**

- Add `TemplateContext` interface to `packages/forge/src/onboarding/agents-generate.ts`
- Add `substituteTemplate(content: string, terminology: Record<string, string>): string` function — replaces `{{terminology.key}}` with resolved value or key name fallback
- Import `resolveTerminology` from `@warpgogol/forge/config` (available after RFC-0639)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Function is pure (no I/O, no side effects)

**Completion criterion:** `substituteTemplate()` function exists, typechecks, and replaces `{{terminology.key}}` patterns with resolved terminology values.

**Human review:** no

---

### Step 3. Extract business root template to file

**Goal:** Extract the static prose parts of the root AGENTS.md from inline code to a template file.

**Agent actions:**

- Create `packages/forge/src/onboarding/templates/root-agents-business.md`
- Extract static prose from `runAgentsGenerate()` lines 362–377 (header, project section, paths section, conventions) into the template file
- Replace hardcoded software-domain terms in the template with `{{terminology.key}}` placeholders (e.g. "app" → `{{terminology.module}}`, "operator" → `{{terminology.operator}}`)
- Keep dynamic sections (skills table, capabilities, behavioral layer) inline in `runAgentsGenerate` — they are appended at runtime after template loading
- Add `BUSINESS_ROOT_TEMPLATE` constant pointing to the template file path

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Existing software-domain project generates identical AGENTS.md (regression test in step 6)

**Completion criterion:** `root-agents-business.md` template file exists with `{{terminology.key}}` placeholders; `runAgentsGenerate` loads it for the static prose part.

**Human review:** no

---

### Step 4. Create creative root template

**Goal:** Create the creative register root AGENTS.md template.

**Agent actions:**

- Create `packages/forge/src/onboarding/templates/root-agents-creative.md`
- Base content on the business template but adapt prose for creative workflows (compositions, renders, scenes instead of apps, builds, packages)
- Use the same `{{terminology.key}}` placeholder syntax
- Add `CREATIVE_ROOT_TEMPLATE` constant
- Add `selectRootTemplate(register)` function that returns the appropriate template based on register

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Creative register project generates AGENTS.md with creative-domain language

**Completion criterion:** `root-agents-creative.md` template file exists; `selectRootTemplate("creative")` returns it; `selectRootTemplate("business")` returns the business template.

**Human review:** no

---

### Step 5. Wire terminology substitution into `runAgentsGenerate`

**Goal:** Apply `substituteTemplate()` to the final assembled AGENTS.md content.

**Agent actions:**

- In `runAgentsGenerate()`, after all dynamic sections (skills table, capabilities, behavioral layer, conventions) are assembled into `lines`, apply `substituteTemplate(content, resolvedTerminology)` to the final content string
- Resolve terminology via `resolveTerminology(config, config.profile, key)` (from RFC-0639) for each key in the template — profile is available on `config.profile` (step 1)
- When no profile is loaded (`config.profile` undefined) or profile has no terminology, `resolveTerminology` returns universal defaults — substitution is a no-op (placeholders resolve to key names, which match the universal defaults)
- Add `details` field to `AgentsGenerateResult` interface: `details?: Array<{ path: string; domain?: string; register?: string; workspaceType?: string }>`
- Populate `details` for each generated file with domain metadata from the profile

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `--json` output includes `details` field with per-file metadata
- `generated` field remains `string[]`

**Completion criterion:** `substituteTemplate()` runs on the final assembled content; `details` field present in `--json` output; `generated` field unchanged.

**Human review:** no

---

### Step 6. Extend nested template selection with profile-driven templates

**Goal:** Use `workspaceTypes[].agentsMdTemplate` from the profile for nested AGENTS.md generation.

**Agent actions:**

- In `packages/forge/src/onboarding/nested-agents-templates.ts`, add `selectNestedTemplate(workspaceType, fallback)` function
- When `workspaceType?.agentsMdTemplate` is present, resolve the path relative to the profile YAML directory (profile path from `config.profile`)
- Reject absolute paths and parent-directory traversal (`..`) with a warning, fall back to hardcoded template
- Read the template file and return its content
- When `agentsMdTemplate` is absent or file not found, return the fallback (existing `buildNestedAgentsMd` output)
- Apply `substituteTemplate()` to nested template content before returning
- Wire `selectNestedTemplate` into `generateNestedAgentsMd` (in `nested-agents-generate.ts`) — `config.profile` is available via the `config` parameter (step 1), access `config.profile?.workspaceTypes` to find the matching `ProfileWorkspaceType` for each workspace

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Nested template with `agentsMdTemplate` uses the profile template
- Nested template without `agentsMdTemplate` uses existing hardcoded template
- Path traversal (`../../etc/passwd`) is rejected with a warning

**Completion criterion:** Nested AGENTS.md generation uses profile-driven templates when available, falls back to hardcoded templates otherwise, and rejects path traversal.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Comprehensive test coverage for all new functionality.

**Agent actions:**

- Create `packages/forge/src/tests/agents-generate-domain.test.ts`
- Test cases:
  1. `substituteTemplate()` replaces `{{terminology.artifact}}` with "composition" when terminology has `artifact: "composition"`
  2. `substituteTemplate()` replaces unknown key with key name itself (fallback)
  3. `substituteTemplate()` leaves content without placeholders unchanged
  4. `selectRootTemplate("business")` returns business template content
  5. `selectRootTemplate("creative")` returns creative template content
  6. Business template contains `{{terminology.key}}` placeholders
  7. Creative template contains `{{terminology.key}}` placeholders
  8. Nested template with `agentsMdTemplate` uses the profile template
  9. Nested template without `agentsMdTemplate` uses fallback hardcoded template
  10. Path traversal (`../../etc/passwd`) is rejected with warning, falls back
  11. Absolute path is rejected with warning, falls back
  12. No profile loaded → business template, universal terminology (no regression)
  13. `--json` output has `details` field with `domain`, `register`, `workspaceType`
  14. `--json` output `generated` field is `string[]` (not object array)
  15. Existing software-domain project generates identical AGENTS.md (regression test — run `runAgentsGenerate` with no profile, compare output to golden fixture `agents-generate-business-before.txt` captured in step 1)

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes
- All 15 test cases pass

**Completion criterion:** All test cases pass; test file covers terminology substitution, register selection, nested template selection, fallback, path traversal rejection, output format, and regression.

**Human review:** no

---

### Step 8. Update `packages/forge/AGENTS.md`

**Goal:** Document the domain-aware template generation in the forge package AGENTS.md.

**Agent actions:**

- Add a section under "Nested AGENTS.md generation (RFC-0611)" or a new "Per-domain AGENTS.md templates (RFC-0643)" section
- Document: `{{terminology.key}}` placeholder syntax, `substituteTemplate()` function, template file locations, `selectRootTemplate()` / `selectNestedTemplate()` functions, `details` field in `--json` output, path traversal guard, fallback behavior
- Add rule: agents MUST NOT add new workspace-type detection rules without an amending RFC (already in RFC-0611, reference it)

**Validation:**

- `packages/forge/AGENTS.md` content is accurate and matches implementation

**Completion criterion:** `packages/forge/AGENTS.md` has a section documenting RFC-0643 domain template generation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (step 7)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands in this RFC — `forge.agents.generate` is existing)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0643 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0643` passes
- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm --filter @warpgogol/forge run test` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0643`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC-0643 frontmatter
- Commit messages referencing `RFC-0643` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Template drift | Step 2 removes the inline hardcoded version — the template file is the single source of truth |
| Placeholder syntax confusion | Step 7 documents `{{terminology.key}}` separately from `ref()` syntax in AGENTS.md |
| Creative template maintenance | Step 3 bases creative template on business template structure — shared structure, only prose differs |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0643 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `resolveTerminology()` from RFC-0639 is not yet exported, stop and implement RFC-0639 first — do not create a temporary substitute.
