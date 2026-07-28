---
rfcId: RFC-0504
auditId: AUDIT-RFC-0504-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0504

## Verdict: Needs revision

The RFC is missing four required sections (Architectural fit, Design, Acceptance criteria, Implementation notes for agents) and has a critical design gap: the `articleSections` slot names do not map to the mandatory H2 headings defined in RFC-0501, leaving the baker without a specification for how to extract named sections from the prose body. The cosmic name assignments for three new block types are unspecified, blocking implementation.

## Mechanical validation (rfc.validate)

Pass (exit 0) with 5 warnings:

- **V-13**: Missing required section "## Architectural fit"
- **V-13**: Missing required section "## Design"
- **V-13**: Missing required section "## Acceptance criteria"
- **V-13**: Missing required section "## Implementation notes for agents"
- **V-30**: `@gogol/ontology` is in `packagesImpacted` but `breaksC` is not `true`. If this RFC modifies `packages/ontology/src/external-surfaces/`, declare `breaksC: true` (RFC-0480).

The V-30 warning is likely a false positive — the RFC adds block types to the archetype registry (`archetypes/index.yaml`), not to `external-surfaces/`. However, the RFC should clarify this by stating it does not modify `external-surfaces/` and that `breaksC: false` is correct.

## Axis A — Structural completeness

Multiple failures:

1. **Missing "## Architectural fit"** (V-13). The RFC must explain how it relates to RFC-0478 (versioning), RFC-0479 (migrator), RFC-0480 (Layer C), DNA-16, DNA-24, and the amended RFCs (0500, 0501). Without this section, the RFC's architectural claims are ungrounded.

2. **Missing "## Design"** (V-13). The RFC has no CLI surface (exact `ratgeber.article.validate` invocation with flags), no TypeScript contracts (type signatures for `articleSections`, `changelog`, `secondaryCta`), no file system responsibilities table, no failure modes table with severity/exit codes, and no pipeline placement section. These are all required parts of the Design section.

3. **Missing "## Acceptance criteria"** (V-13, V-14). The RFC has no checkable acceptance criteria. V-14 requires ≥3 items. Without these, the RFC cannot be stamped `implemented` — there is nothing to verify against.

4. **Missing "## Implementation notes for agents"** (V-13). Agents need explicit behavioral rules: MUST NOT auto-generate prose bodies, MUST run migrator via `mission.migrate`, MUST update `amendedBy` on RFC-0500 and RFC-0501, MUST update AGENTS.md files.

5. **"## Rollout" is present** but does not substitute for Design — it lists steps but not contracts, CLI surface, or failure modes.

## Axis B — DNA alignment

1. **DNA-16** (in `satisfies[]`): The TOC is auto-generated from H2 headings — this is a navigation feature derived from the same prose body used for semantic output. The alignment is plausible but the RFC doesn't explain it explicitly (missing Architectural fit section). The RFC also says "Does not change JSON-LD emission" (nonGoal), which weakens the DNA-16 connection — if the semantic layer is unchanged, the topology-sharing claim is indirect.

2. **DNA-24** (in `satisfies[]`): The RFC adds three new block types (`article-header`, `toc`, `changelog`) to the block-declarative page system. This is consistent with DNA-24 — the blocks are frontmatter-driven and rendered through `buildPage`. However, the RFC doesn't specify which `PlanetCatalog` cosmic names to assign to the new block types (see Axis C).

3. The RFC does not establish any new DNA invariant. No issues with existing invariants.

## Axis C — Ecosystem fit

1. **Cosmic naming — CRITICAL GAP.** The RFC proposes three new block types (`article-header`, `toc`, `changelog`) and says "Add `article-header`, `toc`, `changelog` block types to `@gogol/ontology` block type catalog" (Rollout step 1). But it does not specify which `PlanetCatalog` names to assign. The `blockTypeToCosmicName` mapping in `packages/ontology/archetypes/index.yaml` requires each block type to map to a `PlanetName`. The `PlanetCatalog` is closed (DNA-19, DNA-23) — extension requires a superseding RFC. There are currently unused `PlanetCatalog` entries (e.g., `Himalia`, `Metis`, `Elara`, `Prometheus`, `Eris`, `Gonggong`, `Haumea`, `Ixion`, `Sedna`, `Varuna`) that could be assigned, but the RFC must specify the mapping explicitly. Without this, the three-way alignment (DNA-23) cannot be completed.

2. **Command lifecycle inconsistency.** `ratgeber.article.validate` appears in both `commands.proposed` and `commands.changed`. Since RFC-0501 already registered this command (it's in `commands.added` on RFC-0501), RFC-0504 should list it only in `changed`. The `proposed` bucket is for commands this RFC introduces as new — `ratgeber.article.validate` is not new.

3. **Pipeline placement not specified.** The RFC doesn't state which pipeline `ratgeber.article.validate` runs in. From RFC-0501, it runs in `build.check` (blocking) — RFC-0504 should restate this since it modifies the command.

4. **Compass sync not identified.** The RFC doesn't list which `docs/*.xml` files need synchronization. Based on the changes, it should mention: `docs/verification-plan.xml` (new validation rules), `docs/COMMANDS.md` (if any command changes), `docs/requirements.xml` (new frontmatter fields), `docs/technology.xml` (new baker logic), `docs/knowledge-graph.xml` (RFC-0504 relationships).

5. **AGENTS.md updates not identified.** The RFC should mention updating `packages/os/site-kernel-checks/AGENTS.md` (new validation rules, baker changes) and `packages/ontology/AGENTS.md` (new block types in archetype registry).

6. **Package boundaries**: OK. The baker stays in `packages/os/site-kernel-checks`, block types in `@gogol/ontology`, UI components in `@gogol/ui`. No cross-boundary violations.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only:

- The `articleSections` absent → single markdown block pattern is field-presence-driven rendering (standard in this ecosystem), not a compatibility shim.
- The migrator transforms existing data in-place (adds empty arrays, strips H1 headings). No dual-path.
- No legacy code paths are maintained behind flags.

## Axis E — Agent-facing policy

1. **Missing implementation notes** (also V-13). Without "## Implementation notes for agents", agents lack behavioral rules. Critical missing rules:
   - MUST NOT auto-generate prose bodies (the H1 stripping migrator transforms existing content, but agents must not create new prose).
   - MUST run migrator via `mission.migrate` — not by manually editing content files.
   - MUST update `amendedBy` on RFC-0500 and RFC-0501 to include RFC-0504.
   - MUST update `packages/os/site-kernel-checks/AGENTS.md` to document new validation rules and baker changes.

2. **Status gate**: OK — the RFC is `draft` and contains no self-authorizing language.

3. **Anti-fabrication**: The RFC's success signals describe code-verifiable behavior (block rendering, validation rules). The H1 stripping migrator transforms existing content — it does not create new content. No issues.

4. **Storage policy**: No persistence changes. No issues.

## Axis F — Pragmatism

1. **`@gogol/share` in `packagesImpacted` may be unnecessary.** The RFC lists `@gogol/share` but doesn't explain what changes in it. The baker is in `site-kernel-checks`, block types in `ontology`, UI components in `ui`. `@gogol/share` exports `buildPage()` which is generic — it resolves blocks without knowing specific block types. If `@gogol/share` doesn't need changes, remove it from `packagesImpacted`. If it does, justify why.

2. **Minimal command surface**: OK — the RFC extends existing commands, doesn't propose new ones (despite the `proposed` bucket error).

3. **Lean contracts**: The YAML examples are minimal. But without TypeScript contracts (missing Design section), the types for `articleSections`, `changelog`, `secondaryCta` are not formally specified.

4. **Scope discipline**: `nonGoals` are explicit and meaningful. `appsImpacted` is correct (`warpgogol-com` only).

## Axis G — Blind spots

1. **`articleSections` slot names do not map to mandatory H2 headings — CRITICAL DESIGN GAP.** The RFC defines valid slot names: `direct-answer`, `definitions`, `analysis`, `example`, `checklist`, `limitations`, `sources`, `warpgogol-connection`. But RFC-0501's mandatory 10-section structure uses H2 headings: `## Einleitung`, `## Kernfrage`, `## Wissensbasis`, `## Praxisbezug`, `## Häufige Missverständnisse`, `## Kosten und Trade-offs`, `## Checkliste`, `## FAQ`, `## Zusammenfassung`, `## Quellen` (DE) / `## Вступ`, `## Ключове питання`, `## База знань`, `## Практична частина`, `## Поширені помилки`, `## Витрати і компроміси`, `## Контрольний список`, `## Поширені запитання`, `## Підсумок`, `## Джерела` (UK). The slot names don't correspond to the H2 heading text. The baker needs a mapping table (e.g., `direct-answer` → `## Kernfrage` / `## Ключове питання`) to extract the right section. The RFC must specify this mapping explicitly for both DE and UK.

2. **`warpgogol-connection` slot has no corresponding mandatory section.** It's in the valid set but not in RFC-0501's 10-section structure. Is it an optional H2 heading that articles may include? Where does it go in the heading order? The RFC must clarify.

3. **RG-ART-07 false positives.** The rule checks `^# ` lines in prose body. This could false-positive on:
   - Markdown comments (`# comment` inside HTML comment blocks)
   - Code blocks (fenced ``` blocks containing `# ` lines — e.g., shell commands)
   The RFC should specify that the check skips fenced code blocks and HTML comments.

4. **H1 stripping migrator risk.** The migrator converts unique H1 headings to H2. If the prose body already has an H2 with the same text, this creates a duplicate H2 heading. The RFC should specify how to handle this (e.g., skip conversion if an H2 with the same text already exists, or append a suffix).

5. **Missing section in `articleSections` extraction.** What happens when `articleSections` lists a slot name (e.g., `definitions`) but the corresponding H2 heading is not present in the prose body? The baker should handle this gracefully (skip the block or emit a warning). The RFC doesn't address this.

6. **Performance**: TOC auto-generation is a simple regex scan of H2 headings — low cost. No issues.

7. **Security/privacy**: No PII or external service changes. No issues.

## Questions for the author

1. Which `PlanetCatalog` cosmic names will be assigned to `article-header`, `toc`, and `changelog` block types? The `PlanetCatalog` is closed (DNA-19) — specify the exact mapping for `blockTypeToCosmicName` in `archetypes/index.yaml`.

2. How do `articleSections` slot names (`direct-answer`, `definitions`, `analysis`, etc.) map to the mandatory H2 headings from RFC-0501 (`## Kernfrage`, `## Wissensbasis`, `## Praxisbezug`, etc.)? The baker needs an explicit mapping table for both DE and UK to extract the correct section content.

3. Where does the `warpgogol-connection` slot fit in the mandatory 10-section heading order? It's not in RFC-0501's structure — is it an optional H2 heading? If so, where should authors place it, and does `ratgeber.article.validate` need to check for its presence or absence?

4. Should `@gogol/share` remain in `packagesImpacted`? If so, what specific changes does it need? If not, remove it.

5. How does RG-ART-07 avoid false positives on `# ` lines inside fenced code blocks or HTML comments in the prose body?
