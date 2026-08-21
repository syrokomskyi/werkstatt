---
rfcId: RFC-0909
auditId: AUDIT-RFC-0909-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0909

## Verdict: Needs revision

RFC-0909 is well-structured and addresses a real gap (Search Console verification + sitemap submission). However, it has a DNA alignment gap (`satisfies[]` is empty despite referencing DNA-40 and DNA-72 in `related[]`), a missing `AGENTS.md` update scope, and several blind spots around the Google Search Console API dependency and credential model that need clarification before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0909 --json` reported no violations.

## Axis A — Structural completeness

- **Decision** — present tense, single decision: "Introduce a search-engine verification surface…" ✓
- **CLI surface** — exact commands with flags and scope ✓
- **TypeScript contracts** — minimal type signatures, not full implementations ✓
- **File system responsibilities** — concrete paths table ✓
- **Output format** — `--json` shape documented with example ✓
- **Failure modes** — exit codes and warn-vs-fail behavior specified ✓
- **Rollout** — describes default behavior, existing app adoption (warpgogol-com greened first), and new-app compliance (onboarding template stub) ✓
- **Alternatives considered** — three real alternatives with rejection reasons ✓
- **Risks** — includes agent misinterpretation risk and false-negative rate for `--live` mode ✓
- **Acceptance criteria** — 12 items, all checkable with evidence paths ✓
- **Implementation notes for agents** — explicit behavioral rules (MUST NOT fabricate tokens, MUST NOT commit credentials) ✓

No issues.

## Axis B — DNA alignment

- **`satisfies[]` is empty** — the RFC frontmatter declares `satisfies: []` but the body explicitly references DNA-40 (env-example contract, line 110) and DNA-72 (validator config location, line 111) as invariants it follows. Per RFC-0331, `satisfies[]` should list DNA invariants the RFC implements, protects, or extends. DNA-40 is directly extended (new env var `GSC_SERVICE_ACCOUNT_JSON` documented in `.env.example`). DNA-72 is referenced but not extended (the RFC follows the pattern, doesn't establish a new validator-config-location diagnostic). **Finding**: `satisfies[]` should include `DNA-40` since the RFC extends the env-example contract with a new variable.
- **`related[]` DNA references** — DNA-40 and DNA-72 are listed in `related[]` and are relevant, not decorative ✓
- **No DNA conflicts** — the RFC does not conflict with any existing DNA invariant. DNA-64 (engine/profile boundary) is respected: both commands are app-scoped in `werkstatt-site`, the engine is untouched ✓
- **No new DNA invariant established** — the RFC does not claim to establish a new DNA invariant, so no new `## DNA-N` entry is needed ✓

## Axis C — Ecosystem fit

- **Package boundaries** — both commands live in `packages/werkstatt-site/src/checks/`, imports flow correctly from site plugin to shared packages ✓
- **Pipeline placement** — `search.verification.validate` (offline) joins `SITES_CHECK_AUTHOR_PIPELINE`; `--live` variant joins the deploy evidence path. The pipeline name is correct (`SITES_CHECK_AUTHOR_PIPELINE` confirmed at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts:18`). The choice of author pipeline for offline and deploy path for live is justified ✓
- **Compass sync** — the RFC does not explicitly identify which `docs/*.xml` files need synchronization. If the RFC changes repository-wide requirements or shared package contracts, it should identify the Compass documents. **Finding**: no `docs/*.xml` sync is identified, though the RFC adds a new env var and pipeline step which may require `docs/technology.xml` or `docs/verification-plan.xml` updates.
- **AGENTS.md updates** — acceptance criterion: "AGENTS.md updated where agent behavior rules changed" (line 261) is vague. **Finding**: the RFC should identify which specific `AGENTS.md` files need updates — likely `packages/werkstatt-site/AGENTS.md` (new check commands) and possibly root `AGENTS.md` (if agent behavior rules about token fabrication need to be elevated).
- **Cosmic naming** — not applicable; the RFC does not touch manifests or component/section/page contracts ✓
- **Command lifecycle** — `commands.proposed` lists `search.verification.validate` and `search.sitemap.submit`; `added/changed/removed` are empty. This is internally consistent: proposed commands will land in `added` upon implementation ✓

## Axis D — Forward-only compliance

- No compatibility shim, bridge, or dual-path proposed ✓
- No deprecation in this RFC ✓
- No amendment to another RFC ✓
- No legacy code paths maintained behind a flag ✓
- Error from day one (no warning grace period) — consistent with forward-only discipline ✓

No issues.

## Axis E — Agent-facing policy

- **Status gate** — the RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly state: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" ✓
- **Implementation notes governance references** — references RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). These are correct governance references ✓
- **Anti-fabrication** — the RFC explicitly addresses this: "Agents MUST NOT invent, fabricate, or placeholder-fill verification tokens" (line 269). The acceptance criteria distinguish between code changes (agent) and content requiring human authoring (operator creates Search Console property) ✓
- **Storage policy** — no cookies or client-side persistence introduced. The service-account JSON is env-var only ✓
- **NEEDS CLARIFICATION markers** — none found in the RFC ✓

No issues.

## Axis F — Pragmatism

- **Minimal command surface** — two commands, each with a distinct purpose: `search.verification.validate` (offline+live validation) and `search.sitemap.submit` (API submission). Neither duplicates an existing command. `search.sitemap.submit` cannot be a flag on `indexnow.submit` because it targets a different API (Google Search Console vs IndexNow) with different auth (service account vs key file) ✓
- **Lean contracts** — `VerificationConfig`, `SearchVerificationResult`, `SitemapSubmitResult` are minimal type signatures with no speculative generality. The `google?` optional field with a comment about future Bing/Yandex extension is justified by the non-goals ✓
- **Existing patterns** — the RFC explicitly reuses RFC-0753 DNS TXT machinery (line 112) and follows the RFC-0311 IndexNow submission pattern (line 113). The alternatives section explains why meta-tag-only and manual runbook were rejected ✓
- **Scope discipline** — `appsImpacted: []` is correct (no existing app needs code changes from the RFC itself; warpgogol-com needs operator ops, not code). `packagesImpacted: ["@warpgogol/werkstatt-site"]` is correct (both commands + layout + onboarding template live there) ✓

No issues.

## Axis G — Blind spots

- **Google Search Console API dependency** — the RFC uses the `webmasters/v3` API (line 246) and acknowledges it as "legacy but stable." However, the RFC does not specify which npm package or auth library will be used for the service-account JWT flow. **Finding**: the implementation should specify whether it uses `googleapis` npm package or a hand-rolled JWT + fetch approach. Adding `googleapis` as a dependency to `packages/werkstatt-site` has bundle-size and supply-chain implications that should be addressed.
- **Credential model ambiguity** — the RFC mentions two env var names: `GOOGLE_APPLICATION_CREDENTIALS` (line 110) and `GSC_SERVICE_ACCOUNT_JSON` (line 186, 258). **Finding**: the RFC should pick one canonical env var name. `GOOGLE_APPLICATION_CREDENTIALS` is the Google SDK convention (points to a file path), while `GSC_SERVICE_ACCOUNT_JSON` suggests inline JSON. These are different credential loading patterns — the RFC needs to clarify which one is canonical.
- **Performance** — `search.verification.validate` offline mode reads `system.md` (one file parse). `--live` mode performs DNS TXT lookups and HTTP HEAD checks. These are lightweight and not a build bottleneck ✓
- **False positives** — `--live` mode treats network failures as inconclusive (`SEARCH-VERIFY-NETWORK`), not as failure. This is a good design that avoids false negatives from DNS propagation delays ✓
- **Edge cases** — the RFC considers the empty state (new site with no verification config fails SEARCH-VERIFY-01 from day one). The onboarding template stub makes the gap visible at birth ✓
- **Migration path** — warpgogol-com is greened in step 1 (operator creates property + adds token before implementation lands). New sites get the template stub. This is documented ✓
- **Security/privacy** — the service-account JSON is a powerful secret. The RFC addresses this in Risks (line 244): env-var only, `.env.example` documentation, never committed, secret-scan pipeline guards ✓

## Questions for the author

1. Which canonical env var name should be used — `GOOGLE_APPLICATION_CREDENTIALS` (file path, Google SDK convention) or `GSC_SERVICE_ACCOUNT_JSON` (inline JSON)? The RFC uses both interchangeably (lines 110, 186, 258).
2. Should `satisfies[]` include `DNA-40`? The RFC extends the env-example contract with a new variable (`GSC_SERVICE_ACCOUNT_JSON`), which is a direct extension of DNA-40.
3. Which `AGENTS.md` files specifically need updates? The acceptance criterion "AGENTS.md updated where agent behavior rules changed" (line 261) is vague — should it be `packages/werkstatt-site/AGENTS.md` (new check commands list), root `AGENTS.md`, or both?
4. Will the `search.sitemap.submit` handler use the `googleapis` npm package or a hand-rolled JWT + fetch approach? Adding `googleapis` to `packages/werkstatt-site` has dependency-weight implications.
