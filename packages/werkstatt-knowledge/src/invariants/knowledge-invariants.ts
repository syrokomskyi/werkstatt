/*
<MODULE_CONTRACT>
<purpose>Knowledge stack invariants KNO-001..028 surfaced to agents.</purpose>
<keywords>invariants, knowledge, evidence, plugin</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge stack invariants KNO-001..028 per PLUGIN-INVARIANTS.md.</item>
</CHANGE_SUMMARY>
*/

import type { StackInvariant } from "@warpgogol/werkstatt/plugin";

export const KNOWLEDGE_INVARIANTS: StackInvariant[] = [
  {
    id: "KNO-001",
    description: "Canonical manifest id exists and is valid.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-002",
    description: "Source root resolves only as ../<kb-id>-source.",
    check: "knowledge.source.scan",
  },
  {
    id: "KNO-003",
    description: "Registered source unit has valid README/package version metadata.",
    check: "knowledge.source.verify",
  },
  {
    id: "KNO-004",
    description: "No KB operation writes/mutates source bundle/payload.",
    check: "knowledge.source.verify",
  },
  {
    id: "KNO-005",
    description: "Current source fingerprint/version matches canonical binding for release.",
    check: "knowledge.source.status",
  },
  {
    id: "KNO-006",
    description: "Source-controlled code is not executed by default extractor policy.",
    check: "knowledge.extract.run",
  },
  {
    id: "KNO-007",
    description: "knowledge/ contains only schema-valid canonical record forms.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-008",
    description: "Canonical record ids are unique and keys/aliases do not collide.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-009",
    description: "All evidence resolves to current source binding.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-010",
    description: "Required semantic claims/relations have sufficient evidence/review.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-011",
    description: "All relation types are registered and domain/range valid.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-012",
    description: "Canonical epistemic status excludes speculation.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-013",
    description: "Canonical human-authored semantic language is English.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-014",
    description: "staging/ records are excluded from canonical export.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-015",
    description: "laboratory/ records cannot appear as canonical authority.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-016",
    description: "Global ontology/normative changes reference accepted RFC.",
    check: "knowledge.audit",
  },
  {
    id: "KNO-017",
    description: "Cross-game concept admission/merge/split references accepted decision.",
    check: "knowledge.audit",
  },
  {
    id: "KNO-018",
    description: "Coverage claims satisfy denominator/verifier rules.",
    check: "knowledge.coverage",
  },
  {
    id: "KNO-019",
    description: "Materialized/projection canonical hash matches current canonical state.",
    check: "knowledge.materialize.verify",
  },
  {
    id: "KNO-020",
    description: "No public/repository secrets detected.",
    check: "knowledge.audit",
  },
  {
    id: "KNO-021",
    description: "Public release has explicit dataset license/publication metadata.",
    check: "knowledge.release.check",
  },
  {
    id: "KNO-022",
    description: "Public evidence excerpts obey per-source publication policy.",
    check: "knowledge.release.check",
  },
  {
    id: "KNO-023",
    description: "Generated similarity does not appear as an unreviewed canonical relation.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-024",
    description: "Workshop resolves werkstatt-knowledge as the sole current Werkstatt plugin.",
    check: "knowledge.verify",
  },
  {
    id: "KNO-025",
    description: "Source bundle is outside npm/Turbo workspace globs.",
    check: "knowledge.source.scan",
  },
  {
    id: "KNO-026",
    description: "Canonical mutation uses transaction/promotion pathway.",
    check: "knowledge.promote",
  },
  {
    id: "KNO-027",
    description: "Materialization is deterministic for identical canonical input/builder version.",
    check: "knowledge.materialize.verify",
  },
  {
    id: "KNO-028",
    description: "Open source-unit evidence uses resolvable repo/commit/path metadata when available.",
    check: "knowledge.source.verify",
  },
];
