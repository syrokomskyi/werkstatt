import { describe, it, expect } from "vitest";
import { createMaturityScoreWorker } from "@service/index.ts";

const env = {
  WARPGOGOL_OTLP_ENDPOINT: "",
  WARPGOGOL_OTLP_TOKEN: "",
};

describe("maturity-score /health", () => {
  it("returns 200 with status ok and service name", async () => {
    const worker = createMaturityScoreWorker();
    const req = new Request("https://maturity-score.workers.dev/health");
    const res = await worker.fetch(req, env, {} as unknown as Record<string, unknown>);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "maturity-score" });
  });
});
