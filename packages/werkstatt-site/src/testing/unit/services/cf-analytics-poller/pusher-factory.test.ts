import { describe, it, expect } from "vitest";
import { createPollerPusher } from "@service/pusher-factory.ts";

describe("cf-analytics-poller pusher factory", () => {
  it("returns null when OTLP env vars are not set", () => {
    const pusher = createPollerPusher();
    expect(pusher).toBeNull();
  });
});
