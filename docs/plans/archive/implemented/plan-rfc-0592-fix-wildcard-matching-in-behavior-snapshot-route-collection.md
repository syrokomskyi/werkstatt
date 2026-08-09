---
rfcId: RFC-0592
planId: PLAN-RFC-0592-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0592

## 1. Objectives

- [ ] Objective 1 — Fix `isRouteRedirected` wildcard matching so `/de/*` matches `/de` (directory root without trailing slash) — maps to acceptance criterion: `isRouteRedirected` matches `/de` for wildcard rule `/de/*`
- [ ] Objective 2 — Ensure existing sub-path matching still works (`/de/agb`, `/de/agb/terms`) — maps to acceptance criterion: `isRouteRedirected` still matches `/de/agb` and `/de/agb/terms`
- [ ] Objective 3 — Ensure non-matching routes still don't match (`/agb` ≠ `/de/*`) — maps to acceptance criterion: `isRouteRedirected` does NOT match `/agb`
- [ ] Objective 4 — Update existing test that asserts old behavior — maps to acceptance criterion: existing test updated from `toBe(false)` to `toBe(true)`
- [ ] Objective 5 — Update AGENTS.md with wildcard fix note — maps to acceptance criterion: AGENTS.md updated

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` — `isRouteRedirected` function (lines 65-73): change wildcard regex from `escaped.replace(/\*/g, ".*")` to `escaped.replace(/\/\*$/, "(/.*)?$").replace(/\*/g, ".*")`
- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts` — update line 32: `expect(isRouteRedirected("/de", rules)).toBe(false)` → `toBe(true)`

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update the `collectRoutes` / RFC-0588 section to mention the wildcard matching fix from RFC-0592

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff test` — must pass with updated tests
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — must pass (typecheck)
- `pnpm exec site-kernel run rfc.validate --id RFC-0592` — must pass

## 3. Step sequence

### Step 1. Fix `isRouteRedirected` wildcard regex

**Goal:** Change the wildcard pattern conversion so `/de/*` produces `^/de(/.*)?$` instead of `^/de/.*$`, matching both `/de` (directory root) and `/de/anything` (sub-paths).

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts:65-73`, update the `isRouteRedirected` function:
  - Replace `const pattern = escaped.replace(/\*/g, ".*");` with `const pattern = escaped.replace(/\/\*$/, "(/.*)?$").replace(/\*/g, ".*");`
  - This makes the trailing `/*` become `(/.*)?$` (optional group), while bare `*` elsewhere still becomes `.*`
- Add a `CHANGE_SUMMARY` entry: `<item>RFC-0592: fix wildcard matching so /de/* matches /de (directory root without trailing slash).</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes

**Completion criterion:** `isRouteRedirected("/de", parseRedirectRules("/de/* / 308"))` returns `true` in the code

**Human review:** no

---

### Step 2. Update existing tests

**Goal:** Update the test that asserts the old behavior and verify all test cases pass.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts:32`:
  - Change `expect(isRouteRedirected("/de", rules)).toBe(false);` to `expect(isRouteRedirected("/de", rules)).toBe(true);`
- Update the test name at line 28 to reflect the new behavior: `isRouteRedirected: /de/* wildcard matches /de, /de/agb, /de/agb/terms, /de/`
- Add a `CHANGE_SUMMARY` entry: `<item>RFC-0592: update wildcard matching test for /de directory root.</item>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` — all tests pass

**Completion criterion:** All tests in `behavior-snapshot.test.ts` pass, including the updated assertion that `/de` matches `/de/*`

**Human review:** no

---

### Step 3. Update AGENTS.md

**Goal:** Document the wildcard matching fix in the handoff package AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, find the section about `collectRoutes` and RFC-0588 redirect exclusion
- Add a note: `RFC-0592: wildcard matching in isRouteRedirected fixed so /de/* matches /de (directory root without trailing slash).`

**Validation:**

- Visual inspection — the note is present in the AGENTS.md section about `collectRoutes`

**Completion criterion:** AGENTS.md mentions RFC-0592 wildcard matching fix

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with the wildcard matching fix note.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands in this RFC — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0592 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0592`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0592`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0592` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Wildcard over-matching risk | Step 2 tests verify `/agb` does NOT match `/de/*` — non-matching is preserved |
| Existing test breakage | Step 2 explicitly updates the test asserting old behavior |
| Snapshot diff noise | Not a code risk — operators review snapshot diffs at release time |
| Agent misinterpretation | Step 3 AGENTS.md note clarifies the change is to matching logic only |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0592 --reason "..." --invariant "DNA-N"` instead of working around it.
