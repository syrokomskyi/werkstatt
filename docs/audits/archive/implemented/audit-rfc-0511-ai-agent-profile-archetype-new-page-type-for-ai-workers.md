---
rfcId: RFC-0511
auditId: AUDIT-RFC-0511-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0511

## Verdict: Needs revision

The RFC defines a sound seven-block AI-agent profile archetype with proper public/private separation and a dedicated route pattern. However, it has significant drift from the actual codebase: the `pageId` namespace (`ai-agent:` vs the existing `participant:`), the `contentRef#anchor` pattern (contradicted by RFC-0510's separate-file approach), the missing `ParticipantView` field projections, and the incorrect pipeline name (`apps-check.run` vs `sites-check.run`) must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0511` exits 0, no violations.

## Axis A — Structural completeness

- **Missing `Output format` section.** The RFC lists `participant.ai-agent.validate` rules but does not document the `--json` output shape. RFC-0508 and RFC-0510 both include an explicit JSON envelope example. Add one.
- **Missing `Failure modes` section.** The RFC does not specify exit codes or warn-vs-fail behavior for the validator. RFC-0508 has a detailed `Failure modes` section distinguishing errors from warnings. Add one.
- **`Rollout` is thin.** Phase 0 and Phase 1 are one sentence each. No mention of default behavior for existing sites (no AI-agent participants = no-op), no adoption path for new sites, no new-app compliance guidance.
- **`Risks` missing agent misinterpretation risk.** The risks section does not address how an agent might misinterpret the `contentRef#anchor` pattern or the `publicName` vs `name` distinction.

## Axis B — DNA alignment

- **DNA-24 (Block-declarative pages).** The AI-agent profile is a block-declarative page synthesized from the Participant record. Passes — but the RFC uses `contentRef` with anchor fragments (`prose/{slug}#rechte`), which is not the DNA-24 pattern. DNA-24 says prose content lives in separate `src/content/prose/<slug>.<lang>.md` entries referenced via `blocks[].props.contentRef`. The existing pattern (RFC-0510) uses separate files (`prose/{slug}-nachweise`, `prose/{slug}-beruflich`), not anchor fragments within a single file. This is a DNA-24 drift.
- **DNA-37 (Universal Section Props).** The RFC claims to use the unified `SectionProps` contract. The `controlled-responsibility-block` in block 2 uses `items: [{ label, kind }]` — but RFC-0510 uses `body: { labels, primaryItems, secondaryItems }` for the same archetype. The RFC does not clarify whether `controlled-responsibility-block` supports both body shapes or whether this is a different body kind. This needs explicit documentation.
- **DNA-38 (Canonical item objects).** The RFC uses `{ label: c, kind: "capability" }` in block 2. RFC-0510 uses `{ text: s }` for the same archetype's items. The item shape mismatch (`label` vs `text`, `kind` field) needs resolution.

## Axis C — Ecosystem fit

- **`pageId` namespace mismatch.** The RFC proposes `ai-agent:<slug>` as the pageId (line 298, 367-369). The actual codebase uses `participant:<slug>` for all participants (`participantPageId` in `packages/share/src/astro/people-routes.ts:29`). The RFC says human profiles use `person:<slug>` (line 285, 298) — but the code uses `participant:<slug>`, not `person:<slug>`. The RFC must either (a) introduce `aiAgentPageId` as a new pageId namespace alongside the existing `participantPageId`, or (b) reuse `participantPageId` and dispatch by `participantType` in `resolve-route.ts`. The current proposal is inconsistent with the codebase.
- **`AI_AGENT_BASE_BY_LANG` vs existing base-segment resolution.** The RFC proposes a hardcoded `AI_AGENT_BASE_BY_LANG` constant. The existing `getParticipantProfileRoutes` derives the base segment from `system.md` page routes (`parentPage?.routes?.[lang]`), falling back to `DEFAULT_PROFILE_BASE_BY_LANG`. The AI-agent base segment should be derived from the team page route + a localized suffix (`team/ki-agenten`, `komanda/ki-agenty`), not from a standalone hardcoded constant that ignores `system.md` route configuration.
- **`routes.generate` is not a real command.** The RFC lists `routes.generate` in `commands.changed` (line 41). There is no `routes.generate` kernel command — route generation happens through `getParticipantProfileRoutes` folded into the registry merge in `packages/share/src/astro/routes/registry.ts`. Remove `routes.generate` from `commands.changed`.
- **`apps-check.run` vs `sites-check.run`.** The RFC lists `apps-check.run` in `commands.changed` (line 40) and says `participant.ai-agent.validate` joins `apps-check.run` (line 509, 535). The actual pipeline is `SITES_CHECK_AUTHOR_PIPELINE` (registered in `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`), which is invoked via `sites-check.run`. RFC-0508 and RFC-0510 both join `sites-check.run`. Fix the command name.
- **`packagesImpacted` includes `@gogol/ui` unnecessarily.** The RFC lists `@gogol/ui` in `packagesImpacted` (line 50) but the file system responsibilities table lists no `@gogol/ui` edits. All blocks use existing archetypes (`hero`, `controlled-responsibility-block`, `markdown`, `final-cta`). Remove `@gogol/ui` unless a UI component change is actually needed.
- **Compass sync not mentioned.** The RFC changes `packages/ontology/src/external-surfaces/url-schema.yaml` and adds a new source file (`packages/os/site-kernel-checks/src/participant-ai-agent.ts`). It does not mention which `docs/*.xml` files need synchronization (root AGENTS.md Compass document duties). `docs/technology.xml` and `docs/source-markup.xml` likely need updates.
- **AGENTS.md updates not mentioned.** The RFC adds a new participant type route pattern. `packages/os/site-kernel-checks/AGENTS.md` may need updating to document the new validator.

## Axis D — Forward-only compliance

- **No backward compatibility layers.** The RFC is purely additive — new route pattern, new synthesis function, new validator. No shims, no dual-paths. Passes.
- **`person:<slug>` pageId is not the current code.** The RFC says "Human profiles remain at `person:<slug>`" (line 298), but the code uses `participant:<slug>`. This is not a backward compatibility issue — it's a factual error about the current state. The RFC should say `participant:<slug>`.

## Axis E — Agent-facing policy

- **`contentRef#anchor` pattern is unimplemented.** The RFC uses `contentRef: prose/${participant.slug}#rechte` (lines 176, 196, 220, 247). RFC-0510 explicitly states in its nonGoals: "Does not design a prose fragment extraction mechanism (`contentRef#anchor`) — separate prose files per section are used instead." RFC-0511's approach contradicts RFC-0510's decision. An agent implementing this RFC would need to build an anchor-based prose extraction mechanism that RFC-0510 deliberately rejected. This must be resolved — either use separate prose files (matching RFC-0510) or explicitly supersede RFC-0510's nonGoal with justification.
- **`ParticipantView` field projections missing.** The RFC's `buildAiAgentProfileBlocks` uses `participant.publicName`, `participant.capabilities`, `participant.aiAgent.*` — but the current `ParticipantView` (constructed at `packages/share/src/astro/people.ts:144-179`) does not project `publicName`, `capabilities`, or `aiAgent` from the merged data. The file system responsibilities table mentions only "`ParticipantView` with `aiAgent` sub-object" — it must also list `publicName` and `capabilities`.
- **`publicName` vs `name`.** The RFC uses `participant.publicName` in the hero (line 122, 382). The existing `ParticipantView` uses `name` (from `merged["name"]`). RFC-0508's schema has `publicName` as a required top-level field and `name` as an optional human-specific field. The RFC must clarify which field is used and ensure `ParticipantView` exposes it.
- **Status gate.** No self-authorizing language. The RFC is `status: draft` and does not claim implementation permission. Passes.

## Axis F — Pragmatism

- **`participant.ai-agent.validate` as a separate command.** RFC-0508 ships `participant.validate` and RFC-0510 ships `participant.profile.validate`. This RFC adds a third: `participant.ai-agent.validate`. Consider whether AI-agent-specific validation could be a rule set within `participant.profile.validate` (which already validates human profiles) rather than a new command. The RFC does not justify why a separate command is needed vs extending `participant.profile.validate` with type-specific rules.
- **`AI_AGENT_BASE_BY_LANG` duplicates localization logic.** The constant hardcodes `de: "team/ki-agenten"`, `uk: "komanda/ki-agenty"`, `en: "team/ai-agents"`. The existing `DEFAULT_PROFILE_BASE_BY_LANG` and the team page route resolution already handle localized base segments. A hardcoded constant bypasses the `system.md` route configuration. Consider deriving the AI-agent base from the team page route + a localized suffix constant.
- **`autonomyLabel` function in `resolve-route.ts`.** The labels are hardcoded in the synthesis function. This is consistent with RFC-0510's pattern (DE headings hardcoded), but the autonomy labels are multi-language while the section headings are DE-only in the synthesis. The inconsistency is acceptable but the RFC should acknowledge it.

## Axis G — Blind spots

- **No AI-agent participants exist.** The RFC acknowledges this risk (line 519) — the validator is a no-op. But the RFC does not describe how the route generation behaves when zero AI-agent participants exist. `getParticipantProfileRoutes` should produce zero AI-agent routes (no error, no warning). This is the default behavior but should be explicit.
- **`status: former` / `status: retired` CTA omission is moot.** The existing `getParticipantProfileRoutes` only generates routes for `status: active` (line 108: `if (status !== undefined && status !== "active") continue;`). Former/retired participants don't get profile routes at all, so the CTA omission logic in `buildAiAgentProfileBlocks` (line 446) is unreachable. The RFC should either (a) relax the route generation to include former/retired participants, or (b) remove the CTA omission logic as dead code.
- **Performance.** The validator scans people records — cost is trivial (1–20 participants). No issue.
- **False positives.** The validator is a no-op when no AI-agent participants exist. No false-positive risk.
- **Edge cases.** The RFC does not consider what happens when an AI-agent participant has `visibility: public` but no `aiAgent` sub-object (schema validation should catch this, but the validator should handle it gracefully).

## Questions for the author

1. **`contentRef#anchor` vs separate prose files.** RFC-0510 explicitly rejected anchor-based prose extraction. Why does RFC-0511 use `prose/{slug}#rechte` instead of `prose/{slug}-rechte` (separate files matching RFC-0510's pattern)? If anchors are needed, does this require superseding RFC-0510's nonGoal?
2. **`pageId` namespace.** The RFC says human profiles use `person:<slug>` and AI agents use `ai-agent:<slug>`. The code uses `participant:<slug>` for all. Should the RFC introduce `aiAgentPageId` as a new namespace, or reuse `participantPageId` and dispatch by `participantType` in `resolve-route.ts`?
3. **`participant.ai-agent.validate` vs extending `participant.profile.validate`.** Why a separate command instead of adding AI-agent rules to the existing `participant.profile.validate` (which already validates human profiles)? What justifies the additional command surface?
