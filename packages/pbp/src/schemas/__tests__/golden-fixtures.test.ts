/*
<MODULE_CONTRACT>
<purpose>Golden fixture tests for PBP entity Zod schemas — positive and negative cases (RFC-0466).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — golden fixture tests for all entity schemas.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { businessSchema } from "../business.js";
import { legalIdentitySchema } from "../legal-identity.js";
import { brandSchema } from "../brand.js";
import { placeSchema } from "../place.js";
import { contactPointSchema } from "../contact-point.js";
import { webPresenceSchema } from "../web-presence.js";
import { categorySchema } from "../category.js";
import { productSchema } from "../product.js";
import { productGroupSchema } from "../product-group.js";
import { productVariantSchema } from "../product-variant.js";
import { catalogSchema, catalogEntrySchema } from "../catalog.js";
import { offeringSchema } from "../offering.js";
import { policySchema } from "../policy.js";
import { slaPolicySchema } from "../sla-policy.js";
import { guaranteePolicySchema } from "../guarantee-policy.js";
import { ownershipPolicySchema } from "../ownership-policy.js";
import { exitPolicySchema } from "../exit-policy.js";
import { dataRetentionPolicySchema } from "../data-retention-policy.js";
import { claimSchema } from "../claim.js";
import { evidenceSourceSchema } from "../evidence-source.js";
import { disclosureSchema } from "../disclosure.js";
import { publicDocumentSchema } from "../public-document.js";
import { pbpSchemaById } from "../index.js";
import { pbpSchemaId } from "../../schema-id.js";

const baseEntity = {
  schema: "pbp/business@1",
  id: "webgogol",
  status: "published" as const,
};

describe("businessSchema", () => {
  it("accepts a valid business entity", () => {
    const valid = {
      ...baseEntity,
      type: "business",
      name: "Webgogol",
      summary: "Digital agency",
      yearEstablished: 2018,
    };
    expect(businessSchema.parse(valid)).toMatchObject({ name: "Webgogol" });
  });

  it("rejects empty string in name (ADR-038)", () => {
    expect(() => businessSchema.parse({ ...baseEntity, type: "business", name: "" })).toThrow();
  });

  it("rejects HTML in canonical fields (ADR-037)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        type: "business",
        name: "<strong>Webgogol</strong>",
      }),
    ).toThrow();
  });

  it("rejects locale marker in ID (ADR-025)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        id: "webgogol.de",
        type: "business",
        name: "Webgogol",
      }),
    ).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        type: "business",
        name: "Webgogol",
        unknownField: true,
      }),
    ).toThrow();
  });

  it("accepts presentation field with display strings (RFC-0482)", () => {
    const valid = {
      ...baseEntity,
      type: "business",
      name: "Webgogol",
      presentation: {
        platformComparison: {
          display: { pageText: "...", disclosure: "..." },
        },
      },
    };
    expect(businessSchema.parse(valid)).toMatchObject({
      presentation: { platformComparison: { display: { pageText: "..." } } },
    });
  });

  it("accepts entity without presentation field (RFC-0482)", () => {
    const valid = {
      ...baseEntity,
      type: "business",
      name: "Webgogol",
    };
    const parsed = businessSchema.parse(valid);
    expect(parsed.presentation).toBeUndefined();
  });

  it("rejects null presentation (RFC-0482)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        type: "business",
        name: "Webgogol",
        presentation: null,
      }),
    ).toThrow();
  });
});

describe("legalIdentitySchema", () => {
  it("accepts a valid legal-identity entity", () => {
    const valid = {
      schema: "pbp/legal-identity@1",
      id: "webgogol-legal",
      type: "legal-identity",
      status: "published",
      legalName: "Webgogol GmbH",
    };
    expect(legalIdentitySchema.parse(valid)).toMatchObject({ legalName: "Webgogol GmbH" });
  });

  it("rejects empty legalName", () => {
    expect(() =>
      legalIdentitySchema.parse({
        schema: "pbp/legal-identity@1",
        id: "webgogol-legal",
        type: "legal-identity",
        status: "published",
        legalName: "",
      }),
    ).toThrow();
  });
});

describe("brandSchema", () => {
  it("accepts a valid brand entity", () => {
    const valid = {
      schema: "pbp/brand@1",
      id: "webgogol-brand",
      type: "brand",
      status: "published",
      name: "Webgogol",
      ownerBusinessRef: { ref: "pbp/business@1:webgogol" },
    };
    expect(brandSchema.parse(valid)).toMatchObject({ name: "Webgogol" });
  });

  it("rejects missing ownerBusinessRef", () => {
    expect(() =>
      brandSchema.parse({
        schema: "pbp/brand@1",
        id: "webgogol-brand",
        type: "brand",
        status: "published",
        name: "Webgogol",
      }),
    ).toThrow();
  });
});

describe("placeSchema", () => {
  it("accepts a valid place entity", () => {
    const valid = {
      schema: "pbp/place@1",
      id: "webgogol-hq",
      type: "place",
      status: "published",
      name: "Berlin Office",
      kind: "locality",
      address: { countryCode: "DE", locality: "Berlin" },
    };
    expect(placeSchema.parse(valid)).toMatchObject({ kind: "locality" });
  });

  it("rejects invalid kind", () => {
    expect(() =>
      placeSchema.parse({
        schema: "pbp/place@1",
        id: "webgogol-hq",
        type: "place",
        status: "published",
        name: "Berlin Office",
        kind: "planet",
      }),
    ).toThrow();
  });
});

describe("contactPointSchema", () => {
  it("accepts a valid contact-point entity", () => {
    const valid = {
      schema: "pbp/contact-point@1",
      id: "webgogol-email",
      type: "contact-point",
      status: "published",
      name: "General Email",
      channel: "email",
      value: "hello@webgogol.com",
    };
    expect(contactPointSchema.parse(valid)).toMatchObject({ channel: "email" });
  });

  it("rejects invalid channel", () => {
    expect(() =>
      contactPointSchema.parse({
        schema: "pbp/contact-point@1",
        id: "webgogol-email",
        type: "contact-point",
        status: "published",
        name: "General Email",
        channel: "fax",
        value: "hello@webgogol.com",
      }),
    ).toThrow();
  });
});

describe("webPresenceSchema", () => {
  it("accepts a valid web-presence entity", () => {
    const valid = {
      schema: "pbp/web-presence@1",
      id: "webgogol-website",
      type: "web-presence",
      status: "published",
      name: "Webgogol Website",
      kind: "primary-website",
      canonicalUrl: "https://webgogol.com",
      businessRef: { ref: "pbp/business@1:webgogol" },
      control: "business-controlled",
    };
    expect(webPresenceSchema.parse(valid)).toMatchObject({ kind: "primary-website" });
  });
});

describe("productSchema", () => {
  it("accepts a valid product entity", () => {
    const valid = {
      schema: "pbp/product@1",
      id: "webgogol-seo-audit",
      type: "product",
      status: "published",
      kind: "service",
      name: "SEO Audit",
    };
    expect(productSchema.parse(valid)).toMatchObject({ kind: "service" });
  });

  it("rejects invalid kind", () => {
    expect(() =>
      productSchema.parse({
        schema: "pbp/product@1",
        id: "webgogol-seo-audit",
        type: "product",
        status: "published",
        kind: "magic",
        name: "SEO Audit",
      }),
    ).toThrow();
  });
});

describe("offeringSchema", () => {
  it("accepts a valid offering entity", () => {
    const valid = {
      schema: "pbp/offering@1",
      id: "webgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:webgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
    };
    expect(offeringSchema.parse(valid)).toMatchObject({ name: "SEO Audit Standard" });
  });

  it("accepts presentation field with price labels (RFC-0482)", () => {
    const valid = {
      schema: "pbp/offering@1",
      id: "webgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:webgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
      presentation: {
        price: { monthly: "70 € / Monat", yearly: "700 € / Jahr" },
      },
    };
    expect(offeringSchema.parse(valid)).toMatchObject({
      presentation: { price: { monthly: "70 € / Monat" } },
    });
  });

  it("rejects null presentation on offering (RFC-0482)", () => {
    expect(() =>
      offeringSchema.parse({
        schema: "pbp/offering@1",
        id: "webgogol-seo-audit-offering",
        type: "offering",
        status: "published",
        name: "SEO Audit Standard",
        businessRef: { ref: "pbp/business@1:webgogol" },
        availability: { mode: "declared" },
        pricing: { currency: "EUR" },
        presentation: null,
      }),
    ).toThrow();
  });
});

describe("policySchema", () => {
  it("accepts a valid policy entity", () => {
    const valid = {
      schema: "pbp/policy@1",
      id: "webgogol-sla",
      type: "policy",
      status: "published",
      kind: "service-level",
      name: "SLA Policy",
    };
    expect(policySchema.parse(valid)).toMatchObject({ kind: "service-level" });
  });
});

describe("slaPolicySchema", () => {
  it("accepts a valid SLA policy entity", () => {
    const valid = {
      schema: "pbp/sla-policy@1",
      id: "webgogol-sla-99",
      type: "policy",
      status: "published",
      kind: "service-level",
      name: "99.9% Uptime SLA",
      objective: {
        metricRef: "uptime",
        operator: "greater-than-or-equal",
        threshold: { value: "99.9", unitRef: "percent" },
        measurementWindow: "P1M",
      },
    };
    expect(slaPolicySchema.parse(valid)).toMatchObject({ kind: "service-level" });
  });
});

describe("claimSchema", () => {
  it("accepts a valid claim entity", () => {
    const valid = {
      schema: "pbp/claim@1",
      id: "webgogol-claim-1",
      type: "claim",
      status: "published",
      claimClass: "benefit",
      claimKind: "benefit",
      subject: { kind: "product", name: "SEO Audit" },
      statement: "Improves search visibility",
      governance: { authorityRef: "webgogol" },
    };
    expect(claimSchema.parse(valid)).toMatchObject({ claimClass: "benefit" });
  });
});

describe("evidenceSourceSchema", () => {
  it("accepts a valid evidence-source entity", () => {
    const valid = {
      schema: "pbp/evidence-source@1",
      id: "webgogol-evidence-1",
      type: "evidence-source",
      status: "published",
      name: "Google Search Console",
      kind: "external-web-sources",
      authority: { kind: "platform" },
    };
    expect(evidenceSourceSchema.parse(valid)).toMatchObject({ kind: "external-web-sources" });
  });
});

describe("disclosureSchema", () => {
  it("accepts a valid disclosure entity", () => {
    const valid = {
      schema: "pbp/disclosure@1",
      id: "webgogol-disclosure-1",
      type: "disclosure",
      status: "published",
      kind: "technology-dependency",
      name: "Cloudflare Dependency",
      statement: "Site uses Cloudflare CDN",
      materiality: "informative",
      publication: { required: true },
    };
    expect(disclosureSchema.parse(valid)).toMatchObject({ kind: "technology-dependency" });
  });
});

describe("publicDocumentSchema", () => {
  it("accepts a valid public-document entity", () => {
    const valid = {
      schema: "pbp/public-document@1",
      id: "webgogol-privacy-policy",
      type: "public-document",
      status: "published",
      kind: "privacy-policy",
      name: "Privacy Policy",
      canonicalUrl: "https://webgogol.com/privacy",
      governance: { authorityRef: "webgogol" },
    };
    expect(publicDocumentSchema.parse(valid)).toMatchObject({ kind: "privacy-policy" });
  });
});

describe("catalogSchema", () => {
  it("accepts a valid catalog entity", () => {
    const valid = {
      schema: "pbp/catalog@1",
      id: "webgogol-catalog",
      type: "catalog",
      status: "published",
      name: "Webgogol Service Catalog",
      businessRef: { ref: "pbp/business@1:webgogol" },
      entrySource: {
        mode: "manifest-directory",
        logicalPath: "src/content/business-profile/de/catalog",
      },
    };
    expect(catalogSchema.parse(valid)).toMatchObject({ name: "Webgogol Service Catalog" });
  });
});

describe("categorySchema", () => {
  it("accepts a valid category entity", () => {
    const valid = {
      schema: "pbp/category@1",
      id: "seo",
      type: "category",
      status: "published",
      name: "SEO",
    };
    expect(categorySchema.parse(valid)).toMatchObject({ name: "SEO" });
  });
});

describe("productGroupSchema", () => {
  it("accepts a valid product-group entity", () => {
    const valid = {
      schema: "pbp/product-group@1",
      id: "webgogol-audit-group",
      type: "product-group",
      status: "published",
      name: "Audit Variants",
      variationAxes: {
        depth: { attributeRef: "audit-depth", required: true },
      },
    };
    expect(productGroupSchema.parse(valid)).toMatchObject({ name: "Audit Variants" });
  });
});

describe("productVariantSchema", () => {
  it("accepts a valid product-variant entity", () => {
    const valid = {
      schema: "pbp/product-variant@1",
      id: "webgogol-audit-basic",
      type: "product-variant",
      status: "published",
      name: "Basic Audit",
      groupRef: { ref: "pbp/product-group@1:webgogol-audit-group" },
      variantValues: { depth: { valueRef: "basic" } },
    };
    expect(productVariantSchema.parse(valid)).toMatchObject({ name: "Basic Audit" });
  });
});

describe("catalogEntrySchema", () => {
  it("accepts a valid catalog-entry entity", () => {
    const valid = {
      schema: "pbp/catalog-entry@1",
      id: "webgogol-entry-seo-audit",
      type: "catalog-entry",
      status: "published",
      name: "SEO Audit Entry",
      catalogRef: { ref: "pbp/catalog@1:webgogol-catalog" },
      itemRef: { ref: "pbp/product@1:webgogol-seo-audit" },
    };
    expect(catalogEntrySchema.parse(valid)).toMatchObject({ name: "SEO Audit Entry" });
  });
});

describe("guaranteePolicySchema", () => {
  it("accepts a valid guarantee policy entity", () => {
    const valid = {
      schema: "pbp/guarantee-policy@1",
      id: "webgogol-guarantee",
      type: "policy",
      status: "published",
      kind: "guarantee",
      name: "Satisfaction Guarantee",
      condition: {
        trigger: { event: "customer-dissatisfied" },
        objective: {
          metricRef: "satisfaction",
          operator: "greater-than-or-equal",
          threshold: { value: "90", unitRef: "percent" },
        },
      },
      remedy: { type: "refund", additionalCharge: false, until: "P30D" },
    };
    expect(guaranteePolicySchema.parse(valid)).toMatchObject({ kind: "guarantee" });
  });
});

describe("ownershipPolicySchema", () => {
  it("accepts a valid ownership policy entity", () => {
    const valid = {
      schema: "pbp/ownership-policy@1",
      id: "webgogol-ownership",
      type: "policy",
      status: "published",
      kind: "ownership",
      name: "Content Ownership",
      assets: {
        customerContent: { holder: "customer" },
        builtWebsite: { holder: "customer" },
      },
    };
    expect(ownershipPolicySchema.parse(valid)).toMatchObject({ kind: "ownership" });
  });
});

describe("exitPolicySchema", () => {
  it("accepts a valid exit policy entity", () => {
    const valid = {
      schema: "pbp/exit-policy@1",
      id: "webgogol-exit",
      type: "policy",
      status: "published",
      kind: "exit",
      name: "Exit Policy",
      trigger: { event: "contract-termination" },
      deliveryTarget: { duration: "P30D" },
      package: { domain: { included: true }, customerContent: { included: true } },
    };
    expect(exitPolicySchema.parse(valid)).toMatchObject({ kind: "exit" });
  });
});

describe("dataRetentionPolicySchema", () => {
  it("accepts a valid data retention policy entity", () => {
    const valid = {
      schema: "pbp/data-retention-policy@1",
      id: "webgogol-retention",
      type: "policy",
      status: "published",
      kind: "data-retention",
      name: "Data Retention",
      retention: {
        default: { duration: "P2Y", startsFrom: "contract-end" },
      },
      deletion: { method: "secure-erase", timeline: "P30D" },
    };
    expect(dataRetentionPolicySchema.parse(valid)).toMatchObject({ kind: "data-retention" });
  });
});

describe("pbpSchemaById registry", () => {
  it("contains all expected schema IDs", () => {
    const expectedIds = [
      "business",
      "legal-identity",
      "brand",
      "place",
      "contact-point",
      "web-presence",
      "category",
      "product",
      "product-group",
      "product-variant",
      "catalog",
      "catalog-entry",
      "offering",
      "policy",
      "sla-policy",
      "guarantee-policy",
      "ownership-policy",
      "exit-policy",
      "data-retention-policy",
      "claim",
      "evidence-source",
      "disclosure",
      "public-document",
    ];
    for (const entity of expectedIds) {
      const id = pbpSchemaId(entity);
      expect(pbpSchemaById[id], `Missing schema for ${id}`).toBeDefined();
    }
  });

  it("has 23 registered schemas", () => {
    expect(Object.keys(pbpSchemaById)).toHaveLength(23);
  });
});
