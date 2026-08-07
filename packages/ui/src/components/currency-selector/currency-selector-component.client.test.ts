import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";

class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

interface ListenerEntry {
  type: string;
  handler: (event: unknown) => void;
}

class MockWindow {
  storage = new MockStorage();
  private listeners: ListenerEntry[] = [];

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.push({ type, handler });
  }

  removeEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.handler === handler));
  }

  dispatchEvent(event: { type: string; detail?: unknown }): boolean {
    for (const l of this.listeners) {
      if (l.type === event.type) {
        l.handler(event);
      }
    }
    return true;
  }

  _clearListeners(): void {
    this.listeners = [];
  }
}

class MockSelectElement {
  value = "";
  private changeHandlers: Array<(event: { type: string }) => void> = [];
  options: { value: string }[] = [];

  addEventListener(type: string, handler: (event: { type: string }) => void): void {
    if (type === "change") {
      this.changeHandlers.push(handler);
    }
  }

  dispatchEvent(event: { type: string }): boolean {
    if (event.type === "change") {
      for (const h of this.changeHandlers) {
        h(event);
      }
    }
    return true;
  }
}

const mockWindow = new MockWindow();
const mockLocalStorage = mockWindow.storage;

// @ts-expect-error — injecting mock into global scope
globalThis.localStorage = mockLocalStorage;
// @ts-expect-error — injecting mock into global scope
globalThis.window = mockWindow;
// @ts-expect-error — injecting mock into global scope
globalThis.CustomEvent = class CustomEvent<T = unknown> {
  type: string;
  detail: T;
  constructor(type: string, init?: { detail?: T }) {
    this.type = type;
    this.detail = (init?.detail ?? undefined) as T;
  }
};

const {
  CURRENCY_STORAGE_KEY,
  CURRENCY_CHANGE_EVENT,
  getSelectedCurrency,
  setSelectedCurrency,
  dispatchCurrencyChange,
  initCurrencySelector,
} = await import("./currency-selector-component.client.ts");

describe("currency-selector client", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockWindow._clearListeners();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getSelectedCurrency", () => {
    test("returns null when localStorage is empty", () => {
      expect(getSelectedCurrency()).toBe(null);
    });

    test("returns stored currency", () => {
      mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "UAH");
      expect(getSelectedCurrency()).toBe("UAH");
    });

    test("returns null when localStorage throws", () => {
      const spy = vi.spyOn(mockLocalStorage, "getItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });
      expect(getSelectedCurrency()).toBe(null);
      spy.mockRestore();
    });
  });

  describe("setSelectedCurrency", () => {
    test("writes currency to localStorage", () => {
      setSelectedCurrency("USD");
      expect(mockLocalStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("USD");
    });

    test("does not throw when localStorage is unavailable", () => {
      const spy = vi.spyOn(mockLocalStorage, "setItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });
      expect(() => setSelectedCurrency("USD")).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("dispatchCurrencyChange", () => {
    test("dispatches wg-currency-change event with currency detail", () => {
      const handler = vi.fn();
      mockWindow.addEventListener(CURRENCY_CHANGE_EVENT, handler);
      dispatchCurrencyChange("EUR");
      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0]![0] as { detail: unknown };
      expect(event.detail).toEqual({ currency: "EUR" });
    });
  });

  describe("initCurrencySelector", () => {
    function createSelect(currencies: string[]): MockSelectElement {
      const select = new MockSelectElement();
      for (const code of currencies) {
        select.options.push({ value: code });
      }
      select.value = currencies[0] ?? "";
      return select;
    }

    test("sets initial value from localStorage", () => {
      mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "UAH");
      const select = createSelect(["EUR", "UAH", "USD"]);
      initCurrencySelector(select as unknown as HTMLSelectElement, ["EUR", "UAH", "USD"]);
      expect(select.value).toBe("UAH");
    });

    test("defaults to first currency when localStorage has unknown currency", () => {
      mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "GBP");
      const select = createSelect(["EUR", "UAH", "USD"]);
      initCurrencySelector(select as unknown as HTMLSelectElement, ["EUR", "UAH", "USD"]);
      expect(select.value).toBe("EUR");
    });

    test("defaults to first currency when localStorage is empty", () => {
      const select = createSelect(["EUR", "UAH", "USD"]);
      initCurrencySelector(select as unknown as HTMLSelectElement, ["EUR", "UAH", "USD"]);
      expect(select.value).toBe("EUR");
    });

    test("writes to localStorage and dispatches event on change", () => {
      const select = createSelect(["EUR", "UAH", "USD"]);
      initCurrencySelector(select as unknown as HTMLSelectElement, ["EUR", "UAH", "USD"]);
      const handler = vi.fn();
      mockWindow.addEventListener(CURRENCY_CHANGE_EVENT, handler);

      select.value = "UAH";
      select.dispatchEvent({ type: "change" });

      expect(mockLocalStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("UAH");
      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0]![0] as { detail: unknown };
      expect(event.detail).toEqual({ currency: "UAH" });
    });

    test("syncs select value when wg-currency-change event fires", () => {
      const select = createSelect(["EUR", "UAH", "USD"]);
      initCurrencySelector(select as unknown as HTMLSelectElement, ["EUR", "UAH", "USD"]);

      mockWindow.dispatchEvent(
        new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: { currency: "USD" } }),
      );

      expect(select.value).toBe("USD");
    });
  });
});
