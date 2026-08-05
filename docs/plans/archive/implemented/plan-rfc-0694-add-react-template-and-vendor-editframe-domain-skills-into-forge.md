---
rfcId: RFC-0694
planId: PLAN-RFC-0694-01
status: implemented
owner: architecture
createdAt: 2026-08-05
updatedAt: 2026-08-05
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0694

## 1. Objectives

- [x] O1 — Replace `html-attribute-pattern` check kind with `attribute-pattern` (elements array) in profile schema and invariant engine — maps to acceptance criteria [5], [6], [7], [8]
- [x] O2 — Rename `editframe-html` profile to `editframe` with React + TypeScript + Vite template — maps to acceptance criteria [1], [2], [3], [4]
- [x] O3 — Vendor 6 Editframe domain skills into `packages/forge/skills/fo/` — maps to acceptance criterion [9]
- [x] O4 — Update `ef-onboard`, `ef-composition-review`, `ef-render-verify` skills for React — maps to acceptance criteria [10], [11], [12], [13]
- [x] O5 — Update tests for React template and `attribute-pattern` check kind — maps to acceptance criteria [14], [15], [16]
- [x] O6 — Update `packages/forge/AGENTS.md` and validate — maps to acceptance criteria [17], [18], [19], [20]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/profiles/profile-schema.ts` — replace `html-attribute-pattern` enum value with `attribute-pattern`; replace `element: z.string().optional()` with `elements: z.array(z.string()).optional()`; update `.refine()` validation
- `packages/forge/src/onboarding/invariant-engine.ts` — replace `html-attribute-pattern` case with `attribute-pattern` case; iterate `elements` array; build element name alternation regex
- `packages/forge/os/core/handlers/invariant-engine.test.ts` — update existing `html-attribute-pattern` tests to `attribute-pattern` with `elements` array; add JSX syntax test case
- `packages/forge/src/tests/editframe-profile.test.ts` — update profile path, id, extensions, workspace type detection, first workspace template assertions
- `packages/forge/src/tests/profile-schema.test.ts` — update if it references `html-attribute-pattern`
- `packages/forge/os/core/handlers/lifecycle-handlers.test.ts` — update if it references `editframe-html`

### 2.2 Configuration and data

- `packages/forge/profiles/editframe-html.yaml` → renamed to `packages/forge/profiles/editframe.yaml` via `git mv`
- `packages/forge/profiles/editframe-html-templates/` → renamed to `packages/forge/profiles/editframe-templates/` via `git mv`
- `packages/forge/profiles/editframe-templates/composition.tsx` — new React composition template (replaces `composition.html`)
- `packages/forge/profiles/editframe-templates/composition-agents.md` — updated for React

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update references from `editframe-html` to `editframe`; update `html-attribute-pattern` documentation to `attribute-pattern`
- `packages/forge/skills/fo/ef-onboard/SKILL.md` — remove `npm create @editframe` step, remove stack preference question, update profile name
- `packages/forge/skills/fo/ef-composition-review/SKILL.md` — update scope to `.tsx` files, React components
- `packages/forge/skills/fo/ef-render-verify/SKILL.md` — update determinism inputs to `compositions/**/*.tsx`
- 6 new skill files: `packages/forge/skills/fo/ef-composition/SKILL.md`, `ef-dev-server/SKILL.md`, `ef-editor-gui/SKILL.md`, `ef-webhooks/SKILL.md`, `ef-brand-video-generator/SKILL.md`, `ef-motion-design/SKILL.md`
- Synced copies in `.agents/skills/` for all 9 ef-* skills (committed alongside source)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/forge run test` — unit tests (vitest)
- `pnpm exec site-kernel run rfc.validate --id RFC-0694` — RFC mechanical validation
- `pnpm exec site-kernel run forge.profile.validate --id editframe` — profile validation
- `pnpm exec site-kernel run forge.skill.validate` — skill validation

## 3. Step sequence

### Step 1. Schema: replace `html-attribute-pattern` with `attribute-pattern`

**Goal:** Update the profile invariant check schema to use `attribute-pattern` with `elements: string[]` instead of `html-attribute-pattern` with `element: string`.

**Agent actions:**

- Edit `packages/forge/src/profiles/profile-schema.ts`:
  - Replace `"html-attribute-pattern"` with `"attribute-pattern"` in the `z.enum()` array
  - Replace `element: z.string().optional()` with `elements: z.array(z.string()).optional()`
  - Update the `.refine()` validation: `v.kind !== "attribute-pattern" || (v.elements != null && v.elements.length > 0 && v.attribute != null && v.pattern != null)`
  - Update the `ProfileInvariantCheck` interface: `kind` union replaces `"html-attribute-pattern"` with `"attribute-pattern"`; replace `element?: string` with `elements?: string[]`
  - Update the refine error message
- Update `MODULE_CONTRACT` purpose and `CHANGE_SUMMARY` in the header comment

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation passes

**Completion criterion:** `profileInvariantCheckSchema` includes `attribute-pattern` in the enum and `elements: z.array(z.string()).optional()` field; `html-attribute-pattern` is removed; `ProfileInvariantCheck` interface uses `elements?: string[]`.

**Human review:** no

---

### Step 2. Engine: replace `html-attribute-pattern` case with `attribute-pattern`

**Goal:** Update the invariant enforcement engine to handle `attribute-pattern` with `elements` array.

**Agent actions:**

- Edit `packages/forge/src/onboarding/invariant-engine.ts`:
  - Replace `case "html-attribute-pattern"` with `case "attribute-pattern"`
  - Replace `const element = check.element` with `const elements = check.elements`
  - Replace `if (!element || !attribute)` with `if (!elements || elements.length === 0 || !attribute)`
  - Build element alternation regex: `const elementAlternation = elements.map(escapeRegex).join("|")` — add an `escapeRegex` helper function if not already present
  - Update element regex: `new RegExp(`<(${elementAlternation})[^>]*>`, "gi")`
  - Update warning message to reference `attribute-pattern` and `elements`
  - Update `MODULE_CONTRACT` purpose and `CHANGE_SUMMARY`
- Edit `packages/forge/os/core/handlers/invariant-engine.test.ts`:
  - Update all existing `html-attribute-pattern` test cases to use `kind: "attribute-pattern"` and `elements: ["ef-timegroup"]` instead of `element: "ef-timegroup"`
  - Add a new test case: `attribute-pattern detects JSX syntax` — create a `.tsx` file with `<Timegroup duration="5s">`, run check with `elements: ["ef-timegroup", "Timegroup"]`, verify it matches
  - Add a new test case: `attribute-pattern with empty elements array produces no violations` — verify schema-level rejection or engine-level skip
  - Update `CHANGE_SUMMARY` in header comment

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test` — all invariant engine tests pass

**Completion criterion:** `invariant-engine.ts` implements `attribute-pattern` case that iterates `elements` array and builds element name alternation regex; `html-attribute-pattern` case is removed; JSX syntax test case passes.

**Human review:** no

---

### Step 3. Profile: rename `editframe-html` to `editframe` with React template

**Goal:** Rename the profile YAML and templates directory, update all profile fields for React + TypeScript + Vite.

**Agent actions:**

- `git mv packages/forge/profiles/editframe-html.yaml packages/forge/profiles/editframe.yaml`
- `git mv packages/forge/profiles/editframe-html-templates packages/forge/profiles/editframe-templates`
- Delete `packages/forge/profiles/editframe-templates/composition.html` (replaced by `composition.tsx`)
- Edit `packages/forge/profiles/editframe.yaml`:
  - `id: editframe` (was `editframe-html`)
  - `displayName: Editframe Video` (was `Editframe HTML Video`)
  - `artifacts[0].extensions`: `[".tsx"]` (was `[".html", ".tsx"]`)
  - `workspaceTypes`: single type `composition` with detection `glob: "*.tsx"`, `contains: TimelineRoot`, `packageJsonDep: "@editframe/react"` — remove the `render-verify` workspace type entirely (RFC says "One type `composition`")
  - `workspaceTypes[0].skills`: keep `ef-onboard`, `ef-composition-review`, `ef-render-verify`
  - `workspaceTypes[0].agentsMdTemplate`: `editframe-templates/composition-agents.md` (was `editframe-html-templates/composition-agents.md`)
  - Update all VIDEO-04..09 invariants: `glob: "compositions/**/*.tsx"`, `kind: attribute-pattern`, `elements: ["ef-timegroup", "Timegroup"]` where applicable
  - Update VIDEO-01: `glob: "compositions/**/*.tsx"`, `pattern: "^[a-z0-9-]+\\.tsx$"`
  - Update VIDEO-02, VIDEO-03: React-aware patterns for `.tsx` files
  - Update VIDEO-08: React-aware `negatedPattern` for nested loop
  - Update `install`: `pnpm add -D @editframe/react @editframe/cli @editframe/vite-plugin @warpgogol/forge turbo prettier react react-dom typescript @types/react @types/react-dom vite @vitejs/plugin-react tailwindcss @tailwindcss/vite`
  - Update `firstWorkspace`: React template with `src/Video.tsx`, `src/main.tsx`, `vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`
  - Update `firstWorkspace.files`: replace `composition.html` with `composition.tsx` containing React components (`TimelineRoot`, `Timegroup`, `Video`, `Text`, `Audio`, `Captions` from `@editframe/react`)
- Create `packages/forge/profiles/editframe-templates/composition.tsx` — sample React composition
- Update `packages/forge/profiles/editframe-templates/composition-agents.md` — reference React components and `@editframe/react`

**Validation:**

- `pnpm exec site-kernel run forge.profile.validate --id editframe` — profile validates against schema

**Completion criterion:** `packages/forge/profiles/editframe.yaml` exists with `id: editframe`, React template in `firstWorkspace`; `editframe-html.yaml` is deleted; `composition.tsx` exists with React components from `@editframe/react`.

**Human review:** no

---

### Step 4. Vendor 6 Editframe domain skills

**Goal:** Create 6 new skill directories under `packages/forge/skills/fo/` with SKILL.md files adapted from Editframe source material.

**Agent actions:**

- For each of the 6 skills (`ef-composition`, `ef-dev-server`, `ef-editor-gui`, `ef-webhooks`, `ef-brand-video-generator`, `ef-motion-design`):
  - Fetch content from `https://editframe.com/skills/<name>.md` (for skills with canonical URLs: `ef-composition`, `ef-dev-server`, `ef-editor-gui`, `ef-webhooks`); for `ef-brand-video-generator` and `ef-motion-design`, try the canonical URL first, fall back to `npm create @editframe` output if unavailable
  - Create `packages/forge/skills/fo/<skill-name>/SKILL.md` with adapted frontmatter:
    - `name`, `description`, `invocation: user`, `category: fo`, `dependsOn: []`, `languagePolicy: ref(PREFERENCES.md)`
    - `concerns`: `read-only` for `ef-dev-server`, `ef-editor-gui`, `ef-webhooks`, `ef-motion-design`; `content-mutation` for `ef-composition`, `ef-brand-video-generator`
    - `triggers`: 2-4 trigger phrases per skill
  - Add `<!-- skill-lint-disable SKILL-17 -->` after frontmatter
  - Adapt instruction lines for SKILL-11: rewrite hardcoded commands to use `ref()` bindings where applicable; retain element names, hook names, package names as factual domain knowledge
- Sync all 6 new skills to `.agents/skills/<name>/SKILL.md` (flat path, no `fo/` nesting)

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` — all 6 new skills pass validation
- `pnpm exec site-kernel run forge.skill.list` — all 6 new skills appear in the list

**Completion criterion:** 6 new skill directories exist with `SKILL.md` passing `forge.skill.validate`; synced copies exist in `.agents/skills/`.

**Human review:** no

---

### Step 5. Update existing ef-* skills for React

**Goal:** Update `ef-onboard`, `ef-composition-review`, `ef-render-verify` to reference React template and `.tsx` files.

**Agent actions:**

- Edit `packages/forge/skills/fo/ef-onboard/SKILL.md`:
  - Step 2 (Discovery): remove the stack preference question (React is the only template)
  - Step 3 (Scaffold): `forge create --profile editframe` (was `--profile editframe-html`)
  - Step 4 (Domain skills installation): removed entirely
  - Step 5 (Domain knowledge reading): update to reference the 6 vendored `ef-*` skills plus `ef-composition-review` and `ef-render-verify`
  - Renumber steps (6→5, 7→6)
- Edit `packages/forge/skills/fo/ef-composition-review/SKILL.md`:
  - Scope: update to `.tsx` files using `@editframe/react` components
  - Time model review: check `Timegroup` props instead of `ef-timegroup` attributes
  - Accessibility review: check `Captions` components for `Audio` with speech content
  - Step 5 (Invariant check): reference `editframe` profile (was `editframe-html`)
- Edit `packages/forge/skills/fo/ef-render-verify/SKILL.md`:
  - Scope: update to `.tsx` files using `editframe` profile
  - Determinism check: reference `compositions/**/*.tsx`
  - Output inspection: check `.tsx` root `Timegroup` `duration` prop
- Sync all 3 updated skills to `.agents/skills/<name>/SKILL.md`

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` — all 3 updated skills pass validation

**Completion criterion:** `ef-onboard/SKILL.md` does not contain `npm create @editframe` or stack preference question; `ef-composition-review/SKILL.md` references `.tsx` and React components; `ef-render-verify/SKILL.md` references `compositions/**/*.tsx`.

**Human review:** no

---

### Step 6. Update tests

**Goal:** Update all test files that reference `editframe-html` or `html-attribute-pattern`.

**Agent actions:**

- Edit `packages/forge/src/tests/editframe-profile.test.ts`:
  - Update `PROFILE_PATH` to `editframe.yaml`
  - Update `profile.id` assertion to `editframe`
  - Update artifact extensions assertion: expect `.tsx`, not `.html`
  - Update workspace type detection assertions: `glob: "*.tsx"`, `contains: TimelineRoot`, `packageJsonDep: "@editframe/react"`
  - Update first workspace assertion: expect `composition.tsx` with `TimelineRoot`, not `composition.html` with `ef-timegroup`
  - Update `CHANGE_SUMMARY` in header comment
- Edit `packages/forge/src/tests/profile-schema.test.ts` — update any `html-attribute-pattern` references to `attribute-pattern` with `elements` array
- Edit `packages/forge/os/core/handlers/lifecycle-handlers.test.ts` — update any `editframe-html` references to `editframe`
- Edit `packages/forge/src/tests/agents-generate-domain.test.ts` — update any `editframe-html` references to `editframe`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** `editframe-profile.test.ts` loads `editframe.yaml` and verifies React template fields; `invariant-engine.test.ts` has JSX syntax test case; all tests pass.

**Human review:** no

---

### Step 7. Update AGENTS.md and run validation

**Goal:** Update `packages/forge/AGENTS.md` to reference `editframe` profile and `attribute-pattern` check kind.

**Agent actions:**

- Edit `packages/forge/AGENTS.md`:
  - Replace `editframe-html` with `editframe` in all references
  - Replace `html-attribute-pattern` with `attribute-pattern` in the invariant documentation
  - Update the skill count if needed (currently "29 fo skills + 4 shared + 3 meta = 36 skills" — add 6 new ef-* skills)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `commands.changed` lists 3 existing commands)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run rfc.validate --id RFC-0694`

**Completion criterion:** `packages/forge/AGENTS.md` references `editframe` profile; `forge build:check` passes; `forge test` passes; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0694 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0694`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0694`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run forge.profile.validate --id editframe`
- `pnpm exec site-kernel run forge.skill.validate`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0694.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0694` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Vendored skill staleness | Step 4: each skill frontmatter records source URL for future sync checks |
| SKILL-11 adaptation burden | Step 4: only command references need binding treatment; element/hook/package names are domain knowledge |
| Profile rename confusion | Step 3: `git mv` preserves history; no external documentation references `editframe-html` yet |
| `attribute-pattern` regex complexity | Step 2: JSX expression props (`duration={...}`) are skipped — acceptable for string-literal time values |
| Agent misinterpretation of old kind | Step 1: schema enum rejects `html-attribute-pattern` with validation error |
| React template dependency bloat | Step 3: install list contains standard React tooling deps only |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0694 --reason "..." --invariant "DNA-54"` instead of working around it.
- If `ef-brand-video-generator` or `ef-motion-design` source content is unavailable at both the canonical URL and `npm create @editframe`, stop and ask the operator for guidance.
