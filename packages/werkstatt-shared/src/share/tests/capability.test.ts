/*
<MODULE_CONTRACT>
<purpose>RFC-0288: gating-logic tests for resolveActiveCapabilities.</purpose>
<keywords>RFC-0288, agent surface, capability, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">entitlement gating, section gating, disabled-list, no agent.actions.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0288: initial capability resolution tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  resolveActiveCapabilities,
  capabilityToActionRef,
  type CapabilityRecord,
} from "../agent/capability.ts";

function makeCap(overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return {
    id: "lead.submit",
    version: 1,
    kind: "action",
    title: { de: "x", en: "x" },
    description: { de: "x", en: "x" },
    input: { type: "object", additionalProperties: false, properties: {} },
    output: { type: "object", additionalProperties: false, properties: {} },
    integration: { eventKind: "lead", source: "agent" },
    requires: { entitlements: [], sections: ["send-message"] },
    humanEquivalent: { sectionType: "send-message" },
    limits: { perMinutePerIp: 10, maxPayloadBytes: 16384 },
    ...overrides,
  };
}

test("resolveActiveCapabilities: empty when agent.actions is not entitled", () => {
  const result = resolveActiveCapabilities({
    catalog: [makeCap()],
    entitlements: [],
    renderedSectionTypes: ["send-message"],
    actionsDisabled: [],
  });
  expect(result).toEqual([]);
});

test("resolveActiveCapabilities: active when agent.actions held + section renders", () => {
  const result = resolveActiveCapabilities({
    catalog: [makeCap()],
    entitlements: ["agent.actions"],
    renderedSectionTypes: ["send-message", "hero"],
    actionsDisabled: [],
  });
  expect(result.length).toBe(1);
  expect(result[0]!.id).toBe("lead.submit");
});

test("resolveActiveCapabilities: inactive when required section does not render", () => {
  const result = resolveActiveCapabilities({
    catalog: [makeCap()],
    entitlements: ["agent.actions"],
    renderedSectionTypes: ["hero"],
    actionsDisabled: [],
  });
  expect(result).toEqual([]);
});

test("resolveActiveCapabilities: inactive when an extra required entitlement is missing", () => {
  const cap = makeCap({
    id: "appointment.request",
    requires: { entitlements: ["booking"], sections: ["booking"] },
  });
  const withoutBooking = resolveActiveCapabilities({
    catalog: [cap],
    entitlements: ["agent.actions"],
    renderedSectionTypes: ["booking"],
    actionsDisabled: [],
  });
  expect(withoutBooking).toEqual([]);

  const withBooking = resolveActiveCapabilities({
    catalog: [cap],
    entitlements: ["agent.actions", "booking"],
    renderedSectionTypes: ["booking"],
    actionsDisabled: [],
  });
  expect(withBooking.length).toBe(1);
});

test("resolveActiveCapabilities: actionsDisabled withholds an otherwise-active capability", () => {
  const result = resolveActiveCapabilities({
    catalog: [makeCap()],
    entitlements: ["agent.actions"],
    renderedSectionTypes: ["send-message"],
    actionsDisabled: ["lead.submit"],
  });
  expect(result).toEqual([]);
});

test("capabilityToActionRef: projects id/url/title/entitlement", () => {
  const ref = capabilityToActionRef(makeCap());
  expect(ref.id).toBe("lead.submit");
  expect(ref.url).toBe("/api/agent/actions/lead.submit");
  expect(ref.entitlement).toBe("agent.actions");
  expect(ref.title).toEqual({ de: "x", en: "x" });
});
