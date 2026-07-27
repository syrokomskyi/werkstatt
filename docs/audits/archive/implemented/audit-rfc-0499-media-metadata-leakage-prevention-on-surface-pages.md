---
rfcId: RFC-0499
auditId: AUDIT-RFC-0499-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0499

## Verdict: Needs revision

The RFC addresses a real problem (media metadata leaking into visible surface page HTML) but has a blocking mechanical error (V-30: `breaksC: true` without `@gogol/ontology` in `packagesImpacted`), is missing six required sections (V-13), and has a significant false-positive blind spot: prohibited strings like "Gemini" and "Organization" are common words that cannot be detected by simple substring matching without context-aware scoping.

## Mechanical validation (rfc.validate)

**Fail** — 1 error, 7 warnings targeting this RFC:

- **V-30 (error):** `breaksC` is `true` but `@gogol/ontology` is not in `packagesImpacted`. RFCs that break Layer C must update the declarative C-contract in `packages/ontology/src/external-surfaces/` (RFC-0480).
- **V-13 (warning) ×6:** Missing required sections: `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`.
- **V-19 (warning):** `RFC-0499.amends` includes `RFC-0231`, but `RFC-0231.amendedBy` does not include `RFC-0499`.

## Axis A — Structural completeness

**Multiple failures.** Six required sections are missing (V-13). The RFC has only Context, Problem, Decision, Implementation plan, and Acceptance criteria. Specifically:

- **No `## Architectural fit`** — the RFC does not explain how it fits into the existing ecosystem (RFC-0220 sidecar schema, RFC-0231 visibility policy, RFC-0488 provenance registry, RFC-0480 Layer C contract, RFC-0498 structured data policy).
- **No `## Design`** — no CLI surface with exact command invocations, no TypeScript contracts, no file system responsibilities table, no output format, no failure modes with exit codes.
- **No `## Rollout`** — no description of default behavior, adoption path for existing surface pages, or new-site compliance.
- **No `## Alternatives considered`** — no real alternative with a rejection reason.
- **No `## Risks`** — no agent misinterpretation risk, no false-positive rate discussion.
- **No `## Implementation notes for agents`** — no explicit behavioral rules.
- **Acceptance criteria** (6 items) are checkable but insufficient — they don't cover the `surface.contract.validate` update (mentioned in the implementation plan but not in acceptance criteria).

## Axis B — DNA alignment

**One finding.**

- `satisfies: [DNA-24, DNA-53]` — DNA-24 (block-declarative pages) is relevant because the RFC changes what the baker emits into block props. However, the RFC body does not explain **how** it enforces or protects DNA-24 — it only mentions `bakePage` in passing.
- DNA-53 (semantic fingerprint governance) appears **decorative**. The RFC does not touch hashing, fingerprints, or the `@gogol/fingerprint` package. The body does not mention DNA-53 at all. Unless the RFC intends to include media-leakage policy in the platform semantic hash (which would need explanation), DNA-53 should be removed from `satisfies[]`.
- No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

**Multiple failures.**

- **Package boundaries (V-30 error):** `breaksC: true` requires updating `packages/ontology/src/external-surfaces/` (the media-leakage policy must be declared as a Layer C contract). But `@gogol/ontology` is not in `packagesImpacted`. This is a blocking error.
- **Command lifecycle inconsistency:** `commands.proposed` lists `surface.media-leakage.validate` and `commands.added` also lists it. Proposed commands should not simultaneously appear in `added` — they land in `added` upon implementation. At draft stage, the command should be in `proposed` only.
- **Missing command in `changed`:** The RFC body (§Layer C contract) says "Update `surface.contract.validate` to include the media-leakage policy." But `surface.contract.validate` is not listed in `commands.changed`. It should be.
- **Pipeline placement:** The RFC does not specify which pipeline `surface.media-leakage.validate` runs in (`build.check`, `sites-check`, `sites-check-postbuild`). The RFC says it "uses the same rendered HTML collection as `seo.structured.data.validate`" but does not name the pipeline.
- **Compass sync:** The RFC does not identify which `docs/*.xml` files need synchronization (likely `docs/verification-plan.xml` for the new validator, possibly `docs/technology.xml`).
- **AGENTS.md updates:** The RFC does not identify which `AGENTS.md` files need rule updates (likely `packages/os/site-kernel-checks/AGENTS.md` for the new validator, possibly `packages/share/AGENTS.md` for baker changes).

## Axis D — Forward-only compliance

**No issues.** The RFC does not propose any compatibility shim, dual-path, or backward-compatibility layer. It directly changes the baker to stop emitting media metadata into readable props. The amendment to RFC-0231 changes the visibility policy for surface pages directly, not in parallel.

## Axis E — Agent-facing policy

**One finding.**

- No self-authorizing language found — the RFC is in `draft` and does not claim implementation can start.
- **No `## Implementation notes for agents`** section (V-13) — agents have no explicit behavioral rules for this RFC. Given the complexity of the baker changes (distinguishing JSON-LD-only fields from readable props), this is a significant gap.
- The RFC does not touch persistence or user data.

## Axis F — Pragmatism

**Two findings.**

- **Command sprawl:** `surface.media-leakage.validate` is proposed as a new command, but the RFC also says `surface.validate` is updated to include media-leakage checks (implementation plan step 4) and `surface.contract.validate` is updated to include the media-leakage policy (step 5). If `surface.validate` already includes the checks, a separate `surface.media-leakage.validate` command may be redundant. The RFC should justify why a separate command is needed instead of extending `surface.validate`.
- **Scope discipline:** `packagesImpacted` is missing `@gogol/ontology` (V-30 error). `appsImpacted` lists only `webgogol-com` — correct, since only webgogol-com has surface pages currently.

## Axis G — Blind spots

**Multiple failures.**

- **False-positive risk (critical):** The prohibited strings table includes `Gemini` and `Organization` — both are common English words. A substring scan of rendered HTML for "Gemini" would match legitimate prose mentions (zodiac, astrology, the Gemini constellation, a person named Gemini). A scan for "Organization" would match thousands of legitimate prose uses. The RFC says `Gemini` is prohibited "as media authorship label" and `Organization` "as media author" but does not describe how the validator distinguishes these contexts from legitimate prose. This is the most serious blind spot — without context-aware matching, the validator will produce massive false positives.
- **Performance:** `surface.media-leakage.validate` scans all rendered surface page HTML. The RFC does not specify the cost (page count, HTML size, regex complexity, I/O patterns for reading rendered HTML from `dist/`).
- **Edge cases:** The RFC does not consider: (a) empty states (a new site with no surface pages), (b) the case where "Copyright © 2026 Webgogol" legitimately appears in a footer on a surface page (footers are visible HTML), (c) the case where a surface page legitimately mentions "Gemini" in prose (e.g., an industry dossier that references astrology).
- **Migration path:** The RFC does not describe how existing surface pages transition to compliance. Do current surface pages pass without changes? If not, is there a migration window? Are existing baked pages regenerated automatically?
- **Scope of "surface pages":** The RFC says the policy applies to "surface pages" but does not define which pages are surface pages. Does it include depth-0 pillar hubs? Depth-1 industry pages? Depth-2..5? The `website-service` surface? This needs to be explicit.

## Questions for the author

1. How does `surface.media-leakage.validate` distinguish "Gemini" as a media authorship label from "Gemini" as a legitimate prose word? Simple substring matching will produce false positives — what context-aware matching strategy is used?
2. Why is `surface.media-leakage.validate` a separate command rather than additional rules in the existing `surface.validate`? The RFC already proposes updating `surface.validate` — what does the separate command add?
3. Which `docs/*.xml` Compass files need synchronization when the new validator and the Layer C contract changes are added?
