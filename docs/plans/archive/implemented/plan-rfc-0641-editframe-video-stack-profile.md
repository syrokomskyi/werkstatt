---
rfcId: RFC-0641
planId: PLAN-RFC-0641-01
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

# Implementation Plan: RFC-0641

## 1. Objectives

- [ ] Objective 1 — Create `packages/forge/profiles/editframe-html.yaml` with domain fields, terminology, artifacts, workspaceTypes, invariants, and detect markers — maps to acceptance criteria 1–7
- [ ] Objective 2 — Create first workspace template with sample HTML composition — maps to acceptance criteria 8–9
- [ ] Objective 3 — Add unit test verifying profile parses against extended schema — maps to acceptance criterion 10
- [ ] Objective 4 — Update `packages/forge/AGENTS.md` with Editframe profile documentation — maps to acceptance criterion 11
- [ ] Objective 5 — Pass `rfc.validate` and stamp implemented — maps to acceptance criterion 12

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/profiles/editframe-html.yaml` — new profile YAML file
- `packages/forge/profiles/editframe-html-templates/composition.html` — sample composition template
- `packages/forge/profiles/editframe-html-templates/composition-agents.md` — AGENTS.md template for composition workspaces
- `packages/forge/src/tests/editframe-profile.test.ts` — new unit test

No new commands. No command handler changes. No registry entries. No pipeline wiring.

### 2.2 Configuration and data

- `packages/forge/profiles/editframe-html.yaml` — profile YAML with domain fields from RFC-0638 schema extensions

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update §Stack profiles to list `editframe-html` as a shipped profile
- `docs/rfcs/rfc-0641-editframe-video-stack-profile.md` — read-only reference (acceptance criteria source)

No `docs/*.xml` Compass files affected — this RFC adds a profile, not a repository-wide semantic change.

No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0641` — RFC validation
- `pnpm --filter @warpgogol/forge run build:check` — TypeScript typecheck
- `pnpm --filter @warpgogol/forge run test` — unit tests (including new profile test)

No CI workflow changes. No new pipeline checks.

## 3. Step sequence

### Step 1. Create the editframe-html profile YAML

**Goal:** Create the profile file that declares all domain fields, terminology, artifacts, workspaceTypes, invariants, workspace layout, install steps, detect markers, and first workspace template.

**Agent actions:**

- Create `packages/forge/profiles/editframe-html.yaml` with:
  - `schema: forge/stack-profile@1`
  - `id: editframe-html`
  - `displayName: Editframe HTML Video`
  - `detect.anyOf: ["editframe.config.*"]`
  - `domain: video`
  - `register: creative`
  - `terminology` map: artifact → composition, artifactPlural → compositions, module → scene, source → composition file, output → render, verify → render-verify, operator → director
  - `artifacts[]`: composition artifact with extensions `.html` and `.tsx`, produce command `editframe render`, validate command `editframe check`, determinism (hashable: true, inputs: [composition files, assets, editframe version])
  - `workspaceTypes[]`: composition type with detect (`glob: "*.html"`, `contains: "ef-timegroup"`, `packageJsonDep: "@editframe/cli"`), skills `[ef-composition-review, ef-render-verify]`, agentsMdTemplate `templates/composition-agents.md`
  - `invariants[]`: VIDEO-01 (kebab-case filenames, error), VIDEO-02 (scene durations use contain mode by default, warning), VIDEO-03 (all speech audio must have ef-captions, error)
  - `workspace.dirs`: `[compositions, packages, services]`
  - `workspace.files`: `pnpm-workspace.yaml`, `turbo.json`, root `package.json` with scripts, `.gitignore`, `scripts/clean.mjs` (mirror existing profile structure)
  - `install`: `["@editframe/cli", "@warpgogol/forge", "prettier"]`
  - `firstWorkspace`: `compositions/my-first-video` with sample HTML composition file and `package.json`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — verifies the profile YAML is well-formed (loaded by existing tests)
- Manual: `node -e "const {loadStackProfile} = require('./packages/forge/src/profiles/stack-profile.ts'); loadStackProfile('./packages/forge/profiles/editframe-html.yaml')"` — or via vitest test in Step 3

**Note:** The profile declares `workspaceTypes[].skills: [ef-composition-review, ef-render-verify]` as a forward declaration. These skills are defined in RFC-0642 (not yet implemented). `forge.agents.generate` (RFC-0640) will search for them among skill packs — until RFC-0642 is implemented, they will not be found, which is a warning, not an error. This follows the existing profile pattern where profiles declare the intended skill set.

**Completion criterion:** `packages/forge/profiles/editframe-html.yaml` exists, parses without error against `stackProfileSchema`, and declares all fields listed in acceptance criteria 1–7.

**Human review:** no

---

### Step 2. Create first workspace template files

**Goal:** Create the sample HTML composition and AGENTS.md template referenced by the profile's `firstWorkspace` and `workspaceTypes`.

**Agent actions:**

- Create `packages/forge/profiles/editframe-html-templates/composition.html` — a minimal Editframe HTML composition with `ef-timegroup` element, scene structure, and comments explaining the composition format
- Create `packages/forge/profiles/editframe-html-templates/composition-agents.md` — AGENTS.md template for composition workspaces with video-domain guidance (kebab-case filenames, contain mode defaults, caption requirements)

**Validation:**

- Files exist and are referenced correctly in the profile YAML

**Completion criterion:** Both template files exist and the profile YAML's `firstWorkspace.files` and `workspaceTypes[].agentsMdTemplate` paths resolve correctly.

**Human review:** no

---

### Step 3. Add unit test for the editframe-html profile

**Goal:** Verify the profile parses against the extended schema and all domain fields are valid.

**Agent actions:**

- Create `packages/forge/src/tests/editframe-profile.test.ts` with tests:
  - `loadStackProfile` succeeds on `editframe-html.yaml`
  - Profile has `domain: "video"`
  - Profile has `register: "creative"`
  - Terminology map contains `artifact: "composition"`, `module: "scene"`, `operator: "director"`
  - Artifacts array has composition with extensions `[".html", ".tsx"]`
  - workspaceTypes has composition type with detect markers
  - invariants has at least 3 VIDEO-* entries
  - `detect.anyOf` contains `"editframe.config.*"`
  - `stackProfileSchema.safeParse` succeeds on the loaded profile

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** New test file exists, all tests pass, profile parsing is verified.

**Human review:** no

---

### Step 4. Update packages/forge/AGENTS.md

**Goal:** Add `editframe-html` to the list of shipped profiles in the Stack profiles section.

**Agent actions:**

- Edit `packages/forge/AGENTS.md` §Stack profiles:
  - Add `editframe-html` to the shipped profiles list: `Shipped profiles: astro-typescript-turborepo, phaser-turborepo, forge-shell (minimal — default for forge.create), editframe-html (video domain — requires RFC-0638..0640).`

**Validation:**

- `git diff packages/forge/AGENTS.md` — shows only the profile list change

**Completion criterion:** `packages/forge/AGENTS.md` lists `editframe-html` as a shipped profile.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (Step 4).
- No `docs/*.xml` Compass files need updates — this RFC adds a profile, not a repository-wide semantic change.
- No `docs/architecture-dna.md` changes — no new DNA invariant.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0641` — verify RFC passes validation.
- Run `pnpm --filter @warpgogol/forge run build:check` — verify TypeScript compiles.
- Run `pnpm --filter @warpgogol/forge run test` — verify all tests pass including new profile test.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0641 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0641`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0641`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

No acceptance probes declared in this RFC (the `acceptance` frontmatter field is commented out).

No verification evidence needed (RFC-0330 applies only to probe-bearing RFCs created on or after 2026-07-07; this RFC has no probes).

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0641` in the subject line (RFC-0265 commit hygiene)
- Test output showing `editframe-profile.test.ts` passes

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Editframe API changes | Step 1: profile references commands via bindings, not hardcoded in skills — operators update binding values in forge.yaml |
| Profile staleness | Step 1: profile is a starting point; operators customize per project |
| VIDEO invariant subjectivity | Step 1: invariants are warnings by default, errors with `--strict` (RFC-0640) |
| Agent misinterpretation | Step 1: invariant rule text is explicit and scoped to composition files; Step 2: composition-agents.md template provides domain guidance |
| False-positive rate (VIDEO-01) | Step 1: invariant checks filename format only; Step 3: test verifies invariant definitions are correct |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54 (forge bindings contract), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0641 --reason "..." --invariant "DNA-54"` instead of working around it.
- If the profile YAML fails to parse against the extended schema from RFC-0638, verify RFC-0638 is implemented first. This RFC depends on RFC-0638→0639→0640 being implemented in order.
