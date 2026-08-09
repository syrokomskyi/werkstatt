---
rfcId: RFC-0484
planId: PLAN-RFC-0484-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
  services: []
  docs: []
---

# Implementation Plan: RFC-0484

## 1. Objectives

- [ ] Objective 1 — remove `console.debug` "no manifest" message from `manifest-resolver.ts` (maps to acceptance criterion: "console.debug for 'no manifest' is removed")
- [ ] Objective 2 — preserve `console.debug` for YAML parse failures and unreadable layer directories (maps to acceptance criterion: "console.debug for YAML parse failure remains")
- [ ] Objective 3 — verify `@gogol/ontology` build:check and tests pass (maps to acceptance criteria: "build:check passes" and "test passes")
- [ ] Objective 4 — verify no `[manifest-resolver] no manifest for effects/section-body/seo` messages in build output (maps to acceptance criterion: "No ... messages in build output")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/schemas/manifest-resolver.ts` — remove the `console.debug` call in the "no manifest" catch block (lines 77-79), replace with a comment explaining why group directories are skipped silently.

### 2.2 Configuration and data

None. No YAML/JSON/manifest/ontology catalog changes.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0484-manifest-resolver-skip-group-directories-silently.md`
- No AGENTS.md updates needed — the change is internal to one module.
- No `docs/*.xml` Compass files need synchronization — no contract changes.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/ontology build:check` — TypeScript type check
- `pnpm --filter @gogol/ontology test` — vitest unit tests
- `pnpm exec werkstatt run rfc.validate RFC-0484 --json` — RFC mechanical validation

## 3. Step sequence

### Step 1. Remove `console.debug` in "no manifest" catch block

**Goal:** Suppress the noisy debug message for directories that legitimately have no manifest file.

**Agent actions:**

- In `packages/ontology/src/schemas/manifest-resolver.ts`, replace the `console.debug` call in the inner catch block (lines 77-79) with a comment explaining the silent skip.
- Preserve the `continue` statement.
- Do NOT touch the `console.debug` for unreadable layer directories (lines 58-61) or YAML parse failures (lines 90-93).

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes
- `pnpm --filter @gogol/ontology test` passes

**Completion criterion:** The "no manifest" catch block in `manifest-resolver.ts` contains only a comment and `continue` — no `console.debug` call. The YAML parse failure `console.debug` remains unchanged.

**Human review:** no

---

### Step 2. Verify no debug messages in build output

**Goal:** Confirm the noise is gone.

**Agent actions:**

- Run a build of any app that invokes `getSectionPropsSchema` (e.g. via `page.block.validate` or `astro build`).
- Grep build output for `[manifest-resolver] no manifest for`.
- Confirm zero matches for `effects`, `section-body`, `seo`.

**Validation:**

- Build output contains no `[manifest-resolver] no manifest for effects/section-body/seo` lines.

**Completion criterion:** Build output is free of `[manifest-resolver] no manifest for` messages for group directories.

**Human review:** no

---

### Step 3. Stamp implemented and commit

**Goal:** Transition the RFC to `implemented` status.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0484 --implementation-commit <commit-sha>`.
- Verify RFC status transitions to `implemented`.

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0484 --json` passes with status `implemented`.

**Completion criterion:** RFC-0484 frontmatter shows `status: implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0484 --json` — RFC mechanical validation
- `pnpm --filter @gogol/ontology build:check` — TypeScript type check
- `pnpm --filter @gogol/ontology test` — vitest unit tests

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0484` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file needed — RFC-0484 has no acceptance probes (RFC-0330 applies only to probe-bearing RFCs)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Silent failure for real manifest issues — if a component directory is missing its manifest due to a naming error, the resolver will skip it silently | Existing `section.contract.validate` and `component.contract.validate` in the check pipeline enforce manifest presence for all component/section directories independently of the resolver. No additional mitigation needed in this plan. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-42, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0484 --reason "..." --invariant "DNA-42"` instead of working around it.
