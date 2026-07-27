import { describe, it, expect } from "vitest";
import {
  hasWikidataQid,
  constructSameAsUrl,
  isValidHttpsUrl,
  validateQidPresence,
  validateUrlConstruction,
  validateLegalIdentityLegalName,
  collectSameAsUrls,
  validateProjectionParity,
  validateNotabilityEvidence,
  validateClaimEvidenceCoverage,
  validateEvidenceReferences,
  validateEvidenceSourceUrls,
} from "../audit/validators/wikidata.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0531, RFC-0535: unit tests for the pure validation functions of the Wikidata readiness
    validator. Tests cover QID presence, URL construction, LegalIdentity legalName,
    projection parity, --strict escalation semantics, notability evidence, factual claim
    evidence coverage, evidence reference integrity, and evidence source URL validity.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0531 — unit tests for Wikidata readiness validation.</item>
  <item>Extended by RFC-0535 — tests for Claim/EvidenceSource coverage checks.</item>
</CHANGE_SUMMARY>
*/

const BUSINESS_FILE = "src/content/business-profile/de/business.md";
const BRAND_FILE = "src/content/business-profile/de/brand.md";
const LEGAL_IDENTITY_FILE = "src/content/business-profile/de/legal-identity.md";

describe("hasWikidataQid (RFC-0531)", () => {
  it("returns true when an externalIdentifier has a wikidata.org schemeRef", () => {
    const ids = {
      wikidata: { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" },
    };
    expect(hasWikidataQid(ids)).toBe(true);
  });

  it("returns false when no externalIdentifier has a wikidata.org schemeRef", () => {
    const ids = {
      gnd: { schemeRef: "https://d-nb.info/gnd/", value: "123456789" },
    };
    expect(hasWikidataQid(ids)).toBe(false);
  });

  it("returns false for empty externalIdentifiers", () => {
    expect(hasWikidataQid({})).toBe(false);
  });
});

describe("constructSameAsUrl (RFC-0531)", () => {
  it("concatenates schemeRef and value", () => {
    const id = { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" };
    expect(constructSameAsUrl(id)).toBe("https://www.wikidata.org/wiki/Q123456");
  });
});

describe("isValidHttpsUrl (RFC-0531)", () => {
  it("accepts a valid HTTPS URL", () => {
    expect(isValidHttpsUrl("https://www.wikidata.org/wiki/Q123456")).toBe(true);
  });

  it("rejects a non-HTTPS URL", () => {
    expect(isValidHttpsUrl("http://example.com/")).toBe(false);
  });

  it("rejects a malformed string", () => {
    expect(isValidHttpsUrl("not-a-url")).toBe(false);
  });
});

describe("validateQidPresence (RFC-0531)", () => {
  it("returns a warning when Business has no externalIdentifiers", () => {
    const result = validateQidPresence("business", undefined, BUSINESS_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.business-missing-qid");
    expect(result!.severity).toBe("warning");
  });

  it("returns a warning when Business has externalIdentifiers but none with wikidata.org", () => {
    const ids = {
      gnd: { schemeRef: "https://d-nb.info/gnd/", value: "123456789" },
    };
    const result = validateQidPresence("business", ids, BUSINESS_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.business-missing-qid");
    expect(result!.severity).toBe("warning");
  });

  it("returns null when Business has a Wikidata QID", () => {
    const ids = {
      wikidata: { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" },
    };
    const result = validateQidPresence("business", ids, BUSINESS_FILE);
    expect(result).toBeNull();
  });

  it("returns a warning for Brand with no QID", () => {
    const result = validateQidPresence("brand", undefined, BRAND_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.brand-missing-qid");
  });

  it("returns a warning for LegalIdentity with no QID", () => {
    const result = validateQidPresence("legal-identity", undefined, LEGAL_IDENTITY_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.legalidentity-missing-qid");
  });
});

describe("validateUrlConstruction (RFC-0531)", () => {
  it("returns no findings when all URLs are valid HTTPS", () => {
    const ids = {
      wikidata: { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" },
    };
    const results = validateUrlConstruction(ids, BUSINESS_FILE);
    expect(results).toHaveLength(0);
  });

  it("returns an error when schemeRef is not a full URL prefix", () => {
    const ids = {
      wikidata: { schemeRef: "wikidata:", value: "Q123456" },
    };
    const results = validateUrlConstruction(ids, BUSINESS_FILE);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.malformed-url");
    expect(results[0]!.severity).toBe("error");
  });

  it("returns an error when schemeRef uses http instead of https", () => {
    const ids = {
      wikidata: { schemeRef: "http://www.wikidata.org/wiki/", value: "Q123456" },
    };
    const results = validateUrlConstruction(ids, BUSINESS_FILE);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.malformed-url");
  });

  it("returns no findings for undefined externalIdentifiers", () => {
    const results = validateUrlConstruction(undefined, BUSINESS_FILE);
    expect(results).toHaveLength(0);
  });
});

describe("validateLegalIdentityLegalName (RFC-0531)", () => {
  it("returns an error when legalName is missing", () => {
    const result = validateLegalIdentityLegalName(undefined, LEGAL_IDENTITY_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.legalidentity-missing-legalname");
    expect(result!.severity).toBe("error");
  });

  it("returns an error when legalName is empty", () => {
    const result = validateLegalIdentityLegalName("", LEGAL_IDENTITY_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.legalidentity-missing-legalname");
  });

  it("returns an error when legalName is whitespace", () => {
    const result = validateLegalIdentityLegalName("  ", LEGAL_IDENTITY_FILE);
    expect(result).not.toBeNull();
  });

  it("returns null when legalName is present", () => {
    const result = validateLegalIdentityLegalName("Warpgogol GmbH", LEGAL_IDENTITY_FILE);
    expect(result).toBeNull();
  });
});

describe("collectSameAsUrls (RFC-0531)", () => {
  it("constructs URLs from all externalIdentifiers", () => {
    const ids = {
      wikidata: { schemeRef: "https://www.wikidata.org/wiki/", value: "Q123456" },
      gnd: { schemeRef: "https://d-nb.info/gnd/", value: "123456789" },
    };
    const urls = collectSameAsUrls(ids);
    expect(urls).toEqual([
      "https://www.wikidata.org/wiki/Q123456",
      "https://d-nb.info/gnd/123456789",
    ]);
  });

  it("returns empty array for undefined externalIdentifiers", () => {
    expect(collectSameAsUrls(undefined)).toEqual([]);
  });
});

describe("validateProjectionParity (RFC-0531)", () => {
  it("returns no findings when all PBP sameAs URLs appear in rendered JSON-LD", () => {
    const pbpUrls = ["https://www.wikidata.org/wiki/Q123456"];
    const renderedUrls = ["https://www.wikidata.org/wiki/Q123456", "https://example.com/"];
    const results = validateProjectionParity(
      pbpUrls,
      renderedUrls,
      BUSINESS_FILE,
      "dist/page.html",
    );
    expect(results).toHaveLength(0);
  });

  it("returns an error when a PBP sameAs URL is missing from rendered JSON-LD", () => {
    const pbpUrls = ["https://www.wikidata.org/wiki/Q123456"];
    const renderedUrls = ["https://example.com/"];
    const results = validateProjectionParity(
      pbpUrls,
      renderedUrls,
      BUSINESS_FILE,
      "dist/page.html",
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.projection-parity");
    expect(results[0]!.severity).toBe("error");
  });

  it("returns no findings when PBP has no sameAs URLs", () => {
    const results = validateProjectionParity(
      [],
      ["https://example.com/"],
      BUSINESS_FILE,
      "dist/page.html",
    );
    expect(results).toHaveLength(0);
  });
});

describe("validateNotabilityEvidence (RFC-0535)", () => {
  const CLAIMS_DIR = "src/content/business-profile/de/claims";
  const EVIDENCE_SOURCES_DIR = "src/content/business-profile/de/evidence-sources";

  it("returns null when Business has no QID", () => {
    const result = validateNotabilityEvidence(false, [], BUSINESS_FILE);
    expect(result).toBeNull();
  });

  it("returns null when Business has QID and external-web-sources EvidenceSource exists", () => {
    const sources = [
      {
        id: "es1",
        name: "Wikipedia",
        kind: "external-web-sources",
        items: { a: { url: "https://example.com" } },
      },
    ];
    const result = validateNotabilityEvidence(true, sources, BUSINESS_FILE);
    expect(result).toBeNull();
  });

  it("returns null when Business has QID and third-party-registry EvidenceSource exists", () => {
    const sources = [
      {
        id: "es1",
        name: "Handelsregister",
        kind: "third-party-registry",
        items: { a: { url: "https://example.com" } },
      },
    ];
    const result = validateNotabilityEvidence(true, sources, BUSINESS_FILE);
    expect(result).toBeNull();
  });

  it("returns a warning when Business has QID but only verified-record EvidenceSource", () => {
    const sources = [
      {
        id: "es1",
        name: "Internal",
        kind: "verified-record",
        items: { a: { url: "https://example.com" } },
      },
    ];
    const result = validateNotabilityEvidence(true, sources, BUSINESS_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.no-notability-evidence");
    expect(result!.severity).toBe("warning");
  });

  it("returns a warning when Business has QID but no EvidenceSources at all", () => {
    const result = validateNotabilityEvidence(true, [], BUSINESS_FILE);
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe("wikidata.no-notability-evidence");
  });
});

describe("validateClaimEvidenceCoverage (RFC-0535)", () => {
  const CLAIMS_DIR = "src/content/business-profile/de/claims";

  it("returns a warning for factual claim without evidenceRefs", () => {
    const claims = [{ id: "claim1", claimClass: "factual", statement: "Founded in 2010" }];
    const results = validateClaimEvidenceCoverage(claims, CLAIMS_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.claim-without-evidence");
    expect(results[0]!.severity).toBe("warning");
  });

  it("returns no findings for factual claim with evidenceRefs", () => {
    const claims = [
      {
        id: "claim1",
        claimClass: "factual",
        statement: "Founded in 2010",
        evidenceRefs: { es1: { ref: "es1" } },
      },
    ];
    const results = validateClaimEvidenceCoverage(claims, CLAIMS_DIR);
    expect(results).toHaveLength(0);
  });

  it("returns no findings for non-factual claim without evidenceRefs", () => {
    const claims = [
      { id: "claim1", claimClass: "comparative-commercial", statement: "Best service" },
    ];
    const results = validateClaimEvidenceCoverage(claims, CLAIMS_DIR);
    expect(results).toHaveLength(0);
  });

  it("returns no findings for empty claims array", () => {
    const results = validateClaimEvidenceCoverage([], CLAIMS_DIR);
    expect(results).toHaveLength(0);
  });
});

describe("validateEvidenceReferences (RFC-0535)", () => {
  const CLAIMS_DIR = "src/content/business-profile/de/claims";

  it("returns no findings when all evidenceRefs resolve to existing EvidenceSource", () => {
    const claims = [
      {
        id: "claim1",
        claimClass: "factual",
        statement: "Test",
        evidenceRefs: { es1: { ref: "es1" } },
      },
    ];
    const sourceIds = new Set(["es1", "es2"]);
    const results = validateEvidenceReferences(claims, sourceIds, CLAIMS_DIR);
    expect(results).toHaveLength(0);
  });

  it("returns an error when evidenceRef points to non-existent EvidenceSource", () => {
    const claims = [
      {
        id: "claim1",
        claimClass: "factual",
        statement: "Test",
        evidenceRefs: { esX: { ref: "es-missing" } },
      },
    ];
    const sourceIds = new Set(["es1"]);
    const results = validateEvidenceReferences(claims, sourceIds, CLAIMS_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.evidence-broken-ref");
    expect(results[0]!.severity).toBe("error");
  });

  it("returns no findings for claim without evidenceRefs", () => {
    const claims = [{ id: "claim1", claimClass: "factual", statement: "Test" }];
    const sourceIds = new Set(["es1"]);
    const results = validateEvidenceReferences(claims, sourceIds, CLAIMS_DIR);
    expect(results).toHaveLength(0);
  });
});

describe("validateEvidenceSourceUrls (RFC-0535)", () => {
  const EVIDENCE_SOURCES_DIR = "src/content/business-profile/de/evidence-sources";

  it("returns no findings when EvidenceSource has items with url", () => {
    const sources = [
      {
        id: "es1",
        name: "Wikipedia",
        kind: "external-web-sources",
        items: { a: { url: "https://example.com" } },
      },
    ];
    const results = validateEvidenceSourceUrls(sources, EVIDENCE_SOURCES_DIR);
    expect(results).toHaveLength(0);
  });

  it("returns an error when EvidenceSource has no items", () => {
    const sources = [{ id: "es1", name: "Empty", kind: "external-web-sources" }];
    const results = validateEvidenceSourceUrls(sources, EVIDENCE_SOURCES_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.evidence-missing-url");
    expect(results[0]!.severity).toBe("error");
  });

  it("returns an error when EvidenceSource items have empty url", () => {
    const sources = [
      {
        id: "es1",
        name: "Bad",
        kind: "external-web-sources",
        items: { a: { url: "", retrievedAt: "2024-01-01" } },
      },
    ];
    const results = validateEvidenceSourceUrls(sources, EVIDENCE_SOURCES_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.evidence-missing-url");
  });

  it("returns an error when EvidenceSource items have whitespace-only url", () => {
    const sources = [
      {
        id: "es1",
        name: "Bad",
        kind: "external-web-sources",
        items: { a: { url: "   " } },
      },
    ];
    const results = validateEvidenceSourceUrls(sources, EVIDENCE_SOURCES_DIR);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("wikidata.evidence-missing-url");
  });

  it("returns no findings for empty EvidenceSources array", () => {
    const results = validateEvidenceSourceUrls([], EVIDENCE_SOURCES_DIR);
    expect(results).toHaveLength(0);
  });
});
