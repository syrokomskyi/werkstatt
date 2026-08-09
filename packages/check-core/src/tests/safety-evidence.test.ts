import { test, expect, describe } from "vitest";
import {
  checkTargetSchema,
  parseCheckTarget,
  redactCheckTarget,
  targetBaseHost,
} from "../target.ts";
import { validateTargetSafety } from "../safety.ts";
import {
  collectTechnicalDiagnostics,
  collectLocalizationDiagnostics,
  collectContentSurfaceDiagnostics,
  collectDeterministicDiagnostics,
  containsSecretLikeText,
  makeDiagnostic,
} from "../diagnostics.ts";
import {
  finalizeEvidenceGraph,
  parseEvidenceGraph,
  validateEvidenceGraphHash,
  siteEvidenceGraphSchema,
} from "../evidence.ts";
import type { SiteEvidenceGraph } from "../evidence.ts";

const validTarget = {
  id: "my-site",
  baseUrl: "https://example.com",
  mode: "public",
  allowedHosts: ["example.com"],
};

describe("checkTargetSchema", () => {
  test("accepts a valid target", () => {
    const result = checkTargetSchema.safeParse(validTarget);
    expect(result.success).toBe(true);
  });

  test("defaults policy when not provided", () => {
    const result = checkTargetSchema.safeParse(validTarget);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.policy.respectRobots).toBe(true);
      expect(result.data.policy.allowAiReview).toBe(false);
    }
  });

  test("rejects invalid id (uppercase)", () => {
    expect(checkTargetSchema.safeParse({ ...validTarget, id: "MySite" }).success).toBe(false);
  });

  test("rejects non-URL baseUrl", () => {
    expect(checkTargetSchema.safeParse({ ...validTarget, baseUrl: "not-a-url" }).success).toBe(
      false,
    );
  });

  test("rejects empty allowedHosts", () => {
    expect(checkTargetSchema.safeParse({ ...validTarget, allowedHosts: [] }).success).toBe(false);
  });

  test("rejects maxPages > 200", () => {
    expect(checkTargetSchema.safeParse({ ...validTarget, maxPages: 201 }).success).toBe(false);
  });

  test("accepts auth ref", () => {
    const result = checkTargetSchema.safeParse({
      ...validTarget,
      auth: { kind: "header", secretRef: "MY_API_KEY" },
    });
    expect(result.success).toBe(true);
  });
});

describe("parseCheckTarget", () => {
  test("parses valid input", () => {
    const target = parseCheckTarget(validTarget);
    expect(target.id).toBe("my-site");
  });

  test("throws on invalid input", () => {
    expect(() => parseCheckTarget({ id: "BAD" })).toThrow();
  });
});

describe("redactCheckTarget", () => {
  test("redacts auth secretRef", () => {
    const target = parseCheckTarget({
      ...validTarget,
      auth: { kind: "header", secretRef: "super-secret-value" },
    });
    const redacted = redactCheckTarget(target);
    expect(redacted.auth?.secretRef).toBe("[redacted]");
    expect(redacted.auth?.kind).toBe("header");
  });

  test("omits auth when not present", () => {
    const target = parseCheckTarget(validTarget);
    const redacted = redactCheckTarget(target);
    expect(redacted.auth).toBeUndefined();
  });
});

describe("targetBaseHost", () => {
  test("extracts host from baseUrl", () => {
    const target = parseCheckTarget(validTarget);
    expect(targetBaseHost(target)).toBe("example.com");
  });

  test("extracts host with port", () => {
    const target = parseCheckTarget({
      ...validTarget,
      baseUrl: "http://localhost:3000",
      allowedHosts: ["localhost:3000"],
    });
    expect(targetBaseHost(target)).toBe("localhost:3000");
  });
});

describe("validateTargetSafety", () => {
  test("passes for valid target with matching host", () => {
    const target = parseCheckTarget(validTarget);
    const diagnostics = validateTargetSafety(target);
    expect(diagnostics).toEqual([]);
  });

  test("CW-SAFE-01: flags host not in allowedHosts", () => {
    const target = parseCheckTarget({
      ...validTarget,
      baseUrl: "https://other.com",
      allowedHosts: ["example.com"],
    });
    const diagnostics = validateTargetSafety(target);
    expect(diagnostics.some((d) => d.ruleId === "CW-SAFE-01")).toBe(true);
  });

  test("CW-SAFE-02: flags raw secret in secretRef", () => {
    const target = parseCheckTarget({
      ...validTarget,
      auth: { kind: "header", secretRef: "sk-abcdefghijklmnopqrstuvwxyz123456" },
    });
    const diagnostics = validateTargetSafety(target);
    expect(diagnostics.some((d) => d.ruleId === "CW-SAFE-02")).toBe(true);
  });

  test("CW-SAFE-02: flags JWT-like secret", () => {
    const target = parseCheckTarget({
      ...validTarget,
      auth: { kind: "header", secretRef: "eyJabcdefghijklmnopqrstuvwxyz1234567890.abcd" },
    });
    const diagnostics = validateTargetSafety(target);
    expect(diagnostics.some((d) => d.ruleId === "CW-SAFE-02")).toBe(true);
  });

  test("CW-SAFE-03: flags AI review on non-public target", () => {
    const target = parseCheckTarget({
      ...validTarget,
      mode: "private-alt",
      policy: {
        respectRobots: true,
        allowScreenshots: true,
        allowAiReview: true,
        allowExternalLinks: false,
      },
    });
    const diagnostics = validateTargetSafety(target);
    expect(diagnostics.some((d) => d.ruleId === "CW-SAFE-03")).toBe(true);
  });

  test("CW-SAFE-03: passes for AI review on public target", () => {
    const target = parseCheckTarget({
      ...validTarget,
      policy: {
        respectRobots: true,
        allowScreenshots: true,
        allowAiReview: true,
        allowExternalLinks: false,
      },
    });
    const diagnostics = validateTargetSafety(target);
    expect(diagnostics.some((d) => d.ruleId === "CW-SAFE-03")).toBe(false);
  });
});

function makeMinimalGraph(
  overrides: Partial<SiteEvidenceGraph> & { pages?: SiteEvidenceGraph["pages"] } = {},
): SiteEvidenceGraph {
  const base = {
    schemaVersion: 1 as const,
    targetId: "test",
    baseUrl: "https://example.com",
    capturedAt: "2026-01-01T00:00:00Z",
    pages: [
      {
        url: "https://example.com/",
        path: "/",
        title: "Home",
        lang: "de",
        canonical: "https://example.com/",
        metaDescription: "A test page",
        text: "x".repeat(200),
        contentHash: "sha256:abc",
        sections: [
          {
            id: "hero",
            index: 0,
            heading: "Welcome",
            text: "y".repeat(30),
            htmlHash: "sha256:def",
          },
        ],
        viewports: [{ name: "desktop" as const, width: 1280, height: 720 }],
        links: [],
      },
    ],
    graphHash: "",
    ...overrides,
  };
  return finalizeEvidenceGraph(base);
}

describe("evidence graph", () => {
  test("finalizeEvidenceGraph produces a hash", () => {
    const graph = makeMinimalGraph();
    expect(graph.graphHash).toMatch(/^sha256:/);
  });

  test("validateEvidenceGraphHash returns true for freshly finalized graph", () => {
    const graph = makeMinimalGraph();
    expect(validateEvidenceGraphHash(graph)).toBe(true);
  });

  test("validateEvidenceGraphHash returns false for tampered graph", () => {
    const graph = makeMinimalGraph();
    const tampered = { ...graph, targetId: "tampered" };
    expect(validateEvidenceGraphHash(tampered)).toBe(false);
  });

  test("parseEvidenceGraph accepts a valid graph", () => {
    const graph = makeMinimalGraph();
    expect(() => parseEvidenceGraph(graph)).not.toThrow();
  });

  test("parseEvidenceGraph rejects invalid schema version", () => {
    const graph = makeMinimalGraph();
    expect(() => parseEvidenceGraph({ ...graph, schemaVersion: 99 })).toThrow();
  });

  test("siteEvidenceGraphSchema requires at least one page", () => {
    const graph = makeMinimalGraph();
    expect(siteEvidenceGraphSchema.safeParse({ ...graph, pages: [] }).success).toBe(false);
  });

  test("finalizeEvidenceGraph is deterministic", () => {
    const g1 = finalizeEvidenceGraph({ ...makeMinimalGraph(), graphHash: "" });
    const g2 = finalizeEvidenceGraph({ ...makeMinimalGraph(), graphHash: "" });
    expect(g1.graphHash).toBe(g2.graphHash);
  });
});

describe("diagnostics", () => {
  test("makeDiagnostic creates a diagnostic with url data", () => {
    const d = makeDiagnostic("R-01", "error", "msg", "https://example.com", "fix it");
    expect(d.ruleId).toBe("R-01");
    expect(d.severity).toBe("error");
    expect(d.data?.url).toBe("https://example.com");
  });

  test("collectTechnicalDiagnostics flags missing title", () => {
    const graph = makeMinimalGraph({
      pages: [
        {
          url: "https://example.com/",
          path: "/",
          title: undefined,
          lang: "de",
          canonical: "https://example.com/",
          metaDescription: "desc",
          text: "x".repeat(200),
          contentHash: "sha256:abc",
          sections: [],
          viewports: [{ name: "desktop", width: 1280, height: 720 }],
          links: [],
        },
      ],
    } as never);
    const diags = collectTechnicalDiagnostics(graph);
    expect(diags.some((d) => d.ruleId === "CW-TECH-01")).toBe(true);
  });

  test("collectTechnicalDiagnostics flags missing meta description", () => {
    const graph = makeMinimalGraph({
      pages: [
        {
          url: "https://example.com/",
          path: "/",
          title: "T",
          lang: "de",
          canonical: "https://example.com/",
          metaDescription: undefined,
          text: "x".repeat(200),
          contentHash: "sha256:abc",
          sections: [],
          viewports: [{ name: "desktop", width: 1280, height: 720 }],
          links: [],
        },
      ],
    } as never);
    const diags = collectTechnicalDiagnostics(graph);
    expect(diags.some((d) => d.ruleId === "CW-TECH-02")).toBe(true);
  });

  test("collectLocalizationDiagnostics flags missing lang", () => {
    const graph = makeMinimalGraph({
      pages: [
        {
          url: "https://example.com/",
          path: "/",
          title: "T",
          lang: undefined,
          canonical: "https://example.com/",
          metaDescription: "desc",
          text: "x".repeat(200),
          contentHash: "sha256:abc",
          sections: [],
          viewports: [{ name: "desktop", width: 1280, height: 720 }],
          links: [],
        },
      ],
    } as never);
    const diags = collectLocalizationDiagnostics(graph);
    expect(diags.some((d) => d.ruleId === "CW-L10N-01")).toBe(true);
  });

  test("collectContentSurfaceDiagnostics flags thin text", () => {
    const graph = makeMinimalGraph({
      pages: [
        {
          url: "https://example.com/",
          path: "/",
          title: "T",
          lang: "de",
          canonical: "https://example.com/",
          metaDescription: "desc",
          text: "short",
          contentHash: "sha256:abc",
          sections: [],
          viewports: [{ name: "desktop", width: 1280, height: 720 }],
          links: [],
        },
      ],
    } as never);
    const diags = collectContentSurfaceDiagnostics(graph);
    expect(diags.some((d) => d.ruleId === "CW-CONTENT-01")).toBe(true);
  });

  test("collectDeterministicDiagnostics combines all collectors", () => {
    const graph = makeMinimalGraph();
    const diags = collectDeterministicDiagnostics(graph);
    expect(diags).toEqual([]);
  });

  test("containsSecretLikeText detects sk- prefix", () => {
    expect(containsSecretLikeText("sk-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
  });

  test("containsSecretLikeText detects JWT", () => {
    expect(containsSecretLikeText("eyJabcdefghijklmnopqrstuvwxyz1234567890.signature")).toBe(true);
  });

  test("containsSecretLikeText returns false for normal text", () => {
    expect(containsSecretLikeText("hello world")).toBe(false);
  });
});
