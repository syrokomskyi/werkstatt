---
rfcId: RFC-0799
auditId: AUDIT-RFC-0799-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0799

## Verdict: Needs revision

The RFC describes a progressive-enhancement WebMCP script, but contains a critical DNA mismatch (DNA-49 is "Fleet propagation", not "agent surface completeness"), a factual error in the Design section (claims the script reads from an embedded `<script id="agent-surface">` tag that does not exist in the codebase), and a file path with an extra `src/` segment. The implementation already exists in the codebase despite the RFC being in `draft` status, and the implementation differs from the RFC's described design.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1 (Design section factual error):** The Design section states the script "Reads the agent surface manifest from the embedded `<script type="application/json" id="agent-surface">` tag (already present in the page head for JSON-LD consumers)." No such script tag exists anywhere in the codebase (grep for `id="agent-surface"` returns zero results in layout or page templates). The actual implementation passes the manifest via `define:vars` from Astro frontmatter, not from a DOM element. The Design section must be corrected to match the actual approach.

- **A-2 (File path error):** The File system responsibilities table lists `packages/werkstatt-site/src/domain/ui/src/components/agent-webmcp/agent-webmcp-script.astro` — note the extra `src/` segment after `ui/`. The actual and correct path is `packages/werkstatt-site/src/domain/ui/components/agent-webmcp/agent-webmcp-script.astro`.

- **A-3 (Implementation notes contradiction):** Implementation notes say "Use `define:vars` to pass the manifest from Astro frontmatter to the inline script" — this is correct and matches the implementation, but directly contradicts the Design section's claim that the script reads from an embedded JSON script tag. These two sections describe mutually exclusive approaches.

- **A-4 (Missing app-level integration step):** The RFC says the layout includes the component, but doesn't describe how the `agentSurfaceManifest` prop flows from the page handler / proxy layout to the shared layout component. The `appsImpacted: [warpgogol-com]` entry implies app-level changes, but no file path in the app workspace is listed in the File system responsibilities table.

## Axis B — DNA alignment

- **B-1 (Wrong DNA invariant — CRITICAL):** `satisfies: [DNA-49]` and the Architectural fit section says "DNA-49 (agent surface completeness): This RFC extends the agent surface to the browser runtime, closing the last discovery gap." But DNA-49 in `docs/architecture-dna.md` is "Fleet propagation (Leitstand)" — about deployment pipelines, release state machines, and CDN verification. It has nothing to do with agent surface completeness. There is no DNA invariant named "agent surface completeness" in the architecture DNA file. The RFC must either: (a) reference the correct existing DNA invariant, (b) propose a new DNA invariant and include it in `satisfies[]`, or (c) drop the `satisfies` claim if no DNA invariant applies.

## Axis C — Ecosystem fit

- **C-1 (Missing `agent.enabled` gate specification):** The Rollout section says "The script is included in the default layout only when `agent.enabled` is not false (same gate as `llms.txt` agent links)." But the layout component (`layout-component.astro`) does not check `agent.enabled` — it unconditionally renders `<AgentWebmcpScript manifest={agentSurfaceManifest} />`. The RFC must specify where this gate is enforced (page handler? proxy layout? system config resolution?) and list the corresponding file in the File system responsibilities table.

- **C-2 (No AGENTS.md updates identified):** The RFC introduces a new browser-side agent surface channel but does not identify which `AGENTS.md` files need rule updates. The root `AGENTS.md` or `packages/werkstatt-site/AGENTS.md` may need a note about the WebMCP component and its progressive-enhancement contract.

- **C-3 (No subpath export mentioned):** The component is imported via relative path within the package (`../agent-webmcp/agent-webmcp-script.astro`). If sites in mission workpieces need to import it directly (e.g. for custom layouts), a subpath export in `packages/werkstatt-site/package.json` would be needed. The RFC should state whether this is intended or not.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — no legacy paths, no compatibility shims, no dual-paths.

## Axis E — Agent-facing policy

- **E-1 (Premature implementation — status gate):** The RFC is in `draft` status, but `agent-webmcp-script.astro` already exists in the codebase and is integrated into `layout-component.astro` (import at line 31, usage at line 214). The RFC's own implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." The implementation was created before the RFC was accepted. This is a process violation, not a text defect, but the audit must record it. The RFC should either be transitioned to `accepted` (if the operator approves the design) or the implementation should be noted as pre-existing.

- **E-2 (Empty reviewers):** `reviewers: []` — will fail V-25 when stamping as `implemented`. Add at least one reviewer before the status transition.

- **E-3 (No unresolved NEEDS CLARIFICATION markers):** No markers found.

## Axis F — Pragmatism

- **F-1 (Minimal and appropriate):** The script is a small inline progressive-enhancement snippet. No new commands, no new schemas, no over-engineering. The approach of reading from a prop rather than a DOM script tag (per the actual implementation) is simpler than the RFC's described approach.

- **F-2 (Scope discipline):** `packagesImpacted: [werkstatt-site]` and `appsImpacted: [warpgogol-com]` are correct and minimal. `nonGoals` are meaningful.

## Axis G — Blind spots

- **G-1 (`import.meta.env.DEV` in `is:inline` script):** The implementation uses `import.meta.env.DEV` inside an `is:inline` script. Astro `is:inline` scripts are not processed by Vite's transform pipeline — `import.meta.env` may not be replaced and could be `undefined` at runtime, causing the `console.warn` guard to throw rather than suppress. The RFC should specify how dev-mode detection works in an inline script context (e.g. use a frontmatter boolean passed via `define:vars` instead).

- **G-2 (No TypeScript declaration for `document.modelContext`):** The implementation accesses `document.modelContext` without a TypeScript type declaration. The RFC defines `DocumentModelContext` and `DocumentWithModelContext` interfaces, but the implementation doesn't use them. Astro's type checking may flag `document.modelContext` as an error. The RFC should specify whether a global type augmentation file is needed.

- **G-3 (No test plan):** The acceptance criteria are checkable ("Script exits silently when `document.modelContext` is undefined", "No console errors in browsers without WebMCP support") but the RFC does not describe how to verify them. A unit test or Playwright-based check would be appropriate.

## Questions for the author

1. Which DNA invariant does this RFC actually satisfy? DNA-49 is "Fleet propagation (Leitstand)", not "agent surface completeness". Is there an existing DNA invariant for the agent surface, or should this RFC establish a new one?
2. The Design section says the script reads from an embedded `<script type="application/json" id="agent-surface">` tag, but no such tag exists in the codebase and the implementation uses `define:vars` instead. Which approach is canonical — should the RFC be corrected to match the implementation, or should the implementation be changed to match the RFC?
3. Where is the `agent.enabled` gate enforced? The layout renders the component unconditionally — is the gate at the page handler level, the proxy layout, or somewhere else?
