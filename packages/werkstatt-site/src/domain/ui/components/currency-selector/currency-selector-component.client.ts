/*
<MODULE_CONTRACT>
<purpose>
Client-side currency selector behavior (RFC-0743). Reads/writes localStorage,
dispatches wg-currency-change events, and syncs across multiple instances.
</purpose>
<non-goals>
  <item>Do not manage price display — that is currency-aware-price-display-component.client.ts.</item>
  <item>Do not fetch rates or projections — all data is pre-materialized at build time.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0743: Initial creation of currency selector client script.</item>
  <item>RFC-0782: Locale-scoped localStorage key (wg-currency:{lang}) and lang parameter on all public functions.</item>
</CHANGE_SUMMARY>
*/

export const CURRENCY_STORAGE_KEY_PREFIX = "wg-currency";
export const CURRENCY_CHANGE_EVENT = "wg-currency-change";

export function getCurrencyStorageKey(lang: string): string {
  return `${CURRENCY_STORAGE_KEY_PREFIX}:${lang}`;
}

export function getSelectedCurrency(lang: string): string | null {
  try {
    return localStorage.getItem(getCurrencyStorageKey(lang));
  } catch {
    return null;
  }
}

export function setSelectedCurrency(currency: string, lang: string): void {
  try {
    localStorage.setItem(getCurrencyStorageKey(lang), currency);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function dispatchCurrencyChange(currency: string): void {
  window.dispatchEvent(
    new CustomEvent(CURRENCY_CHANGE_EVENT, {
      detail: { currency },
    }),
  );
}

export function initCurrencySelector(
  container: HTMLElement,
  currencies: string[],
  lang: string,
): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>("[data-currency-option]");
  if (buttons.length === 0) return;

  const stored = getSelectedCurrency(lang);
  const initialCurrency = stored && currencies.includes(stored) ? stored : (currencies[0] ?? "");

  function setActive(currency: string): void {
    document.documentElement.setAttribute("data-wg-currency", currency);
    for (const btn of buttons) {
      const isActive = btn.getAttribute("data-currency-option") === currency;
      btn.setAttribute("aria-pressed", String(isActive));
      btn.classList.toggle("currency-selector__option--active", isActive);
    }
  }

  if (initialCurrency) {
    setActive(initialCurrency);
  }

  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      const currency = btn.getAttribute("data-currency-option") ?? "";
      if (!currency) return;
      setSelectedCurrency(currency, lang);
      setActive(currency);
      dispatchCurrencyChange(currency);
    });
  }

  window.addEventListener(CURRENCY_CHANGE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail && typeof detail.currency === "string") {
      setActive(detail.currency);
    }
  });
}
