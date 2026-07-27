import { test, expect, describe } from "vitest";
import NullChatAdapter from "../index.ts";

describe("NullChatAdapter", () => {
  test("id is 'null'", () => {
    expect(NullChatAdapter.id).toBe("null");
  });

  test("load() resolves to 'ready'", async () => {
    const result = await NullChatAdapter.load({} as never);
    expect(result).toBe("ready");
  });

  test("open() returns 'opened'", () => {
    const result = NullChatAdapter.open();
    expect(result).toBe("opened");
  });

  test("load() is idempotent — multiple calls return 'ready'", async () => {
    const config = { appId: "test", locale: "de", adapter: "null", options: {} } as never;
    expect(await NullChatAdapter.load(config)).toBe("ready");
    expect(await NullChatAdapter.load(config)).toBe("ready");
  });

  test("open() is idempotent — multiple calls return 'opened'", () => {
    expect(NullChatAdapter.open()).toBe("opened");
    expect(NullChatAdapter.open()).toBe("opened");
  });

  test("does not declare requiredOptions", () => {
    expect(NullChatAdapter.requiredOptions).toBeUndefined();
  });

  test("does not declare vendorOrigins", () => {
    expect(NullChatAdapter.vendorOrigins).toBeUndefined();
  });
});
