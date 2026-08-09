import { test, expect, describe } from "vitest";
import {
  CHAT_ADAPTER_IDS,
  isChatAdapterId,
  ChatWidgetConfigSchema,
  CHAT_CONFIG_SCRIPT_ID,
} from "../port.ts";
import {
  CHAT_ADAPTER_METADATA,
  getChatAdapterMetadata,
  chatAdapterVendorOrigins,
} from "../adapter-metadata.ts";

describe("CHAT_ADAPTER_IDS", () => {
  test("contains uchat and null", () => {
    expect(CHAT_ADAPTER_IDS).toContain("uchat");
    expect(CHAT_ADAPTER_IDS).toContain("null");
  });

  test("has exactly 2 entries", () => {
    expect(CHAT_ADAPTER_IDS).toHaveLength(2);
  });
});

describe("isChatAdapterId", () => {
  test("returns true for known adapter ids", () => {
    expect(isChatAdapterId("uchat")).toBe(true);
    expect(isChatAdapterId("null")).toBe(true);
  });

  test("returns false for unknown adapter ids", () => {
    expect(isChatAdapterId("intercom")).toBe(false);
    expect(isChatAdapterId("")).toBe(false);
  });
});

describe("ChatWidgetConfigSchema", () => {
  test("accepts a valid config", () => {
    const result = ChatWidgetConfigSchema.safeParse({
      appId: "my-app",
      locale: "de",
      adapter: "uchat",
      options: { widgetId: "abc" },
    });
    expect(result.success).toBe(true);
  });

  test("defaults options to empty record", () => {
    const result = ChatWidgetConfigSchema.safeParse({
      appId: "my-app",
      locale: "de",
      adapter: "null",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toEqual({});
    }
  });

  test("rejects empty appId", () => {
    expect(
      ChatWidgetConfigSchema.safeParse({ appId: "", locale: "de", adapter: "null" }).success,
    ).toBe(false);
  });

  test("rejects locale shorter than 2 chars", () => {
    expect(
      ChatWidgetConfigSchema.safeParse({ appId: "app", locale: "d", adapter: "null" }).success,
    ).toBe(false);
  });

  test("rejects unknown adapter", () => {
    expect(
      ChatWidgetConfigSchema.safeParse({ appId: "app", locale: "de", adapter: "intercom" }).success,
    ).toBe(false);
  });

  test("accepts null adapter with no options", () => {
    const result = ChatWidgetConfigSchema.safeParse({
      appId: "app",
      locale: "de",
      adapter: "null",
    });
    expect(result.success).toBe(true);
  });
});

describe("CHAT_CONFIG_SCRIPT_ID", () => {
  test("is a non-empty string", () => {
    expect(CHAT_CONFIG_SCRIPT_ID.length).toBeGreaterThan(0);
  });

  test("starts with __", () => {
    expect(CHAT_CONFIG_SCRIPT_ID.startsWith("__")).toBe(true);
  });
});

describe("CHAT_ADAPTER_METADATA", () => {
  test("has entries for all CHAT_ADAPTER_IDS", () => {
    for (const id of CHAT_ADAPTER_IDS) {
      expect(CHAT_ADAPTER_METADATA[id]).toBeDefined();
    }
  });

  test("null adapter has no required options or origins", () => {
    expect(CHAT_ADAPTER_METADATA.null.requiredOptions).toBeUndefined();
    expect(CHAT_ADAPTER_METADATA.null.vendorOrigins).toBeUndefined();
  });

  test("uchat adapter has requiredOptions and vendorOrigins", () => {
    expect(CHAT_ADAPTER_METADATA.uchat.requiredOptions).toBeDefined();
    expect(CHAT_ADAPTER_METADATA.uchat.vendorOrigins).toBeDefined();
    expect(CHAT_ADAPTER_METADATA.uchat.vendorOrigins).toContain("uchat.com.au");
  });
});

describe("getChatAdapterMetadata", () => {
  test("returns metadata for known adapter", () => {
    const meta = getChatAdapterMetadata("uchat");
    expect(meta.vendorOrigins).toBeDefined();
  });

  test("returns empty object for unknown adapter", () => {
    expect(getChatAdapterMetadata("unknown")).toEqual({});
  });
});

describe("chatAdapterVendorOrigins", () => {
  test("returns origins for uchat", () => {
    const origins = chatAdapterVendorOrigins("uchat");
    expect(origins.length).toBeGreaterThan(0);
    expect(origins).toContain("uchat.com.au");
  });

  test("returns empty array for null adapter", () => {
    expect(chatAdapterVendorOrigins("null")).toEqual([]);
  });

  test("returns empty array for unknown adapter", () => {
    expect(chatAdapterVendorOrigins("unknown")).toEqual([]);
  });
});
