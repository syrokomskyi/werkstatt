---
rfcId: RFC-0774
planId: PLAN-RFC-0774-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
    - packages/os/site-kernel-astro
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-codegen
    - packages/os/site-kernel-content
    - packages/os/site-kernel-onboarding
    - packages/os/site-kernel-audit
    - packages/os/site-kernel-deploy
    - packages/os/site-kernel-changelog
    - packages/os/site-kernel-check-warpgogol
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - packages/AGENTS.md
    - docs/PACKAGE_GRAPH.md
---

# Implementation Plan: RFC-0774

## 1. Objectives

- [ ] O1 — Create `packages/werkstatt-site` with `profileId: "astro-typescript-turborepo"` and plugin entry point — maps to acceptance criterion 1
- [ ] O2 — Move all site-stack engine modules into `packages/werkstatt-site/src/` preserving command ids and behavior — maps to acceptance criteria 2, 6
- [ ] O3 — Wire plugin registration via `WerkstattPlugin` contract and pass `werkstatt.plugin.validate` — maps to acceptance criterion 3
- [ ] O4 — Verify Cloudflare Workers deploy adapter works through `deployAdapters` (lightweight: adapter factory unit test + plugin validate; full deploy verification deferred to post-implementation) — maps to acceptance criterion 4
- [ ] O5 — Delete old site-kernel stack packages after move, with RFC-0772 re-export scaffold bridging the gap — maps to acceptance criterion 5
- [ ] O6 — `rfc.validate` passes on RFC-0774 — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

- **New package:** `packages/werkstatt-site/` (package.json, tsconfig.json, src/, extract.config.yaml per RFC-0773)
- **Plugin entry point:** `packages/werkstatt-site/src/index.ts` — exports `werkstattSitePlugin: WerkstattPlugin`
- **Moved modules (source → destination):**
  - `packages/os/site-kernel-astro/src/` → `packages/werkstatt-site/src/paths/`
  - `packages/os/site-kernel-content/src/` → `packages/werkstatt-site/src/content/`
  - `packages/os/site-kernel-codegen/src/` → `packages/werkstatt-site/src/codegen/`
  - `packages/os/site-kernel-checks/src/` → `packages/werkstatt-site/src/checks/` (31 command table files, 10 pipeline files, 140 test files, surface machinery, Axiom adapter)
  - `packages/os/site-kernel-onboarding/src/` → `packages/werkstatt-site/src/onboarding/`
  - `packages/os/site-kernel-audit/src/` → `packages/werkstatt-site/src/audit/`
  - `packages/os/site-kernel-check-warpgogol/src/` → `packages/werkstatt-site/src/checks/check-warpgogol/`
  - `packages/os/site-kernel-changelog/src/` (renderers only; pipeline core stays in engine per RFC-0771) → `packages/werkstatt-site/src/changelog/`
  - Cloudflare Workers adapter from `packages/os/site-kernel-handoff/src/deploy/` + `packages/os/site-kernel-deploy/src/` → `packages/werkstatt-site/src/deploy/cloudflare-workers/`
- **No command ids change** — all existing kernel commands keep their ids and behavior
- **`tools/kernel.config.ts`** — NOT modified in this RFC (RFC-0776 does the atomic switch; re-export scaffold from RFC-0772 bridges the gap)

### 2.2 Configuration and data

- `packages/werkstatt-site/package.json` — name: `@warpgogol/werkstatt-site`, exports map with subpath exports for each module
- `packages/werkstatt-site/tsconfig.json` — extends `tsconfig/base.json`
- `packages/werkstatt-site/extract.config.yaml` — RFC-0773 publication config (added in this RFC or RFC-0773's implementation)
- `pnpm-workspace.yaml` — already includes `packages/*`, no change needed

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — new, documenting the plugin's module layout and ownership
- `packages/AGENTS.md` — update ownership table: remove old `site-kernel-*` entries, add `werkstatt-site`
- `docs/PACKAGE_GRAPH.md` — regenerate after consolidation
- `docs/architecture-dna.md` — no change (DNA-64 addition is RFC-0769's responsibility)

### 2.4 Validation and pipelines

- `werkstatt.plugin.validate` (from RFC-0770) — validates plugin registration
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt-site run test` — unit tests (moved from old packages)
- `pnpm exec site-kernel run command.manifest.generate` — verify command id parity
- `packages.check` pipeline — verify no regressions

## 3. Step sequence

### Step 1. Create `packages/werkstatt-site` skeleton

**Goal:** Create the new package with directory structure and plugin entry point types.

**Agent actions:**

- Create `packages/werkstatt-site/package.json` with `name: "@warpgogol/werkstatt-site"`, `private: true`, `type: "module"`, `exports` map (to be filled as modules move in), `scripts: { build: "tsc --noEmit", "build:check": "tsc --noEmit", test: "vitest run" }`, `dependencies: { "@warpgogol/werkstatt": "workspace:*" }`
- Create `packages/werkstatt-site/tsconfig.json` extending `tsconfig/base.json`
- Create directory structure: `src/{paths,checks,codegen,content,onboarding,audit,deploy,changelog,build,release-evidence}/`
- Create `src/index.ts` skeleton with `export const werkstattSitePlugin: WerkstattPlugin = { ... }` (fields populated as modules move in)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes (skeleton may have placeholder imports)

**Completion criterion:** `packages/werkstatt-site` exists with the directory layout from RFC-0774's Design section and `package.json` declares `profileId` reference and `@warpgogol/werkstatt` dependency.

**Human review:** no

---

### Step 2. Move small site-stack modules (astro, content, codegen, onboarding, audit, changelog renderers, check-warpgogol)

**Goal:** Move the smaller site-stack packages into `packages/werkstatt-site/src/`.

**Agent actions:**

- Move `packages/os/site-kernel-astro/src/` → `packages/werkstatt-site/src/paths/` (single `index.ts` file — Astro path conventions)
- Move `packages/os/site-kernel-content/src/` → `packages/werkstatt-site/src/content/` (content files, i18n config, semantic loader, system manifest)
- Move `packages/os/site-kernel-codegen/src/` → `packages/werkstatt-site/src/codegen/` (boilerplate, templates, props types, open-source page, section scaffold)
- Move `packages/os/site-kernel-onboarding/src/` → `packages/werkstatt-site/src/onboarding/` (scaffold templates, token application)
- Move `packages/os/site-kernel-audit/src/` → `packages/werkstatt-site/src/audit/` (delta audit engine)
- Move `packages/os/site-kernel-check-warpgogol/src/` → `packages/werkstatt-site/src/checks/check-warpgogol/` (check-warpgogol ecosystem commands)
- Move `packages/os/site-kernel-changelog/src/` renderers → `packages/werkstatt-site/src/changelog/` (pipeline core stays in engine per RFC-0771)
- Update intra-plugin import paths: `@warpgogol/site-kernel-astro` → `./paths/`, `@warpgogol/site-kernel-content` → `./content/`, etc.
- Update `package.json` exports map with subpath exports for each moved module
- Install temporary re-export shims in old package entry points (per RFC-0772 scaffold pattern) so `tools/kernel.config.ts` keeps building

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — moved test suites pass

**Completion criterion:** All small site-stack modules are in `packages/werkstatt-site/src/` with correct intra-plugin imports; old package entry points re-export from new location; typecheck and tests pass.

**Human review:** no

---

### Step 3. Move `site-kernel-checks` (command tables, pipelines, surface machinery, tests)

**Goal:** Move the largest site-stack package — `site-kernel-checks` (31 command table files, 10 pipeline files, 140 test files, surface machinery, Axiom adapter) — into `packages/werkstatt-site/src/checks/`.

**Agent actions:**

- Move `packages/os/site-kernel-checks/src/` → `packages/werkstatt-site/src/checks/` as-is (no restructuring — command tables stay in `command-tables/`, pipelines stay in `pipelines/`, tests stay in `tests/`)
- Update intra-plugin import paths: `@warpgogol/site-kernel-checks` → `./checks/`, `@warpgogol/site-kernel-codegen` → `./codegen/`, `@warpgogol/site-kernel-content` → `./content/`, `@warpgogol/site-kernel-astro` → `./paths/`
- Update `package.json` exports map with subpath exports for `./checks`, `./checks/suppressions-config`, `./checks/methodologies-config`, `./checks/pipelines/packages-check`, etc. (mirror current subpath exports)
- Install temporary re-export shim in `packages/os/site-kernel-checks/src/index.ts` pointing to `packages/werkstatt-site/src/checks/`
- **Command id parity check:** run `pnpm exec site-kernel run command.manifest.generate` and diff the command list against the pre-move baseline — zero command ids may change
- **Test fixture path repair:** update test fixtures that reference old package names (`@warpgogol/site-kernel-checks`, `@warpgogol/site-kernel-codegen`, etc.) to new intra-plugin paths. Budget explicit time for this — 140 test files may have fixture path references.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — all 140+ test files pass from new location
- `pnpm exec site-kernel run command.manifest.generate` — command manifest unchanged (zero command id diffs)

**Completion criterion:** `site-kernel-checks` fully moved into `checks/`; all command ids preserved; all tests pass from new location; command manifest shows zero diffs.

**Human review:** no

---

### Step 4. Move Cloudflare Workers deploy adapter

**Goal:** Move the concrete Cloudflare Workers deploy adapter into `packages/werkstatt-site/src/deploy/cloudflare-workers/`.

**Agent actions:**

- Identify the concrete Cloudflare Workers adapter code in `packages/os/site-kernel-handoff/src/deploy/` (adapter implementation, not the framework) and `packages/os/site-kernel-deploy/src/` (client export)
- Move adapter implementation → `packages/werkstatt-site/src/deploy/cloudflare-workers/`
- The adapter framework stays in the engine (`packages/werkstatt/src/deploy/`) per RFC-0771
- Update the plugin entry point's `deployAdapters: { "cloudflare-workers": createCloudflareWorkersAdapter }`
- Install temporary re-export shims in old locations

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Adapter factory unit test: verify `createCloudflareWorkersAdapter` returns a valid `DeployAdapter` instance

**Completion criterion:** Cloudflare Workers deploy adapter is in `deploy/cloudflare-workers/`; adapter factory produces a valid adapter instance; engine adapter framework is not imported into the plugin.

**Human review:** no

---

### Step 5. Wire plugin entry point and validate registration

**Goal:** Complete the `werkstattSitePlugin` entry point with all module loaders, pipelines, hooks, deploy adapters, and path conventions. Pass `werkstatt.plugin.validate`.

**Agent actions:**

- Fill `src/index.ts` with the complete plugin object:
  - `schema: "werkstatt/plugin@1"`
  - `id: "werkstatt-site"`
  - `profileId: "astro-typescript-turborepo"`
  - `paths: astroPathConventions` (from `paths/`)
  - `moduleLoaders: { check, codegen, content, onboarding, audit, changelog, "check-warpgogol": ... }` — each maps to the moved module's factory function
  - `pipelines: { "build.prepare": [...], "build.check": [...] }` — from `checks/pipelines/`
  - `deployAdapters: { "cloudflare-workers": createCloudflareWorkersAdapter }`
  - `hooks: { materialize, build, checkGate, releaseEvidence, scaffoldProject }` — each delegates to the moved module's hook implementation
- Run `pnpm exec site-kernel run werkstatt.plugin.validate --json` — verify: exactly one plugin registered, profileId matches forge stack profile, all moduleLoaders resolve, deploy adapters referenced in registry exist

**Validation:**

- `pnpm exec site-kernel run werkstatt.plugin.validate --json` — status: pass, zero violations
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** Plugin registers via `WerkstattPlugin` and passes `werkstatt.plugin.validate` with zero violations.

**Human review:** no

---

### Step 6. Delete old site-kernel stack packages

**Goal:** Remove the old package directories after all content has been moved and re-export shims are in place.

**Agent actions:**

- Verify all old packages have re-export shims pointing to `packages/werkstatt-site`
- Delete `packages/os/site-kernel-astro/`
- Delete `packages/os/site-kernel-content/`
- Delete `packages/os/site-kernel-codegen/`
- Delete `packages/os/site-kernel-onboarding/`
- Delete `packages/os/site-kernel-audit/`
- Delete `packages/os/site-kernel-check-warpgogol/`
- Delete `packages/os/site-kernel-changelog/` (renderer parts only; pipeline core already moved to engine by RFC-0772)
- Delete `packages/os/site-kernel-deploy/`
- Delete `packages/os/site-kernel-checks/` (after re-export shim verified)
- Update `pnpm-workspace.yaml` if needed (should still glob `packages/os/*`)
- Run `pnpm install` to update lockfile

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck still passes (re-export shims from RFC-0772 bridge `kernel.config.ts` imports)
- `pnpm exec site-kernel run packages.check` — no regressions
- `git status` — old package directories are deleted

**Completion criterion:** All old site-kernel stack package directories are deleted; workshop still builds via re-export scaffold; `packages.check` passes.

**Human review:** no

---

### Step 7. Documentation sync

**Goal:** Update all documentation artifacts to reflect the consolidation.

**Agent actions:**

- Create `packages/werkstatt-site/AGENTS.md` — document the plugin's module layout, ownership, entry points, and dependencies
- Update `packages/AGENTS.md` — remove old `site-kernel-*` ownership entries, add `werkstatt-site` entry
- Regenerate `docs/PACKAGE_GRAPH.md` (or update manually if regeneration command is unavailable)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if package topology changed
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces changed (should be no change — command ids are preserved)

**Validation:**

- `git diff --stat` — documentation files are updated
- `pnpm exec site-kernel run rfc.validate --id RFC-0774` — still passes

**Completion criterion:** All documentation artifacts in scope are updated; `PACKAGE_GRAPH.md` reflects the new package structure.

**Human review:** no

---

### Final Step. Review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- **Verify every file listed in `scope.docs` is updated** — check each path against `git diff`; if a scope doc was not modified, document why.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
  - Criterion 4 (deploy adapter): lightweight check = adapter factory unit test + `werkstatt.plugin.validate` passing. Full `leitstand dev-deploy → promote` cycle verification is deferred to post-implementation (RFC-0776 workshop migration), noted in the evidence annotation.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0774 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0774`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0774`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec site-kernel run werkstatt.plugin.validate --json`
- `pnpm exec site-kernel run command.manifest.generate` (command id parity check)
- `pnpm exec site-kernel run packages.check` (no regressions)

### 4.2 Evidence artifacts

- Command manifest diff (pre-move vs post-move) showing zero command id changes
- `werkstatt.plugin.validate --json` output showing status: pass
- Review report in `docs/reviews/code/` for this session
- Commit messages referencing `RFC-0774` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| `site-kernel-checks` is the largest os package (command tables, surface machinery, Axiom adapter) | Step 3 is a dedicated step for `site-kernel-checks` with command id parity check and test fixture path repair budget |
| Cross-imports between checks and codegen become intra-package imports | Steps 2–3 update all `@warpgogol/site-kernel-*` imports to intra-plugin paths; typecheck gates each step |
| Command ids are contract — must not change | Step 3 includes `command.manifest.generate` diff check; Step 5 validates via `werkstatt.plugin.validate` |
| Test fixture path references to old package names | Step 3 budgets explicit time for test fixture path repair (140 test files) |
| Old packages deleted but `kernel.config.ts` still imports from them | Re-export scaffold from RFC-0772 bridges the gap; RFC-0776 does the atomic switch |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-3 or DNA-5, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0774 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the plugin contract (RFC-0770) is missing a needed hook or module loader slot, do not bypass the registry — create an amending RFC via `fo-idea-create-rfc` with `amends: [RFC-0770]`.
- If `site-kernel-check-warpgogol` cannot resolve its `check-core`/`check-runner-node` dependencies through RFC-0775's domain layer (e.g. RFC-0775 not yet implemented), escalate to the operator — the dependency ordering between RFC-0774 and RFC-0775 may need adjustment.
