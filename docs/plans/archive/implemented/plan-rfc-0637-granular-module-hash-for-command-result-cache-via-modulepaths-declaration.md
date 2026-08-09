---
rfcId: RFC-0637
planId: PLAN-RFC-0637-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel
  services: []
  docs:
    - packages/os/site-kernel/AGENTS.md
---

# Implementation Plan: RFC-0637

## 1. Objectives

- [ ] Objective 1 — Add `modulePaths?: string[]` to `KernelCommandDefinition` (maps to acceptance criterion 1)
- [ ] Objective 2 — Update `computeModuleHash` to accept optional `modulePaths` and fingerprint only listed paths (maps to acceptance criterion 2)
- [ ] Objective 3 — Update `execute-pipeline.ts` `moduleHashCache` key to include `modulePaths` in both `tryCacheRead` and `tryCacheWrite` across both executor functions (maps to acceptance criterion 3)
- [ ] Objective 4 — Verify backward-compatible fallback for commands without `modulePaths` (maps to acceptance criterion 4)
- [ ] Objective 5 — Add unit tests for granular hashing, fallback, cache key isolation, and non-existent path skipping (maps to acceptance criteria 5–8)
- [ ] Objective 6 — Update `packages/os/site-kernel/AGENTS.md` "Command-result cache" section (maps to file system responsibilities)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/types.ts` — add `modulePaths?: string[]` field to `KernelCommandDefinition` interface
- `packages/os/site-kernel/src/cache/command-result-cache.ts` — update `computeModuleHash` signature to accept optional `modulePaths?: string[]` parameter; add granular hashing logic
- `packages/os/site-kernel/src/runtime/execute-pipeline.ts` — update `tryCacheRead` and `tryCacheWrite` to pass `command.modulePaths` to `computeModuleHash` and use `modulePaths`-aware cache key in `moduleHashCache` Map (4 call sites: 2 in `executePipelineForSite`, 2 in `executePipelineForWorkspace`)
- `packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts` — add 4 new test cases for `computeModuleHash` with `modulePaths`

No new Site OS commands. No registry entries, module registrations, or pipeline wiring changes.

### 2.2 Configuration and data

No configuration or data files affected. The change is internal to the cache logic.

### 2.3 Documentation and specs

- `packages/os/site-kernel/AGENTS.md` — update "Command-result cache (RFC-0390)" section to document the `modulePaths` parameter, the granular hashing behavior, and the `moduleHashCache` key change
- RFC file `docs/rfcs/rfc-0637-*.md` — read-only reference, not modified during implementation

No `docs/*.xml` Compass files need updates (no repository-wide semantics change). No `docs/architecture-dna.md` change (DNA-53 is satisfied, not extended).

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel run build:check` — typecheck the modified package
- `pnpm --filter @warpgogol/site-kernel run test` — run unit tests including new test cases
- `pnpm exec werkstatt run rfc.validate --id RFC-0637` — validate the RFC file
- No new validate commands. `command.reads.validate` is unchanged (CRC-01/CRC-02 remain as-is).

## 3. Step sequence

### Step 1. Add `modulePaths` field to `KernelCommandDefinition`

**Goal:** Add the optional `modulePaths?: string[]` field to the `KernelCommandDefinition` interface in `types.ts`.

**Agent actions:**

- Open `packages/os/site-kernel/src/types.ts`
- Add `modulePaths?: string[]` field to `KernelCommandDefinition` interface after the `writes?: string[]` field, with JSDoc referencing RFC-0637
- Add `<item>RFC-0637: add modulePaths to KernelCommandDefinition.</item>` to the `<CHANGE_SUMMARY>` block

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes

**Completion criterion:** `KernelCommandDefinition` interface has `modulePaths?: string[]` field with JSDoc; typecheck passes.

**Human review:** no

---

### Step 2. Update `computeModuleHash` to support granular hashing

**Goal:** Add optional `modulePaths?: string[]` parameter to `computeModuleHash` and implement granular fingerprinting logic.

**Agent actions:**

- Open `packages/os/site-kernel/src/cache/command-result-cache.ts`
- Add imports: `existsSync` from `node:fs`, `stat` from `node:fs/promises`
- Update `computeModuleHash` signature: `export async function computeModuleHash(moduleSrcDir: string, modulePaths?: string[]): Promise<string>`
- Add granular hashing logic: when `modulePaths` is non-empty, iterate paths, resolve each via `join(moduleSrcDir, p)`, check `existsSync`, fingerprint files via `fingerprintFile` and directories via `fingerprintTree`, collect `${p}:${hash}` entries, return `stableJsonHash({ paths: hashes })`
- Preserve existing fallback: when `modulePaths` is absent or empty, use `fingerprintTree(moduleSrcDir, ...)` as before
- Add `<item>RFC-0637: add modulePaths parameter for granular module hashing.</item>` to `<CHANGE_SUMMARY>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes

**Completion criterion:** `computeModuleHash` accepts optional `modulePaths` parameter; when provided with non-empty array, fingerprints only listed paths; when absent or empty, falls back to full `src/` fingerprint; typecheck passes.

**Human review:** no

---

### Step 3. Update `execute-pipeline.ts` cache key and call sites

**Goal:** Pass `command.modulePaths` to `computeModuleHash` and use `modulePaths`-aware cache key in `moduleHashCache` Map across all 4 call sites in both executor functions.

**Agent actions:**

- Open `packages/os/site-kernel/src/runtime/execute-pipeline.ts`
- In `tryCacheRead`: change `moduleHashCache.get(moduleSrcDir)` to `moduleHashCache.get(cacheKey)` where `cacheKey = \`${moduleSrcDir}:${command.modulePaths?.join(",") ?? ""}\``; pass `command.modulePaths`to`computeModuleHash`
- In `tryCacheWrite`: same change — use `modulePaths`-aware cache key and pass `command.modulePaths` to `computeModuleHash`
- In `executePipelineForSite`: no change needed (calls `tryCacheRead`/`tryCacheWrite` which now handle `modulePaths` internally)
- In `executePipelineForWorkspace`: same — no change needed (calls `tryCacheRead`/`tryCacheWrite`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` passes

**Completion criterion:** `moduleHashCache` key includes `modulePaths` value; `computeModuleHash` receives `command.modulePaths` in both `tryCacheRead` and `tryCacheWrite`; typecheck passes.

**Human review:** no

---

### Step 4. Add unit tests for `computeModuleHash` with `modulePaths`

**Goal:** Add 4 new test cases to `command-result-cache.test.ts` covering granular hashing, fallback, cache key isolation, and non-existent path skipping.

**Agent actions:**

- Open `packages/os/site-kernel/src/cache/__tests__/command-result-cache.test.ts`
- Add test: `computeModuleHash` with `modulePaths` hashes only listed paths — create temp dir with `a.ts` and `b.ts`, hash with `modulePaths: ["a.ts"]`, change `b.ts`, verify hash unchanged
- Add test: `computeModuleHash` without `modulePaths` hashes full `src/` (existing behavior) — verify existing test still passes (may need to ensure backward compat)
- Add test: `moduleHashCache` keys are distinct for different `modulePaths` values — compute hash with `modulePaths: ["a.ts"]` and `modulePaths: ["b.ts"]`, verify different hashes
- Add test: non-existent path in `modulePaths` is silently skipped — hash with `modulePaths: ["nonexistent.ts"]`, verify hash is truthy and doesn't throw

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run test` passes with all new tests

**Completion criterion:** 4 new test cases pass; existing tests still pass.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel/AGENTS.md`

**Goal:** Update the "Command-result cache (RFC-0390)" section to document the `modulePaths` parameter and cache key change.

**Agent actions:**

- Open `packages/os/site-kernel/AGENTS.md`
- In the "Command-result cache (RFC-0390)" section, add a bullet point documenting: `modulePaths?: string[]` on `KernelCommandDefinition` (RFC-0637) — when present, `computeModuleHash` fingerprints only listed paths; when absent, full `src/` fingerprint is used (permanent fallback); `moduleHashCache` key includes `modulePaths` value
- Update the `computeModuleHash` description to mention the `modulePaths` parameter

**Validation:**

- Visual review of the AGENTS.md section

**Completion criterion:** AGENTS.md "Command-result cache" section documents `modulePaths` parameter, granular hashing behavior, and cache key change.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel/AGENTS.md` is updated (Step 5).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they didn't — skip).
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0637 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0637`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel run test`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0637`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0637` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False cache hits from incomplete `modulePaths` | Step 4 tests verify granular hashing correctness; Phase 2 migration (not in this RFC) is incremental |
| Maintenance burden | Step 5 documents `modulePaths` in AGENTS.md; Phase 3 validation (future) will warn on missing paths |
| Agent confusion | Step 5 AGENTS.md update documents the fallback behavior; new commands without `modulePaths` are safe |
| Hash computation overhead | Step 3 preserves `moduleHashCache` deduplication — hash computed once per `modulePaths` combination per pipeline run |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0637 --reason "..." --invariant "DNA-53"` instead of working around it.
