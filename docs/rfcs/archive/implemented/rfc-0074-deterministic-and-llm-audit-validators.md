---
id: RFC-0074
title: "Split material audits into deterministic kernel validators and cached LLM audits"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: 2026-05-18
implementedAt: 2026-05-18
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0028
  - RFC-0049
  - RFC-0050
  - RFC-0051
  - RFC-0052
  - RFC-0070
  - RFC-0071
  - RFC-0072
  - RFC-0073
  - RFC-0075
  - RFC-0076
  - RFC-0077
commands:
  proposed:
    - analytics.config.validate
    - app.qa.validate
    - audit.agent.readiness.validate
    - audit.llm.run
    - first-party-data.validate
    - infra.brief.validate
    - seo.internal-linking.validate
    - seo.structured-data.validate
    - seo.technical.validate
  added:
    - analytics.config.validate
    - app.qa.validate
    - audit.agent.readiness.validate
    - audit.llm.run
    - first-party-data.validate
    - infra.brief.validate
    - seo.internal-linking.validate
    - seo.structured-data.validate
    - seo.technical.validate
  changed:
    - app.contract.full
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - share
successSignals:
  - Every audit step that produces a yes/no answer from facts about the built site (HTML, JSON-LD, configs, files) is a deterministic kernel validator with a shared envelope
  - Every audit step that requires qualitative judgment (cultural, linguistic, emotional, brand alignment) is run via the workflow as an LLM prompt, but with a thin shared wrapper (audit.llm.run) for envelope + cache
  - audit.llm.run keys its cache on (audit kind, input hash, family id, biome id, prompt version), so re-runs on identical inputs cost zero LLM tokens
  - app.qa.validate aggregates all deterministic audits + replays the LLM cache + emits the combined report
  - app.qa.validate is the last step of app.contract.full
nonGoals:
  - Re-running materials through the validators (validators audit the assembled app + brief + family rules, not the raw research bundle)
  - Auto-fixing audit findings (validators report; the agent or human proposes patches)
  - Embedding cultural/linguistic rule logic in TypeScript (rules live in family YAMLs; the LLM is the engine)
---

# RFC-0074: Split material audits into deterministic kernel validators and cached LLM audits

## Context

The research bundle delivers a series of audit briefs: emotional audit (`30`), cultural authenticity (`41`), linguistic audit (`42`), brand alignment (`43`), agent readiness check (`44`), QA checklist (`46`), plus operational documents that imply consistency obligations: internal linking plan (`38`), structured data (`39`), technical SEO (`40`), first-party data strategy (`35`), analytics brief (`45`), digital infrastructure brief (`47`).

Today these are prose. Humans read them, mentally compare them to the built site, and either approve or write a review comment. The cost is linear in human attention. The result is that on most onboardings the audits drift: the copy is updated, the audit is not re-run; the wireframe changes, the cultural audit is stale.

The honest split is:

- **Deterministic checks** (rendered HTML has element X with content matching pattern Y; the `system.md growth.vendor.adapter` matches the analytics brief; the form fields match the first-party data strategy) → kernel validators in TypeScript.
- **Qualitative judgments** (does this paragraph land emotionally for archetype X; does this CTA sequence read as culturally appropriate for a German Handwerk audience) → LLM prompts in the workflow, with a thin TS wrapper for envelope + caching.

This RFC formalizes that split.

## Problem

1. **Audits are prose, not enforcement.** They cannot fail a build, so they end up advisory and frequently skipped.
2. **No standard finding format.** Two reviewers describe the same problem differently; nothing aggregates.
3. **LLM-backed audits are not cached.** A typical site has ~500 atoms; re-running cultural/emotional checks on every push is expensive. There is no caching contract.
4. **Family-specific thresholds are not enforced.** RFC-0071 introduces audit thresholds per site family (e.g. `forbiddenROIPromise: error`). Nothing reads them.
5. **`app.contract.full` does not include an audit gate.** Today it can pass while the cultural audit is wrong.

## Decision

The kernel gains seven deterministic validators and one cached LLM driver. A meta-aggregator `app.qa.validate` runs all of them and joins `app.contract.full` as its last step.

### Deterministic validators (kernel TypeScript, no LLM)

1. **`audit.agent.readiness.validate`** — boots the app via `astro build && astro preview`, requests every page with JS disabled, parses static HTML, asserts that offer/price/region/form/schedule are visible without client script, measures time-to-meaningful-content, and re-checks `llms.txt`/`llms-full.txt`/`ai.txt` for the same data points.
2. **`seo.technical.validate`** — verifies sitemap index, sub-sitemaps, hreflang symmetry, canonicals, robots, llms.txt, ai.txt all match each other and the route registry.
3. **`seo.structured-data.validate`** — for every page tagged `requireStructuredData: [Organization, FAQPage, Service, …]` in the family or app, verifies the matching JSON-LD blocks are present and well-formed.
4. **`seo.internal-linking.validate`** — implements the agent-authored `38-linking-plan.md` distilled into `onboarding/.output/03-compose/linking-plan.yaml`: anchor patterns, anti-orphan minimums, key-page inbound thresholds.
5. **`analytics.config.validate`** — `system.md growth.*` (vendor adapter, dataset id) matches the agent-distilled `onboarding/.output/03-compose/analytics-config.yaml` from the analytics brief.
6. **`first-party-data.validate`** — form fields in synthesized pages ⊆ fields declared in `onboarding/.output/04-author/first-party-data.yaml`; consent text matches; required fields agree.
7. **`infra.brief.validate`** — references in `47-digital-infrastructure-brief.md` (distilled to `onboarding/.output/02-scaffold/infra-config.yaml`) match `apps/<id>/wrangler.jsonc` and the GitHub Actions deploy workflow.

### LLM driver (one command, parameterized)

**`audit.llm.run --kind <cultural|linguistic|emotional|brand-alignment|archetype-lens>`** runs the corresponding prompt against the assembled app + the family rule YAMLs (`packages/ontology/site-families/<family>/cultural-rules.yaml`, `linguistic-rules.yaml`, etc.) + the per-client voice profile. The command:

- Loads the prompt template from `packages/os/site-kernel-checks/src/audit-llm/prompts/<kind>.md` (the prompt is committed code, not a workflow file).
- Computes a cache key from `(kind, atomsHash, biomeId, familyId, promptVersion, archetypeId-if-archetype-lens)`.
- On cache hit, returns the cached `AuditResult` immediately (no LLM call).
- On cache miss, runs the LLM call, validates the JSON response against the shared `AuditResult` Zod schema, writes to cache.
- The cache file is `onboarding/.output/05-audit/llm-cache.jsonl` (committed; small lines; per-client and goes away when the client is archived).

The LLM driver is one command with one purpose: _run an audit prompt with caching and envelope shaping_. Prompt content, rule content, and judgment quality live in the prompt templates and the family YAMLs — not in the TypeScript.

### Aggregator

**`app.qa.validate --app <id>`** runs the seven deterministic validators and the relevant LLM audits in sequence, aggregates findings, writes `onboarding/.output/05-audit/audit-report.md`, and exits non-zero if any deterministic validator returned `fail` or any LLM audit returned `severity: error` over its threshold.

## Architectural fit

- **RFC-0028 passport.** `audit.agent.readiness.validate` and `nebula.score.compute` both quantify "is this site readable by machines"; this RFC's validator focuses on _correctness gates_ while passport remains the _signed provenance_.
- **RFC-0049/50/51/52.** Sitemap, llms.txt, ai.txt, robots generation already happen; `seo.technical.validate` adds the cross-document consistency layer.
- **RFC-0070 phases.** `app.qa.validate` is the body of phase 05 (audit). The agent runs it; remediates findings; re-runs.
- **RFC-0071 families.** Thresholds are read from `packages/ontology/site-families/<family>/family.yaml` `recipe.auditThresholds`. Changing a threshold requires editing the family YAML, not validator code.
- **RFC-0073 atoms.** LLM audits key cache by `atomsHash` from `onboarding/.output/04-author/atoms.yaml`.

## Design

### Shared audit envelope

```json
{
  "command": "audit.llm.run",
  "kind": "cultural",
  "app": "warpgogol-handwerk",
  "status": "fail",
  "findings": [
    {
      "id": "f-0007",
      "ruleId": "cta-order.notausgang-before-price",
      "severity": "error",
      "file": "src/content/pages/de/index.md",
      "blockId": "hero",
      "line": 14,
      "message": "Hero secondary CTA points to /de/price; cultural rule for handwerk-trust-engineering requires Notausgang to be reachable before pricing.",
      "evidence": [
        { "kind": "rule",     "ruleFile": "packages/ontology/site-families/handwerk-trust-engineering/cultural-rules.yaml", "ruleId": "cta-order.notausgang-before-price" },
        { "kind": "rendered", "url": "/de/" }
      ],
      "suggestion": "Switch hero.secondaryCta.target from 'price' to 'notausgang'."
    }
  ],
  "summary": { "info": 9, "warn": 4, "error": 1 },
  "cacheStats": { "hits": 87, "misses": 12 },
  "runtimeMs": 1840
}
```

Severities:

| Severity | Build behavior |
| --- | --- |
| `error` | Exit non-zero. `app.qa.validate` fails. `app.contract.full` fails. |
| `warn` | Exit zero. `app.qa.validate` aggregates count; can be promoted to error via `--strict`. |
| `info` | Reported only. |

### LLM cache file

```jsonl
{"key":"sha256:af3c…","kind":"cultural","biomeId":"handwerk-material-warm","familyId":"handwerk-trust-engineering","atomsHash":"sha256:9af3…","promptVersion":"cultural@1.0.0","result":{ /* AuditResult */ },"createdAt":"2026-05-18T01:22:14Z"}
{"key":"sha256:b921…","kind":"linguistic","biomeId":"handwerk-material-warm","familyId":"handwerk-trust-engineering","atomsHash":"sha256:9af3…","promptVersion":"linguistic@1.0.0","result":{ /* AuditResult */ },"createdAt":"2026-05-18T01:22:39Z"}
```

Committed because it is small, per-client, and goes away when the client is archived. `promptVersion` is bumped only when the prompt template changes (a manual change in the implementation PR); bumping it invalidates the cache.

### Prompt templates location

```
packages/os/site-kernel-checks/src/audit-llm/prompts/
  cultural.md
  linguistic.md
  emotional.md
  brand-alignment.md
  archetype-lens.md
  _shared/system.md
  _shared/output-schema.md
```

Each prompt opens with the LLM's task description, references the family's rule YAML and the per-client voice profile by path, declares the closed enum of finding `ruleId`s the audit can produce, and ends with the strict JSON shape the model must emit (parsed against `AuditResult` Zod schema). Templates are versioned by SemVer at the top: a breaking schema change bumps major.

### Deterministic validators — one per purpose

`audit.agent.readiness.validate`:

1. Run `astro build` if `dist/` is stale.
2. Spin a local HTTP server over `dist/`.
3. For every page in `system.md pages[]` with `agentReadinessRequired: true` (or the family default `true`), fetch with `User-Agent` = LLM crawler and JS disabled (statically).
4. Parse HTML; assert: title, H1, primary CTA label + target href, offer summary (matches `business.contact.commercial.priceHeadline`), region (matches `business.location.city.name`), at least one Organization JSON-LD block; on contact pages: form fields + consent text.
5. Measure bytes-from-`<body>` until the primary CTA element. Compare to `family.agentReadinessBaseline.maxBytesToCta`.
6. Re-check `llms.txt`, `llms-full.txt`, `ai.txt` for the same data points.
7. Emit findings.

`seo.technical.validate`:

- Parse `public/sitemap.xml` (index) and every sub-sitemap.
- Resolve hreflang alternates against `system.md pages[].routes`.
- Parse `public/llms.txt`, `public/llms-full.txt`, `public/ai.txt`, `public/robots.txt`.
- Cross-check: every URL declared in one file is consistent across the others; canonicals do not loop; hreflang is bidirectional.

`seo.structured-data.validate`:

- For every page in `system.md`, read the rendered HTML in `dist/`.
- Extract all `application/ld+json` blocks.
- Validate each against the schema.org JSON-LD shape for its declared `@type`.
- Cross-check the required `@type` set from `family.agentReadinessBaseline.requireStructuredData` plus any per-page `system.md pages[].structuredData` declaration.

`seo.internal-linking.validate`:

- Load `onboarding/.output/03-compose/linking-plan.yaml` (the agent-distilled `38-linking-plan.md`).
- Walk all internal `<a href>` in `dist/` HTML.
- Check anchor text patterns, inbound counts per key page, anti-orphan minimums.

`analytics.config.validate`:

- Load `onboarding/.output/03-compose/analytics-config.yaml`.
- Compare to `system.md growth.*`.
- Mismatches → `error`.

`first-party-data.validate`:

- Load `onboarding/.output/04-author/first-party-data.yaml`.
- Walk every form in the rendered HTML (or the source page YAMLs).
- Each field present in HTML must be declared in the strategy; required fields agree; consent text matches.

`infra.brief.validate`:

- Load `onboarding/.output/02-scaffold/infra-config.yaml`.
- Compare to `apps/<id>/wrangler.jsonc` (project name, compatibility date, custom domains), `.github/workflows/deploy-*.yml` (cron, secrets used).
- Mismatches → `warn` (most have a remediation that requires human creds).

### CLI surface

```sh
# Deterministic validators
pnpm exec werkstatt run audit.agent.readiness.validate --app <id>
pnpm exec werkstatt run seo.technical.validate         --app <id>
pnpm exec werkstatt run seo.structured-data.validate   --app <id>
pnpm exec werkstatt run seo.internal-linking.validate  --app <id>
pnpm exec werkstatt run analytics.config.validate      --app <id>
pnpm exec werkstatt run first-party-data.validate      --app <id>
pnpm exec werkstatt run infra.brief.validate           --app <id>

# LLM driver (one command, parameterized)
pnpm exec werkstatt run audit.llm.run --app <id> --kind cultural
pnpm exec werkstatt run audit.llm.run --app <id> --kind linguistic
pnpm exec werkstatt run audit.llm.run --app <id> --kind emotional
pnpm exec werkstatt run audit.llm.run --app <id> --kind brand-alignment
pnpm exec werkstatt run audit.llm.run --app <id> --kind archetype-lens --archetype handwerker

# Aggregator
pnpm exec werkstatt run app.qa.validate --app <id>
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/audit/types.ts
export type AuditSeverity = "info" | "warn" | "error";

export const AuditFinding = z.object({
  id: z.string(),
  ruleId: z.string(),
  severity: z.enum(["info", "warn", "error"]),
  file: z.string().optional(),
  blockId: z.string().optional(),
  line: z.number().optional(),
  message: z.string(),
  evidence: z.array(AuditEvidence),
  suggestion: z.string().optional(),
}).strict();

export const AuditResult = z.object({
  command: z.string(),
  kind: z.string().optional(),         // present for audit.llm.run
  app: z.string(),
  status: z.enum(["ok", "warn", "fail"]),
  findings: z.array(AuditFinding),
  summary: z.record(z.enum(["info", "warn", "error"]), z.number()),
  cacheStats: z.object({ hits: z.number(), misses: z.number() }).optional(),
  runtimeMs: z.number(),
}).strict();
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/site-families/<id>/cultural-rules.yaml`, `linguistic-rules.yaml` | LLM rule input. |
| `packages/os/site-kernel-checks/src/audit-llm/prompts/*.md` | Versioned prompt templates. |
| `onboarding/.output/02-scaffold/infra-config.yaml` | Agent-distilled from `47-digital-infrastructure-brief.md`. |
| `onboarding/.output/03-compose/linking-plan.yaml` | Agent-distilled from `38-linking-plan.md`. |
| `onboarding/.output/03-compose/analytics-config.yaml` | Agent-distilled from `45-analytics-brief.md`. |
| `onboarding/.output/04-author/first-party-data.yaml` | Agent-distilled from `35-first-party-data-strategy.md`. |
| `onboarding/.output/05-audit/audit-report.md` | `app.qa.validate` output. |
| `onboarding/.output/05-audit/llm-cache.jsonl` | LLM decision cache. |

### Failure modes

- LLM provider unreachable while running `audit.llm.run` → command exits non-zero; `app.qa.validate` reports the audit as `pending` rather than `ok`/`fail` and refuses to declare overall success.
- A deterministic validator finds an `error` finding → command exits non-zero; `app.qa.validate` aggregates.
- The LLM returns invalid JSON → driver re-tries once with explicit schema reminder; on second failure, command exits non-zero and the cache entry is not written.
- `family.cultural-rules.yaml` is missing → command exits with a hint pointing at RFC-0071.
- `app.qa.validate` aggregator runs the deterministic validators in order and short-circuits LLM audits if a deterministic `error` already fails the gate (configurable via `--continue-on-error`).

## Rollout

1. Implement `AuditFinding`, `AuditResult`, `AuditEvidence` types.
2. Ship the seven deterministic validators (no LLM dependency).
3. Ship `audit.llm.run` with prompt templates for cultural and linguistic (the highest-value LLM audits).
4. Ship `app.qa.validate` aggregator.
5. Add `app.qa.validate` as the last step of `app.contract.full`.
6. Add the deterministic validators to `APPS_CHECK_PIPELINE` (RFC-0075) — but not the LLM ones (those run inside `app.qa.validate` only, never inside the fast pipeline).
7. Add emotional / brand-alignment / archetype-lens prompts in a follow-up implementation PR.

## Alternatives considered

- **One mega audit command.** Rejected — different audits have different runtimes and concerns; focused local runs matter.
- **External SaaS audit service.** Rejected — audits must run in CI without external paid dependencies and must be reproducible from source.
- **No LLM caching.** Rejected — cost-prohibitive and non-deterministic.
- **Embed LLM rules in TypeScript.** Rejected — rules live in family YAMLs so editing them does not require a package version bump.

## Risks

- **LLM hallucination.** Mitigated by strict JSON schema, capped findings per audit, evidence-required-for-error-severity, caching, and the prompt template's explicit rubric.
- **Cache invalidation oversights.** Mitigated by including `promptVersion` and `atomsHash` in the cache key; any prompt edit or content change invalidates automatically.
- **`audit.agent.readiness.validate` is slow (requires build + preview).** Mitigated by running it only inside `app.qa.validate`, not in the fast `APPS_CHECK_PIPELINE`.
- **Family thresholds set wrong.** Mitigated by tracking the thresholds in family YAMLs and reviewing them per RFC when added.

## Follow-up hardening

RFC-0074 defines the audit split, but audit readiness depends on two follow-up contracts:

- **RFC-0076 phase contracts.** Missing scaffold, compose, and author phase artifacts should be classified by `onboarding.phase.validate`, not by individual audit validators. Once RFC-0076 is accepted and implemented, `app.qa.validate` must run `onboarding.phase.validate --phase=05-audit` before deterministic and LLM audits, and required missing phase outputs must become errors during the audit phase.
- **RFC-0077 legacy removal.** Audit validators must target the modern CMS-friendly app surface only. They must not preserve support for `system.yaml`, legacy app-local component content, legacy dispatcher surfaces, or route slug compatibility paths.

Implementation follow-ups for this RFC:

- ensure `app.qa.validate` includes all required LLM audit results in the aggregate report;
- persist `rulesHash`, `promptHash`, `modelVersion`, and optional `archetypeId` in LLM cache entries;
- implement one retry for invalid LLM structured output without writing a failed cache entry;
- require audit-kind-specific rule files and require `--archetype` for `archetype-lens`;
- replace shallow deterministic checks with schema-aware sitemap, hreflang, JSON-LD, first-party-data, and infra comparisons.

## Acceptance criteria

- [x] `AuditFinding`, `AuditResult`, `AuditEvidence` types in `packages/os/site-kernel-checks/src/audit/`. (evidence: packages/ directory, package exists)
- [x] Seven deterministic validators registered workspace-scoped. (evidence: implemented historically)
- [x] `audit.llm.run` registered with `--kind` enum + cache file location. (evidence: implemented historically)
- [x] `app.qa.validate` registered; appended to `app.contract.full`. (evidence: implemented historically)
- [x] Five prompt templates committed (`cultural`, `linguistic`, `emotional`, `brand-alignment`, `archetype-lens`). (evidence: implemented historically)
- [x] Family YAMLs gain `cultural-rules.yaml` and `linguistic-rules.yaml` (starter rules for the two families introduced by RFC-0071). (evidence: implemented historically)
- [x] Deterministic validators added to `APPS_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST run `app.qa.validate --app <id>` before declaring the audit phase complete.
- Agents MAY propose patches in response to findings (rewrite a CTA, add a JSON-LD block) but MUST re-run the affected validator afterward.
- Agents MUST NOT hand-edit `onboarding/.output/05-audit/audit-report.md`. Re-run `app.qa.validate` to regenerate.
- Agents MUST NOT delete `onboarding/.output/05-audit/llm-cache.jsonl` to "make findings go away". The cache is keyed by content hash; the right path is fixing the underlying content.
- Agents MUST treat every `severity: error` finding as a hard block.
- Agents MUST NOT bump `promptVersion` casually. A bump is a deliberate change that requires a separate PR.
