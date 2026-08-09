import { describe, expect, test } from "vitest";
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";
import {
  makeAgentAction,
  makeCheckReport,
  renderReportHtml,
  statusFromSummary,
} from "../report.ts";

describe("statusFromSummary", () => {
  test("prioritizes errors over warnings", () => {
    expect(statusFromSummary({ error: 1, warning: 0 })).toBe("fail");
    expect(statusFromSummary({ error: 1, warning: 3 })).toBe("fail");
  });

  test("returns warn only when warnings exist without errors", () => {
    expect(statusFromSummary({ error: 0, warning: 2 })).toBe("warn");
    expect(statusFromSummary({ error: 0, warning: 0 })).toBe("pass");
  });
});

describe("makeCheckReport", () => {
  test("derives summary counts and status from diagnostics", () => {
    const diagnostics: Diagnostic[] = [
      { ruleId: "A", severity: "error", message: "Broken" },
      { ruleId: "B", severity: "warning", message: "Risky" },
      { ruleId: "C", severity: "info", message: "Useful" },
    ];

    const report = makeCheckReport("run-1", "target-1", diagnostics, 4);

    expect(report.status).toBe("fail");
    expect(report.summary).toEqual({ error: 1, warning: 1, info: 1, pageCount: 4 });
    expect(report.diagnostics).toBe(diagnostics);
  });
});

describe("makeAgentAction", () => {
  test("uses diagnostic anchors before fallback URL", () => {
    const action = makeAgentAction(
      {
        ruleId: "CHECK-01",
        severity: "warning",
        message: "Improve section",
        fixHint: "Rewrite the section",
        data: { url: "https://example.test/page", sectionId: "hero" },
      },
      0,
      "https://fallback.test/",
    );

    expect(action).toMatchObject({
      id: "check-01-1",
      severity: "warning",
      anchor: {
        url: "https://example.test/page",
        sectionId: "hero",
        selector: "#hero",
      },
      changeHint: "Rewrite the section",
      sourceRuleId: "CHECK-01",
    });
  });

  test("falls back to the page URL when diagnostics have no URL", () => {
    const action = makeAgentAction(
      { ruleId: "CHECK-02", severity: "info", message: "Look here" },
      1,
      "https://fallback.test/",
    );

    expect(action.anchor).toEqual({
      url: "https://fallback.test/",
      sectionId: undefined,
      selector: undefined,
    });
  });
});

describe("renderReportHtml", () => {
  test("escapes diagnostic content before rendering", () => {
    const report = makeCheckReport(
      "run-<1>",
      "target",
      [{ ruleId: "XSS", severity: "error", message: '<script>alert("x")</script>' }],
      1,
    );

    const html = renderReportHtml(report);

    expect(html).toContain("run-&lt;1&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });
});
