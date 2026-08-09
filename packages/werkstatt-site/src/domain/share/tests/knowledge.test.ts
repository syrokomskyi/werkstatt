/*
<MODULE_CONTRACT>
<purpose>RFC-0287: shape + determinism tests for the knowledge envelope formatter.</purpose>
<keywords>RFC-0287, agent surface, knowledge, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">domain list, envelope shape, determinism, hash stability.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0287: initial knowledge formatter tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  AGENT_KNOWLEDGE_DOMAINS,
  isAgentKnowledgeDomain,
  formatAgentKnowledge,
} from "../agent/knowledge.ts";
import { BUSINESS_DOMAIN_VISIBILITY } from "../semantic/business-projection.ts";

test("AGENT_KNOWLEDGE_DOMAINS: matches exactly the `public` BUSINESS_DOMAIN_VISIBILITY keys", () => {
  const publicDomains = Object.entries(BUSINESS_DOMAIN_VISIBILITY)
    .filter(([, visibility]) => visibility === "public")
    .map(([domain]) => domain)
    .sort();
  expect([...AGENT_KNOWLEDGE_DOMAINS].sort()).toEqual(publicDomains);
});

test("isAgentKnowledgeDomain: rejects non-public domains", () => {
  expect(isAgentKnowledgeDomain("offer")).toBe(true);
  expect(isAgentKnowledgeDomain("compliance")).toBe(false);
  expect(isAgentKnowledgeDomain("externalServices")).toBe(false);
  expect(isAgentKnowledgeDomain("meta")).toBe(false);
});

test("formatAgentKnowledge: sets the schema tag with @1 version and strips trailing slash", () => {
  const env = formatAgentKnowledge({
    domain: "offer",
    site: "warpgogol-com",
    baseUrl: "https://warpgogol.com/",
    languages: { default: "de", supported: ["de", "uk"] },
    data: { de: { prices: [] } },
  });
  expect(env.schema).toBe("gogol.agent.knowledge/offer@1");
  expect(env.baseUrl).toBe("https://warpgogol.com");
});

test("formatAgentKnowledge: omits freshness when not supplied, includes it when supplied", () => {
  const withoutFreshness = formatAgentKnowledge({
    domain: "company",
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    data: { de: {} },
  });
  expect("freshness" in withoutFreshness).toBe(false);

  const withFreshness = formatAgentKnowledge({
    domain: "company",
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    data: { de: {} },
    freshness: { lastVerified: "2026-07-01", source: "ckl-claim-ledger", coverage: "domain" },
  });
  expect(withFreshness.freshness).toEqual({
    lastVerified: "2026-07-01",
    source: "ckl-claim-ledger",
    coverage: "domain",
  });
});

test("formatAgentKnowledge: deterministic across repeated calls", () => {
  const input = {
    domain: "faq" as const,
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de", "en"] },
    data: { de: [{ question: "Q", answer: "A" }] },
  };
  const a = formatAgentKnowledge(input);
  const b = formatAgentKnowledge(input);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a.contentHash).toBe(b.contentHash);
});
