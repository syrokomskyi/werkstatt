import { describe, it, expect } from "vitest";
import worker from "@service/worker.ts";

const env = {
  BRIDGE_SECRET: "test-secret",
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_CHAT_ID: "test-chat",
  WARPGOGOL_OTLP_ENDPOINT: "",
  WARPGOGOL_OTLP_TOKEN: "",
};

describe("telegram-alert-bridge /health", () => {
  it("returns 200 with status ok and service name", async () => {
    const req = new Request("https://telegram-alert-bridge.workers.dev/health");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "telegram-alert-bridge" });
  });
});
