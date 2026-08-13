/*
 * RFC-0826: Integration test for matomo-proxy health endpoint.
 * Runs against the dev-deployed Worker using INTEGRATION_TEST_URL.
 * Guarded by RUN_INTEGRATION_TESTS — skipped by default.
 */

import { describe, expect, it } from "vitest";

const baseUrl = process.env.INTEGRATION_TEST_URL ?? "";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "matomo-proxy integration: health endpoint",
  () => {
    it("returns 200 on /health", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("matomo-proxy");
    });

    it("returns 200 on /_wg/analytics/health", async () => {
      const response = await fetch(`${baseUrl}/_wg/analytics/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("matomo-proxy");
    });
  },
);
