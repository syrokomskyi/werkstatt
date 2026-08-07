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
</CHANGE_SUMMARY>
*/

export const CURRENCY_STORAGE_KEY = "wg-currency";
export const CURRENCY_CHANGE_EVENT = "wg-currency-change";

export function getSelectedCurrency(): string | null {
  try {
    return localStorage.getItem(CURRENCY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSelectedCurrency(currency: string): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
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
  selectElement: HTMLSelectElement,
  currencies: string[],
): void {
  const stored = getSelectedCurrency();
  const initialCurrency =
    stored && currencies.includes(stored) ? stored : (currencies[0] ?? "");

  if (initialCurrency && selectElement.value !== initialCurrency) {
    selectElement.value = initialCurrency;
  }

  selectElement.addEventListener("change", () => {
    const currency = selectElement.value;
    setSelectedCurrency(currency);
    dispatchCurrencyChange(currency);
  });

  window.addEventListener(CURRENCY_CHANGE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail && typeof detail.currency === "string") {
      selectElement.value = detail.currency;
    }
  });
}
