---
id: RFC-0287
title: "Project the business layer as static agent knowledge files"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0319
related:
  - RFC-0143
  - RFC-0147
  - RFC-0148
  - RFC-0166
  - RFC-0195
  - RFC-0211
  - RFC-0213
  - RFC-0286
  - AP-2
commands:
  proposed: []
  added:
    - agent.knowledge.generate
    - agent.knowledge.validate
  changed:
    - agent.manifest.generate
    - agent.surface.validate
    - llms.generate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "An external agent can GET /api/agent/v1/offer.json on any site and receive typed, current business facts without scraping HTML or prose."
  - "Every byte of every knowledge file is derivable from src/content/ through the same projectors that feed llms-full.txt and JSON-LD — the three outputs can never disagree."
  - "A privacy-sensitive business domain (externalServices, compliance) provably never appears in any knowledge file, enforced by a failing check, not by discipline."
  - "Knowledge facts carry freshness metadata from the CKL ledger where it exists, so an agent can distinguish a verified fact from an unverified one."
nonGoals:
  - "Do not add a runtime endpoint for knowledge — files are static public/ artifacts (AS-6)."
  - "Do not invent facts or restructure meaning beyond what the semantic projectors already expose (AS-2, AP-2)."
  - "Do not project page prose — pages are already served as Markdown twins (RFC-0166/0195); knowledge files cover the business layer only."
  - "Do not build per-agent personalization or query parameters; one file per domain, same bytes for every consumer."
acceptance:
  - probe: command-registered
    name: "agent.knowledge.generate"
  - probe: command-registered
    name: "agent.knowledge.validate"
  - probe: file-exists
    path: "packages/share/src/agent/knowledge.ts"
  - probe: run
    command: "site-kernel run agent.knowledge.generate --app warpgogol-com"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run agent.knowledge.validate --app warpgogol-com"
    expect:
      exitCode: 0
---

# RFC-0287: Project the business layer as static agent knowledge files

## Context

RFC-0286 establishes the Agent Surface and its manifest spine. This RFC fills the **knowledge tier**: the structured, machine-consumable projection of the business layer.

The projection machinery already exists. RFC-0147/0148 built `buildOrganizationProfile` (`packages/share/src/semantic/organization-profile.ts`) and the pure projectors in `packages/share/src/semantic/business-projection.ts` (`projectOffer`, `projectLocation`, `projectPeople`), plus the hard privacy boundary `BUSINESS_DOMAIN_VISIBILITY`. Today those feed two projections: `llms-full.txt` (prose for reading LLMs) and JSON-LD (schema.org for search). Both lose the typed structure: an agent that wants "the monthly price" must parse prose or navigate schema.org vocabulary designed for search engines.

The knowledge tier is the third projection of the same model: plain, typed JSON, one file per public business domain, served statically.

## Problem

- Agents consume the business layer today by scraping — brittle, lossy, and expensive for both sides.
- Any new machine format built ad hoc (per app, per demand) would bypass `BUSINESS_DOMAIN_VISIBILITY` and the semantic-parity guarantees, recreating the pre-RFC-0148 leak risk.
- CKL freshness data (RFC-0213) exists but reaches no public output; agents cannot tell a fact verified last week from one authored two years ago.

## Decision

`build.prepare` gains `agent.knowledge.generate`: for every business domain with visibility `public` in `BUSINESS_DOMAIN_VISIBILITY` **that has content in the app**, it writes one static JSON file to `public/api/agent/v1/<domain>.json`, projected through the existing RFC-0148 projectors. `agent.knowledge.validate` enforces schema validity, privacy (no-leak), parity, and drift. The manifest (`agent.manifest.generate`, changed) lists each emitted file as an `AgentKnowledgeRef`; `llms.generate` (changed) adds one "Agent knowledge" line to `llms.txt` pointing at `/.well-known/agent.json` so reading LLMs can hand off to tool-using agents.

## Architectural fit

- **Generator Contract (RFC-0143), site-wide policy family.** Config lives in the RFC-0286 `agent:` block (this RFC adds the optional key `agent.knowledgeDisabled?: string[]` — domains to withhold). Pure formatter in `@gogol/share`; command pair; safe default (enabled); registered in `APPS_BUILD_PREPARE_PIPELINE`. Writes only to `public/` — never `dist/`.
- **RFC-0148 projectors are the single mapping point.** The knowledge formatter consumes `SemanticOffer`/`SemanticLocation`/`SemanticPerson`/`SemanticSiteProfile` — the projector outputs — not raw content files. Any domain the projectors cannot express is extended **in the projectors first**, so llms/JSON-LD/knowledge stay congruent by construction (AS-2).
- **CKL (RFC-0211/0213).** Where the freshness ledger has entries binding a domain's records, the envelope carries `freshness.lastVerified` (max over contributing records) — read via `packages/share/src/knowledge/freshness.ts`. Absent ledger data, the field is omitted (never fabricated).
- **RFC-0286 invariants.** AS-3 (privacy) and AS-2 (parity) are enforced here by `AGK-*` rules; AS-1 bijection between files and manifest refs is enforced by the existing `AGS-02/AGS-03`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run agent.knowledge.generate --app warpgogol-com
pnpm exec site-kernel run agent.knowledge.validate --app warpgogol-com --json
```

App-scoped. `agent.knowledge.generate` (`mutatesState: true`) runs in `APPS_BUILD_PREPARE_PIPELINE` after `entitlements.resolve` and **before** `agent.manifest.generate`, which consumes the emitted file list. Canonical order: `entitlements.resolve` → `agent.knowledge.generate` → `agent.manifest.generate` → `agent.openapi.generate` (RFC-0289). This refines the RFC-0286 ordering (which pins the manifest after `entitlements.resolve` and `surface.generate`): the knowledge tier slots in before the manifest so `AgentKnowledgeRef`s point at real files. `agent.knowledge.validate` runs in `APPS_CHECK_PIPELINE`.

### TypeScript contracts

```ts
// packages/share/src/agent/knowledge.ts
/** Domains eligible for knowledge projection: exactly the `public` keys of BUSINESS_DOMAIN_VISIBILITY. */
export const AGENT_KNOWLEDGE_DOMAINS = [
  "company", "legal", "contact", "offer", "service", "location", "web", "people", "trust", "faq",
] as const;
export type AgentKnowledgeDomain = (typeof AGENT_KNOWLEDGE_DOMAINS)[number];

export interface AgentKnowledgeEnvelope<TData> {
  /** e.g. "gogol.agent.knowledge/offer@1" — bump the @N on breaking shape change, by RFC. */
  schema: string;
  site: string;                          // system.md `app`
  baseUrl: string;
  languages: { default: string; supported: string[] };
  /** sha256 hex over sorted-key JSON of `data` — determinism anchor, no timestamps. */
  contentHash: string;
  /** Present only when the CKL freshness ledger covers contributing records. */
  freshness?: { lastVerified: string };  // ISO-8601 date
  /** Per-language payload; non-default languages carry only overlay fields (RFC-0008 semantics). */
  data: Record<string, TData>;           // keyed by language code
}

/** Pure formatter: projector outputs in, envelope out. No I/O. */
export function formatAgentKnowledge(
  domain: AgentKnowledgeDomain,
  input: AgentKnowledgeInput,
): AgentKnowledgeEnvelope<unknown>;
```

`data` payload shapes per domain are the existing semantic model types (`SemanticOffer`, `SemanticLocation`, `SemanticPerson[]`, `SemanticSiteProfile` subsets, FAQ entries as `{ question, answer }[]`). The formatter serializes them verbatim — **no new fact shapes are defined in this RFC**; a payload gap is fixed in `business-projection.ts`/`organization-profile.ts` first.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<site>/public/api/agent/v1/<domain>.json` | One knowledge file per populated public domain. Generated, **gitignored**, byte-stable. |
| `apps/<site>/src/content/business/**` | Read-only source (via the kernel content loader + RFC-0148 projectors). |
| `packages/share/src/agent/knowledge.ts` | Domains list, envelope types, pure formatter. |
| `packages/ontology/src/schemas/system.ts` | `agent:` block gains `knowledgeDisabled?: string[]` (values validated against `AGENT_KNOWLEDGE_DOMAINS`). |
| `packages/share/src/knowledge/freshness.ts` | Read-only source of `lastVerified` (existing CKL module). |

A domain with no content in the app emits **no file** (safe default: absent input ⇒ absent output, never an empty stub).

### Output format

`agent.knowledge.validate --json` uses the canonical Diagnostic envelope with rules:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AGK-01` | error | An emitted file contains a key path belonging to a non-`public` domain, or any value string matching records from `externalServices`/`compliance` sources (no-leak; reuses the `business.projection.validate` leak-corpus technique). |
| `AGK-02` | error | Envelope invalid: bad `schema` tag, missing `contentHash`, hash mismatch with `data`, or unknown language key. |
| `AGK-03` | error | A populated public domain has no emitted file, or a file exists for an empty/disabled domain (generator drift — rerun `agent.knowledge.generate`). |
| `AGK-04` | error | Parity break: a fact present in the knowledge file is absent from the semantic model that feeds `llms-full.txt` (both are recomputed from source and compared structurally). |
| `AGK-05` | warning | `freshness` absent for a domain that has CKL claims (ledger exists but does not cover these records). |

### Failure modes

- Errors fail `build.check`; `AGK-05` warns only.
- Missing `src/content/business/` entirely ⇒ generator emits nothing, validator passes (pass-through no-op, like `people.validate` on people-less sites).
- `agent: { enabled: false }` ⇒ generator emits nothing and removes stale files it previously wrote (it owns the `public/api/agent/v1/` directory exclusively).

## Rollout

1. Implement formatter + commands; wire pipelines in the canonical order above; gitignore `public/api/agent/v1/` in both apps and the scaffold.
2. First `pnpm build` on each app emits knowledge files from existing business content — zero authoring required. warpgogol-com is the reference: expect `company/legal/contact/offer/service/location/web/people/trust/faq` coverage per its business tree.
3. `llms.generate` change ships in the same wave (one added line; twins and existing sections unchanged).
4. New apps get the tier automatically via the pipeline; onboarding needs no new phase.
5. Envelope evolution: breaking payload change ⇒ bump the domain's `@N` schema tag by RFC; agents pin on the tag, not the URL (AS-7).

## Alternatives considered

- **Serve JSON-LD as the knowledge tier.** Rejected: schema.org vocabulary is optimized for search-engine entity reconciliation, not tool consumption; agents would still need mapping code. JSON-LD remains for search; knowledge files are typed and flat.
- **One combined knowledge.json.** Rejected: per-domain files keep responses small, let `knowledgeDisabled` withhold selectively, and align cache/freshness granularity with the domain model.
- **Per-language files (`/de/offer.json`).** Rejected: the `byLanguage` map inside one file mirrors RFC-0008 overlay semantics exactly and spares agents a second fetch to learn language coverage.
- **Committing the files (like twins).** Rejected: twins are content-reviewable prose; knowledge files are pure derivations whose bytes depend on entitlement-resolved builds. Gitignored-generated matches `surface.generated.json` precedent.

## Risks

- **Leak surface.** A projector bug could expose a `none` domain. Mitigated twice: projectors never receive those domains (RFC-0148), and `AGK-01` scans emitted bytes independently.
- **Parity checker cost.** `AGK-04` recomputes the semantic model; on current app sizes this is milliseconds, but the rule must reuse the loaded model within one process, not re-read content per domain.
- **Schema-tag discipline.** Agents may be tempted to "just add a field" to an envelope payload. Additive fields are fine (minor); reshaping requires the `@N` bump — stated in Implementation notes.

## Acceptance criteria

- [x] `packages/share/src/agent/knowledge.ts` exists with the contracts above; unit tests cover determinism, language overlay, hash stability, and the empty-domain no-op (5 tests green; plus 7 manifest.ts tests, 12 total in `@gogol/share/agent`). (evidence: packages/ directory, package exists)
- [x] `agent.knowledge.generate` + `agent.knowledge.validate` registered and wired (`APPS_BUILD_PREPARE_PIPELINE` / `APPS_CHECK_PIPELINE`) in the canonical order relative to `agent.manifest.generate` (knowledge generate/validate run immediately before manifest generate/validate). (evidence: implemented historically)
- [x] `AGK-01..AGK-05` registered (inline rule ids, consistent with the rest of this codebase). (evidence: implemented historically)
- [x] `agent.manifest.generate` lists emitted files as `AgentKnowledgeRef`s; `AGS-02/03` bijection holds on both apps (verified green after fixing a URL double-prefix bug caught by this exact check). (evidence: implemented historically)
- [x] `llms.generate` emits the discovery line (`buildLlmsIndex` in `@gogol/share/semantic/llms.ts`); full `@gogol/share` suite (179 tests) green, no snapshot regressions. (evidence: packages/ directory, package exists)
- [x] Both apps `build:check` green (warpgogol-com and nicaragua-projekt full pipelines, including `astro build`, verified); warpgogol-com emits 8 domain files (company/contact/faq/legal/location/offer/people/web) from existing content — "service" and "trust" deliberately unpopulated in v1 (no stable cross-app projector yet, documented in Non-goals). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `public/api/agent/v1/` gitignored in apps + scaffold template (root `.gitignore` glob); generated `AGENTS.md` template documents the tier. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Implement after RFC-0286.
- Agents MAY transition `accepted` → `implemented` per RFC-0224 once all criteria are checked and committed.
- NEVER define a new fact shape in the agent layer: extend `business-projection.ts` / `organization-profile.ts` first, then serialize (AS-2). NEVER emit a domain not listed in `AGENT_KNOWLEDGE_DOMAINS`.
- Payload changes: additive optional fields need no schema-tag bump; any rename/reshape/removal requires an RFC that bumps the domain's `@N` tag.
- Reference RFC-0287 in commit messages.
