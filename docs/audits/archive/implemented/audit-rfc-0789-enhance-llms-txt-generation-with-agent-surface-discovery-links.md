---
rfcId: RFC-0789
auditId: AUDIT-RFC-0789-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0789

## Verdict: Needs revision

The RFC is a clean, minimal command amendment with a clear purpose, but has a scope inconsistency in frontmatter, references a reclassified DNA invariant as binding, and has a design gap: `buildLlmsIndex` receives `SemanticSiteModel` which has no `agent` field, so the `agent.enabled` check described in the RFC cannot be implemented inside that function without changing its signature or extending the model.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0789 --json` returned `exitCode: 0`, zero violations.

## Axis A — Structural completeness

- **Scope inconsistency**: frontmatter declares `scope: workspace`, but the "Architectural fit" section says `scope: app, supportsAllSites: true`. The `llms.generate` command is registered as `scope: "app"` in `packages/werkstatt-site/src/checks/command-tables/09-build-artifacts.ts:464`. The frontmatter should say `scope: app`.
- **TypeScript contract gap**: the RFC shows `buildLlmsIndex(site: SemanticSiteModel)` with agent links inside the function body, and states "The function signature does not change". However, `SemanticSiteModel` (defined in `packages/werkstatt-site/src/domain/share/semantic/models.ts:394-400`) has no `agent` field — it carries only `baseUrl`, `lang`, `defaultLanguage`, `organization`, and `pages`. The `agent.enabled` check described in "Failure modes" and "Rollout" cannot be performed inside `buildLlmsIndex` without either extending `SemanticSiteModel` or changing the function signature to accept an `agentEnabled` parameter. The RFC must specify which approach is used.
- **`agent.enabled` check location**: the "Implementation notes" say "The `agent.enabled: false` check MUST read the agent block from `system.md` (same pattern as `agent.manifest.generate`)." This implies the check is in the handler (`runLlmsGenerate`), not in `buildLlmsIndex`. But the TypeScript contract shows the links inside `buildLlmsIndex`. The RFC must clarify: does the handler conditionally call `buildLlmsIndex` with an extra parameter, or does it post-process the output to strip agent links?

## Axis B — DNA alignment

- **DNA-34 is reclassified**: `satisfies: [DNA-34]` references an invariant that was reclassified from binding to feature by RFC-0161. `docs/architecture-dna.md:119-121` explicitly states: "⚠ AGENTS: Do not reference DNA-27..34 as active invariants." The RFC body's "Architectural fit" section treats DNA-34 as an active invariant: "DNA-34 (.well-known/ discovery) — llms.txt is the prose entry point for agents; cross-referencing structured discovery endpoints strengthens the discovery surface." For a `command` kind RFC, `satisfies` is not required — it should either be empty, or the RFC body should acknowledge the reclassification and reference RFC-0028 (the governing RFC for the feature) instead.

## Axis C — Ecosystem fit

- **`semantic.parity` not mentioned**: `semantic.parity` (RFC-0146, `packages/werkstatt-site/src/checks/semantic-parity.ts`) rebuilds `llms.txt` in memory from the semantic model and compares byte-for-byte against the generated `public/llms.txt`. If `buildLlmsIndex` is amended to include agent links, `semantic.parity` must produce identical output — meaning it must also know about `agent.enabled`. The RFC does not mention this dependency. This will cause a `semantic.parity` failure on the next `build.check` after implementation.
- **`generator-ownership.ts`**: `llms.generate` is registered as the owner of `public/llms.txt` and `public/llms-full.txt` in `generator-ownership.ts:357-368`. No change needed, but the RFC could mention this for completeness.
- **Pipeline placement**: the RFC correctly states `llms.generate` runs in `build.prepare` after the agent generators. Verified in `build-prepare.ts:111`. No issue.

## Axis D — Forward-only compliance

No issues. The RFC amends the existing `buildLlmsIndex` function directly — no compatibility shims, no dual-paths, no legacy code maintained behind a flag.

## Axis E — Agent-facing policy

- No self-authorizing language found.
- Implementation notes reference correct governance rules (RFC-0224, RFC-0330, RFC-0334).
- No NEEDS CLARIFICATION markers.
- No storage policy concerns (no persistence changes).

## Axis F — Pragmatism

- **Minimal command surface**: the RFC amends an existing command — no new command for a 3-line change. Good.
- **Lean contracts**: the change is 3 new blockquoted lines in `llms.txt`. Minimal.
- **Existing patterns**: the RFC correctly reuses `canonicalStaticUrl` (already used for `agent.json` and `llms-full.txt`).
- **Scope discipline**: `packagesImpacted: [packages/werkstatt-site]` is correct — `llms.ts` is in that package. `appsImpacted: []` is correct since no apps need migration (additive change).

## Axis G — Blind spots

- **`semantic.parity` drift**: as noted in Axis C, `semantic.parity` will fail after implementation if it is not updated in the same change. This is the most significant blind spot — it will block `build.check` for all sites.
- **`llms.validate` not updated**: the RFC acknowledges this as a risk: "The existing `llms.validate` checks for `llms-full.txt` link but does not check for agent discovery links. This RFC does not add validation for the new links — they are advisory, not mandatory." This is acceptable for a minimal change, but broken links (e.g. `api-catalog` not generated) will not be caught by `llms.validate`. The `agent.api-catalog.validate` and `agent.mcp-card.validate` validators already check for endpoint existence, so this is mitigated by the pipeline.
- **Empty state**: a new site with no agent surface manifest (`agent-surface.generated.yaml` absent) will still get agent links in `llms.txt` pointing to non-existent endpoints. The RFC's failure mode "Discovery endpoints not generated" covers this, but only mentions `agent.api-catalog.generate` and `agent.mcp-card.generate` — it doesn't address the case where `agent.manifest.generate` has not run at all.

## Questions for the author

1. How does `buildLlmsIndex` access `agent.enabled`? The current `SemanticSiteModel` has no `agent` field. Does the function signature change to accept an `agentEnabled: boolean` parameter, or does `SemanticSiteModel` gain an `agent` field, or does the handler (`runLlmsGenerate`) post-process the output to strip agent links when disabled?
2. Will `semantic.parity` (RFC-0146) be updated in the same change? It rebuilds `llms.txt` in memory and compares byte-for-byte — if `buildLlmsIndex` changes, `semantic.parity` must match.
3. Why does the frontmatter say `scope: workspace` when `llms.generate` is `scope: app`? Should it be `scope: app`?
