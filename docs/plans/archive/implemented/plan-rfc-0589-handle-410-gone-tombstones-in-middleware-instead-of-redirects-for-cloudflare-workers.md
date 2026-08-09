---
rfcId: RFC-0589
planId: PLAN-RFC-0589-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-codegen"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-codegen/AGENTS.md
---

# Implementation Plan: RFC-0589

## 1. Objectives

- [ ] Objective 1 — `buildRetiredPageRoutesBlock` filters out 410 entries, emitting only 301 redirects to `_redirects` (maps to acceptance criterion 1)
- [ ] Objective 2 — `buildRetiredTombstoneMiddleware` generates Astro middleware source for 410 tombstone routes (maps to acceptance criterion 2)
- [ ] Objective 3 — `routes.generate` generates `src/middleware/retired-tombstones.ts` and chains it first in root `src/middleware.ts` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — `GENERATOR_OWNERSHIP_MAP` registers the new middleware file under `routes.generate` (maps to acceptance criterion 5)
- [ ] Objective 5 — `redirect.map.validate` (REDIR-03) rejects 410 for cloudflare-workers adapter, resolves adapter from `systems/registry.yaml` (maps to acceptance criteria 6, 7)
- [ ] Objective 6 — 410 response includes `Cache-Control: max-age=3600` header (maps to acceptance criterion 8)
- [ ] Objective 7 — All builds, tests, and `rfc.validate` pass (maps to acceptance criteria 9–14)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` — `buildRetiredPageRoutesBlock` add `.filter((e) => e.status === 301)`; new `buildRetiredTombstoneMiddleware` function
- `packages/os/site-kernel-codegen/src/app-boilerplate.ts` — `runGenerateRoutes` adds `src/middleware/retired-tombstones.ts` to its file set; `runGeneratePublicInfrastructure` unchanged (still calls `buildRetiredPageRoutesBlock` which now filters 410)
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware/retired-tombstones.ts.template` — new template file
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware.template.ts` — update to import and chain tombstone middleware first
- `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` — `runRedirectMapValidate` (REDIR-03): expand `VALID_REDIRECT_STATUSES` to `[200, 301, 302, 303, 307, 308]`, reject 410 for cloudflare-workers adapter, resolve adapter from registry, update fixHint
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — add `src/middleware/retired-tombstones.ts` entry under `routes.generate`

### 2.2 Configuration and data

- `systems/registry.yaml` — read-only reference for adapter type resolution (`deployment.adapter: cloudflare-workers`)
- `packages/os/site-kernel-content/src/system-manifest.ts` — read-only, `retiredRoutes` type unchanged

### 2.3 Documentation and specs

- `packages/os/site-kernel-codegen/AGENTS.md` — document `routes.generate` ownership of `src/middleware/retired-tombstones.ts`, 410 handled by middleware not `_redirects`
- RFC file `docs/rfcs/rfc-0589-*.md` — read-only reference

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-codegen build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-checks build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-codegen test` — unit tests
- `pnpm --filter @warpgogol/site-kernel-checks test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0589` — RFC validation

## 3. Step sequence

### Step 1. Add `buildRetiredTombstoneMiddleware` and update `buildRetiredPageRoutesBlock`

**Goal:** Modify `app-boilerplate-helpers.ts` to filter 410 from `_redirects` emission and add the new middleware source builder.

**Agent actions:**

- In `buildRetiredPageRoutesBlock` (`packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts:235-256`): add `.filter((entry) => entry.status === 301)` before the `.map()` call. Update the section comment from "410 Gone tombstones + 301 redirects" to "301 redirects".
- Add new `buildRetiredTombstoneMiddleware(manifest: SystemManifest): string` function in the same file. The function:
  - Filters `manifest.retiredRoutes` for `status: 410` entries.
  - Always returns valid middleware source (even with 0 tombstones → passthrough `next()`).
  - Tombstone entries produce prefix-match logic: `Map<string, true>` of slug prefixes, checked via `url.startsWith(prefix)`.
  - 410 response includes `Cache-Control: max-age=3600` header.
  - Uses `{{TOMBSTONE_ENTRIES}}` token for the generated tombstone data.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen build:check` passes.

**Completion criterion:** `buildRetiredPageRoutesBlock` output contains no 410 entries; `buildRetiredTombstoneMiddleware` returns valid TypeScript middleware source for both empty and non-empty tombstone cases.

**Human review:** no

---

### Step 2. Create tombstone middleware template

**Goal:** Create the template file that `routes.generate` uses to generate `src/middleware/retired-tombstones.ts`.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware/retired-tombstones.ts.template`.
- Template includes:
  - `{{GENERATED_HEADER}}` token.
  - `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).
  - Import `MiddlewareHandler` type from `astro:middleware`.
  - Export default middleware handler that:
    - Builds a `Map<string, true>` of retired slug prefixes from `{{TOMBSTONE_ENTRIES}}` (JSON-encoded array of slug strings).
    - On each request, checks if `url.pathname` starts with any retired prefix (e.g. `/widerruf/`).
    - If matched, returns `new Response(null, { status: 410, headers: { "Cache-Control": "max-age=3600" } })`.
    - If not matched, calls `next()`.

**Validation:**

- Template file exists at the expected path.
- `pnpm --filter @warpgogol/site-kernel-codegen build:check` passes.

**Completion criterion:** Template file exists with correct token placeholders and valid TypeScript structure.

**Human review:** no

---

### Step 3. Update root middleware template to chain tombstone middleware

**Goal:** Update `src/middleware.template.ts` to import and chain the tombstone middleware first via `sequence()`.

**Agent actions:**

- Edit `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware.template.ts`:
  - Add `import tombstoneMiddleware from "./middleware/retired-tombstones";` after the language-redirect import.
  - Update `export const onRequest` to chain: `sequence(tombstoneMiddleware, languageRedirectMiddleware, devNormalize!)` in dev mode and `sequence(tombstoneMiddleware, languageRedirectMiddleware)` in prod mode.
  - Update `CHANGE_SUMMARY` with RFC-0589 entry.
  - Update `@ai-invariant` comment to note tombstone middleware runs first.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen build:check` passes.

**Completion criterion:** Root middleware template chains `tombstoneMiddleware` first via `sequence()` in both dev and prod modes.

**Human review:** no

---

### Step 4. Wire `routes.generate` to emit tombstone middleware file

**Goal:** Update `runGenerateRoutes` to generate `src/middleware/retired-tombstones.ts` alongside the root middleware.

**Agent actions:**

- In `packages/os/site-kernel-codegen/src/app-boilerplate.ts` `runGenerateRoutes` (line 125+):
  - Import `buildRetiredTombstoneMiddleware` from `app-boilerplate-helpers.ts`.
  - Add a new file entry to the `runGeneratedFileSet` array:
    ```ts
    {
      absolutePath: path.join(paths.srcDirectory, "middleware", "retired-tombstones.ts"),
      content: applyTokens(readTemplate("src/middleware/retired-tombstones.ts.template"), {
        GENERATED_HEADER: buildGeneratedHeader({ ownerCommand: "routes.generate", site: appId, filePath: "src/middleware/retired-tombstones.ts" }).trimEnd(),
        TOMBSTONE_ENTRIES: JSON.stringify(tombstoneSlugs),
      }),
    }
    ```
  - Compute `tombstoneSlugs` from `manifest.retiredRoutes` filtered by `status: 410`, extracting slug prefixes.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-codegen test` passes.

**Completion criterion:** `runGenerateRoutes` output includes `src/middleware/retired-tombstones.ts` with correct tombstone data.

**Human review:** no

---

### Step 5. Register middleware file in `GENERATOR_OWNERSHIP_MAP`

**Goal:** Add the new generated file to the ownership map to satisfy RFC-0087 single-owner rule.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generator-ownership.ts`:
  - Add entry after the `src/middleware/language-redirect.ts` entry (line ~154):
    ```ts
    { path: "src/middleware/retired-tombstones.ts", command: "routes.generate" },
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-checks test` passes.

**Completion criterion:** `GENERATOR_OWNERSHIP_MAP` contains `src/middleware/retired-tombstones.ts` under `routes.generate`.

**Human review:** no

---

### Step 6. Update `redirect.map.validate` (REDIR-03) to reject 410

**Goal:** Modify the validator to reject 410 status codes for cloudflare-workers adapter sites and expand valid status codes.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` `runRedirectMapValidate` (line 212+):
  - Expand the valid status check from `![301, 308, 410].includes(rule.status)` to `![200, 301, 302, 303, 307, 308].includes(rule.status)`.
  - Add adapter type resolution: load `systems/registry.yaml`, find the system by app id, read `deployment.adapter`.
  - If adapter is `cloudflare-workers` or `null` (or registry entry is missing), reject 410 with message: `REDIR-03 status code 410 is not supported by Cloudflare Workers _redirects. Use middleware for 410 tombstones.`
  - Update fixHint from `"Use 301, 308, or 410 for public URL retirement."` to `"Use 301 or 308 for redirects. 410 tombstones are handled by middleware (RFC-0589)."`.
  - The 410-specific check should be separate from the general status validation: first check if status is in `VALID_REDIRECT_STATUSES`, then if status is 410 and adapter rejects it, emit a specific violation.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-checks test` passes.

**Completion criterion:** `redirect.map.validate` rejects 410 entries for cloudflare-workers adapter sites with the updated message and fixHint.

**Human review:** no

---

### Step 7. Add unit tests

**Goal:** Add tests for the new and changed functions.

**Agent actions:**

- In `packages/os/site-kernel-codegen` tests:
  - Test `buildRetiredPageRoutesBlock` with only 410 routes → returns empty string.
  - Test `buildRetiredPageRoutesBlock` with mixed 301 and 410 routes → returns only 301 entries.
  - Test `buildRetiredTombstoneMiddleware` with no 410 routes → returns passthrough middleware source.
  - Test `buildRetiredTombstoneMiddleware` with 410 routes → returns middleware with tombstone prefix map.
- In `packages/os/site-kernel-checks` tests:
  - Test `runRedirectMapValidate` with 410 entry and cloudflare-workers adapter → REDIR-03 violation.
  - Test `runRedirectMapValidate` with 410 entry and missing registry entry → REDIR-03 violation (safe default).
  - Test `runRedirectMapValidate` with 301 entry → no REDIR-03 violation.
  - Test `runRedirectMapValidate` with 200/302/303/307 entry → no REDIR-03 violation (expanded valid set).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen test` passes.
- `pnpm --filter @warpgogol/site-kernel-checks test` passes.

**Completion criterion:** All new tests pass and cover the acceptance criteria.

**Human review:** no

---

### Step 8. Update `packages/os/site-kernel-codegen/AGENTS.md`

**Goal:** Document the new middleware file ownership and 410 handling change.

**Agent actions:**

- In `packages/os/site-kernel-codegen/AGENTS.md`:
  - Add `src/middleware/retired-tombstones.ts` to the `runGenerateRoutes` ownership list.
  - Add a note under "Rules" that 410 tombstones are handled by middleware (RFC-0589), not `_redirects`. The `retiredRoutes` schema still includes 410 as a valid status, but `buildRetiredPageRoutesBlock` only emits 301 entries to `_redirects`.

**Validation:**

- File is updated with the new ownership entry and 410 note.

**Completion criterion:** `AGENTS.md` lists `src/middleware/retired-tombstones.ts` under `routes.generate` and documents the 410 middleware handling.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-codegen/AGENTS.md` is updated (Step 8).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0589 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). Run `--dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0589`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0589`
- `pnpm --filter @warpgogol/site-kernel-codegen build:check`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen test`
- `pnpm --filter @warpgogol/site-kernel-checks test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0589` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Middleware performance | Step 2: template uses `Map<string, true>` prefix matching, not regex |
| Middleware ordering | Step 3: root middleware template chains tombstone first via `sequence()` |
| Validator false positives | Step 6: validator resolves adapter from `systems/registry.yaml`, safe default rejects 410 |
| Agent misinterpretation | Step 8: AGENTS.md documents 410 is in schema but handled by middleware |
| Existing releases | Rollout section: re-run `routes.generate`, `public.infrastructure.generate`, `release.prepare` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0589 --reason "..." --invariant "DNA-49"` instead of working around it.
- If the `systems/registry.yaml` schema for `deployment.adapter` changes during implementation, update the adapter resolution logic in Step 6 accordingly.
