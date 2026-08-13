/*
<MODULE_CONTRACT>
<purpose>Resolves dev channel URLs for services and sites from fleet registries for use by integration, E2E, and smoke tests.</purpose>
<non-goals>
  <item>Does not resolve production URLs — dev channel only.</item>
  <item>Does not cache results — each call reads the current registry state.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0823: initial implementation of dev URL resolver for the testing pyramid helpers.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

interface ServiceRegistryEntry {
  id: string;
  workersDevUrl?: string;
  url?: string;
}

interface ServiceRegistry {
  services: ServiceRegistryEntry[];
}

interface FleetSitesEntry {
  site: string;
}

interface FleetSites {
  sites: FleetSitesEntry[];
}

/**
 * Resolves the dev channel URL for a registered service.
 *
 * Reads `services/registry.yaml` from the workspace root and returns the
 * `workersDevUrl` (or fallback `url`) for the matching service id.
 *
 * @throws if the service is not found in the registry.
 */
export function resolveServiceDevUrl(serviceId: string, workspaceRoot: string): string {
  const registryPath = resolve(workspaceRoot, "services/registry.yaml");
  const raw = readFileSync(registryPath, "utf-8");
  const registry = parseYaml(raw) as ServiceRegistry;

  const entry = registry.services.find((s) => s.id === serviceId);
  if (!entry) {
    throw new Error(
      `[dev-url-resolver] Service "${serviceId}" not found in services/registry.yaml`,
    );
  }

  const url = entry.workersDevUrl ?? entry.url;
  if (!url) {
    throw new Error(
      `[dev-url-resolver] Service "${serviceId}" has no workersDevUrl or url in services/registry.yaml`,
    );
  }

  return url;
}

/**
 * Resolves the dev-deployed site URL for a registered Sternsystem.
 *
 * Reads `fleet/fleet.sites.yaml` from the workspace root to verify the site
 * exists, then constructs the dev channel URL using the configured dev domain.
 * The dev domain defaults to `warpgogol.workers.dev` but can be overridden
 * via the `WORKSHOP_DEV_DOMAIN` environment variable.
 *
 * @throws if the site is not found in the fleet registry.
 */
export function resolveSiteDevUrl(siteId: string, workspaceRoot: string): string {
  const fleetPath = resolve(workspaceRoot, "fleet/fleet.sites.yaml");
  const raw = readFileSync(fleetPath, "utf-8");
  const fleet = parseYaml(raw) as FleetSites;

  const entry = fleet.sites.find((s) => s.site === siteId);
  if (!entry) {
    throw new Error(`[dev-url-resolver] Site "${siteId}" not found in fleet/fleet.sites.yaml`);
  }

  const devDomain = process.env["WORKSHOP_DEV_DOMAIN"] ?? "warpgogol.workers.dev";
  return `https://${siteId}.${devDomain}`;
}
