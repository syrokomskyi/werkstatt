# Onboarding Ecosystem Hardening Plan

## Purpose

This plan sequences the RFC-0074 audit hardening, RFC-0076 onboarding phase contracts, and RFC-0077 legacy compatibility removal into implementation milestones that AI agents can execute safely after the relevant RFCs are accepted by a human architecture owner.

The goal is a repeatable engineering ecosystem where `onboarding/.input` business materials become phase-tracked outputs, thin apps, deterministic QA, and cached qualitative LLM audits without preserving legacy app structures.

## Governing RFCs

- `RFC-0074` — deterministic validators and cached LLM audits.
- `RFC-0076` — onboarding input manifest and phase output contracts.
- `RFC-0077` — removal of legacy app compatibility surfaces.

Agents MUST NOT implement RFC-0076 or RFC-0077 code changes until those RFCs have `status: accepted`.

## Milestone 0 — Planning verification

### Objective

Confirm the RFC documents and plan are valid before implementation begins.

### Actions

1. Validate the affected RFCs:

```sh
rtk pnpm exec werkstatt run rfc.validate RFC-0074 --json
rtk pnpm exec werkstatt run rfc.validate RFC-0076 --json
rtk pnpm exec werkstatt run rfc.validate RFC-0077 --json
```

2. Do not change any RFC status field.
3. Ask the human architecture owner to accept or revise RFC-0076 and RFC-0077.

### Exit criteria

- RFC validation passes for all three files, or known unrelated RFC validator limitations are documented.
- RFC-0076 and RFC-0077 remain draft until human action.

## Milestone 1 — Remove legacy compatibility surfaces

### Depends on

- RFC-0077 accepted.

### Objective

Make the modern CMS-friendly app surface the only active app contract.

### Primary files

- `packages/os/site-kernel-checks/src/system-manifest.ts`
- `packages/os/site-kernel-checks/src/structure.ts`
- `packages/os/site-kernel-checks/src/module.ts`
- `packages/os/site-kernel-content/**`
- root and scoped `AGENTS.md`
- root Compass XML documents

### Actions

1. Remove `system.yaml` fallback loading and references from active validators.
2. Make `system.manifest.validate` require `src/content/system.md` and fail if app-level `system.yaml` exists.
3. Make `content.surface.validate` fail on forbidden legacy directories:
   - `src/content/components/**`
   - `src/content/sections/**`
   - `src/content/features/**`
   - `src/content/layouts/**` unless later reintroduced by RFC
4. Remove or modernize validators that only check legacy app-local component content:
   - `mirror.triad.validate`
   - `dispatcher.sync.validate`
   - legacy component schema fallback paths
5. Replace remaining `routeSlug` assumptions with `system.md pages[].routes`.
6. Update `APPS_CHECK_PIPELINE` so no legacy-only validators remain active.
7. Update Compass XML and AGENTS guidance to describe only the modern surface.

### Validation commands

```sh
rtk pnpm --filter @warpgogol/site-kernel-checks build:check
rtk pnpm exec werkstatt run apps-check.run --app nicaragua-projekt --json
rtk pnpm exec werkstatt run app.contract.full --app nicaragua-projekt --json
```

### Exit criteria

- No active validator treats `system.yaml` as supported.
- No active pipeline step exists only for pre-RFC-0047 app-local component content.
- `nicaragua-projekt` passes app checks after cleanup.

## Milestone 2 — Add onboarding input manifest and phase validators

### Depends on

- RFC-0076 accepted.
- Milestone 1 complete or intentionally deferred with architecture approval.

### Objective

Make `onboarding/.input` and `onboarding/.output/<phase>` a deterministic contract surface.

### Primary files

- `packages/os/site-kernel-checks/src/onboarding-phase.ts` or equivalent new module
- `packages/os/site-kernel-checks/src/module.ts`
- `packages/os/site-kernel-checks/src/audit/helpers.ts`
- workflow files under `.agents/workflows/` if present
- root Compass XML documents

### Actions

1. Add `OnboardingInputManifest` and `OnboardingPhaseValidationResult` contracts.
2. Implement `onboarding.input.validate`:
   - scan `onboarding/.input/**`
   - classify required and optional inputs
   - compute deterministic `inputHash`
   - write or verify `onboarding/.output/00-intake/input-manifest.json`
3. Implement `onboarding.phase.validate --phase=<phase>`:
   - validate required outputs for `02-scaffold`, `03-compose`, `04-author`, and `05-audit`
   - compare `derivedFromInputHash` to the current input manifest
   - emit fail/warn/info findings in a stable JSON envelope
4. Update workflows to run phase validation at phase boundaries.
5. Update `app.qa.validate` to run `onboarding.phase.validate --phase=05-audit` before RFC-0074 validators.

### Validation commands

```sh
rtk pnpm --filter @warpgogol/site-kernel-checks build:check
rtk pnpm exec werkstatt run onboarding.input.validate --app nicaragua-projekt --json
rtk pnpm exec werkstatt run onboarding.phase.validate --app nicaragua-projekt --phase=05-audit --json
```

### Exit criteria

- Input manifest generation is deterministic.
- Missing required phase outputs fail in or after their owning phase.
- `app.qa.validate` refuses audit success when phase validation fails.

## Milestone 3 — Harden RFC-0074 LLM audit runner

### Depends on

- RFC-0074 accepted.
- RFC-0076 phase readiness available if implemented.

### Objective

Make `audit.llm.run` schema, cache, and aggregator behavior production-grade.

### Primary files

- `packages/os/site-kernel-checks/src/audit-llm.ts`
- `packages/os/site-kernel-checks/src/audit/helpers.ts`
- `packages/os/site-kernel-checks/src/audit/types.ts`
- `packages/os/site-kernel-checks/src/app-qa.ts`
- `packages/os/site-kernel-checks/src/audit-llm/prompts/*.md`

### Actions

1. Ensure `app.qa.validate` includes all required LLM audit results in the aggregate report.
2. Extend LLM cache entries to store:
   - `rulesHash`
   - `promptHash`
   - `modelVersion`
   - optional `archetypeId`
3. Implement one retry for invalid LLM structured output without writing a failed cache entry.
4. Enforce audit-kind-specific requirements:
   - `cultural` requires `cultural-rules.yaml`
   - `linguistic` requires `linguistic-rules.yaml`
   - `archetype-lens` requires `--archetype`
5. Replace placeholder prompt behavior with either real prompts or explicit pending/error envelopes.

### Validation commands

```sh
rtk pnpm --filter @warpgogol/site-kernel-checks build:check
rtk pnpm exec werkstatt run audit.llm.run --app nicaragua-projekt --kind=cultural --json
rtk pnpm exec werkstatt run audit.llm.run --app nicaragua-projekt --kind=linguistic --json
rtk pnpm exec werkstatt run app.qa.validate --app nicaragua-projekt --json
```

### Exit criteria

- LLM audit cache hits and misses are deterministic.
- `app.qa.validate` report includes deterministic and configured LLM audits.
- Missing provider configuration returns a pending/error envelope and does not write cache.

## Milestone 4 — Harden deterministic audit validators

### Depends on

- Milestone 2 phase contracts implemented.
- Milestone 3 LLM runner stabilized.

### Objective

Move validators from shallow heuristics to schema-aware checks while preserving low noise.

### Primary files

- `packages/os/site-kernel-checks/src/audit-validators.ts`
- shared helpers under `packages/os/site-kernel-checks/src/audit/**`
- relevant test fixtures or app fixture outputs

### Actions

1. `seo.technical.validate`:
   - parse sitemap indexes and child sitemaps
   - verify route registry coverage using `system.md pages[].routes`
   - validate canonical and hreflang symmetry
2. `seo.structured-data.validate`:
   - parse JSON-LD blocks as JSON
   - support `@graph`
   - validate required types per page/family
3. `seo.internal-linking.validate`:
   - enforce anchor patterns
   - enforce key page inbound thresholds
   - enforce anti-orphan constraints
4. `first-party-data.validate`:
   - parse strategy schema
   - validate fields, required flags, and consent text
5. `infra.brief.validate`:
   - parse `wrangler.jsonc`
   - inspect deploy workflows
   - compare configured domains, project names, and secrets contract

### Validation commands

```sh
rtk pnpm --filter @warpgogol/site-kernel-checks build:check
rtk pnpm exec werkstatt run seo.technical.validate --app nicaragua-projekt --json
rtk pnpm exec werkstatt run seo.structured-data.validate --app nicaragua-projekt --json
rtk pnpm exec werkstatt run seo.internal-linking.validate --app nicaragua-projekt --json
rtk pnpm exec werkstatt run first-party-data.validate --app nicaragua-projekt --json
rtk pnpm exec werkstatt run infra.brief.validate --app nicaragua-projekt --json
rtk pnpm exec werkstatt run app.qa.validate --app nicaragua-projekt --json
```

### Exit criteria

- Validators detect real contract drift without page-type noise.
- Legal, utility, redirect, and transactional routes are classified from manifest/family contracts rather than ad hoc app-specific code.

## Milestone 5 — Final pipeline and documentation synchronization

### Objective

Ensure the ecosystem is coherent for future AI-agent onboarding sessions.

### Actions

1. Update `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`, and `docs/source-markup.xml` as required by the changed architecture.
2. Update root/scoped `AGENTS.md` files with:
   - no legacy app compatibility
   - onboarding phase validation workflow
   - audit command sequence
3. Run affected package and app checks.
4. Summarize remaining warnings as either true client gaps or new planned RFCs.

### Validation commands

```sh
rtk pnpm --filter @warpgogol/site-kernel-checks build:check
rtk pnpm exec werkstatt run apps-check.run --app nicaragua-projekt --json
rtk pnpm exec werkstatt run app.contract.full --app nicaragua-projekt --json
rtk pnpm exec werkstatt run rfc.validate RFC-0074 --json
rtk pnpm exec werkstatt run rfc.validate RFC-0076 --json
rtk pnpm exec werkstatt run rfc.validate RFC-0077 --json
```

### Exit criteria

- Active documentation, Compass XML, validators, and pipelines describe the same architecture.
- Future agents can follow the RFCs and this plan without preserving legacy/backcompat branches.

## Forbidden shortcuts

- Do not change RFC statuses as an agent.
- Do not delete or edit `onboarding/.input/**`.
- Do not hand-edit `onboarding/.output/05-audit/audit-report.md` to suppress findings.
- Do not delete `onboarding/.output/05-audit/llm-cache.jsonl` to hide LLM findings.
- Do not preserve compatibility aliases or fallback loaders for surfaces removed by RFC-0077.
- Do not add app-specific policy logic to shared TypeScript validators when the policy belongs in system, family, or phase contracts.
