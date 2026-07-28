# RFC-0373 Audit Report

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| RFC            | RFC-0373 — Extract services at organization level from the business catalog |
| Status         | draft                                                                       |
| Kind           | architecture                                                                |
| Scope          | workspace                                                                   |
| Audit date     | 2026-07-10                                                                  |
| Auditor        | agent (wg-idea-audit)                                                       |
| `rfc.validate` | pass (0 violations, 0 warnings)                                             |

---

## Mechanical validation

`pnpm exec site-kernel run rfc.validate RFC-0373 --json` — **pass**, 0 violations, 0 warnings.

---

## Axis A — Structural completeness

| Item | Result | Notes |
| --- | --- | --- |
| Decision is single, present tense | **pass** | "Project the business service catalog into `SemanticOrganization.services`…" — clear, decisive. |
| CLI surface shows exact invocations | **pass** | `pnpm exec site-kernel run services.projection.validate --app warpgogol-com` and `--all --json`. |
| TypeScript contracts are minimal signatures | **pass** | `projectServices()` signature, `OrganizationProfileInput` extension, `SemanticService` type change. No full implementations. |
| File system responsibilities table | **fail** | **Missing `packages/share/src/semantic/jsonld.ts`**. The `buildJsonLd()` function at line 36–47 constructs `servicesListNode` from `context.page.services`. Removing `SemanticPageModel.services` breaks this file. The RFC lists `jsonld/service.ts`, `jsonld/context.ts`, `jsonld/organization.ts`, `jsonld/webpage.ts` but omits the top-level `jsonld.ts` which also reads `context.page.services` directly. |
| Output format documents `--json` shape | **pass** | Both pass and failure JSON examples provided. |
| Failure modes specify warn-vs-fail | **pass** | No services → omit (no error); missing name → dropped + flagged; duplicate slug → flagged; orphan file → flagged. |
| Rollout describes default behavior + adoption | **pass** | 6 phases, default behavior (no services = omit), RFC-0372 coordination. |
| Alternatives considered — honest | **pass** | 4 alternatives with rejection reasons (per-page, combined, extend shape, synthesize description). |
| Risks includes agent misinterpretation + false-positive | **partial** | Risks cover breaking change, content gap, orphan file, RFC-0372 ordering. **Missing**: false-positive rate of `services.projection.validate` (e.g. could the orphan `services.md` check fire on apps that legitimately have no services directory?); agent misinterpretation risk (e.g. agents might think they need to create `business/{lang}/services/` content as part of implementation, when Phase 5 says "out of scope"). |
| Acceptance criteria checkable + sufficient | **pass** | 15 items, each verifiable by build + inspection. |
| Implementation notes are explicit behavioral rules | **pass** | 7 MUST/MAY rules, including forward-only removal and RFC-0334 escalation. |

### Findings

- **A-1 (fail):** `packages/share/src/semantic/jsonld.ts` is missing from the file system responsibilities table. It reads `context.page.services` at line 40 and must be updated to read from `context.page.organization.services`.
- **A-2 (partial):** Risks section does not address false-positive rate of the new validator or agent misinterpretation risk around content authoring scope.

---

## Axis B — DNA alignment

| Item | Result | Notes |
| --- | --- | --- |
| `satisfies: [DNA-16]` is real | **pass** | DNA-16 exists in `docs/architecture-dna.md` line 67: "Semantic layer shares topology with navigation." |
| RFC explains how it enforces DNA-16 | **partial** | The architectural fit section says "Services are site-wide facts… Projecting them at the organization level matches their granularity." This explains the fit but does not explicitly say how it **enforces** or **protects** DNA-16. DNA-16 is about semantic outputs sharing topology with navigation — the RFC's connection is indirect (org-level services don't diverge from page topology because they're above it, not parallel to it). The argument could be clearer. |
| No silent conflict with existing DNA | **pass** | No conflict identified. The RFC aligns with DNA-1 (packages, not apps), DNA-4 (content in `src/content/`), DNA-16 (semantic topology). |
| `related[]` DNA references relevant | **pass** | DNA-16 is the most relevant invariant. No decorative references. |
| New DNA invariant established? | **n/a** | RFC does not claim to establish a new DNA invariant. |

### Findings

- **B-1 (partial):** The `satisfies: [DNA-16]` justification is indirect. DNA-16 says "semantic outputs must be derived from the same page topology and visibility state used for navigation rendering" — the RFC should explain how org-level services projection _protects_ this invariant (e.g. by removing the divergent per-page `services` field that was populated by a special home-page builder, not from navigation topology). The current text argues for org-level granularity but doesn't explicitly connect to the "same topology" requirement.

---

## Axis C — Ecosystem fit

| Item | Result | Notes |
| --- | --- | --- |
| Package boundaries (DNA-1) | **pass** | All proposed changes are in `packages/*`. No `apps/* → apps/*` imports. `projectServices()` in `@gogol/share`, validators in `@gogol/site-kernel-checks`. |
| Pipeline placement | **pass** | `services.projection.validate` → `APPS_BUILD_CHECK_PIPELINE`. Correct: it's an author-time check (reads source files, not dist). Justified as blocking. |
| Compass sync (`docs/*.xml`) | **fail** | The RFC does not identify which `docs/*.xml` files need synchronization. Adding `projectServices()` to `business-projection.ts` and a new command changes the shared package contract surface. Per root AGENTS.md Compass document duties: "Update the affected `docs/*.xml` files in the same change whenever a task changes repository-wide requirements, shared package contracts, app-package relationships, or verification policy." At minimum `docs/technology.xml` (new projector in `@gogol/share`) and `docs/verification-plan.xml` (new check command) should be flagged. |
| AGENTS.md updates | **partial** | The RFC does not identify which `AGENTS.md` files need rule updates. `packages/AGENTS.md` lists package ownership boundaries — adding `projectServices()` to `@gogol/share` doesn't change the boundary but the RFC should state this explicitly. No `AGENTS.md` rule changes are proposed, which may be correct, but the RFC should say so. |
| Cosmic naming | **n/a** | RFC does not touch manifests, components, sections, or page contracts. |
| Command lifecycle buckets | **pass** | `proposed: [services.projection.validate]` and `added: [services.projection.validate]` — internally consistent for a draft that will land the command upon implementation. |

### Findings

- **C-1 (fail):** No Compass sync identification. The RFC should list `docs/technology.xml` and `docs/verification-plan.xml` as files requiring synchronization when implemented.
- **C-2 (partial):** No explicit statement on AGENTS.md impact. The RFC should state whether `packages/AGENTS.md` or root `AGENTS.md` need updates (likely not, but should be explicit).

---

## Axis D — Forward-only compliance

| Item | Result | Notes |
| --- | --- | --- |
| No backward compatibility layer | **pass** | `SemanticPageModel.services` is removed outright. NonGoals: "Do not preserve backward compatibility for SemanticPageModel.services — forward-only removal." Implementation notes: "Agents MUST NOT add `SemanticPageModel.services` back." |
| No migration shim or deprecated alias | **pass** | No shims, no aliases, no `@deprecated` period. |
| Breaking change acknowledged | **pass** | Risks section: "SemanticPageModel.services removal is a breaking change." |
| All consumers identified | **fail** | The RFC says "the only consumers are `jsonld/service.ts`, `jsonld/context.ts`, `jsonld/webpage.ts`, and `home-page.ts`" but misses `jsonld.ts` (top-level) which reads `context.page.services` at line 40. |

### Findings

- **D-1 (fail):** `jsonld.ts` (top-level) is a consumer of `page.services` that is not identified in the Risks section or the file system responsibilities table. `buildJsonLd()` constructs `servicesListNode` from `context.page.services` — this will break when the field is removed.

---

## Axis E — Operational completeness

| Item | Result | Notes |
| --- | --- | --- |
| Command scope correct | **pass** | App-scoped — reads `business/{lang}/services/*.md` from app content directories. |
| Pipeline wiring identified | **pass** | `APPS_BUILD_CHECK_PIPELINE` — correct pipeline. |
| `--json` output shape documented | **pass** | Pass and fail examples provided with `servicesProjected`, `services`, `violations` fields. |
| Exit code behavior specified | **partial** | The failure JSON example shows `status: "fail"` but the RFC doesn't explicitly state the exit code (non-zero on fail, zero on pass). The output format section implies it but doesn't state it. |
| Warn-vs-fail behavior for each rule | **partial** | The RFC lists 4 validation rules (missing-name, duplicate-slug, duplicate-ids, ambiguous-source) but doesn't specify which are fail-hard vs. warn. Are all 4 blocking? Is `ambiguous-source` (orphan `services.md` alongside `services/`) really blocking, or advisory? |
| New-app compliance | **pass** | No services directory → no violations. New apps automatically comply. |
| Existing app adoption | **pass** | warpgogol-com and nicaragua-projekt both pass with no services content. |

### Findings

- **E-1 (partial):** Exit code behavior is implied but not explicitly stated.
- **E-2 (partial):** Warn-vs-fail severity is not specified per rule. The RFC should state which of the 4 rules are blocking (fail) and which are advisory (warn).

---

## Axis F — Agent-facing policy

| Item | Result | Notes |
| --- | --- | --- |
| Implementation notes are explicit | **pass** | 7 clear MUST/MAY rules. |
| Status gate enforced | **pass** | "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." |
| RFC-0334 escalation path | **pass** | "If implementation reveals an invariant conflict, run `rfc.supersede.propose`…" |
| RFC-0224 transition preconditions | **pass** | "Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions." |
| Forward-only prohibition explicit | **pass** | "Agents MUST NOT add `SemanticPageModel.services` back." |
| Content authoring boundary clear | **pass** | Phase 5: "out of scope"; NonGoals: "Do not author business service catalog content." |
| `amendedBy` update instruction | **pass** | "Agents MUST update `amendedBy: [RFC-0373]` on RFC-0147 when implementing." |

### Findings

No findings. Agent-facing policy is well-specified.

---

## Axis G — Drift detection (RFC claims vs. codebase reality)

| Claim in RFC | Verified | Result |
| --- | --- | --- |
| `SemanticOrganization.services` declared but never populated | `organization-profile.ts` line 100–153 | **pass** — `buildOrganizationProfile()` does not set `services`. |
| `SemanticPageModel.services` populated only by `buildHomePageSemantic()` | `home-page.ts` line 206–218, 311–320 | **pass** — `extractServices()` is the only populator. |
| `BUSINESS_DOMAIN_VISIBILITY.service = "public"` but no projector | `business-projection.ts` line 28 | **pass** — `service: "public"` exists; no `projectServices()` function. |
| `businessServiceSchema` defines slug, name, category, serviceType, etc. | `packages/business/src/schemas/service.ts` | **pass** — schema matches description. |
| `dispatcher.ts` registers `"services/": businessServiceSchema` | `dispatcher.ts` line 45 | **pass**. |
| `getBusinessServices()` reads `business/{lang}/services/{slug}.md` | `loaders.ts` line 333–337 | **pass**. |
| No `business/{lang}/services/` subdirectory exists | `find_by_name` on `apps/warpgogol-com/src/content/business` | **pass** — only `services.md` orphan file found. |
| RFC-0372 is accepted, not yet implemented | `rfc-0372*.md` frontmatter | **pass** — `status: accepted`. |
| `buildServiceNodes()` reads from `context.page.services` | `jsonld/service.ts` line 31 | **pass**. |
| `servicesListId` derived from `page.services` | `jsonld/context.ts` line 38 | **pass**. |
| `webpage.ts` `mentions` references `page.services` | `jsonld/webpage.ts` line 57 | **pass**. |
| `llms-full.txt` has no `## Services` section | `llms.ts` — `formatServices()` does not exist; org sections are `formatOffer`, `formatLocation`, `formatTeam` | **pass**. |
| `SemanticService.description` is currently `string` (required) | `models.ts` line 146 | **pass** — `description: string` (required). RFC correctly proposes making it optional. |
| "JSON-LD `buildServiceNodes()` and `buildServiceNodes()` read from `context.page.services`" | Context line 68 | **fail** — duplicated function name (typo): `buildServiceNodes()` is listed twice. Should be `buildServiceNodes()` and one other consumer (likely `jsonld.ts` `servicesListNode`). |
| Only consumers are `jsonld/service.ts`, `jsonld/context.ts`, `jsonld/webpage.ts`, and `home-page.ts` | `grep_search` for `page.services` across `packages/` | **fail** — `jsonld.ts` (top-level) also reads `context.page.services` at line 40. |

### Findings

- **G-1 (fail):** Context line 68 has a duplicated function name: "JSON-LD `buildServiceNodes()` and `buildServiceNodes()` read from `context.page.services`" — should name two distinct consumers.
- **G-2 (fail):** The claim that only 4 files consume `page.services` is incorrect — `jsonld.ts` (top-level) is a 5th consumer, reading `context.page.services` at line 40 in the `servicesListNode` construction.

---

## Summary

| Axis | Findings | Severity |
| --- | --- | --- |
| A — Structural completeness | A-1: missing `jsonld.ts` in file table; A-2: risks incomplete | 1 fail, 1 partial |
| B — DNA alignment | B-1: DNA-16 justification indirect | 1 partial |
| C — Ecosystem fit | C-1: no Compass sync; C-2: no AGENTS.md statement | 1 fail, 1 partial |
| D — Forward-only compliance | D-1: `jsonld.ts` consumer not identified | 1 fail |
| E — Operational completeness | E-1: exit code implicit; E-2: severity per rule missing | 2 partial |
| F — Agent-facing policy | — | clean |
| G — Drift detection | G-1: typo; G-2: missing consumer | 2 fail |

**Total: 5 fail, 4 partial, 0 pass-with-notes**

### Critical findings (must fix before acceptance)

1. **`jsonld.ts` is a missing consumer.** The top-level `packages/share/src/semantic/jsonld.ts` reads `context.page.services` at line 40 (`servicesListNode`). The RFC must add it to the file system responsibilities table, the Risks section's consumer list, and the Decision section's removal plan.

2. **Context line 68 typo.** "JSON-LD `buildServiceNodes()` and `buildServiceNodes()`" — duplicated function name. One should be `buildJsonLd()` or the `servicesListNode` in `jsonld.ts`.

### Recommended fixes (should fix before acceptance)

3. **Compass sync.** Add a note identifying `docs/technology.xml` and `docs/verification-plan.xml` as requiring synchronization when implemented.

4. **Validator severity.** Specify which of the 4 `services.projection.validate` rules are blocking (fail) vs. advisory (warn). At minimum, clarify whether `ambiguous-source` (orphan `services.md`) is blocking.

5. **DNA-16 justification.** Strengthen the architectural fit argument: explain that removing the per-page `services` field (populated by a special home-page builder, not from navigation topology) _protects_ DNA-16 by eliminating a divergent parallel model.

### Minor fixes (nice to have)

6. **Exit code.** Explicitly state: exit 0 on pass, exit non-zero on fail.

7. **AGENTS.md.** Add a one-line statement: "No `AGENTS.md` rule changes are required by this RFC."

8. **Risks.** Add agent misinterpretation risk: agents might think Phase 5 content authoring is part of implementation; the RFC should clarify the boundary is already drawn in NonGoals but could be reinforced in Risks.
