# 05 — Site configuration (`apps/webgogol-com`)

> What changes in the repo for the pilot. Keep the app **thin**: configuration in `system.md`, copy in `funnel/{lang}`, secrets in env. No funnel logic in the app.

## 1) `system.md` — enable the funnel

Add the `integrations.funnel` block and switch the CRM destination to the **buffer** (so events land in Lagebild, and the shared worker syncs to Pipedrive — not a direct site→Pipedrive write):

```yaml
integrations:
  chat:
    adapter: uchat
    options:
      widgetId: ndslwdpu82roynku
  inbound:
    sources:
      - uchat
      - stripe          # 🔭 RFC-0191 — the Stripe webhook source
  destinations:
    - kind: crm
      vendor: supabase-buffer   # ← was: pipedrive (direct). Buffer first; worker → Pipedrive.
      mode: gogol-adapter
  funnel:                # ← NEW (RFC-0188)
    version: "1.0.0"     # must equal FUNNEL_VERSION in @gogol/integration
    enabled: true
    sources:
      - uchat
      - stripe
  region: eu
  tier: shared
  delivery:
    provider: upstash
    region: eu
```

- `funnel.version` **must** equal `FUNNEL_VERSION` (`1.0.0`) or `funnel.contract.validate` fails with `unknown-funnel-version`.
- `funnel.sources` ⊆ `{uchat, stripe, operator, send-message}` (the closed catalog).
- Switching the destination to `supabase-buffer` requires that adapter's secrets (§04).

## 2) `funnel/{lang}` content domain — conversation copy

🔭 RFC-0188 Phase 7 introduces `src/content/funnel/{de,uk}/`. It is the **source** that provisions the UChat copy (and feeds `funnel.copy.validate`). Author both `de` and `uk` with parity; Ukrainian uses formal capitalized address (Ви/Ваш). Prices come from `business.offer` references, never literals. Example skeleton:

```
src/content/funnel/
  de/  create-site.md  change-site.md  consent.md  legal.md
  uk/  create-site.md  change-site.md  consent.md  legal.md
```

`funnel.copy.validate` checks: both locales present, file parity across locales, and no retired `39 €` tariff. Until Phase 7 lands, the UChat nodes are authored directly from §03 with offer **variables**, and `funnel.copy.validate` no-op passes (no domain yet).

## 3) Environment secrets

Server-only; declared in the generated env schema (via the section's `api[].secrets`) and set in the deploy env. Never in content, the tenant registry, or UChat:

```
# Inbound + EU delivery (existing)
INTEGRATION_INBOUND_SECRET
UPSTASH_QSTASH_URL
UPSTASH_QSTASH_TOKEN
# Lagebild buffer destination (§04)
SUPABASE_BUFFER_URL
SUPABASE_BUFFER_SERVICE_KEY
SUPABASE_BUFFER_TENANT_ID
# Stripe (🔭 RFC-0191)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_BASE_MONTHLY
STRIPE_PRICE_BASE_YEARLY
STRIPE_PRICE_SETUP
# … module / change / hourly price ids (§02)
```

## 4) Validators — the go-live gate

Run these for `webgogol-com`; all must pass before launch:

```sh
pnpm exec site-kernel run funnel.contract.validate  --site webgogol-com --json
pnpm exec site-kernel run funnel.stage.validate     --site webgogol-com --json
pnpm exec site-kernel run funnel.copy.validate      --site webgogol-com --json
pnpm exec site-kernel run funnel.lagebild.validate  --site webgogol-com --json
pnpm exec site-kernel run integration.config.validate --site webgogol-com --json
pnpm exec site-kernel run integration.secrets.validate --site webgogol-com --json
pnpm exec site-kernel run consent.activation.validate  --site webgogol-com --json   # click-to-load guarantee
pnpm exec site-kernel run legal.processors.validate    --site webgogol-com --json   # UChat/Stripe named in privacy policy
```

- `funnel.contract.validate` will now run real checks (the `funnel` block exists): version match, source catalog, **zero Make.com references**.
- `funnel.lagebild.validate` (funnel `enabled: true`) requires a CRM destination + an inbound source — both present above.
- `consent.activation.validate` enforces that UChat does not load before the visitor activates the launcher (RFC-0175/0177).
- `legal.processors.validate` requires UChat **and** Stripe to be named as processors in the Datenschutz page, with a DPA reference (RFC-0177).

🔭 Once the pilot is enabled and stable, add the four `funnel.*` validators to `APPS_CHECK_AUTHOR_PIPELINE` so every build runs them (RFC-0188 Phase 9).

## 5) Privacy policy updates (legal)

Name **UChat** (chat processor), **Supabase** (buffer/processor, EU), **Upstash** (EU delivery), **Pipedrive** (CRM), and **Stripe** (payments) in the Datenschutz/Privacy page with their roles and a studio↔client DPA reference, or `legal.processors.validate` fails. The DSGVO acknowledgement in the chat welcome (§03) is the lawful basis for processing the conversation.
