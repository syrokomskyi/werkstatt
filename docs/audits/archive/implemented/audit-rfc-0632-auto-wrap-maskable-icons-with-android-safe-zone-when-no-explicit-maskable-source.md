---
rfcId: RFC-0632
auditId: AUDIT-RFC-0632-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0632

## Verdict: Needs revision

The RFC is well-structured and architecturally sound — it cleanly amends RFC-0631 by replacing the unused `favicon-maskable.svg` escape hatch with an auto-wrap transformation. One mechanical validation warning (V-19: missing back-reference from RFC-0631) and one minor semantic finding (background rect identification heuristic underspecified) need addressing before implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19 (warning):** `RFC-0632.amends` includes `RFC-0631`, but `RFC-0631.amendedBy` does not include `RFC-0632`. Fix: add `RFC-0632` to `RFC-0631.amendedBy` array.

## Axis A — Structural completeness

No issues. All sections contain real content:

- **Decision** is a single present-tense decision: "The `public.icons.generate` command auto-wraps..."
- **CLI surface** shows exact command invocations with `--site` scope.
- **TypeScript contracts** are minimal type signatures (`wrapMaskableSvg(svg: string): string`), not full implementations.
- **File system responsibilities** table names concrete paths, correctly marks `favicon-maskable.svg` as **Removed**.
- **Output format** documents the `--json` shape with ICON-SRC-04 diagnostic.
- **Failure modes** specifies 7 scenarios with warn-vs-fail behavior and fallback chains.
- **Rollout** describes default behavior, existing apps, new apps, pipeline integration, and documentation updates.
- **Alternatives considered** has 5 real alternatives with rejection reasons.
- **Risks** includes agent confusion risk and false-positive rate.
- **Acceptance criteria** are checkable and cover the full scope (8 criteria).
- **Implementation notes** are explicit behavioral rules (MUST NOT use DOMParser, MUST NOT create favicon-maskable.svg, MUST NOT remove buildIconSvg fallback).

## Axis B — DNA alignment

No issues. `satisfies: [DNA-4]` is correct — DNA-4 ("All user-visible copy, configuration, and metadata live in `src/content/`") is extended by keeping the favicon source in `src/content/favicon.svg` and deriving the maskable variant automatically. The body explains how: "the favicon SVG source remains in `src/content/favicon.svg`. The maskable variant is derived automatically, not authored separately." No conflict with other DNA invariants. `related: [DNA-4, RFC-0309, RFC-0631]` are all relevant and non-decorative.

## Axis C — Ecosystem fit

No issues. Changes are in `packages/os/site-kernel-checks/src/public-surface/icons.ts` — correct package. `public.icons.validate` is part of `build.check`; ICON-SRC-04 (warning) surfaces there without failing the build. The RFC identifies two documentation surfaces to update: `docs/authoring/site-composition.md` (remove `favicon-maskable.svg` mention) and `packages/os/site-kernel-checks/AGENTS.md` (mention `wrapMaskableSvg`). `commands.changed` lists `public.icons.generate` and `public.icons.validate` — both are existing registered commands. No new commands, no removals.

## Axis D — Forward-only compliance

No issues. The RFC removes `favicon-maskable.svg` support in the same wave — no grace period, no compatibility shim. The auto-wrap always applies when `favicon.svg` exists. The "favicon-maskable.svg still present on disk" failure mode is not a dual-path — the file is silently ignored (inert), not used as a fallback. Legacy code path (`favicon-maskable.svg` check in `resolveIconSvg` at `icons.ts:168-172`) is deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict). No content authoring claims — all acceptance criteria are code changes or test changes. No persistence or cookie changes.

## Axis F — Pragmatism

No issues. No new commands — existing commands change behavior. `wrapMaskableSvg(svg: string): string` is a minimal pure function. The RFC extends the existing `resolveIconSvg` helper rather than creating a new abstraction. `packagesImpacted: [site-kernel-checks]` is accurate — only one package is touched. `nonGoals` are meaningful (no buildIconSvg changes, no regular pipeline changes, no generalization to other artifacts).

## Axis G — Blind spots

**Finding G1 (minor):** The RFC says `wrapMaskableSvg` "removes the original background `<rect>`" and "extracts the inner content of the source `<svg>`" but does not specify how the background rect is identified among multiple `<rect>` elements. If the source SVG has several rects (e.g., a full-canvas background plus smaller decorative rects), the regex-based heuristic must distinguish the background rect from content rects. The failure mode "Auto-wrap fails to extract background — falls back to `#ffffff`" mitigates the case where no background is found, but does not address the case where the wrong rect is selected as the background. The ICON-SRC-04 warning partially mitigates this by prompting visual verification. Consider clarifying the heuristic: "Selects the first `<rect>` with `width="512"` and `height="512"` (or equivalent) as the background."

Performance is self-evidently negligible (single small SVG file, regex parse). False positives are addressed: ICON-SRC-04 is by design a reminder, not an error. Edge cases (missing source, invalid XML, wrong viewBox, sharp failure) are all documented. No security/privacy concerns.

## Questions for the author

1. How does `wrapMaskableSvg` identify the background `<rect>` among multiple rect elements in the source SVG? Should the RFC specify the heuristic (e.g., "first `<rect>` with `width="512" height="512"`")?
2. The existing test `icons-source-svg.test.ts` has a test for ICON-SRC-03 (line 165-174). Should this test be removed entirely, or modified to assert that ICON-SRC-03 is no longer reported when `favicon-maskable.svg` is present?
3. The RFC says the transform is `translate(51.2, 51.2) scale(0.8)`. In SVG, this means: scale the coordinate system to 80%, then translate by 51.2px — placing the 80% content at a 51.2px offset (centering it in the 512×512 canvas). Confirm this is the intended transform order.
