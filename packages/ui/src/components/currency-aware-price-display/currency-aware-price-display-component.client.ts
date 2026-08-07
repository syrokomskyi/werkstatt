/*
<MODULE_CONTRACT>
<purpose>
Client-side price swap behavior (RFC-0743). Listens for wg-currency-change
events and toggles hidden on pre-rendered currency variants.
</purpose>
<non-goals>
  <item>Do not manage currency selection — that is currency-selector-component.client.ts.</item>
  <item>Do not fetch rates or projections — all variants are pre-rendered server-side.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0743: Initial creation of currency-aware price display client script.</item>
</CHANGE_SUMMARY>
*/

import { CURRENCY_CHANGE_EVENT, getSelectedCurrency } from "../../components/currency-selector/currency-selector-component.client.ts";

export function initCurrencyAwarePriceDisplay(
  container: HTMLElement,
): void {
  const variants = container.querySelectorAll<HTMLElement>(
    "[data-currency]",
  );

  if (variants.length === 0) return;

  function showCurrency(currency: string): void {
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
