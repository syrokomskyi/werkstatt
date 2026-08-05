---
rfcId: RFC-0694
auditId: AUDIT-RFC-0694-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0694

## Verdict: Needs revision

The RFC is well-structured and addresses three concrete problems (no React template, external skill dependency, invariant checker blind to JSX). However, the `versionBump: patch` declaration is inconsistent with the breaking schema change within `forge/stack-profile@1`, and the RFC reverses a nonGoal from RFC-0693 (implemented the same day) without acknowledging or explaining the reversal. Two of the six vendored skills lack canonical source URLs, creating conflicting implementation instructions.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0694 --json` returns 0 violations, exitCode 0.

## Axis A — Structural completeness

- **`commands.changed` is empty but should list changed commands.** The RFC modifies the behavior of `forge.doctor` (invariant engine replacement), `forge.profile.validate` (schema enum change), and `forge.create` (profile rename + React template). RFC-CMD-03 requires entries in `commands.changed` to be registered CLI commands — all three are registered. RFC-0691 (the precedent) correctly listed `forge.doctor` in `commands.changed` when it added `html-attribute-pattern`; RFC-0694 should do the same when replacing it.
- **`related` includes `ADR-0021` but the RFC body never references it.** ADR-0021 ("Editframe as video composition framework") is listed in `related` but is not mentioned in Context, Architectural fit, or any other section. The relationship should be explained or the entry removed.

## Axis B — DNA alignment

- **DNA-54 alignment is well-argued.** The RFC explicitly addresses SKILL-11 compliance for vendored skills and provides clear guidance distinguishing project-specific literals (must use `ref()` bindings) from domain knowledge (element names, hook names, package names — retained as factual content). This is the correct application of DNA-54.
- **SKILL-17 disables are consistent with existing pattern.** All existing ef-* skills use `<!-- skill-lint-disable SKILL-17 -->`. The RFC follows this pattern for the 6 new skills. Note: "Editframe" is a third-party tool name, not a Warpgogol platform name, so SKILL-17 may not strictly require disabling — but consistency with the existing pattern is acceptable.

## Axis C — Ecosystem fit

- **Reversal of RFC-0693 nonGoal without acknowledgment.** RFC-0693 (implemented the same day) explicitly states in `nonGoals`: "Do not vendor Editframe skills into forge — they are installed by `npm create @editframe` or referenced online." RFC-0694 reverses this decision by vendoring 6 skills into `packages/forge/skills/fo/`. The RFC should explicitly acknowledge this reversal and explain why the decision was reversed so quickly (e.g., "Runtime dependency on `npm create @editframe` proved fragile; bundling skills eliminates the external network call and ensures domain knowledge is always available").
- **Profile rename impact is well-covered.** The acceptance criteria list updating `editframe-profile.test.ts`, `ef-onboard`, `ef-composition-review`, `ef-render-verify`, and `AGENTS.md`. The `related` field correctly cross-references all four prior RFCs whose artifacts are modified.

## Axis D — Forward-only compliance

- **Critical: `versionBump: patch` is inconsistent with the breaking schema change.** The RFC removes `html-attribute-pattern` from the `profileInvariantCheckSchema` enum and replaces `element: string` with `elements: string[]`. This is a breaking change within `forge/stack-profile@1` — any profile using `kind: html-attribute-pattern` or `element: string` will fail schema validation after this RFC is implemented. The RFC declares `versionBump: patch` ("safe"), but the correct declaration is `minor` (Breaks-B, requires migrator). The RFC argues "the only consumer (`editframe-html.yaml`) is being replaced in the same RFC," but this only covers the Warpgogol monorepo. External npm consumers who installed `@warpgogol/forge` and created custom profiles using `html-attribute-pattern` (added in RFC-0691, published the same day) will experience a breaking change. While the adoption window is near-zero, the `versionBump` field should reflect the semantic impact, not the practical impact.
- **The RFC explicitly forbids backward compatibility:** "Agents MUST NOT add backward compatibility for `html-attribute-pattern`." This is a strong forward-only stance. It is acceptable only if the `versionBump` is corrected to `minor` or the schema version is bumped to `@2`.

## Axis E — Agent-facing policy

- **Conflicting instructions for 2 of 6 vendored skills.** The implementation notes say: "When vendoring Editframe skills, agents MUST fetch the latest content from `https://editframe.com/skills/<name>.md`." But the file system table lists `ef-brand-video-generator` and `ef-motion-design` as "(bundled with `npm create @editframe`)" — no canonical URL is provided. If these 2 skills do not have `editframe.com/skills/<name>.md` URLs, the agent has conflicting instructions: fetch from a URL that may not exist, or obtain content from `npm create @editframe` (which the RFC is explicitly eliminating as a dependency). The RFC should either provide the canonical URLs for all 6 skills or specify an alternative source for these 2.
- **`concerns: read-only` may be incorrect for some skills.** The RFC declares `concerns: read-only` for all 6 vendored skills. `ef-composition` ("Video composition with React, time model, media elements, rendering") and `ef-brand-video-generator` ("Brand video generation template") may guide operators to create `.tsx` files, which would be `content-mutation` or `code-mutation`. The actual concerns level should be determined from the skill content during vendoring.

## Axis F — Pragmatism

- **The `attribute-pattern` generalization is a clean solution.** Replacing `element: string` with `elements: string[]` and matching both HTML (`<ef-timegroup>`) and JSX (`<Timegroup>`) syntax via regex alternation is simple and extensible. The `elements: [ef-timegroup, Timegroup]` declaration in profile YAML is explicit and self-documenting.
- **Standardizing on React is a strong but justified decision.** React is a superset of HTML for Editframe purposes — web components work inside React. The elimination of the HTML-only template simplifies the system (one profile, one set of invariants, one workspace type). The alternatives section thoroughly addresses the trade-offs.
- **Vendoring eliminates a real runtime fragility.** The `npm create @editframe` step in `ef-onboard` is network-dependent and produces divergent project structures. Bundling the skills with `@warpgogol/forge` is a pragmatic improvement.

## Axis G — Blind spots

- **Factual inaccuracy: `.claude/skills/` reference.** Line 90 states `npm create @editframe` "copies 6 skills into `.claude/skills/` and `.agents/skills/`." The actual `ef-onboard` skill (line 69) only mentions `.agents/skills/editframe-*/`. The `.claude/skills/` reference is unverified and should be corrected or removed.
- **No `triggers` frontmatter for vendored skills.** RFC-0548 (core behavioral layer) introduces `triggers` fields for intent-to-skill routing. The existing ef-* skills (`ef-onboard`, `ef-composition-review`, `ef-render-verify`) have `triggers` (e.g., `ef-onboard` has "create a new editframe project"). The 6 new vendored skills should also declare `triggers` for discoverability — the RFC doesn't mention this.
- **`package.json` `files` array coverage is not verified.** The RFC renames `editframe-html-templates/` to `editframe-templates/`. The `files` array in `packages/forge/package.json` includes `profiles/` (line 117), which covers both the YAML and templates directory. No change is needed, but the RFC should explicitly state this is covered rather than leaving it as an implicit assumption.

## Questions for the author

1. Why is `versionBump: patch` when the RFC removes a schema enum value (`html-attribute-pattern`) and changes `element: string` to `elements: string[]` within `forge/stack-profile@1`? Should this be `minor` (Breaks-B, requires migrator)?
2. RFC-0693 (implemented the same day) explicitly listed "Do not vendor Editframe skills into forge" as a nonGoal. What changed between RFC-0693 and RFC-0694 that justifies reversing this decision?
3. What are the canonical source URLs for `ef-brand-video-generator` and `ef-motion-design`? The implementation notes instruct agents to fetch from `https://editframe.com/skills/<name>.md`, but these 2 skills are listed as "bundled with `npm create @editframe`" without URLs.
