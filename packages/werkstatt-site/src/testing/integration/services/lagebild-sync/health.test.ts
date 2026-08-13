/*
 * RFC-0826: Integration test for lagebild-sync health endpoint.
 * Runs against the dev-deployed Worker using INTEGRATION_TEST_URL.
 * Guarded by RUN_INTEGRATION_TESTS — skipped by default.
 */

import { describe, expect, it } from "vitest";

const baseUrl = process.env.INTEGRATION_TEST_URL ?? "";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "lagebild-sync integration: health endpoint",
  () => {
    it("returns 200 with status ok", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("lagebild-sync");
    });

    it("returns 404 for unknown paths", async () => {
      const response = await fetch(`${baseUrl}/nonexistent-path`);
      expect(response.status).toBe(404);
    });
  },
);
