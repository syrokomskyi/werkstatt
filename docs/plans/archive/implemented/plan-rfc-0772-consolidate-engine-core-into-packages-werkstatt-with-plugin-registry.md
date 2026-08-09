---
rfcId: RFC-0772
planId: PLAN-RFC-0772-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
    - packages/os/site-kernel
    - packages/os/site-kernel-handoff
    - packages/os/site-kernel-integrity
    - packages/os/site-kernel-observability
    - packages/os/site-kernel-changelog
    - packages/os/site-kernel-deploy
    - packages/fingerprint
    - packages/agent-gate
    - packages/share
    - packages/ontology
  services: []
  docs:
    - docs/PACKAGE_GRAPH.md
    - AGENTS.md
    - docs/requirements.xml
    - docs/technology.xml
---

# Implementation Plan: RFC-0772

## 0. Precondition

**RFC-0769 must be implemented first.** RFC-0769 appends DNA-64 to `docs/architecture-dna.md`. Without DNA-64 in the registry, `satisfies[]` cannot include it and the autonomy guard's DNA reference is ungrounded. Verify before starting:

```sh
grep -q "## DNA-64" docs/architecture-dna.md && echo "OK" || echo "BLOCKED: RFC-0769 not implemented"
```

If blocked, stop and implement RFC-0769 first.

## 1. Objectives

- [ ] O1 — `packages/werkstatt` exists with all RFC-0771 engine modules → maps to AC[1]
- [ ] O2 — Plugin registry and hooks implemented in `src/plugin/` → maps to AC[2]
- [ ] O3 — All engine→stack call sites inverted through plugin hooks → maps to AC[3]
- [ ] O4 — `werkstatt.autonomy.validate` registered and wired into `packages.check` → maps to AC[4,5]
- [ ] O5 — Re-export shims in old packages keep workshop building → maps to AC[6]
- [ ] O6 — Documentation synchronized (PACKAGE_GRAPH.md, AGENTS.md, Compass XML) → maps to AC[7,8,9]
- [ ] O7 — `rfc.validate` passes → maps to AC[10]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/` — new engine package (package.json, tsconfig.json, src/, bin/)
- `packages/werkstatt/src/kernel/` — moved from `packages/os/site-kernel/`
- `packages/werkstatt/src/mission/` — moved from `packages/os/site-kernel-handoff/src/mission/`
- `packages/werkstatt/src/sternsystem/` — moved from `packages/os/site-kernel-handoff/src/sternsystem/`
- `packages/werkstatt/src/release/` — moved from `packages/os/site-kernel-handoff/src/release/`
- `packages/werkstatt/src/leitstand/` — moved from `packages/os/site-kernel-handoff/src/leitstand/`
- `packages/werkstatt/src/bordbuch/` — moved from `packages/os/site-kernel-handoff/src/bordbuch/`
- `packages/werkstatt/src/notausgang/` — moved from `packages/os/site-kernel-handoff/src/notausgang/`
- `packages/werkstatt/src/artifact-store/` — moved from `packages/os/site-kernel-handoff/src/artifact-store/`
- `packages/werkstatt/src/evidence/` — moved from `packages/os/site-kernel-handoff/src/evidence/`
- `packages/werkstatt/src/deploy/` — moved from `packages/os/site-kernel-handoff/src/deploy/` + `packages/os/site-kernel-deploy/`
- `packages/werkstatt/src/identity/` — moved from `packages/os/site-kernel-handoff/src/identity/`
- `packages/werkstatt/src/werkstatt/` — moved from `packages/os/site-kernel-handoff/src/werkstatt/`
- `packages/werkstatt/src/integrity/` — moved from `packages/os/site-kernel-integrity/`
- `packages/werkstatt/src/observability/` — moved from `packages/os/site-kernel-observability/`
- `packages/werkstatt/src/fingerprint/` — moved from `packages/fingerprint/`
- `packages/werkstatt/src/agent-gate/` — moved from `packages/agent-gate/`
- `packages/werkstatt/src/changelog/` — moved from `packages/os/site-kernel-changelog/` (pipeline core only)
- `packages/werkstatt/src/plugin/` — new: plugin registry + hooks (RFC-0770 contract)
- `packages/werkstatt/src/schemas/` — new: operations schemas from `packages/share` + `packages/ontology`
- Old packages (`packages/os/site-kernel*`, `packages/fingerprint`, `packages/agent-gate`) — re-export shims pointing to `@warpgogol/werkstatt/*`
- `werkstatt.autonomy.validate` — new workspace-scoped command
- `packages.check` pipeline — gains `werkstatt.autonomy.validate` step

### 2.2 Configuration and data

- `packages/werkstatt/package.json` — `name: @warpgogol/werkstatt`, `bin: werkstatt`, subpath exports
- `packages/werkstatt/tsconfig.json` — extends `tsconfig/base.json`
- `tools/kernel.config.ts` — unchanged in this RFC (rewrite deferred to RFC-0776)
- `pnpm-workspace.yaml` — gains `packages/werkstatt` (automatic via glob)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0772-*.md` — read-only reference
- `AGENTS.md` (root) — § Monorepo layout updated to reference `packages/werkstatt`
- `packages/werkstatt/AGENTS.md` — new: engine package agent guide
- `docs/PACKAGE_GRAPH.md` — regenerated with new package structure
- `docs/requirements.xml` — package structure changes
- `docs/technology.xml` — package structure changes
- `docs/architecture-dna.md` — DNA-64 added by RFC-0769 (precondition, not this plan)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck engine package
- `pnpm --filter @warpgogol/werkstatt run test` — engine test suite
- `pnpm exec werkstatt run werkstatt.autonomy.validate --json` — autonomy guard
- `packages.check` pipeline — includes autonomy guard step (phase 6)
- `pnpm exec werkstatt run rfc.validate --id RFC-0772` — RFC validation

## 3. Step sequence

### Step 1. Phase 1 — Create `packages/werkstatt` skeleton, move kernel core

**Goal:** Create the new engine package skeleton and move the kernel core (`packages/os/site-kernel/`) into `packages/werkstatt/src/kernel/`. Wire subpath exports.

**Agent actions:**

- Create `packages/werkstatt/package.json` with `name: @warpgogol/werkstatt`, `bin: werkstatt`, and subpath exports mirroring `@warpgogol/site-kernel` entry points.
- Create `packages/werkstatt/tsconfig.json` extending `tsconfig/base.json`.
- Move `packages/os/site-kernel/src/**` → `packages/werkstatt/src/kernel/**` (preserve directory structure).
- Move `packages/os/site-kernel/bin/**` → `packages/werkstatt/bin/**`.
- Move test files (`*.test.ts`) alongside their source modules.
- Update all internal imports within moved files from `@warpgogol/site-kernel` to relative paths within `packages/werkstatt/src/kernel/`.
- Create re-export shim in `packages/os/site-kernel/`: replace source files with `export * from "@warpgogol/werkstatt/kernel"` (and named re-exports for each subpath entry point).
- Update `packages/os/site-kernel/package.json` to depend on `@warpgogol/werkstatt` (`workspace:*`).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes.
- `pnpm --filter @warpgogol/site-kernel run build:check` — re-export shim typechecks.
- Kernel test suite passes: `pnpm --filter @warpgogol/werkstatt run test`.

**Completion criterion:** `packages/werkstatt` exists, `src/kernel/` contains all moved kernel modules, `build:check` passes for both `@warpgogol/werkstatt` and `@warpgogol/site-kernel` (re-export shim), kernel tests pass.

**Human review:** no

---

### Step 2. Phase 2 — Move handoff modules

**Goal:** Move all handoff modules from `packages/os/site-kernel-handoff/src/` into `packages/werkstatt/src/`. Create re-export shims.

**Agent actions:**

- Move `src/mission/` → `packages/werkstatt/src/mission/`
- Move `src/sternsystem/` → `packages/werkstatt/src/sternsystem/`
- Move `src/release/` → `packages/werkstatt/src/release/`
- Move `src/leitstand/` → `packages/werkstatt/src/leitstand/`
- Move `src/bordbuch/` → `packages/werkstatt/src/bordbuch/`
- Move `src/notausgang/` → `packages/werkstatt/src/notausgang/`
- Move `src/artifact-store/` → `packages/werkstatt/src/artifact-store/`
- Move `src/evidence/` → `packages/werkstatt/src/evidence/`
- Move `src/deploy/` → `packages/werkstatt/src/deploy/` (also fold in `packages/os/site-kernel-deploy/` adapter framework)
- Move `src/identity/` → `packages/werkstatt/src/identity/`
- Move `src/werkstatt/` (primitives) → `packages/werkstatt/src/werkstatt/`
- Move all test files (`src/tests/*.test.ts`) alongside their source modules.
- Update internal imports within moved files: `@warpgogol/site-kernel` → `@warpgogol/werkstatt/kernel`, `@warpgogol/fingerprint` → `@warpgogol/werkstatt/fingerprint`, relative paths adjusted.
- **Do NOT update `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-checks` imports yet** — these are stack-specific and will be inverted in phase 5.
- Create re-export shims in `packages/os/site-kernel-handoff/` for each module entry point.
- Update `packages/os/site-kernel-handoff/package.json` to depend on `@warpgogol/werkstatt` (`workspace:*`).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes (with stack-specific imports still present as `@warpgogol/site-kernel-*` — these are NOT autonomy violations yet because the guard is not installed until phase 6).
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — re-export shim typechecks.
- Handoff test suite passes: `pnpm --filter @warpgogol/werkstatt run test` (mission, release, leitstand, bordbuch, sternsystem, notausgang, artifact-store, evidence, deploy, identity, werkstatt tests).

**Completion criterion:** All handoff modules moved to `packages/werkstatt/src/`, re-export shims in place, `build:check` and tests pass for both packages.

**Human review:** no

---

### Step 3. Phase 3 — Move integrity, observability, fingerprint, agent-gate, changelog

**Goal:** Move remaining engine modules into `packages/werkstatt/src/`. Create re-export shims.

**Agent actions:**

- Move `packages/os/site-kernel-integrity/` → `packages/werkstatt/src/integrity/`
- Move `packages/os/site-kernel-observability/` → `packages/werkstatt/src/observability/`
- Move `packages/fingerprint/` → `packages/werkstatt/src/fingerprint/` (both entry points: main + semantic)
- Move `packages/agent-gate/` → `packages/werkstatt/src/agent-gate/`
- Move `packages/os/site-kernel-changelog/` pipeline core → `packages/werkstatt/src/changelog/` (site-specific renderers stay in old package for now — they move to the site plugin in RFC-0774)
- Move all test files alongside their source modules.
- Update internal imports within moved files.
- Create re-export shims in each old package.
- Update each old package's `package.json` to depend on `@warpgogol/werkstatt` (`workspace:*`).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — full engine typecheck.
- `pnpm --filter @warpgogol/werkstatt run test` — all engine tests pass.
- `pnpm --filter @warpgogol/site-kernel-integrity run build:check` — re-export shim typechecks.
- `pnpm --filter @warpgogol/site-kernel-observability run build:check` — re-export shim typechecks.
- `pnpm --filter @warpgogol/fingerprint run build:check` — re-export shim typechecks.
- `pnpm --filter @warpgogol/agent-gate run build:check` — re-export shim typechecks.
- `pnpm --filter @warpgogol/site-kernel-changelog run build:check` — re-export shim typechecks.
- Full `packages.check` passes (all packages still build via re-exports).

**Completion criterion:** All engine modules moved, re-export shims in place, `packages.check` passes.

**Human review:** no

---

### Step 4. Phase 4 — Extract operations schemas

**Goal:** Extract operations schemas from `packages/share` and `packages/ontology` into `packages/werkstatt/src/schemas/`. Engine modules that today import `@warpgogol/share` or `@warpgogol/ontology/operations` take the needed schemas with them.

**Agent actions:**

- Identify all operations schemas imported by engine modules: `buildIdentitySchema` from `@warpgogol/ontology/operations` (used in `leitstand-commands.ts`), and any `@warpgogol/share` schemas used by engine modules.
- Move identified schema files to `packages/werkstatt/src/schemas/`.
- Update engine module imports: `@warpgogol/ontology/operations` → `../schemas/operations`, `@warpgogol/share` → `../schemas/share` (or relative paths).
- Create re-export shims in `packages/ontology` and `packages/share` for the moved schemas.
- Site-facing remainder of `share`/`ontology` stays in place (moves to site plugin in RFC-0775).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — schema consumers typecheck.
- `pnpm --filter @warpgogol/ontology run build:check` — re-export shim typechecks.
- `pnpm --filter @warpgogol/share run build:check` — re-export shim typechecks.
- Engine tests pass.

**Completion criterion:** Operations schemas in `packages/werkstatt/src/schemas/`, engine modules import from local schemas, `build:check` passes for engine and re-export shims.

**Human review:** no

---

### Step 5. Phase 5 — Implement plugin registry + hooks; invert call sites

**Goal:** Implement the plugin registry (RFC-0770) in `packages/werkstatt/src/plugin/`. Invert all engine→stack call sites through plugin hooks. Behavior parity proven by unchanged test assertions.

**Agent actions:**

- **5a. Implement plugin contract types** in `packages/werkstatt/src/plugin/contract.ts`:
  - `WerkstattPlugin`, `WerkstattPluginHooks`, `PluginRegistry`, `PluginHookContext`, `HookResult`, `StackPathConventions`, `StackInvariant` per RFC-0770.
- **5b. Implement plugin registry** in `packages/werkstatt/src/plugin/registry.ts`:
  - `register(plugin: WerkstattPlugin): void`
  - `resolve(): WerkstattPlugin` — throws `PLUGIN-01` if zero or multiple plugins.
  - Hook invocation helper: `invokeHook(name, ctx)` — calls the registered plugin's hook, throws if no plugin registered.
- **5c. Invert call sites in `mission-materialize.ts`:**
  - `runGenerate*` from `@warpgogol/site-kernel-codegen` → `plugin.hooks.materialize(ctx)`
  - `applyTokens`, `readTemplate`, `readRuntimeTemplate` from `@warpgogol/site-kernel-onboarding` → `plugin.hooks.materialize(ctx)` or `plugin.hooks.scaffoldProject(ctx)`
  - Axiom check gate → `plugin.hooks.checkGate(ctx)`
  - Astro build invocation → `plugin.hooks.build(ctx)`
  - Remove direct `@warpgogol/site-kernel-codegen` and `@warpgogol/site-kernel-onboarding` imports.
- **5d. Invert call sites in `leitstand-commands.ts`:**
  - `dev-deploy` build step → `plugin.hooks.build(ctx)`
  - `dev-deploy` check gate (Axiom via `@syrokomskyi/axiom-factory-app`) → `plugin.hooks.checkGate(ctx)`
  - Remove direct `@syrokomskyi/axiom-factory-app` and `@syrokomskyi/axiom-study` imports from engine code.
- **5e. Invert call sites in `release-commands.ts`:**
  - behavior snapshot generation → `plugin.hooks.releaseEvidence(ctx)`
  - release build step → `plugin.hooks.build(ctx)`
- **5f. Create a temporary site plugin adapter** that bridges the hooks to the current `@warpgogol/site-kernel-codegen` / `@warpgogol/site-kernel-onboarding` / Axiom calls. This adapter lives in `tools/kernel.config.ts` or a temporary file and is replaced by the real site plugin in RFC-0774. It is a construction scaffold, not a permanent artifact.
- **5g. Run behavior parity tests:**
  - Mission materialize tests: `mission-materialize-baseline.test.ts`, `mission-materialize-artifact-cache.test.ts`, `mission-materialize-force-cache-bypass.test.ts`, `mission-materialize-preflight-skip.test.ts`
  - Leitstand tests: `leitstand-0608-*.test.ts`, `leitstand-0628-dev-deploy.test.ts`, `leitstand-0649-freshness.test.ts`, `leitstand-0689-cache-snapshot.test.ts`, `leitstand-0700-release-dev-deploy.test.ts`
  - Release tests: `release-0585-dist-guard.test.ts`, `release-0596-artifact-storage.test.ts`, `release-0608-build-identity.test.ts`, `release-prepare-release-id.test.ts`, `release-state-validate.test.ts`
  - All test assertions must pass unchanged — tests move, assertions do not.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — engine typechecks with zero `@warpgogol/site-kernel-*` imports in `mission-materialize.ts`, `leitstand-commands.ts`, `release-commands.ts`.
- All mission/release/leitstand test suites pass with unchanged assertions.
- `pnpm --filter @warpgogol/werkstatt run test` — full engine test suite green.

**Completion criterion:** Plugin registry and hooks implemented; all listed call sites inverted; zero `@warpgogol/site-kernel-*` or `@syrokomskyi/axiom-*` imports in the three target files; all mission/release/leitstand tests pass unchanged.

**Human review:** yes — hook inversion changes engine behavior paths. Operator should verify that the temporary site plugin adapter correctly bridges to existing site-stack calls before tests are considered valid parity evidence.

---

### Step 6. Phase 6 — Install `werkstatt.autonomy.validate`; update PACKAGE_GRAPH.md

**Goal:** Implement and install the autonomy guard command. Update documentation. Do NOT delete old packages (deferred to RFC-0776).

**Agent actions:**

- **6a. Implement `werkstatt.autonomy.validate`** in `packages/werkstatt/src/plugin/autonomy-validate.ts`:
  - Scan `packages/werkstatt/src/**` for `@warpgogol/*` import specifiers (excluding `@warpgogol/werkstatt` self-imports).
  - Exclude `node_modules/`, `tests/`, `*.test.ts`, `*.spec.ts` (matching forge precedent at `packages/forge/src/onboarding/doctor.ts:106`).
  - Detect both runtime imports and type-only imports (`import type { ... } from "@warpgogol/..."`).
  - Output JSON: `{ command, status, violations: [{ file, specifier }] }`.
  - Exit 1 on any violation; exit 0 if clean.
- **6b. Register the command** in the engine's kernel module (workspace scope).
- **6c. Wire into `packages.check` pipeline** — add `werkstatt.autonomy.validate` as a step in the `packages.check` pipeline in `tools/kernel.config.ts`.
- **6d. Write unit tests** for the autonomy guard:
  - Pass case: clean tree with no `@warpgogol/*` imports.
  - Fail case: `@warpgogol/*` import detected.
  - Comment exclusion: `@warpgogol/*` in comments is not a violation.
  - Type-only import: `import type { ... } from "@warpgogol/..."` is a violation.
  - Self-import: `@warpgogol/werkstatt` is NOT a violation.
- **6e. Update `docs/PACKAGE_GRAPH.md`** — regenerate or update to reflect the new package structure.
- **6f. Update root `AGENTS.md`** — § Monorepo layout references `packages/werkstatt`.
- **6g. Create `packages/werkstatt/AGENTS.md`** — engine package agent guide.
- **6h. Update `docs/requirements.xml` and `docs/technology.xml`** — package structure changes.

**Validation:**

- `pnpm exec werkstatt run werkstatt.autonomy.validate --json` — passes with zero violations.
- `pnpm --filter @warpgogol/werkstatt run test` — autonomy guard unit tests pass.
- `packages.check` passes (includes autonomy guard step).
- `pnpm exec werkstatt run rfc.validate --id RFC-0772` — passes.

**Completion criterion:** `werkstatt.autonomy.validate` registered, wired into `packages.check`, passes with zero violations; documentation updated; `packages.check` green.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0772 --implementation-commit <sha>` (pass `--dry-run` first, then without). The command validates all preconditions (status, criteria, clean tree, commit reachability).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0772`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0772`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run werkstatt.autonomy.validate --json`
- `packages.check` (full pipeline, includes autonomy guard from phase 6)
- Mission/release/leitstand test suites pass with unchanged assertions (phase 5 gate)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0772` in the subject line (RFC-0265 commit hygiene)
- Phase commits: one commit per phase (6 commits minimum + documentation sync commit)
- Review report in `docs/reviews/code/` for the implementation session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Behavior drift during inversion | Step 5g: all mission/release/leitstand test suites must pass with unchanged assertions before phase 5 is complete |
| Import-path churn across the monorepo | Steps 1-4: re-export shims keep all consumers building; rewrite sweep deferred to RFC-0776 |
| Test fixture paths | Steps 1-3: test files move alongside source modules; fixture repair budgeted in each phase's validation |
| Re-export scaffold becoming permanent | Step 6: does NOT delete old packages; RFC-0776 (wave 4) deletes them after workshop migration. Program waves are sequential. |
| Autonomy guard false positives | Step 6d: unit tests cover comment exclusion, type-only imports, self-imports |
| Performance of autonomy guard | Step 6a: scan excludes tests/node_modules; ~200-400 files, acceptable for per-`packages.check` frequency |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51/52/53, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0772 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the plugin contract (RFC-0770) is found to be missing a hook needed for inversion, add the hook via an RFC-0770 amendment, not by bypassing the registry.
- If the re-export scaffold cannot satisfy a consumer's import pattern, do NOT create a special-case shim — investigate why the pattern doesn't map to the RFC-0771 module map and file an amendment.
- If `werkstatt.autonomy.validate` produces false positives that cannot be resolved by the regex pattern, escalate to the operator before modifying the pattern — the forge precedent pattern is the normative reference.
