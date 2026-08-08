---
rfc: RFC-0761
createdAt: 2026-08-08
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 4
---

# Design Summit: RFC-0761

## Architect

### Findings

- **A1 (concern):** `commands.changed` lists `deploy.preflight`, `deploy.scripts.validate`, `env.contract.validate`, `env.example.generate` — but not `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback`. These commands have their internal behavior changed (`resolveConventionSecretsPath` signature changes, channel parameter removed). The CLI surface is unchanged, but the internal contract is modified. This was also flagged in the audit (C-2) but was classified as "minor" and not fully resolved — the `commands.changed` list still omits them. Recommendation: add them to `commands.changed` with a note "internal: secret resolution path changed, CLI unchanged".

- **A2 (concern):** RFC-0388 `amendedBy` field is not updated. The V-19 warning from `rfc.validate` confirms this. The rollout (step 15) updates DNA-40 and AGENTS.md, but does not explicitly mention updating `RFC-0388.amendedBy` to include `RFC-0761`. This is a mechanical step but should be explicit in the rollout.

### No concerns

- The decision to use `amends` instead of `supersedes` is correct — RFC-0388 Rules 2, 3, 4, 8, 9 are retained. Only Rules 1, 5, 6, 7 and the file system table change.
- DNA-40 alignment is clean — the RFC correctly amends the invariant through the `amends` mechanism.
- The `resolveConventionSecretsPath` simplification (remove channel parameter, always return `.env`) is a clean architectural improvement that eliminates dead code paths.

## Security Engineer

### Findings

- **S1 (concern):** Root `.env` becomes the single source of truth for `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_*` keys, `OPENAI_API_KEY`, `PASSPORT_SIGNING_KEY`, and now `WARPGOGOL_OTLP_*`. The RFC acknowledges this risk ("Root `.env` becomes the single point of failure for shared secrets") and provides mitigation (`# How to obtain:` instructions, `env.local.check`). However, the RFC does not address what happens if an operator's root `.env` has a wrong `CLOUDFLARE_API_TOKEN` — all sites and services deploy with the wrong token. With `.env.main`/`.env.alt`, at least the blast radius was theoretically limited to one channel. In practice, `.env.main`/`.env.alt` were always empty, so this is not a regression — but the RFC should explicitly state "this is not a regression because `.env.main`/`.env.alt` were never filled with different values".

### No concerns

- No new trust boundaries are created.
- No cookies or client-side storage introduced.
- The `deploy.preflight` gate is retained, ensuring empty values are caught before deploy.
- Gitignored files remain gitignored — no secret exposure change.

## QA Engineer

### Findings

- **Q1 (concern):** The RFC has 20 acceptance criteria but no acceptance probes (`# acceptance:` is commented out). For an architecture RFC with `versionBump: minor`, acceptance probes would strengthen the verification. At minimum, a `command-registered` probe for the removed commands (verifying they are NOT registered) and a `run` probe for `deploy.scripts.validate` (verifying it passes with `--secrets-file .env`).

- **Q2 (concern):** The rollout specifies 19 implementation steps but does not specify test coverage for the `resolveConventionSecretsPath` change. Existing leitstand tests (e.g., `leitstand-0608-propagate-channel-removed.test.ts`) mock `fetch` and test channel behavior. After the change, these tests need updating — the channel parameter is removed. The plan should include a step to update existing leitstand tests.

### No concerns

- Failure modes are well-documented.
- The implementation order note (steps 6-7 must be simultaneous) is a good testability signal.

## Product Manager

### Findings

- **P1 (concern):** The RFC removes the theoretical ability to have channel-specific secrets. The `nonGoals` section addresses this ("Does not introduce per-environment override files for channel-specific secrets"), and the risk section notes "If a future site needs different secrets for main vs alt channels, the operator cannot use `.env.main` / `.env.alt`." However, the RFC should quantify this risk: how many current sites have different values in `.env.main` vs `.env.alt`? Based on the audit, the answer is zero — all are empty copies of `.env.example`. Stating this explicitly in the risk section strengthens the case.

### No concerns

- The problem statement is grounded in real issues (dead files, cognitive load, maintenance burden).
- `nonGoals` are explicit and meaningful (5 items).
- Scope is correctly bounded — simplification only, no new features.
- The 4 alternatives considered are genuine, not strawmen.

## Developer Advocate

### Findings

- **D1 (question):** The RFC mentions `CLOUDFLARE_READONLY_API_TOKEN` in Rule 3: "Site `.env.example` retains `CLOUDFLARE_ZONE_ID` (site-specific) and `CLOUDFLARE_READONLY_API_TOKEN` (optional, for client sites on different Cloudflare accounts that need a read-only validation token)." But Rule 3 also says the generator "no longer includes `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, or `CLOUDFLARE_READONLY_API_TOKEN`". This is contradictory — Rule 3 first says it retains `CLOUDFLARE_READONLY_API_TOKEN`, then says it removes it. Which is correct?

### No concerns

- The RFC is self-contained and well-structured.
- Implementation notes for agents are present and follow governance conventions.
- The file system responsibilities table is clear and comprehensive.

## Consensus findings

- **A1 + Q2 (2 personas):** Leitstand commands are internally changed but not listed in `commands.changed`, and existing leitstand tests need updating. Recommendation: add leitstand commands to `commands.changed` and add a rollout step for updating existing leitstand tests.

## Unique findings

- **A2:** RFC-0388 `amendedBy` update is not explicit in rollout.
- **S1:** RFC should explicitly state that the single-point-of-failure risk is not a regression (`.env.main`/`.env.alt` were never filled with different values).
- **P1:** Risk section should quantify that zero current sites have different values in `.env.main` vs `.env.alt`.
- **D1:** Rule 3 contradicts itself about `CLOUDFLARE_READONLY_API_TOKEN` — retains vs removes.

## Recommendation

**Revise the RFC** before proceeding to plan. The D1 contradiction (CLOUDFLARE_READONLY_API_TOKEN) is a factual error that must be resolved. The A1+Q2 consensus finding (leitstand commands in `commands.changed` + test updates) should be integrated. The remaining findings (A2, S1, P1) are minor and can be addressed during enhancement.

Route through `fo-idea-enhance` to fix D1 (contradiction), A1+Q2 (commands.changed + test step), A2 (amendedBy rollout step), S1 (not-a-regression note), and P1 (quantify risk).

*No findings does not mean no issues — it means no issues were found from these five perspectives.*
