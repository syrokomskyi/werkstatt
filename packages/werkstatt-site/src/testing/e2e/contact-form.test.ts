import { test, expect } from "@playwright/test";

test.describe("Contact form flow", () => {
  test("submit form successfully", async ({ page }) => {
    await page.goto("/de/kontakt");

    const form = page.locator('[data-testid="contact-form"]');
    await expect(form).toBeVisible();

    const formId = await form.getAttribute("data-form-id");
    expect(formId).toBeTruthy();

    await page.fill('[data-testid="contact-message"]', "E2E test message — please ignore");

    await page.click('[data-testid="contact-submit"]');

    await expect(page.locator('[data-testid="contact-success"]')).toBeVisible({ timeout: 15_000 });
  });

  test("form validation prevents empty submission", async ({ page }) => {
    await page.goto("/de/kontakt");

    await expect(page.locator('[data-testid="contact-form"]')).toBeVisible();

    await page.click('[data-testid="contact-submit"]');

    await expect(page.locator('[data-testid="contact-success"]')).not.toBeVisible({ timeout: 5_000 });
  });
});
