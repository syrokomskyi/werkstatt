---
rfcId: RFC-0527
auditId: AUDIT-RFC-0527-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0527

## Verdict: Needs revision

The RFC has a strong architectural core — unified index, braceless syntax, framework-agnostic resolver — but has a mechanical V-24 violation (`satisfies` empty for a post-cutoff architecture RFC), an index key inconsistency between prose and TypeScript/YAML, an unclear relationship between the new `content.ref-index.validate` and the existing `content.references.validate` (updated by RFC-0529), and a sync/async mismatch between the preserved `substituteRefsDeep` walker and the new `resolveReferencesDeep` signature.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-24**: `satisfies` is empty. Architecture RFCs created ≥ 2026-07-07 must declare at least one DNA invariant (RFC-0331). The RFC should declare DNA-4 (canonical content in `src/content/`) and/or DNA-22 (client-editable surface).

## Axis A — Structural completeness

- **CLI surface**: Commands `content.ref-index.generate` and `content.ref-index.validate` are named but exact flags and scope are not documented. Existing commands in this ecosystem use `--site <app-id>` and `--json`; the RFC should show the expected invocation form.
- **Output format**: The `--json` shape for both commands is not documented. The index YAML structure is shown, but the command stdout JSON shape (for CI consumption) is absent.
- **Failure modes**: `REF-01` through `REF-04` diagnostics are described with messages, but exit codes and warn-vs-fail behavior (which diagnostics are errors vs warnings) are not explicitly specified. `REF-04` is described as "warning only" but the others are implicitly errors — this should be stated.
- **Risks**: Agent misinterpretation risk is not mentioned. The braceless syntax introduces ambiguity (any dotted string matching a valid collection could be a reference), which agents authoring content may misinterpret.

## Axis B — DNA alignment

- **`satisfies: []` is empty — V-24 violation.** The RFC body implicitly extends DNA-4 (canonical content in `src/content/`) by unifying reference resolution and DNA-22 (client-editable surface) by enabling content editors to reference data without code changes. These should be declared in `satisfies[]`.
- The RFC does not establish a new DNA invariant — it is an infrastructure change. No new DNA entry needed.
- No conflicts with existing DNA invariants detected.

## Axis C — Ecosystem fit

- **Command duplication with RFC-0529.** RFC-0527 introduces `content.ref-index.validate` (new, scans braceless refs, checks against index, REF-01..04). RFC-0529 updates the existing `content.references.validate` (also scans braceless refs, checks against index, REF-01..04 + REF-05 for residual braces). Both run in `sites-check-author`. The relationship is unclear: does `content.ref-index.validate` replace `content.references.validate`? Do they coexist? If coexisting, they duplicate validation in the same pipeline. The RFC should clarify: either fold the new validation into the existing command, or justify why two separate validators are needed.
- **Compass sync not mentioned.** The RFC changes the `@gogol/share` resolver API (removing Astro dependency, adding `ContentRefIndex` interface). This affects `docs/source-markup.xml` (source-file contracts) and possibly `docs/technology.xml` (shared package contracts). The RFC should identify which Compass files need synchronization.
- **AGENTS.md updates not mentioned.** The RFC changes the content reference resolution architecture documented in `packages/share/AGENTS.md` and `packages/os/site-kernel-content/AGENTS.md`. These should be updated.
- **Pipeline placement**: `sites-check-author` pipeline exists and already contains `content.references.validate` at line 263. The RFC's claim that `content.ref-index.validate` runs in `sites-check-author` is valid.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only: no backward compatibility, no dual-path, no compatibility shim. Legacy brace syntax and Astro-based resolver are removed in RFC-0529, not maintained alongside.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). No self-authorizing language. No content authoring in acceptance criteria — all are code changes.

## Axis F — Pragmatism

- **Index key inconsistency.** Line 84 says `entries[collection.file][lang]` (dot-joined flat key), but the TypeScript interface at line 136 shows `Record<string, Record<string, Record<string, unknown>>>` (3-level nesting: `entries[collection][file][lang]`), and the YAML at lines 189–213 confirms `entries.business.legal.de` (3-level nesting). The prose at line 84 is wrong — it should say `entries[collection][file][lang]`.
- **Command surface**: Two validators (`content.ref-index.validate` + `content.references.validate`) doing nearly the same thing in the same pipeline is not minimal. See Axis C.
- **Scope discipline**: `packagesImpacted` lists 4 packages — all genuinely impacted. `appsImpacted: []` is correct. `nonGoals` are explicit and meaningful. Good.

## Axis G — Blind spots

- **Sync/async mismatch.** The RFC says "The existing `substituteRefsDeep` walker is preserved — only the resolver function changes." But the existing `substituteRefsDeep` in `@/packages/share/src/content/substitute-deep.ts` is **async** (`substituteString: (value: string) => Promise<string>`, returns `Promise<unknown>`). The new `resolveReferencesDeep` signature at line 156–161 returns `unknown` (sync, no `Promise`). If the walker is preserved as-is, `resolveReferencesDeep` must be async. If it's changed to sync, the RFC should say so. This is a design contradiction.
- **`resolveReference` parsing logic.** The function takes `ref: string` (e.g., `"people.andrii-syrokomskyi.name"`) but the RFC doesn't specify how it splits the string into collection/file/field. The existing `parseContentReference` handles brace-delimited refs and is removed in RFC-0529. The RFC should specify the braceless parsing algorithm (how to split `collection.file.field` when file names can contain dots? e.g., `business.legal.companyName` — is `legal` the file or part of the field path?).
- **Pipeline position ambiguity.** "First command in `build-prepare` after `yaml.parse.validate`, before `material.credits.generate`" is ambiguous. The pipeline has ~20 commands between `yaml.parse.validate` (line 20) and `material.credits.generate` (line 65). Does "first" mean immediately after `yaml.parse.validate` (before `kernel.wire`), or just somewhere before `material.credits.generate`? If the index must be available to ALL reference consumers (including `overlay.pages.generate`, `routes.generate`, `agent.knowledge.generate`), it must be immediately after `yaml.parse.validate`. The RFC should specify the exact position.
- **Performance.** `content.ref-index.generate` scans all `.md` and `.yaml` under `src/content/` — file count, parse cost, and I/O patterns are not specified. For sites with large content corpora, this could be a bottleneck.
- **Concurrent execution.** Two builds running simultaneously could conflict on writing `src/content-ref-index.generated.yaml`. Not addressed.
- **Empty state.** New app with no content — the index would be empty. This should be explicitly handled (empty index is valid, all references unresolved).

## Questions for the author

1. What is the relationship between `content.ref-index.validate` (new, this RFC) and `content.references.validate` (existing, updated by RFC-0529)? Do they coexist in `sites-check-author`, or does one replace the other? If they coexist, justify why two validators doing nearly the same thing are needed.
2. Is `resolveReferencesDeep` sync or async? The preserved `substituteRefsDeep` walker is async — if the new resolver is sync, the walker must change. Clarify the return type and whether the walker contract changes.
3. How does `resolveReference` parse a braceless `ref` string like `"business.legal.companyName"` into collection (`business`), file (`legal`), and field path (`companyName`)? File names can contain hyphens and slashes but not dots — is the split always `<collection>.<file>.<rest>` (first two dots are separators, rest is field path)?
