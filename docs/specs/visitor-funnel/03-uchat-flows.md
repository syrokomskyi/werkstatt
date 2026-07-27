# 03 — UChat flows & subflows

> This is the canonical, **rebuilt-from-scratch** UChat funnel for `webgogol-com`. The legacy 10-flow export (Make.com webhooks, `39 €` copy, the Stages Router GUI dispatcher, the Pipedrive webhook router) is **deleted, not migrated** (RFC-0188). UChat renders the conversation and _requests_ transitions; it owns no graph, no prices, no consent of record, no CRM writes.
>
> Build these in the UChat console. Every price/label is a **variable sourced from `offer.md`** (§ Offer variables) — never a literal typed into a node. Every meaningful step calls the **Stage Tracker** (§ Stage Tracker) which sets `funnel_stage` and POSTs the event to Lagebild.

## Global conventions

- **Languages:** the bot runs in `de` and `uk` with full parity. Use UChat's multilingual message variants; the active language is a custom field `locale`. Ukrainian uses formal capitalized address (**Ви/Ваш**); German uses **Sie**. No untranslated branch may ship.
- **Tone:** warm, calm, short. The studio's promise — _"ohne Stress, ohne Termine, ohne versteckte Kosten"_ — is the voice. Use typing delays; never a wall of text.
- **Quick replies + free text everywhere:** every prompt offers buttons **and** accepts typed input. No `No match` / `No reply` dead-end (§ No-dead-end rule).
- **Resume:** the canonical stage lives in Lagebild and is mirrored to the `funnel_stage` custom field. On re-entry, route by `funnel_stage` to the matching subflow step. UChat session/`localStorage` is convenience only — never the record, never cookies.

## Custom fields (UChat)

| Field | Set by | Mirrors |
| --- | --- | --- |
| `locale` | Language subflow | conversation language |
| `funnel_stage` | Stage Tracker | Lagebild `buffer_deals.funnel_stage` |
| `intent` | Intent router | `create_site` / `change_site` / `ask_question` |
| `org_name` | Qualification | target Organization |
| `qual_priority` `qual_company` `qual_service` `qual_region` | Qualification | captured fields |
| `offer_plan` | Offer subflow | `monthly` / `yearly` |
| `offer_modules` | Offer subflow | comma list of module keys |
| `lagebild_deal_id` | returned by inbound (or set after first event) | buffer deal id |
| `stripe_checkout_url` | Offer/Payment | from the Stripe adapter |
| `buyer_type` | Start consent | `business` (B2B pilot) |

Offer values (prices/guarantees) are loaded into variables, not custom fields — see below.

## Offer variables (single source of truth = offer.md)

🔭 RFC-0188 Phase 4 provisions these into UChat from `business/{lang}/offer.md` via the UChat API on each offer change. Until that automation exists, set them **once by hand** from `offer.md` and re-sync whenever the offer changes. **Never** hardcode a price inside a message node.

| UChat variable         | from `offer.md`                  | `de` value today         |
| ---------------------- | -------------------------------- | ------------------------ |
| `price_monthly`        | `price.monthly`                  | `70 € / Monat`           |
| `price_yearly`         | `price.yearly`                   | `700 € / Jahr`           |
| `price_setup`          | `price.setup`                    | `200 €`                  |
| `guarantee_delivery`   | `guarantees.delivery.label`      | `Fertig in 12 Werktagen` |
| `mod_visibility_price` | `growthModules.visibility.price` | `+29 € / Monat …`        |
| `change_price`         | `changePrice`                    | `15`                     |

`funnel.copy.validate` fails if a `funnel/{lang}` source hardcodes the retired `39 €` tariff; keep the same discipline inside UChat.

---

## Flow map

```
Main Flow ─┬─ DSGVO gate ─ Language ─ Intent router
           ├─▶ [create_site] Qualification → Offer & Payment → Start Consent → Legal & Materials → Done
           ├─▶ [change_site] Change Request
           └─▶ [ask_question] Ask Anything ──(return)──▶ resume current stage
Reusable: Stage Tracker · Ask Anything (available at every step) · Operator Handoff
```

---

## 1) Main Flow — welcome, DSGVO, language, intent

**Purpose:** greet, obtain DSGVO acknowledgement (the conversation's lawful basis), set language, route to intent. → stages `new_session` → `privacy_acknowledged` → `intent_selected`.

**Node 1.1 — Welcome (de):**

> Hallo! 👋 Schön, dass Sie da sind. Ich helfe Ihnen, eine Website zu bekommen — **ohne Stress, ohne Termine, ohne versteckte Kosten**. Bevor wir starten: Ich verarbeite Ihre Angaben nur, um Ihre Anfrage zu bearbeiten (Details: Datenschutz). Einverstanden?
>
> Buttons: **[Ja, los geht's]** · [Datenschutz ansehen]

**Node 1.1 — Welcome (uk):**

> Вітаємо! 👋 Раді, що Ви тут. Я допоможу Вам отримати вебсайт — **без стресу, без зустрічей, без прихованих витрат**. Перш ніж почати: я обробляю Ваші дані лише для опрацювання Вашого запиту (деталі: Політика конфіденційності). Згодні?
>
> Buttons: **[Так, почнімо]** · [Переглянути політику]

On **[Ja / Так]** → **Stage Tracker** `privacy.acknowledged` (stage `privacy_acknowledged`), then Language.

**Node 1.2 — Language:** UChat language buttons (`Deutsch` / `Українська`). Set `locale`. POST `language.selected` only if the visitor explicitly switches (otherwise the site locale governs).

**Node 1.3 — Intent router:**

> de: Was kann ich für Sie tun? Buttons: **[Website erstellen]** · [Änderung an meiner Seite] · [Erst eine Frage] uk: Чим можу допомогти? Buttons: **[Створити вебсайт]** · [Зміна на моєму сайті] · [Спершу запитання]

- **[Website erstellen / Створити вебсайт]** → Stage Tracker `intent.selected {intent: create_site}` → Qualification.
- **[Änderung / Зміна]** → `intent.selected {intent: change_site}` → Change Request.
- **[Erst eine Frage / Спершу запитання]** → Ask Anything (returns here).

---

## 2) Qualification subflow

**Purpose:** capture only what's needed; one question per step; persist each. → stages `organization_selected` → `qualification_priority` → `_company` → `_service` → `_region`.

| Step | Ask (de / uk) | Field | Stage Tracker event |
| --- | --- | --- | --- |
| 2.0 | "Für welche Firma ist die Website?" / "Для якої компанії вебсайт?" | `org_name` | `organization.selected` |
| 2.1 | "Was ist Ihnen am wichtigsten?" / "Що для Вас найважливіше?" — buttons: Neukunden / professioneller Auftritt / online sein / alles | `qual_priority` | `qualification.answered {qualification.priority}` |
| 2.2 | "Wie heißt Ihr Unternehmen / Projekt?" / "Назва компанії / проєкту?" | `qual_company` | `qualification.answered {companyName}` |
| 2.3 | "Welche Leistung / Branche?" / "Яка послуга / галузь?" | `qual_service` | `qualification.answered {serviceOrIndustry}` |
| 2.4 | "Stadt / Region?" / "Місто / регіон?" | `qual_region` | `qualification.answered {region}` |

Each step accepts free text; buttons are shortcuts. After 2.4 → Offer & Payment.

---

## 3) Offer & Payment subflow

**Purpose:** present **Digitales Fundament** from the offer variables, capture plan + modules, issue the Stripe link, await confirmation. → stages `offer_presented` → `payment_pending` → (`payment_confirmed` from Stripe).

**Node 3.1 — Offer (de):**

> So funktioniert **Digitales Fundament**: Ihre Seite für **{{price_monthly}}** oder **{{price_yearly}}**, einmalig **{{price_setup}}** Einrichtung. Inklusive: {{guarantee_delivery}}, 99 % Verfügbarkeit, 48 h für kleine Änderungen, Antwort in 24 h, Datenpaket bei Kündigung. Möchten Sie monatlich oder jährlich?
>
> Buttons: **[Monatlich {{price_monthly}}]** · [Jährlich {{price_yearly}}] · [Module ansehen]

**Node 3.1 — Offer (uk):**

> Як працює **Digitales Fundament**: Ваш сайт за **{{price_monthly}}** або **{{price_yearly}}**, разово **{{price_setup}}** за налаштування. Включено: {{guarantee_delivery}}, 99 % доступності, 48 год на дрібні зміни, відповідь за 24 год, пакет даних при розірванні. Бажаєте щомісячно чи щорічно?
>
> Buttons: **[Щомісяця {{price_monthly}}]** · [Щороку {{price_yearly}}] · [Переглянути модулі]

- Plan choice → set `offer_plan`.
- **[Module ansehen / Переглянути модулі]** → a multi-select of growth modules (each label + price from variables); set `offer_modules`.
- Then Stage Tracker `offer.selected { plan, growthModules, priceSnapshot }` (stage `offer_presented`). The **priceSnapshot** is the current variable values — frozen now.

**Node 3.2 — Payment:** Stage Tracker `payment.link.requested` (stage `payment_pending`). The inbound response (🔭 Stripe adapter, RFC-0191) returns `stripe_checkout_url`. Show:

> de: Super! Hier ist Ihr sicherer Zahlungslink: {{stripe_checkout_url}}. Nach der Zahlung geht es automatisch weiter — Sie müssen nichts weiter tun. uk: Чудово! Ось Ваше захищене посилання на оплату: {{stripe_checkout_url}}. Після оплати ми продовжимо автоматично — більше нічого робити не потрібно.

UChat **does not** collect card data. On Stripe `checkout.session.completed`, the platform emits `payment.confirmed` (stage `payment_confirmed`) and UChat resumes at Start Consent (via the resume-by-stage mechanism). If the visitor returns before paying, they resume at `payment_pending` with the same link.

---

## 4) Start Consent subflow (B2B pilot)

**Purpose:** record the B2B _start-before-completion_ consent as append-only evidence before any production work. → stages `start_choice_pending` → (`start_deferred`) → `buyer_type_pending` → `b2b_start_consent_pending` → `start_approved`.

**Node 4.1 — Start choice:**

> de: Wann sollen wir starten? Buttons: **[Jetzt starten]** · [In 14 Tagen] uk: Коли почати? Buttons: **[Почати зараз]** · [За 14 днів]

`[In 14 Tagen / За 14 днів]` → `start.choice.selected {deferred}` (stage `start_deferred`, store a `start_after` date) — the place is kept; resume later. `[Jetzt / Зараз]` → continue.

**Node 4.2 — Buyer type (pilot = business):** confirm this is a business order (`buyer.type.selected {business}`, stage `buyer_type_pending`). 🔭 B2C/Widerruf branch is deferred (legal scope: B2B-only).

**Node 4.3 — Start consent (de):**

> Damit ich sofort mit dem Bau beginnen darf, brauche ich Ihre Zustimmung: Sie sind Unternehmer:in und wünschen den **sofortigen Beginn der Arbeiten**. Bestätigen Sie?
>
> Buttons: **[Ja, sofort beginnen]** · [Eine Frage dazu]

**Node 4.3 — Start consent (uk):**

> Щоб я міг одразу почати створення, потрібна Ваша згода: Ви є підприємцем і бажаєте **негайний початок робіт**. Підтверджуєте?
>
> Buttons: **[Так, почати одразу]** · [Маю запитання]

**[Ja / Так]** → Stage Tracker `legal.consent.recorded { buyerType: business, startBeforeWithdrawalPeriod: true, consent_kind: b2b_start_before_completion }` (stage `start_approved`). This writes an **append-only** `buffer_consent_events` row — it is never overwritten. `[Eine Frage / Маю запитання]` → Ask Anything, returns here.

---

## 5) Legal data & Materials subflow

**Purpose:** collect Impressum/legal data and site materials in-conversation. → stages `legal_data_requested` → `materials_requested` → `production_ready`.

- 5.1 Legal data: company legal name, address, owner, contact (for Impressum). Each captured; Stage Tracker `material.submitted {kind: legal}`.
- 5.2 Materials: texts, logo/images, existing links, access. UChat native file upload delivers the file; the file **store of record** is 🔭 RFC-0188 open-question #5 (UChat upload may deliver, but not be the archive). Stage Tracker `material.submitted {kind: assets}`.
- 5.3 Done (de): "Perfekt — ich habe alles. Ihre Seite ist **in {{guarantee_delivery}}** online. Sie können mich hier jederzeit fragen." (stage `production_ready`).

---

## 6) Change Request subflow

**Purpose:** handle changes against the included-changes balance; bill if exhausted. → stages `change_balance_checked` → (`change_payment_pending`) → `change_description_requested`.

- 6.1 Balance check: the platform returns the remaining included changes (authoritative count = P3 `included_changes_balance`). Stage Tracker `change.requested` (stage `change_balance_checked`).
- 6.2a If included (≥1): "Diese Änderung ist inklusive ✅." → describe (6.3).
- 6.2b If exhausted: "Diese Änderung kostet **{{change_price}} €**. Hier ist der Zahlungslink: {{stripe_checkout_url}}." (stage `change_payment_pending`); on `invoice.paid` → 6.3.
- 6.3 Describe: capture the change text; confirm a same-working-day response; resume the main conversation (stage `change_description_requested`).

---

## 7) Ask Anything (free questions) + Operator Handoff

**Purpose:** answer any studio-related question at any step, then return to the exact stage. This reproduces the legacy "Stages Router" intent as a first-party behavior — **no Make.com, no vendor dispatcher**.

- Available from **every** node via an `[Eine Frage / Запитання]` affordance.
- Uses UChat's **AI + manually curated knowledge base** (pilot decision). Curate the KB in UChat from the studio's facts: offer, guarantees, process, timelines, data handling, contact. (⚠️ Drift risk: the KB is hand-maintained, so re-check it whenever `offer.md` or the process changes — see §00 single-source-of-truth.)
- **Return action:** every answer ends with **[Zurück zu meiner Anfrage / Назад до запиту]**, which routes by `funnel_stage` back to the exact step.

**Operator handoff** (hand to a human; notify the team) when:

1. the visitor explicitly asks for a person, **or** the AI is not confident / has no answer;
2. a **payment / billing** problem (failed payment, dispute, refund, plan change);
3. an **out-of-offer / custom-scope** request (custom build, individual pricing, complex integration) — the operator forms a tailored proposal (→ P4 ad-hoc, §07).

On handoff, set an `operator_review` marker and create a Pipedrive activity/notification. The conversation stays open; the visitor is told a human will reply.

---

## No-dead-end rule

There is **no** `No match` / `No reply` terminal. For unrecognized input at any step:

1. acknowledge ("Verstanden / Зрозуміло"),
2. optionally answer via Ask Anything,
3. gently re-offer the current step's question + quick replies.

Configure UChat's fallback/default reply on every step to invoke this, not a dead-end.

---

## Stage Tracker (reusable) — the only place that writes funnel state

Every transition calls this reusable block. It does two things:

1. **Set `funnel_stage`** = the new canonical stage (mirror for resume + Pipedrive).
2. **POST the event** via an External Request to the site's inbound route:

```
POST https://www.webgogol.com/api/integration-inbound
Headers:
  Authorization: Bearer {{INTEGRATION_INBOUND_SECRET}}   # server secret, stored in UChat securely
  Content-Type: application/json
Body:
{
  "eventId": "{{uchat_contact_id}}:{{event_kind}}:{{step_nonce}}",   // stable idempotency key
  "kind": "message",                 // transport kind (see 06 — funnel kind is RFC-0188 Ph4)
  "source": "uchat",
  "locale": "{{locale}}",
  "occurredAt": "{{system_time_iso}}",
  "contact": { "name": "{{full_name}}", "email": "{{email}}", "phone": "{{phone}}" },
  "payload": {
    "funnelVersion": "1.0.0",
    "eventKind": "{{event_kind}}",           // e.g. "offer.selected"
    "stage": "{{funnel_stage}}",
    "previousStage": "{{previous_funnel_stage}}",
    "intent": "{{intent}}",
    "organization": { "name": "{{org_name}}" },
    "qualification": { "...": "..." },
    "offer": { "plan": "{{offer_plan}}", "growthModules": [], "priceSnapshot": { } },
    "contact_id": "{{uchat_contact_id}}"
  }
}
```

- **Idempotency:** `eventId` must be stable per logical step so a UChat retry never double-writes (the buffer dedups by it — RFC-0188 `buffer_funnel_events.idempotency_key`).
- **Auth:** `INTEGRATION_INBOUND_SECRET` is a server secret; store it in UChat's secure field store, never in a visible message or client config.
- **Payload:** include only the fields relevant to the event kind. The full field reference and the stage↔node↔Pipedrive mapping are in [06-event-contract.md](06-event-contract.md).

> Today the inbound route accepts `kind ∈ lead|message|appointment`; funnel events ride as `kind: "message"` with the `payload.eventKind` discriminator. 🔭 RFC-0188 Phase 4 adds a first-class `funnel` kind + a typed inbound schema; until then, keep `kind: "message"`.
