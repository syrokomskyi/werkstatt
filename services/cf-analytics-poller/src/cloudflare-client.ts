/*
<MODULE_CONTRACT>
<purpose>Cloudflare GraphQL Analytics API client — owns endpoint, auth, query execution (RFC-0343).</purpose>
<non-goals>
  <item>Do not transform responses into metric points — that lives in poll.ts.</item>
  <item>Do not manage watermark state or push metrics.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract CloudflareAnalyticsClient from loop.ts inline graphqlRequest.</item>
</CHANGE_SUMMARY>
*/

import { ZONE_HTTP_REQUESTS_QUERY, WORKERS_INVOCATIONS_QUERY } from "./queries.ts";

export type FetchImpl = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export interface CloudflareAnalyticsClient {
  zoneHttpRequests(zoneId: string, since: string, until: string): Promise<Record<string, unknown>>;
  workerInvocations(
    accountTag: string,
    since: string,
    until: string,
  ): Promise<Record<string, unknown>>;
}

export function createCloudflareAnalyticsClient(
  apiToken: string,
  fetchImpl: FetchImpl = defaultFetch,
): CloudflareAnalyticsClient {
  async function execute(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await fetchImpl(CLOUDFLARE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`Cloudflare GraphQL API returned ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  return {
    zoneHttpRequests(zoneId, since, until) {
      return execute(ZONE_HTTP_REQUESTS_QUERY, { zoneId, since, until });
    },
    workerInvocations(accountTag, since, until) {
      return execute(WORKERS_INVOCATIONS_QUERY, { accountTag, since, until });
    },
  };
}

const defaultFetch: FetchImpl = (url, init) =>
  fetch(url, init as RequestInit) as Promise<Response> as Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
