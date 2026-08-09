---
rfcId: RFC-0781
auditId: AUDIT-RFC-0781-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0781

## Verdict: Needs revision

The RFC correctly identifies the locale-blind entity index bug and proposes a sound fix (locale-aware `Map<id, Map<locale, PbpEntity>>` + shared `deepMerge` with JSON Merge Patch semantics). However, two findings need addressing before implementation: the `PbpValidationError` interface lacks a `locale` field that the RFC's own error objects use, and a behavior change for default-locale compilation is not documented.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **`PbpValidationError` interface mismatch**: The RFC's `buildEntityIndex` code (line 223) adds `locale: entity.locale` to the error object for `PBP-ID-LOCALE-DUPLICATE`. However, `PbpValidationError` at `packages/werkstatt-site/src/domain/pbp/validation-errors.ts:60-66` has no `locale` field — only `code`, `severity`, `entityId?`, `path?`, `message`. The RFC must either extend the interface with `locale?: string` or fold the locale into the `message` string. The RFC does not mention this interface change in the file system responsibilities table.
- All required sections are present and contain real content. Decision is present tense. File system responsibilities table names concrete paths. Failure modes specify error codes. Alternatives are honest. Acceptance criteria are checkable and sufficient.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-11]` (Language mirroring) is a real alignment — the RFC fixes the compiler bug that prevented proper language mirroring of PBP entities. The RFC body explains how (lines 148-149). No new DNA invariant is established, so no `architecture-dna.md` update needed. `related[]` entries (DNA-4, RFC-0466, RFC-0467, RFC-0471) are all relevant.

## Axis C — Ecosystem fit

No issues. All changes are within `packages/werkstatt-site` (package boundaries respected). The RFC correctly identifies that `pipeline.ts` is the only consumer of `buildEntityIndex` output (verified: `pipeline.ts:46` passes `index` to `resolveLocales` at line 49). The `entityIndex` field in `PbpCompilerResult` remains `Map<string, PbpEntity>` (it's set to `resolved` at `pipeline.ts:93`, not the intermediate locale-aware index) — consumers like `loadTargetCurrencies` continue to work. No CLI surface change. No Compass XML sync needed (internal compiler fix). No AGENTS.md updates needed.

## Axis D — Forward-only compliance

No issues. The RFC explicitly states "No backward compatibility" (line 402). UK files are rewritten in-place. Old `PBP-ID-DUPLICATE` error code is replaced by `PBP-ID-LOCALE-DUPLICATE`. No shims, bridges, or dual-paths.

## Axis E — Agent-facing policy

No issues. The RFC has `status: draft` and contains no self-authorizing language. Implementation notes reference the correct governance rules (RFC-0224 for accepted→implemented transition, RFC-0330 for verification evidence, RFC-0334 for supersede escalation). No NEEDS CLARIFICATION markers. No storage policy concerns (no persistence involved).

## Axis F — Pragmatism

- **`findDiffPaths` extraction status unclear**: The RFC extracts `deepMerge` to a shared utility (Part 4) but does not mention `findDiffPaths`, which is also defined locally in `locale.ts:99-129`. Since `findDiffPaths` is only used in `locale.ts` (not in `loaders.ts`), keeping it local is correct. However, the RFC should explicitly state that `findDiffPaths` remains local to `locale.ts` to avoid confusion during implementation.
- The shared `deepMerge` is the right approach — two divergent implementations are consolidated. The `isPlainObject` guard using `Object.prototype.toString.call(value) === "[object Object]"` is more robust than the current `locale.ts` version (which doesn't check for class instances). Good.
- `appsImpacted` and `packagesImpacted` are correctly scoped. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

- **`PbpValidationError` interface extension not in file system table**: The file system responsibilities table (lines 380-391) does not list `validation-errors.ts` as a modified file. If the `locale` field is added to the error object, the interface must be extended. This is a blind spot — the implementation will hit a TypeScript error when adding `locale` to the error object without extending the interface.
- **Behavior change for default-locale compilation**: When `locale === defaultLocale`, the current `resolveLocales` (`locale.ts:29-37`) copies all entities from the locale-blind index, including entities that exist only in non-default locales. The new `resolveLocales` code (RFC lines 258-262) uses `baseEntity ?? overlayEntity` where both look up `defaultLocale` — entities existing only in non-default locales will be excluded. This is arguably correct (when compiling the default locale, you only want default-locale entities), but it is a behavior change that the RFC does not explicitly document in the Rollout or Failure modes sections.
- **`loaders.ts` `isPlainObject` difference**: The `loaders.ts` `isPlainObject` (line 45-47) does not check `Object.prototype.toString.call(value) === "[object Object]"`, while the RFC's shared utility does. This means the shared `deepMerge` will behave differently for class instances (e.g., `Date` objects) — the `loaders.ts` version would deep-merge them (treating them as plain objects), while the shared version would replace them wholesale. This is actually more correct, but the RFC should note this behavior change for `loaders.ts` consumers.

## Questions for the author

1. Should `PbpValidationError` be extended with `locale?: string`, or should the locale be folded into the `message` string? The file system responsibilities table does not list `validation-errors.ts` as modified.
2. Is the behavior change for default-locale compilation intentional — entities existing only in non-default locales (e.g., only in `uk`) will be excluded when compiling the default locale (e.g., `de`)? If so, this should be documented in the Rollout section.
3. Should `findDiffPaths` remain local to `locale.ts`, or should it also be extracted to the shared utility? The RFC is silent on this.
