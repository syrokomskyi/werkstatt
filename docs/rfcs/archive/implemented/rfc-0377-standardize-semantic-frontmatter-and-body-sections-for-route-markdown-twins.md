---
id: RFC-0377
title: "Standardize semantic frontmatter and body sections for route Markdown twins"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-12
updatedAt: 2026-07-12
enhancedAt: 2026-07-12
implementedAt: 2026-07-12
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0320
  - RFC-0166
  - RFC-0208
amendedBy: []
related:
  - DNA-4
  - DNA-16
  - DNA-20
  - RFC-0142
  - RFC-0287
  - RFC-0316
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-4
  - DNA-16
  - DNA-20
commands:
  proposed: []
  added: []
  changed:
    - page.markdown.generate
    - page.markdown.validate
  removed: []
appsImpacted:
  - apps/*
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-content"
  - "@gogol/ontology"
successSignals:
  - "Every generated route Markdown twin carries semantic frontmatter fields (id, route, title, type, domain, audience, lang, metaDescription, priority, tags) that let AI agents filter and rank pages without parsing the body."
  - "Every generated twin body follows a predictable section structure (Summary, Business context, Data / APIs, User flows, Constraints) so agents can locate information by heading pattern."
  - "page.markdown.validate enforces both the semantic frontmatter contract (MDMETA-08..12) and the body section contract (MDBODY-01..05)."
  - "New apps automatically produce compliant twins from day one with no per-page authoring required for derived fields."
nonGoals:
  - "Do not change the visual HTML page or its SEO meta tags — this RFC only affects the generated .md twin artifact."
  - "Do not make route Markdown twins an authored source of truth — they remain generated projections."
  - "Do not replace llms.txt or llms-full.txt (RFC-0142 owns those)."
  - "Do not add runtime worker routes or dynamic rendering."
  - "Do not introduce new Site OS commands — only changes existing page.markdown.generate / page.markdown.validate."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0377: Standardize semantic frontmatter and body sections for route Markdown twins

## Context

RFC-0166 introduced build-time per-page Markdown twins projected from the `SemanticPageModel`. RFC-0320 added portable provenance frontmatter (`canonical`, `language`, `lastModified`, `contentHash`, `license`, `generator`, `sourceKind`). These twins are the agent-readable page surface — advertised via `<link rel="alternate" type="text/markdown">` and consumed by LLM browse/citation tools.

The current frontmatter is **provenance-only**. It tells an agent _where_ the document came from and _when_ it was last modified, but not _what kind of page_ it is, _who_ it is for, or _what semantic domain_ it belongs to. An agent that fetches a twin cannot filter or rank it without parsing the free-text body.

Meanwhile, the Markdown body itself is structured as `H1 → lead → blocks → people → initiatives`. This is readable but does not follow a predictable section pattern that agents can navigate by heading. The user's vision (adapted from AGENTS.md/SKILL.md conventions) is to treat route Markdown twins as a **page-skills** layer: a unified YAML frontmatter with semantic metadata plus a structured body with repeatable sections (Summary, Business context, Data / APIs, User flows, Constraints).

## Problem

1. **No semantic filtering.** An agent that fetches `/preis.md` cannot tell from frontmatter alone whether it is a product page, a legal page, or a blog post. It must parse the body to discover `type`, `audience`, or `domain`. This makes batch agent operations ("find all `type: legal` pages", "filter by `audience: craft_business_owner`") impossible without full-text scanning.

2. **No priority signal.** Agents have no machine-readable way to know which pages are high-priority for user-facing tasks vs. supporting context. The `priority` field (0.0–1.0) lets agents rank pages for retrieval and citation.

3. **No tag taxonomy.** The `keywords` field exists on `SemanticPageModel` but is not emitted into twin frontmatter. Tags like `digital_transformation`, `handwerk`, `index` would let agents build lightweight topic graphs without parsing body text.

4. **Unpredictable body structure.** The current body (`H1 → lead → blocks → people → initiatives`) varies by page type. A `home` page has different blocks than a `legal` page. Agents cannot rely on a consistent heading pattern to locate the summary, business context, or constraints section.

5. **No visibility/agent-role metadata.** Agents cannot determine whether a twin is `public`, `internal`, or `experimental`, or which agent roles (`code`, `marketing`, `product_research`) should use it.

DNA-4 (canonical content in `src/content/`) is extended: the content layer now also authors semantic metadata that flows into generated twins. DNA-16 (semantic layer shares topology with navigation) is reinforced: the twin's `type`, `audience`, and `tags` are derived from the same `SemanticPageModel` that drives navigation and JSON-LD. DNA-20 (business layer as canonical site description) is supported: `domain` and `audience` flow from the business/ontology layer into the twin.

## Decision

The route Markdown twin frontmatter gains semantic metadata fields (`id`, `route`, `title`, `type`, `domain`, `audience`, `lang`, `metaDescription`, `priority`, `tags`, `agentRoles`, `visibility`) alongside the existing RFC-0320 provenance fields, and the twin body is restructured into a predictable section pattern (Summary, Business context, Data / APIs, User flows, Constraints) that `page.markdown.generate` emits and `page.markdown.validate` enforces.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`):** The new `audience` field is authored in page frontmatter (`system.md pages[].audience`) and flows through the semantic model into the twin. Other semantic fields (`type`, `domain`, `tags`, `priority`) are derived from the existing `SemanticPageModel` — no new authored content required for default behavior.
- **DNA-16 (Semantic layer shares topology with navigation):** The twin's `type`, `title`, `lang`, and `tags`/`keywords` are projected from the same `SemanticPageModel` that drives JSON-LD, sitemaps, and breadcrumbs. No diverging parallel model is created.
- **DNA-20 (Business layer as canonical site description):** `domain` is derived from the business/ontology layer (the page's `semanticType` → domain mapping), and `audience` falls back to a derivation map from `SemanticPageType`.
- **RFC-0320 (portable provenance frontmatter):** This RFC amends RFC-0320 by extending the frontmatter schema. The existing provenance fields (`canonical`, `language`, `lastModified`, `contentHash`, `license`, `generator`, `sourceKind`) remain unchanged and required. The `schema` tag bumps from `gogol.markdown-twin@1` to `gogol.markdown-twin@2`.
- **RFC-0166 (per-page Markdown projections):** This RFC amends the body projector (`buildPageMarkdown`) to emit the standardized section pattern.
- **RFC-0208 (semantic block text extraction):** This RFC amends how blocks are mapped into the new body sections.
- **RFC-0142 (llms.txt depth):** The `output.llms.depth` projection still governs twin eligibility. This RFC does not change which pages get twins.
- **RFC-0287 (agent knowledge JSON):** Complementary but separate — agent knowledge JSON envelopes carry structured business facts; route Markdown twins carry page-level semantic context. They do not overlap.
- **RFC-0316 (public surface hygiene):** The body section headings must pass existing `public.surface.lint` rules.
- **Site OS operator model:** `page.markdown.generate` and `page.markdown.validate` are existing app-scoped commands in `APPS_BUILD_PREPARE_PIPELINE` and `apps-check-postbuild`. No new commands are introduced.

## Design

### CLI surface

No new commands. The existing commands change behavior:

```sh
# Still in build.prepare — now emits semantic frontmatter + structured body
pnpm exec site-kernel run page.markdown.generate --app warpgogol-com

# Still in apps-check.postbuild — now validates semantic fields + body sections
pnpm exec site-kernel run page.markdown.validate --app warpgogol-com
```

### TypeScript contracts

**Extended `MarkdownTwinProvenance` (in `@gogol/share/semantic`):**

```ts
export interface MarkdownTwinSemanticMeta {
  id: string;            // pageId or derived slug
  route: string;         // site-relative route path (e.g. "/preis/")
  title: string;         // page heading or title
  type: SemanticPageType; // home | about | projects | content | article | legal | ...
  domain: string;        // semantic domain (derived from type → domain map)
  audience: string;      // authored or derived from SemanticPageType
  lang: string;          // BCP-47 / site language code
  metaDescription: string; // page.description (truncated to 160 chars)
  priority: number;      // 0.0–1.0, derived from type → priority map
  tags: string[];        // from page.keywords or derived
  agentRoles?: string[]; // optional: ["code", "marketing", "product_research"]
  visibility?: "public" | "internal" | "experimental"; // default: "public"
}

// Extended provenance carries semantic meta alongside existing fields
export interface MarkdownTwinProvenance {
  // ... existing RFC-0320 fields unchanged ...
  semantic?: MarkdownTwinSemanticMeta;
}
```

**Audience derivation map (in `@gogol/share/semantic`):**

```ts
const AUDIENCE_BY_PAGE_TYPE: Record<SemanticPageType, string> = {
  home: "general",
  about: "general",
  projects: "developer",
  donationContact: "general",
  openSource: "developer",
  content: "general",
  article: "general",
  person: "general",
  legal: "business_owner",
};
```

**Priority derivation map (in `@gogol/share/semantic`):**

```ts
const PRIORITY_BY_PAGE_TYPE: Record<SemanticPageType, number> = {
  home: 1.0,
  about: 0.6,
  projects: 0.5,
  donationContact: 0.3,
  openSource: 0.4,
  content: 0.7,
  article: 0.8,
  person: 0.3,
  legal: 0.5,
};
```

**Domain derivation map (in `@gogol/share/semantic`):**

```ts
const DOMAIN_BY_PAGE_TYPE: Record<SemanticPageType, string> = {
  home: "site",
  about: "site",
  projects: "projects",
  donationContact: "contact",
  openSource: "projects",
  content: "content",
  article: "content",
  person: "team",
  legal: "legal",
};
```

**Body section builder (in `@gogol/share/semantic`):**

```ts
export function buildPageMarkdown(page: SemanticPageModel): string {
  // Emits:
  // # <title>
  //
  // ## Summary
  // <page.lead ?? page.description ?? first block summary ?? first block body>
  //
  // ## Business context
  // <from blocks: who/what/why>
  //
  // ## Data / APIs
  // <from blocks: facts, items, structured data>
  //
  // ## User flows
  // <from blocks: steps, CTAs, scenarios>
  //
  // ## Constraints
  // <from blocks: legal, technical, business constraints>
  //
  // ## People (if page.people)
  // ## Initiatives (if page.initiatives)
  // ## FAQ (if page.faqEntries)
}
```

Summary fallback chain: `page.lead` → `page.description` → first block's `summary` → first block's `body`. If none of these exist, `page.markdown.generate` fails with a diagnostic naming the page, because `MDBODY-01` requires a `## Summary` section.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/markdown-twin-provenance.ts` | Extended: `buildMarkdownTwinFrontmatter` emits semantic fields |
| `packages/share/src/semantic/page-markdown.ts` | Extended: `buildPageMarkdown` emits structured body sections |
| `packages/share/src/semantic/models.ts` | `SemanticPageModel` gains optional `audience?: string` |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | `runPageMarkdownGenerate` threads semantic meta; `runPageMarkdownValidate` adds MDMETA-08..12 + MDBODY-01..05 |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Reads `audience` from page frontmatter into `SemanticPageModel` |
| `packages/ontology/src/schemas/system.ts` | `pageEntrySchema` gains optional `audience: z.string()` |
| `apps/*/src/content/system.md` | Optional: `pages[].audience` field per page |
| `apps/*/public/**/*.md` | Generated twins with new frontmatter + body structure |

### Output format

**Generated twin frontmatter (example):**

```yaml
---
canonical: "https://warpgogol.com/preis/"
language: "de"
lastModified: "2026-07-12"
contentHash: "sha256:<hex>"
license: "https://warpgogol.com/ai.txt"
generator: "page.markdown.generate"
sourceKind: "page"
schema: "gogol.markdown-twin@2"
id: "preis"
route: "/preis/"
title: "Offener Preis"
type: "content"
domain: "content"
audience: "craft_business_owner"
lang: "de"
metaDescription: "Transparente Preise für Handwerker: 70 EUR/Monat, 700 EUR/Jahr."
priority: 0.7
tags:
  - "preis"
  - "handwerk"
visibility: "public"
---
```

**Generated twin body (example):**

```markdown
# Offener Preis

## Summary

Transparente Preise für Handwerker...

## Business context

...

## Data / APIs

...

## User flows

...

## Constraints

...
```

**`page.markdown.validate --json` output (new rules):**

```json
{
  "command": "page.markdown.validate",
  "status": "fail",
  "violations": [
    {
      "file": "public/preis.md",
      "rule": "MDMETA-08",
      "message": "Missing required semantic field: type"
    },
    {
      "file": "public/preis.md",
      "rule": "MDBODY-01",
      "message": "Missing required body section: ## Summary"
    }
  ]
}
```

### Failure modes

**New validation rules in `page.markdown.validate`:**

| Rule | Severity | Meaning |
| --- | --- | --- |
| `MDMETA-08` | error | Missing required semantic field (`id`, `route`, `title`, `type`, `domain`, `audience`, `lang`, `metaDescription`, `priority`, `tags`). |
| `MDMETA-09` | error | `type` is not a valid `SemanticPageType` enum value. |
| `MDMETA-10` | error | `priority` is not a number in [0.0, 1.0]. |
| `MDMETA-11` | error | `visibility` is not one of `public`, `internal`, `experimental`. |
| `MDMETA-12` | error | `schema` tag is not `gogol.markdown-twin@2` (stale twin from pre-RFC-0377 generator). |
| `MDBODY-01` | error | Missing required `## Summary` section. |
| `MDBODY-02` | error | Missing required `## Business context` section. |
| `MDBODY-03` | warning | Missing `## Data / APIs` section (not all pages have structured data). |
| `MDBODY-04` | warning | Missing `## User flows` section (not all pages have flows). |
| `MDBODY-05` | warning | Missing `## Constraints` section (not all pages have constraints). |

Body section rules (`MDBODY-03..05`) are warnings because not every page type has structured data, user flows, or constraints. `Summary` and `Business context` are always required because every page has a lead/description and a purpose.

The command exits non-zero on any error. Warnings are reported but do not fail the check.

## Rollout

- **Default behavior: fail-hard on implementation.** Once this RFC is implemented, `page.markdown.generate` always emits the new semantic fields and structured body. `page.markdown.validate` enforces `MDMETA-08..12` as errors and `MDBODY-01..02` as errors, `MDBODY-03..05` as warnings. There is no opt-in flag.
- **No flag day for existing apps.** All semantic fields are derived from the existing `SemanticPageModel` — `type`, `title`, `lang`, `tags`/`keywords`, `description`/`metaDescription` are already present. The only new authored field is `audience` (optional, falls back to the derivation map). Existing apps regenerate twins on their next `build.prepare` and automatically comply.
- **Schema tag bump.** The `schema` field changes from `gogol.markdown-twin@1` to `gogol.markdown-twin@2`. `MDMETA-12` fails on stale `@1` twins, forcing a regenerate. This is a forward-only architecture decision (no backward compatibility layer).
- **New apps automatically comply** from day one — the onboarding template's `build.prepare` pipeline includes `page.markdown.generate`.
- **Pipeline integration unchanged.** `page.markdown.generate` remains in `APPS_BUILD_PREPARE_PIPELINE`; `page.markdown.validate` remains in `apps-check.postbuild`.
- **Compass synchronization.** Update `docs/knowledge-graph.xml` to reflect the new semantic metadata layer on route twins, and `docs/verification-plan.xml` to record the new `MDMETA-08..12` and `MDBODY-01..05` validation rules. `docs/source-markup.xml` does not require changes because generated twins are excluded from Compass coverage (`mode: none` for generated build output).
- **Behavior snapshot.** The behavior snapshot (`behavior.snapshot.validate`) should be updated to record the new frontmatter fields. Schema tag bump from `@1` to `@2` is a public behavior change and must be reviewed.

## Alternatives considered

- **Keep provenance-only frontmatter, add semantic metadata to JSON-LD only.** Rejected. JSON-LD is embedded in HTML and not available to agents that fetch the `.md` twin directly. The twin must be self-describing.
- **Use a separate sidecar JSON file per twin (e.g. `preis.md.json`).** Rejected. Doubles the number of generated files and breaks the single-artifact contract. YAML frontmatter is the established convention for Markdown metadata.
- **Make all semantic fields authored (no derivation).** Rejected. Would impose per-page authoring burden for fields that can be reliably derived from `SemanticPageType`. The hybrid approach (authored `audience` with fallback, derived everything else) minimizes authoring cost while allowing per-page overrides.
- **Keep the current body structure (`H1 → lead → blocks → people → initiatives`).** Rejected. The current structure is page-type-dependent and unpredictable for agent navigation. The standardized section pattern (Summary, Business context, Data / APIs, User flows, Constraints) is page-type-independent and maps to the AGENTS.md/SKILL.md convention.
- **Use JSON frontmatter instead of YAML.** Rejected. YAML is the established convention in this ecosystem (system.md, manifests, RFCs) and is more readable for the optional `tags` list.

## Risks

- **Body section mapping heuristics.** Mapping existing `SemanticBlock` entries into Summary / Business context / Data / APIs / User flows / Constraints requires heuristics (e.g. block.heading matching, block.facts → Data / APIs). These heuristics may produce empty sections for some page types. Mitigated by making `MDBODY-03..05` warnings, not errors. Performance cost is O(blocks) per page and does not require additional file system scans beyond the existing semantic model.
- **Frontmatter field proliferation.** Adding 10+ semantic fields increases frontmatter size. Accepted — the fields are small strings and the total frontmatter remains well under 1 KB.
- **`audience` derivation may not fit all sites.** The closed `AUDIENCE_BY_PAGE_TYPE` map may not match every site's audience taxonomy. Mitigated by allowing per-page `audience` override in `system.md`.
- **Schema tag bump breaks stale twins.** Any committed `.md` twins with `schema: gogol.markdown-twin@1` will fail `MDMETA-12` until regenerated. This is intentional — it forces a clean regenerate and prevents drift.
- **Agent misinterpretation of `priority`.** Agents might interpret `priority` as a search ranking signal rather than an agent-navigation hint. Mitigated by documenting in AGENTS.md that `priority` is advisory for agent retrieval, not a search engine signal.
- **`visibility: internal` twins in public directory.** If a page is marked `visibility: internal` but the twin is in `public/`, it is still publicly fetchable. This RFC does not change access control — `visibility` is advisory metadata, not a security gate. Access control remains at the build/route level.

## Acceptance criteria

- [x] `MarkdownTwinSemanticMeta` type and derivation maps (`AUDIENCE_BY_PAGE_TYPE`, `PRIORITY_BY_PAGE_TYPE`, `DOMAIN_BY_PAGE_TYPE`) defined in `@gogol/share/semantic` (evidence: packages/ directory, package exists)
- [x] `buildMarkdownTwinFrontmatter` emits all semantic fields when `provenance.semantic` is provided (evidence: implemented historically)
- [x] `buildPageMarkdown` emits the standardized body section pattern (Summary, Business context, Data / APIs, User flows, Constraints, then optional People/Initiatives/FAQ) (evidence: implemented historically)
- [x] `page.markdown.generate` threads semantic meta from `SemanticPageModel` into the twin (evidence: implemented historically)
- [x] `page.markdown.validate` implements `MDMETA-08..12` (errors) and `MDBODY-01..05` (mixed errors/warnings) (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] `SemanticPageModel` gains optional `audience?: string` field; `semantic-loader.ts` reads it from page frontmatter (evidence: implemented historically)
- [x] `pageEntrySchema` in `@gogol/ontology` gains optional `audience: z.string()` (evidence: packages/ directory, package exists)
- [x] Schema tag bumped to `gogol.markdown-twin@2`; `MDMETA-12` rejects `@1` twins (evidence: implemented historically)
- [x] Existing apps pass `page.markdown.validate` after regenerating twins (no per-page authoring required for derived fields) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT hand-edit generated `.md` twins — update the projector/generator and regenerate.
- Agents MUST NOT add new `SemanticPageType` values to the derivation maps without a superseding RFC that extends the closed enum (DNA-19).
- The `audience` field in `system.md` is optional. If absent, the derivation map provides the default. Do not fail `page.markdown.validate` on a missing authored `audience` — only on a missing derived `audience` (which indicates a bug in the generator).
- The body section mapping from `SemanticBlock[]` to the five standard sections uses heuristics. If a block does not clearly map to any section, place it in `Business context` as the default fallback.
- `agentRoles` and `visibility` are optional frontmatter fields. When absent, `visibility` defaults to `public` and `agentRoles` is omitted from the frontmatter entirely. `agentRoles` is intentionally not derived in v1; it is reserved for future per-page authoring or a separate derivation RFC.
