/*
 * RFC-0826: Integration test for matomo-proxy proxy forwarding.
 * Verifies that the proxy forwards requests to the upstream Matomo instance.
 * Guarded by RUN_INTEGRATION_TESTS — skipped by default.
 */

import { describe, expect, it } from "vitest";

const baseUrl = process.env.INTEGRATION_TEST_URL ?? "";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "matomo-proxy integration: proxy forwarding",
  () => {
    it("forwards GET requests to upstream Matomo via /_wg/analytics/", async () => {
      // The proxy should forward to the upstream Matomo instance.
      // We expect a response from the upstream (not 404/500 from the proxy itself).
      const response = await fetch(`${baseUrl}/_wg/analytics/matomo.php`);
      // The proxy may return various status codes depending on the upstream,
      // but it should not return a 404 (which would indicate the proxy isn't routing).
      expect(response.status).not.toBe(404);
    });
  },
);
