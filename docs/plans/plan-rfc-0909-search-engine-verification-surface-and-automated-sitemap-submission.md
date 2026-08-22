---
rfcId: RFC-0909
planId: PLAN-RFC-0909-01
status: draft
owner: architecture
createdAt: 2026-08-22
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
    - "@warpgogol/werkstatt-shared"
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - .env.example
    - docs/runbooks/search-console-setup.md
---

# Implementation Plan: RFC-0909

## 1. Objectives

- [ ] Objective 1 — Extend `systemManifestSchema` with `verification.google` field (maps to acceptance criterion 1)
- [ ] Objective 2 — Implement `search.verification.validate` command with offline + `--live` modes (maps to acceptance criteria 2, 3, 6)
- [ ] Objective 3 — Implement `search.sitemap.submit` command with hand-rolled JWT + fetch (maps to acceptance criterion 4)
- [ ] Objective 4 — Emit `google-site-verification` meta tag in layout when `method: meta-tag` (maps to acceptance criterion 5)
- [ ] Objective 5 — Add onboarding template stub + `.env.example` documentation + runbook (maps to acceptance criteria 7, 8, 9)
- [ ] Objective 6 — Update `packages/werkstatt-site/AGENTS.md` with new commands (maps to acceptance criterion 11)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/ontology/schemas/system/manifest.ts` — add `verification` field to `systemManifestSchema`
- `packages/werkstatt-shared/src/ontology/schemas/system/verification.ts` — new file: `verificationSchema` + `VerificationConfig` type
- `packages/werkstatt-site/src/checks/public-surface/search-verification.ts` — new handler: `runSearchVerificationValidate`
- `packages/werkstatt-site/src/checks/public-surface/search-sitemap-submit.ts` — new handler: `runSearchSitemapSubmit`
- `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` — register both commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `search.verification.validate` to `SITES_CHECK_AUTHOR_PIPELINE`
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — add `search.verification.validate --live` to `SITES_CHECK_POSTBUILD_PIPELINE` (or deploy evidence path)
- `packages/werkstatt-site/src/domain/ui/components/layout/layout-component.astro` — add `googleVerificationToken` prop, emit meta tag in `<head>`
- `packages/werkstatt-site/src/onboarding/templates/system.template.md` — add commented `verification:` stub

### 2.2 Configuration and data

- `src/content/system.md` (per-site workpiece) — gains `verification:` section (operator-supplied, not code)
- `.env.example` (root) — add `GSC_SERVICE_ACCOUNT_JSON` with `# How to obtain:` instructions

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — document `search.verification.validate` and `search.sitemap.submit` in Check commands section
- `docs/runbooks/search-console-setup.md` — new runbook: property creation, service-account authorization, first submission
- `docs/verification-plan.xml` — add `search.verification.validate` to author pipeline surface (if tracked)

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — gains `search.verification.validate` (offline mode, error severity)
- `SITES_CHECK_POSTBUILD_PIPELINE` — gains `search.verification.validate` for live mode (or deploy evidence path)
- Unit tests in `packages/werkstatt-site/src/checks/tests/search-verification.test.ts`
- Unit tests in `packages/werkstatt-site/src/checks/tests/search-sitemap-submit.test.ts`

## 3. Step sequence

### Step 1. Schema extension: verification field in systemManifestSchema

**Goal:** Add `verification` optional field to the system manifest schema so `system.md` can declare per-engine verification config.

**Agent actions:**

- Create `packages/werkstatt-shared/src/ontology/schemas/system/verification.ts` with a Zod schema:
  ```ts
  export const verificationSchema = z.object({
    google: z.object({
      method: z.enum(["dns-txt", "meta-tag"]),
      token: z.string().min(1),
    }).optional(),
  }).optional();
  ```
- Import and add `verification: verificationSchema.optional()` to `systemManifestSchema` in `packages/werkstatt-shared/src/ontology/schemas/system/manifest.ts`
- Export `VerificationConfig` type from the schema module

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` — typecheck passes
- `system.manifest.validate` accepts a test `system.md` with `verification.google` present

**Completion criterion:** `systemManifestSchema` parses `verification.google` with `method` and `token` fields; typecheck passes.

**Human review:** no

---

### Step 2. Handler: search.verification.validate (offline + live)

**Goal:** Implement the `search.verification.validate` command with offline config checks and `--live` DNS/HTTP checks.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/public-surface/search-verification.ts`
- Implement `runSearchVerificationValidate` following the `indexnow.ts` handler pattern:
  - Load `AppPublicContext` and resolve `system.md` verification config
  - **Offline mode:** check presence of `verification.google` → emit `SEARCH-VERIFY-01` if missing; emit `SEARCH-VERIFY-04` (warning) if token is malformed
  - **Live mode (`--live` flag):**
    - `method: dns-txt` — perform DNS TXT lookup using `node:dns/promises` `resolveTxt`; compare against declared token using `normalizeTxtForCompare` from `@warpgogol/werkstatt/dns`; emit `SEARCH-VERIFY-02` if absent
    - `method: meta-tag` — fetch the site's homepage HTML and check for `<meta name="google-site-verification" content="...">` matching the declared token; emit `SEARCH-VERIFY-03` if absent
    - Network failures → emit `SEARCH-VERIFY-NETWORK` (inconclusive, not failure)
- Use `diagnosticsResult` from `result-helpers.ts` for standard Diagnostic output shape
- Register in `command-tables/31-public-surface.ts` with `scope: "app"`, `supportsAllSites: true`, `requiresNetwork: true` (for live mode), `flags: { live: { kind: "boolean" } }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Unit tests cover offline pass/fail, live DNS TXT pass/fail, live meta-tag pass/fail, network failure → inconclusive

**Completion criterion:** Command registered, offline mode emits SEARCH-VERIFY-01/04, live mode emits SEARCH-VERIFY-02/03/NETWORK, typecheck passes.

**Human review:** no

---

### Step 3. Handler: search.sitemap.submit (JWT + fetch)

**Goal:** Implement the `search.sitemap.submit` command using hand-rolled JWT + fetch to submit sitemap index URL to Google Search Console API.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/public-surface/search-sitemap-submit.ts`
- Implement `runSearchSitemapSubmit` following the `indexnow.ts` submission pattern:
  - Read `GSC_SERVICE_ACCOUNT_JSON` env var (inline JSON with `client_email`, `private_key`, `token_uri`)
  - If absent → exit 1 with `skipped: true` and `nextSteps` pointing at `.env.example` (DNA-82)
  - Construct JWT header (`{"alg":"RS256","typ":"JWT"}`) and payload (`iss`, `scope`, `aud`, `exp`, `iat`)
  - Sign JWT with RSA private key using `node:crypto` (`crypto.createSign`)
  - Exchange JWT for access token via `POST` to `token_uri` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
  - `PUT` to `https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{sitemapUrl}` with bearer token
  - `--dry-run` flag: print the API request (URL, headers, body) without sending
  - Return `SitemapSubmitResult` with `submitted`, `apiResponse`, `skipped` fields
- Register in `command-tables/31-public-surface.ts` with `scope: "app"`, `supportsAllSites: true`, `requiresNetwork: true`, `flags: { "dry-run": { kind: "boolean" } }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Unit tests cover: missing credentials → exit 1 with `skipped: true`; `--dry-run` prints request without network call; credential parsing and JWT construction

**Completion criterion:** Command registered, submits sitemap via Search Console API with JWT auth, `--dry-run` works, missing credentials exits 1 with remediation.

**Human review:** no

---

### Step 4. Pipeline wiring

**Goal:** Wire `search.verification.validate` into the author pipeline (offline) and postbuild pipeline (live).

**Agent actions:**

- Add `{ command: "search.verification.validate" }` to `SITES_CHECK_AUTHOR_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` after `system.manifest.validate`
- Add `{ command: "search.verification.validate", flags: { live: true } }` to the deploy evidence path (alongside freshness/health checks). Investigate `packages/werkstatt-site/src/deploy/` for the deploy evidence pipeline. The `--live` mode must run after the site is deployed, not in postbuild (which runs before deployment). If no deploy evidence pipeline exists, add the live check to `SITES_CHECK_POSTBUILD_PIPELINE` as an interim placement and document the limitation

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Pipeline definitions include the new steps

**Completion criterion:** Offline validator in author pipeline; live validator in deploy evidence path (or postbuild as interim).

**Human review:** no

---

### Step 5. Layout meta-tag emission

**Goal:** Emit `<meta name="google-site-verification" content="...">` in the layout `<head>` when `method: meta-tag` is configured.

**Agent actions:**

- Add `googleVerificationToken?: string` prop to `layout-component.astro` `Props` interface
- In the `<head>` section, after the robots meta tag, add conditional emission:
  ```astro
  {googleVerificationToken && (
    <meta name="google-site-verification" content={googleVerificationToken} />
  )}
  ```
- Update the proxy layout (or page handler) that calls `layout-component.astro` to pass `googleVerificationToken` from the resolved system manifest when `verification.google.method === "meta-tag"`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Rendered HTML includes the meta tag when `method: meta-tag` is configured

**Completion criterion:** Layout emits `google-site-verification` meta tag when configured; no meta tag when `method: dns-txt` or no verification config.

**Human review:** no

---

### Step 6. Onboarding template, .env.example, and runbook

**Goal:** Add the onboarding template stub, document the env var, and create the runbook.

**Agent actions:**

- Add a commented `verification:` stub to `packages/werkstatt-site/src/onboarding/templates/system.template.md`:
  ```yaml
  # verification:
  #   google:
  #     method: dns-txt  # or meta-tag
  #     token: google-site-verification=...
  ```
- Add `GSC_SERVICE_ACCOUNT_JSON` entry to `.env.example` with `# How to obtain:` instructions (DNA-40 format):
  ```
  # ── Google Search Console (sitemap submission)
  # How to obtain: Create a service account in Google Cloud Console, enable
  # Search Console API, add the service account as a user in Search Console
  # property. Paste the full JSON key here. NEVER commit this value.
  GSC_SERVICE_ACCOUNT_JSON=
  ```
- Create `docs/runbooks/search-console-setup.md` covering:
  1. Create Search Console property for the site domain
  2. Obtain DNS TXT verification token
  3. Add token to `system.md` `verification.google` section
  4. Apply DNS TXT record via RFC-0753 protocol
  5. Create service account in Google Cloud Console
  6. Enable Search Console API
  7. Add service account as user in Search Console property
  8. Set `GSC_SERVICE_ACCOUNT_JSON` env var
  9. Run `search.sitemap.submit --dry-run` then without `--dry-run`

**Validation:**

- `grep "verification:" packages/werkstatt-site/src/onboarding/templates/system.template.md` — finds the stub
- `grep "GSC_SERVICE_ACCOUNT_JSON" .env.example` — finds the entry
- `test -f docs/runbooks/search-console-setup.md` — runbook exists

**Completion criterion:** Template stub present, env var documented, runbook exists with all 9 steps.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Write unit tests for both new commands covering all diagnostic rules and edge cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/search-verification.test.ts`:
  - SEARCH-VERIFY-01: no verification config → error
  - SEARCH-VERIFY-04: malformed token → warning
  - Offline pass: valid config → no errors
  - Live DNS TXT: record present → pass; record absent → SEARCH-VERIFY-02
  - Live meta-tag: tag present → pass; tag absent → SEARCH-VERIFY-03
  - Network failure → SEARCH-VERIFY-NETWORK (inconclusive)
- Create `packages/werkstatt-site/src/checks/tests/search-sitemap-submit.test.ts`:
  - Missing credentials → exit 1, `skipped: true`, `nextSteps` present
  - `--dry-run` → prints request, no network call, `submitted: false`
  - Credential parsing: valid JSON → JWT constructed; invalid JSON → error
  - Mock `fetch` for API response tests

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All test cases pass; coverage includes all 4 diagnostic rules + network failure + submit skip/dry-run.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update `packages/werkstatt-site/AGENTS.md` with the new commands.

**Agent actions:**

- Add entries to the "Check commands" section in `packages/werkstatt-site/AGENTS.md`:
  - `search.verification.validate` (RFC-0909) — validates search engine verification config in `system.md`. Offline mode checks presence and shape; `--live` mode performs DNS TXT lookup or rendered-head meta tag check. Emits `SEARCH-VERIFY-01` through `SEARCH-VERIFY-04` and `SEARCH-VERIFY-NETWORK`. Integrated into `SITES_CHECK_AUTHOR_PIPELINE` and `SITES_CHECK_POSTBUILD_PIPELINE`.
  - `search.sitemap.submit` (RFC-0909) — submits sitemap index URL to Google Search Console API using service-account JWT auth from `GSC_SERVICE_ACCOUNT_JSON` env var. Supports `--dry-run`. Exits 1 with `skipped: true` if credentials absent.

**Validation:**

- `grep "search.verification.validate" packages/werkstatt-site/AGENTS.md` — finds the entry
- `grep "search.sitemap.submit" packages/werkstatt-site/AGENTS.md` — finds the entry

**Completion criterion:** Both commands documented in AGENTS.md Check commands section.

**Human review:** no

---

### Final Step. Review, fix, evidence, and stamp implemented

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0909` — must pass with zero errors
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0909` — acceptance probes pass
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0909` — emit evidence file
- Commit evidence file
- Invoke `fo-review` via the `skill` tool on all session code changes
- Invoke `fo-fix` if review has findings; re-run `fo-review` to confirm (max 3 iterations)
- Check off all acceptance criteria with inline `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0909` (dry-run first, then without `--dry-run`)
- Commit the stamped RFC separately

**Validation:**

- `git status` — no uncommitted changes from this session
- `pnpm exec werkstatt run rfc.validate --id RFC-0909` — passes
- Review report exists in `docs/reviews/code/` for this session
- All acceptance criteria marked `[x]` with evidence

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0909`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0909`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0909`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0909.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0909` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Credential handling — service-account JSON is a powerful secret | Step 6: env-var only, `.env.example` documentation, never committed; secret-scan pipeline guards |
| False negatives in `--live` mode — DNS propagation delays | Step 2: `SEARCH-VERIFY-NETWORK` distinguishes infrastructure failure from absence; runbook (Step 6) tells operator to verify propagation |
| Search Console API surface drift — `webmasters/v3` is legacy | Step 3: API errors surface verbatim in `apiResponse`; command fails loudly, never silently |
| Agent misinterpretation — agents fabricating tokens | Implementation notes in RFC: agents MUST NOT invent tokens; acceptance criteria distinguish code from operator ops |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40 or DNA-72, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0909 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `googleapis` npm package is found to be required (e.g. JWT signing is too complex for `node:crypto`), escalate to a new RFC proposing the dependency addition rather than silently adding it.
