import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  suppressionRuleSchema,
  suppressionsConfigSchema,
  parseSuppressionsConfig,
  loadWorkshopSuppressions,
  loadWorkpieceSuppressions,
  mergeSuppressions,
  applySuppressions,
  countSuppressedByCategory,
  WORKSHOP_SUPPRESSIONS_PATH,
  WORKPIECE_SUPPRESSIONS_PATH,
  type SuppressionRule,
} from "../suppressions-config.ts";
import type { Finding } from "@syrokomskyi/axiom-study";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: "f-001",
    semanticFingerprint: { algorithm: "sha256", digest: "abc" },
    methodologyId: "seo-runtime",
    ruleId: "seo-runtime.canonical-mismatch",
    affectedSubjectId: "https://dev.example.com/page",
    title: "Canonical mismatch",
    severity: "medium",
    evidence: [
      {
        evidenceRef: { artifactId: "art-1", digest: { algorithm: "sha256", digest: "def" } },
        selector: "head > link[rel=canonical]",
        evidenceClass: "html-element",
      },
    ],
    uncertainty: [],
    extension: {},
    ...overrides,
  } as Finding;
}

describe("suppressionRuleSchema", () => {
  it("accepts a valid rule with all fields", () => {
    const rule = suppressionRuleSchema.parse({
      ruleId: "seo-runtime.canonical-mismatch",
      category: "channel-mismatch",
      channelNot: "main",
      reason: "Dev channel canonical mismatch",
    });
    expect(rule.ruleId).toBe("seo-runtime.canonical-mismatch");
    expect(rule.category).toBe("channel-mismatch");
    expect(rule.channelNot).toBe("main");
  });

  it("rejects missing reason", () => {
    expect(() =>
      suppressionRuleSchema.parse({
        ruleId: "test-rule",
        category: "test",
      }),
    ).toThrow();
  });

  it("rejects missing ruleId", () => {
    expect(() =>
      suppressionRuleSchema.parse({
        category: "test",
        reason: "test reason",
      }),
    ).toThrow();
  });

  it("rejects missing category", () => {
    expect(() =>
      suppressionRuleSchema.parse({
        ruleId: "test-rule",
        reason: "test reason",
      }),
    ).toThrow();
  });
});

describe("suppressionsConfigSchema", () => {
  it("accepts a valid config", () => {
    const config = suppressionsConfigSchema.parse({
      suppressions: [
        {
          ruleId: "test-rule",
          category: "test",
          reason: "test reason",
        },
      ],
    });
    expect(config.suppressions).toHaveLength(1);
  });

  it("accepts empty suppressions array", () => {
    const config = suppressionsConfigSchema.parse({ suppressions: [] });
    expect(config.suppressions).toHaveLength(0);
  });
});

describe("parseSuppressionsConfig", () => {
  it("parses valid YAML", () => {
    const yaml = `
suppressions:
  - ruleId: test-rule
    category: test
    reason: "test reason"
`;
    const config = parseSuppressionsConfig(yaml);
    expect(config.suppressions).toHaveLength(1);
    expect(config.suppressions[0].ruleId).toBe("test-rule");
  });

  it("rejects invalid YAML structure", () => {
    expect(() => parseSuppressionsConfig("not: valid")).toThrow();
  });
});

describe("loadWorkshopSuppressions", () => {
  it("returns undefined when file does not exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-test-"));
    try {
      const result = loadWorkshopSuppressions(tmpDir);
      expect(result).toBeUndefined();
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns parsed config when file exists", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-test-"));
    try {
      mkdirSync(join(tmpDir, "systems"), { recursive: true });
      writeFileSync(
        join(tmpDir, WORKSHOP_SUPPRESSIONS_PATH),
        `suppressions:\n  - ruleId: test-rule\n    category: test\n    reason: "test"\n`,
      );
      const result = loadWorkshopSuppressions(tmpDir);
      expect(result).toBeDefined();
      expect(result!.suppressions).toHaveLength(1);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("loadWorkpieceSuppressions", () => {
  it("returns undefined when file does not exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-test-"));
    try {
      const result = loadWorkpieceSuppressions(tmpDir);
      expect(result).toBeUndefined();
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns parsed config when file exists in workpiece/", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "supp-test-"));
    try {
      mkdirSync(join(tmpDir, "workpiece"), { recursive: true });
      writeFileSync(
        join(tmpDir, "workpiece", WORKPIECE_SUPPRESSIONS_PATH),
        `suppressions:\n  - ruleId: per-site-rule\n    category: custom\n    reason: "site-specific"\n`,
      );
      const result = loadWorkpieceSuppressions(tmpDir);
      expect(result).toBeDefined();
      expect(result!.suppressions[0].ruleId).toBe("per-site-rule");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("mergeSuppressions", () => {
  it("concatenates workshop and workpiece rules", () => {
    const workshop = { suppressions: [{ ruleId: "w-rule", category: "w-cat", reason: "w" }] };
    const workpiece = { suppressions: [{ ruleId: "p-rule", category: "p-cat", reason: "p" }] };
    const merged = mergeSuppressions(workshop, workpiece);
    expect(merged).toHaveLength(2);
    expect(merged[0].ruleId).toBe("w-rule");
    expect(merged[1].ruleId).toBe("p-rule");
  });

  it("returns workshop rules when workpiece is undefined", () => {
    const workshop = { suppressions: [{ ruleId: "w-rule", category: "w-cat", reason: "w" }] };
    const merged = mergeSuppressions(workshop, undefined);
    expect(merged).toHaveLength(1);
  });

  it("returns empty array when both are undefined", () => {
    const merged = mergeSuppressions(undefined, undefined);
    expect(merged).toHaveLength(0);
  });
});

describe("applySuppressions", () => {
  it("is a pure function — does not modify input array", () => {
    const findings = [makeFinding()];
    const original = [...findings];
    const rules: SuppressionRule[] = [
      { ruleId: "seo-runtime.canonical-mismatch", category: "test", reason: "test" },
    ];
    applySuppressions(findings, rules, { channel: "dev" });
    expect(findings).toEqual(original);
  });

  it("marks matching finding as suppressed", () => {
    const findings = [makeFinding()];
    const rules: SuppressionRule[] = [
      { ruleId: "seo-runtime.canonical-mismatch", category: "test", reason: "test" },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBe(true);
    expect((result[0] as { suppressedBy?: { ruleId: string } }).suppressedBy?.ruleId).toBe(
      "seo-runtime.canonical-mismatch",
    );
  });

  it("first matching rule wins", () => {
    const findings = [makeFinding()];
    const rules: SuppressionRule[] = [
      { ruleId: "seo-runtime.canonical-mismatch", category: "first", reason: "first rule" },
      { ruleId: "seo-runtime.canonical-mismatch", category: "second", reason: "second rule" },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressedBy?: { category: string } }).suppressedBy?.category).toBe(
      "first",
    );
  });

  it("does not match when ruleId differs", () => {
    const findings = [makeFinding({ ruleId: "other-rule" })];
    const rules: SuppressionRule[] = [
      { ruleId: "seo-runtime.canonical-mismatch", category: "test", reason: "test" },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBeUndefined();
  });

  it("channel condition — suppress only on matching channel", () => {
    const findings = [makeFinding()];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "test",
        channel: "dev",
        reason: "dev only",
      },
    ];
    const devResult = applySuppressions(findings, rules, { channel: "dev" });
    expect((devResult[0] as { suppressed?: boolean }).suppressed).toBe(true);
    const mainResult = applySuppressions(findings, rules, { channel: "main" });
    expect((mainResult[0] as { suppressed?: boolean }).suppressed).toBeUndefined();
  });

  it("channelNot condition — suppress on non-matching channel", () => {
    const findings = [makeFinding()];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "test",
        channelNot: "main",
        reason: "non-main",
      },
    ];
    const devResult = applySuppressions(findings, rules, { channel: "dev" });
    expect((devResult[0] as { suppressed?: boolean }).suppressed).toBe(true);
    const mainResult = applySuppressions(findings, rules, { channel: "main" });
    expect((mainResult[0] as { suppressed?: boolean }).suppressed).toBeUndefined();
  });

  it("contentType condition — suppress when URL ends with extension", () => {
    const findings = [makeFinding({ affectedSubjectId: "https://example.com/sbom.cdx.json" })];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "non-html",
        contentType: [".json", ".txt"],
        reason: "non-HTML resource",
      },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBe(true);
  });

  it("contentType condition — does not suppress when URL does not match", () => {
    const findings = [makeFinding({ affectedSubjectId: "https://example.com/page" })];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "non-html",
        contentType: [".json", ".txt"],
        reason: "non-HTML resource",
      },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBeUndefined();
  });

  it("messagePattern condition — suppress when message contains pattern", () => {
    const findings = [
      makeFinding({
        extension: { message: "Deprecated API for given entry type: measure.UserTiming" },
      }),
    ];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "deprecation",
        messagePattern: "Deprecated API for given entry type",
        reason: "browser deprecation",
      },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBe(true);
  });

  it("descriptionPattern condition — suppress when description contains pattern", () => {
    const findings = [
      makeFinding({
        extension: { description: "CSS preload pattern detected in head" },
      }),
    ];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "render-blocking",
        descriptionPattern: "preload",
        reason: "Astro CSS preload",
      },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBe(true);
  });

  it("AND logic — all conditions must match", () => {
    const findings = [makeFinding({ affectedSubjectId: "https://example.com/page" })];
    const rules: SuppressionRule[] = [
      {
        ruleId: "seo-runtime.canonical-mismatch",
        category: "test",
        channelNot: "main",
        contentType: [".json"],
        reason: "combined",
      },
    ];
    // channel matches but contentType does not
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressed?: boolean }).suppressed).toBeUndefined();
  });

  it("keeps already-suppressed findings as-is", () => {
    const findings = [
      {
        ...makeFinding(),
        suppressed: true,
        suppressedBy: { ruleIndex: 0, ruleId: "prev", category: "prev", reason: "prev" },
      },
    ] as unknown as Finding[];
    const rules: SuppressionRule[] = [
      { ruleId: "seo-runtime.canonical-mismatch", category: "new", reason: "new" },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect((result[0] as { suppressedBy?: { category: string } }).suppressedBy?.category).toBe(
      "prev",
    );
  });

  it("returns findings unchanged when no rules match", () => {
    const findings = [makeFinding({ ruleId: "unrelated-rule" })];
    const rules: SuppressionRule[] = [
      { ruleId: "seo-runtime.canonical-mismatch", category: "test", reason: "test" },
    ];
    const result = applySuppressions(findings, rules, { channel: "dev" });
    expect(result).toHaveLength(1);
    expect((result[0] as { suppressed?: boolean }).suppressed).toBeUndefined();
  });
});

describe("countSuppressedByCategory", () => {
  it("counts suppressed findings by category", () => {
    const findings = [
      {
        ...makeFinding(),
        suppressed: true,
        suppressedBy: { ruleIndex: 0, ruleId: "r1", category: "cat-a", reason: "r" },
      },
      {
        ...makeFinding(),
        suppressed: true,
        suppressedBy: { ruleIndex: 1, ruleId: "r2", category: "cat-a", reason: "r" },
      },
      {
        ...makeFinding(),
        suppressed: true,
        suppressedBy: { ruleIndex: 2, ruleId: "r3", category: "cat-b", reason: "r" },
      },
      makeFinding(),
    ] as unknown as Finding[];
    const result = countSuppressedByCategory(findings as never[]);
    expect(result.totalSuppressed).toBe(3);
    expect(result.byCategory["cat-a"]).toBe(2);
    expect(result.byCategory["cat-b"]).toBe(1);
  });

  it("returns zero when no findings are suppressed", () => {
    const findings = [makeFinding(), makeFinding()];
    const result = countSuppressedByCategory(findings as never[]);
    expect(result.totalSuppressed).toBe(0);
    expect(Object.keys(result.byCategory)).toHaveLength(0);
  });
});
