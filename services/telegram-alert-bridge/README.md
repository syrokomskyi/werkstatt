# telegram-alert-bridge

Cloudflare Worker that receives SigNoz alert webhooks and forwards them to Telegram (RFC-0342).

## How it works

1. SigNoz sends a POST to `https://<worker-domain>/alert?secret=<BRIDGE_SECRET>`
2. The worker validates the secret, parses the alert payload
3. Formats a message: `🔴/🟢 [severity] name — site_id — description`
4. Forwards to `https://api.telegram.org/bot{TOKEN}/sendMessage`

## Secrets

See [.env.example](./.env.example) for all required environment variables. Set them via `wrangler secret put`.

## Deploy

```sh
cd services/telegram-alert-bridge
wrangler secret put BRIDGE_SECRET
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler deploy
```

The worker URL (e.g. `https://telegram-alert-bridge.<account>.workers.dev/alert?secret=...`) is set as `WGOGOL_TG_BRIDGE_URL` in the SigNoz notification channel configuration.
