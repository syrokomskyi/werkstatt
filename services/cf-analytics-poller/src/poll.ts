/*
<MODULE_CONTRACT>
<purpose>Pure transformation: GraphQL response → metric points (RFC-0343). No network — unit-testable.</purpose>
<non-goals>
  <item>Do not perform Cloudflare API calls or write poller watermark state.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0343: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export interface MetricPoint {
  metric: string;
  labels: Record<string, string>;
  value: number;
}

interface ZoneHttpResponse {
  sum?: {
    requests?: number;
    bytes?: number;
    cachedRequests?: number;
  };
  dims?: {
    cacheStatus?: string;
    edgeResponseStatus?: number;
  };
}

interface WorkersInvocationResponse {
  sum?: {
    requests?: number;
    errors?: number;
  };
  dims?: {
    scriptName?: string;
  };
}

function statusClassFromCode(code: number): string {
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500) return "5xx";
  return "other";
}

function cacheStatusFromDim(raw: string | undefined): string {
  if (raw === "hit" || raw === "miss" || raw === "dynamic") return raw;
  return "other";
}

export function transformZoneResponse(
  siteId: string,
  response: {
    data?: { viewer?: { zones?: Array<{ httpRequestsAdaptiveGroups?: ZoneHttpResponse[] }> } };
  },
): MetricPoint[] {
  const groups = response?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
  const points: MetricPoint[] = [];

  for (const group of groups) {
    const cacheStatus = cacheStatusFromDim(group.dims?.cacheStatus);
    const statusClass = statusClassFromCode(group.dims?.edgeResponseStatus ?? 0);
    const requests = group.sum?.requests ?? 0;
    const bytes = group.sum?.bytes ?? 0;

    if (requests > 0) {
      points.push({
        metric: "wgogol_delivery_requests_total",
        labels: { site_id: siteId, cache_status: cacheStatus, status_class: statusClass },
        value: requests,
      });
    }

    if (bytes > 0) {
      points.push({
        metric: "wgogol_delivery_bytes_total",
        labels: { site_id: siteId },
        value: bytes,
      });
    }
  }

  return points;
}

export function transformWorkersResponse(
  siteId: string,
  workerScripts: string[],
  response: {
    data?: {
      viewer?: {
        accounts?: Array<{ workersInvocationsAdaptiveGroups?: WorkersInvocationResponse[] }>;
      };
    };
  },
): MetricPoint[] {
  const groups = response?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptiveGroups ?? [];
  const scriptSet = new Set(workerScripts);
  const points: MetricPoint[] = [];

  for (const group of groups) {
    const scriptName = group.dims?.scriptName ?? "";
    if (!scriptSet.has(scriptName)) continue;

    const requests = group.sum?.requests ?? 0;
    const errors = group.sum?.errors ?? 0;

    if (requests > 0) {
      points.push({
        metric: "wgogol_workers_requests_total",
        labels: { site_id: siteId },
        value: requests,
      });
    }

    if (errors > 0) {
      points.push({
        metric: "wgogol_workers_errors_total",
        labels: { site_id: siteId },
        value: errors,
      });
    }
  }

  return points;
}
