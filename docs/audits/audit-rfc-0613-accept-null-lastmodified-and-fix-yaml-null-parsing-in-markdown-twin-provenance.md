---
rfcId: RFC-0613
auditId: AUDIT-RFC-0613-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0613

## Verdict: Needs revision

The RFC describes three code fixes (parser null handling, MDMETA-02, MDMETA-04) that are **already present in the codebase** — the Context and Problem sections frame them as active bugs, but the code shows they were applied during RFC-0602 implementation. The RFC should be reframed as a formalization amendment + test coverage RFC. Additionally, the file system responsibilities table omits a test file referenced in acceptance criteria, and the TypeScript contract section proposes an interface that doesn't match the actual implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning:
- **V-19** (warning): `RFC-0613.amends` includes RFC-0320, but RFC-0320.amendedBy does not include RFC-0613. The implementation must add RFC-0613 to RFC-0320's `amendedBy` list (RFC-0320 already has `amendedBy: [RFC-0377]`, so the field is editable on archived RFCs).

## Axis A — Structural completeness

- **Context/Problem inaccuracy**: The Context states "page.markdown.validate reported MDMETA-04 errors for all generated markdown twins" and the Problem section says "Two bugs prevent mission.validate from passing." However, all three described fixes are already applied in the code:
  - `parseMarkdownTwinFrontmatter` null handling: `packages/share/src/semantic/markdown-twin-provenance.ts:224` — `frontmatter[key] = stripped === "null" ? null : stripped;` (already present)
  - MDMETA-02 exclusion: `packages/os/site-kernel-checks/src/page-markdown.ts:560` — `frontmatter[field] == null && field !== "lastModified"` (already present)
  - MDMETA-04 null acceptance: `packages/os/site-kernel-checks/src/page-markdown.ts:572-577` — `lastModified != null && typeof lastModified === "string"` guard (already present)
  The RFC should acknowledge that the code fixes were applied during RFC-0602 implementation and reframe itself as: (1) formally amending RFC-0320 to accept `null`, and (2) adding regression tests to prevent future reversal.

- **TypeScript contract mismatch**: The RFC proposes a `MarkdownTwinFrontmatter` interface with `lastModified: string | null` and `[key: string]: string | null`. This interface does not exist in the code. The actual return type of `parseMarkdownTwinFrontmatter` is `Record<string, unknown>`. The proposed interface is unnecessary — the actual type already handles null correctly. This section should describe the actual types (`MarkdownTwinProvenance.lastModified: string | null` and `parseMarkdownTwinFrontmatter` return type `Record<string, unknown>` with null values).

- **File system responsibilities table gap**: The table lists `packages/os/site-kernel-checks/src/tests/page-markdown.test.ts` but omits `packages/share/src/tests/markdown-twin-provenance.test.ts`, which is referenced in acceptance criterion 1. Both test files should be listed.

- **Acceptance criteria evidence gap**: Criteria 1-4 require "evidence: unit test" but no test files exist yet. The criteria are checkable (tests will be created during implementation), but the evidence references should point to files that will exist after implementation, not pre-existing files.

## Axis B — DNA alignment

- **DNA-58 reference is valid but indirect**: DNA-58 (Generated-file content determinism) is about byte-identical regeneration. This RFC supports it indirectly by ensuring the validator accepts the deterministic `null` value. The connection is correctly explained in the Architectural fit section. No issues.

## Axis C — Ecosystem fit

- **Package boundaries correct**: `@warpgogol/share` (parser fix) and `@warpgogol/site-kernel-checks` (validator fix) are the right packages. Import flow `site-kernel-checks → share` is correct.
- **Pipeline placement**: `page.markdown.validate` remains in its existing pipeline position — no change needed. Correct.
- **AGENTS.md update not identified**: The Risks section mentions "agents should be educated via AGENTS.md that null is intentional for generated files" but the RFC does not identify which AGENTS.md file needs this rule. The root AGENTS.md or `packages/os/site-kernel-checks/AGENTS.md` would be the natural home. This should be added to the file system responsibilities or explicitly scoped out in nonGoals.

## Axis D — Forward-only compliance

No issues. The RFC amends RFC-0320 directly (no compatibility shim). The validator change is forward-only — it accepts a new value (`null`) without breaking existing date-string validation.

## Axis E — Agent-facing policy

- **Status gate**: The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes are explicit**: "MUST apply both fixes together", "MUST NOT remove lastModified from required fields", "MUST NOT replace the hand-rolled YAML parser" — all clear behavioral rules.

## Axis F — Pragmatism

- **Minimal command surface**: No new commands — only `page.markdown.validate` is changed. Correct.
- **Alternatives section is honest**: Two real alternatives with rejection reasons (yaml package replacement, making lastModified optional). No issues.
- **Scope discipline**: `appsImpacted: [warpgogol-com]` and `packagesImpacted: [@warpgogol/share, @warpgogol/site-kernel-checks]` are accurate and minimal.

## Axis G — Blind spots

- **No regression tests exist**: The RFC identifies this gap ("This gap is protected by manual discipline only — no test verifies that null is correctly parsed or accepted by the validator"). This is the primary remaining work. The vitest config in `packages/os/site-kernel-checks` requires tests under `src/tests/` (memory: `include: ["src/tests/**/*.test.ts"]`), and `packages/share` discovers tests via `include: ["src/**/*.test.ts"]`. The acceptance criteria test paths are compatible with both configs.
- **Edge case not covered**: The RFC's failure modes section covers missing fields, invalid dates, and non-string types. However, it doesn't address the edge case where `lastModified` is the string `"null"` (quoted in YAML) — this would be parsed as the string `"null"` (not JS `null`) by the parser, and MDMETA-04 would correctly reject it. This behavior is correct but should be documented as an intentional distinction: bare `null` → JS `null` (valid), quoted `"null"` → string `"null"` (invalid date, MDMETA-04 fires).

## Questions for the author

1. **Code already applied**: The three code fixes described in this RFC are already present in the codebase (applied during RFC-0602 implementation). Should the RFC be reframed as a formalization amendment + test coverage RFC, acknowledging that the code changes were already made? This would make the Context/Problem sections accurate and prevent confusion for future readers who see the RFC describing bugs that don't exist.
2. **AGENTS.md rule**: The Risks section mentions educating agents via AGENTS.md that `null` is intentional. Which AGENTS.md file should carry this rule — root, `packages/os/site-kernel-checks/AGENTS.md`, or `packages/share/AGENTS.md`? Or should this be a nonGoal?
3. **V-19 resolution**: Should the implementation add RFC-0613 to RFC-0320's `amendedBy` list (which already contains RFC-0377), or should the `amends` relationship be reconsidered since RFC-0320 is archived?
