---
rfcId: RFC-0910
planId: PLAN-RFC-0910-01
status: draft
owner: architecture
createdAt: 2026-08-22
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-shared
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-shared/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0910

## 1. Objectives

- [ ] O1 — `Organization.url` uses canonical root (no default-language prefix) — maps to acceptance criterion 1
- [ ] O2 — `WebSite.url` inherits canonical root from `page.organization.url` — maps to acceptance criterion 2
- [ ] O3 — Breadcrumb home item verified as already canonical via `localizeUrl` — maps to acceptance criterion 3
- [ ] O4 — `jsonld.canonical-entity.validate` validator registered with JSONLD-ENTITY-01..03 — maps to acceptance criteria 4, 5, 6
- [ ] O5 — Unit tests cover default-language root, non-default language, prefixed-site edge case, same-origin Person.url — maps to acceptance criterion 7
- [ ] O6 — warpgogol-com rendered JSON-LD passes the validator — maps to acceptance criterion 8
- [ ] O7 — Documentation synced (AGENTS.md files, verification-plan.xml) — maps to acceptance criteria 9, 10, 11
- [ ] O8 — `rfc.validate` passes and RFC stamped implemented — maps to acceptance criterion 12

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/share/semantic/organization-profile.ts` — replace `toAbsoluteUrl(baseUrl, \`/${input.lang}/\`)` with `canonicalRootUrl(baseUrl, "always")`
- `packages/werkstatt-shared/src/share/semantic/ids.ts` — add `canonicalRootUrl` helper (or add to existing `toAbsoluteUrl` module)
- `packages/werkstatt-shared/src/share/semantic/jsonld/website.ts` — no code change (inherits from `page.organization.url`)
- `packages/werkstatt-shared/src/share/semantic/jsonld/breadcrumb.ts` — no code change (absolutizes against `page.url`)
- `packages/werkstatt-shared/src/share/semantic/jsonld/person.ts` — no code change (uses authored `person.profileUrl`)
- `packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts` — verify `homeUrl: localizeUrl(lang, "", { defaultLanguage: defaultLang })` at line 995 (already correct)
- `packages/werkstatt-site/src/checks/audit/validators/jsonld.ts` — add `jsonld.canonical-entity.validate` handler alongside existing `jsonld.url.validate` and `jsonld.parity`
- `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts` — register `jsonld.canonical-entity.validate` command
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — add `{ command: "jsonld.canonical-entity.validate" }` after `jsonld.url.validate`

### 2.2 Configuration and data

- No YAML/JSON config files changed. The validator derives expected canonical form from the site's RFC-0160 routing config at runtime.

### 2.3 Documentation and specs

- `packages/werkstatt-shared/AGENTS.md` — document canonical entity URL policy in semantic builders section
- `packages/werkstatt-site/AGENTS.md` — document `jsonld.canonical-entity.validate` command in Check commands section
- `docs/verification-plan.xml` — add JSONLD-ENTITY-01..03 rule IDs
- `docs/rfcs/rfc-0910-canonical-entity-identity-urls-in-json-ld.md` — read-only reference (already accepted)

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — new validator added after `jsonld.url.validate`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0910`

## 3. Step sequence

### Step 1. Add `canonicalRootUrl` helper to werkstatt-shared

**Goal:** Create the canonical root URL builder in `werkstatt-shared` that produces the unprefixed root URL with trailing-slash policy.

**Agent actions:**

- Add `canonicalRootUrl(baseUrl: string, trailingSlash: "always" | "never"): string` to `packages/werkstatt-shared/src/share/semantic/ids.ts` (or a new `canonical-root.ts` module if `ids.ts` is not the right home)
- The helper produces `https://example.com/` (with trailing slash for `"always"`) from a base URL, regardless of language — the entity root is language-independent
- Export from the appropriate barrel

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check`

**Completion criterion:** `canonicalRootUrl` is exported and produces `https://example.com/` for `"always"` trailing slash.

**Human review:** no

---

### Step 2. Fix `Organization.url` in `organization-profile.ts`

**Goal:** Replace the raw language-prefix URL construction with `canonicalRootUrl`.

**Agent actions:**

- In `packages/werkstatt-shared/src/share/semantic/organization-profile.ts` line 107, replace `toAbsoluteUrl(baseUrl, \`/${input.lang}/\`)` with `canonicalRootUrl(baseUrl, "always")`
- Update any snapshot/behavior tests that assert `/de/` identity URLs to assert `/` instead

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run test`

**Completion criterion:** `Organization.url` in built JSON-LD is `https://site/` (no language prefix). Existing tests pass with updated assertions.

**Human review:** no

---

### Step 3. Verify breadcrumb home URL and WebSite.url

**Goal:** Confirm that `WebSite.url` and breadcrumb home item are already canonical after Step 2.

**Agent actions:**

- Verify `jsonld/website.ts` line 22 (`url: page.organization.url`) — no change needed, inherits canonical root from Step 2
- Verify `resolve-route.ts:995` (`homeUrl: localizeUrl(lang, "", { defaultLanguage: defaultLang })`) — already returns `/` for default language per RFC-0160
- Verify `jsonld/breadcrumb.ts` — absolutizes against `page.url`, does not construct URLs, no change needed
- Add a test assertion that `WebSite.url === Organization.url === canonicalRootUrl(baseUrl, "always")`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run test`

**Completion criterion:** `WebSite.url` and breadcrumb home item are canonical without code changes. Test confirms equality.

**Human review:** no

---

### Step 4. Implement `jsonld.canonical-entity.validate` validator

**Goal:** Create the post-build validator that scans rendered HTML for non-canonical entity identity URLs.

**Agent actions:**

- Add `runJsonldCanonicalEntityValidate` handler to `packages/werkstatt-site/src/checks/audit/validators/jsonld.ts` (or a new `jsonld-canonical-entity.ts` file if separation is cleaner)
- Parse `<script type="application/ld+json">` blocks from `dist/client/**/*.html`
- For each entity (`Organization`, `WebSite`, `BreadcrumbList`, `Person`), check URL-valued fields against the canonical root derived from the site's RFC-0160 routing config
- For `Person.url`, check `new URL(person.url).origin === siteOrigin` before applying canonical check (skip external URLs)
- Emit `JSONLD-ENTITY-01` (Organization/WebSite), `JSONLD-ENTITY-02` (BreadcrumbList items), `JSONLD-ENTITY-03` (same-origin Person.url) with `error` severity
- Skip unparseable JSON-LD blocks (already reported by `seo.structured-data.validate`)
- Skip pages without JSON-LD graph

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Handler compiles, produces `Diagnostic` envelope with correct rule IDs and severities.

**Human review:** no

---

### Step 5. Register command and wire into pipeline

**Goal:** Register the validator command and add it to the post-build pipeline.

**Agent actions:**

- Register `jsonld.canonical-entity.validate` in `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts`
- Add `{ command: "jsonld.canonical-entity.validate" }` to `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` after `{ command: "jsonld.url.validate" }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Command appears in registry; pipeline includes the new step after `jsonld.url.validate`.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Cover the validator with unit tests for all rule IDs and edge cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/jsonld-canonical-entity.test.ts`
- Test cases:
  - JSONLD-ENTITY-01: `Organization.url` = `/de/` → error; `Organization.url` = `/` → pass
  - JSONLD-ENTITY-01: `WebSite.url` = `/de/` → error; `WebSite.url` = `/` → pass
  - JSONLD-ENTITY-02: BreadcrumbList item with `/de/` prefix → error; with `/` → pass
  - JSONLD-ENTITY-03: same-origin `Person.url` = `/de/team/john` → error; external `Person.url` = `https://linkedin.com/in/john` → skip (no error)
  - Empty/no JSON-LD page → skip (no diagnostics)
  - Malformed JSON-LD → skip (no diagnostics from this validator)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All test cases pass; validator correctly distinguishes canonical vs non-canonical and same-origin vs external.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Sync AGENTS.md files and verification-plan.xml with the new command and policy.

**Agent actions:**

- Add `jsonld.canonical-entity.validate` to the Check commands section of `packages/werkstatt-site/AGENTS.md`
- Add canonical entity URL policy note to `packages/werkstatt-shared/AGENTS.md` semantic builders section
- Add `JSONLD-ENTITY-01`, `JSONLD-ENTITY-02`, `JSONLD-ENTITY-03` rule IDs to `docs/verification-plan.xml`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed

**Validation:**

- `git diff --stat` confirms all scope.docs files modified
- `pnpm exec werkstatt run rfc.validate --id RFC-0910`

**Completion criterion:** All three documentation files updated; `rfc.validate` passes.

**Human review:** no

---

### Step 8. Run validation suite and acceptance probes

**Goal:** Run the full validation suite to confirm all acceptance criteria are met.

**Agent actions:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0910`
- Run a build of warpgogol-com (or use existing dist) and run `jsonld.canonical-entity.validate` against rendered HTML to confirm pass

**Validation:**

- All commands exit 0

**Completion criterion:** All build checks and tests pass; validator passes on warpgogol-com rendered JSON-LD.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Emit verification evidence:** run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0910` and commit the evidence file.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0910 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0910`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0910`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0910` (RFC-0330)
- `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0910 --implementation-commit <sha>`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0910.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0910` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Knowledge-graph re-anchoring (`/de/` → `/`) | Step 2 fixes builder; change consolidates rather than moves signals (low risk) |
| False positives on sites with intentional prefixed roots | Step 4 validator derives expected form from site's RFC-0160 routing config, not hardcoded |
| Performance (scanning dist HTML) | Step 4 uses same pattern as `seo.structured-data.validate` — negligible (one pass, ~100-200 pages) |
| Migration suppression | Steps 2+4 land atomically — no suppression needed; sites rebuild with canonical URLs |
| Test churn (snapshots asserting `/de/`) | Step 2 updates snapshots in same commit as builder fix |
| Agent misinterpretation (fixing content instead of builders) | Implementation notes in RFC explicitly forbid content-side fixes; plan Step 2 targets builder only |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-85 or DNA-86, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0910 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `canonicalRootUrl` output diverges from `canonicalPageUrl` output for root route, escalate as a DNA-85 byte-identity conflict — do not patch one to match the other without a superseding RFC.
