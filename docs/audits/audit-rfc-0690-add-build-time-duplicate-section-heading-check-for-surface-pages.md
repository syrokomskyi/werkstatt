---
rfcId: RFC-0690
auditId: AUDIT-RFC-0690-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0690

## Verdict: Needs revision

RFC-0690 proposes a well-scoped build-time validator that catches duplicate section headings before the Axiom gate. The core idea is sound and addresses a real pain point (10-minute feedback loop). However, the RFC has several findings: it does not use the canonical `Diagnostic[]` result pattern (RFC-0203), the command name uses a dot convention inconsistent with existing surface validators, the pipeline placement claim references a step number that does not match the actual `SITES_BUILD_POST_PIPELINE` structure, and the HTML parsing approach is underspecified (regex vs parse5).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **TypeScript contracts** (RFC lines 122–135): the signature shows `KernelCommandResult<CheckResult>` but the output format (lines 148–162) shows a custom shape with `diagnostics[]` containing `id`, `severity`, `message`, `fix` fields. This does not match the canonical `Diagnostic` type from `@warpgogol/site-kernel` which uses `ruleId` (not `id`), `severity`, `message`, `file`, `line`, `column`, `fixHint` (not `fix`). The RFC must use `diagnosticsResult()` from `result-helpers.ts` and register `HEADING-UNIQ-01` in `src/diagnostics/rules.ts` — per AGENTS.md rules: "diagnostic.shape.lint fails (DSL-02/03) on unregistered or empty ruleId literals."
- **Output format** (lines 148–162): the `diagnostics[].id` field should be `ruleId`, and `fix` should be `fixHint`. The `summary` shape `{ error, warning, info }` matches `CheckResult.summary` — that part is correct.
- **File system responsibilities** (lines 139–144): "Modified: register command" lists `infra-contracts.ts` as the file to modify. But existing surface validators are registered in `09b-build-artifacts-part2.ts`, and `dist.*` validators are in `09-build-artifacts.ts`. The RFC should specify the correct command table file.
- **Pipeline placement** (line 176): claims "step 8" after `dist.html-structure.validate` (step 7). But `dist.html-structure.validate` is not step 7 in `SITES_BUILD_POST_PIPELINE` — it runs after `text.normalize.apply` and before `...SITES_CHECK_POSTBUILD_PIPELINE` spread. The RFC should reference the actual pipeline structure in `build-post.ts`, not invented step numbers.

## Axis B — DNA alignment

- `satisfies: []` — the RFC does not declare any DNA invariants. This is acceptable for a `kind: command` RFC that adds a validation command without changing architectural invariants. No issues.
- `related: [RFC-0494, RFC-0496, RFC-0684]` — all three are relevant. RFC-0494 (surface expand) and RFC-0496 (service dossier) are the bake function sources. RFC-0684 (suppression layer) is orthogonal. No issues.

## Axis C — Ecosystem fit

- **Command naming**: the RFC proposes `surface.heading-uniqueness.validate`. Existing surface validators follow the pattern `surface.<domain>.validate` (e.g. `surface.hub.validate`, `surface.service.validate`, `surface.media-leakage.validate`). The proposed name fits this pattern. However, the command scans `dist/client/` HTML, not `src/surface/` — `dist.*` validators use the `dist.` prefix (e.g. `dist.html-structure.validate`, `dist.generated-marker.validate`). The RFC should justify why it uses `surface.` prefix instead of `dist.` prefix, or rename to `dist.surface-heading-uniqueness.validate` for consistency with the `dist.*` family.
- **Command table placement**: the RFC says `infra-contracts.ts` should be modified. But `dist.html-structure.validate` is registered in `09-build-artifacts.ts` (line 136), and surface validators are in `09b-build-artifacts-part2.ts`. The new command should be registered in `09-build-artifacts.ts` next to `dist.html-structure.validate` since both scan `dist/client/**/*.html`.
- **Pipeline placement**: the RFC says "added to `build.post` pipeline after `dist.html-structure.validate` (step 7) and before `behavior.snapshot.validate` (step 33)". But `behavior.snapshot.validate` is inside `SITES_CHECK_POSTBUILD_PIPELINE` (spread at line 43 of `build-post.ts`), not a numbered step. The RFC should say: "insert after `dist.html-structure.validate` and before `...SITES_CHECK_POSTBUILD_PIPELINE` spread in `SITES_BUILD_POST_PIPELINE`". Alternatively, since the check scans dist HTML like other postbuild validators, it could be added to `SITES_CHECK_POSTBUILD_PIPELINE` in `sites-check-postbuild.ts` (e.g. after `surface.media-leakage.validate` at the end).
- **`SHARED_WRITE_ALLOWLIST`**: the command is read-only (scans dist HTML, no writes). No allowlist entry needed. No issues.
- **Command lifecycle**: `commands.proposed` lists `surface.heading-uniqueness.validate`, `added` is empty. This is correct for a draft RFC — it will move to `added` upon implementation.

## Axis D — Forward-only compliance

No issues. The RFC introduces a new validator without backward compatibility shims or dual paths. Existing sites with unique headings pass immediately; sites with duplicate headings fail (intended behavior).

## Axis E — Agent-facing policy

- **Status gate**: the RFC is `status: draft` and does not contain self-authorizing language. Implementation notes (lines 203–209) correctly reference the accepted→implemented transition. No issues.
- **Implementation notes** (lines 203–209): reference RFC-0224, RFC-0330, RFC-0334. These are the correct governance rules. No issues.
- **Anti-fabrication**: the acceptance criteria are all code/behavior checks, no content authoring. No issues.
- **Storage policy**: the command is read-only, no persistence changes. No issues.

## Axis F — Pragmatism

- **Minimal command surface**: a dedicated `surface.heading-uniqueness.validate` command is justified. The alternatives section (lines 178–184) honestly evaluates extending `dist.html-structure.validate` (rejected — conflates unrelated concerns) and bake-time validation (rejected — bake functions produce virtual route entries, not HTML). The RFC correctly chooses the post-build HTML scanning approach.
- **Existing patterns**: the RFC does not mention `parse5` which is already a dependency in `package.json` (line 100) and is used by `strip-html-generated-marker.ts`. The RFC should specify whether it will use `parse5` for HTML parsing or regex-based extraction. Given that `dist-html-structure.ts` uses lightweight regex tag counting and `strip-html-generated-marker.ts` uses `parse5`, the RFC should justify its choice. For section heading extraction (finding `<section>` → first `<h2>`/`<h3>` child), `parse5` is more reliable than regex.
- **Scope discipline**: `packagesImpacted` lists only `@warpgogol/site-kernel-checks` — correct. `appsImpacted: []` — correct, no app changes needed. `nonGoals` are meaningful and not boilerplate. No issues.

## Axis G — Blind spots

- **HTML parsing approach**: the RFC says "extract all `<section>` elements and their heading text (first `<h2>` or `<h3>` child)" but does not specify the parsing method. Regex-based extraction of `<section>` → `<h2>`/`<h3>` pairs is fragile (nested sections, whitespace, attributes, comments). The RFC should specify `parse5` (already a dependency) or justify regex. The `dist-html-structure.ts` precedent uses regex for simple tag counting, but heading extraction requires parent-child relationship tracking which regex cannot do reliably.
- **Surface route identification**: the RFC says "Read dist/client/ HTML files for surface routes (identified by surface.generate output)". But `surface.generate` produces `src/surface.generated.yaml` — the RFC should specify how it maps surface route entries to dist HTML files. The `surface-media-leakage-validate.ts` precedent loads the surface artifact (`ARTIFACT_FILE` from `surface/shared.ts`) and matches `VirtualRouteEntry` paths to HTML files. The RFC should reference this existing pattern.
- **False positives from repeated headings**: the RFC mentions FAQ pages (line 188) but the mitigation ("only looks at `<section>` headings") is incomplete. Some surface pages may have multiple `<section>` elements with the same heading text by design (e.g. repeated CTA sections with "Kontakt" heading). The RFC should describe whether this is a real risk for surface pages and how to handle it (e.g. suppress specific sections by role or class).
- **Performance**: the RFC claims "<1 second" for ~150 HTML files. This is reasonable for regex but may be slower with `parse5`. The RFC should specify the expected parsing method and re-estimate if using `parse5`.
- **Multilingual pages**: the RFC correctly states that all language variants are checked. No blind spot here.

## Questions for the author

1. Will the command use `parse5` (already a dependency, used by `strip-html-generated-marker.ts`) or regex-based extraction? If regex, how does it handle nested `<section>` elements and whitespace variations when extracting the first `<h2>`/`<h3>` child of each `<section>`?
2. Should the command be named `surface.heading-uniqueness.validate` (surface family) or `dist.surface-heading-uniqueness.validate` (dist family)? It scans `dist/client/**/*.html` like other `dist.*` validators, but checks a surface-specific concern. Which naming convention takes precedence?
3. How does the command identify which dist HTML files are surface pages? Will it load the surface artifact (`src/surface.generated.yaml`) and match `VirtualRouteEntry` paths to HTML files, following the `surface-media-leakage-validate.ts` pattern? Or will it scan all HTML files and only report duplicates on pages that have surface route entries?
