---
rfcId: RFC-0588
planId: PLAN-RFC-0588-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0588

## 1. Objectives

- [ ] Extract `parseRedirectRules` and `RedirectRule` to `@warpgogol/share/redirects` subpath — maps to acceptance criterion "parseRedirectRules is exported"
- [ ] Update `managed-public.ts` to import from `@warpgogol/share/redirects` — maps to acceptance criterion "parseRedirectRules is reused"
- [ ] Implement `isRouteRedirected` in `behavior-snapshot-commands.ts` with glob-to-regex pattern matching — maps to acceptance criterion "isRouteRedirected converts `*` wildcard patterns"
- [ ] Modify `collectRoutes` to read `_redirects` and exclude redirected routes (301, 308) — maps to acceptance criterion "collectRoutes reads `_redirects` and excludes routes"
- [ ] Add unit tests for `isRouteRedirected` and `collectRoutes` with redirect exclusion — maps to acceptance criterion "test passes"
- [ ] Verify `build:check` and `rfc.validate` pass — maps to acceptance criteria "build:check passes" and "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/redirects.ts` — new file: `parseRedirectRules` and `RedirectRule` extracted from `managed-public.ts`
- `packages/share/package.json` — add `"./redirects"` subpath export
- `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` — replace local `parseRedirectRules` and `RedirectRule` with import from `@warpgogol/share/redirects`
- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` — import `parseRedirectRules` and `RedirectRule` from `@warpgogol/share/redirects`, implement `isRouteRedirected`, modify `collectRoutes` to read `_redirects` and filter redirected routes
- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts` — new test file for redirect exclusion logic

### 2.2 Configuration and data

No configuration changes. No ontology catalogs, manifests, or biome files affected.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add note to Leitstand section about redirect exclusion in behavior snapshot route collection
- RFC file is read-only reference (status: accepted, not modified during implementation)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/share build:check` — typecheck (new module)
- `pnpm --filter @warpgogol/site-kernel-checks build:check` — typecheck (import change)
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — vitest
- `pnpm exec werkstatt run rfc.validate RFC-0588` — RFC validation
- No pipeline changes (no new commands, no pipeline wiring)

## 3. Step sequence

### Step 1. Extract `parseRedirectRules` and `RedirectRule` to `@warpgogol/share/redirects`

**Goal:** Move redirect parsing logic to the app-agnostic shared utilities package so both `site-kernel-checks` and `site-kernel-handoff` can consume it without a cross-OS-package dependency.

**Agent actions:**

- Create `packages/share/src/redirects.ts` with:
  - `export type RedirectRule = { from: string; to: string | undefined; status: number; line: string };`
  - `export function parseRedirectRules(body: string): RedirectRule[]` — copy the implementation from `managed-public.ts:54-68`
- Add `"./redirects"` subpath export to `packages/share/package.json` exports:
  ```json
  "./redirects": {
    "types": "./src/redirects.ts",
    "default": "./src/redirects.ts"
  }
  ```
- Do NOT add to root barrel (`src/index.ts`) — BARREL-01 enforces 120-line ceiling, new domains ship as subpath only

**Validation:**

- `pnpm --filter @warpgogol/share build:check` passes

**Completion criterion:** `@warpgogol/share/redirects` subpath exists and exports `parseRedirectRules` and `RedirectRule`. `build:check` passes for `@warpgogol/share`.

**Human review:** no — new shared utility, no behavioral change.

---

### Step 2. Update `managed-public.ts` to import from `@warpgogol/share/redirects`

**Goal:** Replace the local `parseRedirectRules` and `RedirectRule` in `site-kernel-checks` with the shared version from `@warpgogol/share/redirects`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/public-surface/managed-public.ts`:
  - Remove the local `type RedirectRule` definition (lines 36-41)
  - Remove the local `function parseRedirectRules` definition (lines 54-68)
  - Add import: `import { parseRedirectRules, type RedirectRule } from "@warpgogol/share/redirects";`
  - Verify all existing usages of `parseRedirectRules` and `RedirectRule` in `managed-public.ts` still compile (they reference the imported versions)
- `@warpgogol/site-kernel-checks` already depends on `@warpgogol/share` (package.json:75) — no dependency change needed

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` passes
- `pnpm --filter @warpgogol/site-kernel-checks test` passes (existing redirect map tests still work)

**Completion criterion:** `managed-public.ts` imports `parseRedirectRules` and `RedirectRule` from `@warpgogol/share/redirects`. No local definition remains. `build:check` and `test` pass for `site-kernel-checks`.

**Human review:** no — refactor to shared import, no behavioral change.

---

### Step 3. Implement `isRouteRedirected` and modify `collectRoutes` in behavior-snapshot-commands.ts

**Goal:** Add redirect exclusion logic to `collectRoutes` so routes matching `_redirects` source patterns (301, 308) are excluded from the behavior snapshot.

**Agent actions:**

- Add import: `import { parseRedirectRules, type RedirectRule } from "@warpgogol/share/redirects";` — `@warpgogol/site-kernel-handoff` already depends on `@warpgogol/share` (package.json:110)
- Implement `isRouteRedirected(routePath: string, rules: RedirectRule[]): boolean` in `behavior-snapshot-commands.ts`:
  - Iterate over rules, skip non-301/308 statuses
  - Convert `rule.from` glob pattern to regex: escape regex specials (`.+?^${}()|[]\`), replace `*` with `.*`, anchor with `^...$`
  - Return `true` if any rule's regex matches `routePath`
- Modify `collectRoutes(distDir: string)` to:
  - Read `_redirects` file at `path.join(distDir, "_redirects")` (path already constructed at line 128 for `redirectsHash` — but content is not read as text there; `collectRoutes` reads it independently since it has `distDir`)
  - Parse redirect rules via `parseRedirectRules(redirectsContent)`
  - After collecting all `index.html` routes, filter out routes where `isRouteRedirected(routePath, rules)` returns `true`
  - If `_redirects` does not exist, proceed without filtering (current behavior)
- Add `export` to `isRouteRedirected` so it can be unit-tested directly

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `collectRoutes` reads `_redirects`, parses rules, and excludes 301/308-redirected routes. `isRouteRedirected` is exported and handles `*` wildcard patterns. `build:check` passes.

**Human review:** no — internal implementation change, no external contract change.

---

### Step 4. Add unit tests for redirect exclusion

**Goal:** Verify `isRouteRedirected` and `collectRoutes` behave correctly with various `_redirects` patterns.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts`
- Test `isRouteRedirected`:
  - `/de/*` pattern matches `/de/agb`, `/de/agb/terms`, `/de/` — does not match `/agb`
  - Literal path `/old-page` matches `/old-page` — does not match `/old-page/sub`
  - 410 status rules are NOT excluded (only 301, 308)
  - Empty rules array returns `false` for any route
- Test `collectRoutes` with a fixture dist directory:
  - Create temp dir with `index.html` files at `/`, `/agb/index.html`, `/de/agb/index.html`
  - Create `_redirects` with `/de/* / 308`
  - Verify `/de/agb` is excluded from routes, `/` and `/agb` are included
  - Test without `_redirects` — all routes included (current behavior)
- Test `parseRedirectRules` import works correctly from `@warpgogol/share/redirects`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** All test cases pass. `isRouteRedirected` correctly handles wildcards, literal paths, and status filtering. `collectRoutes` excludes redirected routes.

**Human review:** no — test-only change.

---

### Step 5. Update AGENTS.md documentation

**Goal:** Document the redirect exclusion behavior in the handoff package AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, under the Leitstand section, add a bullet point:
  - `collectRoutes` in `behavior.snapshot.capture` reads `_redirects` and excludes routes matching 301/308 redirect source patterns from the behavior snapshot. `parseRedirectRules` is reused from `@warpgogol/share/redirects`. 410 Gone handling is deferred to RFC-0589.
- In `packages/share/AGENTS.md`, add a new row to the entry point table:
  - `@warpgogol/share/redirects` | `src/redirects.ts` | `parseRedirectRules`, `RedirectRule` — `_redirects` file parsing (extracted from `site-kernel-checks` by RFC-0588)

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the new bullet point
- `git diff packages/share/AGENTS.md` shows the new entry point table row

**Completion criterion:** AGENTS.md documents the redirect exclusion behavior and the `parseRedirectRules` reuse. `packages/share/AGENTS.md` documents the new `./redirects` subpath.

**Human review:** no — documentation-only change.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 5).
- Verify `packages/share/AGENTS.md` is updated (Step 5).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. Criteria 1-2 are already marked `[x]` (fixed in `89085ed`). Criteria 3-8 need verification.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0588 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate RFC-0588` passes.
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0588`
- `pnpm --filter @warpgogol/share build:check`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0588` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Redirect rule parsing — `parseRedirectRules` does not handle advanced Cloudflare Pages syntax | Step 1 extracts existing parser to `@warpgogol/share/redirects`; Step 3 reuses it which handles the current ecosystem `_redirects` format |
| False negative on redirect exclusion — malformed rules leave routes in snapshot | Step 3 reuses existing `parseRedirectRules` which skips unparseable lines (existing behavior) |
| Glob pattern edge cases — literal `*` in route path treated as wildcard | Step 4 tests verify `*` wildcard matching; route paths with literal `*` are not used in this ecosystem |
| 410 Gone routes not excluded | Step 3 only excludes 301/308; 410 deferred to RFC-0589 (nonGoals) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0588 --reason "..." --invariant "DNA-N"` instead of working around it.
- The RFC's `packagesImpacted` lists `@warpgogol/site-kernel-checks` but the plan extracts to `@warpgogol/share` instead. Update `packagesImpacted` during implementation to replace `@warpgogol/site-kernel-checks` with `@warpgogol/share` (metadata correction, not a substantive RFC change).
