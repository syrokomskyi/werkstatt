---
rfcId: RFC-0555
auditId: AUDIT-RFC-0555-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0555

## Verdict: Needs revision

The RFC is architecturally sound — a stdio MCP server projecting Site OS commands as MCP tools with DNA-22 enforcement at the command level is a clean separation. However, several issues need resolution before implementation: DNA-56 omits `mission.abort` (12 tools vs 10 listed), `versionBump: minor` is incorrect for an additive RFC (should be `patch`), the `--content` CLI flag has shell argument length limits for large file writes, and the MCP server's working directory resolution is unspecified.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0555 --json` returned zero violations.

## Axis A — Structural completeness

- **Decision** is present tense and single: "The platform gains a `packages/studio-gate` MCP server…". Pass.
- **CLI surface** shows exact invocations with flags. Pass.
- **TypeScript contracts** are minimal type signatures. Pass.
- **File system responsibilities** table names concrete paths. Pass.
- **Output format** documents the `--json` shape. Pass.
- **Failure modes** specifies error messages but does not document exit codes (0 vs non-zero) or warn-vs-fail behavior. Minor finding — the commands throw on rejection (non-zero exit), but this should be stated explicitly.
- **Rollout** describes default behavior, existing-app impact, and new-app compliance. Pass.
- **Alternatives considered** has 5 real alternatives with rejection reasons. Pass.
- **Risks** includes agent misinterpretation and false-positive rate. Pass.
- **Acceptance criteria** items are checkable and cover the decision's scope. Pass.
- **Implementation notes** are explicit behavioral rules. Pass.

## Axis B — DNA alignment

- **DNA-56 inconsistency**: The RFC's MCP tools table (line 204) lists `mission.abort` as a tool, and the acceptance criteria (line 349) says "12 tools". However, DNA-56 in `docs/architecture-dna.md:241` lists only 10 commands: `mission.open`, `mission.materialize`, `mission.git.commit`, `mission.validate`, `mission.reconcile`, `mission.close`, `release.prepare`, `release.publish`, `leitstand.propagate` — plus `workpiece.read` and `workpiece.write`. `mission.abort` is missing from DNA-56. Either DNA-56 must be updated to include `mission.abort`, or the RFC must explain why `mission.abort` is projected as an MCP tool but not listed in the DNA invariant. **Failure.**
- `satisfies: [DNA-56]` — DNA-56 exists and was established by this RFC. The RFC body explains how it enforces DNA-22 (path validation), DNA-46 (mission lifecycle), DNA-47 (materialization), DNA-48 (release), DNA-49 (fleet propagation). Pass.
- `related[]` DNA references (DNA-22, DNA-46..49) are all real and relevant. Pass.
- No conflicts with existing DNA invariants. Pass.

## Axis C — Ecosystem fit

- **Package boundaries**: `packages/studio-gate` is a new package in `packages/*`. The RFC correctly places it there. Studio-gate imports from `@warpgogol/site-kernel` (for command execution) and reads the skill file — no `apps/*` or `services/*` imports. Pass.
- **Pipeline placement**: The RFC does not add any build pipeline checks. `workpiece.read`/`write` are runtime commands, not build-time validators. Pass — no pipeline placement needed.
- **Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. Adding a new package and new Site OS commands may require `docs/source-markup.xml` updates (new source files) and potentially `docs/requirements.xml`. **Finding — the RFC should list affected Compass XML files.**
- **AGENTS.md updates**: The RFC does not mention which `AGENTS.md` files need updates. The new `packages/studio-gate` package should get its own `AGENTS.md`, and `packages/AGENTS.md` ownership table should include it. **Finding.**
- **Cosmic naming**: Not applicable — the RFC does not touch manifests or component/section/page contracts.
- **Command lifecycle**: `commands.proposed` lists `workpiece.read` and `workpiece.write`; `commands.added` mirrors them. `changed` and `removed` are empty. Internally consistent. Pass.

## Axis D — Forward-only compliance

- No compatibility shims, bridges, or dual-paths. Pass.
- No deprecation — purely additive. Pass.
- No legacy code paths maintained behind flags. Pass.

## Axis E — Agent-facing policy

- **Status gate**: The RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Pass.
- **Implementation notes** reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Pass.
- **Anti-fabrication**: The RFC does not claim content will be auto-generated. The `wg-site-content-edit` skill is process documentation, not content authoring. Pass.
- **Storage policy**: No persistence introduced — the MCP server is stateless, all state is in the mission workpiece filesystem. Pass.
- **`versionBump: minor` is incorrect**: The frontmatter comment says `minor` means "Breaks-B, requires migrator". This RFC is purely additive — two new commands (`workpiece.read`, `workpiece.write`) and a new package (`studio-gate`). No existing command's contract changes, no existing schema is modified, no backward-incompatible change occurs. This should be `patch` (safe), not `minor`. Additionally, the RFC does not register a migrator, which `minor` requires. **Failure.**

## Axis F — Pragmatism

- **Minimal command surface**: `workpiece.read` and `workpiece.write` are two generic commands that cover the entire content editing surface. The RFC rejected granular commands (alternative 4). Pass.
- **Lean contracts**: TypeScript types are minimal — `WorkpieceReadInput`, `WorkpieceWriteInput`, `WorkpieceReadResult`, `WorkpieceWriteResult`, `ClientEditableChecker`. No speculative generality. Pass.
- **Existing patterns**: The RFC reuses existing mission lifecycle commands as-is. The `clientEditable[]` pattern matching reuses the same DNA-22 surface. The RFC says "use the same pattern matching logic as `client.edit.validate`" (line 334), but `client.edit.validate` in `packages/os/site-kernel-checks/src/client-edit.ts` reads `system.yaml` (legacy, line 183) while the workpiece uses `system.md` (canonical, per `@warpgogol/site-kernel-content`). The shared logic is the DNA-22 glob pattern matching, not the manifest loading path. **Finding — the RFC should specify that `workpiece.read`/`write` load `clientEditable[]` via `loadSystemManifest` from `@warpgogol/site-kernel-content` (which reads `system.md`), not via the `system.yaml` path used by `client.edit.validate`.**
- **Scope discipline**: `appsImpacted: []` is correct (no apps impacted). `packagesImpacted: [studio-gate, site-kernel-handoff]` is correct. `nonGoals` are explicit and meaningful. Pass.

## Axis G — Blind spots

- **`--content` flag shell argument length limit**: `workpiece.write` passes file content via `--content <content>` CLI flag (line 162). On Linux, `execve` has a ~128KB argument length limit (`MAX_ARG_STRLEN`). For large content files (e.g. a long markdown page with frontmatter), this will fail silently or truncate. The RFC should address this — either by passing content via stdin, via a temp file path, or by documenting the size limit and providing a chunked write mechanism. **Failure.**
- **Working directory resolution**: The MCP server executes commands via `child_process.exec` as `pnpm exec werkstatt run <command> <flags>` (line 219). `site-kernel run` resolves the workspace root from the current working directory (or `tools/kernel.config.ts`). The MCP server is spawned by an LLM client (Devin, Cursor, Claude Desktop) whose working directory may not be the Werkstatt root. The RFC does not specify how the MCP server resolves the workspace root. **Finding — the RFC should specify a `--werkstatt-root` flag or environment variable for the studio-gate entrypoint, passed to each `site-kernel run` invocation.**
- **Concurrent execution**: DNA-46 says "Only one open mission may exist per Sternsystem at a time." The MCP server is stateless — concurrent MCP tool calls from the LLM are possible. The RFC does not address race conditions if two tool calls target the same mission simultaneously (e.g. two `workpiece.write` calls in parallel). Mitigation: mission lifecycle commands use `acquireLock` (DNA-51), but `workpiece.read`/`write` as new commands should also use locking or document that they don't need it. **Finding.**
- **MCP SDK version pinning**: The RFC says `@modelcontextprotocol/sdk` is "pinned in `package.json`" (line 337) but does not specify a version. The TypeScript contract example (line 264) uses `version: "0.1.0"` for the server. The RFC should specify the minimum SDK version that supports `serverInfo.instructions` in the initialize response. **Minor finding.**
- **Security/privacy**: The MCP server does not touch user data or PII directly — it proxies to Site OS commands. No GDPR implications beyond what the mission lifecycle already handles. Pass.

## Questions for the author

1. DNA-56 lists 10 mission lifecycle commands but the RFC projects 12 MCP tools (adds `mission.abort`). Should DNA-56 be updated to include `mission.abort`, or should `mission.abort` be removed from the MCP tools table?
2. `versionBump: minor` requires a migrator (per the frontmatter comment), but the RFC is purely additive and registers no migrator. Should this be `patch` instead?
3. How will `workpiece.write` handle file contents exceeding the ~128KB shell argument length limit? Will it use stdin, a temp file, or chunked writes?
4. How will the studio-gate MCP server resolve the Werkstatt workspace root when spawned by an arbitrary LLM client whose working directory may differ?
5. Should `workpiece.read`/`write` use `acquireLock` (DNA-51) to prevent race conditions from concurrent MCP tool calls, or are they safe without locking since they operate on a single workpiece?
