/*
<MODULE_CONTRACT>
<purpose>Scheduler loop for the fleet probe runner (RFC-0341 Lane 1).</purpose>
<non-goals>
  <item>Do not own individual HTTP/TLS probe mechanics; those remain in probe.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0341: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { createMetricsPusher, type MetricsPusher, METRIC_REFS } from "@warpgogol/observability";
import { loadConfig } from "./config.ts";
import {
  probeTarget,
  type FetchImpl,
  type ProbeObservation,
  type ProbeTargetRoute,
  type TlsImpl,
} from "./probe.ts";

interface TargetsFile {
  schemaVersion: number;
  targets: Array<{
    siteId: string;
    origin: string;
    routes: string[];
    sentinels: string[];
  }>;
}

async function loadTargets(): Promise<TargetsFile> {
  const path = join(process.cwd(), "targets.generated.json");
  const text = await readFile(path, "utf-8");
  const stripped = text.replace(/^\/\/ GENERATED.*\n/, "");
  return JSON.parse(stripped) as TargetsFile;
}

const defaultFetchImpl: FetchImpl = (url, options) =>
  fetch(url, options as RequestInit) as Promise<Response> as Promise<{
    status: number;
    headers: { get(name: string): string | null };
    text: () => Promise<string>;
  }>;

const defaultTlsImpl: TlsImpl = (hostname, port) => {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ host: hostname, port, rejectUnauthorized: false }) as TLSSocket;
    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      resolve({ valid_to: cert.valid_to });
    });
    socket.on("error", reject);
  });
};

function recordObservation(pusher: MetricsPusher, obs: ProbeObservation): void {
  const labels = { site_id: obs.siteId, route: obs.route };
  METRIC_REFS.warpgogol_probe_up.set(pusher, obs.up, labels);
  METRIC_REFS.warpgogol_probe_ttfb_seconds.set(pusher, obs.ttfbSeconds, labels);
  METRIC_REFS.warpgogol_probe_http_status_class_total.add(pusher, 1, {
    site_id: obs.siteId,
    route: obs.route,
    status_class: obs.statusClass,
  });
  if (obs.contentOk !== null) {
    METRIC_REFS.warpgogol_probe_content_ok.set(pusher, obs.contentOk, labels);
  }
  if (obs.certExpiryDays !== null) {
    METRIC_REFS.warpgogol_probe_cert_expiry_days.set(pusher, obs.certExpiryDays, {
      site_id: obs.siteId,
    });
  }
}

export async function runProbeCycle(
  pusher: MetricsPusher | null,
  fetchImpl: FetchImpl = defaultFetchImpl,
  tlsImpl: TlsImpl | null = defaultTlsImpl,
): Promise<ProbeObservation[]> {
  const config = loadConfig();
  const targetsFile = await loadTargets();

  const routes: ProbeTargetRoute[] = [];
  for (const target of targetsFile.targets) {
    for (const route of target.routes) {
      routes.push({
        siteId: target.siteId,
        origin: target.origin,
        route,
        sentinels: target.sentinels,
      });
    }
  }

  const observations: ProbeObservation[] = [];
  const concurrency = Math.min(config.concurrency, routes.length);

  for (let i = 0; i < routes.length; i += concurrency) {
    const batch = routes.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((route) => probeTarget(route, fetchImpl, tlsImpl, config.requestTimeoutMs)),
    );
    observations.push(...results);
  }

  if (pusher) {
    for (const obs of observations) {
      recordObservation(pusher, obs);
    }
    await pusher.flush();
  }

  return observations;
}

export async function runLoop(): Promise<void> {
  const config = loadConfig();
  const pusher = createMetricsPusher({
    serviceName: "fleet-probe-runner",
    layer: "probe",
    environment: "production",
  });

  async function cycle() {
    try {
      await runProbeCycle(pusher);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[fleet-probe] cycle error: ${msg}`);
    }
    const jitter = Math.floor(Math.random() * 15000) - 7500;
    const delay = config.probeIntervalMs + jitter;
    setTimeout(cycle, delay);
  }

  cycle();
}
