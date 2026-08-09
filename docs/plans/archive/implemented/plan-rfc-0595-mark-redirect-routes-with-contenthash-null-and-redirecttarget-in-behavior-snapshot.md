---
rfcId: RFC-0595
planId: PLAN-RFC-0595-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ontology"
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/share"
  services: []
  docs:
    - "packages/os/site-kernel-handoff/AGENTS.md"
---

# Implementation Plan: RFC-0595

## 1. Objectives

- [ ] Objective 1 — Move `RouteFact` to `@warpgogol/ontology/operations/leitstand.ts` with `contentHash: string | null` + optional `redirectTarget` (maps to acceptance criterion: "RouteFact moved to @warpgogol/ontology/operations/leitstand.ts")
- [ ] Objective 2 — `behavior.snapshot.capture` detects meta-refresh redirect pages and marks them with `contentHash: null` + `redirectTarget` (maps to acceptance criterion: "behavior.snapshot.capture detects HTML redirect pages")
- [ ] Objective 3 — Health check in `cloudflare-workers.ts` uses `redirect: "manual"` for `contentHash: null` routes and verifies HTTP 307/308 + `Location` header (maps to acceptance criteria: "Health check skips content-hash", "verifies HTTP 307/308", "verifies Location header")
- [ ] Objective 4 — `behavior.snapshot.generate` excludes meta-refresh redirect stubs from the golden snapshot (maps to acceptance criterion: "behavior.snapshot.generate excludes meta-refresh redirect stubs")
- [ ] Objective 5 — Non-redirect routes are unaffected (maps to acceptance criterion: "Non-redirect routes are unaffected")
- [ ] Objective 6 — Unit tests cover all new code paths (maps to acceptance criterion: "Unit tests cover: redirect page detection, redirect health check, non-redirect route, multi-hop")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/leitstand.ts` — add `RouteFact` interface + Zod schema + type export
- `packages/ontology/src/operations/index.ts` — re-export `RouteFact` and schema
- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` — remove local `RouteFact`, import from ontology; update `collectRoutes` to detect redirect pages via `isHtmlRedirectPage` and set `contentHash: null` + `redirectTarget`
- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` — remove local `RouteFact`, import from ontology; update `health()` to use `redirect: "manual"` for `contentHash: null` routes; add `verifyRedirectRoute` logic
- `packages/os/site-kernel-checks/src/behavior-snapshot.ts` — update `buildBehaviorSnapshot` to exclude meta-refresh redirect stubs from `RouteBehavior[]` via `isHtmlRedirectPage`
- `packages/share/src/redirects.ts` — add `extractRedirectTarget` helper (parses `url=` from meta-refresh tag)
- `packages/share/src/semantic/image-sitemap.ts` — `isHtmlRedirectPage` stays here until RFC-0592 moves it; RFC-0595 imports from this location

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes.
- No ontology catalog changes (StarCatalog, PlanetCatalog, MoonCatalog).
- No content schema changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section: document `contentHash: null` + `redirectTarget` handling in health verification; note `redirect: "manual"` for redirect routes.
- RFC file is read-only reference (`docs/rfcs/rfc-0595-*.md`).
- No `docs/*.xml` Compass changes (no repository-wide semantics change).
- No `docs/architecture-dna.md` changes (no new DNA invariant).

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/share build:check`
- `pnpm exec site-kernel run rfc.validate --id RFC-0595`
- No pipeline wiring changes (`behavior.snapshot.capture` and `behavior.snapshot.generate` already run in their existing pipelines).

## 3. Step sequence

### Step 1. Add `RouteFact` to `@warpgogol/ontology/operations`

**Goal:** Establish the canonical `RouteFact` type in ontology so both `site-kernel-handoff` consumers can import it.

**Agent actions:**

- Add `routeFactSchema` (Zod) to `packages/ontology/src/operations/leitstand.ts` with fields: `path: string`, `canonical?: string`, `status?: number`, `contentHash: string | null`, `redirectTarget?: string`
- Add `RouteFact` type export (`z.infer<typeof routeFactSchema>`)
- Re-export `RouteFact` and `routeFactSchema` from `packages/ontology/src/operations/index.ts`
- Add `<CHANGE_SUMMARY>` entry: `RFC-0595: add RouteFact with contentHash: string | null and optional redirectTarget.`

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check` passes

**Completion criterion:** `routeFactSchema` and `RouteFact` are exported from `@warpgogol/ontology/operations` and the package builds.

**Human review:** no

---

### Step 2. Add `extractRedirectTarget` to `@warpgogol/share/redirects`

**Goal:** Provide a reusable helper to parse the redirect target URL from a meta-refresh tag.

**Agent actions:**

- Add `extractRedirectTarget(html: string): string | null` to `packages/share/src/redirects.ts`
- Implementation: parse `<meta http-equiv="refresh" content="0;url=...">` and extract the `url=` value. Return `null` if not parseable.
- Add unit test in `packages/share/src/tests/redirects.test.ts` (or existing test file) covering: standard meta-refresh, multi-hop target (immediate target only), unparseable content, no meta-refresh tag.

**Validation:**

- `pnpm --filter @warpgogol/share build:check` passes
- `pnpm --filter @warpgogol/share test` passes

**Completion criterion:** `extractRedirectTarget` is exported from `@warpgogol/share/redirects` and tested.

**Human review:** no

---

### Step 3. Update `collectRoutes` in `behavior-snapshot-commands.ts`

**Goal:** Detect meta-refresh redirect pages during route collection and mark them with `contentHash: null` + `redirectTarget`.

**Agent actions:**

- Remove local `RouteFact` interface from `behavior-snapshot-commands.ts:34–39`
- Import `RouteFact` from `@warpgogol/ontology/operations`
- Import `isHtmlRedirectPage` from `@warpgogol/share/semantic/image-sitemap` (current location; will move to `@warpgogol/share/redirects` when RFC-0592 is implemented)
- Import `extractRedirectTarget` from `@warpgogol/share/redirects`
- In `collectRoutes`, after reading HTML and before `hashHtml`:
  - Check `isHtmlRedirectPage(html)` — if true, set `contentHash: null` and `redirectTarget: extractRedirectTarget(html) ?? "unknown"`
  - If false, compute `contentHash = hashHtml(html)` as before
- Update `RouteFact` usage in `BehaviorSnapshot` interface to use the imported type
- Add `<CHANGE_SUMMARY>` entry: `RFC-0595: detect redirect pages, set contentHash: null + redirectTarget.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `collectRoutes` produces `contentHash: null` + `redirectTarget` for meta-refresh redirect pages and normal `contentHash` for content pages.

**Human review:** no

---

### Step 4. Update health check in `cloudflare-workers.ts`

**Goal:** Health check verifies redirect routes by HTTP status + `Location` header instead of content hash.

**Agent actions:**

- Remove local `RouteFact` interface from `cloudflare-workers.ts:86–89`
- Import `RouteFact` from `@warpgogol/ontology/operations`
- In `health()` method, for routes with `contentHash === null`:
  - Call `fetchWithRetry` with `redirect: "manual"` instead of `redirect: "follow"`
  - Verify `response.status` is 307 or 308
  - If `redirectTarget` is present and not `"unknown"`, verify `response.headers.get("location")` matches `redirectTarget`
  - If `redirectTarget` is `"unknown"` or absent, verify only HTTP 307/308 status
- For routes with non-null `contentHash`, keep existing behavior (`redirect: "follow"` + content hash comparison)
- Update `fetchWithRetry` to accept a `redirect` parameter (default `"follow"`)
- Add `<CHANGE_SUMMARY>` entry: `RFC-0595: verify redirect routes by HTTP status + Location header.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** Health check reports `healthy` for redirect routes with correct 307/308 status and matching `Location` header; reports `unhealthy` for redirect routes with 200 status (broken redirect).

**Human review:** no

---

### Step 5. Exclude meta-refresh stubs from golden snapshot in `behavior-snapshot.ts`

**Goal:** `behavior.snapshot.generate` excludes redirect stubs from the golden YAML snapshot to avoid drift noise.

**Agent actions:**

- Import `isHtmlRedirectPage` from `@warpgogol/share/semantic/image-sitemap` (current location)
- In `buildBehaviorSnapshot` (`packages/os/site-kernel-checks/src/behavior-snapshot.ts`), skip HTML files where `isHtmlRedirectPage(html)` is true — do not add them to `routes[]`
- This is a different snapshot format (`RouteBehavior[]` for drift detection) than `behavior.snapshot.capture` (`RouteFact[]` for health checks) — redirect stubs are excluded here because they are not real content routes and would create false drift noise

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` passes

**Completion criterion:** `buildBehaviorSnapshot` does not include meta-refresh redirect stubs in its `routes[]` array.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Cover all new code paths with unit tests.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts`:
  - Test: `collectRoutes` with a meta-refresh redirect page produces `contentHash: null` + `redirectTarget`
  - Test: `collectRoutes` with a normal content page produces non-null `contentHash` and no `redirectTarget`
  - Test: `collectRoutes` with an unparseable meta-refresh produces `contentHash: null` + `redirectTarget: "unknown"`
- In `packages/os/site-kernel-handoff/src/leitstand/` (new or existing test file):
  - Test: health check with `contentHash: null` route and 307 response → `healthy`
  - Test: health check with `contentHash: null` route and 200 response → `unhealthy` (broken redirect)
  - Test: health check with `contentHash: null` route and 307 but wrong `Location` → `unhealthy`
  - Test: health check with `contentHash: null` + `redirectTarget: "unknown"` and 307 → `healthy` (status-only check)
  - Test: health check with non-null `contentHash` route → existing content-hash behavior unchanged
- In `packages/share/src/tests/redirects.test.ts` (or colocated):
  - Test: `extractRedirectTarget` with standard meta-refresh → returns target path
  - Test: `extractRedirectTarget` with no meta-refresh → returns `null`
  - Test: `extractRedirectTarget` with unparseable content → returns `null`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- `pnpm --filter @warpgogol/share test` passes

**Completion criterion:** All new tests pass and cover the acceptance criteria for redirect detection, health check verification, and non-redirect route behavior.

**Human review:** no

---

### Step 7. Update AGENTS.md

**Goal:** Document the new redirect-route handling in the handoff package guide.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section:
  - Add note: "Health verification uses `redirect: "manual"` for routes with `contentHash: null` and verifies HTTP 307/308 + `Location` header against `redirectTarget`. Routes with non-null `contentHash` use `redirect: "follow"` and compare content hashes."
  - Add note: "`RouteFact` is defined in `@warpgogol/ontology/operations` (RFC-0595). Both `behavior-snapshot-commands.ts` and `cloudflare-workers.ts` import it from there."
- Update `collectRoutes` description in the Leitstand section to mention meta-refresh detection

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the new content

**Completion criterion:** AGENTS.md reflects the new redirect-route handling and `RouteFact` canonical location.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not expected for this RFC).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0595 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0595`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0595`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/share build:check`
- `pnpm --filter @warpgogol/share test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0595` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False negative — redirect page not detected | Step 3 reuses existing `isHtmlRedirectPage` which is already tested and used in 6+ validators |
| Redirect target mismatch (CDN rewrites) | Step 4 verifies `Location` header only when `redirectTarget` is known; falls back to status-only check for `"unknown"` |
| Schema change — `contentHash` becomes `string \| null` | Step 1 moves `RouteFact` to ontology with the new shape; Steps 3–4 update both consumers in the same wave |
| Agent confusion — manual `contentHash: null` edits | Step 7 documents in AGENTS.md that only `behavior.snapshot.capture` / `behavior.snapshot.generate` may produce redirect markers |
| Multi-hop redirect target | Step 2 `extractRedirectTarget` returns immediate target only; Step 4 health check verifies first hop; subsequent hops are separate routes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0595 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `isHtmlRedirectPage` is moved to `@warpgogol/share/redirects` by RFC-0592 before this RFC is implemented, update the import path in Steps 3 and 5 from `@warpgogol/share/semantic/image-sitemap` to `@warpgogol/share/redirects`.
