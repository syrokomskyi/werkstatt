---
id: RFC-0910
title: "Canonical entity identity URLs in JSON-LD"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0163
amendedBy: []
related:
  - DNA-85
  - DNA-86
  - RFC-0160
  - RFC-0163
  - RFC-0898
  - RFC-0906
  - RFC-0908
  - RFC-0909
  - RFC-0911
  - RFC-0912
batch: seo-indexing-hardening
dependsOn: []
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-85
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
    - jsonld.canonical-entity.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-shared"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Organization.url, WebSite.url and BreadcrumbList item URLs in rendered JSON-LD use the canonical unprefixed root (https://<site>/) for the default language"
  - "jsonld.canonical-entity.validate fails a rendered page whose JSON-LD entity URL carries the default-language prefix"
  - "warpgogol.com production JSON-LD passes the validator after the builder fix"
nonGoals:
  - Trailing-slash parity between HTML and sitemap (covered by RFC-0906 / DNA-85).
  - Host (www vs apex) canonicalization redirects (covered by RFC-0908 / DNA-86).
  - Changing the entity @id fragment scheme (#/schema/...) — @ids stay as-is; only URL-valued fields are normalized.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "jsonld.canonical-entity.validate"
  - probe: run
    command: "werkstatt run jsonld.canonical-entity.validate --site warpgogol-com"
    expect:
      exitCode: 0
---

# RFC-0910: Canonical entity identity URLs in JSON-LD

## Context

The 2026-08-21 SEO audit inspected the production `<head>` of warpgogol.com and found an entity-identity inconsistency in the JSON-LD graph:

- `Organization.url` and `WebSite.url` are `https://warpgogol.com/de/`;
- the first `BreadcrumbList` item points at `https://warpgogol.com/de/`;
- while the canonical root of the site (per `<link rel="canonical">`, sitemap, and RFC-0160 unprefixed-default-language routing) is `https://warpgogol.com/`.

`/de/` currently serves HTTP 200 with a canonical link back to `/`, so Google resolves the duplicate — but the knowledge-graph identity of the organization is anchored to a non-canonical URL. Entity identity is a durable signal: every crawler, knowledge panel, and LLM that reads the JSON-LD graph sees `/de/` as the organization's home.

Root cause: `packages/werkstatt-shared/src/share/semantic/organization-profile.ts` builds the identity URL as `toAbsoluteUrl(baseUrl, \`/${input.lang}/\`)`, applying the language prefix unconditionally — even when `lang`is the default language, whose canonical form is unprefixed.`jsonld/website.ts` and the breadcrumb builder follow the same pattern.

DNA-85 (established by RFC-0906) requires byte-identity of JSON-LD page `url` fields with `canonicalPageUrl`, and DNA-86 (RFC-0908) governs host canonicalization. Neither invariant covers **entity identity URLs** (`Organization.url`, `WebSite.url`, `BreadcrumbList.item`), which are not page URLs and never passed through `canonicalPageUrl`.

## Problem

Entity identity URLs in JSON-LD bypass the canonical URL policy:

1. `buildOrganizationProfile` constructs `Organization.url` with a raw language prefix, producing `/de/` for the default language instead of the canonical `/`.
2. `WebSite.url` and breadcrumb item URLs are derived the same way, so the whole identity layer inherits the non-canonical form.
3. No validator checks entity identity URLs — `jsonld.url.validate` (RFC-0163) covers per-page WebPage nodes, and the RFC-0898 domain validator covers origins, but nothing compares entity URLs against the canonical root.
4. Every future site built by the workshop inherits the defect through the shared semantic builders.

## Decision

All URL-valued fields of JSON-LD identity entities — `Organization.url`, `WebSite.url`, `Person.url`, and `BreadcrumbList.itemListElement[].item` — are built through the canonical URL policy (`canonicalPageUrl` / RFC-0160 unprefixed default language), never through raw language-prefix string concatenation; and a new `jsonld.canonical-entity.validate` command verifies on rendered HTML that every entity URL matches the canonical form.

## Architectural fit

- **DNA-85 (satisfied)** — extends the canonical-parity invariant from page `url` fields to entity identity URLs: one canonicalization policy, no bypass via `localizeUrl` or raw prefix concatenation.
- **DNA-86 (related)** — host normalization is orthogonal; this RFC assumes the canonical host from `astro.config.mjs` `site` as DNA-86 defines it.
- **RFC-0160 (related)** — the unprefixed-default-language rule is the definition of "canonical form" used by the fix and the validator.
- **RFC-0163 (amended)** — the per-page JSON-LD URL contract is extended: identity entity URLs join the class of URLs that must match canonical form.
- **Site OS operator model** — the validator is app-scoped, post-build (rendered HTML), and joins `SITES_CHECK_POSTBUILD_PIPELINE` beside the other JSON-LD validators.

## Design

### CLI surface

```sh
pnpm exec werkstatt run jsonld.canonical-entity.validate --site warpgogol-com
pnpm exec werkstatt run jsonld.canonical-entity.validate --site warpgogol-com --json
```

App scope. Reads rendered HTML from `dist/client/**/*.html` and the site manifest for the default language and canonical origin. Skips gracefully (exit 0) when `dist/` is not built, following the `seo.meta.validate` (RFC-0162) postbuild-gate pattern.

### TypeScript contracts

Builder-side (in `werkstatt-shared/share/semantic`):

```ts
// organization-profile.ts — the url field is built from the canonical root,
// not from `/${lang}/`:
function canonicalRootUrl(baseUrl: URL | string, trailingSlash: "always" | "never"): string;

// Applied in buildOrganizationProfile, buildWebSiteNode, and the breadcrumb builder.
```

Validator-side:

```ts
interface EntityUrlFinding {
  file: string;            // rendered HTML file
  entityType: "Organization" | "WebSite" | "Person" | "BreadcrumbList";
  field: string;           // e.g. "url", "itemListElement[0].item"
  actual: string;          // URL found in JSON-LD
  expected: string;        // canonical form per canonicalPageUrl policy
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-shared/src/share/semantic/organization-profile.ts` | Fixed: identity URL via canonical policy |
| `packages/werkstatt-shared/src/share/semantic/jsonld/website.ts` | Fixed: `WebSite.url` canonical |
| `packages/werkstatt-shared/src/share/semantic/jsonld/breadcrumb.ts` | Fixed: item URLs canonical |
| `packages/werkstatt-site/src/checks/audit/validators/` | Home of the new validator |
| `dist/client/**/*.html` (workpiece) | Read-only scan target |
| Site content files | Never touched — the fix is in shared builders, not in content |

### Output format

Standard Diagnostic envelope:

```json
{
  "command": "jsonld.canonical-entity.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "JSONLD-ENTITY-01",
      "severity": "error",
      "message": "Organization.url is https://warpgogol.com/de/ but canonical root is https://warpgogol.com/.",
      "evidence": [{ "kind": "rendered", "file": "dist/client/index.html" }]
    }
  ]
}
```

| Rule | Severity | Condition |
| --- | --- | --- |
| `JSONLD-ENTITY-01` | error | `Organization.url` / `WebSite.url` differs from the canonical root URL. |
| `JSONLD-ENTITY-02` | error | `BreadcrumbList` item URL carries the default-language prefix or non-canonical form. |
| `JSONLD-ENTITY-03` | error | `Person.url` (when present) is non-canonical. |

### Failure modes

- Error-severity diagnostics exit 1 — enforcement is error from day one (operator decision 2026-08-21). The builder fix and the validator land in the same implementation, so the pipeline goes green atomically.
- Malformed JSON-LD blocks are reported by the existing `seo.structured-data.validate`; this validator skips unparseable blocks rather than double-reporting.
- Pages without a semantic model (no JSON-LD graph) are skipped.

## Rollout

1. Fix the three builders in `werkstatt-shared` to route entity URLs through the canonical policy. Snapshot/behavior tests referencing `/de/` identity URLs are updated in the same commit.
2. Add `jsonld.canonical-entity.validate` and wire it into `SITES_CHECK_POSTBUILD_PIPELINE` after `jsonld.url.validate`, as error.
3. warpgogol-com is rebuilt and redeployed through the normal mission pipeline; production JSON-LD then presents the canonical identity. No content migration is needed — the change is purely in shared builders.
4. New sites inherit the fixed builders automatically; nothing to declare in `system.md`.

## Alternatives considered

- **Content-side fix (edit system.md / business-profile to declare `/`)** — rejected: the `/de/` prefix is not authored content, it is synthesized by the builder from `input.lang`; fixing content would leave the builder defect for every future site.
- **301-redirect `/de/` → `/` and keep the prefixed identity URL** — rejected: a redirect makes `/de/` tolerable for crawlers but still anchors the knowledge-graph identity to a redirecting URL; identity URLs must be final canonical destinations.
- **Fold into RFC-0906 (trailing-slash parity)** — kept separate: RFC-0906 governs page URL byte-identity against the sitemap; entity identity URLs are a different class (not page URLs) with a different root cause and validator. Related, not merged.
- **New DNA-87 for entity identity** — rejected by the operator (2026-08-21): the parity principle is DNA-85; a special case does not get its own invariant.

## Risks

- **Knowledge-graph re-anchoring** — changing `Organization.url` from `/de/` to `/` asks Google to re-associate the entity. Low risk: `/de/` already canonicalizes to `/`, so the change consolidates rather than moves signals.
- **False positives on sites with intentional prefixed roots** — a site whose canonical root genuinely lives under a language prefix would fail. Mitigation: the validator derives the expected form from the site's own RFC-0160 routing config, not from a hardcoded rule.
- **Test churn** — behavior snapshots and JSON-LD tests that assert `/de/` URLs must be updated in the same commit; forgetting them breaks unrelated pipelines. The rollout makes this atomic.
- **Agent misinterpretation** — agents must not "fix" this by editing site content or by adding redirects; the fix point is the shared semantic builders.

## Acceptance criteria

- [ ] `buildOrganizationProfile` builds `Organization.url` from the canonical root (no default-language prefix) (evidence: `organization-profile.ts`)
- [ ] `WebSite.url` and `BreadcrumbList` item URLs use the same canonical policy (evidence: `jsonld/website.ts`, `jsonld/breadcrumb.ts`)
- [ ] `jsonld.canonical-entity.validate` registered (app scope, postbuild) with JSONLD-ENTITY-01..03 (evidence: command table + handler)
- [ ] Validator wired into `SITES_CHECK_POSTBUILD_PIPELINE` as error (evidence: pipeline definition)
- [ ] Unit tests cover default-language root, non-default language, and prefixed-site edge case (evidence: test file)
- [ ] warpgogol-com rendered JSON-LD passes the validator (evidence: probe run output)
- [ ] `AGENTS.md` updated where agent behavior rules changed
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0910` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- The fix belongs in `werkstatt-shared` semantic builders. Agents MUST NOT patch entity URLs in site content, layout components, or via redirects.
- Agents MUST NOT change `@id` fragment schemes (e.g. `#/schema/organization`) — only URL-valued fields are normalized.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0910 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
