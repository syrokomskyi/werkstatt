import { test, expect } from "@playwright/test";

test.describe("API routes", () => {
  test("send-message endpoint accepts POST", async ({ request }) => {
    const response = await request.post("/api/send-message", {
      data: {
        message: "E2E API test — please ignore. Contact: e2e-test@warpgogol.com",
        formId: "e2e-test",
        locale: "de",
      },
    });

    expect(response.status()).not.toBe(404);
  });

  test("non-existent API route returns 404", async ({ request }) => {
    const response = await request.get("/api/non-existent-route");
    expect(response.status()).toBe(404);
  });
});
