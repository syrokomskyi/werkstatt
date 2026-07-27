---
rfcId: RFC-0486
planId: PLAN-RFC-0486-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/growth"
  services: []
  docs:
    - packages/AGENTS.md
---

# Implementation Plan: RFC-0486

## 1. Objectives

- [ ] Add `/* @vite-ignore */` to the dynamic import in `packages/growth/src/provider.astro` — maps to acceptance criterion 1
- [ ] Suppress the Vite "Unable to analyze dynamic import" warning — maps to acceptance criterion 2
- [ ] Verify growth provider still loads the matomo adapter at runtime — maps to acceptance criterion 3
- [ ] `pnpm --filter @gogol/growth build:check` passes — maps to acceptance criterion 4
- [ ] `rfc.validate` passes on RFC-0486 — maps to acceptance criterion 5
- [ ] Document the `/* @vite-ignore */` convention in `packages/AGENTS.md` — maps to acceptance criterion 6

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/growth/src/provider.astro` — add `/* @vite-ignore */` inside the `import()` call on line 90

### 2.2 Configuration and data

None — no configuration, manifests, or ontology catalogs are touched.

### 2.3 Documentation and specs

- `packages/AGENTS.md` — add `/* @vite-ignore */` convention to the ports & adapters section (existing bullet about growth/chat adapter loader maps)
- `docs/rfcs/rfc-0486-*.md` — read-only reference (already accepted)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/growth build:check` — scoped TypeScript check for the growth package
- `pnpm exec site-kernel run rfc.validate RFC-0486 --json` — mechanical RFC validation

## 3. Step sequence

### Step 1. Add `/* @vite-ignore */` to provider.astro

**Goal:** Suppress the Vite dynamic import warning by adding the official Vite ignore comment to the variable-specifier `import()` call.

**Agent actions:**

- In `packages/growth/src/provider.astro`, line 90, change `import(_adapterSpecifiers["matomo"]!)` to `import(/* @vite-ignore */ _adapterSpecifiers["matomo"]!)`

**Validation:**

- `pnpm --filter @gogol/growth build:check` passes (TypeScript still compiles)
- Visual inspection: the `/* @vite-ignore */` comment is inside the `import()` call, before the variable expression

**Completion criterion:** The `import()` call in `provider.astro` contains `/* @vite-ignore */` and `build:check` passes.

**Human review:** no

---

### Step 2. Document the convention in packages/AGENTS.md

**Goal:** Add the `/* @vite-ignore */` policy to the ports & adapters section of `packages/AGENTS.md` so future variable-specifier dynamic imports follow the convention.

**Agent actions:**

- In `packages/AGENTS.md`, find the ports & adapters bullet (line 118, starting with "**Ports & adapters (growth / content-source / integration / chat).**")
- Add a sub-bullet after the growth/chat adapter loader map rules: "Variable-specifier dynamic imports (e.g. `import(_adapterSpecifiers[...])`) in `packages/*` MUST include `/* @vite-ignore */` inside the `import()` call to suppress Vite's unanalyzable-import warning. This is the official Vite mechanism for intentional dynamic imports that cannot be statically resolved."

**Validation:**

- The text is present in the ports & adapters section of `packages/AGENTS.md`

**Completion criterion:** `packages/AGENTS.md` ports & adapters section documents the `/* @vite-ignore */` requirement for variable-specifier dynamic imports.

**Human review:** no

---

### Step 3. Run validation suite

**Goal:** Confirm all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @gogol/growth build:check`
- Run `pnpm exec site-kernel run rfc.validate RFC-0486 --json`

**Validation:**

- `build:check` exits 0
- `rfc.validate` exits 0 with `status: pass`

**Completion criterion:** Both commands pass with exit code 0.

**Human review:** no

---

### Step 4. Stamp implemented and commit

**Goal:** Transition the RFC to `implemented` status and commit all changes.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0486 --implementation-commit <commit-sha>`
- Commit `packages/growth/src/provider.astro` and `packages/AGENTS.md` with a message referencing RFC-0486

**Validation:**

- RFC-0486 frontmatter shows `status: implemented`
- `rfc.validate` still passes after stamping

**Completion criterion:** RFC-0486 is `implemented`, all changes committed.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/growth build:check` — TypeScript compilation passes
- `pnpm exec site-kernel run rfc.validate RFC-0486 --json` — RFC mechanical validation passes

### 4.1.1 Indirect verification of Vite warning suppression

`build:check` runs `tsc --noEmit`, which does not invoke Vite and therefore cannot directly verify that the "Unable to analyze dynamic import" warning is suppressed. The suppression is verified **indirectly**: the `/* @vite-ignore */` comment is Vite's official mechanism for this purpose (stable since Vite 2.x), and correct placement inside `import()` before the variable expression is confirmed by visual inspection in Step 1. The operator may optionally run `astro dev` or `astro build` in a consuming app for direct confirmation.

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0486` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file needed — RFC-0486 has no acceptance probes (RFC-0330)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Future Vite versions may change the `/* @vite-ignore */` comment syntax | Step 1 uses the established Vite 2.x+ syntax; if Vite changes it, a new RFC will address it |

## 6. Escalation triggers

- If `build:check` fails after adding the comment (e.g. TypeScript rejects the comment syntax inside `import()`), investigate the Astro/Vite version compatibility before proceeding. Do not remove the comment — fix the underlying issue.
- If the Vite warning persists after adding `/* @vite-ignore */`, verify the comment placement is correct (inside `import()`, before the expression). If the warning still persists, check the Vite version — older versions may not support inline comments in `import()`.
