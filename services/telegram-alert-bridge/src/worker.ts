/*
<MODULE_CONTRACT>
<purpose>Telegram alert bridge — receives SigNoz webhooks and forwards to Telegram Bot API (RFC-0342).</purpose>
<non-goals>
  <item>No visitor data or PII in the payload.</item>
  <item>No request echo or error detail leakage.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0342: initial implementation.</item>
</CHANGE_SUMMARY>
*/

interface SignozWebhookPayload {
  alert_name?: string;
  state?: string;
  severity?: string;
  labels?: Record<string, string>;
  description?: string;
}

interface Env {
  BRIDGE_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

function formatMessage(payload: SignozWebhookPayload): string {
  const icon = payload.state === "resolved" ? "🟢" : "🔴";
  const severity = payload.severity ?? "unknown";
  const name = payload.alert_name ?? "Unknown alert";
  const siteId = payload.labels?.["site_id"] ?? "-";
  const description = payload.description ?? "";
  return `${icon} [${severity}] ${name} — site_id: ${siteId} — ${description}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!secret || secret !== env.BRIDGE_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: SignozWebhookPayload;
    try {
      payload = (await request.json()) as SignozWebhookPayload;
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const text = formatMessage(payload);
    const tgUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

    const tgResponse = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!tgResponse.ok) {
      return new Response("Upstream error", { status: 502 });
    }

    return new Response("OK", { status: 200 });
  },
};
