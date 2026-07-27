---
id: RFC-0319
title: "Harden agent knowledge JSON envelopes"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0287
amendedBy: []
related:
  - RFC-0148
  - RFC-0211
  - RFC-0213
  - RFC-0286
  - RFC-0308
  - RFC-0316
commands:
  proposed: []
  added: []
  changed:
    - agent.knowledge.generate
    - agent.knowledge.validate
    - agent.manifest.generate
    - public.surface.lint
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Agent knowledge files contain no empty-string values, no empty skeleton objects, and no stale/dead status URLs."
  - "Every emitted knowledge envelope has required freshness metadata backed by CKL or an approved authored verification record."
  - "Breaking shape fixes use schema tag bumps rather than silently changing @1 payload semantics."
nonGoals:
  - "Do not invent missing facts to fill knowledge files."
  - "Do not publish placeholder banking, donation, legal, or contact fields."
  - "Do not weaken BUSINESS_DOMAIN_VISIBILITY."
---

# RFC-0319: Harden agent knowledge JSON envelopes

## Context

The audit found defects in `public/api/agent/v1/*.json`:

- an empty localized organization name (`data.uk.name: ""`);
- a `donationAccount` skeleton with empty string fields;
- a `web.domains.german` field duplicating `primary`;
- a `statusUrl` pointing at a missing `cosmic-passport.json`;
- `freshness.lastVerified` present for some domains and absent for others.

RFC-0287 created the static knowledge tier. This RFC tightens its serialization and schema discipline before external agents depend on these files.

## Problem

Empty strings and empty skeleton objects look like real fields to machines but carry no truth. They are worse than omission because consumers must guess whether an empty value means "unknown", "not applicable", "redacted", or "generator bug". Freshness inconsistency has the same problem: an agent cannot tell whether a domain is verified or simply missing metadata.

## Decision

Agent knowledge generation becomes omit-empty and freshness-required.

1. Public knowledge JSON must never serialize empty strings.
2. Objects and arrays that become empty after omit-empty pruning must be omitted unless their schema explicitly defines empty as meaningful.
3. Fields whose content is not appropriate for the site type, such as `donationAccount` for a commercial studio with no approved donation account, must be absent.
4. Every emitted envelope must carry required freshness metadata.
5. Breaking payload shape fixes require schema tag bumps (`@1` -> `@2`) for affected domains.
6. The `web` domain shape is revised to avoid duplicate locale-specific domain keys and to validate declared status URLs against generated/runtime-owned artifacts.

## Architectural fit

This RFC tightens RFC-0287 without changing the Agent Surface architecture from RFC-0286. Knowledge files remain static generated artifacts derived from the business semantic projectors; the serializer and validator simply become stricter about absence, freshness, and schema tags.

The freshness requirement aligns the knowledge tier with CKL rather than bypassing it. The omit-empty contract preserves the privacy boundary from RFC-0148 and `BUSINESS_DOMAIN_VISIBILITY`: facts are either present, verified, and public, or omitted.

## Design

### Omit-empty serialization

Add one shared pruning function in `@gogol/share`:

```ts
export interface OmitEmptyOptions {
  preserveEmptyArraysFor?: readonly string[]; // JSON pointer paths
  preserveEmptyObjectsFor?: readonly string[];
}

export function omitEmptyKnowledgeValues<T>(value: T, opts?: OmitEmptyOptions): T | undefined;
```

Rules:

- trim strings before checking emptiness;
- omit `""` and whitespace-only strings;
- recursively omit empty child fields;
- omit arrays whose surviving item count is zero unless explicitly preserved;
- omit objects whose surviving key count is zero unless explicitly preserved;
- never omit `false`, `0`, or `null` when the schema explicitly allows `null` as a meaningful value. Prefer omission over `null` for unknown facts.

Generators must prune before hashing and before schema validation, so `contentHash` represents the actual public payload.

### Required freshness

Every `AgentKnowledgeEnvelope` must include:

```ts
export interface AgentKnowledgeFreshness {
  lastVerified: string; // YYYY-MM-DD
  source: "ckl-claim-ledger" | "authored-verification" | "derived-source";
  coverage: "domain";
}
```

Rules:

- `lastVerified` must be a real verification date, not the build date.
- CKL claim ledgers are preferred when a domain is claim-backed.
- When a domain is not yet CKL-backed, an approved authored verification record may provide the date. It must live in source content or a governed verification surface, not in generated output.
- If no real verification date exists, the generator must fail for that domain instead of emitting a freshness-less public file.
- Missing freshness is an error, not a warning, for public knowledge files.

This intentionally tightens RFC-0287, where freshness was optional.

### Domain schema changes

Affected domains that change payload shape must bump their schema tag:

| Domain | Required change |
| --- | --- |
| `company` | Localized organization name must fall back to default-language public name or omit the locale overlay; never `""`. |
| `legal` | Omit `donationAccount` unless a complete approved account exists. Empty banking skeletons are forbidden. |
| `web` | Replace duplicate `domains.german` style keys with `{ primary: string, localized?: Record<lang, string>, aliases?: string[] }`. |
| `web` | `statusUrl` must resolve to a generated static file or runtime-owned declaration validated by RFC-0307. |
| all | Required `freshness` envelope. |

If these changes are breaking for existing consumers, bump affected schemas to `gogol.agent.knowledge/<domain>@2`. The URL may stay `/api/agent/v1/<domain>.json`; the schema tag is the compatibility signal.

### agent.knowledge.validate additions

Add fail-hard diagnostics:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AGK-06` | error | Empty string value found anywhere in public payload. |
| `AGK-07` | error | Empty skeleton object/array found at a path not explicitly allowed by schema. |
| `AGK-08` | error | Required freshness missing or not source-backed. |
| `AGK-09` | error | Declared URL field points to neither generated static output nor runtime-owned declaration. |
| `AGK-10` | error | Payload shape changed without required schema tag bump. |

The validator must use JSON Schema or Zod schemas for every emitted domain, not ad hoc checks only. The schemas are the source of allowed empty-path exceptions.

### Agent manifest parity

`agent.manifest.generate` must list the actual schema tag read from each knowledge file after generation. It must not assume `@1`.

`agent.surface.validate` must fail if manifest schema refs and file schema fields differ.

## Pipeline placement

- `agent.knowledge.generate` still runs in `build.prepare` before `agent.manifest.generate`.
- `agent.knowledge.validate` runs in `apps-check.author` and `build.check`.
- `public.surface.lint` also catches empty placeholder strings in JSON as a belt-and-suspenders check, but `agent.knowledge.validate` owns the contract.

## Rollout

1. Add omit-empty serializer and tests.
2. Add freshness source resolution for each emitted domain.
3. Add domain schemas and `AGK-06` through `AGK-10`.
4. Fix existing projectors so empty fields are omitted before serialization.
5. Bump affected schema tags where payload shapes change.
6. Regenerate knowledge files and agent manifests.

## Alternatives considered

- **Keep empty strings and document them as unknown.** Rejected. Omission is clearer and safer for machine consumers.
- **Use `null` for unknown facts.** Rejected as the default because unknown facts should not look intentionally authored.
- **Keep freshness optional.** Rejected. Public agent knowledge is a fact surface; consumers need a verification date.

## Risks

- **Some domains stop emitting until verified.** Accepted. Publishing unverified fact files is worse than omission.
- **Schema churn for early consumers.** Mitigated by explicit schema tags.
- **Over-pruning meaningful empty arrays.** Mitigated by schema-owned preserve lists and tests.

## Acceptance criteria

- [x] `omitEmptyKnowledgeValues` exists with tests for strings, nested objects, arrays, `false`, `0`, and schema-preserved empty values. (evidence: tests pass, vitest run exitCode=0)
- [x] Every emitted knowledge envelope includes source-backed `freshness.lastVerified`. (evidence: implemented historically)
- [x] `agent.knowledge.validate` implements `AGK-06` through `AGK-10`. (evidence: implemented historically)
- [x] Domain schemas validate every generated `public/api/agent/v1/*.json` file. (evidence: implemented historically)
- [x] No emitted public knowledge JSON contains `""`. (evidence: implemented historically)
- [x] `legal.donationAccount` is omitted unless complete and approved. (evidence: implemented historically)
- [x] `web` domain no longer emits duplicate `domains.german` style keys and validates `statusUrl`. (evidence: implemented historically)
- [x] `agent.manifest.generate` reflects actual schema tags from emitted files. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not fill empty fields with guessed facts.
- Do not silence freshness errors by stamping the current date.
- If a domain lacks a real verification date, withhold that generated file and report the missing source-backed freshness.
- Bump schema tags for breaking shape changes and keep manifest refs in sync.
