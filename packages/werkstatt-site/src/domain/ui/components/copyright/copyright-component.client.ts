/*
<MODULE_CONTRACT>
<purpose>Maintains packages/werkstatt-site/src/domain/ui/components/copyright/copyright-component.client.ts as an authored ui component module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not handle server-side rendering or framework hydration.</item>
  <item>Do not modify yearFirst elements per RFC-0005.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: Migrated from public/scripts/components/copyright.js into colocated *.client.ts per quartet S-1 preferred pattern.</item>
</CHANGE_SUMMARY>
*/

/**
 * Copyright Year Sync - RFC-0005
 *
 * Updates copyright year client-side to ensure current year display
 * without hydration flicker.
 *
 * @rfc RFC-0005
 * @rfc RFC-0031
 */
function syncCopyrightYear(): void {
  const currentYear = new Date().getFullYear();
  const secondYearElements = document.querySelectorAll<HTMLElement>(
    '[data-copyright-year="second"]',
  );

  secondYearElements.forEach((element) => {
    const renderedYear = parseInt(element.textContent ?? "", 10);

    // Only update if different to prevent DOM churn
    if (renderedYear !== currentYear) {
      element.textContent = String(currentYear);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncCopyrightYear);
} else {
  syncCopyrightYear();
}
