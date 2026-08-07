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
import { pbpCurrencyPricingPolicySchema } from "../currency-pricing-policy.js";
import { pbpSchemaById } from "../index.js";
import { pbpSchemaId } from "../../schema-id.js";

const baseEntity = {
  schema: "pbp/business@1",
  id: "warpgogol",
  status: "published" as const,
};

describe("businessSchema", () => {
  it("accepts a valid business entity", () => {
    const valid = {
      ...baseEntity,
      type: "business",
      name: "Warpgogol",
      summary: "Digital agency",
      yearEstablished: 2018,
    };
    expect(businessSchema.parse(valid)).toMatchObject({ name: "Warpgogol" });
  });

  it("rejects empty string in name (ADR-038)", () => {
    expect(() => businessSchema.parse({ ...baseEntity, type: "business", name: "" })).toThrow();
  });

  it("rejects HTML in canonical fields (ADR-037)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        type: "business",
        name: "<strong>Warpgogol</strong>",
      }),
    ).toThrow();
  });

  it("rejects locale marker in ID (ADR-025)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        id: "warpgogol.de",
        type: "business",
        name: "Warpgogol",
      }),
    ).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        type: "business",
        name: "Warpgogol",
        unknownField: true,
      }),
    ).toThrow();
  });

  it("accepts presentation field with display strings (RFC-0482)", () => {
    const valid = {
      ...baseEntity,
      type: "business",
      name: "Warpgogol",
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
      name: "Warpgogol",
    };
    const parsed = businessSchema.parse(valid);
    expect(parsed.presentation).toBeUndefined();
  });

  it("rejects null presentation (RFC-0482)", () => {
    expect(() =>
      businessSchema.parse({
        ...baseEntity,
        type: "business",
        name: "Warpgogol",
        presentation: null,
      }),
    ).toThrow();
  });
});

describe("legalIdentitySchema", () => {
  it("accepts a valid legal-identity entity", () => {
    const valid = {
      schema: "pbp/legal-identity@1",
      id: "warpgogol-legal",
      type: "legal-identity",
      status: "published",
      legalName: "Warpgogol GmbH",
    };
    expect(legalIdentitySchema.parse(valid)).toMatchObject({ legalName: "Warpgogol GmbH" });
  });

  it("rejects empty legalName", () => {
    expect(() =>
      legalIdentitySchema.parse({
        schema: "pbp/legal-identity@1",
        id: "warpgogol-legal",
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
      id: "warpgogol-brand",
      type: "brand",
      status: "published",
      name: "Warpgogol",
      ownerBusinessRef: { ref: "pbp/business@1:warpgogol" },
    };
    expect(brandSchema.parse(valid)).toMatchObject({ name: "Warpgogol" });
  });

  it("rejects missing ownerBusinessRef", () => {
    expect(() =>
      brandSchema.parse({
        schema: "pbp/brand@1",
        id: "warpgogol-brand",
        type: "brand",
        status: "published",
        name: "Warpgogol",
      }),
    ).toThrow();
  });
});

describe("placeSchema", () => {
  it("accepts a valid place entity", () => {
    const valid = {
      schema: "pbp/place@1",
      id: "warpgogol-hq",
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
        id: "warpgogol-hq",
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
      id: "warpgogol-email",
      type: "contact-point",
      status: "published",
      name: "General Email",
      channel: "email",
      value: "hello@warpgogol.com",
    };
    expect(contactPointSchema.parse(valid)).toMatchObject({ channel: "email" });
  });

  it("rejects invalid channel", () => {
    expect(() =>
      contactPointSchema.parse({
        schema: "pbp/contact-point@1",
        id: "warpgogol-email",
        type: "contact-point",
        status: "published",
        name: "General Email",
        channel: "fax",
        value: "hello@warpgogol.com",
      }),
    ).toThrow();
  });
});

describe("webPresenceSchema", () => {
  it("accepts a valid web-presence entity", () => {
    const valid = {
      schema: "pbp/web-presence@1",
      id: "warpgogol-website",
      type: "web-presence",
      status: "published",
      name: "Warpgogol Website",
      kind: "primary-website",
      canonicalUrl: "https://warpgogol.com",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      control: "business-controlled",
    };
    expect(webPresenceSchema.parse(valid)).toMatchObject({ kind: "primary-website" });
  });
});

describe("productSchema", () => {
  it("accepts a valid product entity", () => {
    const valid = {
      schema: "pbp/product@1",
      id: "warpgogol-seo-audit",
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
        id: "warpgogol-seo-audit",
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
      id: "warpgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
    };
    expect(offeringSchema.parse(valid)).toMatchObject({ name: "SEO Audit Standard" });
  });

  it("rejects presentation field on offering (RFC-0730)", () => {
    const valid = {
      schema: "pbp/offering@1",
      id: "warpgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
      presentation: {
        price: { monthly: "70 \u20ac / Monat", yearly: "700 \u20ac / Jahr" },
      },
    };
    expect(() => offeringSchema.parse(valid)).toThrow();
  });

  it("rejects null presentation on offering (RFC-0730)", () => {
    expect(() =>
      offeringSchema.parse({
        schema: "pbp/offering@1",
        id: "warpgogol-seo-audit-offering",
        type: "offering",
        status: "published",
        name: "SEO Audit Standard",
        businessRef: { ref: "pbp/business@1:warpgogol" },
        availability: { mode: "declared" },
        pricing: { currency: "EUR" },
        presentation: null,
      }),
    ).toThrow();
  });

  it("accepts guarantees field with label and detail (RFC-0730)", () => {
    const valid = {
      schema: "pbp/offering@1",
      id: "warpgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
      guarantees: {
        delivery: { label: "Delivery", detail: "Within 5 business days" },
      },
    };
    expect(offeringSchema.parse(valid)).toMatchObject({
      guarantees: { delivery: { label: "Delivery" } },
    });
  });

  it("rejects guarantees with missing label (RFC-0730)", () => {
    expect(() =>
      offeringSchema.parse({
        schema: "pbp/offering@1",
        id: "warpgogol-seo-audit-offering",
        type: "offering",
        status: "published",
        name: "SEO Audit Standard",
        businessRef: { ref: "pbp/business@1:warpgogol" },
        availability: { mode: "declared" },
        pricing: { currency: "EUR" },
        guarantees: {
          delivery: { detail: "Within 5 business days" },
        },
      }),
    ).toThrow();
  });

  it("rejects guarantees with missing detail (RFC-0730)", () => {
    expect(() =>
      offeringSchema.parse({
        schema: "pbp/offering@1",
        id: "warpgogol-seo-audit-offering",
        type: "offering",
        status: "published",
        name: "SEO Audit Standard",
        businessRef: { ref: "pbp/business@1:warpgogol" },
        availability: { mode: "declared" },
        pricing: { currency: "EUR" },
        guarantees: {
          delivery: { label: "Delivery" },
        },
      }),
    ).toThrow();
  });

  it("accepts relatedOfferings with label and description (RFC-0730)", () => {
    const valid = {
      schema: "pbp/offering@1",
      id: "warpgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
      relatedOfferings: {
        growth: {
          relation: "optional",
          offeringRef: { ref: "pbp/offering@1:growth-module" },
          acquisition: "standalone",
          label: "Growth Module",
          description: "Up to 12 target pages",
        },
      },
    };
    expect(offeringSchema.parse(valid)).toMatchObject({
      relatedOfferings: {
        growth: { label: "Growth Module" },
      },
    });
  });

  it("accepts relatedOfferings without label/description (backward compat, RFC-0730)", () => {
    const valid = {
      schema: "pbp/offering@1",
      id: "warpgogol-seo-audit-offering",
      type: "offering",
      status: "published",
      name: "SEO Audit Standard",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      availability: { mode: "declared" },
      pricing: { currency: "EUR" },
      relatedOfferings: {
        growth: {
          relation: "optional",
          offeringRef: { ref: "pbp/offering@1:growth-module" },
        },
      },
    };
    expect(offeringSchema.parse(valid)).toMatchObject({
      relatedOfferings: {
        growth: { relation: "optional" },
      },
    });
  });
});

describe("policySchema", () => {
  it("accepts a valid policy entity", () => {
    const valid = {
      schema: "pbp/policy@1",
      id: "warpgogol-sla",
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
      id: "warpgogol-sla-99",
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
      id: "warpgogol-claim-1",
      type: "claim",
      status: "published",
      claimClass: "benefit",
      claimKind: "benefit",
      subject: { kind: "product", name: "SEO Audit" },
      statement: "Improves search visibility",
      governance: { authorityRef: "warpgogol" },
    };
    expect(claimSchema.parse(valid)).toMatchObject({ claimClass: "benefit" });
  });
});

describe("evidenceSourceSchema", () => {
  it("accepts a valid evidence-source entity", () => {
    const valid = {
      schema: "pbp/evidence-source@1",
      id: "warpgogol-evidence-1",
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
      id: "warpgogol-disclosure-1",
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
      id: "warpgogol-privacy-policy",
      type: "public-document",
      status: "published",
      kind: "privacy-policy",
      name: "Privacy Policy",
      canonicalUrl: "https://warpgogol.com/privacy",
      governance: { authorityRef: "warpgogol" },
    };
    expect(publicDocumentSchema.parse(valid)).toMatchObject({ kind: "privacy-policy" });
  });
});

describe("catalogSchema", () => {
  it("accepts a valid catalog entity", () => {
    const valid = {
      schema: "pbp/catalog@1",
      id: "warpgogol-catalog",
      type: "catalog",
      status: "published",
      name: "Warpgogol Service Catalog",
      businessRef: { ref: "pbp/business@1:warpgogol" },
      entrySource: {
        mode: "manifest-directory",
        logicalPath: "src/content/business-profile/de/catalog",
      },
    };
    expect(catalogSchema.parse(valid)).toMatchObject({ name: "Warpgogol Service Catalog" });
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
      id: "warpgogol-audit-group",
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
      id: "warpgogol-audit-basic",
      type: "product-variant",
      status: "published",
      name: "Basic Audit",
      groupRef: { ref: "pbp/product-group@1:warpgogol-audit-group" },
      variantValues: { depth: { valueRef: "basic" } },
    };
    expect(productVariantSchema.parse(valid)).toMatchObject({ name: "Basic Audit" });
  });
});

describe("catalogEntrySchema", () => {
  it("accepts a valid catalog-entry entity", () => {
    const valid = {
      schema: "pbp/catalog-entry@1",
      id: "warpgogol-entry-seo-audit",
      type: "catalog-entry",
      status: "published",
      name: "SEO Audit Entry",
      catalogRef: { ref: "pbp/catalog@1:warpgogol-catalog" },
      itemRef: { ref: "pbp/product@1:warpgogol-seo-audit" },
    };
    expect(catalogEntrySchema.parse(valid)).toMatchObject({ name: "SEO Audit Entry" });
  });
});

describe("guaranteePolicySchema", () => {
  it("accepts a valid guarantee policy entity", () => {
    const valid = {
      schema: "pbp/guarantee-policy@1",
      id: "warpgogol-guarantee",
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
      id: "warpgogol-ownership",
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
      id: "warpgogol-exit",
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
      id: "warpgogol-retention",
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

describe("pbpCurrencyPricingPolicySchema", () => {
  const basePolicy = {
    schema: "pbp/currency-pricing-policy@1",
    id: "warpgogol-currency-policy-default",
    status: "published" as const,
    type: "currency-pricing-policy" as const,
    businessRef: { ref: "pbp/business@1:warpgogol" },
    baseCurrency: "EUR",
  };

  it("accepts a valid currency-pricing-policy with derived strategy", () => {
    const valid = {
      ...basePolicy,
      targetCurrencies: {
        uah: {
          currency: "UAH",
          strategy: "derived",
          derivationContractRef: { ref: "pbp-derivation:currency-conversion/1" },
          ratePolicyRef: { ref: "pbp/rate-policy@1:eur-uah" },
          currentUses: {
            presentation: true,
            aiAnswers: true,
            quote: false,
            contract: false,
            invoice: false,
            settlement: false,
          },
        },
      },
    };
    expect(pbpCurrencyPricingPolicySchema.parse(valid)).toMatchObject({ baseCurrency: "EUR" });
  });

  it("accepts a valid currency-pricing-policy with fixed strategy", () => {
    const valid = {
      ...basePolicy,
      targetCurrencies: {
        usd: {
          currency: "USD",
          strategy: "fixed",
          ratePolicyRef: { ref: "pbp/rate-policy@1:eur-usd" },
          currentUses: {
            presentation: true,
            aiAnswers: false,
            quote: false,
            contract: false,
            invoice: false,
            settlement: false,
          },
        },
      },
    };
    expect(pbpCurrencyPricingPolicySchema.parse(valid)).toMatchObject({ baseCurrency: "EUR" });
  });

  it("rejects empty targetCurrencies", () => {
    expect(() =>
      pbpCurrencyPricingPolicySchema.parse({ ...basePolicy, targetCurrencies: {} }),
    ).toThrow();
  });

  it("rejects unknown field (.strict)", () => {
    expect(() =>
      pbpCurrencyPricingPolicySchema.parse({
        ...basePolicy,
        targetCurrencies: {
          uah: {
            currency: "UAH",
            strategy: "derived",
            derivationContractRef: { ref: "pbp-derivation:currency-conversion/1" },
            ratePolicyRef: { ref: "pbp/rate-policy@1:eur-uah" },
            currentUses: {
              presentation: true,
              aiAnswers: false,
              quote: false,
              contract: false,
              invoice: false,
              settlement: false,
            },
          },
        },
        extraField: "not allowed",
      }),
    ).toThrow();
  });

  it("rejects missing businessRef", () => {
    expect(() =>
      pbpCurrencyPricingPolicySchema.parse({
        schema: "pbp/currency-pricing-policy@1",
        id: "test",
        status: "published",
        type: "currency-pricing-policy",
        baseCurrency: "EUR",
        targetCurrencies: {
          uah: {
            currency: "UAH",
            strategy: "fixed",
            ratePolicyRef: { ref: "pbp/rate-policy@1:eur-uah" },
            currentUses: {
              presentation: true,
              aiAnswers: false,
              quote: false,
              contract: false,
              invoice: false,
              settlement: false,
            },
          },
        },
      }),
    ).toThrow();
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
      "consent",
      "public-document",
      "currency-pricing-policy",
    ];
    for (const entity of expectedIds) {
      const id = pbpSchemaId(entity);
      expect(pbpSchemaById[id], `Missing schema for ${id}`).toBeDefined();
    }
  });

  it("has 25 registered schemas", () => {
    expect(Object.keys(pbpSchemaById)).toHaveLength(25);
  });
});
