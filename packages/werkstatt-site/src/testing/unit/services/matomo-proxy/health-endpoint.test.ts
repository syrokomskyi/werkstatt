import { describe, it, expect } from "vitest";
import worker from "@service/worker.ts";

const env = {
  WARPGOGOL_OTLP_ENDPOINT: "",
  WARPGOGOL_OTLP_TOKEN: "",
};

describe("matomo-proxy /health", () => {
  it("returns 200 with status ok and service name", async () => {
    const req = new Request("https://matomo-proxy.workers.dev/health");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "matomo-proxy" });
  });
});
