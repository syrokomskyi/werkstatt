/*
<MODULE_CONTRACT>
<purpose>Single-target pulse probe — pure function, injectable fetch/TLS (RFC-0341 Lane 1).</purpose>
<non-goals>
  <item>No Playwright or browser dependencies.</item>
  <item>No retry logic — one request per probe.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0341: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export interface ProbeTargetRoute {
  siteId: string;
  origin: string;
  route: string;
  sentinels: string[];
}

export interface ProbeObservation {
  siteId: string;
  route: string;
  up: number;
  ttfbSeconds: number;
  statusClass: string;
  contentOk: number | null;
  certExpiryDays: number | null;
}

export type FetchImpl = (
  url: string,
  options: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text: () => Promise<string>;
}>;

export type TlsImpl = (
  hostname: string,
  port: number,
) => Promise<{
  valid_to: string;
}>;

const USER_AGENT = "Warpgogol-FleetProbe/1 (+https://warpgogol.com)";

function classifyStatus(status: number): string {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500) return "5xx";
  return "error";
}

export async function probeTarget(
  target: ProbeTargetRoute,
  fetchImpl: FetchImpl,
  tlsImpl: TlsImpl | null,
  timeoutMs: number,
): Promise<ProbeObservation> {
  const url = `${target.origin.replace(/\/$/, "")}${target.route}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = performance.now();
  let status = 0;
  let ttfbSeconds = 0;
  let body = "";
  let statusClass = "error";
  let contentOk: number | null = null;

  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "identity",
      },
      signal: controller.signal,
    });
    status = response.status;
    ttfbSeconds = (performance.now() - startTime) / 1000;
    statusClass = classifyStatus(status);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      body = await response.text();
      contentOk = target.sentinels.every((pattern) => {
        try {
          return new RegExp(pattern).test(body);
        } catch {
          return false;
        }
      })
        ? 1
        : 0;
    }
  } catch {
    ttfbSeconds = (performance.now() - startTime) / 1000;
    statusClass = "error";
  } finally {
    clearTimeout(timer);
  }

  const up =
    (statusClass === "2xx" || statusClass === "3xx") && (contentOk === null || contentOk === 1)
      ? 1
      : 0;

  let certExpiryDays: number | null = null;
  if (tlsImpl && url.startsWith("https://")) {
    try {
      const u = new URL(url);
      const cert = await tlsImpl(u.hostname, 443);
      const validTo = new Date(cert.valid_to).getTime();
      certExpiryDays = Math.floor((validTo - Date.now()) / (1000 * 60 * 60 * 24));
    } catch {
      certExpiryDays = null;
    }
  }

  return {
    siteId: target.siteId,
    route: target.route,
    up,
    ttfbSeconds,
    statusClass,
    contentOk,
    certExpiryDays,
  };
}
