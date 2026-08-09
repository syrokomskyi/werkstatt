import { test, expect, describe } from "vitest";
import { json, INTEGRATION_CALLBACK_PATH } from "../section-api-utils.ts";
import { claimCreditNode } from "../components/material-credit/credit-dedup.ts";
import {
  resolveEffectColor,
  composeEffectPresentation,
  effectVarsToStyle,
} from "../components/effects/registry.ts";
import type { Effect } from "@warpgogol/werkstatt-site/share/schemas/effects";

describe("section-api-utils", () => {
  test("INTEGRATION_CALLBACK_PATH is a non-empty string", () => {
    expect(INTEGRATION_CALLBACK_PATH).toBeTruthy();
    expect(INTEGRATION_CALLBACK_PATH.startsWith("/")).toBe(true);
  });

  test("json() returns a Response with correct status and content-type", () => {
    const res = json({ ok: true }, 200);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  test("json() serializes body", async () => {
    const res = json({ msg: "hello" }, 201);
    const body = await res.json();
    expect(body).toEqual({ msg: "hello" });
  });

  test("json() handles error status", () => {
    const res = json({ error: "bad" }, 500);
    expect(res.status).toBe(500);
  });
});

describe("claimCreditNode", () => {
  test("returns true on first claim for a page", () => {
    expect(claimCreditNode("page-a", "credit-1")).toBe(true);
  });

  test("returns false on duplicate claim for same page+id", () => {
    claimCreditNode("page-b", "credit-2");
    expect(claimCreditNode("page-b", "credit-2")).toBe(false);
  });

  test("returns true for same @id on different page", () => {
    claimCreditNode("page-c", "credit-3");
    expect(claimCreditNode("page-d", "credit-3")).toBe(true);
  });

  test("returns true for different @id on same page", () => {
    claimCreditNode("page-e", "credit-4");
    expect(claimCreditNode("page-e", "credit-5")).toBe(true);
  });
});

describe("resolveEffectColor", () => {
  test("returns fallback for undefined", () => {
    expect(resolveEffectColor(undefined, "var(--fallback)")).toBe("var(--fallback)");
  });

  test("resolves text alias", () => {
    expect(resolveEffectColor("text", "fallback")).toBe("var(--ds-color-text)");
  });

  test("resolves primary alias", () => {
    expect(resolveEffectColor("primary", "fallback")).toBe("var(--ds-color-primary)");
  });

  test("resolves accent alias", () => {
    expect(resolveEffectColor("accent", "fallback")).toBe("var(--ds-color-accent)");
  });

  test("resolves shadow alias", () => {
    expect(resolveEffectColor("shadow", "fallback")).toBe("var(--ds-color-shadow)");
  });

  test("resolves surface alias", () => {
    expect(resolveEffectColor("surface", "fallback")).toBe("var(--ds-color-surface)");
  });

  test("resolves inverse alias", () => {
    expect(resolveEffectColor("inverse", "fallback")).toBe("var(--ds-color-text-inverse)");
  });

  test("passes through raw color values", () => {
    expect(resolveEffectColor("#ff0000", "fallback")).toBe("#ff0000");
    expect(resolveEffectColor("rgba(0,0,0,0.5)", "fallback")).toBe("rgba(0,0,0,0.5)");
  });
});

describe("composeEffectPresentation", () => {
  test("returns empty for undefined stack", () => {
    const result = composeEffectPresentation(undefined, "surface");
    expect(result.classes).toEqual([]);
    expect(result.vars).toEqual({});
  });

  test("returns empty for empty stack", () => {
    const result = composeEffectPresentation([], "surface");
    expect(result.classes).toEqual([]);
    expect(result.vars).toEqual({});
  });

  test("skips disabled effects", () => {
    const stack: Effect[] = [{ kind: "glass", enabled: false } as never];
    const result = composeEffectPresentation(stack, "surface");
    expect(result.classes).toEqual([]);
  });

  test("skips effects with non-matching strategy", () => {
    const stack: Effect[] = [{ kind: "glass", enabled: true } as never];
    const result = composeEffectPresentation(stack, "text");
    expect(result.classes).toEqual([]);
  });

  test("composes glass effect for surface strategy", () => {
    const stack: Effect[] = [
      { kind: "glass", enabled: true, blur: 20, saturate: 200, tintOpacity: 0.5 } as never,
    ];
    const result = composeEffectPresentation(stack, "surface");
    expect(result.classes).toContain("effect-host--glass");
    expect(result.vars["--effect-glass-blur"]).toBe("20px");
    expect(result.vars["--effect-glass-saturate"]).toBe("200%");
  });

  test("composes shadow effect for text strategy", () => {
    const stack: Effect[] = [
      { kind: "shadow", enabled: true, offsetX: 2, offsetY: 4, blur: 8, opacity: 0.5 } as never,
    ];
    const result = composeEffectPresentation(stack, "text");
    expect(result.classes).toContain("effect-text--shadow-stack");
    expect(result.vars["--effect-text-shadow"]).toBeTruthy();
    expect(result.vars["--effect-text-shadow"]).toContain("2px 4px 8px");
  });

  test("merges multiple shadow layers", () => {
    const stack: Effect[] = [
      { kind: "shadow", enabled: true, offsetX: 1, offsetY: 1, blur: 2, opacity: 0.3 } as never,
      { kind: "glow", enabled: true, blur: 10, opacity: 0.4 } as never,
    ];
    const result = composeEffectPresentation(stack, "text");
    expect(result.vars["--effect-text-shadow"]).toContain(",");
  });

  test("glass border none adds border-none class", () => {
    const stack: Effect[] = [{ kind: "glass", enabled: true, border: "none" } as never];
    const result = composeEffectPresentation(stack, "surface");
    expect(result.classes).toContain("effect-host--glass-border-none");
  });
});

describe("effectVarsToStyle", () => {
  test("returns undefined for empty vars", () => {
    expect(effectVarsToStyle({})).toBeUndefined();
  });

  test("serializes vars to inline style string", () => {
    const style = effectVarsToStyle({ "--effect-x": "10px", "--effect-y": "20px" });
    expect(style).toContain("--effect-x: 10px;");
    expect(style).toContain("--effect-y: 20px;");
  });

  test("handles single var", () => {
    const style = effectVarsToStyle({ "--effect-blur": "16px" });
    expect(style).toBe("--effect-blur: 16px;");
  });
});
