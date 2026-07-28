---
rfcId: RFC-0377
planId: PLAN-RFC-0377-01
status: completed
owner: architecture
createdAt: 2026-07-12
updatedAt: 2026-07-12
scope:
  apps:
    - apps/warpgogol-com
  packages:
    - packages/share
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-content
    - packages/ontology
  services: []
  docs:
    - docs/knowledge-graph.xml
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0377

## 1. Objectives

- [x] Extend `@gogol/share` semantic types and frontmatter builder with the new `MarkdownTwinSemanticMeta` contract and derivation maps (maps to RFC acceptance criterion: TypeScript types defined).
- [x] Add optional `audience` field to the ontology system page schema and thread it through the semantic loader into `SemanticPageModel` (maps to: `SemanticPageModel` gains `audience`).
- [x] Restructure `buildPageMarkdown` body output into the five standardized sections (Summary, Business context, Data / APIs, User flows, Constraints) with fallback handling (maps to: body section pattern emitted).
- [x] Update `page.markdown.generate` to emit semantic frontmatter fields and the new schema tag `gogol.markdown-twin@2` (maps to: `page.markdown.generate` threads semantic meta).
- [x] Update `page.markdown.validate` with `MDMETA-08..12` and `MDBODY-01..05` rules (maps to: validator implements new rules).
- [x] Update behavior snapshot to record new frontmatter fields and regenerate twins for `apps/warpgogol-com` (maps to: existing apps pass validation).
- [x] Sync `docs/knowledge-graph.xml` and `docs/verification-plan.xml` with the new contract and validation rules (maps to: Compass docs updated).

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/semantic/markdown-twin-provenance.ts` — extend `MarkdownTwinProvenance` with `semantic?: MarkdownTwinSemanticMeta`; bump `DEFAULT_SCHEMA` to `gogol.markdown-twin@2`; update `buildMarkdownTwinFrontmatter` to emit semantic fields and the `tags` list.
- `packages/share/src/semantic/page-markdown.ts` — restructure `buildPageMarkdown` output; add section mapping helpers and Summary fallback chain.
- `packages/share/src/semantic/models.ts` — add `audience?: string` to `SemanticPageModel`.
- `packages/share/src/semantic/index.ts` — export new types and derivation maps.
- `packages/share/src/semantic/build-page.ts` — add `audience?: string` to `SemanticPageBuildArgs` and thread it into the returned model.
- `packages/os/site-kernel-content/src/semantic-loader.ts` — read `page.audience` from the system manifest and pass it to `buildSemanticPageModelWith`; fall back to derivation map when absent.
- `packages/ontology/src/schemas/system/manifest.ts` — add optional `audience: z.string()` to the page pin schema.
- `packages/os/site-kernel-checks/src/page-markdown.ts` — update `runPageMarkdownGenerate` to build and pass `semantic` meta; update `runPageMarkdownValidate` with `MDMETA-08..12` and `MDBODY-01..05` rules.
- `packages/os/site-kernel-checks/src/behavior-snapshot.ts` (or equivalent extractor) — extend twin metadata snapshot to include new semantic fields.
- Site OS commands (no new registration): `page.markdown.generate`, `page.markdown.validate`.

### 2.2 Configuration and data

- `apps/warpgogol-com/src/content/system.md` — optionally add `audience` to selected pages; default derivation covers all pages without changes.
- Generated `public/**/*.md` twins — regenerated with the new frontmatter and body structure during the first `build.prepare` after implementation.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0377-*.md` — read-only reference (already accepted).
- `docs/knowledge-graph.xml` — add/update node description for route Markdown twins to mention the semantic metadata layer.
- `docs/verification-plan.xml` — add the new `MDMETA-08..12` and `MDBODY-01..05` rules to the verification catalog.
- Root `AGENTS.md` — no rule changes, but the existing agent surface section may reference the new twin format if applicable.

### 2.4 Validation and pipelines

- `APPS_BUILD_PREPARE_PIPELINE` — `page.markdown.generate` (unchanged pipeline slot, changed output).
- `apps-check-postbuild` — `page.markdown.validate` (unchanged slot, changed rules).
- `build.check` — `page.markdown.validate` and `behavior.snapshot.validate` (changed expectations).
- CI workflows — unchanged; the existing `pnpm run build:check` path exercises the new rules.

## 3. Step sequence

### Step 1. Extend `@gogol/share` semantic contracts

**Goal:** Define the new semantic metadata types and derivation maps so the rest of the pipeline can consume them.

**Agent actions:**

- Add `MarkdownTwinSemanticMeta` interface and `AUDIENCE_BY_PAGE_TYPE`, `PRIORITY_BY_PAGE_TYPE`, `DOMAIN_BY_PAGE_TYPE` maps in `packages/share/src/semantic/markdown-twin-provenance.ts`.
- Extend `MarkdownTwinProvenance` with `semantic?: MarkdownTwinSemanticMeta` and bump `DEFAULT_SCHEMA` to `gogol.markdown-twin@2`.
- Add `audience?: string` to `SemanticPageModel` in `packages/share/src/semantic/models.ts`.
- Add `audience?: string` to `SemanticPageBuildArgs` in `packages/share/src/semantic/build-page.ts` and thread it into the model.
- Export the new types from `packages/share/src/semantic/index.ts`.

**Validation:**

- `pnpm --filter @gogol/share run build:check` passes.
- `pnpm --filter @gogol/share run test` passes (or adds tests for derivation maps).

**Completion criterion:** The `@gogol/share` package type-checks and exports the new semantic metadata types.

**Human review:** No.

### Step 2. Add `audience` to ontology system schema and semantic loader

**Goal:** Allow per-page `audience` authoring in `system.md` and flow it into the semantic model.

**Agent actions:**

- Add `audience: z.string().optional()` to the page pin schema in `packages/ontology/src/schemas/system/manifest.ts`.
- In `packages/os/site-kernel-content/src/semantic-loader.ts`, read `page.audience` from the system manifest and pass it to `buildSemanticPageModelWith`; if absent, use the derivation map from `@gogol/share/semantic`.

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes.
- `pnpm --filter @gogol/site-kernel-content run build:check` passes.

**Completion criterion:** A page with `audience: "custom"` in `system.md` produces a `SemanticPageModel` with `audience: "custom"`; a page without it falls back to the derivation map.

**Human review:** No.

### Step 3. Restructure Markdown twin body

**Goal:** Update `buildPageMarkdown` to emit the five standardized body sections.

**Agent actions:**

- Rewrite `buildPageMarkdown` in `packages/share/src/semantic/page-markdown.ts` to emit:
  1. `# <title>`
  2. `## Summary` using the fallback chain `page.lead ?? page.description ?? first block summary ?? first block body`.
  3. `## Business context` — blocks that don't clearly map to other sections.
  4. `## Data / APIs` — blocks with `facts` or structured items.
  5. `## User flows` — blocks with CTAs or steps (heuristic based on block type/heading).
  6. `## Constraints` — legal/technical constraint blocks (heuristic).
  7. Optional `## People`, `## Initiatives`, `## FAQ` when present.
- Add a unit test fixture covering a page with lead, blocks, people, and initiatives.

**Validation:**

- `pnpm --filter @gogol/share run test` passes with new body-structure tests.
- Snapshot tests (if any) are updated to match the new output.

**Completion criterion:** The generated body of a representative page (e.g. `/preis/`) contains the required `## Summary` and `## Business context` sections and optional `## Data / APIs` section.

**Human review:** No.

### Step 4. Update `page.markdown.generate` to emit semantic frontmatter

**Goal:** Build the semantic metadata object and pass it to the provenance builder.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/page-markdown.ts`, update `runPageMarkdownGenerate` to:
  - Compute `route` from `page.url` (strip origin).
  - Compute `id` from `pageId` or slug.
  - Derive `domain`, `audience`, `priority` from `@gogol/share/semantic` maps.
  - Set `lang`, `title`, `type`, `metaDescription`, `tags` from `SemanticPageModel`.
  - Set `visibility: "public"` and omit `agentRoles` (reserved for v1).
  - Pass `provenance.semantic` to `buildMarkdownTwin`.
- Regenerate twins for `apps/warpgogol-com` after the change.

**Validation:**

- `pnpm exec site-kernel run page.markdown.generate --app warpgogol-com` succeeds.
- At least one generated twin (e.g. `public/preis.md`) contains the new semantic frontmatter fields and `schema: "gogol.markdown-twin@2"`.

**Completion criterion:** Every generated twin in `public/` has the new semantic frontmatter fields and the `@2` schema tag.

**Human review:** No.

### Step 5. Update `page.markdown.validate` with new rules

**Goal:** Enforce the semantic frontmatter contract and body section presence.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/page-markdown.ts`, extend `runPageMarkdownValidate` to:
  - Check for required semantic fields (`id`, `route`, `title`, `type`, `domain`, `audience`, `lang`, `metaDescription`, `priority`, `tags`) — error `MDMETA-08`.
  - Validate `type` against the closed `SemanticPageType` enum — error `MDMETA-09`.
  - Validate `priority` is a number in `[0.0, 1.0]` — error `MDMETA-10`.
  - Validate `visibility` enum — error `MDMETA-11`.
  - Validate `schema` tag is `gogol.markdown-twin@2` — error `MDMETA-12`.
  - Check body sections: `## Summary` and `## Business context` required (errors `MDBODY-01`, `MDBODY-02`); `## Data / APIs`, `## User flows`, `## Constraints` warned (warnings `MDBODY-03..05`).
- Update the `--json` output shape documentation if needed (it already uses standard violation format).

**Validation:**

- `pnpm exec site-kernel run page.markdown.validate --app warpgogol-com` passes after regenerating twins.
- Intentionally stale twins (if any remain) fail `MDMETA-12`.

**Completion criterion:** `page.markdown.validate` passes for the reference app and correctly reports `MDMETA-08..12` / `MDBODY-01..05` violations on malformed twins.

**Human review:** No.

### Step 6. Update behavior snapshot and regenerate reference app twins

**Goal:** Record the new frontmatter fields in the behavior snapshot and ensure the reference app is compliant.

**Agent actions:**

- Update the behavior snapshot extractor to include the new semantic fields (or at least the `schema` tag) in the twin metadata snapshot.
- Run `pnpm run build:check` for `apps/warpgogol-com` end-to-end (evidence: `warpgogol-com-build-check2.log` shows `page.markdown.validate: 54 twin link(s) ok, 54 twin(s) frontmatter ok`).
- Inspect and commit the regenerated twins and updated behavior snapshot.

**Validation:**

- `pnpm run build:check` for `apps/warpgogol-com` passes (verified via `warpgogol-com-build-check2.log`).
- `behavior.snapshot.validate` reports no drift (or the schema tag bump is documented as expected).

**Completion criterion:** The reference app's `build:check` pipeline is green and the behavior snapshot diff is reviewed/committed.

**Human review:** Yes — the behavior snapshot diff (especially the `@1` → `@2` schema tag change) should be reviewed by `architecture` before the final commit.

### Step 7. Sync Compass documentation

**Goal:** Keep the machine-readable semantic layer synchronized with the code change.

**Agent actions:**

- Update `docs/knowledge-graph.xml` to describe the semantic metadata layer on route Markdown twins.
- Update `docs/verification-plan.xml` to list the new `MDMETA-08..12` and `MDBODY-01..05` validation rules.
- No changes to `docs/source-markup.xml` (generated twins are excluded from Compass coverage).

**Validation:**

- `pnpm exec site-kernel run workspace.surface.validate` (or equivalent XML sync check) passes.
- Manual review of the XML changes for semantic accuracy.

**Completion criterion:** The two Compass XML files accurately reflect the new contract and validation rules.

**Human review:** Yes — Compass XML changes are high-risk semantic documents; review by `architecture` is required.

### Step 8. Final validation and evidence emission

**Goal:** Confirm the RFC acceptance criteria are met and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0377 --json`.
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0377` (RFC-0330) and commit the evidence artifact to `docs/rfcs/verification/`.
- Update the RFC frontmatter `implementedAt` to today's date and `status` to `implemented` (per RFC-0224).
- Commit the final RFC status change.

**Validation:**

- `rfc.validate` passes.
- `rfc.verification.emit` produces the evidence file.
- Reference app `build:check` passes.

**Completion criterion:** RFC-0377 is stamped `implemented` with verification evidence committed.

**Human review:** No — the status transition follows the accepted plan and evidence.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0377`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/share run test`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm --filter @gogol/site-kernel-content run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm exec site-kernel run page.markdown.validate --site warpgogol-com`
- `pnpm run build:check` for `apps/warpgogol-com`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0377` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0377.generated.json` — verification evidence emitted by `rfc.verification.emit`.
- Regenerated `public/**/*.md` twins for `apps/warpgogol-com`.
- Updated behavior snapshot files.
- Commit messages referencing `RFC-0377` in the subject line (RFC-0265).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Body section mapping heuristics may produce empty sections | Step 3 implements the mapping; Step 5 makes non-essential sections warnings, not errors. |
| `audience` derivation may not fit all sites | Step 2 allows per-page `audience` override in `system.md`. |
| Schema tag bump breaks stale twins | Step 4 regenerates all twins; Step 5 validates `MDMETA-12` rejects stale `@1` twins. |
| Agent misinterpretation of `priority` | Compass sync in Step 7 documents the advisory nature of `priority`. |
| `visibility: internal` twins in public directory | Step 4 defaults to `public`; advisory nature documented in RFC Risks and Compass docs. |

## 6. Escalation triggers

- If implementation reveals that the `MarkdownTwinSemanticMeta` contract conflicts with an existing DNA invariant (e.g. DNA-19 closed vocabularies), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0377 --reason "..." --invariant "DNA-19"` instead of working around it.
- If the body section mapping cannot be made deterministic without inventing new `SemanticBlock` fields, escalate to a new RFC rather than adding ad-hoc heuristics.
- If the `page.markdown.validate` false-positive rate exceeds the documented tolerance, pause and refine the heuristics before stamping `implemented`.
