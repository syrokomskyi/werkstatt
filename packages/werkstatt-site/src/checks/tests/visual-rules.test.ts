import { describe, it, expect } from "vitest";
import { evaluateVisualPage, resolveSeverity } from "../visual/rules.ts";
import type { VisualPage, VisualBlock } from "../visual/page-context.ts";

function block(index: number, id: string, background?: Record<string, unknown>): VisualBlock {
  return { index, id, type: id, background, backgroundLine: 100 + index };
}

function page(blocks: VisualBlock[]): VisualPage {
  return { file: "/abs/home.md", relFile: "apps/x/src/content/pages/de/home.md", blocks };
}

const endEdgeFade = {
  kind: "fade",
  direction: "vertical",
  startOpacity: 0.8,
  endOpacity: 1,
  noEndFade: true,
};

describe("VIS-BG-01 — end-edge fade must be on the last block", () => {
  it("fires when an end-edge full-opacity fade is not last (the 2026-06-23 bug)", () => {
    const diags = evaluateVisualPage(
      page([
        block(0, "hero"),
        block(1, "transparency", endEdgeFade),
        block(2, "faq", { kind: "transparent", opacity: 0.8 }),
      ]),
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.ruleId).toBe("VIS-BG-01");
    expect(diags[0]!.severity).toBe("error");
    expect(diags[0]!.line).toBe(101);
  });

  it("passes when the end-edge fade is the last block", () => {
    const diags = evaluateVisualPage(page([block(0, "hero"), block(1, "faq", endEdgeFade)]));
    expect(diags).toHaveLength(0);
  });

  it("does NOT fire on a partial (non-full-opacity) mid-page fade", () => {
    // The legitimate nicaragua "problem" block: startOpacity 0 -> endOpacity 0.8.
    const diags = evaluateVisualPage(
      page([
        block(0, "hero"),
        block(1, "problem", {
          kind: "fade",
          direction: "vertical",
          startOpacity: 0,
          endOpacity: 0.8,
          noStartFade: true,
        }),
        block(2, "faq"),
      ]),
    );
    expect(diags).toHaveLength(0);
  });
});

describe("VIS-BG-02 — start-edge fade must be on the first block", () => {
  it("fires when a start-edge full-opacity fade is not first", () => {
    const diags = evaluateVisualPage(
      page([
        block(0, "hero"),
        block(1, "mid", {
          kind: "fade",
          direction: "vertical",
          startOpacity: 1,
          endOpacity: 0.8,
          noStartFade: true,
        }),
      ]),
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.ruleId).toBe("VIS-BG-02");
  });
});

describe("VIS-BG-03 — adjacent identical non-transparent backgrounds", () => {
  it("warns on two adjacent identical fade backgrounds", () => {
    const diags = evaluateVisualPage(
      page([block(0, "a", { ...endEdgeFade }), block(1, "b", { ...endEdgeFade })]),
    );
    const bg03 = diags.filter((d) => d.ruleId === "VIS-BG-03");
    expect(bg03).toHaveLength(1);
    expect(bg03[0]!.severity).toBe("warning");
  });

  it("ignores repeated transparent backgrounds", () => {
    const diags = evaluateVisualPage(
      page([block(0, "a", { kind: "transparent" }), block(1, "b", { kind: "transparent" })]),
    );
    expect(diags).toHaveLength(0);
  });
});

describe("severity gating policy", () => {
  it("a site override escalates VIS-BG-03 to error", () => {
    expect(resolveSeverity("VIS-BG-03")).toBe("warning");
    expect(resolveSeverity("VIS-BG-03", { "VIS-BG-03": "error" })).toBe("error");
  });

  it("deterministic rules default to error", () => {
    expect(resolveSeverity("VIS-BG-01")).toBe("error");
    expect(resolveSeverity("VIS-BG-02")).toBe("error");
  });
});
