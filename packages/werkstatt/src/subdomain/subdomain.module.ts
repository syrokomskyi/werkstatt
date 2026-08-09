/*
<MODULE_CONTRACT>
<purpose>
RFC-0752: Kernel module for subdomain management commands —
subdomain.register, subdomain.validate, subdomain.list.
</purpose>
<non-goals>
  <item>Do not register leitstand or deployment commands here — those live in leitstand.module.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0752: initial subdomain module with register, validate, list commands.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/site-kernel";

export function createSubdomainModule(): KernelModule {
  return {
    name: "subdomain",
    version: "0.1.0",
    async register(registry) {
      const { runSubdomainRegister } = await import("./subdomain-register.ts");
      const { runSubdomainValidate } = await import("./subdomain-validate.ts");
      const { runSubdomainList } = await import("./subdomain-list.ts");

      registry.registerCommand({
        name: "subdomain.register",
        description:
          "Register DNS CNAME and Workers route for a service subdomain (RFC-0752). Idempotent. Flags: --service.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: false,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from systems/registry.yaml services[].",
          },
        },
        reads: ["systems/registry.yaml"],
        cacheable: false,
        execute: runSubdomainRegister,
      });

      registry.registerCommand({
        name: "subdomain.validate",
        description:
          "Validate DNS CNAME and Workers route for a service subdomain (RFC-0752). Flags: --service.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from systems/registry.yaml services[].",
          },
        },
        reads: ["systems/registry.yaml"],
        cacheable: false,
        execute: runSubdomainValidate,
      });

      registry.registerCommand({
        name: "subdomain.list",
        description:
          "List all subdomains in a zone by cross-referencing DNS records with Workers routes (RFC-0752). Flags: --zone.",
        scope: "workspace",
        supportsAllSites: false,
        flags: {
          zone: {
            kind: "string",
            required: true,
            description: "Zone domain name (e.g. warpgogol.com).",
          },
        },
        reads: ["systems/registry.yaml"],
        cacheable: false,
        execute: runSubdomainList,
      });
    },
  };
}
