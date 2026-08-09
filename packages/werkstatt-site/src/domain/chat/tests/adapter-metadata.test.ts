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
  test("includes uchat and null", () => {
    expect(CHAT_ADAPTER_IDS).toContain("uchat");
    expect(CHAT_ADAPTER_IDS).toContain("null");
  });

  test("is a readonly tuple (as const)", () => {
    expect(Array.isArray(CHAT_ADAPTER_IDS)).toBe(true);
    expect(CHAT_ADAPTER_IDS.length).toBeGreaterThan(0);
  });
});

describe("isChatAdapterId", () => {
  test("returns true for known ids", () => {
    expect(isChatAdapterId("uchat")).toBe(true);
    expect(isChatAdapterId("null")).toBe(true);
  });

  test("returns false for unknown ids", () => {
    expect(isChatAdapterId("intercom")).toBe(false);
    expect(isChatAdapterId("")).toBe(false);
  });
});

describe("ChatWidgetConfigSchema", () => {
  const valid = {
    appId: "my-app",
    locale: "de",
    adapter: "null",
    options: {},
  };

  test("accepts valid config", () => {
    const result = ChatWidgetConfigSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("defaults options to empty object", () => {
    const { options: _, ...withoutOptions } = valid;
    const result = ChatWidgetConfigSchema.safeParse(withoutOptions);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options).toEqual({});
    }
  });

  test("rejects empty appId", () => {
    expect(ChatWidgetConfigSchema.safeParse({ ...valid, appId: "" }).success).toBe(false);
  });

  test("rejects short locale", () => {
    expect(ChatWidgetConfigSchema.safeParse({ ...valid, locale: "d" }).success).toBe(false);
  });

  test("rejects unknown adapter", () => {
    expect(ChatWidgetConfigSchema.safeParse({ ...valid, adapter: "intercom" }).success).toBe(false);
  });

  test("accepts string options map", () => {
    const result = ChatWidgetConfigSchema.safeParse({
      ...valid,
      options: { widgetId: "abc", scriptUrl: "https://example.com/script.js" },
    });
    expect(result.success).toBe(true);
  });
});

describe("CHAT_CONFIG_SCRIPT_ID", () => {
  test("is a non-empty string", () => {
    expect(CHAT_CONFIG_SCRIPT_ID).toBeTruthy();
    expect(CHAT_CONFIG_SCRIPT_ID.length).toBeGreaterThan(0);
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
    expect(CHAT_ADAPTER_METADATA.uchat.requiredOptions).toBeTruthy();
    expect(CHAT_ADAPTER_METADATA.uchat.vendorOrigins).toBeTruthy();
    expect(CHAT_ADAPTER_METADATA.uchat.vendorOrigins).toContain("uchat.com.au");
  });
});

describe("getChatAdapterMetadata", () => {
  test("returns metadata for known id", () => {
    const meta = getChatAdapterMetadata("uchat");
    expect(meta.vendorOrigins).toContain("uchat.com.au");
  });

  test("returns empty object for unknown id", () => {
    expect(getChatAdapterMetadata("intercom")).toEqual({});
  });
});

describe("chatAdapterVendorOrigins", () => {
  test("returns origins for known adapter", () => {
    const origins = chatAdapterVendorOrigins("uchat");
    expect(origins).toContain("uchat.com.au");
  });

  test("returns empty for unknown adapter", () => {
    expect(chatAdapterVendorOrigins("intercom")).toEqual([]);
  });

  test("returns empty for null adapter", () => {
    expect(chatAdapterVendorOrigins("null")).toEqual([]);
  });
});
