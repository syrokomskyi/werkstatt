/*
<MODULE_CONTRACT>
<purpose>Client-side form behavior for the send-message section: validation, submission, success/error handling, and fallback UX.</purpose>
<non-goals>
  <item>Do not implement server-side transport logic.</item>
  <item>Do not persist messages in localStorage or cookies.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0140: Introduce colocated client script for the send-message section.</item>
  <item>RFC-0514: Read structured email/phone fields; remove regex-based hasContactDetails.</item>
  <item>RFC-0567: Add referrerField handling — query, validate, transmit referrer value.</item>
  <item>RFC-0572: Revert to regex-based hasContactDetails; remove structured email/phone field logic.</item>
</CHANGE_SUMMARY>
*/

type StatusKind = "idle" | "error" | "success";

interface SendMessagePayload {
  message: string;
  formId: string;
  referrer?: string;
}

const EMAIL_EXTRACT_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_EXTRACT_REGEX = /(?:\+?\d[\d\s\-()]{7,}\d)/;

function hasContactDetails(message: string): boolean {
  return EMAIL_EXTRACT_REGEX.test(message) || PHONE_EXTRACT_REGEX.test(message);
}

function orEmpty(v: string | undefined): string {
  return v ?? "";
}

function setStatus(
  statusEl: HTMLElement | null,
  kind: StatusKind,
  message: string | undefined,
  defaultHint: string | undefined,
): void {
  if (!statusEl) return;
  if (kind === "idle") {
    statusEl.textContent = orEmpty(defaultHint);
    statusEl.dataset.status = "idle";
    return;
  }

  statusEl.textContent = orEmpty(message);
  statusEl.dataset.status = kind;
}

function emitContactSubmit(locale: string, formId: string): void {
  const emit = (
    window as Window & {
      __warpgogol_emit__?: (name: string, payload: Record<string, unknown>) => void;
    }
  ).__warpgogol_emit__;

  if (typeof emit !== "function") return;
  emit("contact-submit", { locale, formId });
}

function bindForm(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>("[data-send-message-form]");
  const textarea = root.querySelector<HTMLTextAreaElement>("[data-send-message-textarea]");
  const referrerInput = root.querySelector<HTMLInputElement>("[data-send-message-referrer]");
  const button = root.querySelector<HTMLButtonElement>("[data-send-message-submit]");
  const statusEl = root.querySelector<HTMLElement>("[data-send-message-status]");
  const successEl = root.querySelector<HTMLElement>("[data-send-message-success]");
  const fallbackEl = root.querySelector<HTMLElement>("[data-send-message-fallback]");
  const fallbackTextEl = root.querySelector<HTMLElement>("[data-send-message-fallback-text]");
  const copyBtn = root.querySelector<HTMLButtonElement>("[data-copy-value]");

  if (!form || !textarea || !button) return;

  const endpoint = form.dataset.endpoint ?? "/api/send-message";
  const formId = form.dataset.formId ?? "send-message";
  const locale = form.dataset.locale ?? "";
  if (!locale) {
    console.warn("[send-message] Missing data-locale on form.");
  }
  const emptyMessage = form.dataset.emptyMessage;
  const sendingLabel = form.dataset.sendingLabel ?? button.textContent ?? "";
  const defaultLabel = button.dataset.defaultLabel ?? button.textContent ?? "";
  const successMessage = form.dataset.successMessage;
  const errorMessage = form.dataset.errorMessage;
  const minMessageLength = Number(form.dataset.minMessageLength ?? "0");
  const fallbackEmail = form.dataset.fallbackEmail ?? "";
  const contactRequirementMessage = form.dataset.contactRequirementMessage;
  const referrerFieldEnabled = form.dataset.referrerFieldEnabled === "true";
  const referrerFieldRequired = form.dataset.referrerFieldRequired === "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = textarea.value.trim();
    const referrer = referrerInput?.value.trim() ?? "";

    if (!message || message.length < Math.max(minMessageLength, 1)) {
      setStatus(statusEl, "error", emptyMessage, "");
      textarea.focus();
      return;
    }

    if (!hasContactDetails(message)) {
      setStatus(statusEl, "error", contactRequirementMessage, "");
      textarea.focus();
      return;
    }

    if (referrerFieldEnabled && referrerFieldRequired && !referrer) {
      setStatus(statusEl, "error", form.dataset.referrerFieldLabel || "Referrer is required", "");
      referrerInput?.focus();
      return;
    }

    button.disabled = true;
    button.textContent = sendingLabel;
    setStatus(statusEl, "idle", "", "");

    try {
      const payload: SendMessagePayload = { message, formId };
      if (referrerFieldEnabled && referrer) payload.referrer = referrer;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Use concatenation, not a template literal: a minified `${response.status}`
        // collapses to `${e.status}`, which renders into the inline <script> as a
        // literal {e.status} dotted brace token that dist.content-references.validate
        // (RFC-0187) mistakes for an unresolved RFC-0045 content reference.
        throw new Error("Request failed with status " + response.status);
      }

      if (referrerInput) referrerInput.value = "";
      textarea.value = "";
      form.hidden = true;
      if (successEl) {
        successEl.hidden = false;
      }
      emitContactSubmit(locale, formId);
    } catch {
      setStatus(statusEl, "error", errorMessage, "");
      if (fallbackEl && fallbackEmail && fallbackTextEl) {
        form.hidden = true;
        fallbackEl.hidden = false;
        const fallbackBody = [message, referrer && "Referrer: " + referrer]
          .filter(Boolean)
          .join("\n");
        fallbackTextEl.textContent = fallbackBody;
        if (copyBtn) {
          copyBtn.dataset.copyValue = message;
        }
      }
    } finally {
      button.disabled = false;
      button.textContent = defaultLabel;
    }
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const value = copyBtn.dataset.copyValue;
      if (value) {
        try {
          await navigator.clipboard.writeText(value);
        } catch (err) {
          console.error("[clipboard-copy-failure]", err);
        }
      }
    });
  }
}

document.querySelectorAll<HTMLElement>("[data-send-message-root]").forEach(bindForm);
