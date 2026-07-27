---
rfcId: RFC-0487
auditId: AUDIT-RFC-0487-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0487

## Verdict: Needs revision

The RFC is well-structured and addresses a real legal/compliance gap, but has a critical V-30 compliance issue: it declares `breaksC: true` and lists `@gogol/ontology` in `packagesImpacted` but never proposes any changes to `packages/ontology/src/external-surfaces/` — the declarative C-contract files. V-30 requires that `breaksC: true` RFCs update the C-contract. Additionally, `satisfies: [DNA-44]` is mismatched — DNA-44 is the Sternsystem bundle contract, not a B2B business-model invariant. The RFC also references `content.references.validate --site webgogol-com` but the command scope is `app`, not `site`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0487 --json` returned 0 violations. The frontmatter is mechanically valid. However, V-30 only checks `packagesImpacted` membership, not whether the RFC body actually proposes changes to `packages/ontology/src/external-surfaces/` — so the semantic gap (breaksC declared but no C-contract changes proposed) is not caught mechanically.

## Axis A — Structural completeness

- **Decision** is clear and actionable — 6 concrete decisions in present tense.
- **CLI surface** is partially specified: `b2b.model.validate` is described in prose (§7) but lacks exact flag syntax (`--site` vs `--app`), `--json` output shape, and exit code behavior. The acceptance criteria use `--site webgogol-com` but the command scope pattern in `@gogol/site-kernel-checks` uses `--app` (see `redirect.map.validate` which uses `supportsAllApps: true` with `scope: "app"`).
- **TypeScript contracts** are absent — no type signatures for `retiredRoutes` schema, `businessModel` field, or `b2b.model.validate` output shape.
- **File system responsibilities** table is missing — the RFC describes changes in prose and inline YAML but does not provide a concrete path-to-role mapping table.
- **Output format** for `b2b.model.validate --json` is not documented.
- **Failure modes** table is missing — no exit code / warn-vs-fail behavior specification.
- **Rollout** is well-structured (platform → site → cross-page → validation).
- **Alternatives considered** is honest with 4 real alternatives and rejection reasons.
- **Risks** covers broken links, search indexing, legal review, and external backlinks. Missing: agent misinterpretation risk and false-positive rate for `b2b.model.validate`.
- **Acceptance criteria** are mostly checkable but `content.references.validate --site webgogol-com` uses wrong flag (`--site` vs `--app`).
- **Implementation notes** are explicit behavioral rules — good.

## Axis B — DNA alignment

- **`satisfies: [DNA-44]` is incorrect.** DNA-44 is the "Sternsystem bundle contract" — it defines that Sternsystems are data-only bundles with no runtime scripts. This RFC does not enforce, protect, or extend the data-only bundle invariant. The RFC's `businessModel: b2b-only` declaration is a new business-model concept, not covered by any existing DNA invariant. The RFC body claims "DNA-44 (B2B-only business model)" in the Architectural fit section, but DNA-44's actual text is about bundle contracts, not business models. This is a factual misattribution.
- The RFC should either: (a) propose a new DNA invariant for B2B business model declaration and include it in `satisfies[]`, or (b) remove the `satisfies: [DNA-44]` claim and acknowledge that `businessModel` is a new field without a DNA invariant backing it.
- `related: [RFC-0318, RFC-0480, DNA-44]` — RFC-0318 and RFC-0480 are genuinely related. DNA-44 is decorative (same misattribution as `satisfies`).

## Axis C — Ecosystem fit

- **Package boundaries** are correct: `@gogol/ontology` gets the schema field, `@gogol/site-kernel-codegen` gets the redirect generator extension, `@gogol/site-kernel-checks` gets the new validator. No app→app or app→service imports proposed.
- **Pipeline placement** is not explicitly stated. The RFC says "should be added to `build.check`" for `b2b.model.validate` but does not name the specific pipeline (`sites-check-author` or `sites-check-postbuild`). `redirect.map.validate` already runs in `apps-check.author` and `apps-check.postbuild` — the RFC should state where `b2b.model.validate` runs.
- **Compass sync** is not addressed. The RFC adds new schema fields (`retiredRoutes`, `businessModel`) to `systemManifestSchema` in `@gogol/ontology` — this changes shared package contracts. The RFC should identify which `docs/*.xml` files need synchronization (likely `docs/requirements.xml` and `docs/technology.xml`).
- **AGENTS.md updates** are not identified. Adding `b2b.model.validate` to `build.check` and the `retiredRoutes`/`businessModel` fields should be documented in `packages/os/site-kernel-checks/AGENTS.md` and potentially `docs/authoring/site-composition.md`.
- **Cosmic naming** is not directly affected — the RFC removes page entries but does not change cosmic names of remaining pages.
- **Command lifecycle**: `commands.proposed: [b2b.model.validate]` is correct (will land in `added` upon implementation). `commands.changed: [public.infrastructure.generate]` is correct (existing command modified to read `retiredRoutes`).
- **V-30 compliance gap**: `breaksC: true` is declared and `@gogol/ontology` is in `packagesImpacted`, satisfying the mechanical V-30 check. But the RFC body never proposes changes to `packages/ontology/src/external-surfaces/` (url-schema.yaml, jsonld-types.yaml, sitemap-shape.yaml). Per RFC-0480, `breaksC: true` means the RFC "must also update the declarative C-contract." Removing `/widerruf/` and `/widerruf-formular/` from the URL schema should be reflected in `url-schema.yaml` or documented as not requiring contract changes (because the contract uses patterns, not enumerated routes). The RFC must address this explicitly.

## Axis D — Forward-only compliance

- No backward compatibility layers, shims, or dual-paths proposed.
- The `retiredRoutes` field is a declarative audit trail — not a compatibility mechanism. Retired routes return 410, not a redirect to a replacement.
- Page and prose files are deleted, not maintained behind a flag.
- Cross-page cleanup is deferred, not maintained as a permanent dual-path.

## Axis E — Agent-facing policy

- **Status gate**: The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes** reference RFC-0480 (mission workpiece) for site content changes — correct.
- **Anti-fabrication**: The RFC defers content changes (AGB, Impressum, etc.) to separate sessions and does not claim content will be auto-generated. Good.
- **Storage policy**: Not applicable — no persistence changes.

## Axis F — Pragmatism

- **`b2b.model.validate` command**: Justifies its existence as a new command — it checks a cross-cutting concern (B2C references in B2B-only sites) that no existing command covers. However, the RFC should consider whether this could be a flag on `system.manifest.validate` instead of a standalone command. The checks are manifest-content checks, not pipeline checks. The RFC should explain why a new command is preferred over extending `system.manifest.validate`.
- **`retiredRoutes` field**: Minimal and focused — just slug + status. Good.
- **`businessModel` field**: Single enum value `b2b-only`. The RFC should consider whether this should be an open string or a closed enum. If closed enum, what other values are anticipated? If only `b2b-only`, could it be a boolean `b2bOnly: true`?
- **Existing patterns**: The RFC correctly extends the existing `buildRetiredSurfaceRedirectBlock` pattern rather than inventing a new redirect mechanism.
- **Scope discipline**: `appsImpacted: [webgogol-com]` is correct. `packagesImpacted` lists 3 packages — all genuinely impacted.

## Axis G — Blind spots

- **Performance**: `b2b.model.validate` scans prose content for § 312g, § 312j, Verbraucher-Widerrufsrecht references. The RFC does not specify the scan scope (all prose files? all content files?) or estimate file count. For webgogol-com this is likely < 100 files — low cost. But the RFC should state the scope.
- **False positives**: `b2b.model.validate` checks for "Widerruf" in navigation labels — but "Widerruf" could appear in legitimate B2B contexts (e.g., "Widerruf ist für Unternehmer ausgeschlossen" in AGB). The RFC does not describe how to suppress noise during the transition period when AGB still contains Widerruf references (deferred to file 6 session).
- **Edge cases**: The RFC does not consider what happens if `retiredRoutes` contains a slug that is still present in `pages[]` (conflict detection). The `b2b.model.validate` description says "retiredRoutes is the allowed escape hatch" for route slugs — but this contradicts the check "No route slugs widerruf... in pages[] or retiredRoutes." If retiredRoutes is the escape hatch, the check should only flag slugs in `pages[]`, not in `retiredRoutes`.
- **Migration path**: Existing apps without `businessModel` field — do they pass `b2b.model.validate`? The RFC says the check runs "when `businessModel: b2b-only` is declared" — so apps without the field are exempt. This should be explicitly stated.
- **Security/privacy**: Not applicable — no user data or PII changes.

## Questions for the author

1. The RFC declares `breaksC: true` but proposes no changes to `packages/ontology/src/external-surfaces/` (url-schema.yaml, jsonld-types.yaml, sitemap-shape.yaml). Per RFC-0480 V-30, `breaksC: true` RFCs must update the declarative C-contract. Should `url-schema.yaml` be updated to exclude `/widerruf/` and `/widerruf-formular/` from the route patterns, or should the RFC document why no C-contract changes are needed (patterns are generic, not enumerated)?

2. `satisfies: [DNA-44]` is listed, but DNA-44 is the "Sternsystem bundle contract" (data-only bundles, no runtime scripts). The RFC's `businessModel: b2b-only` field is a new business-model concept, not related to the bundle contract. Should the RFC propose a new DNA invariant for B2B business model declaration, or remove the `satisfies: [DNA-44]` claim?

3. The `b2b.model.validate` description says retiredRoutes is "the allowed escape hatch" for route slugs, but also says it checks "No route slugs widerruf... in pages[] or retiredRoutes." These are contradictory — if retiredRoutes is the escape hatch, the check should only flag slugs in `pages[]`, not in `retiredRoutes`. Which is correct?

4. The acceptance criteria use `content.references.validate --site webgogol-com` and `b2b.model.validate --site webgogol-com`, but the command scope pattern in `@gogol/site-kernel-checks` uses `--app` (e.g., `redirect.map.validate` has `scope: "app"` with `supportsAllApps: true`). Should the flag be `--app` instead of `--site`?

5. The RFC does not specify the pipeline placement for `b2b.model.validate` — should it run in `sites-check-author`, `sites-check-postbuild`, or both? And should it be blocking (hard fail) or advisory (warning) during the transition period when AGB still contains Widerruf references?
