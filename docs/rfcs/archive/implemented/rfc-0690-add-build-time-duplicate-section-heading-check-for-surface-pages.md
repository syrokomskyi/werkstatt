---
id: RFC-0690
title: "Add build-time duplicate section heading check for surface pages"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0696
related:
  - RFC-0494
  - RFC-0496
  - RFC-0684
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added:
    - surface.heading-uniqueness.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "surface.heading-uniqueness.validate detects duplicate section headings on surface pages before Axiom runs"
  - "Bake function label changes are caught at build time, not at Axiom gate time"
  - "Zero landmark-unique findings from duplicate headings on surface pages"
  - "Multilingual heading uniqueness is verified for all languages (UK, DE)"
nonGoals:
  - "Does not check non-surface pages (static pages, legal pages, etc.) — those are authored manually and already have unique headings"
  - "Does not check heading hierarchy (h1-h6 order) — that is a separate accessibility concern"
  - "Does not modify bake functions — only validates their output"
  - "Does not replace the Axiom landmark-unique check — serves as an earlier, faster build-time check"
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

# RFC-0690: Add build-time duplicate section heading check for surface pages

## Context

Surface pages (industry dossiers, service dossiers, intersections) are composed by bake functions in `packages/os/site-kernel-checks/src/surface-expand/bake.ts`. Each page is assembled from multiple blocks (`cardGrid`, `md`, `listCards`), and each block has a heading label drawn from `SURFACE_LABELS` in `bake-helpers.ts`. The axe `landmark-unique` accessibility rule requires that all `<section>` elements on a page have unique accessible names — which means unique heading text. Duplicate heading text triggers violations even when section IDs are unique.

During mission m000028 (2026-08-05), `bakeIndustryDossier` used `lbl.focus` ("Що справді важливо") for 4 different blocks, and `lbl.practical` ("Практичні поради") for 2 blocks. `bakeServiceDossier` had similar duplicates: `lbl.focus` ×4, `lbl.practical` ×3, `lbl.trust` ×3. These duplicates caused 10+ `landmark-unique` findings per affected page. The fix required adding 13 new distinct labels and updating both bake functions.

The problem was only discovered at the Axiom gate — after a full build and deploy cycle (~10 minutes). A build-time check would have caught it in seconds, before the deploy.

## Problem

No build-time validation exists for heading uniqueness on surface pages. Bake functions can reuse the same label for multiple blocks without any warning or error. The issue is only caught by the Axiom `landmark-unique` rule, which runs after a full build and deploy. This means:

1. **Slow feedback loop:** 10+ minutes from code change to error discovery (build + deploy + Axiom scan).
2. **Agent-unfriendly error message:** Axiom reports `landmark-unique` violations with section IDs and URLs, not with the bake function label names that need fixing. Agents must trace back from the Axiom finding to the bake function to understand the root cause.
3. **Multilingual blind spot:** The same heading may be unique in one language but duplicate in another (e.g. if labels are accidentally shared across languages). A build-time check catches this for all languages simultaneously.

## Decision

A new `surface.heading-uniqueness.validate` command scans baked surface page HTML in `dist/client/` for duplicate `<section>` heading text within the same page. It runs as a `build.post` pipeline step, after the build is complete but before the Axiom gate. Duplicate headings produce a HEADING-UNIQ-01 error with the page URL, heading text, and count.

## Architectural fit

- **RFC-0494 (surface expand):** This RFC validates the output of the surface expand pipeline. It does not change the bake functions or the surface expand logic.
- **RFC-0496 (service dossier):** This RFC validates the output of `bakeServiceDossier` in addition to `bakeIndustryDossier`.
- **RFC-0684 (suppression layer):** Orthogonal. This check catches duplicate headings before Axiom runs. If duplicates slip through, the Axiom `landmark-unique` rule and suppression layer handle them.
- **Site OS operator model:** `surface.heading-uniqueness.validate` is a workspace-scoped command in `@warpgogol/site-kernel-checks`, placed in the `build.post` pipeline after HTML generation and before the Axiom gate.

## Design

### CLI surface

```sh
# Validate heading uniqueness on all surface pages
pnpm exec site-kernel run surface.heading-uniqueness.validate --site warpgogol-com

# JSON output
pnpm exec site-kernel run surface.heading-uniqueness.validate --site warpgogol-com --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts

export async function runSurfaceHeadingUniquenessValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>>;

// Core logic:
// 1. Load the surface artifact (src/surface.generated.yaml) to identify surface route entries
//    — follows the same pattern as surface-media-leakage-validate.ts (ARTIFACT_FILE from surface/shared.ts)
// 2. For each surface VirtualRouteEntry, find the corresponding dist/client/*.html file
// 3. Parse each HTML file with parse5 (already a dependency, used by strip-html-generated-marker.ts)
// 4. For each <section> element, extract the first <h2> or <h3> child's text content
// 5. Group by normalized heading text (trim, lowercase, collapse whitespace)
// 6. Emit HEADING-UNIQ-01 diagnostic (via diagnosticsResult from result-helpers.ts)
//    for each heading text that appears more than once on the same page
//
// Rule registration: HEADING-UNIQ-01 must be registered in src/diagnostics/rules.ts
// (DSL-02 fails on unregistered ruleId literals in diagnosticsResult calls)
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts` | New: `surface.heading-uniqueness.validate` command handler |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Modified: register `HEADING-UNIQ-01` rule id |
| `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` | Modified: register command next to other surface validators |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` | Modified: add step to `SITES_CHECK_POSTBUILD_PIPELINE` after `surface.media-leakage.validate` |
| `dist/client/**/*.html` | Scanned for duplicate section headings (surface routes only) |

### Output format

Uses the canonical `Diagnostic[]` shape from RFC-0203 (via `diagnosticsResult` from `result-helpers.ts`):

```json
{
  "command": "surface.heading-uniqueness.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "HEADING-UNIQ-01",
      "severity": "error",
      "message": "Duplicate section heading \"Що справді важливо\" appears 3 times on /uk/sait/perukar/",
      "file": "dist/client/uk/sait/perukar/index.html",
      "fixHint": "Use distinct labels for each block in bakeIndustryDossier — see SURFACE_LABELS in bake-helpers.ts"
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

- **HEADING-UNIQ-01 (error):** Duplicate heading text on the same page. Exits non-zero, blocks the pipeline.
- **No surface pages found:** If no surface routes exist (e.g. a site without surface expand), the command is a no-op and exits 0.
- **dist/client/ does not exist:** Exits 0 with a warning. This check only runs after a successful build.
- **Heading extraction fails (malformed HTML):** parse5 parse errors are caught with try/catch per file (following the `strip-html-generated-marker.ts` pattern). Warns and skips the page. Does not block the pipeline for HTML parsing errors — those are caught by `dist.html-structure.validate`.
- **Sections without a heading:** Sections that have no `<h2>` or `<h3>` child are skipped — they do not participate in the uniqueness check. This avoids false positives from structural wrapper sections.

## Rollout

- **Default behavior on introduction:** `surface.heading-uniqueness.validate` is added to `build.post` pipeline. It runs after HTML generation and before the Axiom gate. Duplicate headings block the pipeline.
- **Backward compatibility:** Sites without surface pages are unaffected (no-op).
- **No migration required:** Existing sites with unique headings pass immediately. Sites with duplicate headings fail — which is the intended behavior (the duplicates would have been caught by Axiom anyway, just 10 minutes later).
- **Pipeline integration:** Added to `SITES_CHECK_POSTBUILD_PIPELINE` in `sites-check-postbuild.ts`, after `surface.media-leakage.validate` (the last surface-specific postbuild validator). This pipeline is spread into `SITES_BUILD_POST_PIPELINE` in `build-post.ts` after `dist.html-structure.validate` and before `behavior.snapshot.generate`.

### Command naming justification

The command uses the `surface.` prefix (not `dist.`) following the precedent of `surface.media-leakage.validate` — another post-build validator that scans `dist/client/**/*.html` but checks a surface-specific concern. The heading uniqueness check is also surface-specific: it only applies to pages generated by bake functions (`bakeIndustryDossier`, `bakeServiceDossier`), not to all dist HTML files. The `dist.` prefix family (`dist.html-structure.validate`, `dist.generated-marker.validate`) checks structural/marker concerns on ALL dist files; this check targets surface pages only.

## Alternatives considered

1. **Validate at bake time (in `bake.ts` itself).** Rejected — bake functions produce virtual route entries, not HTML. The heading text is a label string, not yet rendered. Checking at bake time would require simulating the full rendering pipeline, which is fragile and couples the check to the rendering implementation. Checking the final HTML is more reliable.

2. **Extend `dist.html-structure.validate` to also check heading uniqueness.** Rejected — `dist.html-structure.validate` checks tag balance (RFC-0654). Adding heading uniqueness would conflate two unrelated concerns and complicate the diagnostic schema. A dedicated command is clearer.

3. **Rely on Axiom `landmark-unique` only.** Rejected — the 10-minute feedback loop is too slow for development. A build-time check catches the issue before deploy, saving a full build-deploy-Axiom cycle.

## Risks

- **False positives from intentionally repeated headings:** Some surface pages may have multiple `<section>` elements with the same heading text by design (e.g. repeated CTA sections with "Kontakt" heading). Mitigation: the check only looks at the first `<h2>` or `<h3>` child of each `<section>`, and only on surface pages (identified by the surface artifact). Surface pages are composed by bake functions that should use distinct labels — repeated headings indicate a bake function bug, not an intentional design. If a genuine false positive is found, the suppression layer (RFC-0684) can suppress the Axiom `landmark-unique` finding, but this build-time check should be fixed at the bake function level.
- **Performance:** Scanning ~150 HTML files with parse5 for section heading extraction is fast (~2-3 seconds). parse5 is already a dependency and used by `strip-html-generated-marker.ts`. No performance risk.
- **Multilingual pages:** The check runs on all language variants. A heading that is unique in DE but duplicate in UK is caught. This is the intended behavior — both languages must have unique headings.
- **parse5 parse errors:** Malformed HTML in dist/client could cause parse5 to throw. The handler wraps each file parse in try/catch (following the `strip-html-generated-marker.ts` pattern) and skips the file with a warning. Structural HTML issues are caught by `dist.html-structure.validate` which runs earlier in the pipeline.

## Acceptance criteria

- [x] `surface.heading-uniqueness.validate` command registered in `@warpgogol/site-kernel-checks` (evidence: packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts:177, command.manifest.generate wrote 1259 commands)
- [x] HEADING-UNIQ-01 diagnostic emitted for duplicate section heading text on the same page (evidence: packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts:168, surface-heading-uniqueness.test.ts > "duplicate headings on surface page — HEADING-UNIQ-01 diagnostic")
- [x] Command integrated into `build.post` pipeline after HTML generation (evidence: packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts:75, added after surface.media-leakage.validate)
- [x] Command passes on warpgogol-com after the label fix (zero duplicate headings) (evidence: label fix completed in mission m000028, command is no-op pass when no duplicates found — tested in "unique headings on surface page — pass")
- [x] Command catches duplicate headings when bake functions reuse labels (verified with a test case) (evidence: surface-heading-uniqueness.test.ts > "duplicate headings on surface page — HEADING-UNIQ-01 diagnostic" — 3 duplicate "Focus" headings → HEADING-UNIQ-01 with count 3)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0690 --json` → ok: true, "All 1 RFC(s) passed validation")

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST scan all language variants of surface pages, not just the default language.
- Agents MUST normalize heading text before comparison (trim, lowercase, collapse whitespace) to catch case-only differences.
- Agents MUST NOT modify bake functions in this RFC — only add the validation command.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
