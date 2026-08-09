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

class MockVariantElement {
  private _hidden = false;
  private _currency: string;
  textContent = "";

  constructor(currency: string) {
    this._currency = currency;
  }

  getAttribute(name: string): string | null {
    if (name === "data-currency") return this._currency;
    if (name === "hidden") return this._hidden ? "" : null;
    return null;
  }

  setAttribute(name: string, _value: string): void {
    if (name === "hidden") this._hidden = true;
  }

  removeAttribute(name: string): void {
    if (name === "hidden") this._hidden = false;
  }

  hasAttribute(name: string): boolean {
    if (name === "hidden") return this._hidden;
    return false;
  }
}

class MockContainer {
  private variants: MockVariantElement[];

  constructor(currencies: string[]) {
    this.variants = currencies.map((c) => new MockVariantElement(c));
  }

  querySelectorAll(selector: string): MockVariantElement[] {
    if (selector === "[data-currency]") return this.variants;
    return [];
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

const { initCurrencyAwarePriceDisplay } =
  await import("./currency-aware-price-display-component.client.ts");
const { CURRENCY_CHANGE_EVENT, getCurrencyStorageKey } =
  await import("../currency-selector/currency-selector-component.client.ts");

const testLang = "de";
const CURRENCY_STORAGE_KEY = getCurrencyStorageKey(testLang);

describe("currency-aware-price-display client", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockWindow._clearListeners();
    mockDocumentElement.setAttribute.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows variant matching localStorage on init", () => {
    mockLocalStorage.setItem(CURRENCY_STORAGE_KEY, "UAH");
    const container = new MockContainer(["EUR", "UAH", "USD"]);

    initCurrencyAwarePriceDisplay(container as unknown as HTMLElement, testLang);

    const variants = container.querySelectorAll("[data-currency]");
    expect(variants[0]!.hasAttribute("hidden")).toBe(true);
    expect(variants[1]!.hasAttribute("hidden")).toBe(false);
    expect(variants[2]!.hasAttribute("hidden")).toBe(true);
    expect(mockDocumentElement.setAttribute).toHaveBeenCalledWith("data-wg-currency", "UAH");
  });

  test("toggles visibility on wg-currency-change event", () => {
    const container = new MockContainer(["EUR", "UAH", "USD"]);

    initCurrencyAwarePriceDisplay(container as unknown as HTMLElement, testLang);

    mockWindow.dispatchEvent(
      new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: { currency: "USD" } }),
    );

    const variants = container.querySelectorAll("[data-currency]");
    expect(variants[0]!.hasAttribute("hidden")).toBe(true);
    expect(variants[1]!.hasAttribute("hidden")).toBe(true);
    expect(variants[2]!.hasAttribute("hidden")).toBe(false);
  });

  test("shows all variants when currency does not match any", () => {
    const container = new MockContainer(["EUR", "UAH"]);

    initCurrencyAwarePriceDisplay(container as unknown as HTMLElement, testLang);

    mockWindow.dispatchEvent(
      new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: { currency: "GBP" } }),
    );

    const variants = container.querySelectorAll("[data-currency]");
    expect(variants[0]!.hasAttribute("hidden")).toBe(false);
    expect(variants[1]!.hasAttribute("hidden")).toBe(false);
  });

  test("does nothing when container has no variants", () => {
    const container = new MockContainer([]);

    expect(() =>
      initCurrencyAwarePriceDisplay(container as unknown as HTMLElement, testLang),
    ).not.toThrow();
  });
});
