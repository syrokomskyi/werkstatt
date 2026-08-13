import { test, expect } from "@playwright/test";

test.describe("Navigation links", () => {
  test("all main navigation links return 200", async ({ page }) => {
    await page.goto("/de");

    const navLinks = page.locator("nav a[href]");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) {
        continue;
      }

      const response = await page.request.get(href);
      expect(response.status(), `navigation link ${href}`).toBeLessThan(400);
    }
  });

  test("footer links return 200", async ({ page }) => {
    await page.goto("/de");

    const footerLinks = page.locator("footer a[href]");
    const count = await footerLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await footerLinks.nth(i).getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) {
        continue;
      }

      const response = await page.request.get(href);
      expect(response.status(), `footer link ${href}`).toBeLessThan(400);
    }
  });
});
