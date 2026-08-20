/*
<MODULE_CONTRACT>
<purpose>Ambient declarations for Astro virtual modules and Cloudflare Workers runtime
used by API route handlers. These shims allow standalone tsc --noEmit typechecking
outside an Astro app workspace where the real generated types exist.</purpose>
<non-goals>
  <item>Do not model app-specific env schemas; these are loose string shims for compile-time only.</item>
  <item>Do not introduce runtime behavior — declarations only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add ambient astro:env/server and cloudflare:workers declarations so API route handlers typecheck outside app runtime.</item>
</CHANGE_SUMMARY>
*/

declare module "astro:env/server" {
  export const UPSTASH_QSTASH_URL: string;
  export const UPSTASH_QSTASH_TOKEN: string;
  export const UPSTASH_QSTASH_CURRENT_SIGNING_KEY: string;
  export const UPSTASH_QSTASH_NEXT_SIGNING_KEY: string;
  export const UPSTASH_REDIS_REST_URL: string;
  export const UPSTASH_REDIS_REST_TOKEN: string;
  export const INTEGRATION_INBOUND_SECRET: string;
  export const INTEGRATION_TELEGRAM_BOT_TOKEN: string;
  export const INTEGRATION_TELEGRAM_CHAT_ID: string;
  export const INTEGRATION_WHATSAPP_TOKEN: string;
  export const INTEGRATION_WHATSAPP_PHONE_ID: string;
  export const INTEGRATION_WHATSAPP_TO: string;
  export const INTEGRATION_PIPEDRIVE_API_TOKEN: string;
  export const INTEGRATION_PIPEDRIVE_DOMAIN: string;
  export const INTEGRATION_EMAIL_TO: string;
  export const INTEGRATION_EMAIL_FROM: string;
  export const SUPABASE_BUFFER_URL: string;
  export const SUPABASE_BUFFER_SERVICE_KEY: string;
  export const SUPABASE_BUFFER_TENANT_ID: string;
  export const STRIPE_SECRET_KEY: string;
  export const STRIPE_WEBHOOK_SECRET: string;
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
