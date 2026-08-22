---
id: RFC-0909
title: "Search engine verification surface and automated sitemap submission"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-22
enhancedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-40
  - DNA-72
  - RFC-0311
  - RFC-0753
  - RFC-0898
  - RFC-0905
  - RFC-0906
  - RFC-0907
  - RFC-0908
  - RFC-0910
  - RFC-0911
  - RFC-0912
batch: seo-indexing-hardening
dependsOn: []
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-40
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - search.verification.validate
    - search.sitemap.submit
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "search.verification.validate fails a site whose system.md declares no search-engine verification"
  - "search.verification.validate --live fails when the declared DNS TXT record is absent from the public DNS"
  - "A site with verification.google.method: meta-tag renders the google-site-verification meta tag in <head> on every page"
  - "search.sitemap.submit submits the sitemap index URL to the Search Console API and records the API response"
nonGoals:
  - Ranking improvements, keyword strategy, or content quality — this RFC covers indexing infrastructure only.
  - Bing/Yandex webmaster APIs — IndexNow (RFC-0311) already covers non-Google submission.
  - Search Console performance reporting back into the workshop (monitoring dashboards are ops tooling, not site artifacts).
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "search.verification.validate"
  - probe: command-registered
    name: "search.sitemap.submit"
  - probe: file-contains
    path: "packages/werkstatt-site/src/onboarding/templates/system.template.md"
    pattern: "verification:"
---

# RFC-0909: Search engine verification surface and automated sitemap submission

## Context

An SEO audit of the workshop (2026-08-21) against the Google SEO Starter Guide found that the technical surface of workshop sites is strong — sitemap index with hreflang and lastmod, robots.txt with sitemap reference, canonical + hreflang validators (RFC-0898), JSON-LD coverage, image sitemap, IndexNow submission after deploy (RFC-0311). One gap remains: **no workshop site is verified in Google Search Console**, and no sitemap is submitted to Google. IndexNow (RFC-0311) covers Bing/Yandex but Google ignores the IndexNow protocol.

Without Search Console verification the operator has no coverage reports, no URL inspection, no sitemap feedback, and no manual-action visibility. Today, closing the gap is pure manual discipline: nothing in the workshop reminds, checks, or enforces verification for the current site (warpgogol-com) or for any future Sternsystem.

The DNS record management protocol (RFC-0753) already supports TXT records — `google-site-verification=...` appears in its examples — so the infrastructure to place a verification record exists; what is missing is the declaration, the validation, and the submission automation.

## Problem

No invariant protects the search-engine verification lifecycle:

1. **Undeclared** — `system.md` has no field for search-engine verification tokens, so there is nothing to check.
2. **Unchecked** — no validator verifies that a production site is verifiable (or verified) in Google Search Console. A site can reach `main` without any Search Console property.
3. **Unsubmitted** — sitemaps are generated and referenced from robots.txt, but nothing submits them to Google; discovery relies on organic crawling alone.
4. **Not inherited** — the onboarding template (`system.template.md`) contains no verification stub, so every future site is born with the same gap.

## Decision

Introduce a search-engine verification surface: `system.md` gains a `verification:` section declaring per-engine verification method and token; `search.verification.validate` enforces the declaration offline in the author pipeline and verifies the live DNS TXT record at the deploy gate; the layout emits a `google-site-verification` meta tag when the meta-tag method is configured (fallback for sites whose DNS is not workshop-managed); and a new `search.sitemap.submit` command submits the site's sitemap index to the Google Search Console API using a service account.

## Architectural fit

- **DNA-40 (env-example and deploy-script contract)** — the service-account credential is an env var (`GSC_SERVICE_ACCOUNT_JSON`, inline JSON) documented in `.env.example` with a `# How to obtain:` comment, never committed. This RFC extends DNA-40 by adding a new env var to the canonical `.env.example`.
- **DNA-72 (validator config location)** — the verification declaration lives in `system.md` (site content, mission-managed), not in package code.
- **RFC-0753 (DNS record management protocol)** — the primary verification method reuses the existing DNS TXT machinery; this RFC adds no new DNS plumbing.
- **RFC-0311 (IndexNow after deploy)** — `search.sitemap.submit` follows the same post-deploy submission pattern, extended to the Google channel that IndexNow cannot reach.
- **Site OS operator model** — both commands are app-scoped; the offline validator joins the author pipeline, the `--live` variant joins the post-build/deploy evidence path. The werkstatt engine is untouched (DNA-64: no stack-specific logic in the engine).

## Design

### CLI surface

```sh
# Offline: system.md declares verification for every production channel domain.
pnpm exec werkstatt run search.verification.validate --site warpgogol-com

# Live (deploy gate): public DNS actually carries the declared TXT record,
# or the rendered <head> carries the declared meta tag.
pnpm exec werkstatt run search.verification.validate --site warpgogol-com --live

# Submit the sitemap index to the Search Console API (requires service account env).
pnpm exec werkstatt run search.sitemap.submit --site warpgogol-com
pnpm exec werkstatt run search.sitemap.submit --site warpgogol-com --dry-run
```

Flags:

| Flag          | Command  | Meaning                                                        |
| ------------- | -------- | -------------------------------------------------------------- |
| `--site <id>` | both     | Site id (required, app scope).                                 |
| `--live`      | validate | Perform live DNS/HTTP checks instead of offline config checks. |
| `--dry-run`   | submit   | Print the API request that would be sent; do not call the API. |
| `--json`      | both     | Machine-readable output (see Output format).                   |

### TypeScript contracts

```ts
// system.md frontmatter addition (validated by the system-manifest schema):
interface VerificationConfig {
  google?: {
    method: "dns-txt" | "meta-tag";
    /** dns-txt: full TXT value "google-site-verification=...".
     *  meta-tag: content attribute of the google-site-verification meta tag. */
    token: string;
  };
  // Bing and others may be added later; the map shape allows extension.
}

interface SearchVerificationResult {
  site: string;
  checks: Array<{
    engine: string;
    method: "dns-txt" | "meta-tag";
    mode: "offline" | "live";
    ok: boolean;
    detail?: string;
  }>;
}

interface SitemapSubmitResult {
  site: string;
  sitemapUrl: string;
  submitted: boolean;
  apiResponse?: { status: number; body?: string };
  skipped: boolean; // true when credentials are absent (with nextSteps)
}
```

The layout reads `verification.google` from the resolved system manifest and renders `<meta name="google-site-verification" content="...">` when `method: "meta-tag"`.

### Google Search Console API approach

`search.sitemap.submit` uses a **hand-rolled JWT + fetch** approach, not the `googleapis` npm package. Rationale: the `googleapis` package is not a dependency in the monorepo, adding it would significantly increase bundle size and supply-chain surface, and the only API call needed is a single `PUT` to `https://www.googleapis.com/webmasters/v3/sites/{site}/sitemaps/{sitemap}` with a service-account JWT bearer token. The handler constructs the JWT using the `GSC_SERVICE_ACCOUNT_JSON` env var (inline JSON containing `client_email`, `private_key`, and `token_uri`), signs it with the RSA private key, exchanges it for an access token via the OAuth 2.0 token endpoint, and calls the Search Console API with `fetch`. This follows the same raw-`fetch` pattern used by the IndexNow submission handler (RFC-0311).

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/system.md` (workpiece) | Declares `verification:` config; validated |
| `packages/werkstatt-site/src/onboarding/templates/system.template.md` | Gains a commented `verification:` stub so new sites are born compliant |
| `packages/werkstatt-site/src/checks/` | Home of `search-verification.ts` and `search-sitemap-submit.ts` handlers |
| `packages/werkstatt-site/src/domain/ui/components/layout/layout-component.astro` | Emits the meta tag when `method: meta-tag` |
| `.env.example` (root) | Documents `GSC_SERVICE_ACCOUNT_JSON` (inline JSON) with `# How to obtain:` (DNA-40) |
| `docs/runbooks/search-console-setup.md` | New ops runbook: create property, add service account as user, first submission |
| `public/`, `dist/` | Never written by these commands — submission is a pure API call |

### Output format

`search.verification.validate --json` returns the standard Diagnostic envelope:

```json
{
  "command": "search.verification.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "SEARCH-VERIFY-01",
      "severity": "error",
      "message": "system.md declares no verification.google entry for a production site.",
      "evidence": [{ "kind": "config", "file": "src/content/system.md" }]
    }
  ]
}
```

Diagnostic rules:

| Rule | Severity | Condition |
| --- | --- | --- |
| `SEARCH-VERIFY-01` | error | No `verification.google` declared (offline). |
| `SEARCH-VERIFY-02` | error | `method: dns-txt` declared but TXT record absent from public DNS (`--live`). |
| `SEARCH-VERIFY-03` | error | `method: meta-tag` declared but meta tag absent from rendered `<head>` (`--live`). |
| `SEARCH-VERIFY-04` | warning | Token present but malformed (does not match the expected Google token shape). |

`search.sitemap.submit --json` returns `SitemapSubmitResult`. When credentials are absent the command exits 1 with a `nextSteps` entry pointing at `.env.example` (DNA-82 output standard: explicit exitCode, `[command.name]` summary prefix, `nextSteps` on failure).

### Failure modes

- Both validators fail hard (exit 1) on error-severity diagnostics — enforcement is error from day one (operator decision 2026-08-21; no warning grace period).
- `--live` treats DNS/HTTP network failures as **inconclusive**, not as failure: the command exits 1 with a distinct `SEARCH-VERIFY-NETWORK` diagnostic so a flaky resolver never looks like a missing record.
- `search.sitemap.submit` without credentials exits 1 with `skipped: true` and remediation steps; it never silently succeeds.
- API quota/auth errors surface verbatim in `apiResponse` for post-mortem debugging.

## Compass sync

- `docs/technology.xml` — no new technology stack added (hand-rolled JWT, no new npm dependency).
- `docs/verification-plan.xml` — add `search.verification.validate` to the author pipeline verification surface if the plan tracks individual validators.
- `docs/requirements.xml` — no change (no new functional requirement beyond what this RFC introduces).
- `docs/development-plan.xml` — no change (no new package or workspace).

## Rollout

1. **Ops first (blocking prerequisite):** the operator creates the Search Console property for warpgogol.com, obtains the DNS TXT token, and adds it to the workpiece `system.md` through a mission. The DNS record is applied via the RFC-0753 protocol.
2. **Implementation:** schema extension, both commands, layout meta-tag emission, onboarding template stub, runbook.
3. **Pipeline integration:** `search.verification.validate` (offline) joins `SITES_CHECK_AUTHOR_PIPELINE`; the `--live` variant joins the deploy evidence path alongside the existing freshness/health checks.
4. **Error from day one:** once the RFC is implemented, a site without verification config fails the author pipeline. warpgogol-com is greened in the same rollout (step 1), so no mission is blocked.
5. **New sites:** the onboarding template stub makes the gap visible at birth — `onboarding.scaffold` output fails validation until the operator fills in the token.

## Alternatives considered

- **Meta-tag as the only method** — rejected: stores a token in content, adds permanent markup to every page, and DNS TXT is already supported by RFC-0753. Meta-tag survives as the documented fallback for sites with externally managed DNS.
- **Manual runbook instead of `search.sitemap.submit`** — rejected by the operator (2026-08-21): the workshop automates submission like it automated IndexNow (RFC-0311); manual steps get forgotten across a fleet.
- **Warning-first gated adoption (RFC-0903 precedent)** — rejected by the operator: these validators are error-severity from introduction; warpgogol-com is greened inside the same rollout instead of a follow-up RFC.
- **Bing Webmaster API submission alongside Google** — out of scope: IndexNow already covers Bing/Yandex with far less credential machinery.

## Risks

- **Credential handling** — the service-account JSON is a powerful secret (it can submit and delete sitemaps). Mitigation: env-var only, `.env.example` documentation, never committed; the secret-scan pipeline already guards against accidental commits.
- **False negatives in `--live` mode** — DNS propagation delays right after adding the TXT record can fail the deploy gate. Mitigation: `SEARCH-VERIFY-NETWORK` distinguishes infrastructure failure from absence; the runbook tells the operator to verify propagation before re-running the gate.
- **Search Console API surface drift** — the sitemaps endpoint is legacy (`webmasters/v3`) but stable; if Google retires it, the command fails loudly with the API response, never silently.
- **Agent misinterpretation** — agents must not invent verification tokens or mark the config as done without the operator performing the Search Console property step. The Implementation notes below make this explicit.

## Acceptance criteria

- [ ] `system.md` schema accepts `verification.google` with `method: dns-txt | meta-tag` and `token` (evidence: system-manifest schema file)
- [ ] `search.verification.validate` registered (app scope), offline mode emits SEARCH-VERIFY-01/04 (evidence: command table + handler)
- [ ] `--live` mode performs real DNS TXT lookup and rendered-head meta check, with network failure mapped to an inconclusive diagnostic (evidence: handler + tests)
- [ ] `search.sitemap.submit` registered (app scope), submits the sitemap index via the Search Console API with service-account auth, `--dry-run` supported (evidence: handler + tests)
- [ ] Layout emits `google-site-verification` meta tag on every page when `method: meta-tag` (evidence: layout component + rendered HTML test)
- [ ] Offline validator wired into `SITES_CHECK_AUTHOR_PIPELINE` as error; `--live` wired into the deploy evidence path (evidence: pipeline definition)
- [ ] Onboarding `system.template.md` carries a commented `verification:` stub (evidence: template file)
- [ ] `.env.example` documents `GSC_SERVICE_ACCOUNT_JSON` with `# How to obtain:` (DNA-40) (evidence: `.env.example`)
- [ ] `docs/runbooks/search-console-setup.md` exists and covers property creation, service-account authorization, first submission (evidence: runbook file)
- [ ] warpgogol-com passes `search.verification.validate --live` after rollout step 1 (evidence: mission evidence)
- [ ] `packages/werkstatt-site/AGENTS.md` documents both new commands in the Check commands section (evidence: AGENTS.md file)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0909` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT invent, fabricate, or placeholder-fill verification tokens. The `verification.google.token` value comes only from the operator's Search Console property. A site without an operator-supplied token must keep failing SEARCH-VERIFY-01.
- Agents MUST NOT commit the service-account JSON or any derivative of it. It lives in env vars / CI secrets only (DNA-40).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0909 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
