import { describe, it, expect } from "vitest";
import worker from "@service/index.ts";

describe("lagebild-sync /health", () => {
  it("returns 200 with status ok and service name", async () => {
    const req = new Request("https://lagebild-sync.workers.dev/health");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "lagebild-sync" });
  });
});
