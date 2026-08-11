---
rfcId: RFC-0811
planId: PLAN-RFC-0811-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs: []
---

# Implementation Plan: RFC-0811

## 1. Objectives

- [ ] Objective 1 — Replace blacklist `ignore` callback with whitelist filtering in `page.markdown.validate` (maps to acceptance: "uses ownership map entries filtered by command")
- [ ] Objective 2 — Exclude `auth.md` without hardcoded callback (maps to acceptance: "auth.md excluded without hardcoded ignore callback")
- [ ] Objective 3 — All existing markdown twins continue to pass validation (maps to acceptance: "All existing markdown twins continue to pass validation")
- [ ] Objective 4 — `MDMETA-01` still fires for twins missing frontmatter (maps to acceptance: "MDMETA-01 still fires")
- [ ] Objective 5 — Unit tests cover non-twin exclusion, twin missing frontmatter, twin valid frontmatter (maps to 3 acceptance test criteria)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0811 (maps to acceptance: "rfc.validate passes")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/ownership-pattern-match.ts` — **new file**: extracted pattern-matching utilities (`toPosix`, `segmentToRegexSource`, `ownPatternToExactRegex`, `normalizeOwnershipPath`, `expandPlaceholderVariants`, `matchOwnershipEntry`) deduplicated from 3 existing copies
- `packages/werkstatt-site/src/checks/page-markdown.ts` — change file discovery in `runPageMarkdownValidate` from blacklist to whitelist; remove dead `isGeneratedMarkdownTwin` function
- `packages/werkstatt-site/src/checks/generated-file-lookup.ts` — remove local copies of extracted utilities, import from `ownership-pattern-match.ts`
- `packages/werkstatt-site/src/checks/generated-edit-guard.ts` — remove local copies of extracted utilities, import from `ownership-pattern-match.ts`
- `packages/werkstatt-site/src/checks/gitattributes.ts` — remove local copy of `ownPatternToExactRegex`, import from `ownership-pattern-match.ts`
- `packages/werkstatt-site/src/checks/generator-ownership.ts` — read-only source of truth for `GENERATOR_OWNERSHIP_MAP` entries

### 2.2 Configuration and data

No configuration or data files change. The `GENERATOR_OWNERSHIP_MAP` already contains the correct entries (`public/index.md` and `public/{route}.md` under `page.markdown.generate`, `public/auth.md` under `agent.discovery-endpoints.generate`).

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0811-*.md` — read-only reference (accepted status)
- No `AGENTS.md` updates needed — no new rules, no new commands, no package boundary changes
- No `docs/*.xml` Compass sync needed — no repository-wide semantics change
- No `docs/architecture-dna.md` update needed — `kind: policy`, no new DNA invariant

### 2.4 Validation and pipelines

- `page.markdown.validate` remains in its current pipeline — no pipeline changes
- No new commands added or removed
- `command.manifest.generate` not needed — no command surface change

## 3. Step sequence

### Step 1. Extract pattern-matching utilities to `ownership-pattern-match.ts`

**Goal:** Deduplicate `ownPatternToExactRegex`, `segmentToRegexSource`, `normalizeOwnershipPath`, `expandPlaceholderVariants`, `matchOwnershipEntry`, and `toPosix` from 3 files into a single shared utility.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/ownership-pattern-match.ts` with the following exports, taken from `generated-file-lookup.ts` (the most complete copy):
  - `toPosix(path: string): string`
  - `segmentToRegexSource(segment: string): string`
  - `ownPatternToExactRegex(pattern: string): RegExp`
  - `normalizeOwnershipPath(rawPath: string): string`
  - `expandPlaceholderVariants(pattern: string): string[]`
  - `matchOwnershipEntry(relPath: string, app?: string): OwnershipEntry | null` (requires importing `OwnershipEntry` type from `./generator-ownership.ts`)
- Add a `MODULE_CONTRACT` block to the new file documenting its purpose
- Update `generated-file-lookup.ts`: remove local copies of all 6 functions, import from `./ownership-pattern-match.ts`
- Update `generated-edit-guard.ts`: remove local copies of `ownPatternToExactRegex`, `segmentToRegexSource`, and any other duplicated utilities, import from `./ownership-pattern-match.ts`
- Update `gitattributes.ts`: remove local copy of `ownPatternToExactRegex`, import from `./ownership-pattern-match.ts`
- Verify all three consumers still work correctly — the function signatures and behavior must be identical (copy from `generated-file-lookup.ts` as canonical)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm --filter @warpgogol/werkstatt-site run test` — all existing tests pass (no behavior change, only deduplication)

**Completion criterion:** `ownership-pattern-match.ts` exists with all 6 exported functions; `generated-file-lookup.ts`, `generated-edit-guard.ts`, and `gitattributes.ts` import from it instead of defining local copies; all tests pass

**Human review:** no

---

### Step 2. Replace blacklist with whitelist in `runPageMarkdownValidate`

**Goal:** Change file discovery in `runPageMarkdownValidate` to only scan `.md` files matching `page.markdown.generate` ownership entries.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/page-markdown.ts`, import `matchOwnershipEntry` and `toPosix` from `./ownership-pattern-match.ts`
- Replace the `collectFiles` call with whitelist filtering:

```ts
// Before:
const markdownFiles = await collectFiles(publicDir, {
  extensions: [".md"],
  ignore: (relPath) => relPath === "auth.md",
});

// After:
const allMdFiles = await collectFiles(publicDir, { extensions: [".md"] });
const siteDir = paths.appDirectory; // site root for relative path computation
const app = input.flags.site as string | undefined;
const markdownFiles = allMdFiles.filter((abs) => {
  const relPath = toPosix(relative(context.workspaceRoot, abs));
  const entry = matchOwnershipEntry(relPath, app);
  return entry !== null && entry.command === "page.markdown.generate";
});
```

- Remove the hardcoded `ignore: (relPath) => relPath === "auth.md"` callback
- Remove the `isGeneratedMarkdownTwin` function (always returns `true` — now dead code after whitelist filtering) and all its call sites in the validation loop
- Ensure `app` (site name) is available — read from `input.flags.site` or `context.site.name` depending on how the validator receives the site identifier. Check the existing function signature for how `--site` is passed.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm --filter @warpgogol/werkstatt-site run test` — existing tests still pass (may need test adjustments — see Step 3)

**Completion criterion:** `page.markdown.validate` uses `matchOwnershipEntry` filtered by `command === "page.markdown.generate"` instead of the blacklist `ignore` callback; the hardcoded `auth.md` exclusion is removed; `isGeneratedMarkdownTwin` is deleted

**Human review:** no

---

### Step 3. Restructure test infrastructure for workspace-relative paths

**Goal:** Update the test `ctx()` helper and existing tests to use a realistic workspace layout (`apps/test-app/public/`) so `matchOwnershipEntry` can match paths correctly.

**Agent actions:**

- Update the `ctx()` helper in `packages/werkstatt-site/src/checks/tests/page-markdown.test.ts`:
  - `workspaceRoot` should be the temp root (parent of `apps/`)
  - `site.directory` should be `join(root, "apps", "test-app")`
  - `site.name` should be `"test-app"`
  - Files are created under `join(root, "apps", "test-app", "public")`
- Update all existing tests to create files under the new `apps/test-app/public/` path
- Update the `input` to include `flags: { site: "test-app" }` if the implementation reads site name from flags
- Verify `relative(root, join(root, "apps", "test-app", "public", "test.md"))` = `apps/test-app/public/test.md` matches `apps/*/public/{route}.md` expanded to `apps/*/public/*.md` — this is the correct workspace-relative path

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all existing tests pass with the restructured layout

**Completion criterion:** All existing tests pass with the `apps/test-app/public/` directory structure; `ctx()` helper produces workspace-relative paths that `matchOwnershipEntry` can match

**Human review:** no

---

### Step 4. Add unit tests for whitelist behavior

**Goal:** Verify the whitelist correctly includes twins and excludes non-twins.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/tests/page-markdown.test.ts`, add a new `describe` block "page.markdown.validate — whitelist scanning (RFC-0811)"
- **Test: non-twin `.md` file in `public/` is not flagged** — create `apps/test-app/public/auth.md` (no frontmatter, not a twin). Run `runPageMarkdownValidate`. Assert `exitCode: 0` and no `MDMETA-01` error. `auth.md` is in `GENERATOR_OWNERSHIP_MAP` under `agent.discovery-endpoints.generate`, so it will be matched by `matchOwnershipEntry` but filtered out by `command !== "page.markdown.generate"`.
- **Test: twin `.md` file with missing frontmatter is flagged** — create `apps/test-app/public/index.md` containing twin content without frontmatter. Run `runPageMarkdownValidate`. Assert `MDMETA-01` fires. `index.md` matches `public/index.md` ownership entry (command: `page.markdown.generate`).
- **Test: twin `.md` file with valid frontmatter passes** — create `apps/test-app/public/index.md` containing valid twin content with frontmatter. Run `runPageMarkdownValidate`. Assert `exitCode: 0` and no `MDMETA` errors.
- **Test: `.md` file in subdirectory matching `{route}` pattern** — create `apps/test-app/public/de/some-page/index.md` with valid twin content. Verify it matches `public/{route}.md` and is validated.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass (existing + new)

**Completion criterion:** Four new tests pass: non-twin excluded, twin missing frontmatter flagged, twin valid frontmatter passes, subdirectory twin matched

**Human review:** no

---

### Step 5. Run validation suite and acceptance probes

**Goal:** Verify the implementation meets all acceptance criteria.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0811` — RFC validates
- Run `pnpm exec werkstatt run page.markdown.validate --site warpgogol-com` (acceptance probe) — exit code 0
- Verify acceptance criteria checklist:
  - [ ] `page.markdown.validate` uses ownership map entries filtered by `command === "page.markdown.generate"` as whitelist
  - [ ] `auth.md` excluded without hardcoded ignore callback
  - [ ] All existing markdown twins continue to pass validation
  - [ ] `MDMETA-01` still fires for twins missing frontmatter
  - [ ] Unit test: non-twin `.md` file in `public/` is not flagged
  - [ ] Unit test: twin `.md` file with missing frontmatter is flagged
  - [ ] Unit test: twin `.md` file with valid frontmatter passes
  - [ ] `rfc.validate` passes on this file before merging

**Validation:**

- All commands above pass

**Completion criterion:** All acceptance criteria checkboxes can be marked `[x]` with evidence

**Human review:** no

---

### Step 6. Emit verification evidence

**Goal:** Produce the verification evidence file required by RFC-0330.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0811` — emits `docs/rfcs/verification/rfc-0811.generated.json`
- Verify the evidence file contains the acceptance probe results

**Validation:**

- Evidence file exists at `docs/rfcs/verification/rfc-0811.generated.json`

**Completion criterion:** Verification evidence file is generated and committed

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — no new rules or package boundary changes
- No `docs/*.xml` Compass sync needed — no repository-wide semantics change
- No `docs/architecture-dna.md` update needed — no new DNA invariant
- No `command.manifest.generate` needed — no command surface change
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0811 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0811`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0811`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0811` (acceptance probe: `page.markdown.validate --site warpgogol-com`)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0811` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0811.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0811` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Missing ownership map entries for existing twins | Step 5 acceptance probe runs `page.markdown.validate --site warpgogol-com` against a real site — if twins are silently skipped, the probe will not catch it directly, but `ownership.sync.validate` (run separately) catches missing entries. RFC-0810 cross-check is the safety net. |
| Glob matching complexity | Step 1 extracts and deduplicates the pattern-matching utilities; Step 2 reuses `matchOwnershipEntry` which handles `{route}`, `{lang}` placeholders via `expandPlaceholderVariants` and `ownPatternToExactRegex`. No new glob utility. |
| Test path mismatch with workspace-relative expectations | Step 3 restructures test temp dirs to `apps/test-app/public/` with `workspaceRoot` as parent, producing correct `apps/test-app/public/*.md` relative paths that `matchOwnershipEntry` can match. |
| Deduplication breaks behavior in `generated-edit-guard.ts` or `gitattributes.ts` | Step 1 validates with `build:check` and full test suite after extraction. The functions are identical across all 3 copies — verified by grep. Any behavioral difference would surface in existing tests. |

## 6. Escalation triggers

- If implementation reveals that `matchOwnershipEntry` cannot be reused due to path normalization issues that require changing its contract, create a new helper function local to `page-markdown.ts` instead. Do not change `matchOwnershipEntry`'s contract — it is used by `generated.file.lookup` and `generated.edit.guard`.
- If the acceptance probe `page.markdown.validate --site warpgogol-com` fails on a real site due to a missing ownership entry for an existing twin, do NOT add the missing entry in this RFC — report it as an `ownership.sync.validate` finding (RFC-0810) and fix the ownership map separately.
- If deduplication of `ownPatternToExactRegex` across `gitattributes.ts` reveals behavioral differences (the `gitattributes.ts` copy may have subtle differences), do NOT force-unify — keep `gitattributes.ts` using its own local copy and only deduplicate `generated-file-lookup.ts` and `generated-edit-guard.ts`.
