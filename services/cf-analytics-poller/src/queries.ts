/*
<MODULE_CONTRACT>
<purpose>GraphQL query documents for Cloudflare analytics — single linted home (RFC-0343).</purpose>
<non-goals>
  <item>Do not execute queries, handle credentials, or transform Cloudflare responses here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0343: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export const ZONE_HTTP_REQUESTS_QUERY = `
  query ZoneHttpRequests($zoneId: String!, $since: Time!, $until: Time!) {
    viewer {
      zones(filter: { zoneTag: $zoneId }) {
        httpRequestsAdaptiveGroups(
          limit: 100
          filter: { datetime_geq: $since, datetime_lt: $until }
        ) {
          sum {
            requests
            bytes
            cachedRequests
          }
          dims {
            cacheStatus
            edgeResponseStatus
          }
        }
      }
    }
  }
`;

export const WORKERS_INVOCATIONS_QUERY = `
  query WorkersInvocations($accountTag: String!, $since: Time!, $until: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptiveGroups(
          limit: 100
          filter: { datetime_geq: $since, datetime_lt: $until }
        ) {
          sum {
            requests
            errors
          }
          dims {
            scriptName
          }
        }
      }
    }
  }
`;

export const ALLOWED_DIMENSIONS = new Set([
  "cacheStatus",
  "edgeResponseStatus",
  "scriptName",
  "requests",
  "bytes",
  "cachedRequests",
  "errors",
]);
