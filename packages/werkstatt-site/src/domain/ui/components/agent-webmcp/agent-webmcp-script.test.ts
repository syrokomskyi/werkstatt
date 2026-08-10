import { test, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RFC-0799: Unit tests for the agent-webmcp-script.astro component.
 *
 * These tests verify the component's source text invariants:
 * - Progressive enhancement guard (renders nothing when manifest is null)
 * - is:inline script with define:vars
 * - document.modelContext feature detection
 * - Tool registration for actions and knowledge domains
 * - try/catch with dev-mode console.warn guard
 */

describe("agent-webmcp-script.astro (RFC-0799)", () => {
  const astroSource = readFileSync(
    join(import.meta.dirname, "agent-webmcp-script.astro"),
    "utf8",
  );

  test("component renders nothing when manifest is null (progressive enhancement guard)", () => {
    expect(astroSource).toContain("{manifest && (");
    expect(astroSource).toContain("<script is:inline define:vars={{ manifestJson }}");
  });

  test("component serializes manifest to JSON in frontmatter", () => {
    expect(astroSource).toContain("const manifestJson = manifest ? JSON.stringify(manifest) : \"null\"");
  });

  test("script contains document.modelContext feature detection guard", () => {
    expect(astroSource).toContain("var mc = document.modelContext");
    expect(astroSource).toContain("if (!mc || typeof mc.registerTool !== \"function\") return");
  });

  test("script registers action tools with action. prefix", () => {
    expect(astroSource).toContain("mc.registerTool");
    expect(astroSource).toContain('"action." + action.id');
  });

  test("script registers knowledge tools with knowledge. prefix", () => {
    expect(astroSource).toContain('"knowledge." + domain.domain + ".get"');
  });

  test("script wraps registration in try/catch with dev-mode console.warn guard", () => {
    expect(astroSource).toContain("try {");
    expect(astroSource).toContain("} catch (e)");
    expect(astroSource).toContain("import.meta && import.meta.env && import.meta.env.DEV");
    expect(astroSource).toContain("console.warn");
  });
});
