---
rfcId: RFC-0798
auditId: AUDIT-RFC-0798-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0798

## Verdict: Needs revision

The RFC is architecturally sound and minimal — a single YAML file activating existing infrastructure. However, `satisfies: [DNA-49]` is a misattribution (DNA-49 is about Leitstand fleet propagation, not agent surface), and the capability YAML file already exists on disk despite the RFC being in `draft` status, violating the status gate.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1: `createdAt` date is likely incorrect.** The frontmatter says `createdAt: 2026-07-10`, but RFC-0798 was numbered after RFC-0790 (created 2026-08-09). The date should be `2026-08-10` or similar. This is a cosmetic issue but affects date-consistency checks.
- **A-2: YAML example in the Design section does not match the actual file on disk.** The RFC's YAML block (lines 121–166) shows a shorter `description` without the async-delivery note. The actual `lead.submit.yaml` at `packages/werkstatt-site/src/domain/ontology/capabilities/lead.submit.yaml:8-9` includes: "Die Anfrage wird asynchron zugestellt — die Bestätigung signalisiert Annahme, nicht Zustellung." The RFC should either match the actual file or explicitly note the difference.

## Axis B — DNA alignment

- **B-1 (MAJOR): `satisfies: [DNA-49]` is a misattribution.** DNA-49 is "Fleet propagation (Leitstand)" — it covers deployment channels, release state machines, CDN verification, and build-identity checks. It has nothing to do with agent surface completeness. The RFC body at lines 96–97 claims "DNA-49 (agent surface completeness): This RFC closes the gap between declared agent-readiness and actual agent-callable actions," but this is a misreading of DNA-49. There is no DNA invariant for agent surface. The RFC should either: (a) remove `satisfies` entirely if no DNA invariant applies, or (b) establish a new DNA invariant for agent surface completeness and include it in `satisfies`.

## Axis C — Ecosystem fit

- **C-1: The capability YAML file already exists on disk.** `packages/werkstatt-site/src/domain/ontology/capabilities/lead.submit.yaml` is present (45 lines, valid YAML, passes schema validation). The RFC's own implementation notes (line 245) state: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." The RFC is in `draft` status. The pre-existence of the implementation artifact violates the status gate. Either the file should not exist yet, or the RFC should acknowledge it as a pre-existing artifact being formalized.
- **C-2: Package boundaries are correct.** The capability catalog lives in `packages/werkstatt-site/src/domain/ontology/capabilities/` — the right place per the existing `CAPABILITIES_DIR` constant in `agent-capability.ts:40`.
- **C-3: Pipeline placement is correct.** The RFC correctly identifies that `build.check` runs `agent.capability.validate` and `build.prepare` runs the manifest/openapi/routes generators. No new pipeline steps are proposed.

## Axis D — Forward-only compliance

No issues. The RFC adds a new capability without proposing compatibility shims or dual-paths.

## Axis E — Agent-facing policy

- **E-1: Status gate violation (see C-1).** The implementation artifact exists before the RFC is accepted. The RFC text itself does not contain self-authorizing language — it correctly says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." But the ecosystem state contradicts this rule.
- No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

- **F-1: Appropriately minimal.** The RFC adds exactly one YAML file and zero code changes. The existing pipeline commands pick it up automatically. This is the leanest possible activation path.
- **F-2: `packagesImpacted` and `appsImpacted` are accurate.** Only `werkstatt-site` (package) and `warpgogol-com` (app) are impacted.
- **F-3: `nonGoals` are meaningful.** Excluding x402 payable layer and server-side MCP transport beyond streamable-http is a deliberate scoping decision, not boilerplate.

## Axis G — Blind spots

- **G-1: Site-wide activation vs per-page section rendering.** `resolveActiveCapabilities` checks if `send-message` renders on *any* page — the capability is then active site-wide. If `send-message` is removed from all pages, the capability becomes inactive (AGC-03). This is correct but the RFC could note that the capability is all-or-nothing per site, not per-page.
- **G-2: Dual entry point for leads.** The RFC mentions that the existing `send-message` section handles human-submitted leads via the same QStash pipeline. But it doesn't explicitly state that the agent path and the human form share the same `eventKind: lead` dispatch — agents and humans produce indistinguishable integration events. This is a design decision worth documenting.

## Questions for the author

1. Which DNA invariant does this RFC actually satisfy? DNA-49 is about Leitstand fleet propagation — is there an agent-surface DNA invariant that should be established, or should `satisfies` be empty?
2. The `lead.submit.yaml` file already exists on disk. Should the RFC acknowledge this as a pre-existing artifact being formalized, or should the file be removed until the RFC is accepted?
3. Should the RFC's YAML example match the actual file exactly (including the async-delivery note in the description), or is the shorter version intentional?
