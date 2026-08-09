---
rfcId: RFC-0776
auditId: AUDIT-RFC-0776-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0776

## Verdict: Needs revision

The RFC is structurally sound and forward-only compliant, but contains a factual error about pinned files (DNA-62), an undeclared dependency on DNA-64 (not yet in the registry), and significant blind spots around active mission handling, cache clone impact, and rollback strategy. The empty `packagesImpacted` field understates the scope of a workspace-wide migration.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

1. **No file system responsibilities table.** The RFC touches `tools/kernel.config.ts`, `pnpm-workspace.yaml`, `forge.yaml`, `hooks/pre-commit`, CI workflows, and ~30+ package directories — but paths are scattered across prose sections (§1, §3, §4, §5, §6) without a consolidated table. RFC-0774 and RFC-0775 both include explicit "File system responsibilities" tables; this RFC should follow the same pattern.

2. **CLI surface incomplete.** The RFC mentions `werkstatt --version` as an execution gate (line 177) but does not show the exact `werkstatt run` command syntax that replaces `pnpm exec werkstatt run`. The `site-kernel` alias creation and removal (§6) are described in prose but not with exact commands. The `forge.yaml` binding rewrite (§5) is mentioned but the before/after binding values are not shown.

## Axis B — DNA alignment

3. **`satisfies: []` is empty but the RFC body references DNA-1, DNA-2, DNA-64, DNA-62** (lines 159–161). For a `command` kind RFC, `satisfies` is not required per RFC-0331. However, the "Architectural fit" section makes enforcement claims ("DNA-64 — the workshop now composes engine + plugin per the contract"). Either add the DNA IDs to `satisfies[]` to make the enforcement claim traceable, or rephrase the section as contextual fit rather than enforcement.

4. **DNA-64 does not exist in `docs/architecture-dna.md` yet.** RFC-0769 (which establishes DNA-64) is still in `draft` status. The registry currently ends at DNA-63. RFC-0776 is wave 4 in the RFC-0769 wave plan and explicitly depends on waves 0–3. The RFC should declare this dependency in `related[]` or note it in the Context section — currently `related[]` lists RFC-0769, RFC-0772, RFC-0774, RFC-0775 but does not call out the blocking dependency on RFC-0769 acceptance and DNA-64 registration.

5. **DNA-62 claim is factually incorrect for `tools/kernel.config.ts`.** The RFC states (line 161): "`tools/kernel.config.ts`, `forge.yaml`, `pnpm-workspace.yaml` are pinned; the migration updates them with `--allow-pinned-override`." However, `.forge/pinned.yaml` does NOT list `tools/kernel.config.ts`. Only `forge.yaml` (mode: protect) and `pnpm-workspace.yaml` (mode: protect) are pinned. The `--allow-pinned-override` flag is only needed for those two files, not for `kernel.config.ts`.

## Axis C — Ecosystem fit

6. **Compass sync not addressed.** A workspace-wide package consolidation and CLI rename affects `docs/PACKAGE_GRAPH.md`, `docs/COMMANDS.md`, and potentially all six Compass XML files (`docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml`, `docs/source-markup.xml`). The RFC does not identify which Compass documents need synchronization. Root AGENTS.md §Compass document duties requires this.

7. **AGENTS.md updates not addressed.** Root `AGENTS.md` references `packages/os/*` extensively (DNA-36, DNA-44, DNA-46–53, the "Monorepo layout" section, the "External mirror sync" section, etc.). Nested `packages/AGENTS.md` and `packages/os/AGENTS.md` also reference old package names. The RFC does not mention which AGENTS.md files need rule updates when old packages are deleted.

## Axis D — Forward-only compliance

No issues. The RFC explicitly rejects compatibility shims (line 193), the `site-kernel` CLI alias is a construction scaffold within this RFC's window only (lines 155, 187), and old packages are deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

8. **Implementation notes use pre-migration CLI name.** The implementation notes (lines 221, 226) reference `site-kernel run rfc.verification.emit` and `site-kernel run rfc.supersede.propose` — but this RFC itself retires the `site-kernel` CLI name (§6). The notes should use `werkstatt run` or note the transition. An agent reading the implementation notes post-migration would use a non-existent CLI name.

## Axis F — Pragmatism

9. **`packagesImpacted: []` is empty but the RFC impacts every package in the monorepo.** The RFC deletes ~30+ packages (§3) and rewrites all imports across `packages/**`, `services/**`, `missions/*/workpiece/`, hooks, and CI. Leaving `packagesImpacted` empty is a significant under-specification. At minimum, list the categories: `packages/os/*`, `packages/{fingerprint,agent-gate,ui,pbp,ontology,tokens,share,growth*,integration*,chat*,surface,geo,faq,passport,content-source,studio-gate,check-core,check-runner-node,observability,nebula,star-map,warpgogol-skills}`, `services/*`.

## Axis G — Blind spots

10. **Active mission handling not addressed.** The RFC says the sweep must cover `missions/*/workpiece/` (line 197) but does not address what happens if a mission is open during the migration. Can the migration proceed with an open mission? Should all missions be closed first? An open mission's workpiece has its own `node_modules` and git history — rewriting imports there mid-mission could conflict with ongoing work.

11. **Cache clone and archived workpiece handling not addressed.** Cache clones (`systems-cache/<id>/`) have their own `node_modules` with old package names. Archived mission workpieces (`missions/archive/closed/*/workpiece/`) may also reference old specifiers. The RFC's sweep scope (line 169: "zero old specifiers in `packages/**` and `services/**`") does not mention cache clones or archived workpieces.

12. **No rollback strategy.** The RFC says "single atomic migration" (line 186) but the sweep + config rewrite + deletion across multiple commits is not truly atomic in the database sense. If the migration fails mid-sweep (e.g. typecheck fails after partial import rewrite, or a test fixture breaks), what is the recovery? The RFC should state whether `git revert` of the commit sequence is the rollback, or whether there is a checkpoint mechanism.

## Questions for the author

1. Should all missions be closed before this RFC is implemented? What happens to an open mission's workpiece when the import sweep rewrites its files?
2. Does the sweep cover cache clones (`systems-cache/<id>/`) and archived mission workpieces, or only `packages/**`, `services/**`, and active `missions/*/workpiece/`?
3. If typecheck or tests fail after a partial import rewrite, what is the rollback strategy — `git revert` the commit sequence, or a checkpoint within the sweep?
