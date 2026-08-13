import { test, expect } from "@playwright/test";

test.describe("Contact form flow", () => {
  test("submit form successfully", async ({ page }) => {
    await page.goto("/de/kontakt");

    const form = page.locator("[data-send-message-form]");
    await expect(form).toBeVisible();

    const formId = await form.getAttribute("data-form-id");
    expect(formId).toBeTruthy();

    await page.fill(
      "[data-send-message-textarea]",
      "E2E test message — please ignore. Contact: e2e-test@warpgogol.com",
    );

    await page.click("[data-send-message-submit]");

    await expect(form).toBeHidden({ timeout: 15_000 });
  });

  test("form validation prevents empty submission", async ({ page }) => {
    await page.goto("/de/kontakt");

    const form = page.locator("[data-send-message-form]");
    await expect(form).toBeVisible();

    await page.click("[data-send-message-submit]");

    await expect(page.locator("[data-send-message-success]")).not.toBeVisible({ timeout: 5_000 });
  });
});
