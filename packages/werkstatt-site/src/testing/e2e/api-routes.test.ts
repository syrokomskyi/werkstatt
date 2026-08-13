import { test, expect } from "@playwright/test";

test.describe("API routes", () => {
  test("send-message endpoint accepts POST", async ({ request }) => {
    const response = await request.post("/api/send-message", {
      data: {
        message: "E2E API test — please ignore",
        formId: "e2e-test",
        locale: "de",
      },
    });

    expect(response.status()).toBeLessThan(500);
  });

  test("non-existent API route returns 404", async ({ request }) => {
    const response = await request.get("/api/non-existent-route");
    expect(response.status()).toBe(404);
  });
});
