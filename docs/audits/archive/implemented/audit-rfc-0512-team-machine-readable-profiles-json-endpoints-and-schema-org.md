---
rfcId: RFC-0512
auditId: AUDIT-RFC-0512-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0512

## Verdict: Needs revision

The RFC is structurally sound and well-scoped, but has a critical gap: `versionBump: minor` requires a migrator (RFC-0479) and none is mentioned. Additionally, the JSON-LD builder architecture creates a potential dual-path with the existing `buildPersonNode`, and the pipeline placement (`apps-check.run` vs `sites-check.run`) is inconsistent with the sibling RFC family (0508/0510/0511).

## Mechanical validation (rfc.validate)

Pass with one V-19 warning: `RFC-0512.amends includes RFC-0200, but RFC-0200.amendedBy does not include RFC-0512`. This is expected — `amendedBy` backreference on RFC-0200 must be added during implementation.

## Axis A — Structural completeness

- **Output format**: Not documented as a standalone section. The `participant.json.validate` rules section partially covers the `--json` shape, but the RFC does not show the command's `--json` output envelope (unlike RFC-0508 and RFC-0511, which both include explicit output format examples).
- **Failure modes**: Not documented as a standalone section. The `participant.json.validate` rules list what it checks but does not specify exit codes or warn-vs-fail behavior. RFC-0508 and RFC-0511 both have explicit "Failure modes" sections with exit code semantics.
- **Decision**: Present tense, single decision ✓
- **CLI surface**: Exact commands with flags ✓
- **TypeScript contracts**: Minimal signatures ✓
- **File system responsibilities**: Concrete paths ✓
- **Rollout**: Three phases described ✓
- **Alternatives considered**: Three real alternatives with rejection reasons ✓
- **Risks**: Three risks with mitigations ✓
- **Acceptance criteria**: 13 items, all checkable ✓
- **Implementation notes**: Explicit behavioral rules ✓

## Axis B — DNA alignment

- **DNA-24 (Block-declarative pages)**: Listed in `satisfies[]` but the RFC body does not explain how it enforces or extends DNA-24. JSON endpoints are static files, not block-declarative pages. The JSON-LD injection into the `structured-data` block on profile pages is the only connection, but this is already handled by RFC-0200/RFC-0498. The `satisfies` entry appears decorative.
- **DNA-53 (Semantic fingerprint governance)**: The RFC says "Semantic fingerprint governance — the C-contract change is tracked" (line 450) but does not explain how `@gogol/fingerprint` is used or how the semantic hash is governed. The C-contract files (`jsonld-types.yaml`, `url-schema.yaml`) are in `packages/ontology/`, so `platform.consistency.validate` will detect the hash change — but the RFC should state this explicitly, as RFC-0498 does.
- **Missing migrator**: `versionBump: minor` requires a migrator registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` (RFC-0479). The RFC does not mention a migrator anywhere — not in file system responsibilities, not in rollout, not in acceptance criteria. RFC-0498 (same `versionBump: minor`, same `breaksC: true`) registered a no-op migrator. RFC-0508 registered a data-transform migrator. RFC-0512 must do the same.

## Axis C — Ecosystem fit

- **Pipeline placement inconsistency**: The RFC says `participant.json.validate` joins `apps-check.run` (line 489). However, the sibling RFCs are inconsistent: RFC-0508 puts `participant.validate` in `SITES_CHECK_AUTHOR_PIPELINE` (`sites-check.run`), RFC-0510 puts `participant.profile.validate` in `SITES_CHECK_AUTHOR_PIPELINE`, RFC-0511 puts `participant.ai-agent.validate` in `SITES_CHECK_AUTHOR_PIPELINE`. RFC-0509 puts `team.hub.validate` in `apps-check.run`. The RFC should justify why JSON endpoint validation belongs in `apps-check.run` rather than `sites-check.run` alongside the other participant validators. If JSON endpoints are build-time static files, `sites-check-postbuild` (which scans built `dist/`) may be more appropriate — `seo.structured-data.validate` runs there.
- **Dual JSON-LD builder path**: The RFC proposes `buildPersonJsonLd` in a new file `packages/share/src/astro/participant-json.ts` (line 465). The existing Person JSON-LD builder is `buildPersonNode` in `@/packages/share/src/semantic/jsonld/person.ts:18`. The RFC does not clarify whether the new builder replaces the existing one or supplements it. If both exist, which one emits Person JSON-LD on profile pages? The existing `buildJsonLd` in `@/packages/share/src/semantic/jsonld.ts:32` calls `buildPersonNodes` — the RFC needs to state whether this call path is modified or whether the new builders are injected separately.
- **`SemanticPerson` type extension**: The RFC's Person JSON-LD includes `address`, `knowsAbout`, `affiliation` — fields not present on the current `SemanticPerson` type (`@/packages/share/src/semantic/models.ts:145-161`). The file system responsibilities do not mention extending `SemanticPerson` or `projectPeople` in `@/packages/share/src/semantic/business-projection.ts:143`. The RFC must list `models.ts` and `business-projection.ts` (or `people.ts`) as impacted files.
- **Compass sync**: Not mentioned. The RFC changes `jsonld-types.yaml` and `url-schema.yaml` (C-contract files in `packages/ontology/`). Root AGENTS.md Compass duties require identifying which `docs/*.xml` files need synchronization. At minimum `docs/technology.xml` and `docs/knowledge-graph.xml` should be updated for the new JSON endpoint routes.
- **AGENTS.md updates**: Not mentioned. `packages/os/site-kernel-checks/AGENTS.md` may need an entry for the new `participant.json.validate` command.

## Axis D — Forward-only compliance

- **No compatibility shims** ✓
- **No deprecation grace periods** ✓
- **Amends RFC-0200 directly** — extends Person JSON-LD, does not add a parallel interpretation ✓
- **No legacy code paths maintained** ✓
- **Missing migrator is a forward-only violation**: `versionBump: minor` without a migrator means `migratorCursor` cannot advance, which blocks `mission.migrate` for sites adopting this RFC. This is a process gap, not a backward-compatibility issue, but it violates the forward-only migration contract (RFC-0479).

## Axis E — Agent-facing policy

- **Status gate**: No self-authorizing language ✓
- **Implementation notes**: Explicit behavioral rules with MUST/MUST NOT ✓
- **Anti-fabrication**: Acceptance criteria are code-behavior checks, not content authoring ✓
- **Storage policy**: No persistence introduced — JSON endpoints are static build-time files ✓
- **Governance references**: Implementation notes do not reference RFC-0224 (accepted→implemented), RFC-0330 (verification evidence), or RFC-0334 (supersede escalation). RFC-0498 and RFC-0508 include these references. Minor gap.

## Axis F — Pragmatism

- **Minimal command surface**: `participant.json.validate` is structurally distinct from `participant.validate` (JSON endpoint shape, private field exclusion, JSON-LD type compliance vs. participant schema validation). A separate command is justified.
- **Lean contracts**: TypeScript types are minimal ✓
- **Existing patterns**: Extends `jsonld-types.yaml` `surfacePolicy` and `url-schema.yaml` `routePatterns` following the RFC-0498/RFC-0509 pattern ✓
- **Scope discipline**: `appsImpacted: [warpgogol-com]` and `packagesImpacted: [@gogol/share, @gogol/ontology, @gogol/site-kernel-checks]` are correct and minimal ✓
- **`nonGoals`**: Six meaningful non-goals that clearly delegate to sibling RFCs ✓

## Axis G — Blind spots

- **Empty state**: The RFC does not address what happens when no public, active participants exist. Does `/team/profiles.json` still get generated with `participants: []`? Does `participant.json.validate` no-op pass? RFC-0511 explicitly states "Sites with no AI-agent participants: no-op pass" — RFC-0512 should do the same for the JSON endpoint validator.
- **Build-time generation mechanism**: The RFC says "The generation happens in `routes.generate` (or a new `participant.json.generate` step in `build.prepare`)" (line 414) — this is ambiguous. The RFC should commit to one mechanism. If a new `participant.json.generate` step is added to `build.prepare`, it should be listed in `commands.added` and the file system responsibilities should name the implementation file.
- **Migrator false positives**: The private field exclusion check (`participant.json.validate` checks for `consent.consentRecordId`, `profileOwner`, etc.) could produce false positives if a public JSON endpoint legitimately contains a field with a similar name in a different context. The RFC does not discuss suppression or scoping.
- **JSON-LD `address` consent gating**: The RFC says `address` is only included when `consent.approvedFields` includes `location` (line 130). But the `address` in JSON-LD is a composite object (`addressLocality`, `addressRegion`, `addressCountry`). The RFC should clarify whether the entire `address` object is gated or whether `addressCountry` (non-sensitive) is always included.
- **`hasConsent` and `consentApprovedFields` in public JSON**: The human JSON endpoint includes `hasConsent: true` and `consentApprovedFields: ["bio", "photo", "location", "sameAs"]` (line 272-273). This exposes the consent record's _contents_ publicly. While the RFC says `consent.consentRecordId` is private, publishing `consentApprovedFields` reveals which personal data fields the person has approved for display. This is a privacy consideration the RFC should address — is this intentional transparency or a leakage risk?

## Questions for the author

1. **Where is the migrator?** `versionBump: minor` requires a migrator (RFC-0479). Is this a no-op migrator (like RFC-0498) or a data-transform migrator? The file system responsibilities must include `packages/os/site-kernel-handoff/src/migrators/rfc-0512.ts` and `registry.ts`.
2. **Which pipeline step?** Why does `participant.json.validate` join `apps-check.run` when the sibling participant validators (0508/0510/0511) join `SITES_CHECK_AUTHOR_PIPELINE` (`sites-check.run`)? Should it join `sites-check-postbuild` instead, since JSON endpoints are build-time static files that need to exist in `dist/` before validation?
3. **Does `buildPersonJsonLd` replace `buildPersonNode`?** The existing Person JSON-LD builder in `packages/share/src/semantic/jsonld/person.ts` emits `name`, `jobTitle`, `description`, `birthDate`, `deathDate`, `image`, `sameAs`, `url`, `worksFor`. The new `buildPersonJsonLd` emits `name`, `jobTitle`, `description`, `url`, `image`, `address`, `knowsAbout`, `sameAs`, `affiliation` — and explicitly excludes `birthDate`. Are these two builders for different contexts, or does the new one replace the old one on profile pages?
