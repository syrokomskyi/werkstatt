# Audit: RFC-0914 — Mandatory semantic block IDs for all content sections

- **Date:** 2026-08-21
- **Auditor:** agent
- **RFC:** RFC-0914
- **Status:** draft
- **Kind:** architecture
- **Verdict:** Needs revision

## Summary

RFC-0914 proposes making `blocks[].id` mandatory across all content types, introducing `block.id.validate` and `block.id.generate` commands, and superseding the RFC-0048 anchor registry. The RFC is well-structured and the core proposal is sound. However, seven findings require revision before enhancement and planning.

## Mechanical validation

`rfc.validate` passed for RFC-0914 (no blocking structural/format violations).

## Axis A — Structural completeness

**Verdict: Needs revision (1 finding)**

The RFC has all required sections: Context, Problem, Decision, Architectural fit, Design (CLI, TypeScript contracts, file system, output format, failure modes), Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes.

### A-1: `commands.changed` references non-existent command `onboarding.scaffold`

The RFC lists `onboarding.scaffold` in `commands.changed`. However, `onboarding.scaffold` was **removed in RFC-0532** and replaced by `onboarding.synthesize`. The onboarding module's `CHANGE_SUMMARY` at `packages/werkstatt-site/src/onboarding/module.ts:15` states:

> RFC-0532: Remove brief.validate, onboarding.input.validate, onboarding.phase.validate, onboarding.scaffold, onboarding.checklist. Add onboarding.synthesize for per-system input validation and hashing.

Page scaffolding now happens through templates consumed by `mission.materialize`, not through an `onboarding.scaffold` command. The RFC must update `commands.changed` to reference the correct mechanism (either `mission.materialize`, the template files themselves, or `onboarding.synthesize`).

## Axis B — DNA alignment

**Verdict: Needs revision (2 findings)**

### B-1: RFC claims to remove `anchors` from `systemManifestSchema`, but field does not exist there

The RFC states:

> Agents MUST remove the `anchors` map from `system.md` content and from the `systemManifestSchema` (or its local view)

However, `systemManifestSchema` in `packages/werkstatt-shared/src/ontology/schemas/system/manifest.ts` does **not** have an `anchors` field. The `anchors` field exists only in the runtime `LocalizedRouteEntry` type at `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts:33` and is read dynamically from frontmatter without Zod schema validation. The RFC incorrectly claims the Zod schema has this field.

### B-2: RFC partially supersedes RFC-0048 but does not declare the relationship

The RFC states:

> The `anchors` registry portion of RFC-0048 is superseded.

But the frontmatter has `supersedes: []` and `amends: []`. The RFC partially supersedes RFC-0048 (the anchors registry portion) without formally declaring the relationship. It should either `supersede` RFC-0048 (if the entire RFC is obsolete) or `amend` RFC-0048 (if only the anchors registry portion is removed while route resolution remains).

## Axis C — Ecosystem fit

**Verdict: Needs revision (2 findings)**

### C-1: Compass XML synchronization not identified

The RFC changes shared package contracts (`@warpgogol/werkstatt-shared`, `@warpgogol/werkstatt-site`) and repository-wide content requirements. Per `AGENTS.md`, changes to shared packages and repository-wide requirements should identify which `docs/*.xml` Compass files need synchronization. The RFC does not mention any Compass XML files.

### C-2: Relationship between `block.id.validate` and existing B-05 check in `page.block.validate` is unclear

`page.block.validate` already checks B-05 (duplicate block ids within a page) at `packages/werkstatt-site/src/checks/page-block.ts:274-285`. The RFC proposes a new `block.id.validate` that also checks duplicates. The RFC does not clarify:

- Does B-05 move from `page.block.validate` to `block.id.validate`?
- Do they coexist, creating redundant checks?
- What specific changes to `page.block.validate` are needed (it's listed in `commands.changed` but the changes are not described)?

## Axis D — Forward-only compliance

**Verdict: Pass**

The RFC explicitly states "Full migration — no legacy compatibility" and "no grace period." The `block-N` fallback is removed, not kept behind a flag. The `anchors` registry is removed, not maintained alongside. No compatibility shim or dual-path. Clean forward-only design.

## Axis E — Agent-facing policy

**Verdict: Pass**

- Status gate: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Correct.
- Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Correct.
- No auto-generated content claims. Migration is an explicit operator action.
- No cookies, persistence, or PII concerns.

## Axis F — Pragmatism

**Verdict: Needs revision (1 finding)**

### F-1: "Block" is undefined for non-page content types

The RFC states:

> Every block in every content type (pages, prose, business-profile, faq) MUST have a stable, language-neutral `id` field.

However, DNA-24's block-declarative model applies to **pages only**. Prose files (`src/content/prose/{slug}.{lang}.md`) are markdown body files with headings — they do not have `blocks[]` arrays in frontmatter. Business-profile and faq files may have different schemas. The RFC must clarify:

- What constitutes a "block" in prose, business-profile, and faq content?
- How does `block.id.validate` check these non-page content types?
- For prose, the file system responsibilities table says "Prose heading-derived ids checked for uniqueness within page" — but heading-derived ids are not authored `blocks[].id` fields. Are these checked differently?

## Axis G — Blind spots

**Verdict: Needs revision (1 finding)**

### G-1: Content type coverage does not match RFC-0901's scope

The RFC lists "pages, prose, business-profile, faq" as content types with mandatory block ids. However, RFC-0901 (cross-locale structural parity validation, which depends on RFC-0914) covers a broader set of content types including navigation, people, and site directories. If RFC-0914 is a prerequisite for RFC-0901, it should either:

- Cover all content types that RFC-0901 checks, or
- Explicitly state which types are out of scope and why

### G-2: `versionBump: patch` is incorrect for a breaking change

The RFC declares `versionBump: patch` but makes `blocks[].id` mandatory — a breaking change that requires a migrator (`block.id.generate`). Per the frontmatter comment:

- `patch` = safe
- `minor` = Breaks-B, requires migrator

This change requires all existing content files to be migrated, which is a `minor` bump, not `patch`.

## Questions for the author

1. **Non-page content types:** How should `block.id.validate` check prose, business-profile, and faq content that don't have `blocks[]` arrays? What constitutes a "block" in these types?
2. **RFC-0048 relationship:** Should the RFC formally `amend` or `supersede` RFC-0048 to remove the anchors registry, given that both `supersedes` and `amends` are currently empty?
3. **page.block.validate changes:** What specific changes to `page.block.validate` are needed, and how does the existing B-05 check relate to the new `block.id.validate`?
4. **Scaffolding mechanism:** Since `onboarding.scaffold` was removed in RFC-0532, what is the correct mechanism for ensuring new apps get block ids in scaffolded pages?
5. **Content type scope:** Should RFC-0914 cover all content types that RFC-0901 checks (navigation, people, site directories), or is the current scope intentional?

## Recommended next step

Run `/fo-idea-enhance` to address the seven findings, then `/fo-idea-plan` to generate the implementation plan.
