/*
<MODULE_CONTRACT>
<purpose>
RFC-0288: pure resolution of the closed capability catalog into the set of
capabilities ACTIVE on a given site. A capability is active iff the site holds
`agent.actions`, every additional `requires.entitlements` is held, every
`requires.sections` archetype renders on some page, and its id is not in
`agent.actionsDisabled`. Consumed by agent.manifest.generate (RFC-0286) to
populate `AgentActionRef[]`, and by RFC-0289/0290 to project OpenAPI
operations and MCP tools.
</purpose>
<non-goals>
  <item>Do not load the catalog from disk or read entitlements/content — the
        kernel command does that and passes already-loaded data here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0288: initial capability resolution.</item>
</CHANGE_SUMMARY>
*/

import type { CapabilityRecord } from "@warpgogol/ontology";
import type { AgentActionRef } from "./manifest.ts";

export type { CapabilityRecord } from "@warpgogol/ontology";

export interface ResolveActiveCapabilitiesInput {
  catalog: CapabilityRecord[];
  /** Resolved entitlement feature ids (e.g. from entitlements.generated.yaml). */
  entitlements: string[];
  /** Section archetypes (blocks[].type) that render on some page of the app. */
  renderedSectionTypes: string[];
  /** system.md agent.actionsDisabled — capability ids to withhold even if otherwise active. */
  actionsDisabled: string[];
}

/** Pure: gate the closed catalog down to the capabilities active on this site. */
export function resolveActiveCapabilities(
  input: ResolveActiveCapabilitiesInput,
): CapabilityRecord[] {
  const entitlements = new Set(input.entitlements);
  const renderedSections = new Set(input.renderedSectionTypes);
  const disabled = new Set(input.actionsDisabled);

  if (!entitlements.has("agent.actions")) return [];

  return input.catalog.filter((cap) => {
    if (disabled.has(cap.id)) return false;
    for (const req of cap.requires.entitlements) {
      if (!entitlements.has(req)) return false;
    }
    for (const section of cap.requires.sections) {
      if (!renderedSections.has(section)) return false;
    }
    return true;
  });
}

/** Project one active capability into its manifest AgentActionRef (RFC-0286). */
export function capabilityToActionRef(cap: CapabilityRecord): AgentActionRef {
  return {
    id: cap.id,
    url: `/api/agent/actions/${cap.id}`,
    title: cap.title,
    inputSchemaRef: `#/components/schemas/${cap.id}-input`,
    entitlement: "agent.actions",
  };
}
