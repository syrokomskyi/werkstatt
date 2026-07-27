---
rfcId: RFC-0529
auditId: AUDIT-RFC-0529-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0529

## Verdict: Needs revision

The RFC has a clear scope (migrate brace syntax to braceless, remove legacy resolvers) and correctly identifies all three resolver implementations and their consumers. However, it has a mechanical V-24 violation (`satisfies` empty for a post-cutoff RFC), an incomplete `packagesImpacted` list, a YAML migration algorithm that risks data corruption, an ambiguous relationship between the new `content.ref-migrate` command and the migrator registry (RFC-0479), and an unaddressed sync/async mismatch between the preserved `substituteRefsDeep` walker and the new `resolveReferencesDeep` signature.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate` reported no violations targeting this RFC.

## Axis A — Structural completeness

- **`satisfies` is empty.** Frontmatter line 25: `satisfies: []`. Per V-24, post-cutoff RFCs with `kind: policy` and `scope: workspace` that change packages must declare at least one satisfied requirement or explicitly state `satisfies: []` with a justification comment. The RFC changes `@gogol/share`, `@gogol/site-kernel-content`, `@gogol/site-kernel-checks`, `@gogol/site-kernel-codegen`, and `@gogol/ui` — it is not a no-op policy. Either populate `satisfies` or add a `satisfiesNote` explaining why it is empty.
- **`packagesImpacted` is missing.** The RFC frontmatter has no `packagesImpacted` field. RFC-0527 (the companion) includes it. The RFC body explicitly modifies five packages across the removal table (§Decision 3) and consumer table (§Decision 2). Add `packagesImpacted` listing all affected packages.
- **`appsImpacted` is missing.** The RFC runs `content.ref-migrate` on all sites and updates validators in the author/postbuild pipeline. While no `apps/*` source is directly edited, all sites are impacted at the content level. Consider declaring `appsImpacted: ["*"]` or noting the content migration scope.
- **`versionBump: minor` is correct.** The RFC removes public exports (`substituteContentReferences`, `parseContentReference`, `resolveContentReference`, `substituteContentReferencesInData`) from `@gogol/share` and `@gogol/site-kernel-content` — this is a Breaks-B change requiring `minor` per RFC-0478.
- **No `migrators` declared.** The RFC proposes `content.ref-migrate` which mutates content files across all sites. Per RFC-0479, content migrations that transform existing data should be registered in the migrator registry with a 1:1 RFC-to-migrator mapping. The RFC does not mention the migrator registry or declare a migrator. See Axis C.

## Axis B — DNA alignment

- **DNA-20 (PBP canonical business layer).** The RFC references `business.legal.companyName` and `business.offer.price.monthly` in examples — these are PBP entity fields. The migration must preserve PBP reference semantics. No conflict, but the RFC should note that PBP references (e.g. `business-profile.offerings/digital-foundation.price`) with hyphens and slashes in collection/file segments are covered by the migration regex.
- **Forward-only discipline (RFC-0478).** The RFC explicitly states "No backward compatibility" and "Brace-delimited references are removed, not deprecated." This aligns with DNA forward-only policy. The alternatives section correctly rejects dual-syntax support.
- **No DNA invariant conflicts identified.** The RFC does not establish new DNA invariants or modify existing ones. It removes code and migrates content — no invariant is violated.

## Axis C — Ecosystem fit

- **Migrator registry (RFC-0479) not addressed.** The RFC proposes `content.ref-migrate` as a standalone command in `@gogol/site-kernel-codegen`. However, RFC-0479 establishes that content migrations are handled through the migrator registry (`packages/os/site-kernel-handoff/src/migrators/registry.ts`) with `mission.migrate` as the execution step. The RFC should either:
  - (a) Register `content.ref-migrate` as a migrator in the registry (migrator-id = `RFC-0529`), executed via `mission.migrate` during site materialization, or
  - (b) Explicitly justify why this is a one-time codegen command rather than a registered migrator (e.g. "this migration runs once across all sites and is not part of the per-site mission lifecycle").
  - The current framing as a `@gogol/site-kernel-codegen` command is ambiguous — is it a generator (idempotent, content-driven) or a migrator (registered, mission-executed)?
- **Relationship to RFC-0527 unclear in one area.** The RFC says `@gogol/share/content-reference.ts` is removed and a "new module" re-exports the new resolver from `@gogol/share/content-reference`. But RFC-0527 defines the index-based resolver in `@gogol/share` (per its `packagesImpacted`). Which package owns the new `resolveReferencesInString` / `resolveReferencesDeep` API? Is `@gogol/share/content-reference.ts` deleted and replaced, or is the path reused for the new resolver? The RFC says both "Removed" (§Decision 3 table) and "new resolver re-exported from `@gogol/share/content-reference` (new module)" (§Decision 3, line 96). This is contradictory — clarify whether the file path is reused or a new path is created.
- **`content-assets.ts` credit loading.** The RFC says `content-assets.ts` currently has "None (raw YAML)" as its resolver and will gain `resolveReferencesDeep`. Verified: `content-assets.ts` exports `contentAssetCredits` (raw YAML glob), and `material-credits.ts` parses it via `creditByTarget`. The RFC's claim is accurate — credit YAML is not currently passed through a reference resolver. The migration is valid.
- **`material-metadata-write.ts` claim.** The RFC says this file currently has "None" as its resolver and will gain `resolveReferencesDeep` "via RFC-0528". Verified: the file reads `.credits.yaml` sidecars and does not resolve references. The dependency on RFC-0528 for this consumer is noted but RFC-0528's scope (media metadata embedding) is separate — clarify whether RFC-0528 actually adds reference resolution to this file or whether RFC-0529 owns that change.

## Axis D — Forward-only compliance

- **No backward compatibility layers.** The RFC removes three files and does not provide shims. `@gogol/share/index.ts` re-export is removed. This is compliant.
- **`@gogol/share/index.ts` deprecated barrel.** The root barrel currently re-exports `content-reference.ts` with a `@deprecated` comment (line 90-91). The RFC says to "remove re-export from `@gogol/share/index.ts`" — this is correct. The deprecated barrel shrinks, which is the intended direction.
- **No dual-path.** The RFC does not propose running old and new resolvers in parallel. Validators are updated, not extended with fallback logic. Compliant.
- **Project may not compile between RFC-0527 and RFC-0529.** The RFC explicitly accepts this (line 205). This is forward-only compliant — no intermediate compatibility state is maintained.

## Axis E — Agent-facing policy

- **Implementation notes are clear.** The RFC includes agent-facing guidance: idempotency requirement, no backward compatibility, `substituteRefsDeep` and `resolveFieldPath` preserved, invariant conflict escalation via `rfc.supersede.propose`.
- **Migration command idempotency.** The RFC states the migration command MUST be idempotent. The algorithm (find braces, remove them) is naturally idempotent — re-running on braceless files finds no matches. This is correct.
- **Missing: test coverage guidance.** The RFC does not mention test updates. Existing tests for `substitute-references-in-string.ts` and `substitute-deep.ts` (in `packages/share/src/tests/`) will break when files are deleted. The RFC should note which test files are removed and which new tests are required for the index-based resolver.
- **Missing: Compass scaffolding.** If a new resolver module is created (e.g. in `@gogol/share`), it must carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42). The RFC does not mention this.

## Axis F — Pragmatism

- **YAML migration algorithm has a data-corruption risk.** The RFC's migration algorithm (§Design) says: for pure-reference strings like `name: "{people.andrii.name}"`, the result is `name: people.andrii.name` (YAML plain scalar, quotes removed). However, YAML plain scalars with dots are parsed as strings — this is fine. But if the reference contains characters that are special in YAML plain scalars (e.g. `:`, `#`, `[`, `{`, `,`, `?`, `*`, `&`, `!`, `|`, `>`, `@`, `` ` ``), the unquoted value would be misinterpreted. The regex `\{([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\}` restricts to `[a-z0-9-/]` in the file segment and `[a-zA-Z0-9_.-]` in the field path — none of these are YAML-special in plain scalar context. The risk is low but should be acknowledged.
- **Mixed-string false positives.** The RFC acknowledges this risk (line 182) and mitigates with `REF-04` warning. This is pragmatic.
- **13-step rollout is well-sequenced.** The rollout plan (§Rollout) has a logical order: implement command → run migration → update consumers → update validators → remove old code → validate. This is executable by an agent without ambiguity.
- **`content.ref-migrate` in `@gogol/site-kernel-codegen`.** Placing a content-mutating command in the codegen package is reasonable — it follows the pattern of other generators. However, the codegen package's AGENTS.md says generators must be "content-driven" and "idempotent" — the migration command satisfies both. No issue.

## Axis G — Blind spots

- **`inferLanguageFromPath` function.** The RFC removes `@gogol/share/content-reference.ts` which exports `inferLanguageFromPath`. This function is used by the Astro-based resolver for language inference. The new index-based resolver (RFC-0527) must handle language inference. Does it? RFC-0527's success signals mention language-qualified entries in the index, but the RFC does not explicitly state that `inferLanguageFromPath` is no longer needed or is moved. Check whether any other consumer imports `inferLanguageFromPath` from `@gogol/share`.
- **`parseContentReference` consumers.** The RFC removes `parseContentReference` from `@gogol/share/content-reference.ts`. The validator `content-references.ts` in `site-kernel-checks` has its own `parseLocalReference` function — it does not import from `@gogol/share`. But the RFC should verify no other package imports `parseContentReference` or `ContentReference` type from `@gogol/share`.
- **`substituteContentReferencesInData` consumers.** The RFC removes this function. Who calls it? The RFC's consumer table does not list it. Check whether `@gogol/share/astro/page-handler` or any other Astro-dependent module calls `substituteContentReferencesInData` for block-prop substitution (RFC-0138 use case).
- **`REFERENCE_PATTERN_SOURCE` export.** `substitute-references-in-string.ts` exports `REFERENCE_PATTERN_SOURCE` and `ParsedReference` interface. Are these imported by any other module? If so, their removal will break imports.
- **Test files.** `packages/share/src/tests/substitute-references-in-string.test.ts` and `substitute-deep.test.ts` exist. The first will fail when its target module is deleted. The second should survive (substitute-deep.ts is preserved). The RFC does not mention test cleanup.
- **Markdown body references.** The RFC's migration algorithm targets frontmatter / YAML string values. But content references also appear in **prose markdown bodies** (e.g. `{business.legal.companyName}` in `.md` body text). The `prose-pipeline.ts` and `section-rich.astro` consumers call `substituteContentReferences(body, ...)` on the markdown body. The migration command must also scan and migrate brace references in markdown bodies, not just frontmatter. The algorithm description says "for each string value in frontmatter / YAML" — this misses prose bodies. This is a significant blind spot.
- **`dist.content-references.validate` pattern.** The current implementation scans for `{word.word...}` brace tokens. The RFC says it should also scan for "braceless patterns that leaked into HTML." But detecting unresolved braceless references in rendered HTML is fundamentally harder — `business.legal.companyName` in HTML could be a literal string, not a failed reference. The RFC does not explain how this disambiguation works.

## Questions for the author

1. **Migrator registry:** Should `content.ref-migrate` be registered as a migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` (per RFC-0479), or is it a one-time codegen command outside the mission lifecycle? If the latter, justify why the migrator registry does not apply.
2. **Markdown body migration:** The migration algorithm targets "frontmatter / YAML string values" but content references also appear in prose markdown bodies (`.md` body text, not frontmatter). Will `content.ref-migrate` scan and migrate brace references in markdown bodies? If not, how are body references migrated?
3. **`@gogol/share/content-reference.ts` fate:** The RFC says the file is "Removed" (§Decision 3 table) but also says "new resolver re-exported from `@gogol/share/content-reference` (new module)" (line 96). Is the file path reused for the new resolver, or is it deleted and a new path created? Clarify the final state of this path.
4. **`inferLanguageFromPath` and `substituteContentReferencesInData` consumers:** Have all consumers of these removed exports been identified? Specifically, does `@gogol/share/astro/page-handler` or any block-prop substitution path call `substituteContentReferencesInData`?
5. **`dist.content-references.validate` braceless detection:** How will the post-build validator distinguish an unresolved braceless reference (e.g. `business.legal.companyName` literally in HTML) from a literal string that happens to match the pattern? What is the false-positive mitigation?
