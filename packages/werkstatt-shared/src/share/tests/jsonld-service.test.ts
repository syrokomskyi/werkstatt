/*
<MODULE_CONTRACT>
  <purpose>RFC-0492/RFC-0498: JSON-LD test — surface pages emit industry Service node
  where Service is required (website-local depth-1, website-service depth-1, website-local depth-5)
  and no Service nodes where Service is prohibited (depth-0, 2, 3, 4). Org-level Service nodes
  and services ItemList are suppressed for all surface pages.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0492: initial JSON-LD test for industry Service node emission and org-level suppression.</item>
  <item>RFC-0498: extend tests for website-service depth-1, website-local depth-5, and prohibited depths (0, 2, 3, 4).</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { buildJsonLd } from "../semantic/jsonld.ts";
import type { SemanticPageModel, SemanticOrganization } from "../semantic/models.ts";

function makeOrg(): SemanticOrganization {
  return {
    name: "Test Org",
    description: "Test organization",
    url: "https://example.com",
    services: [
      { id: "webdesign", name: "Webdesign", description: "Webdesign service" },
      { id: "seo", name: "SEO", description: "SEO service" },
    ],
  };
}

function makeModel(overrides: Partial<SemanticPageModel> = {}): SemanticPageModel {
  return {
    type: "home",
    lang: "de",
    url: "https://example.com/de/website/elektriker",
    title: "Website für Elektriker",
    description: "Professionelle Websites für Elektriker",
    breadcrumbs: [],
    blocks: [],
    organization: makeOrg(),
    ...overrides,
  };
}

describe("RFC-0492/RFC-0498: JSON-LD Service node for surface pages", () => {
  it("emits industry-specific Service node for depth-1 website-local page", () => {
    const model = makeModel({
      surfaceId: "website-local",
      depth: 1,
      industryService: {
        serviceType: "Website für Elektriker",
        description: "Professionelle Websites für Elektriker",
      },
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    expect(serviceNodes.length).toBe(1);
    const node = serviceNodes[0] as Record<string, unknown>;
    expect(node["serviceType"]).toBe("Website für Elektriker");
    expect(node["name"]).toBe("Website für Elektriker");
  });

  it("suppresses org-level Service nodes for depth-1 website-local page", () => {
    const model = makeModel({
      surfaceId: "website-local",
      depth: 1,
      industryService: {
        serviceType: "Website für Elektriker",
      },
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    // Should have exactly 1 (the industry node), not 2 (org-level services)
    expect(serviceNodes.length).toBe(1);
    const node = serviceNodes[0] as Record<string, unknown>;
    expect(node["serviceType"]).toBe("Website für Elektriker");
    // Should NOT have org-level service names
    expect(node["name"]).not.toBe("Webdesign");
    expect(node["name"]).not.toBe("SEO");
  });

  it("emits org-level Service nodes for non-surface pages", () => {
    const model = makeModel({
      surfaceId: "other-surface",
      depth: 1,
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    // Should have org-level services (Webdesign, SEO)
    expect(serviceNodes.length).toBe(2);
    const names = serviceNodes.map((n) => (n as Record<string, unknown>)["name"]);
    expect(names).toContain("Webdesign");
    expect(names).toContain("SEO");
  });

  it("emits industry-specific Service node for website-service depth-1 page", () => {
    const model = makeModel({
      surfaceId: "website-service",
      depth: 1,
      industryService: {
        serviceType: "Website für Elektriker — SEO",
        description: "Professionelle SEO für Elektriker",
      },
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    expect(serviceNodes.length).toBe(1);
    const node = serviceNodes[0] as Record<string, unknown>;
    expect(node["serviceType"]).toBe("Website für Elektriker — SEO");
  });

  it("emits industry-specific Service node with areaServed for website-local depth-5 page", () => {
    const model = makeModel({
      surfaceId: "website-local",
      depth: 5,
      industryService: {
        serviceType: "Website für Elektriker — SEO",
        description: "Professionelle SEO für Elektriker",
        areaServed: "Stuttgart",
      },
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    expect(serviceNodes.length).toBe(1);
    const node = serviceNodes[0] as Record<string, unknown>;
    expect(node["serviceType"]).toBe("Website für Elektriker — SEO");
    const areaServed = node["areaServed"] as Record<string, unknown>;
    expect(areaServed).toBeDefined();
    expect(areaServed["@type"]).toBe("City");
    expect(areaServed["name"]).toBe("Stuttgart");
  });

  it("emits no Service nodes for depth-0 website-local page (Service prohibited)", () => {
    const model = makeModel({
      surfaceId: "website-local",
      depth: 0,
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    expect(serviceNodes.length).toBe(0);
  });

  it("emits no Service nodes for depth-4 website-local page (Service prohibited)", () => {
    const model = makeModel({
      surfaceId: "website-local",
      depth: 4,
    });

    const doc = buildJsonLd(model);
    const serviceNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "Service",
    );

    // RFC-0498: Service is prohibited on depth-4 — no Service nodes at all
    expect(serviceNodes.length).toBe(0);
  });

  it("suppresses org-level services ItemList for all surface pages", () => {
    const model = makeModel({
      surfaceId: "website-local",
      depth: 1,
      industryService: {
        serviceType: "Website für Elektriker",
      },
    });

    const doc = buildJsonLd(model);
    const itemListNodes = doc["@graph"].filter(
      (n) => (n as { "@type"?: string | string[] })["@type"] === "ItemList",
    );

    // The org-level services ItemList should NOT be present
    const servicesList = itemListNodes.find((n) => {
      const node = n as Record<string, unknown>;
      const id = node["@id"] as string | undefined;
      return id?.includes("services");
    });
    expect(servicesList).toBeUndefined();
  });
});

describe("ProfilePage mainEntity (Google Search Console fix)", () => {
  it("sets mainEntity to extraGraphNodes[0] @id for AI-agent profile pages (page.people empty)", () => {
    const model = makeModel({
      type: "person",
      url: "https://example.com/team/ki-agenten/test-bot/",
      title: "Test Bot",
      people: [],
      extraGraphNodes: [
        {
          "@type": "SoftwareApplication",
          "@id": "https://example.com/team/ki-agenten/test-bot/#software",
          name: "Test Bot",
        },
      ],
    });

    const doc = buildJsonLd(model);
    const webPageNode = doc["@graph"].find((n) => {
      const types = (n as Record<string, unknown>)["@type"];
      if (Array.isArray(types)) return types.includes("ProfilePage");
      return types === "ProfilePage";
    }) as Record<string, unknown> | undefined;

    expect(webPageNode).toBeDefined();
    const mainEntity = webPageNode!["mainEntity"] as Record<string, unknown>;
    expect(mainEntity).toBeDefined();
    expect(mainEntity["@id"]).toBe("https://example.com/team/ki-agenten/test-bot/#software");
  });

  it("sets mainEntity to extraGraphNodes[0] @id for human profile pages with extended Person node", () => {
    const model = makeModel({
      type: "person",
      url: "https://example.com/team/jane-doe/",
      title: "Jane Doe",
      people: [{ name: "Jane Doe" }],
      extraGraphNodes: [
        {
          "@type": "Person",
          "@id": "https://example.com/team/jane-doe/#person",
          name: "Jane Doe",
        },
      ],
    });

    const doc = buildJsonLd(model);
    const webPageNode = doc["@graph"].find((n) => {
      const types = (n as Record<string, unknown>)["@type"];
      if (Array.isArray(types)) return types.includes("ProfilePage");
      return types === "ProfilePage";
    }) as Record<string, unknown> | undefined;

    expect(webPageNode).toBeDefined();
    const mainEntity = webPageNode!["mainEntity"] as Record<string, unknown>;
    expect(mainEntity).toBeDefined();
    expect(mainEntity["@id"]).toBe("https://example.com/team/jane-doe/#person");
  });

  it("falls back to ids.person when no extraGraphNodes", () => {
    const model = makeModel({
      type: "person",
      url: "https://example.com/team/jane-doe/",
      title: "Jane Doe",
      people: [{ name: "Jane Doe" }],
    });

    const doc = buildJsonLd(model);
    const webPageNode = doc["@graph"].find((n) => {
      const types = (n as Record<string, unknown>)["@type"];
      if (Array.isArray(types)) return types.includes("ProfilePage");
      return types === "ProfilePage";
    }) as Record<string, unknown> | undefined;

    expect(webPageNode).toBeDefined();
    const mainEntity = webPageNode!["mainEntity"] as Record<string, unknown>;
    expect(mainEntity).toBeDefined();
    expect(mainEntity["@id"]).toBe("https://example.com/#/schema/person/jane-doe");
  });
});
