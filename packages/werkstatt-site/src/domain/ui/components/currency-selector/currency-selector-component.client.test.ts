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

class MockButton {
  private _currency: string;
  private _attrs = new Map<string, string>();
  private clickHandlers: Array<(event: { type: string }) => void> = [];
  classList = {
    toggle: (cls: string, force?: boolean) => {
      if (force) this._attrs.set(`class-${cls}`, "true");
      else this._attrs.delete(`class-${cls}`);
    },
  };

  constructor(currency: string) {
    this._currency = currency;
  }

  getAttribute(name: string): string | null {
    if (name === "data-currency-option") return this._currency;
    return this._attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this._attrs.set(name, value);
  }

  addEventListener(type: string, handler: (event: { type: string }) => void): void {
    if (type === "click") {
      this.clickHandlers.push(handler);
    }
  }

  dispatchEvent(event: { type: string }): boolean {
    if (event.type === "click") {
      for (const h of this.clickHandlers) {
        h(event);
      }
    }
    return true;
  }
}

class MockButtonContainer {
  private buttons: MockButton[];

  constructor(currencies: string[]) {
    this.buttons = currencies.map((c) => new MockButton(c));
  }

  querySelectorAll(_selector: string): MockButton[] {
    return this.buttons;
  }
}

const mockWindow = new MockWindow();
const mockLocalStorage = mockWindow.storage;
const mockDocumentElement = {
  setAttribute: vi.fn(),
};

// @ts-expect-error — injecting mock into global scope
globalThis.localStorage = mockLocalStorage;
// @ts-expect-error — injecting mock into global scope
globalThis.window = mockWindow;
// @ts-expect-error — injecting mock into global scope
globalThis.document = { documentElement: mockDocumentElement };
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
  CURRENCY_STORAGE_KEY_PREFIX,
  getCurrencyStorageKey,
  CURRENCY_CHANGE_EVENT,
  getSelectedCurrency,
  setSelectedCurrency,
  dispatchCurrencyChange,
  initCurrencySelector,
} = await import("./currency-selector-component.client.ts");

const testLang = "de";
const CURRENCY_STORAGE_KEY = getCurrencyStorageKey(testLang);

describe("currency-selector client", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockWindow._clearListeners();
    mockDocumentElement.setAttribute.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getSelectedCurrency", () => {
    test("returns null when localStorage is empty", () => {
      expect(getSelectedCurrency(testLang)).toBe(null);
    });

    test("returns stored currency", () => {
      mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "UAH");
      expect(getSelectedCurrency(testLang)).toBe("UAH");
    });

    test("returns null when localStorage throws", () => {
      const spy = vi.spyOn(mockLocalStorage, "getItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });
      expect(getSelectedCurrency(testLang)).toBe(null);
      spy.mockRestore();
    });

    test("uses locale-scoped key (wg-currency:de)", () => {
      mockLocalStorage.setItem(getCurrencyStorageKey("uk"), "UAH");
      expect(getSelectedCurrency("de")).toBe(null);
      expect(getSelectedCurrency("uk")).toBe("UAH");
    });
  });

  describe("setSelectedCurrency", () => {
    test("writes currency to locale-scoped localStorage key", () => {
      setSelectedCurrency("USD", testLang);
      expect(mockLocalStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("USD");
    });

    test("does not throw when localStorage is unavailable", () => {
      const spy = vi.spyOn(mockLocalStorage, "setItem").mockImplementation(() => {
        throw new Error("localStorage unavailable");
      });
      expect(() => setSelectedCurrency("USD", testLang)).not.toThrow();
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
    function createContainer(currencies: string[]): MockButtonContainer {
      return new MockButtonContainer(currencies);
    }

    test("sets aria-pressed from localStorage on init", () => {
      mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "UAH");
      const container = createContainer(["EUR", "UAH", "USD"]);
      initCurrencySelector(container as unknown as HTMLElement, ["EUR", "UAH", "USD"], testLang);
      const buttons = container.querySelectorAll("[data-currency-option]");
      expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
      expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
      expect(buttons[2]!.getAttribute("aria-pressed")).toBe("false");
      expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith("data-wg-currency", "UAH");
    });

    test("defaults to first currency when localStorage has unknown currency", () => {
      mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "GBP");
      const container = createContainer(["EUR", "UAH", "USD"]);
      initCurrencySelector(container as unknown as HTMLElement, ["EUR", "UAH", "USD"], testLang);
      const buttons = container.querySelectorAll("[data-currency-option]");
      expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
      expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith("data-wg-currency", "EUR");
    });

    test("defaults to first currency when localStorage is empty", () => {
      const container = createContainer(["EUR", "UAH", "USD"]);
      initCurrencySelector(container as unknown as HTMLElement, ["EUR", "UAH", "USD"], testLang);
      const buttons = container.querySelectorAll("[data-currency-option]");
      expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
      expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith("data-wg-currency", "EUR");
    });

    test("writes to localStorage, sets aria-pressed, and dispatches event on click", () => {
      const container = createContainer(["EUR", "UAH", "USD"]);
      initCurrencySelector(container as unknown as HTMLElement, ["EUR", "UAH", "USD"], testLang);
      const handler = vi.fn();
      mockWindow.addEventListener(CURRENCY_CHANGE_EVENT, handler);

      const buttons = container.querySelectorAll("[data-currency-option]");
      buttons[1]!.dispatchEvent({ type: "click" });

      expect(mockLocalStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("UAH");
      expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
      expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
      expect(mockDocumentElement.setAttribute).toHaveBeenLastCalledWith("data-wg-currency", "UAH");
      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0]![0] as { detail: unknown };
      expect(event.detail).toEqual({ currency: "UAH" });
    });

    test("syncs aria-pressed when wg-currency-change event fires", () => {
      const container = createContainer(["EUR", "UAH", "USD"]);
      initCurrencySelector(container as unknown as HTMLElement, ["EUR", "UAH", "USD"], testLang);

      mockWindow.dispatchEvent(
        new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: { currency: "USD" } }),
      );

      const buttons = container.querySelectorAll("[data-currency-option]");
      expect(buttons[0]!.getAttribute("aria-pressed")).toBe("false");
      expect(buttons[1]!.getAttribute("aria-pressed")).toBe("false");
      expect(buttons[2]!.getAttribute("aria-pressed")).toBe("true");
    });
  });
});
