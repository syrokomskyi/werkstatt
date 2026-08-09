/*
<MODULE_CONTRACT>
<purpose>Facilitates user interactions within the donation card component, enhancing usability through clipboard operations and modal management.</purpose>
<non-goals>
  <item>Do not handle server-side data fetching or processing.</item>
  <item>Do not manage global application state or routing.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

// Client-side script for donation card component
// Handles copy buttons, QR code modal, and dropdown interactions

function initDonationCard() {
  // Copy button functionality
  const copyButtons = document.querySelectorAll<HTMLButtonElement>(".donation-card__copy-btn");

  copyButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.getAttribute("data-copy-value");
      if (value) {
        try {
          await navigator.clipboard.writeText(value);

          // Trigger icon animation
          const icon = btn.querySelector("lord-icon");
          // lord-icon is a custom element with a runtime `play()` method that
          // isn't in its public TS shape. Narrow via the duck-typed view.
          type LordIconElement = Element & { play?: () => void };
          const lordIcon = icon as LordIconElement | null;
          if (lordIcon && typeof lordIcon.play === "function") {
            lordIcon.play();
          }

          // Show brief success feedback
          const originalText = btn.querySelector(".donation-card__copy-label")?.textContent;
          const label = btn.querySelector(".donation-card__copy-label");
          if (label) {
            label.textContent = "Kopiert!";
            setTimeout(() => {
              if (originalText) label.textContent = originalText;
            }, 1500);
          }
        } catch (err) {
          console.error("[clipboard-copy-failure]", err);
        }
      }
    });
  });

  // QR code modal functionality
  const qrModal = document.querySelector<HTMLDivElement>("[data-qr-modal]");
  const qrModalTriggers = document.querySelectorAll<HTMLButtonElement>("[data-qr-modal-trigger]");
  const qrModalCloses = document.querySelectorAll<HTMLElement>("[data-qr-modal-close]");

  if (qrModal) {
    // Move modal to <body> so it escapes any parent containing blocks
    // (e.g. backdrop-filter on an ancestor EffectHost / SectionShell)
    // and can reliably overlay all page content.
    if (qrModal.parentElement !== document.body) {
      document.body.appendChild(qrModal);
    }
    qrModalTriggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        qrModal.hidden = false;
        qrModal.querySelector("button")?.focus();
      });
    });

    qrModalCloses.forEach((close) => {
      close.addEventListener("click", () => {
        qrModal.hidden = true;
      });
    });

    // Close modal on escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !qrModal.hidden) {
        qrModal.hidden = true;
      }
    });

    // Close modal when clicking outside
    qrModal.querySelector<HTMLElement>("[data-qr-modal-overlay]")?.addEventListener("click", () => {
      qrModal.hidden = true;
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDonationCard);
} else {
  initDonationCard();
}
