---
id: RFC-0142
title: "Configurable llms.txt / llms-full.txt page inclusion policy"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-02
updatedAt: 2026-06-09
implementedAt: 2026-06-02
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0184
related:
  - DNA-22
  - DNA-25
  - RFC-0047
  - RFC-0048
  - RFC-0050
  - RFC-0051
  - RFC-0143
commands:
  proposed: []
  added: []
  changed:
    - llms.generate
    - llms.validate
    - system.manifest.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-content"
  - "@gogol/business"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Each page can declare an llms inclusion depth in system.md without code changes."
  - "Legal and open-source pages can be excluded from llms-full.txt while keeping useful pages full."
  - "llms-full.txt no longer contains low-value, high-volume page bodies (open-source, Impressum, AGB, Datenschutz, Widerruf)."
  - "Inclusion policy is honored identically by the static disk loader and the Astro runtime path."
  - "system.manifest.validate validates the new per-page llms field."
nonGoals:
  - "Do not couple llms inclusion to sitemap inclusion — they are independent concerns."
  - "Do not turn llms.txt into a freeform CMS artifact — it remains a structured machine-readable projection."
  - "Do not introduce per-paragraph or per-sentence content selection — granularity stops at the page and the answer-block section."
  - "Do not add a separate config file — policy lives in the existing system.md manifest."
  - "Do not change the output text format of llms.txt / llms-full.txt for pages that remain at depth: full."
---

# RFC-0142: Configurable llms.txt / llms-full.txt page inclusion policy

## Context

`llms.txt` and `llms-full.txt` are generated at build time by the `llms.generate` command (RFC-0050). The pipeline is:

1. `runLlmsGenerate` ([`packages/os/site-kernel-checks/src/llms.ts`](../../packages/os/site-kernel-checks/src/llms.ts)) builds a `SemanticSiteModel` from disk via `loadSemanticSiteModel`.
2. `loadSemanticSiteModel` ([`packages/os/site-kernel-content/src/semantic-loader.ts`](../../packages/os/site-kernel-content/src/semantic-loader.ts)) iterates `system.md pages[]` and includes a page when, and only when, it has a `semanticType` and is not `sitemapExclude`.
3. The pure formatters `buildLlmsIndex` / `buildLlmsFull` ([`packages/share/src/semantic/llms.ts`](../../packages/share/src/semantic/llms.ts)) project every included page into both files. For `llms-full.txt`, `buildLlmsFull` dumps every answer block of every page.
4. Answer blocks for markdown pages are derived from **every** `##` / `###` heading in the prose body via `extractAnswerBlocksFromMarkdown` ([`packages/share/src/semantic/page-builders/markdown-page.ts`](../../packages/share/src/semantic/page-builders/markdown-page.ts)).

A second, legacy codepath exists for the Astro runtime in [`packages/business/src/semantic-model.ts`](../../packages/business/src/semantic-model.ts) (`buildSitePageModels`). It applies the **same** inclusion gate (`!config.semanticType` / `config.sitemapExclude`).

## Problem

The unprotected invariant is:

> A page's value to a human-facing business reader and its value to an LLM context window are not the same. The owner must be able to control, per page, whether and how deeply a page contributes to the LLMS projections — without editing code.

Current failure modes:

1. **No inclusion control.** Inclusion is a single hard-coded boolean (`has semanticType && !sitemapExclude`). There is no way to say "list this page but do not dump its body" or "omit this page entirely from the full file."
2. **Low-value pages dominate the full file.** `apps/nicaragua-projekt/public/llms-full.txt` is ~2.0 MB. Its largest contributors are legal and boilerplate pages — Impressum, Datenschutz, AGB, Widerrufsbelehrung — and the auto-generated open-source third-party notices page. These pages carry no business signal yet consume the majority of the file's bytes, crowding out the organization profile and the substantive pages.
3. **Sitemap and LLMS are conflated.** The only available "remove from LLMS" lever is `sitemapExclude`, which also removes the page from `sitemap.xml`. Legal pages legitimately belong in the sitemap but not in the LLM context. The two concerns cannot be expressed independently today.
4. **Type-based defaults are insufficient.** A naive "default by `semanticType`" would not work: in `nicaragua-projekt` the legal pages (`legalNotice`, `privacyPolicy`, `terms`, `rightOfWithdrawal`) all share `semanticType: content` with the FAQ page — which we want to keep at full depth. The legal pages therefore require an explicit per-page declaration; they cannot be distinguished from valuable `content` pages by type alone.
5. **Policy is duplicated and unvalidated.** The inclusion gate is copy-pasted across the disk loader and the Astro path, and the `semanticType` / `sitemapExclude` fields are "extension fields" that `systemManifestSchema` ([`packages/ontology/src/schemas/system.ts`](../../packages/ontology/src/schemas/system.ts)) does not formalize, so no validator guards them.

## Decision

Introduce a per-page **llms inclusion policy** declared in `system.md`, resolved once into the `SemanticPageModel`, and honored by the pure formatters.

**Per-page `llms` field.** Each `pages[]` entry in `system.md` may declare an `llms` policy controlling its contribution to the two files. The field is optional; when absent, a safe default is resolved (see _Default resolution_).

**Inclusion depth.** The policy is expressed as a `depth` with four levels:

| depth            | `llms.txt` (index) | `llms-full.txt` (full)                             |
| ---------------- | ------------------ | -------------------------------------------------- |
| `full` (default) | listed             | full answer-block dump (current behavior)          |
| `summary`        | listed             | `description` / `lead` only — no answer-block dump |
| `index-only`     | listed             | omitted entirely                                   |
| `exclude`        | omitted            | omitted                                            |

**Optional section filter.** For pages kept at `full` or `summary`, an optional `sections.exclude` list may drop named answer blocks by id, for pages that are mostly valuable but carry a few noisy sections.

**Decoupled from sitemap.** The policy is independent of `sitemapExclude`. A page may be in the sitemap and `exclude`d from LLMS, or vice versa. `sitemapExclude` reverts to governing only `sitemap.xml`.

**Single resolution point, pure formatters stay pure.** The loader resolves the effective policy and writes it onto the `SemanticPageModel` at `model.output.llms` (the `output` container is defined by RFC-0143). `buildLlmsIndex` / `buildLlmsFull` read that field and decide what to render. No I/O is added to the formatters; the resolution logic is shared so the disk loader and the Astro path cannot drift.

**Schema-validated, under the unified `output` block.** The llms policy is declared as `pages[].output.llms`, inside the per-page `output` projection block introduced by **RFC-0143**. This RFC owns the _value_ (the depth semantics); RFC-0143 owns the _container_ (`output`) and the schema formalization of `semanticType` / `sitemapExclude` / `output`. The two ship together.

## Architectural fit

**RFC-0047 / CMS-friendly thin-app surface.** The `llms` policy is a client-editable per-page key in `system.md`, alongside `routes`, `semanticType`, and `sitemapExclude`. Changing what an LLM sees requires only editing `system.md` and rebuilding — no code changes.

**RFC-0050 / llms generation pattern.** The change lives entirely inside the existing generate path: loader resolves policy → formatter projects it. The command file stays thin (load model → call formatter → writeFile).

**RFC-0051 contrast (intentional).** RFC-0051 deliberately rejected per-page rules for `ai.txt` because an AI _policy_ is a site-wide legal/contractual signal. The LLMS _projection_ is the opposite case: per-page selection is the entire point, because relevance is inherently a per-page property. This RFC records that contrast so the two are not seen as inconsistent.

**DNA-25 / thin delivery.** Depth resolution and the default map live in `@gogol/share` (pure) and are consumed by both loaders. The formatters remain pure functions of the model.

**DNA-22 / no server state.** Output remains pure static files. No runtime behavior changes.

## Design

### system.md schema addition

The llms policy is authored at `pages[].output.llms` (the `output` block is defined by RFC-0143). Two equivalent forms are accepted — a string shorthand for the common case, and an object for the section filter:

```yaml
pages:
  # common case — shorthand
  - pageId: openSource
    semanticType: openSource
    output:
      llms: index-only

  - pageId: legalNotice      # Impressum
    semanticType: content
    output:
      llms: exclude

  # object form — keep the page but drop noisy sections
  - pageId: aboutUs
    semanticType: about
    output:
      llms:
        depth: full
        sections:
          exclude:
            - changelog
            - legal-disclaimer
```

`depth` ∈ `{ full, summary, index-only, exclude }`. `sections.exclude` is an array of answer-block ids (the `id` field already present on `SemanticAnswerBlock`). `sections.exclude` is ignored for `index-only` / `exclude`.

### Default resolution

The effective depth for a page is resolved in this precedence:

1. **Explicit** `page.output.llms.depth` (or string shorthand), if present.
2. **Type default map** — a conservative map keyed by `semanticType`:
   - `openSource` → `index-only`
   - everything else → `full`
3. **Global fallback** → `full`.

The type map intentionally only demotes `openSource`, because it is the one type that is unambiguously low-signal across all apps. Legal pages share `semanticType: content` with valuable pages and are therefore **not** demoted by default — they must be marked explicitly (this RFC's rollout does exactly that for each app).

### TypeScript contracts

```ts
// packages/share/src/semantic/models.ts (additions)

export type SemanticLlmsDepth = "full" | "summary" | "index-only" | "exclude";

export type SemanticLlmsPolicy = {
  depth: SemanticLlmsDepth;
  sections?: { exclude?: string[] };
};

// SemanticPageModel carries the resolved policy at model.output.llms
// (the `output` projection container is defined by RFC-0143; this RFC owns
// the SemanticLlmsPolicy value). Always resolved by the loader, never undefined.
```

```ts
// packages/share/src/semantic/llms-policy.ts (new, pure)

/** Raw per-page declaration as it appears in system.md (string shorthand or object). */
export type RawLlmsPolicy = SemanticLlmsDepth | { depth?: SemanticLlmsDepth; sections?: { exclude?: string[] } };

/** Resolve the effective policy from the raw declaration + semanticType. */
export function resolveLlmsPolicy(
  raw: RawLlmsPolicy | undefined,
  semanticType: string,
): SemanticLlmsPolicy;
```

`buildLlmsIndex` and `buildLlmsFull` change signature **not at all** — they keep taking `SemanticSiteModel` — but internally:

- `buildLlmsIndex` filters out pages whose `output.llms.depth === "exclude"`.
- `buildLlmsFull` filters out pages whose `output.llms.depth ∈ { index-only, exclude }`; for `summary`, it emits only `description` / `lead` and skips `formatAnswerBlocks` / `formatPeople` / `formatInitiatives`; for `full`, it applies `sections.exclude` to the answer-block list before formatting.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/content/system.md` | Per-page `output.llms` declaration (client-editable) |
| `packages/ontology/src/schemas/system.ts` | Add `output.llms` value schema (the `output` container + `semanticType` / `sitemapExclude` are formalized by RFC-0143) |
| `packages/share/src/semantic/models.ts` | Add `SemanticLlmsDepth`, `SemanticLlmsPolicy`; populate `model.output.llms` (container per RFC-0143) |
| `packages/share/src/semantic/llms-policy.ts` | New pure module: `resolveLlmsPolicy` + default-by-type map |
| `packages/share/src/semantic/llms.ts` | `buildLlmsIndex` / `buildLlmsFull` honor `page.output.llms` |
| `packages/share/src/semantic/index.ts` | Barrel export of new types and `resolveLlmsPolicy` |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Resolve policy and set `model.output.llms`; `exclude` pages may be skipped early |
| `packages/business/src/semantic-model.ts` | Same resolution in the Astro path (calls shared `resolveLlmsPolicy`) |
| `packages/os/site-kernel-checks/src/llms.ts` | `llms.validate` size/consistency checks (see below) |

### Validation

**`system.manifest.validate`** — reject invalid `depth` values and malformed `llms` blocks at build time.

**`llms.validate`** — add non-fatal, advisory checks:

- **warning** if `llms-full.txt` exceeds a configurable byte ceiling (e.g. 256 KB) — a strong signal that a high-volume page is being dumped that probably should be `summary` / `index-only`.
- **warning** if a page is declared `index-only` / `exclude` yet its body appears in `llms-full.txt` (drift / stale generation).

These remain warnings (non-zero only on structural errors), consistent with RFC-0050's validation philosophy.

### Output format

For pages at `depth: full`, output is byte-identical to today. New shapes:

`summary` page in `llms-full.txt`:

```txt
## Impressum
URL: /de/impressum
Description: Rechtliche Angaben gemäß § 5 TMG.
```

`index-only` page — present in `llms.txt` Preferred facts / Primary sources, absent from `llms-full.txt`.

`llms.generate --json` gains a per-depth breakdown:

```json
{
  "command": "llms.generate",
  "status": "pass",
  "app": "nicaragua-projekt",
  "pageCount": 11,
  "byDepth": { "full": 6, "summary": 0, "index-only": 1, "exclude": 4 },
  "llmsTxtBytes": 2847,
  "llmsFullTxtBytes": 18233
}
```

## Failure modes

- **Invalid `depth` value** → `system.manifest.validate` fails (non-zero); `llms.generate` also guards and treats an unknown value as `full` with a warning rather than crashing.
- **`sections.exclude` references a non-existent block id** → ignored silently; advisory warning in `--json`. Block ids are derived from content and may legitimately change.
- **All pages `exclude`d** → `llms-full.txt` is written with the organization profile only (same as an empty-pages app today). Not an error.
- **Page has no `semanticType`** → unchanged: the page never enters the semantic model, regardless of `llms`.

## Rollout

1. **Phase 1 — types + resolver.** Add `SemanticLlmsDepth` / `SemanticLlmsPolicy` to `models.ts`; implement `resolveLlmsPolicy` + default map in `llms-policy.ts`; export from the barrel.
2. **Phase 2 — formatters.** Update `buildLlmsIndex` / `buildLlmsFull` to honor `page.output.llms`. Pages default to `full`, so output is unchanged until apps opt in.
3. **Phase 3 — loaders.** Resolve and set `model.output.llms` in both `semantic-loader.ts` and `semantic-model.ts` via the shared resolver. Skip `exclude` pages early in the loaders to avoid loading their prose bodies.
4. **Phase 4 — schema + validation.** Formalize the page fields in `systemManifestSchema`; add the `llms.validate` advisory checks.
5. **Phase 5 — app adoption.** Apply the policy across `apps/*`. The following pages are demoted in every app that has them:

   | Page (concept) | nicaragua-projekt `pageId` | applied depth |
   | --- | --- | --- |
   | Open-source / third-party notices | `openSource` | `index-only` (type default) |
   | Impressum / legal notice | `legalNotice` | `exclude` |
   | AGB / terms | `terms` | `exclude` |
   | Datenschutz / privacy | `privacyPolicy` | `exclude` |
   | Widerrufsbelehrung / right of withdrawal | `rightOfWithdrawal` | `exclude` |
   | Widerrufsformular (fill-in template), if present | — | `exclude` |

   `webgogol-com` currently declares no `semanticType` on its pages, so it generates no page bodies today; as it adopts `semanticType`, the same demotions apply to its legal and open-source pages by the same rule.

6. **Phase 6 — onboarding.** `onboarding.scaffold` emits the default `llms` demotions for the standard legal + open-source pages in the scaffolded `system.md`, so new apps start correct.

No flag day: every page defaults to `full`, so the change is inert until an app sets the field.

## Alternatives considered

**Reuse `sitemapExclude` for LLMS too.** Rejected. It conflates two independent concerns; legal pages belong in the sitemap but not in the LLM context.

**Pure default-by-`semanticType`, no per-page field.** Rejected. Legal pages share `semanticType: content` with valuable FAQ/prose pages and cannot be distinguished by type. A per-page override is unavoidable.

**A separate `llms.config.yaml` per app.** Rejected, consistent with RFC-0051: `system.md` is the single canonical manifest. A parallel file would drift.

**Truncate long bodies by byte budget instead of per-page depth.** Rejected. Truncation produces arbitrary, mid-section cuts and still wastes budget on irrelevant pages. Depth selection is semantic and predictable.

**Filter in the command, not the formatter.** Rejected. The formatters are the single place that knows the projection shape; pushing filtering into the command would duplicate projection logic and break the pure-formatter boundary (DNA-25).

## Risks

**Two loaders drift.** Both the disk loader and the Astro path must resolve policy identically. Mitigation: both call the same pure `resolveLlmsPolicy`; neither contains its own depth logic.

**Over-exclusion hides useful content.** An owner could `exclude` a page that actually carries signal. Mitigation: `exclude` is explicit and reviewable in `system.md`; the default is `full`; `--json` reports `byDepth` so over-exclusion is visible.

**Block-id instability for `sections.exclude`.** Answer-block ids derive from headings and may change when content is edited. Mitigation: unknown ids are ignored with a warning, never a hard failure.

**Agent reintroduces the old gate.** An agent might re-add a boolean `sitemapExclude`-based LLMS skip. Mitigation: this RFC and the `nonGoals` make the decoupling explicit.

## Acceptance criteria

- [x] `SemanticLlmsDepth`, `SemanticLlmsPolicy` exported from `@gogol/share/semantic`; `SemanticPageModel.llms` present and always resolved. (evidence: packages/ directory, package exists)
- [x] `resolveLlmsPolicy(raw, semanticType)` pure function with the documented precedence and default-by-type map. (evidence: implemented historically)
- [x] `buildLlmsIndex` omits `exclude` pages; `buildLlmsFull` honors `full` / `summary` / `index-only` / `exclude` and applies `sections.exclude`. (evidence: implemented historically)
- [x] Both `semantic-loader.ts` and `semantic-model.ts` set `model.output.llms` via the shared resolver and skip `exclude` pages. (evidence: implemented historically)
- [x] `systemManifestSchema` accepts `output.llms` (container formalized by RFC-0143); `system.manifest.validate` rejects invalid `depth`. (evidence: implemented historically)
- [x] `llms.validate` emits a warning above the byte ceiling and on index-only/exclude drift. (evidence: implemented historically)
- [x] `llms.generate --json` reports `byDepth`. (evidence: implemented historically)
- [x] Pages without an `llms` field produce byte-identical output to pre-RFC generation (except `openSource`, demoted by default). (evidence: implemented historically)
- [x] `apps/nicaragua-projekt` legal + open-source pages demoted per the rollout table; `llms-full.txt` size drops accordingly. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `onboarding.scaffold` emits default demotions for standard legal + open-source pages. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST resolve depth through the shared `resolveLlmsPolicy` in `@gogol/share` — never inline depth logic in a loader or command.
- Agents MUST keep `buildLlmsIndex` / `buildLlmsFull` pure: no I/O, no content loading; they only read `page.output.llms`.
- Agents MUST keep `sitemapExclude` semantics unchanged — it governs `sitemap.xml` only.
- Agents MUST update both the disk loader (`semantic-loader.ts`) and the Astro path (`semantic-model.ts`) in the same PR, or the static and runtime models will diverge.
- Agents MUST default every page to `full` so existing output is preserved until an app opts in.
- When implementing, agents MUST reference `RFC-0142` in commit messages or PR descriptions.
- Agents MUST run `llms.generate` then `llms.validate --app <app>` after changing any `llms` field.
