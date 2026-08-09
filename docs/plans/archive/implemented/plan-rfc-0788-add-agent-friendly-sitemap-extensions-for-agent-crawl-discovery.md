---
rfcId: RFC-0788
planId: PLAN-RFC-0788-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0788

## 1. Objectives

- [ ] Objective 1 — `generateSitemapXml` accepts optional `markdownTwins` map and emits `<xhtml:link rel="alternate" type="text/markdown" href="...">` entries (maps to acceptance criterion 1, 5)
- [ ] Objective 2 — `SitemapUrlEntry` type gains `markdownAlternates` field; `parseSitemapXml` extracts `type`-bearing alternates (maps to acceptance criterion 2, 3)
- [ ] Objective 3 — `runSitemapGenerate` builds `markdownTwins` map from `public/*.md` files using `markdownTwinRelPath` (maps to acceptance criterion 4)
- [ ] Objective 4 — `validateSitemapFile` validates markdown alternates in a separate pass from hreflang alternates (maps to acceptance criterion 6, 7)
- [ ] Objective 5 — Pages without `.md` twins do not get markdown alternate links; empty `public/` is not an error (maps to acceptance criterion 8, 9)
- [ ] Objective 6 — Unit tests cover all new code paths (maps to acceptance criterion 11)
- [ ] Objective 7 — Code review passed, RFC stamped as `implemented` (maps to acceptance criterion 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/sitemap-helpers.ts` — `generateSitemapXml` gains optional `markdownTwins` param; `SitemapUrlEntry` gains `markdownAlternates` field; `parseSitemapXml` extracts `type` alternates; `validateSitemapFile` gains markdown alternate validation pass
- `packages/werkstatt-site/src/checks/sitemap.ts` — `runSitemapGenerate` builds `markdownTwins` map from `public/*.md`; `runSitemapValidate` passes `markdownTwins` to `validateSitemapFile`
- `packages/werkstatt-site/src/checks/tests/sitemap-helpers.test.ts` — new test cases for markdown alternates

### 2.2 Configuration and data

No configuration or data changes. The `markdownTwins` map is built at runtime from existing `public/*.md` files.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0788-add-agent-friendly-sitemap-extensions-for-agent-crawl-discovery.md`
- No AGENTS.md updates needed — no new commands, no new package boundaries, no new governance rules.
- No `docs/*.xml` Compass sync needed — no repository-wide semantic changes.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — scoped typecheck
- `pnpm --filter @warpgogol/werkstatt-site run test` — vitest run (includes sitemap-helpers tests)
- `pnpm exec werkstatt run rfc.validate --id RFC-0788` — RFC mechanical validation

## 3. Step sequence

### Step 1. Amend `SitemapUrlEntry` type and `parseSitemapXml`

**Goal:** Extend the parser to recognize `<xhtml:link>` entries with `type` attribute (without `hreflang`) and populate a new `markdownAlternates` field on `SitemapUrlEntry`.

**Agent actions:**

- Add `markdownAlternates: Array<{ type: string; href: string }>` to the `SitemapUrlEntry` interface in `sitemap-helpers.ts`
- Add a second regex pass in `parseSitemapXml` that matches `<xhtml:link>` entries with `type` attribute but no `hreflang` — regex pattern: `/<xhtml:link[^>]*?type="([^"]*)"[^>]*?href="([^"]*)"[^>]*?\/?>/g`
- Initialize `markdownAlternates: []` for each parsed entry
- Update existing test cases in `sitemap-helpers.test.ts` that construct `SitemapUrlEntry` objects to include the new `markdownAlternates: []` field

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — existing tests pass with updated entries

**Completion criterion:** `SitemapUrlEntry` has `markdownAlternates` field; `parseSitemapXml` extracts `type`-bearing alternates; existing tests pass.

**Human review:** no

---

### Step 2. Amend `generateSitemapXml` to emit markdown alternate links

**Goal:** The generator emits `<xhtml:link rel="alternate" type="text/markdown" href="...">` entries for pages with `.md` twins.

**Agent actions:**

- Add optional third parameter `markdownTwins?: Map<string, string>` to `generateSitemapXml` in `sitemap-helpers.ts` (pageId → twin URL)
- Inside the `cluster.locales.map` callback, after the hreflang alternates, check if `markdownTwins` has an entry for `cluster.pageId`. If yes, append `\n    <xhtml:link rel="alternate" type="text/markdown" href="${escapeXml(twinUrl)}" />`
- The markdown alternate is added once per `<url>` block (per locale), pointing to the locale-specific twin URL. Since `markdownTwins` maps pageId → twin URL, and the twin URL is locale-specific, the map should actually map `pageId:lang` → twin URL, or the function should derive the twin URL per locale. **Decision:** the `markdownTwins` map keys are `${pageId}:${lang}` and values are the full twin URL. This allows per-locale twin URLs (e.g. `home:de` → `https://example.com/index.md`, `home:en` → `https://example.com/en/index.md`).
- Add CHANGE_SUMMARY entry for RFC-0788

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- New unit test: `generateSitemapXml` with `markdownTwins` map produces `<xhtml:link rel="alternate" type="text/markdown" href="...">` entries
- New unit test: `generateSitemapXml` without `markdownTwins` (or empty map) produces no markdown alternates

**Completion criterion:** `generateSitemapXml` accepts optional `markdownTwins` map and emits markdown alternate links; tests pass.

**Human review:** no

---

### Step 3. Amend `validateSitemapFile` to validate markdown alternates

**Goal:** The validator checks markdown alternates in a separate pass from hreflang alternates — missing expected markdown alternates and unexpected markdown alternates are both reported.

**Agent actions:**

- Add `markdownTwins: Map<string, string>` parameter to `validateSitemapFile` (pageId:lang → twin URL)
- After the existing hreflang validation loop, add a markdown alternate validation pass:
  - For each parsed entry, look up the expected twin URL from `markdownTwins` by matching the entry's `loc` to a cluster locale
  - Check that the expected twin URL appears in `entry.markdownAlternates`
  - Check that no unexpected markdown alternates are present
- The `validateSitemapFile` function already receives `clusters` and `defaultLanguage` — use these to build a `loc → pageId:lang` lookup
- Add CHANGE_SUMMARY entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- New unit test: validator passes when markdown alternates match expected twins
- New unit test: validator reports missing markdown alternate
- New unit test: validator reports unexpected markdown alternate
- New unit test: validator passes when no markdown twins exist (empty map, no markdown alternates in XML)

**Completion criterion:** `validateSitemapFile` validates markdown alternates separately from hreflang alternates; tests pass.

**Human review:** no

---

### Step 4. Wire `runSitemapGenerate` to build `markdownTwins` map

**Goal:** The generate command scans `public/` for `.md` files, maps them to page IDs by locale, and passes the map to `generateSitemapXml`.

**Agent actions:**

- In `runSitemapGenerate` (`sitemap.ts`), after building clusters:
  - Use `collectFiles` from `@warpgogol/werkstatt-site/share/fs` to scan `paths.publicDirectory` for `.md` files
  - For each `.md` file, compute the relative path from `publicDirectory`
  - Reverse-derive the page URL from the `.md` relative path using the inverse of `markdownTwinRelPath`: `index.md` → `/`, `${lang}/index.md` → `/${lang}/`, `${path}.md` → `/${path}/`
  - Match the derived URL against cluster locale URLs to find the `pageId:lang` key
  - Build `Map<string, string>` (`pageId:lang` → full twin URL)
- Pass the `markdownTwins` map to `generateSitemapXml` for each category
- Add CHANGE_SUMMARY entry for RFC-0788 in `sitemap.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** `runSitemapGenerate` builds `markdownTwins` map from `public/*.md` and passes it to `generateSitemapXml`; typecheck and tests pass.

**Human review:** no

---

### Step 5. Wire `runSitemapValidate` to pass `markdownTwins` to validation

**Goal:** The validate command builds the same `markdownTwins` map and passes it to `validateSitemapFile`.

**Agent actions:**

- In `runSitemapValidate` (`sitemap.ts`), after building clusters:
  - Build the same `markdownTwins` map as in Step 4 (extract to a shared helper if needed to avoid duplication)
  - Pass `markdownTwins` to `validateSitemapFile` in the validation loop
- Update the success summary to mention markdown alternate validation

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** `runSitemapValidate` passes `markdownTwins` to `validateSitemapFile`; typecheck and tests pass.

**Human review:** no

---

### Step 6. Add unit tests for all new code paths

**Goal:** Comprehensive test coverage for markdown alternate generation, parsing, and validation.

**Agent actions:**

- Add tests to `packages/werkstatt-site/src/checks/tests/sitemap-helpers.test.ts`:
  - `generateSitemapXml` with `markdownTwins` map produces markdown alternate links
  - `generateSitemapXml` without `markdownTwins` produces no markdown alternates
  - `generateSitemapXml` with empty `markdownTwins` map produces no markdown alternates
  - `parseSitemapXml` extracts `type`-bearing alternates into `markdownAlternates`
  - `parseSitemapXml` still extracts `hreflang` alternates into `hreflangs` (no regression)
  - `validateSitemapFile` passes when markdown alternates match expected twins
  - `validateSitemapFile` reports missing markdown alternate
  - `validateSitemapFile` reports unexpected markdown alternate
  - `validateSitemapFile` passes when no markdown twins exist (empty map)
  - `validateSitemapFile` does not flag markdown alternates as "Unexpected alternate link" (hreflang pass ignores them)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All new test cases pass; existing tests still pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files — no updates needed (no new commands, no new governance rules).
- Update affected `docs/*.xml` Compass files — no updates needed (no repository-wide semantic changes).
- Update `docs/architecture-dna.md` — no new DNA invariant.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed — no changes needed (existing commands amended, no new commands).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0788 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0788`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0788`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0788` (if acceptance probes declared — none declared in this RFC)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0788` in the subject line (RFC-0265 commit hygiene)
- No `rfc.verification.emit` needed — RFC-0788 has no acceptance probes (commented out in frontmatter)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Sitemap size increase (~80 bytes/URL) | Step 2 — only adds markdown alternate when twin exists; no mitigation needed for ~8KB on 100 pages |
| Sitemap validation tools may not recognize `type` attribute | Not a code risk — standard sitemap protocol extension; no mitigation needed |
| Twin path resolution correctness | Step 4 — uses existing `markdownTwinRelPath` helper, same logic as RFC-0785; tests in Step 6 verify mapping |
| Parser/validator would reject markdown alternates (audit finding) | Steps 1-3 — parser and validator are amended before generator; separate validation pass prevents false "Unexpected alternate" reports |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0788 --reason "..." --invariant "DNA-N"` instead of working around it.
