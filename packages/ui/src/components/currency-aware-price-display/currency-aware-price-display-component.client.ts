/*
<MODULE_CONTRACT>
<purpose>
Client-side price swap behavior (RFC-0743). Listens for wg-currency-change
events and toggles hidden on pre-rendered currency variants. Also sets
data-wg-currency on <html> for cross-component sync.
</purpose>
<non-goals>
  <item>Do not manage currency selection — that is currency-selector-component.client.ts.</item>
  <item>Do not fetch rates or projections — all variants are pre-rendered server-side.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0743: Initial creation of currency-aware price display client script.</item>
  <item>Flash fix: inline script in .astro handles initial state during parsing. Module script handles event-driven updates.</item>
</CHANGE_SUMMARY>
*/

import {
  CURRENCY_CHANGE_EVENT,
  getSelectedCurrency,
} from "../../components/currency-selector/currency-selector-component.client.ts";

export function initCurrencyAwarePriceDisplay(container: HTMLElement): void {
  const variants = container.querySelectorAll<HTMLElement>("[data-currency]");

  if (variants.length === 0) return;

  function showCurrency(currency: string): void {
    document.documentElement.setAttribute("data-wg-currency", currency);
    let matched = false;
    for (const variant of variants) {
      const variantCurrency = variant.getAttribute("data-currency");
      if (variantCurrency === currency) {
        variant.removeAttribute("hidden");
        matched = true;
      } else {
        variant.setAttribute("hidden", "");
      }
    }
    if (!matched) {
      for (const variant of variants) {
        variant.removeAttribute("hidden");
      }
    }
  }

  const stored = getSelectedCurrency();
  if (stored) {
    showCurrency(stored);
  }

  window.addEventListener(CURRENCY_CHANGE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail && typeof detail.currency === "string") {
      showCurrency(detail.currency);
    }
  });
}
