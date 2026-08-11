import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { collectGatedPageIds } from "@warpgogol/werkstatt-site/share/astro/deployment-gate";

/*
<MODULE_CONTRACT>
  <purpose>
    Unit tests for collectGatedPageIds() (RFC-0803).
  </purpose>
</MODULE_CONTRACT>
*/

describe("collectGatedPageIds (RFC-0803)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("production mode", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("returns empty set when no pages have deployment.production === false", () => {
      const pages = [
        { pageId: "home", deployment: { production: true } },
        { pageId: "about", deployment: { production: true } },
        { pageId: "contact" },
      ];
      expect(collectGatedPageIds(pages).size).toBe(0);
    });

    it("returns pageIds where deployment.production === false", () => {
      const pages = [
        { pageId: "home", deployment: { production: true } },
        { pageId: "secret", deployment: { production: false } },
        { pageId: "draft", deployment: { production: false } },
        { pageId: "about" },
      ];
      const gated = collectGatedPageIds(pages);
      expect(gated.size).toBe(2);
      expect(gated.has("secret")).toBe(true);
      expect(gated.has("draft")).toBe(true);
      expect(gated.has("home")).toBe(false);
      expect(gated.has("about")).toBe(false);
    });

    it("skips pages without pageId even if deployment.production is false", () => {
      const pages = [
        { pageId: "home", deployment: { production: true } },
        { deployment: { production: false } },
      ];
      const gated = collectGatedPageIds(pages);
      expect(gated.size).toBe(0);
    });

    it("handles empty pages array", () => {
      expect(collectGatedPageIds([]).size).toBe(0);
    });

    it("handles pages without deployment field", () => {
      const pages = [
        { pageId: "home" },
        { pageId: "about" },
      ];
      expect(collectGatedPageIds(pages).size).toBe(0);
    });
  });

  describe("dev mode (non-production)", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("returns empty set in dev mode even when pages are gated", () => {
      const pages = [
        { pageId: "secret", deployment: { production: false } },
        { pageId: "draft", deployment: { production: false } },
      ];
      expect(collectGatedPageIds(pages).size).toBe(0);
    });

    it("returns empty set when NODE_ENV is undefined", () => {
      delete process.env.NODE_ENV;
      const pages = [
        { pageId: "secret", deployment: { production: false } },
      ];
      expect(collectGatedPageIds(pages).size).toBe(0);
    });
  });
});
