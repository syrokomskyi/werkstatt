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

import { createMetricsPusher } from "@warpgogol/werkstatt-site/observability";

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
  WARPGOGOL_OTLP_ENDPOINT: string;
  WARPGOGOL_OTLP_TOKEN: string;
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
    const healthUrl = new URL(request.url);
    if (healthUrl.pathname === "/health") {
      const pusher = createMetricsPusher(
        { serviceName: "telegram-alert-bridge", layer: "back", environment: "production" },
        { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
      );
      if (pusher) {
        pusher.gaugeSet("warpgogol_back_up", 1, { service: "telegram-alert-bridge" });
        await pusher.flush();
      }
      return new Response(JSON.stringify({ status: "ok", service: "telegram-alert-bridge" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

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

    const pusher = createMetricsPusher(
      { serviceName: "telegram-alert-bridge", layer: "back", environment: "production" },
      { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
    );

    const tgResponse = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    if (pusher) {
      const statusClass = `${Math.floor(tgResponse.status / 100)}xx`;
      pusher.counterAdd("warpgogol_back_requests_total", 1, {
        service: "telegram-alert-bridge",
        status_class: statusClass,
      });
      if (!tgResponse.ok) {
        pusher.counterAdd("warpgogol_back_last_error_total", 1, {
          service: "telegram-alert-bridge",
        });
        pusher.gaugeSet("warpgogol_back_up", 0, { service: "telegram-alert-bridge" });
      } else {
        pusher.gaugeSet("warpgogol_back_up", 1, { service: "telegram-alert-bridge" });
      }
      await pusher.flush();
    }

    if (!tgResponse.ok) {
      return new Response("Upstream error", { status: 502 });
    }

    return new Response("OK", { status: 200 });
  },
};
