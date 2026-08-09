---
rfcId: RFC-0639
planId: PLAN-RFC-0639-01
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

# Implementation Plan: RFC-0639

## 1. Objectives

- [ ] Objective 1 — Extend `ForgeBindingsCommands` interface and Zod schema with 5 semantic keys (maps to acceptance criterion 1, 2)
- [ ] Objective 2 — Change `terminology` from `.optional()` to `.default({})` in Zod and interface (maps to acceptance criterion 7)
- [ ] Objective 3 — Add `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` exports (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Update `applyCliBindingDefaults` to initialize 5 new keys with `null` (maps to acceptance criterion 5)
- [ ] Objective 5 — Create unit tests for semantic keys, terminology resolution, and `applyCliBindingDefaults` (maps to acceptance criterion 6)
- [ ] Objective 6 — Verify existing forge.yaml files parse without changes (maps to acceptance criterion 8)
- [ ] Objective 7 — Update `packages/forge/AGENTS.md` with semantic key and terminology documentation (maps to acceptance criterion 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — Zod schema (`forgeBindingsSchema`), `ForgeBindings` interface, `ForgeBindingsCommands` (inline in `ForgeBindings`), `applyCliBindingDefaults`, new `resolveTerminology` function, new `UNIVERSAL_TERMINOLOGY` constant
- `packages/forge/src/index.ts` — Export `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` from the config module

### 2.2 Configuration and data

- `forge.yaml` (repo root) — no changes required (existing file parses without changes; semantic keys are optional)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add semantic keys documentation to the Bindings contract section

### 2.4 Validation and pipelines

- No new commands, no pipeline changes
- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/forge run test` — Vitest unit tests

## 3. Step sequence

### Step 1. Extend Zod schema and TypeScript interface with 5 semantic keys

**Goal:** Add `validate`, `produce`, `verify`, `preview`, `lint` to the bindings commands schema and interface.

**Agent actions:**

- In `packages/forge/src/config/forge-config.ts`, add 5 new fields to the `commands` object in `forgeBindingsSchema`:
  ```ts
  validate: z.string().nullable().default(null),
  produce: z.string().nullable().default(null),
  verify: z.string().nullable().default(null),
  preview: z.string().nullable().default(null),
  lint: z.string().nullable().default(null),
  ```
- Add the same 5 fields to the `ForgeBindings["commands"]` type in the `ForgeBindings` interface (after `sessionSave`).
- Update the `CHANGE_SUMMARY` comment block at the top of the file with a new `<item>RFC-0639: ...</item>` entry.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — must compile (will fail until `applyCliBindingDefaults` is updated in Step 3).

**Completion criterion:** Zod schema and `ForgeBindings` interface contain all 5 new semantic keys with `string | null` types and `null` defaults.

**Human review:** no

---

### Step 2. Change `terminology` from `.optional()` to `.default({})`

**Goal:** Promote `terminology` to a non-optional bindings section with a default empty record.

**Agent actions:**

- In `packages/forge/src/config/forge-config.ts`, change the `terminology` field in `forgeBindingsSchema` from:
  ```ts
  terminology: z.record(z.string(), z.string()).optional(),
  ```
  to:
  ```ts
  terminology: z.record(z.string(), z.string()).default({}),
  ```
- Change the `terminology` field in the `ForgeBindings` interface from:
  ```ts
  terminology?: Record<string, string>;
  ```
  to:
  ```ts
  terminology: Record<string, string>;
  ```

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — must compile.

**Completion criterion:** `terminology` is non-optional in both Zod schema and TypeScript interface; `defaultForgeConfig` already sets `terminology: {}` so no change needed there.

**Human review:** no

---

### Step 3. Update `applyCliBindingDefaults` to include 5 new keys

**Goal:** Ensure `applyCliBindingDefaults` returns a complete `ForgeBindings["commands"]` object with all 13 keys.

**Agent actions:**

- In `applyCliBindingDefaults` function in `packages/forge/src/config/forge-config.ts`, add 5 new keys to the `commands` object initialization:
  ```ts
  validate: null,
  produce: null,
  verify: null,
  preview: null,
  lint: null,
  ```
  These are added after `sessionSave: null` and before the `for` loop.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — must compile (the return type now includes all 13 keys).

**Completion criterion:** `applyCliBindingDefaults("pnpm")` returns an object with all 13 keys; the 5 semantic keys are `null`; the 5 CLI-backed keys are non-null with runner prefix.

**Human review:** no

---

### Step 4. Add `resolveTerminology` function and `UNIVERSAL_TERMINOLOGY` constant

**Goal:** Export the terminology resolution helper and universal defaults from the config module.

**Agent actions:**

- In `packages/forge/src/config/forge-config.ts`, add after the `resolveBinding` function:
  ```ts
  export const UNIVERSAL_TERMINOLOGY: Record<string, string> = {
    artifact: "artifact",
    artifactPlural: "artifacts",
    module: "module",
    source: "source file",
    output: "output",
    verify: "verify",
    operator: "operator",
  };

  export function resolveTerminology(
    config: ForgeConfig,
    terminology: Record<string, string> | undefined,
    key: string,
  ): string {
    if (config.bindings?.terminology?.[key]) {
      return config.bindings.terminology[key];
    }
    if (terminology?.[key]) {
      return terminology[key];
    }
    return UNIVERSAL_TERMINOLOGY[key] ?? key;
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — must compile.

**Completion criterion:** `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` are exported from `packages/forge/src/config/forge-config.ts`.

**Human review:** no

---

### Step 5. Export new symbols from `packages/forge/src/index.ts`

**Goal:** Make `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` available from the package entrypoint.

**Agent actions:**

- In `packages/forge/src/index.ts`, add `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` to the existing export block from `./config/forge-config.ts`:
  ```ts
  export {
    // ... existing exports ...
    resolveTerminology,
    UNIVERSAL_TERMINOLOGY,
    // ... existing type exports ...
  } from "./config/forge-config.ts";
  ```

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — must compile.

**Completion criterion:** `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` are importable from `@warpgogol/forge` and `@warpgogol/forge/config`.

**Human review:** no

---

### Step 6. Create unit tests

**Goal:** Verify semantic keys parse, null defaults work, terminology resolution chain returns correct values at each tier, and `applyCliBindingDefaults` includes 5 new keys.

**Agent actions:**

- Create `packages/forge/src/tests/bindings-schema.test.ts` with the following tests:
  - **Semantic keys parse:** `forgeBindingsSchema.safeParse` accepts a bindings object with `validate`, `produce`, `verify`, `preview`, `lint` set to string values.
  - **Null defaults:** `forgeBindingsSchema.safeParse` on a bindings object without semantic keys produces `null` for each.
  - **Terminology tier 1 (bindings override):** `resolveTerminology` returns the bindings value when `config.bindings.terminology[key]` is set.
  - **Terminology tier 2 (caller-provided):** `resolveTerminology` returns the caller-provided value when bindings don't have the key but the `terminology` parameter does.
  - **Terminology tier 3 (universal default):** `resolveTerminology` returns the `UNIVERSAL_TERMINOLOGY` value when neither bindings nor caller-provided terminology have the key.
  - **Terminology fallback to key:** `resolveTerminology` returns the key itself when not found in any tier.
  - **Terminology with undefined parameter:** `resolveTerminology` works when the `terminology` parameter is `undefined` (skips tier 2).
  - **`applyCliBindingDefaults` includes 5 new keys:** `applyCliBindingDefaults("pnpm")` returns an object with `validate`, `produce`, `verify`, `preview`, `lint` all set to `null`.
  - **`terminology` defaults to `{}`:** `forgeBindingsSchema.safeParse` on a bindings object without `terminology` produces `{}` (not `undefined`).
  - **Existing forge.yaml compatibility:** A bindings object with only the original 8 keys (no semantic keys, no terminology) parses successfully.
- Update the `CHANGE_SUMMARY` comment block in `packages/forge/src/tests/forge-config.test.ts` with a new `<item>RFC-0639: ...</item>` entry.
- Update the existing `configWithBindings` test fixture in `forge-config.test.ts` to include the 5 new semantic keys (set to `null`) so existing tests continue to typecheck.

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass.
- `pnpm --filter @warpgogol/forge run build:check` — compiles.

**Completion criterion:** All new tests pass; existing tests still pass; `applyCliBindingDefaults` test verifies 5 new `null` keys.

**Human review:** no

---

### Step 7. Update `packages/forge/AGENTS.md`

**Goal:** Document the semantic keys and terminology resolution in the forge AGENTS.md.

**Agent actions:**

- In the "Bindings contract (RFC-0393)" section of `packages/forge/AGENTS.md`, add after the existing bindings documentation:
  - A note about the 5 semantic command keys (`validate`, `produce`, `verify`, `preview`, `lint`) being optional domain-neutral keys that coexist with software-specific keys.
  - A note about `terminology` being non-optional with `{}` default.
  - A note about `resolveTerminology(config, terminology, key)` and the three-tier resolution chain.
  - A note that `forge.doctor` does not validate semantic keys (they are opt-in per-domain).
  - A note that `applyCliBindingDefaults` initializes semantic keys with `null`.

**Validation:**

- Visual inspection — the new documentation is clear and accurate.

**Completion criterion:** `packages/forge/AGENTS.md` Bindings contract section includes semantic keys and terminology resolution documentation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (Step 7).
- Run `pnpm --filter @warpgogol/forge run build:check` — must pass.
- Run `pnpm --filter @warpgogol/forge run test` — must pass.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0639` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0639 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0639` — passes.
- All 10 acceptance criteria checked off with evidence.

**Completion criterion:** All documentation in scope is updated; code review passed; all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0639`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0639.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0639` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Key proliferation — 5 new keys increase schema surface | Step 6 tests verify all keys are optional with `null` defaults; existing forge.yaml compatibility test confirms no breakage |
| Skill confusion — skills might reference both `typecheck` and `validate` | Out of scope for this RFC — RFC-0642 handles skill migration. This RFC only adds the schema keys. |
| Terminology resolution overhead — three-tier chain | Step 6 tests verify the chain is a simple object key lookup; no performance concern. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0639 --reason "..." --invariant "DNA-54"` instead of working around it.
