/*
<MODULE_CONTRACT>
<purpose>
RFC-0896: customdomain.register command handler — registers a proxied A record
and Workers route for a site's apex domain via the Cloudflare API. Idempotent:
skips existing correct records, errors on mismatched records.
</purpose>
<non-goals>
  <item>Do not auto-update mismatched DNS records or Workers routes — operator must fix manually.</item>
  <item>Do not handle DNS propagation waiting — that is out of scope.</item>
  <item>Do not handle www subdomain — that is redirect.register's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0896: initial customdomain.register command handler.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { flagSite } from "../leitstand/deploy-helpers.ts";
import {
  listDnsRecords,
  createDnsRecord,
  listWorkersRoutes,
  createWorkersRoute,
} from "../leitstand/adapters/cloudflare-api.ts";
import {
  resolveCustomDomainConfig,
  resolveCustomDomainEnv,
  buildApexDnsRecord,
  buildApexRoutePattern,
} from "./customdomain-helpers.ts";

export interface CustomDomainRegisterResult {
  command: "customdomain.register";
  systemId: string;
  domain: string;
  dnsRecord: {
    id: string;
    type: "A";
    name: string;
    content: string;
    proxied: true;
    created: boolean;
  };
  workersRoute: {
    id: string;
    pattern: string;
    script: string;
    created: boolean;
  };
  state: "registered" | "already-registered" | "failed";
}

export async function runCustomdomainRegister(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CustomDomainRegisterResult>> {
  const { workspaceRoot } = context;
  const systemId = flagSite(input);
  if (!systemId) throw new Error("[customdomain.register] --site is required");

  const { zoneId, apexDomain, workerName } = await resolveCustomDomainConfig(
    workspaceRoot,
    systemId,
  );

  const env = await resolveCustomDomainEnv();
  const apiToken = env["CLOUDFLARE_API_TOKEN"];

  const expectedDnsRecord = buildApexDnsRecord(apexDomain);
  const expectedRoutePattern = buildApexRoutePattern(apexDomain);

  const existingDnsRecords = await listDnsRecords(zoneId, apiToken, apexDomain);
  const matchingDns = existingDnsRecords.find((r) => r.name === apexDomain);

  let dnsResult: CustomDomainRegisterResult["dnsRecord"];
  let dnsCreated = false;

  if (matchingDns) {
    if (matchingDns.type === "A" && matchingDns.proxied === true) {
      dnsResult = {
        id: matchingDns.id,
        type: "A",
        name: matchingDns.name,
        content: matchingDns.content,
        proxied: true,
        created: false,
      };
    } else {
      throw new Error(
        `[customdomain.register] DNS record for '${apexDomain}' exists but has wrong values. ` +
          `Current: type=${matchingDns.type}, content=${matchingDns.content}, proxied=${matchingDns.proxied}. ` +
          `Expected: type=A, proxied=true (content is a proxied placeholder). ` +
          `Delete or fix the record manually before re-running.`,
      );
    }
  } else {
    const created = await createDnsRecord(zoneId, apiToken, expectedDnsRecord);
    dnsCreated = true;
    dnsResult = {
      id: created.id,
      type: "A",
      name: created.name,
      content: created.content,
      proxied: true,
      created: true,
    };
  }

  const existingRoutes = await listWorkersRoutes(zoneId, apiToken);
  const matchingRoute = existingRoutes.find((r) => r.pattern === expectedRoutePattern);

  let routeResult: CustomDomainRegisterResult["workersRoute"];
  let routeCreated = false;

  if (matchingRoute) {
    if (matchingRoute.script === workerName) {
      routeResult = {
        id: matchingRoute.id,
        pattern: matchingRoute.pattern,
        script: matchingRoute.script ?? workerName,
        created: false,
      };
    } else {
      throw new Error(
        `[customdomain.register] Workers route for '${expectedRoutePattern}' exists but points to wrong script. ` +
          `Current: script=${matchingRoute.script}. Expected: script=${workerName}. ` +
          `Delete or fix the route manually before re-running.`,
      );
    }
  } else {
    const created = await createWorkersRoute(zoneId, apiToken, {
      pattern: expectedRoutePattern,
      script: workerName,
    });
    routeCreated = true;
    routeResult = {
      id: created.id,
      pattern: created.pattern,
      script: created.script ?? workerName,
      created: true,
    };
  }

  const state: CustomDomainRegisterResult["state"] =
    dnsCreated || routeCreated ? "registered" : "already-registered";

  return {
    data: {
      command: "customdomain.register",
      systemId,
      domain: apexDomain,
      dnsRecord: dnsResult,
      workersRoute: routeResult,
      state,
    },
    summary: `[customdomain.register] ${apexDomain}: ${state} (dns: ${dnsCreated ? "created" : "exists"}, route: ${routeCreated ? "created" : "exists"})`,
    nextSteps: [
      {
        action: `Verify the domain is serving: curl -I https://${apexDomain}`,
        kind: "optional",
      },
    ],
  };
}
